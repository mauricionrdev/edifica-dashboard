import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { uuid, badRequest, notFound, conflict, forbidden, parseJson } from '../utils/helpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { VALID_ROLES } from '../utils/domain.js';
import { writeAuditLog } from '../utils/audit.js';
import { normalizePermissionList, resolvePermissions, PERMISSION_GROUPS } from '../utils/permissions.js';

const router = Router();
let profileInitPromise = null;
const AVATAR_COLORS = ['amber', 'blue', 'violet', 'emerald', 'rose', 'slate'];

async function ensureUserProfileColumns() {
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
      if (!names.has('permissions_override')) {
        await query('ALTER TABLE users ADD COLUMN permissions_override JSON NULL AFTER squads');
      }
      if (!names.has('secondary_roles')) {
        await query('ALTER TABLE users ADD COLUMN secondary_roles JSON NULL AFTER role');
      }
      await query("ALTER TABLE users MODIFY COLUMN role ENUM('ceo','suporte_tecnologia','admin','cap','gestor','gdv') NOT NULL DEFAULT 'gestor'");
    })().catch((err) => {
      profileInitPromise = null;
      throw err;
    });
  }
  return profileInitPromise;
}

async function countActiveAdmins(excludeId = null) {
  const params = [];
  let where = "WHERE active = 1 AND (role IN ('admin','ceo','suporte_tecnologia') OR is_master = 1)";
  if (excludeId) {
    where += ' AND id <> ?';
    params.push(excludeId);
  }
  const rows = await query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
  return Number(rows?.[0]?.total || 0);
}

function normalizePermissionsOverride(value) {
  return normalizePermissionList(value);
}

function normalizeSecondaryRoles(value, primaryRole = '') {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item) => VALID_ROLES.includes(item))
            .filter((item) => item !== primaryRole)
        )
      )
    : [];
}

