import { ROLES, isAdminUser, isSuperAdmin } from './roles.js';

const LEGACY_SCOPE_MAP = {
  'clients.view': 'clients.view.own',
  'clients.edit': 'clients.edit.own',
  'clients.fee_schedule.view': 'clients.fee_schedule.view.own',
  'clients.fee_schedule.edit': 'clients.fee_schedule.edit.own',
  'gdv.view': 'gdv.view.own',
  'projects.view': 'projects.view.own',
  'projects.edit': 'projects.edit.own',
  'tasks.view': 'tasks.view.own',
  'tasks.edit': 'tasks.edit.own',
  'tasks.comment': 'tasks.comment.own',
  'squads.view': 'squads.view.own',
  'metrics.view': 'metrics.view.own',
  'metrics.fill_week': 'metrics.fill_week.own',
  'ranking.view': 'ranking.view.own',
};

const GENERIC_SCOPE_MAP = {
  'clients.view': ['clients.view.own', 'clients.view.all'],
  'clients.edit': ['clients.edit.own', 'clients.edit.all'],
  'clients.fee_schedule.view': ['clients.fee_schedule.view.own', 'clients.fee_schedule.view.all'],
  'clients.fee_schedule.edit': ['clients.fee_schedule.edit.own', 'clients.fee_schedule.edit.all'],
  'gdv.view': ['gdv.view.own', 'gdv.view.all'],
  'projects.view': ['projects.view.own', 'projects.view.all'],
  'projects.edit': ['projects.edit.own', 'projects.edit.all'],
  'tasks.view': ['tasks.view.own', 'tasks.view.all'],
  'tasks.edit': ['tasks.edit.own', 'tasks.edit.all'],
  'tasks.comment': ['tasks.comment.own', 'tasks.comment.all'],
  'squads.view': ['squads.view.own', 'squads.view.all'],
  'metrics.view': ['metrics.view.own', 'metrics.view.all'],
  'metrics.fill_week': ['metrics.fill_week.own', 'metrics.fill_week.all'],
  'ranking.view': ['ranking.view.own', 'ranking.view.all'],
};

function basePermissionForScoped(permission = '') {
  return String(permission).replace(/\.(own|all)$/, '');
}

function allPermissionForScoped(permission = '') {
  const key = String(permission);
  if (key.endsWith('.all')) return key;
  if (key.endsWith('.own')) return key.replace(/\.own$/, '.all');
  return GENERIC_SCOPE_MAP[key]?.find((item) => item.endsWith('.all')) || '';
}

export function normalizePermissionList(list = []) {
  const permissions = Array.isArray(list) ? list : [];
  return Array.from(
    new Set(
      permissions
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => LEGACY_SCOPE_MAP[item.trim()] || item.trim())
    )
  );
}

