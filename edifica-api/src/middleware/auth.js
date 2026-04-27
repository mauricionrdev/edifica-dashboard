// ==============================================================
//  Middleware de autenticação JWT
// ==============================================================
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { parseJson, unauthorized, forbidden } from '../utils/helpers.js';
import { hasPermission, hasAnyPermission, resolvePermissions } from '../utils/permissions.js';

const SUPER_ADMIN_ROLES = new Set(['admin', 'ceo', 'suporte_tecnologia']);

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn(
    '[auth] JWT_SECRET ausente ou muito curto. '
      + 'Defina um hex de 64 bytes no .env antes de subir em produção.'
  );
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      isMaster: !!user.is_master || !!user.isMaster,
    },
    JWT_SECRET || 'dev-insecure-secret',
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.split('=');
    const name = String(key || '').trim();
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }
  const cookies = parseCookies(req);
  return cookies.auth_token || null;
}

/**
 * Exige usuário autenticado. Popula req.user com o registro
 * completo do banco (sem password_hash).
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized('Token ausente');

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET || 'dev-insecure-secret');
    } catch {
      throw unauthorized('Token inválido ou expirado');
    }

    const rows = await query(
      `SELECT id, name, email, role, is_master, squads, permissions_override, active,
              created_at, updated_at
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.active) throw unauthorized('Usuário inativo ou removido');

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isMaster: Boolean(user.is_master),
      squads: parseJson(user.squads, []),
      permissionsOverride: parseJson(user.permissions_override, []),
      permissions: resolvePermissions(user.role, parseJson(user.permissions_override, [])),
      active: Boolean(user.active),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Exige que o usuário seja admin/super admin (role admin/CEO/Suporte OU isMaster).
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (!SUPER_ADMIN_ROLES.has(req.user.role) && !req.user.isMaster) {
    return next(forbidden('Apenas administradores'));
  }
  next();
}

export function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (!permission) return next();
    if (req.user.isMaster || SUPER_ADMIN_ROLES.has(req.user.role)) return next();
    if (hasPermission(req.user, permission)) return next();
    return next(forbidden('Você não tem permissão para esta ação'));
  };
}

export function requireAnyPermission(permissions = []) {
  return function anyPermissionGuard(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (req.user.isMaster || SUPER_ADMIN_ROLES.has(req.user.role)) return next();
    const allowed = permissions.filter(Boolean);
    if (allowed.length === 0) return next();
    if (hasAnyPermission(req.user, allowed)) return next();
    return next(forbidden('Você não tem permissão para esta ação'));
  };
}