function serializeUser(row) {
  const permissionsOverride = parseJson(row.permissions_override, []);
  const secondaryRoles = normalizeSecondaryRoles(parseJson(row.secondary_roles, []), row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    avatarColor: row.avatar_color || 'amber',
    avatarUrl: row.avatar_data_url || '',
    role: row.role,
    secondaryRoles,
    isMaster: Boolean(row.is_master),
    squads: parseJson(row.squads, []),
    permissionsOverride,
    permissions: resolvePermissions(row.role, permissionsOverride),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/directory', requireAuth, requirePermission('profile.view'), async (req, res, next) => {
  try {
    await ensureUserProfileColumns();
    const rows = await query(
      `SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active, created_at, updated_at
         FROM users
        WHERE active = 1
        ORDER BY name ASC`
    );
    res.json({ users: rows.map(serializeUser), permissionGroups: PERMISSION_GROUPS });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

router.get('/', requirePermission('team.view'), async (req, res, next) => {
  try {
    await ensureUserProfileColumns();
    const rows = await query(
      `SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active,
              created_at, updated_at
         FROM users
        ORDER BY is_master DESC, name ASC`
    );
    res.json({ users: rows.map(serializeUser), permissionGroups: PERMISSION_GROUPS });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureUserProfileColumns();
    const { name, email, phone, password, role, secondaryRoles, squads, avatarColor, avatarUrl, permissionsOverride } = req.body || {};
    if (!name || !email || !password) {
      throw badRequest('name, email e password são obrigatórios');
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = role && VALID_ROLES.includes(role) ? role : 'gestor';
    if (normalizedRole === 'admin') {
      throw badRequest('O cargo admin é legado e não deve ser usado para novos usuários.');
    }
    const normalizedSecondaryRoles = normalizeSecondaryRoles(secondaryRoles, normalizedRole);
    const squadsArray = Array.isArray(squads) ? squads : [];
    const normalizedAvatar = AVATAR_COLORS.includes(String(avatarColor || '').trim().toLowerCase())
      ? String(avatarColor).trim().toLowerCase()
      : 'amber';
    const normalizedAvatarUrl = String(avatarUrl || '').trim();
    if (normalizedAvatarUrl && !normalizedAvatarUrl.startsWith('data:image/')) {
      throw badRequest('Imagem de avatar inválida');
    }
    const normalizedPermissions = normalizePermissionsOverride(permissionsOverride);

    const exists = await query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [normalizedEmail]);
    if (exists.length > 0) throw conflict('E-mail já cadastrado');

    const id = uuid();
    const passwordHash = await bcrypt.hash(String(password), 10);

    await query(
      `INSERT INTO users (id, name, email, phone, avatar_color, avatar_data_url, password_hash, role, secondary_roles, is_master, squads, permissions_override, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`,
      [
        id,
        name.trim(),
        normalizedEmail,
        String(phone || '').trim() || null,
        normalizedAvatar,
        normalizedAvatarUrl || null,
        passwordHash,
        normalizedRole,
        JSON.stringify(normalizedSecondaryRoles),
        JSON.stringify(squadsArray),
        JSON.stringify(normalizedPermissions),
      ]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'user.create',
      entityType: 'user',
      entityId: id,
      entityLabel: name.trim(),
      summary: `Usuário ${name.trim()} criado com papel ${normalizedRole}`,
      metadata: {
        email: normalizedEmail,
        role: normalizedRole,
        secondaryRoles: normalizedSecondaryRoles,
        squads: squadsArray,
        permissionsOverride: normalizedPermissions,
      },
    });

    const rows = await query(
      `SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.status(201).json({ user: serializeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermission('team.manage'), async (req, res, next) => {
  try {
    await ensureUserProfileColumns();
    const { id } = req.params;
    const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');

    if (current.is_master && req.user.id !== current.id) {
      throw forbidden('Não é possível editar o Admin Master');
    }

    const { name, email, phone, password, role, secondaryRoles, squads, avatarColor, avatarUrl, permissionsOverride } = req.body || {};
    const updates = [];
    const params = [];

    if (name != null) { updates.push('name = ?'); params.push(String(name).trim()); }
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const clash = await query('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1', [normalizedEmail, id]);
      if (clash.length > 0) throw conflict('E-mail já utilizado por outro usuário');
      updates.push('email = ?'); params.push(normalizedEmail);
    }
    if (phone != null) { updates.push('phone = ?'); params.push(String(phone).trim() || null); }
    if (password) { updates.push('password_hash = ?'); params.push(await bcrypt.hash(String(password), 10)); }
    const nextPrimaryRole = role && VALID_ROLES.includes(role) ? role : current.role;

    if (role && VALID_ROLES.includes(role)) {
      if (role === 'admin' && current.role !== 'admin') throw badRequest('O cargo admin é legado e não pode ser atribuído a novos usuários.');
      if (current.is_master && role !== 'admin') throw forbidden('Admin Master deve permanecer admin');
      updates.push('role = ?'); params.push(role);
    }
    if (secondaryRoles != null) {
      updates.push('secondary_roles = ?');
      params.push(JSON.stringify(normalizeSecondaryRoles(secondaryRoles, nextPrimaryRole)));
    }
    if (Array.isArray(squads)) { updates.push('squads = ?'); params.push(JSON.stringify(squads)); }
    if (permissionsOverride != null) { updates.push('permissions_override = ?'); params.push(JSON.stringify(normalizePermissionsOverride(permissionsOverride))); }
    if (avatarColor != null) {
      const normalizedAvatar = String(avatarColor).trim().toLowerCase();
      if (!AVATAR_COLORS.includes(normalizedAvatar)) throw badRequest('Cor de avatar inválida');
      updates.push('avatar_color = ?'); params.push(normalizedAvatar);
    }
    if (avatarUrl !== undefined) {
      const cleanAvatar = String(avatarUrl || '').trim();
      if (cleanAvatar && !cleanAvatar.startsWith('data:image/')) throw badRequest('Imagem de avatar inválida');
      updates.push('avatar_data_url = ?'); params.push(cleanAvatar || null);
    }

    if (updates.length === 0) return res.json({ user: serializeUser(current) });

    params.push(id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    await writeAuditLog({
      actor: req.user,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      entityLabel: String(name || current.name || current.email || id).trim(),
      summary: 'Usuário atualizado',
      metadata: { changedFields: updates.map((item) => item.split(' = ')[0]) },
    });

    const fresh = await query(
      `SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.json({ user: serializeUser(fresh[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/toggle', requirePermission('team.manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');
    if (current.is_master) throw forbidden('Não é possível desativar o Admin Master');
    if (req.user.id === id && current.active) throw forbidden('Você não pode desativar sua própria conta');
    if (current.active && ['admin', 'ceo', 'suporte_tecnologia'].includes(current.role)) {
      const remaining = await countActiveAdmins(id);
      if (remaining <= 0) throw forbidden('É necessário manter pelo menos um super admin ativo');
    }

    const newActive = current.active ? 0 : 1;
    await query('UPDATE users SET active = ? WHERE id = ?', [newActive, id]);

    await writeAuditLog({ actor: req.user, action: newActive ? 'user.reactivate' : 'user.deactivate', entityType: 'user', entityId: id, entityLabel: current.name || current.email || id, summary: newActive ? 'Usuário reativado' : 'Usuário desativado', metadata: { email: current.email || null, role: current.role || null } });

    const fresh = await query(`SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active, created_at, updated_at FROM users WHERE id = ?`, [id]);
    res.json({ user: serializeUser(fresh[0]) });
  } catch (err) { next(err); }
});

router.post('/:id/reset-password', requirePermission('team.manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');
    if (current.is_master && req.user.id !== id) throw forbidden('Não é possível redefinir o Admin Master por esta operação');

    const providedPassword = String(req.body?.password || '').trim();
    const temporaryPassword = providedPassword || uuid().slice(0, 12) + '!';
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await query('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?', [passwordHash, id]);

    await writeAuditLog({ actor: req.user, action: 'user.reset_password', entityType: 'user', entityId: id, entityLabel: current.name || current.email || id, summary: 'Senha temporária administrativa gerada', metadata: { email: current.email || null, role: current.role || null } });

    const fresh = await query(`SELECT id, name, email, phone, avatar_color, avatar_data_url, role, secondary_roles, is_master, squads, permissions_override, active, created_at, updated_at FROM users WHERE id = ?`, [id]);
    res.json({ user: serializeUser(fresh[0]), temporaryPassword });
  } catch (err) { next(err); }
});

router.delete('/:id', requirePermission('team.manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT id, name, email, role, is_master, active FROM users WHERE id = ? LIMIT 1', [id]);
    const current = rows[0];
    if (!current) throw notFound('Usuário não encontrado');
    if (current.is_master) throw forbidden('Não é possível remover o Admin Master');
    if (req.user.id === id) throw forbidden('Você não pode remover sua própria conta');
    if (current.active && ['admin', 'ceo', 'suporte_tecnologia'].includes(current.role)) {
      const remaining = await countActiveAdmins(id);
      if (remaining <= 0) throw forbidden('É necessário manter pelo menos um super admin ativo');
    }

    await writeAuditLog({ actor: req.user, action: 'user.delete', entityType: 'user', entityId: id, entityLabel: current.name || current.email || id, summary: 'Usuário removido da plataforma', metadata: { role: current.role || null } });
    await query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
