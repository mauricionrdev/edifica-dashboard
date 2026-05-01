export const CLIENT_STATUS = {
  ACTIVE: 'active',
  ONBOARDING: 'onboarding',
  PAUSED: 'paused',
  CHURN: 'churn',
};

export const CLIENT_STATUS_OPTIONS = [
  { value: CLIENT_STATUS.ACTIVE, label: 'Ativo' },
  { value: CLIENT_STATUS.ONBOARDING, label: 'Onboard' },
  { value: CLIENT_STATUS.PAUSED, label: 'Pausado' },
  { value: CLIENT_STATUS.CHURN, label: 'Churn / Cancelado' },
];

export function normalizeClientStatus(status) {
  const value = String(status || '').trim();
  return Object.values(CLIENT_STATUS).includes(value) ? value : CLIENT_STATUS.ACTIVE;
}

export function isActiveClientStatus(status) {
  return normalizeClientStatus(status) === CLIENT_STATUS.ACTIVE;
}

export function isInactiveClientStatus(status) {
  return !isActiveClientStatus(status);
}
