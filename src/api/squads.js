// ================================================================
//  Squads endpoints
//    GET /squads    -> { squads: [{ id, name, createdAt, updatedAt }] }
// ================================================================
import { api } from './client.js';

export function listSquads() {
  return api.get('/squads');
}
