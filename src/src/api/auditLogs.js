import { api } from './client.js';

export function listAuditLogs({ action = 'all', entityType = 'all', limit = 80 } = {}) {
  const params = new URLSearchParams();
  if (action && action !== 'all') params.set('action', action);
  if (entityType && entityType !== 'all') params.set('entityType', entityType);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return api.get(`/audit-logs${query ? `?${query}` : ''}`);
}

export function listAuditLogFilters() {
  return api.get('/audit-logs/filters');
}
