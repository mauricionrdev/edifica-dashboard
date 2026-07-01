const ROUTE_META = [
  {
    match: (pathname) => pathname.startsWith('/v2/suporte-tecnologia'),
    title: 'Suporte TI V2',
    crumb: 'Suporte V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/workspace'),
    title: 'Workspace V2',
    crumb: 'Workspace V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/perfil'),
    title: 'Perfil V2',
    crumb: 'Perfil V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/projetos'),
    title: 'Projetos V2',
    crumb: 'Projetos V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/visao-geral'),
    title: 'Central V2',
    crumb: 'V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/gdvs'),
    title: 'GDVs V2',
    crumb: 'GDVs V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/squads'),
    title: 'Squads V2',
    crumb: 'Squads V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/preencher-semana'),
    title: 'Preencher Semana V2',
    crumb: 'Semana V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/rankings'),
    title: 'Rankings V2',
    crumb: 'Rankings V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/retencao'),
    title: 'Retenção V2',
    crumb: 'Retenção V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/dashboard'),
    title: 'Dashboard V2',
    crumb: 'Dashboard V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/gestao-trafego'),
    title: 'Gestão de Tráfego V2',
    crumb: 'Tráfego V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/equipe'),
    title: 'Equipe V2',
    crumb: 'Equipe V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/modelo-oficial'),
    title: 'Modelo Oficial V2',
    crumb: 'Modelo V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/clientes'),
    title: 'Clientes V2',
    crumb: 'Clientes V2',
  },
  {
    match: (pathname) => pathname.startsWith('/v2/plano-migracao'),
    title: 'Migração segura',
    crumb: 'V2',
  },
  {
    match: (pathname) => pathname.startsWith('/dashboard/indicadores-por-squad'),
    title: 'Indicadores por Squad',
    crumb: 'Indicadores por Squad',
  },
  {
    match: (pathname) => pathname === '/',
    title: 'Dashboard',
    crumb: 'Dashboard',
  },
  {
    match: (pathname) => pathname.startsWith('/design-lab/dashboard'),
    title: 'Dashboard',
    crumb: 'Dashboard',
  },
  {
    match: (pathname) => pathname.startsWith('/design-lab/clientes'),
    title: 'Clientes',
    crumb: 'Clientes',
  },
  {
    match: (pathname) => pathname.startsWith('/design-lab/preencher-semana'),
    title: 'Preencher Semana',
    crumb: 'Preencher Semana',
  },
  {
    match: (pathname) => pathname.startsWith('/clientes'),
    title: 'Clientes',
    crumb: 'Clientes',
  },
  {
    match: (pathname) => pathname.startsWith('/suporte-tecnologia'),
    title: 'Suporte de tecnologia',
    crumb: 'Suporte TI',
  },
  {
    match: (pathname) => pathname.startsWith('/preencher-semana'),
    title: 'Preencher Semana',
    crumb: 'Preencher Semana',
  },
  {
    match: (pathname) => pathname.startsWith('/projetos'),
    title: 'Projetos',
    crumb: 'Projetos',
  },
  {
    match: (pathname) => pathname.startsWith('/gdv'),
    title: 'GDV',
    crumb: 'GDV',
  },
  {
    match: (pathname) => pathname.startsWith('/perfil'),
    title: 'Perfil',
    crumb: 'Perfil',
  },
  {
    match: (pathname) => pathname.startsWith('/squads'),
    title: 'Squad',
    crumb: 'Squad',
  },
  {
    match: (pathname) => pathname.startsWith('/ranking-squads'),
    title: 'Ranking de Squads',
    crumb: 'Ranking',
  },
  {
    match: (pathname) => pathname.startsWith('/ranking-gdvs'),
    title: 'Ranking de GDVs',
    crumb: 'Ranking GDV',
  },
  {
    match: (pathname) => pathname.startsWith('/gestao-trafego'),
    title: 'Gestão de Tráfego',
    crumb: 'Gestão de Tráfego',
  },
  {
    match: (pathname) => pathname.startsWith('/equipe'),
    title: 'Equipe & Acessos',
    crumb: 'Equipe',
  },
  {
    match: (pathname) => pathname.startsWith('/modelo-oficial'),
    title: 'Modelo Oficial',
    crumb: 'Modelo Oficial',
  },
  {
    match: (pathname) => pathname.startsWith('/acesso-negado'),
    title: 'Acesso negado',
    crumb: 'Acesso negado',
  },
];

const DEFAULT_ROUTE_META = {
  title: 'Dashboard',
  crumb: 'Dashboard',
  description: null,
  actions: null,
};

export function getRouteMeta(pathname = '/') {
  const item = ROUTE_META.find((entry) => entry.match(pathname));
  return {
    ...DEFAULT_ROUTE_META,
    ...(item || {}),
    description: null,
    actions: null,
  };
}

export function getRoutePanelHeader(pathname = '/') {
  const meta = getRouteMeta(pathname);
  return {
    title: meta.title,
    description: null,
    actions: null,
  };
}

export function getRouteCrumbLabel(pathname = '/') {
  return getRouteMeta(pathname).crumb;
}
