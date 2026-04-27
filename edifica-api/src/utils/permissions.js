export const ROLE_PERMISSIONS = {
  ceo: ["*"],
  suporte_tecnologia: ["*"],
  admin: [
    "central.view",
    "clients.view","clients.create","clients.edit","clients.fee_schedule.view","clients.fee_schedule.edit",
    "metrics.view","metrics.fill_week",
    "gdv.view","gdv.manage",
    "squads.view","squads.manage",
    "team.view","team.manage",
    "audit.view",
    "projects.view","projects.create","projects.edit","project_template.view","project_template.edit",
    "tasks.view","tasks.create","tasks.edit","tasks.comment","tasks.complete.own","tasks.complete.any",
    "profile.view","profile.edit",
  ],
  gdv: [
    "central.view","clients.view","clients.fee_schedule.view","gdv.view","squads.view",
    "metrics.view","profile.view","profile.edit",
    "projects.view","tasks.view","tasks.create","tasks.comment","tasks.complete.own",
  ],
  gestor: [
    "central.view","clients.view","clients.fee_schedule.view","metrics.view","metrics.fill_week",
    "projects.view","projects.create","projects.edit",
    "tasks.view","tasks.create","tasks.edit","tasks.comment","tasks.complete.own","tasks.complete.any",
    "profile.view","profile.edit","squads.view",
  ],
  cap: [
    "central.view","clients.view","clients.fee_schedule.view","metrics.view","metrics.fill_week",
    "projects.view","tasks.view","tasks.create","tasks.comment","tasks.complete.own",
  ],
};

export const PERMISSION_GROUPS = [
  { area: 'Central', permissions: ['central.view'] },
  { area: 'Clientes', permissions: ['clients.view','clients.create','clients.edit','clients.fee_schedule.view','clients.fee_schedule.edit'] },
  { area: 'Preencher Semana', permissions: ['metrics.view','metrics.fill_week'] },
  { area: 'GDV', permissions: ['gdv.view','gdv.manage'] },
  { area: 'Projetos', permissions: ['projects.view','projects.create','projects.edit','project_template.view','project_template.edit'] },
  { area: 'Tarefas', permissions: ['tasks.view','tasks.create','tasks.edit','tasks.comment','tasks.complete.own','tasks.complete.any'] },
  { area: 'Squads', permissions: ['squads.view','squads.manage'] },
  { area: 'Equipe & Acessos', permissions: ['team.view','team.manage'] },
  { area: 'Auditoria', permissions: ['audit.view'] },
  { area: 'Perfil', permissions: ['profile.view','profile.edit'] },
];

export function resolvePermissions(role, override = []) {
  const base = ROLE_PERMISSIONS[role] || [];
  if (base.includes('*')) return ['*'];
  const extra = Array.isArray(override) ? override.filter(Boolean) : [];
  return Array.from(new Set([...base, ...extra]));
}

export function hasPermission(user, permission) {
  if (!user || !permission) return false;
  const perms = Array.isArray(user.permissions) ? user.permissions : resolvePermissions(user.role, user.permissionsOverride);
  return perms.includes('*') || perms.includes(permission);
}
