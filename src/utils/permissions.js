import { ROLES, isAdminUser, isSuperAdmin } from './roles.js';

export const ROLE_PERMISSION_MAP = {
  ceo: ['*'],
  suporte_tecnologia: ['*'],
  admin: [
    'central.view',
    'clients.view', 'clients.create', 'clients.edit', 'clients.fee_schedule.view', 'clients.fee_schedule.edit',
    'metrics.view', 'metrics.fill_week',
    'gdv.view', 'gdv.manage',
    'squads.view', 'squads.manage',
    'team.view', 'team.manage',
    'audit.view',
    'projects.view', 'projects.create', 'projects.edit', 'project_template.view', 'project_template.edit',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.comment', 'tasks.complete.own', 'tasks.complete.any',
    'profile.view', 'profile.edit',
  ],
  gdv: [
    'central.view', 'clients.view', 'clients.fee_schedule.view', 'gdv.view', 'squads.view',
    'metrics.view', 'profile.view', 'profile.edit',
    'projects.view', 'tasks.view', 'tasks.create', 'tasks.comment', 'tasks.complete.own',
  ],
  gestor: [
    'central.view', 'clients.view', 'clients.fee_schedule.view', 'metrics.view', 'metrics.fill_week',
    'projects.view', 'projects.create', 'projects.edit',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.comment', 'tasks.complete.own', 'tasks.complete.any',
    'profile.view', 'profile.edit', 'squads.view',
  ],
  cap: [
    'central.view', 'clients.view', 'clients.fee_schedule.view', 'metrics.view', 'metrics.fill_week',
    'projects.view', 'tasks.view', 'tasks.create', 'tasks.comment', 'tasks.complete.own',
  ],
};

export const ROLE_ORDER = ['ceo', 'suporte_tecnologia', 'admin', 'gdv', 'gestor', 'cap'];

export function getRoleBasePermissions(role) {
  return ROLE_PERMISSION_MAP[role] || [];
}

export function getRoleSummary(role) {
  const meta = ROLES[role] || {};
  const base = getRoleBasePermissions(role);
  return {
    role,
    label: meta.label || role || '—',
    access: meta.access || 'squad',
    superAdmin: Boolean(meta.superAdmin),
    permissions: base,
    isWildcard: base.includes('*'),
  };
}

export const PERMISSION_GROUPS = [
  { area: 'Central', permissions: ['central.view'] },
  { area: 'Clientes', permissions: ['clients.view', 'clients.create', 'clients.edit', 'clients.fee_schedule.view', 'clients.fee_schedule.edit'] },
  { area: 'Preencher Semana', permissions: ['metrics.view', 'metrics.fill_week'] },
  { area: 'GDV', permissions: ['gdv.view', 'gdv.manage'] },
  { area: 'Projetos', permissions: ['projects.view', 'projects.create', 'projects.edit', 'project_template.view', 'project_template.edit'] },
  { area: 'Tarefas', permissions: ['tasks.view', 'tasks.create', 'tasks.edit', 'tasks.comment', 'tasks.complete.own', 'tasks.complete.any'] },
  { area: 'Squads', permissions: ['squads.view', 'squads.manage'] },
  { area: 'Equipe & Acessos', permissions: ['team.view', 'team.manage'] },
  { area: 'Auditoria', permissions: ['audit.view'] },
  { area: 'Perfil', permissions: ['profile.view', 'profile.edit'] },
];

export const PERMISSION_LABELS = {
  'central.view': 'Ver dashboard central',
  'clients.view': 'Ver clientes',
  'clients.create': 'Criar clientes',
  'clients.edit': 'Editar clientes',
  'clients.fee_schedule.view': 'Ver evolução contratual',
  'clients.fee_schedule.edit': 'Editar evolução contratual',
  'metrics.view': 'Ver métricas',
  'metrics.fill_week': 'Preencher semana',
  'gdv.view': 'Acessar GDV',
  'gdv.manage': 'Gerenciar GDVs',
  'projects.view': 'Ver projetos',
  'projects.create': 'Criar projetos',
  'projects.edit': 'Editar projetos',
  'project_template.view': 'Ver Modelo Oficial',
  'project_template.edit': 'Editar Modelo Oficial',
  'tasks.view': 'Ver tarefas',
  'tasks.create': 'Criar tarefas',
  'tasks.edit': 'Editar tarefas',
  'tasks.comment': 'Comentar tarefas',
  'tasks.complete.own': 'Concluir próprias tarefas',
  'tasks.complete.any': 'Concluir qualquer tarefa',
  'squads.view': 'Ver squads',
  'squads.manage': 'Gerenciar squads',
  'team.view': 'Ver equipe e acessos',
  'team.manage': 'Gerenciar equipe e acessos',
  'audit.view': 'Ver auditoria',
  'profile.view': 'Ver perfil',
  'profile.edit': 'Editar perfil',
};

