
import { api } from './client.js';

export function createAccessRequest(payload) {
  return api.post('/access-requests', payload);
}

export function listAccessRequests(status = 'all') {
  return api.get(`/access-requests?status=${encodeURIComponent(status)}`);
}

export function updateAccessRequest(id, payload) {
  return api.patch(`/access-requests/${id}`, payload);
}
