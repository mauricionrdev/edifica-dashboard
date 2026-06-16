// ================================================================
//  Squads endpoints
//    GET    /squads       -> { squads: [{ id, name, createdAt, updatedAt }] }
//    POST   /squads       -> { squad }      (admin only)
//    PUT    /squads/:id   -> { squad }      (admin only)
//    DELETE /squads/:id   -> { ok: true }   (admin only)
// ================================================================
import { api } from './client.js';

export function listSquads() {
  return api.get('/squads');
}

export function createSquad(body) {
  return api.post('/squads', body);
}

export function updateSquad(id, body) {
  return api.put(`/squads/${encodeURIComponent(id)}`, body);
}

export function deleteSquad(id) {
  return api.del(`/squads/${encodeURIComponent(id)}`);
}
