// ==============================================================
//  POST /api/auth/login
//  GET  /api/auth/me
//  POST /api/auth/logout  (no-op do lado do servidor; token é stateless)
// ==============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { parseJson, unauthorized, badRequest } from '../utils/helpers.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

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

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      throw badRequest('Informe e-mail/nome e senha');
    }

    // Aceita login por e-mail OU nome (case-insensitive), como no protótipo.
    const rows = await query(
      `SELECT id, name, email, password_hash, role, is_master, squads, active,
              created_at, updated_at
         FROM users
        WHERE (LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?))
          AND active = 1
        LIMIT 1`,
      [identifier, identifier]
    );
    const row = rows[0];
    if (!row) throw unauthorized('E-mail/nome ou senha incorretos');

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw unauthorized('E-mail/nome ou senha incorretos');

    const user = serializeUser(row);
    const token = signToken({ id: user.id, role: user.role, is_master: user.isMaster });

    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (req, res) => {
  // JWT é stateless: o cliente descarta o token.
  // Mantemos a rota para simetria e para possível blacklist futura.
  res.json({ ok: true });
});

export default router;
