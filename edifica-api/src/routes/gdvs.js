import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest, conflict, notFound, uuid } from '../utils/helpers.js';
import { writeAuditLog } from '../utils/audit.js';

const router = Router();

let schemaPromise = null;

async function ensureGdvSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS gdvs (
          id CHAR(36) NOT NULL,
          name VARCHAR(160) NOT NULL,
          owner_user_id CHAR(36) NULL,
          active TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_gdvs_name (name),
          KEY idx_gdvs_owner (owner_user_id),
          CONSTRAINT fk_gdvs_owner
            FOREIGN KEY (owner_user_id) REFERENCES users(id)
            ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

function parseJson(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hasGdvRole(row) {
  const secondary = parseJson(row?.secondary_roles, []);
  return row?.role === 'gdv' || secondary.includes('gdv');
}

async function validateOwner(ownerUserId) {
  const clean = String(ownerUserId || '').trim();
  if (!clean) return null;

  const rows = await query(
    `SELECT id, name, email, role, secondary_roles, active
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [clean]
  );
  const owner = rows[0];
  if (!owner || !owner.active || !hasGdvRole(owner)) {
    throw badRequest('Selecione um usuário GDV ativo como proprietário.');
  }
  return owner;
}

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id || '',
    owner: row.owner_user_id
      ? {
          id: row.owner_user_id,
          name: row.owner_name || '',
          email: row.owner_email || '',
          role: row.owner_role || '',
          active: Boolean(row.owner_active),
        }
      : null,
    active: Boolean(row.active),
    clientsCount: Number(row.clients_count) || 0,
    activeClients: Number(row.active_clients) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRows() {
  await ensureGdvSchema();
  return query(
    `SELECT g.id, g.name, g.owner_user_id, g.active, g.created_at, g.updated_at,
            u.name AS owner_name, u.email AS owner_email, u.role AS owner_role, u.active AS owner_active,
            COUNT(c.id) AS clients_count,
            SUM(CASE WHEN c.status <> 'churn' THEN 1 ELSE 0 END) AS active_clients
       FROM gdvs g
       LEFT JOIN users u ON u.id = g.owner_user_id
       LEFT JOIN clients c ON c.gdv_name = g.name
      GROUP BY g.id, g.name, g.owner_user_id, g.active, g.created_at, g.updated_at,
               u.name, u.email, u.role, u.active
      ORDER BY g.name ASC`
  );
}

router.get('/', requireAuth, requirePermission('gdv.view'), async (req, res, next) => {
  try {
    const rows = await listRows();
    res.json({ gdvs: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureGdvSchema();
    const clean = String(req.body?.name || '').trim();
    if (!clean) throw badRequest('Informe o nome do GDV');

    const owner = await validateOwner(req.body?.ownerUserId);
    const dup = await query('SELECT id FROM gdvs WHERE name = ? LIMIT 1', [clean]);
    if (dup.length > 0) throw conflict('Já existe um GDV com esse nome');

    const id = uuid();
    await query(
      'INSERT INTO gdvs (id, name, owner_user_id, active) VALUES (?, ?, ?, ?)',
      [id, clean, owner?.id || null, owner ? 1 : 0]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'gdv.create',
      entityType: 'gdv',
      entityId: id,
      entityLabel: clean,
      summary: `GDV ${clean} criado`,
      metadata: { ownerUserId: owner?.id || null },
    });

    const rows = await listRows();
    res.status(201).json({ gdv: serialize(rows.find((row) => row.id === id)) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureGdvSchema();
    const { id } = req.params;
    const currentRows = await query('SELECT * FROM gdvs WHERE id = ? LIMIT 1', [id]);
    const current = currentRows[0];
    if (!current) throw notFound('GDV não encontrado');

    const nextName = req.body?.name != null ? String(req.body.name).trim() : current.name;
    if (!nextName) throw badRequest('Informe o nome do GDV');

    const owner = req.body?.ownerUserId !== undefined
      ? await validateOwner(req.body.ownerUserId)
      : null;
    const ownerUserId = req.body?.ownerUserId !== undefined
      ? owner?.id || null
      : current.owner_user_id || null;
    const active = ownerUserId ? 1 : 0;

    const dup = await query('SELECT id FROM gdvs WHERE name = ? AND id <> ? LIMIT 1', [nextName, id]);
    if (dup.length > 0) throw conflict('Já existe um GDV com esse nome');

    await withTransaction(async (conn) => {
      await conn.query(
        'UPDATE gdvs SET name = ?, owner_user_id = ?, active = ? WHERE id = ?',
        [nextName, ownerUserId, active, id]
      );
      if (nextName !== current.name) {
        await conn.query('UPDATE clients SET gdv_name = ? WHERE gdv_name = ?', [nextName, current.name]);
      }
    });

    await writeAuditLog({
      actor: req.user,
      action: 'gdv.update',
      entityType: 'gdv',
      entityId: id,
      entityLabel: nextName,
      summary: `GDV ${nextName} atualizado`,
      metadata: { previousName: current.name, ownerUserId },
    });

    const rows = await listRows();
    res.json({ gdv: serialize(rows.find((row) => row.id === id)) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureGdvSchema();
    const rows = await query('SELECT id, name FROM gdvs WHERE id = ? LIMIT 1', [req.params.id]);
    const current = rows[0];
    if (!current) throw notFound('GDV não encontrado');

    await writeAuditLog({
      actor: req.user,
      action: 'gdv.delete',
      entityType: 'gdv',
      entityId: current.id,
      entityLabel: current.name,
      summary: 'GDV removido da estrutura',
    });
    await query('DELETE FROM gdvs WHERE id = ?', [current.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
