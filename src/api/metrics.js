// ================================================================
//  Weekly metrics endpoints
//    GET /metrics/:clientId -> { metrics: [...] }
// ================================================================
import { api } from './client.js';

export function listClientMetrics(clientId) {
  return api.get(`/metrics/${encodeURIComponent(clientId)}`);
}
