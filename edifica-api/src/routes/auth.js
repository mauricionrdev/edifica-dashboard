// ==============================================================
//  Auth / profile
//  POST /api/auth/login
//  GET  /api/auth/me
//  PATCH /api/auth/profile
//  POST /api/auth/change-password
//  POST /api/auth/logout
// ==============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { parseJson, unauthorized, badRequest, conflict } from '../utils/helpers.js';
import { normalizeSlug, isValidSlug } from '../utils/slugs.js';
import { normalizePermissionList, resolvePermissions, PERMISSION_GROUPS } from '../utils/permissions.js';
import { signToken, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
let profileInitPromise = null;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}`;
}

function cookieSameSite(req) {
  if (!isSecureRequest(req)) return 'Lax';
  try {
    if (!FRONTEND_URL) return 'Lax';
    const frontendOrigin = new URL(FRONTEND_URL).origin;
    return frontendOrigin !== requestOrigin(req) ? 'None' : 'Lax';
  } catch {
    return 'Lax';
  }
}

function setAuthCookie(req, res, token) {
  const cookie = [
    `auth_token=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${cookieSameSite(req)}`,
  ];
  if (isSecureRequest(req)) cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
}

function clearAuthCookie(req, res) {
  const cookie = [
    'auth_token=',
    'Path=/',
    'HttpOnly',
    `SameSite=${cookieSameSite(req)}`,
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
}

async function ensureProfileColumns() {
  if (!profileInitPromise) {
    profileInitPromise = (async () => {
      const cols = await query('SHOW COLUMNS FROM users');
      const names = new Set(cols.map((c) => c.Field));
      if (!names.has('phone')) {
        await query('ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL AFTER email');
      }
      if (!names.has('avatar_color')) {
        await query("ALTER TABLE users ADD COLUMN avatar_color VARCHAR(32) NOT NULL DEFAULT 'amber' AFTER phone");
      }
      if (!names.has('avatar_data_url')) {
        await query('ALTER TABLE users ADD COLUMN avatar_data_url MEDIUMTEXT NULL AFTER avatar_color');
      }
      if (!names.has('custom_slug')) {
        await query('ALTER TABLE users ADD COLUMN custom_slug VARCHAR(96) NULL AFTER avatar_data_url');
      }
      if (!names.has('permissions_override')) {
        await query("ALTER TABLE users ADD COLUMN permissions_override JSON NULL AFTER squads");
      }
      const indexes = await query('SHOW INDEX FROM users');
      const indexNames = new Set(indexes.map((idx) => idx.Key_name));
      if (!indexNames.has('uk_users_custom_slug')) {
        await query('ALTER TABLE users ADD UNIQUE KEY uk_users_custom_slug (custom_slug)');
      }
      await query("ALTER TABLE users MODIFY COLUMN role ENUM('ceo','suporte_tecnologia','admin','cap','gestor','gdv') NOT NULL DEFAULT 'gestor'");
    })().catch((err) => {
      profileInitPromise = null;
      throw err;
    });
  }
  return profileInitPromise;
}

function serializeUser(row) {
  const permissionsOverride = normalizePermissionList(parseJson(row.permissions_override, []));
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    avatarColor: row.avatar_color || 'amber',
    avatarUrl: row.avatar_data_url || '',
    customSlug: row.custom_slug || '',
    role: row.role,
    isMaster: Boolean(row.is_master),
    squads: parseJson(row.squads, []),
    permissionsOverride,
    permissions: resolvePermissions(row.role, permissionsOverride),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserById(id) {
  await ensureProfileColumns();
  const rows = await query(
    `SELECT id, name, email, phone, avatar_color, password_hash, role, is_master, squads, permissions_override, active,
            avatar_data_url, custom_slug,
            created_at, updated_at
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

router.post('/login', async (req, res, next) => {
  try {
    await ensureProfileColumns();
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      throw badRequest('Informe e-mail/nome e senha');
    }

    const rows = await query(
      `SELECT id, name, email, phone, avatar_color, avatar_data_url, custom_slug, password_hash, role, is_master, squads, permissions_override, active,
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

    setAuthCookie(req, res, token);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const row = await getUserById(req.user.id);
    res.json({ user: serializeUser(row), permissionGroups: PERMISSION_GROUPS });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', requireAuth, requirePermission('profile.edit'), async (req, res, next) => {
  try {
    await ensureProfileColumns();
    const current = await getUserById(req.user.id);
    if (!current) throw unauthorized('Usuário não encontrado');

    const { name, phone, avatarColor, avatarUrl, customSlug } = req.body || {};
    const updates = [];
    const params = [];

    if (name != null) {
      const normalizedName = String(name).trim();
      if (!normalizedName) throw badRequest('Nome é obrigatório');
      updates.push('name = ?');
      params.push(normalizedName);
    }

    if (phone != null) {
      updates.push('phone = ?');
      params.push(String(phone).trim() || null);
    }

    if (avatarColor != null) {
      const normalizedColor = String(avatarColor).trim().toLowerCase();
      const validColors = new Set(['amber', 'blue', 'violet', 'emerald', 'rose', 'slate']);
      if (!validColors.has(normalizedColor)) {
        throw badRequest('Cor de avatar inválida');
      }
      updates.push('avatar_color = ?');
      params.push(normalizedColor);
    }

    if (avatarUrl !== undefined) {
      const cleanAvatar = String(avatarUrl || '').trim();
      if (cleanAvatar && !cleanAvatar.startsWith('data:image/')) {
        throw badRequest('Imagem de avatar inválida');
      }
      updates.push('avatar_data_url = ?');
      params.push(cleanAvatar || null);
    }

    if (customSlug !== undefined) {
      const cleanSlug = normalizeSlug(customSlug);
      if (customSlug && !isValidSlug(cleanSlug)) {
        throw badRequest('Link personalizado inválido. Use letras, números e hífen, com no mínimo 3 caracteres.');
      }
      if (cleanSlug) {
        const slugDup = await query('SELECT id FROM users WHERE custom_slug = ? AND id <> ? LIMIT 1', [cleanSlug, req.user.id]);
        if (slugDup.length > 0) throw conflict('Este link personalizado já está em uso.');
      }
      updates.push('custom_slug = ?');
      params.push(cleanSlug || null);
    }

    if (updates.length === 0) {
      return res.json({ user: serializeUser(current) });
    }

    params.push(req.user.id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const fresh = await getUserById(req.user.id);
    res.json({ user: serializeUser(fresh) });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireAuth, requirePermission('profile.edit'), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      throw badRequest('Informe a senha atual e a nova senha');
    }
    if (String(newPassword).trim().length < 6) {
      throw badRequest('A nova senha precisa ter ao menos 6 caracteres');
    }

    const current = await getUserById(req.user.id);
    if (!current) throw unauthorized('Usuário não encontrado');

    const ok = await bcrypt.compare(String(currentPassword), current.password_hash);
    if (!ok) throw conflict('Senha atual incorreta');

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (req, res) => {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

export default router;
