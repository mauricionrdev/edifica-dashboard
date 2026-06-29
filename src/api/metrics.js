// ================================================================
//  Metrics endpoints
//    GET /metrics/summary              -> { weekKey, monthPrefix, clients, totals }
//    GET /metrics/summary/history      -> { months: [...] }
//    GET /metrics/:clientId            -> { metrics: [...] }
//    GET /metrics/:clientId/:periodKey -> { metric }
//    PUT /metrics/:clientId/:periodKey -> { metric }
//
//  periodKey = 'YYYY-MM-Sw' (ex: '2026-04-S2')
// ================================================================
import { api } from './client.js';

/**
 * Sumário de contratos fechados e metas para todos os clientes ativos.
 * @param {Object} opts
 * @param {string} [opts.date]     - YYYY-MM-DD (default: hoje no servidor)
 * @param {string} [opts.squadId]  - filtra por squad
 * @param {string} [opts.clientId] - filtra por um único cliente (Fase 1.1)
 */
export function getContractsSummary({ date, squadId, clientId } = {}, opts) {
  const params = new URLSearchParams();
  if (date)     params.set('date',     date);
  if (squadId)  params.set('squadId',  squadId);
  if (clientId) params.set('clientId', clientId);
  const qs = params.toString();
  return api.get(`/metrics/summary${qs ? `?${qs}` : ''}`, opts);
}

/**
 * Histórico mensal de contratos fechados + metas.
 * @param {Object} opts
 * @param {number} [opts.months]   - quantos meses (default 6)
 * @param {string} [opts.date]     - YYYY-MM-DD de referência
 * @param {string} [opts.squadId]  - filtra por squad
 * @param {string} [opts.clientId] - filtra por um único cliente (Fase 1.1)
 */
export function getContractsHistory({ months, date, squadId, clientId } = {}) {
  const params = new URLSearchParams();
  if (months)   params.set('months',   months);
  if (date)     params.set('date',     date);
  if (squadId)  params.set('squadId',  squadId);
  if (clientId) params.set('clientId', clientId);
  const qs = params.toString();
  return api.get(`/metrics/summary/history${qs ? `?${qs}` : ''}`);
}




export function getTrafficManagement({ date, gestor } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (gestor) params.set('gestor', gestor);
  const qs = params.toString();
  return api.get(`/metrics/traffic-management${qs ? `?${qs}` : ''}`);
}

export function getTrafficRankingSettings() {
  return api.get('/metrics/traffic-ranking/settings');
}

export function updateTrafficRankingSettings(data = {}) {
  return api.put('/metrics/traffic-ranking/settings', data);
}

export function getSquadRanking({ date, squadId } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (squadId) params.set('squadId', squadId);
  const qs = params.toString();
  return api.get(`/metrics/ranking${qs ? `?${qs}` : ''}`);
}

export function getGdvRanking({ date, gdvId } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (gdvId) params.set('gdvId', gdvId);
  const qs = params.toString();
  return api.get(`/metrics/ranking/gdvs${qs ? `?${qs}` : ''}`);
}

export function getRankingSettings() {
  return api.get('/metrics/ranking/settings');
}

export function getDashboardTargets({ month } = {}) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  const qs = params.toString();
  return api.get(`/metrics/dashboard/targets${qs ? `?${qs}` : ''}`);
}

export function updateDashboardTargets(data = {}) {
  return api.put('/metrics/dashboard/targets', data);
}

export function getSquadRankingChampions() {
  return api.get('/metrics/ranking/champions');
}

export function updateRankingSettings(data) {
  return api.put('/metrics/ranking/settings', data);
}

export function listClientMetrics(clientId) {
  return api.get(`/metrics/${encodeURIComponent(clientId)}`);
}

export function getMetric(clientId, periodKey, opts) {
  return api.get(
    `/metrics/${encodeURIComponent(clientId)}/${encodeURIComponent(periodKey)}`,
    opts
  );
}

export function upsertMetric(clientId, periodKey, data) {
  return api.put(
    `/metrics/${encodeURIComponent(clientId)}/${encodeURIComponent(periodKey)}`,
    { data }
  );
}

export function listMetricPresence({ clientIds = [], periodKey } = {}) {
  const params = new URLSearchParams();
  if (periodKey) params.set('periodKey', periodKey);
  if (Array.isArray(clientIds) && clientIds.length) params.set('clientIds', clientIds.join(','));
  const qs = params.toString();
  return api.get(`/metrics/presence${qs ? `?${qs}` : ''}`);
}

export function touchMetricPresence(clientId, periodKey, fieldKey) {
  return api.post('/metrics/presence', { clientId, periodKey, fieldKey });
}

export function clearMetricPresence(clientId, periodKey, fieldKey) {
  return api.del('/metrics/presence', {
    body: { clientId, periodKey, fieldKey },
  });
}

export function listMetricCampaigns({ clientIds = [], periodKey } = {}) {
  const params = new URLSearchParams();
  if (periodKey) params.set('periodKey', periodKey);
  if (Array.isArray(clientIds) && clientIds.length) params.set('clientIds', clientIds.join(','));
  const qs = params.toString();
  return api.get(`/metrics/campaigns${qs ? `?${qs}` : ''}`);
}

export function createMetricCampaign({ clientId, periodKey, name } = {}) {
  return api.post('/metrics/campaigns', { clientId, periodKey, name });
}

export function deleteMetricCampaign(campaignId) {
  return api.del(`/metrics/campaigns/${encodeURIComponent(campaignId)}`);
}
