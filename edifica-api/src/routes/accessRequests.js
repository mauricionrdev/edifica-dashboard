import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { uuid, badRequest, notFound, conflict, forbidden } from '../utils/helpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { VALID_ROLES } from '../utils/domain.js';
import { writeAuditLog } from '../utils/audit.js';

const router = Router();

const VALID_TYPES = new Set(['invite', 'reset']);
const VALID_STATUS = new Set(['pending', 'approved', 'rejected']);
let initPromise = null;

async function ensureTable() {
  if (!initPromise) {
    initPromise = query(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id VARCHAR(64) PRIMARY KEY,
        type VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        requester_name VARCHAR(160) NULL,
        requester_email VARCHAR(190) NULL,
        requester_identifier VARCHAR(190) NULL,
        company VARCHAR(190) NULL,
        note TEXT NULL,
        resolution_note TEXT NULL,
        resolved_by VARCHAR(64) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_access_requests_status (status),
        INDEX idx_access_requests_type (type),
        INDEX idx_access_requests_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

function serializeRequest(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    requesterName: row.requester_name || '',
    requesterEmail: row.requester_email || '',
    requesterIdentifier: row.requester_identifier || '',
    company: row.company || '',
    note: row.note || '',
    resolutionNote: row.resolution_note || '',
    resolvedBy: row.resolved_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function findUserByIdentifier(identifier) {
  if (!String(identifier || '').trim()) return null;
  const rows = await query(
    `SELECT id, name, email, role, is_master, squads, active, created_at, updated_at
       FROM users
      WHERE LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?)
      LIMIT 1`,
    [identifier, identifier]
  );
  return rows[0] || null;
}

async function findUserByEmail(email) {
  if (!String(email || '').trim()) return null;
  const rows = await query(
    `SELECT id, name, email, role, is_master, squads, active, created_at, updated_at
       FROM users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

router.post('/', async (req, res, next) => {
  try {
    await ensureTable();
    const { type, name, email, identifier, company, note } = req.body || {};
    if (!VALID_TYPES.has(type)) {
      throw badRequest('Tipo de solicitação inválido');
    }
    if (type === 'invite') {
      if (!String(name || '').trim() || !String(email || '').trim()) {
        throw badRequest('Nome e e-mail são obrigatórios para convite');
      }
    }
    if (type === 'reset') {
      if (!String(identifier || '').trim()) {
        throw badRequest('Informe e-mail ou usuário para redefinição');
      }
    }

    const id = uuid();
    await query(
      `INSERT INTO access_requests (
        id, type, status, requester_name, requester_email, requester_identifier, company, note
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        String(name || '').trim() || null,
        String(email || '').trim().toLowerCase() || null,
        String(identifier || '').trim() || null,
        String(company || '').trim() || null,
        String(note || '').trim() || null,
      ]
    );

    const rows = await query('SELECT * FROM access_requests WHERE id = ? LIMIT 1', [id]);
    res.status(201).json({ request: serializeRequest(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureTable();
    const status = String(req.query.status || 'all');
    const params = [];
    let where = '';
    if (status !== 'all') {
      if (!VALID_STATUS.has(status)) throw badRequest('Status inválido');
      where = 'WHERE status = ?';
      params.push(status);
    }
    const rows = await query(
      `SELECT * FROM access_requests ${where} ORDER BY created_at DESC LIMIT 300`,
      params
    );
    res.json({ requests: rows.map(serializeRequest) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth, requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureTable();
    const { id } = req.params;
    const { status, resolutionNote, approval = {} } = req.body || {};
    if (!VALID_STATUS.has(status) || status === 'pending') {
      throw badRequest('Status de atualização inválido');
    }
    const rows = await query('SELECT * FROM access_requests WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Solicitação não encontrada');
    if (current.status !== 'pending') {
      throw conflict('Esta solicitação já foi processada');
    }

    let approvalResult = null;

    if (status === 'approved') {
      if (current.type === 'invite') {
        const role = VALID_ROLES.includes(approval.role) ? approval.role : 'gestor';
        if (role === 'admin') {
          throw badRequest('O cargo admin é legado e não pode ser usado em convites.');
        }
        const squads = Array.isArray(approval.squads) ? approval.squads : [];
        const requestedEmail = String(current.requester_email || '').trim().toLowerCase();
        const requestedName = String(current.requester_name || '').trim();
        if (!requestedEmail || !requestedName) {
          throw badRequest('Solicitação de convite sem nome ou e-mail válidos');
        }

        const existingUser = await findUserByEmail(requestedEmail);
        if (existingUser) {
          throw conflict('Já existe um usuário com este e-mail');
        }

        const password = String(approval.password || '').trim() || createTemporaryPassword();
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuid();

        await query(
          `INSERT INTO users (id, name, email, password_hash, role, is_master, squads, active)
           VALUES (?, ?, ?, ?, ?, 0, ?, 1)`,
          [userId, requestedName, requestedEmail, passwordHash, role, JSON.stringify(squads)]
        );

        approvalResult = {
          kind: 'invite',
          createdUser: {
            id: userId,
            name: requestedName,
            email: requestedEmail,
            role,
            squads,
          },
          temporaryPassword: password,
        };
      } else if (current.type === 'reset') {
        const identifier = String(current.requester_identifier || current.requester_email || '').trim();
        if (!identifier) {
          throw badRequest('Solicitação de redefinição sem identificador válido');
        }
        const target = await findUserByIdentifier(identifier);
        if (!target) {
          throw notFound('Nenhum usuário encontrado para esta redefinição');
        }
        if (target.is_master && req.user.id !== target.id) {
          throw forbidden('Não é possível redefinir o Admin Master por esta operação');
        }

        const password = String(approval.password || '').trim() || createTemporaryPassword();
        const passwordHash = await bcrypt.hash(password, 10);
        await query('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?', [passwordHash, target.id]);

        approvalResult = {
          kind: 'reset',
          updatedUser: {
            id: target.id,
            name: target.name,
            email: target.email,
          },
          temporaryPassword: password,
        };
      }
    }

    await query(
      `UPDATE access_requests
          SET status = ?, resolution_note = ?, resolved_by = ?
        WHERE id = ?`,
      [status, String(resolutionNote || '').trim() || null, req.user.id, id]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'access_request.review',
      entityType: 'access_request',
      entityId: id,
      entityLabel: current.requester_email || current.requester_identifier || current.requester_name || id,
      summary: status === 'approved' ? 'Solicitação de acesso aprovada' : 'Solicitação de acesso rejeitada',
      metadata: {
        type: current.type,
        status,
      },
    });

    const fresh = await query('SELECT * FROM access_requests WHERE id = ? LIMIT 1', [id]);
    res.json({
      request: serializeRequest(fresh[0]),
      approvalResult,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
