const ROUTE_META = [
  {
    match: (pathname) => pathname === '/',
    title: 'Dashboard',
    crumb: 'Dashboard',
  },
  {
    match: (pathname) => pathname.startsWith('/clientes'),
    title: 'Clientes',
    crumb: 'Clientes',
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
