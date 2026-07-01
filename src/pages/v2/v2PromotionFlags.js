const truthy = (value) => String(value || '').trim().toLowerCase() === 'true';

export const V2_PROMOTION_FLAGS = {
  clients: {
    key: 'clients',
    label: 'Clientes V2',
    env: 'VITE_PROMOTE_CLIENTES_V2',
    enabled: truthy(import.meta.env.VITE_PROMOTE_CLIENTES_V2),
  },
  traffic: {
    key: 'traffic',
    label: 'Gestão de Tráfego V2',
    env: 'VITE_PROMOTE_GESTAO_TRAFEGO_V2',
    enabled: truthy(import.meta.env.VITE_PROMOTE_GESTAO_TRAFEGO_V2),
  },
  model: {
    key: 'model',
    label: 'Modelo Oficial V2',
    env: 'VITE_PROMOTE_MODELO_OFICIAL_V2',
    enabled: truthy(import.meta.env.VITE_PROMOTE_MODELO_OFICIAL_V2),
  },
  profile: {
    key: 'profile',
    label: 'Perfil V2',
    env: 'VITE_PROMOTE_PERFIL_V2',
    enabled: truthy(import.meta.env.VITE_PROMOTE_PERFIL_V2),
  },
  team: {
    key: 'team',
    label: 'Equipe V2',
    env: 'VITE_PROMOTE_EQUIPE_V2',
    enabled: truthy(import.meta.env.VITE_PROMOTE_EQUIPE_V2),
  },
  projects: {
    key: 'projects',
    label: 'Projetos V2',
    env: 'VITE_PROMOTE_PROJETOS_V2',
    enabled: truthy(import.meta.env.VITE_PROMOTE_PROJETOS_V2),
  },
};

export function isV2RoutePromoted(key) {
  return Boolean(V2_PROMOTION_FLAGS[key]?.enabled);
}

export function v2PromotionFlagList() {
  return Object.values(V2_PROMOTION_FLAGS);
}

export function enabledV2PromotionFlags() {
  return v2PromotionFlagList().filter((flag) => flag.enabled);
}
