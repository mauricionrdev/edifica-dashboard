import { api } from './client.js';

export function listGdvs() {
  return api.get('/gdvs');
}

export function createGdv(body) {
  return api.post('/gdvs', body);
}

export function updateGdv(id, body) {
  return api.put(`/gdvs/${encodeURIComponent(id)}`, body);
}

export function deleteGdv(id) {
  return api.del(`/gdvs/${encodeURIComponent(id)}`);
}
