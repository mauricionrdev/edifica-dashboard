import { query } from '../db/pool.js';
import { forbidden, notFound } from './helpers.js';
import { hasPermission } from './permissions.js';

const SUPER_ADMIN_ROLES = new Set(['admin', 'ceo', 'suporte_tecnologia']);

export function isAdminUser(user) {
  return Boolean(user && (SUPER_ADMIN_ROLES.has(user.role) || user.isMaster));
}

export function hasGlobalScope(user, allPermission = '') {
  return isAdminUser(user) || Boolean(allPermission && hasPermission(user, allPermission));
}

export function getAllowedSquads(user, allPermission = 'clients.view.all') {
  if (hasGlobalScope(user, allPermission)) return null;
  return Array.isArray(user?.squads) ? user.squads.filter(Boolean) : [];
}

export function filterRowsBySquadAccess(user, rows = [], allPermission = 'clients.view.all') {
  if (hasGlobalScope(user, allPermission)) return rows;
  const allowedSquads = getAllowedSquads(user, allPermission);
  if (allowedSquads.length === 0) return [];
  return rows.filter((row) => row?.squad_id && allowedSquads.includes(row.squad_id));
}

export async function getAccessibleClientRow(
  clientId,
  user,
  select = 'id, squad_id, meta_lucro, gdv_name, gestor',
  allPermission = 'clients.view.all'
) {
  const rows = await query(`SELECT ${select} FROM clients WHERE id = ? LIMIT 1`, [clientId]);
  const row = rows[0];
  if (!row) throw notFound('Cliente não encontrado');
  if (!hasGlobalScope(user, allPermission)) {
    const allowedSquads = getAllowedSquads(user, allPermission);
    if (allowedSquads.length === 0 || !row.squad_id || !allowedSquads.includes(row.squad_id)) {
      throw forbidden('Sem acesso a este cliente');
    }
  }
  return row;
}
