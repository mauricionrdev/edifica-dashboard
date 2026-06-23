import { api } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listRouteMeetings(params, opts) {
  return api.get(`/route-meetings${toQuery(params)}`, opts);
}

export function createRouteMeeting(body) {
  return api.post('/route-meetings', body);
}

export function updateRouteMeeting(id, patch) {
  return api.put(`/route-meetings/${encodeURIComponent(id)}`, patch);
}

export function deleteRouteMeeting(id) {
  return api.del(`/route-meetings/${encodeURIComponent(id)}`);
}
