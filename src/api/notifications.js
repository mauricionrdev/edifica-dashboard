import { API_BASE_URL, api } from './client.js';

export function listNotifications({ status = 'all', limit = 40 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return api.get(`/notifications${qs ? `?${qs}` : ''}`);
}

export function getNotificationsSummary() {
  return api.get('/notifications/summary');
}

export function markNotificationRead(id) {
  return api.patch(`/notifications/${encodeURIComponent(id)}/read`, {});
}

export function markAllNotificationsRead() {
  return api.post('/notifications/read-all', {});
}

export function createNotificationsStream() {
  if (!API_BASE_URL || typeof EventSource === 'undefined') return null;
  return new EventSource(`${API_BASE_URL}/notifications/stream`, { withCredentials: true });
}
