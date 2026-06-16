import { api } from './client.js';

function buildQuery({ start, end, force } = {}) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (force) params.set('force', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getOpenAIUsageReport({ start, end, force } = {}) {
  return api.get(`/openai-usage/report${buildQuery({ start, end, force })}`);
}

export function refreshOpenAIUsageReport({ start, end } = {}) {
  return api.post(`/openai-usage/refresh${buildQuery({ start, end })}`, {});
}

export function listOpenAIProjects() {
  return api.get('/openai-usage/projects');
}

export function syncOpenAIProjects() {
  return api.post('/openai-usage/sync-projects', {});
}
