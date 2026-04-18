// ================================================================
//  Metrics endpoints
//    GET /metrics/:clientId                -> { metrics: [...] }
//    GET /metrics/:clientId/:periodKey     -> { metric }
//    PUT /metrics/:clientId/:periodKey     -> { metric }
//
//  periodKey = 'YYYY-MM-Sw' (ex: '2026-04-S2')
//
//  O PUT espera body { data: {...} } e o backend faz merge + recomputa
//  agregados derivados (leadsPrevistos, taxa, contratosPrevistos,
//  isHit, weekStatus). Então o GdvPage pode confiar no campo `computed`
//  que vem nas respostas.
// ================================================================
import { api } from './client.js';

export function listClientMetrics(clientId) {
  return api.get(`/metrics/${encodeURIComponent(clientId)}`);
}

export function getMetric(clientId, periodKey) {
  return api.get(
    `/metrics/${encodeURIComponent(clientId)}/${encodeURIComponent(periodKey)}`
  );
}

export function upsertMetric(clientId, periodKey, data) {
  return api.put(
    `/metrics/${encodeURIComponent(clientId)}/${encodeURIComponent(periodKey)}`,
    { data }
  );
}
