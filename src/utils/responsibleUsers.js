const SUPER_ROLES = new Set(['admin', 'ceo', 'suporte_tecnologia']);
const GESTOR_ROLES = new Set(['gestor', ...SUPER_ROLES]);
const GDV_ROLES = new Set(['gdv', ...SUPER_ROLES]);
const ROLE_LABELS = {
  ceo: 'CEO',
  suporte_tecnologia: 'Suporte de Tecnologia',
  admin: 'Administrador',
  cap: 'CAP',
  gestor: 'Gestor de Tráfego',
  gdv: 'GDV',
};

function isActiveUser(user) {
  return user?.active !== false && user?.isActive !== false && user?.status !== 'inactive';
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
}

export function userLabel(user) {
  const name = String(user?.name || '').trim();
  const roles = [user?.role, ...(Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [])]
    .filter(Boolean)
    .map((role) => ROLE_LABELS[role] || role);
  return roles.length ? `${name} - ${roles.join(' + ')}` : name;
}

function hasAnyRole(user, roles) {
  const secondaryRoles = Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [];
  return roles.has(user?.role) || secondaryRoles.some((role) => roles.has(role));
}

export function responsibleUserOptions(users, roles, selectedName = '') {
  return (Array.isArray(users) ? users : [])
    .filter((user) => isActiveUser(user))
    .filter((user) => hasAnyRole(user, roles))
    .filter((user) => String(user?.name || '').trim())
    .sort(sortByName);
}

export function gestorOptions(users, selectedName = '') {
  return responsibleUserOptions(users, GESTOR_ROLES, selectedName);
}

export function gdvOptions(users, selectedName = '') {
  return responsibleUserOptions(users, GDV_ROLES, selectedName);
}