export const ROLE_PERMISSION_MAP = {
  ceo: ['*'],
  suporte_tecnologia: ['*'],
  admin: [
    'central.view',
    'clients.view.all', 'clients.create', 'clients.edit.all', 'clients.fee_schedule.view.all', 'clients.fee_schedule.edit.all',
    'metrics.view.all', 'metrics.fill_week.all', 'ranking.view.all',
    'gdv.view.all', 'gdv.manage',
    'squads.view.all', 'squads.manage',
    'team.view', 'team.manage',
    'audit.view',
    'projects.view.all', 'projects.create', 'projects.edit.all', 'project_template.view', 'project_template.edit',
    'tasks.view.all', 'tasks.create', 'tasks.edit.all', 'tasks.comment.all', 'tasks.complete.own', 'tasks.complete.any',
    'profile.view', 'profile.edit',
  ],
  gdv: [
    'central.view', 'clients.view.own', 'clients.fee_schedule.view.own', 'gdv.view.own', 'squads.view.own',
    'metrics.view.own', 'ranking.view.own', 'profile.view', 'profile.edit',
    'projects.view.own', 'tasks.view.own', 'tasks.create', 'tasks.comment.own', 'tasks.complete.own',
  ],
  gestor: [
    'central.view', 'clients.view.all', 'clients.fee_schedule.view.all', 'metrics.view.all', 'metrics.fill_week.all', 'ranking.view.all',
    'projects.view.all', 'projects.create', 'projects.edit.all',
    'tasks.view.all', 'tasks.create', 'tasks.edit.all', 'tasks.comment.all', 'tasks.complete.own', 'tasks.complete.any',
    'profile.view', 'profile.edit', 'squads.view.all',
  ],
  cap: [
    'central.view', 'clients.view.own', 'clients.fee_schedule.view.own', 'metrics.view.own', 'metrics.fill_week.own', 'ranking.view.own',
    'projects.view.own', 'tasks.view.own', 'tasks.create', 'tasks.comment.own', 'tasks.complete.own', 'squads.view.own',
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
  { area: 'Clientes', permissions: ['clients.view.own', 'clients.view.all', 'clients.create', 'clients.edit.own', 'clients.edit.all', 'clients.fee_schedule.view.own', 'clients.fee_schedule.view.all', 'clients.fee_schedule.edit.own', 'clients.fee_schedule.edit.all'] },
  { area: 'Métricas', permissions: ['metrics.view.own', 'metrics.view.all', 'metrics.fill_week.own', 'metrics.fill_week.all'] },
  { area: 'Ranking', permissions: ['ranking.view.own', 'ranking.view.all'] },
  { area: 'GDV', permissions: ['gdv.view.own', 'gdv.view.all', 'gdv.manage'] },
  { area: 'Projetos', permissions: ['projects.view.own', 'projects.view.all', 'projects.create', 'projects.edit.own', 'projects.edit.all', 'project_template.view', 'project_template.edit'] },
  { area: 'Tarefas', permissions: ['tasks.view.own', 'tasks.view.all', 'tasks.create', 'tasks.edit.own', 'tasks.edit.all', 'tasks.comment.own', 'tasks.comment.all', 'tasks.complete.own', 'tasks.complete.any'] },
  { area: 'Squads', permissions: ['squads.view.own', 'squads.view.all', 'squads.manage'] },
  { area: 'Equipe & Acessos', permissions: ['team.view', 'team.manage'] },
  { area: 'Auditoria', permissions: ['audit.view'] },
  { area: 'Perfil', permissions: ['profile.view', 'profile.edit'] },
];

export const PERMISSION_LABELS = {
  'central.view': 'Ver dashboard central',
  'clients.view.own': 'Ver clientes do próprio escopo',
  'clients.view.all': 'Ver todos os clientes',
  'clients.create': 'Criar clientes',
  'clients.edit.own': 'Editar clientes do próprio escopo',
  'clients.edit.all': 'Editar todos os clientes',
  'clients.fee_schedule.view.own': 'Ver evolução contratual do próprio escopo',
  'clients.fee_schedule.view.all': 'Ver evolução contratual de todos',
  'clients.fee_schedule.edit.own': 'Editar evolução contratual do próprio escopo',
  'clients.fee_schedule.edit.all': 'Editar evolução contratual de todos',
  'metrics.view.own': 'Ver métricas do próprio escopo',
  'metrics.view.all': 'Ver métricas de todos',
  'metrics.fill_week.own': 'Preencher semana do próprio escopo',
  'metrics.fill_week.all': 'Preencher semana de todos',
  'ranking.view.own': 'Ver ranking do próprio escopo',
  'ranking.view.all': 'Ver ranking geral',
  'gdv.view.own': 'Ver GDV do próprio escopo',
  'gdv.view.all': 'Ver todos os GDVs',
  'gdv.manage': 'Gerenciar GDVs',
  'projects.view.own': 'Ver projetos do próprio escopo',
  'projects.view.all': 'Ver todos os projetos',
  'projects.create': 'Criar projetos',
  'projects.edit.own': 'Editar projetos do próprio escopo',
  'projects.edit.all': 'Editar todos os projetos',
  'project_template.view': 'Ver Modelo Oficial',
  'project_template.edit': 'Editar Modelo Oficial',
  'tasks.view.own': 'Ver tarefas do próprio escopo',
  'tasks.view.all': 'Ver todas as tarefas',
  'tasks.create': 'Criar tarefas',
  'tasks.edit.own': 'Editar tarefas do próprio escopo',
  'tasks.edit.all': 'Editar todas as tarefas',
  'tasks.comment.own': 'Comentar tarefas do próprio escopo',
  'tasks.comment.all': 'Comentar todas as tarefas',
  'tasks.complete.own': 'Concluir próprias tarefas',
  'tasks.complete.any': 'Concluir qualquer tarefa',
  'squads.view.own': 'Ver squads vinculados',
  'squads.view.all': 'Ver todos os squads',
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
  return normalizePermissionList(Array.isArray(user?.permissions) ? user.permissions : []);
}

export function hasPermission(user, permission) {
  if (!permission) return false;
  if (isSuperAdmin(user)) return true;
  const perms = getUserPermissions(user);
  if (perms.includes('*') || perms.includes(permission)) return true;

  const scopedAlternatives = GENERIC_SCOPE_MAP[permission];
  if (scopedAlternatives?.some((item) => perms.includes(item))) return true;

  const base = basePermissionForScoped(permission);
  const all = allPermissionForScoped(permission);
  if (permission.endsWith('.own') && (perms.includes(base) || (all && perms.includes(all)))) return true;
  return false;
}

export function hasAnyPermission(user, permissions = []) {
  return permissions.some((permission) => hasPermission(user, permission));
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

export function canAccessClientRecord(user, client, allPermission = 'clients.view.all') {
  if (!client) return false;
  if (isAdminUser(user) || hasPermission(user, allPermission)) return true;
  const squadId = client.squadId || client.squad_id || '';
  return Boolean(squadId && getUserSquadIds(user).includes(squadId));
}

export function canEditClientRecord(user, client) {
  if (isAdminUser(user) || hasPermission(user, 'clients.edit.all')) return true;
  return hasPermission(user, 'clients.edit.own') && canAccessClientRecord(user, client, 'clients.edit.all');
}

export function canDeleteClientRecord(user, client) {
  return Boolean(client) && (isAdminUser(user) || hasPermission(user, 'clients.edit.all'));
}

export function canViewClientFeeScheduleRecord(user, client) {
  if (isAdminUser(user) || hasPermission(user, 'clients.fee_schedule.view.all')) return true;
  return hasPermission(user, 'clients.fee_schedule.view.own') && canAccessClientRecord(user, client, 'clients.fee_schedule.view.all');
}

export function canEditClientFeeScheduleRecord(user, client) {
  if (isAdminUser(user) || hasPermission(user, 'clients.fee_schedule.edit.all')) return true;
  return hasPermission(user, 'clients.fee_schedule.edit.own') && canAccessClientRecord(user, client, 'clients.fee_schedule.edit.all');
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
  if (isAdminUser(user) || hasPermission(user, 'squads.view.all')) return true;
  return getUserSquadIds(user).includes(squadId);
}

export const ROUTE_PERMISSION_MAP = [
  { path: '/', permission: 'central.view' },
  { path: '/clientes', permission: 'clients.view' },
  { path: '/projetos', permission: 'projects.view' },
  { path: '/preencher-semana', permission: 'metrics.view' },
  { path: '/gdv', permission: 'gdv.view' },
  { path: '/perfil', permission: 'profile.view' },
  { path: '/ranking-squads', permission: 'ranking.view' },
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
