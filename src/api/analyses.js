// ================================================================
//  Analyses endpoints
//  type: 'icp' | 'gdvanalise'
//
//    GET    /clients/:clientId/analyses/:type
//    POST   /clients/:clientId/analyses/:type
//    PUT    /clients/:clientId/analyses/:type/:analysisId
//    DELETE /clients/:clientId/analyses/:type/:analysisId
// ================================================================
import { api } from './client.js';

export function listAnalyses(clientId, type) {
  return api.get(
    `/clients/${encodeURIComponent(clientId)}/analyses/${encodeURIComponent(type)}`
  );
}

export function createAnalysis(clientId, type, body) {
  return api.post(
    `/clients/${encodeURIComponent(clientId)}/analyses/${encodeURIComponent(type)}`,
    body
  );
}

export function updateAnalysis(clientId, type, analysisId, patch) {
  return api.put(
    `/clients/${encodeURIComponent(clientId)}/analyses/${encodeURIComponent(type)}/${encodeURIComponent(analysisId)}`,
    patch
  );
}

export function deleteAnalysis(clientId, type, analysisId) {
  return api.del(
    `/clients/${encodeURIComponent(clientId)}/analyses/${encodeURIComponent(type)}/${encodeURIComponent(analysisId)}`
  );
}