export function getUserSquadIds(user) {
  return Array.isArray(user?.squads) ? user.squads.filter(Boolean) : [];
}

export function getUserPermissions(user) {
  return Array.isArray(user?.permissions) ? user.permissions : [];
}

export function hasPermission(user, permission) {
  if (!permission) return false;
  if (isSuperAdmin(user)) return true;
  const perms = getUserPermissions(user);
  return perms.includes('*') || perms.includes(permission);
}

export function canAccessAdmin(user) {
  return isAdminUser(user) || hasPermission(user, 'team.view');
}

export function canManageAdmin(user) {
  return isAdminUser(user) || hasPermission(user, 'team.manage');
}

export function canViewTeamArea(user) {
  return isAdminUser(user) || hasPermission(user, 'team.view');
}

export function canManageTeamArea(user) {
  return isAdminUser(user) || hasPermission(user, 'team.manage');
}

export function canViewClients(user) {
  return isAdminUser(user) || hasPermission(user, 'clients.view');
}

export function canCreateClients(user) {
  return isAdminUser(user) || hasPermission(user, 'clients.create');
}

export function canEditClients(user) {
  return isAdminUser(user) || hasPermission(user, 'clients.edit');
}

export function canViewClientFeeSchedule(user) {
  return isAdminUser(user) || hasPermission(user, 'clients.fee_schedule.view');
}

export function canEditClientFeeSchedule(user) {
  return isAdminUser(user) || hasPermission(user, 'clients.fee_schedule.edit');
}

export function canViewMetrics(user) {
  return isAdminUser(user) || hasPermission(user, 'metrics.view');
}

export function canFillMetrics(user) {
  return isAdminUser(user) || hasPermission(user, 'metrics.fill_week');
}

export function canViewGdv(user) {
  return isAdminUser(user) || hasPermission(user, 'gdv.view');
}

export function canManageGdvs(user) {
  return isAdminUser(user) || hasPermission(user, 'gdv.manage');
}

export function canManageSquads(user) {
  return isAdminUser(user) || hasPermission(user, 'squads.manage');
}

export function canViewAudit(user) {
  return isAdminUser(user) || hasPermission(user, 'audit.view');
}


export function canViewProfile(user) {
  return isAdminUser(user) || hasPermission(user, 'profile.view');
}

export function canEditProfile(user) {
  return isAdminUser(user) || hasPermission(user, 'profile.edit');
}

export function canAccessSquad(user, squadId) {
  if (!squadId) return false;
  if (isAdminUser(user)) return true;
  return getUserSquadIds(user).includes(squadId);
}



export const ROUTE_PERMISSION_MAP = [
  { path: '/', permission: 'central.view' },
  { path: '/clientes', permission: 'clients.view' },
  { path: '/projetos', permission: 'projects.view' },
  { path: '/preencher-semana', permission: 'metrics.view' },
  { path: '/gdv', permission: 'gdv.view' },
  { path: '/perfil', permission: 'profile.view' },
  { path: '/ranking-squads', permission: 'squads.view' },
  { path: '/equipe', permission: 'team.view' },
  { path: '/modelo-oficial', permission: 'project_template.view' },
];

export function buildPathFromLocation(locationLike) {
  if (!locationLike) return '';
  if (typeof locationLike === 'string') return locationLike;
  const pathname = locationLike.pathname || '';
  const search = locationLike.search || '';
  const hash = locationLike.hash || '';
  return `${pathname}${search}${hash}` || '';
}

export function getRoutePermission(pathname = '/') {
  const cleanPath = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (cleanPath === '/acesso-negado' || cleanPath === '/login') return null;
  if (cleanPath.startsWith('/perfil/')) return 'profile.view';
  if (cleanPath.startsWith('/squads/')) return 'squads.view';
  const match = ROUTE_PERMISSION_MAP.find((route) => route.path === cleanPath);
  return match?.permission || null;
}

export function canAccessRoute(user, path) {
  const permission = getRoutePermission(path || '/');
  if (!permission) return true;
  return hasPermission(user, permission);
}

export function getDefaultRouteForUser(user) {
  const firstAllowed = ROUTE_PERMISSION_MAP.find((route) => hasPermission(user, route.permission));
  return firstAllowed?.path || '/acesso-negado';
}

export function getSafeRedirectPath(user, requestedPath) {
  const path = buildPathFromLocation(requestedPath) || '/';
  return canAccessRoute(user, path) ? path : getDefaultRouteForUser(user);
}

export function permissionLabel(key) {
  return PERMISSION_LABELS[key] || key;
}
