export const CLIENT_STATUS = {
  ACTIVE: 'active',
  ONBOARDING: 'onboarding',
  RAMPAGE: 'rampagem_comercial',
  PAUSED: 'paused',
  CHURN: 'churn',
  FINISHED: 'finished',
};

export const CLIENT_STATUS_OPTIONS = [
  { value: CLIENT_STATUS.ACTIVE, label: 'Ativo' },
  { value: CLIENT_STATUS.ONBOARDING, label: 'Onboard' },
  { value: CLIENT_STATUS.RAMPAGE, label: 'Rampagem Comercial' },
  { value: CLIENT_STATUS.PAUSED, label: 'Pausado' },
  { value: CLIENT_STATUS.CHURN, label: 'Churn / Cancelado' },
  { value: CLIENT_STATUS.FINISHED, label: 'Finalizado' },
];

export function normalizeClientStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  const slug = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (slug === 'ativo' || slug === CLIENT_STATUS.ACTIVE) return CLIENT_STATUS.ACTIVE;
  if (slug === 'onboard' || slug === CLIENT_STATUS.ONBOARDING) return CLIENT_STATUS.ONBOARDING;
  if (slug === 'rampagem' || slug === CLIENT_STATUS.RAMPAGE || slug === 'rampage') return CLIENT_STATUS.RAMPAGE;
  if (slug === 'pausado' || slug === CLIENT_STATUS.PAUSED) return CLIENT_STATUS.PAUSED;
  if (slug === 'cancelado' || slug === CLIENT_STATUS.CHURN) return CLIENT_STATUS.CHURN;
  if (slug === 'finalizado' || slug === 'encerrado' || slug === 'concluido' || slug === CLIENT_STATUS.FINISHED) return CLIENT_STATUS.FINISHED;

  return Object.values(CLIENT_STATUS).includes(slug) ? slug : CLIENT_STATUS.ACTIVE;
}

export function isActiveClientStatus(status) {
  return normalizeClientStatus(status) === CLIENT_STATUS.ACTIVE;
}

export function isRevenueClientStatus(status) {
  const normalized = normalizeClientStatus(status);
  return normalized === CLIENT_STATUS.ACTIVE
    || normalized === CLIENT_STATUS.ONBOARDING
    || normalized === CLIENT_STATUS.RAMPAGE;
}

export function isVisibleClientStatus() {
  return true;
}

export function isInactiveClientStatus(status) {
  return !isActiveClientStatus(status);
}
