// ==============================================================
//  Middleware de autenticação JWT
// ==============================================================
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { parseJson, unauthorized, forbidden } from '../utils/helpers.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn(
    '[auth] JWT_SECRET ausente ou muito curto. ' +
      'Defina um hex de 64 bytes no .env antes de subir em produção.'
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

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
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
      `SELECT id, name, email, role, is_master, squads, active,
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
 * Exige que o usuário seja admin (role admin OU isMaster).
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin' && !req.user.isMaster) {
    return next(forbidden('Apenas administradores'));
  }
  next();
}
