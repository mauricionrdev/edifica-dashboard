// ================================================================
//  Roles - espelha src/utils/domain.js do backend.
//  Usado para rótulos no frontend e gating de UI (ex: botão "Novo squad"
//  só aparece para admin/master).
// ================================================================

export const ROLES = {
  ceo:                { label: 'CEO',                    access: 'all', superAdmin: true },
  suporte_tecnologia: { label: 'Suporte de Tecnologia', access: 'all', superAdmin: true },
  admin:              { label: 'Administrador',         access: 'all' },
  cap:                { label: 'CAP',                   access: 'squad' },
  gestor:             { label: 'Gestor de Tráfego',     access: 'squad' },
  gdv:                { label: 'GDV',                   access: 'squad' },
};

export function roleLabel(role) {
  return ROLES[role]?.label || role || '—';
}

const SUPER_ADMIN_ROLES = new Set(['admin', 'ceo', 'suporte_tecnologia']);

export function isAdminUser(user) {
  if (!user) return false;
  return SUPER_ADMIN_ROLES.has(user.role) || user.isMaster === true;
}

export function isSuperAdmin(user) {
  if (!user) return false;
  return user.isMaster === true || user.role === 'ceo' || user.role === 'suporte_tecnologia';
}
