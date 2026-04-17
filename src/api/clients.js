// ================================================================
//  Clients endpoints
//    GET /clients          -> { clients: [...] }
//    GET /clients/:id      -> { client }
//    (write ops ficam para próximas telas)
// ================================================================
import { api } from './client.js';

export function listClients() {
  return api.get('/clients');
}

export function getClient(id) {
  return api.get(`/clients/${encodeURIComponent(id)}`);
}
