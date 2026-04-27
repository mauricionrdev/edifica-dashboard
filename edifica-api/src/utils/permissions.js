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

export const ROLE_PERMISSIONS = {
  ceo: ['*'],
  suporte_tecnologia: ['*'],
  admin: [
    'central.view',
    'clients.view.all','clients.create','clients.edit.all','clients.fee_schedule.view.all','clients.fee_schedule.edit.all',
    'metrics.view.all','metrics.fill_week.all','ranking.view.all',
    'gdv.view.all','gdv.manage',
    'squads.view.all','squads.manage',
    'team.view','team.manage',
    'audit.view',
    'projects.view.all','projects.create','projects.edit.all','project_template.view','project_template.edit',
    'tasks.view.all','tasks.create','tasks.edit.all','tasks.comment.all','tasks.complete.own','tasks.complete.any',
    'profile.view','profile.edit',
  ],
  gdv: [
    'central.view','clients.view.own','clients.fee_schedule.view.own','gdv.view.own','squads.view.own',
    'metrics.view.own','ranking.view.own','profile.view','profile.edit',
    'projects.view.own','tasks.view.own','tasks.create','tasks.comment.own','tasks.complete.own',
  ],
  gestor: [
    'central.view','clients.view.all','clients.fee_schedule.view.all','metrics.view.all','metrics.fill_week.all','ranking.view.all',
    'projects.view.all','projects.create','projects.edit.all',
    'tasks.view.all','tasks.create','tasks.edit.all','tasks.comment.all','tasks.complete.own','tasks.complete.any',
    'profile.view','profile.edit','squads.view.all',
  ],
  cap: [
    'central.view','clients.view.own','clients.fee_schedule.view.own','metrics.view.own','metrics.fill_week.own','ranking.view.own',
    'projects.view.own','tasks.view.own','tasks.create','tasks.comment.own','tasks.complete.own','squads.view.own',
  ],
};

export const PERMISSION_GROUPS = [
  { area: 'Central', permissions: ['central.view'] },
  { area: 'Clientes', permissions: ['clients.view.own','clients.view.all','clients.create','clients.edit.own','clients.edit.all','clients.fee_schedule.view.own','clients.fee_schedule.view.all','clients.fee_schedule.edit.own','clients.fee_schedule.edit.all'] },
  { area: 'Métricas', permissions: ['metrics.view.own','metrics.view.all','metrics.fill_week.own','metrics.fill_week.all'] },
  { area: 'Ranking', permissions: ['ranking.view.own','ranking.view.all'] },
  { area: 'GDV', permissions: ['gdv.view.own','gdv.view.all','gdv.manage'] },
  { area: 'Projetos', permissions: ['projects.view.own','projects.view.all','projects.create','projects.edit.own','projects.edit.all','project_template.view','project_template.edit'] },
  { area: 'Tarefas', permissions: ['tasks.view.own','tasks.view.all','tasks.create','tasks.edit.own','tasks.edit.all','tasks.comment.own','tasks.comment.all','tasks.complete.own','tasks.complete.any'] },
  { area: 'Squads', permissions: ['squads.view.own','squads.view.all','squads.manage'] },
  { area: 'Equipe & Acessos', permissions: ['team.view','team.manage'] },
  { area: 'Auditoria', permissions: ['audit.view'] },
  { area: 'Perfil', permissions: ['profile.view','profile.edit'] },
];

export function resolvePermissions(role, override = []) {
  const base = ROLE_PERMISSIONS[role] || [];
  if (base.includes('*')) return ['*'];
  const extra = normalizePermissionList(override);
  return Array.from(new Set([...base, ...extra]));
}

export function hasPermission(user, permission) {
  if (!user || !permission) return false;
  const perms = Array.isArray(user.permissions) ? normalizePermissionList(user.permissions) : resolvePermissions(user.role, user.permissionsOverride);
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
