// ==============================================================
//  /api/users  (admin only)
// ==============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import {
  uuid,
  parseJson,
  badRequest,
  notFound,
  conflict,
  forbidden,
} from '../utils/helpers.js';
import { VALID_ROLES } from '../utils/domain.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isMaster: Boolean(row.is_master),
    squads: parseJson(row.squads, []),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, name, email, role, is_master, squads, active,
              created_at, updated_at
         FROM users
        ORDER BY is_master DESC, name ASC`
    );
    res.json({ users: rows.map(serializeUser) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role, squads } = req.body || {};
    if (!name || !email || !password) {
      throw badRequest('name, email e password são obrigatórios');
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = role && VALID_ROLES.includes(role) ? role : 'gestor';
    const squadsArray = Array.isArray(squads) ? squads : [];

    const exists = await query(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [normalizedEmail]
    );
    if (exists.length > 0) throw conflict('E-mail já cadastrado');

    const id = uuid();
    const passwordHash = await bcrypt.hash(String(password), 10);

    await query(
      `INSERT INTO users (id, name, email, password_hash, role, is_master, squads, active)
       VALUES (?, ?, ?, ?, ?, 0, CAST(? AS JSON), 1)`,
      [id, name.trim(), normalizedEmail, passwordHash, normalizedRole, JSON.stringify(squadsArray)]
    );

    const rows = await query(
      `SELECT id, name, email, role, is_master, squads, active, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.status(201).json({ user: serializeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');

    if (current.is_master && req.user.id !== current.id) {
      throw forbidden('Não é possível editar o Admin Master');
    }

    const { name, email, password, role, squads } = req.body || {};
    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const clash = await query(
        'SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1',
        [normalizedEmail, id]
      );
      if (clash.length > 0) throw conflict('E-mail já utilizado por outro usuário');
      updates.push('email = ?');
      params.push(normalizedEmail);
    }
    if (password) {
      updates.push('password_hash = ?');
      params.push(await bcrypt.hash(String(password), 10));
    }
    if (role && VALID_ROLES.includes(role)) {
      if (current.is_master && role !== 'admin') {
        throw forbidden('Admin Master deve permanecer admin');
      }
      updates.push('role = ?');
      params.push(role);
    }
    if (Array.isArray(squads)) {
      updates.push('squads = CAST(? AS JSON)');
      params.push(JSON.stringify(squads));
    }

    if (updates.length === 0) {
      return res.json({ user: serializeUser(current) });
    }

    params.push(id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const fresh = await query(
      `SELECT id, name, email, role, is_master, squads, active, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.json({ user: serializeUser(fresh[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');
    if (current.is_master) throw forbidden('Não é possível desativar o Admin Master');

    const newActive = current.active ? 0 : 1;
    await query('UPDATE users SET active = ? WHERE id = ?', [newActive, id]);

    const fresh = await query(
      `SELECT id, name, email, role, is_master, squads, active, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.json({ user: serializeUser(fresh[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT is_master FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');
    if (current.is_master) throw forbidden('Não é possível remover o Admin Master');

    await query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
