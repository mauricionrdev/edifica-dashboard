// ================================================================
//  Roles - espelha src/utils/domain.js do backend.
//  Usado para rótulos no frontend e gating de UI (ex: botão "Novo squad"
//  só aparece para admin/master).
// ================================================================

export const ROLES = {
  admin:  { label: 'Administrador',     access: 'all'   },
  cap:    { label: 'CAP',               access: 'squad' },
  gestor: { label: 'Gestor de Tráfego', access: 'squad' },
  gdv:    { label: 'GDV',               access: 'squad' },
};

export function roleLabel(role) {
  return ROLES[role]?.label || role || '—';
}

export function isAdminUser(user) {
  if (!user) return false;
  return user.role === 'admin' || user.isMaster === true;
}
