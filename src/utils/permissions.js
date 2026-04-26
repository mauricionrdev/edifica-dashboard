import { ROLES, isAdminUser, isSuperAdmin } from './roles.js';

export const ROLE_PERMISSION_MAP = {
  ceo: ['*'],
  suporte_tecnologia: ['*'],
  admin: [
    'central.view',
    'clients.view', 'clients.create', 'clients.edit', 'clients.fee_schedule.view', 'clients.fee_schedule.edit',
    'metrics.view', 'metrics.fill_week',
    'gdv.view',
    'squads.view', 'squads.manage',
    'team.view', 'team.manage',
    'audit.view',
    'projects.view', 'projects.create', 'projects.edit',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.comment', 'tasks.complete.own', 'tasks.complete.any',
    'profile.view', 'profile.edit',
  ],
  gdv: [
    'central.view', 'clients.view', 'clients.fee_schedule.view', 'gdv.view', 'squads.view',
    'metrics.view', 'onboarding.view', 'onboarding.complete.own', 'profile.view', 'profile.edit',
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
  { area: 'GDV', permissions: ['gdv.view'] },
  { area: 'Projetos', permissions: ['projects.view', 'projects.create', 'projects.edit'] },
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
  'clients.fee_schedule.view': 'Ver evolucao contratual',
  'clients.fee_schedule.edit': 'Editar evolucao contratual',
  'metrics.view': 'Ver métricas',
  'metrics.fill_week': 'Preencher semana',
  'gdv.view': 'Acessar GDV',
  'projects.view': 'Ver projetos',
  'projects.create': 'Criar projetos',
  'projects.edit': 'Editar projetos',
  'tasks.view': 'Ver tarefas',
  'tasks.create': 'Criar tarefas',
  'tasks.edit': 'Editar tarefas',
  'tasks.comment': 'Comentar tarefas',
  'tasks.complete.own': 'Concluir prÃ³prias tarefas',
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


export function canViewProfile(user) {
  return isAdminUser(user) || hasPermission(user, 'profile.view');
}

export function canEditProfile(user) {
  return isAdminUser(user) || hasPermission(user, 'profile.edit');
}

export function canAccessSquad(user, squadId) {
  if (!squadId) return false;
  if (isAdminUser(user) || hasPermission(user, 'squads.view')) return true;
  return getUserSquadIds(user).includes(squadId);
}

export function permissionLabel(key) {
  return PERMISSION_LABELS[key] || key;
}
