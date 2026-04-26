// ================================================================
//  Clients endpoints
//    GET    /clients          -> { clients: [...] }
//    GET    /clients/:id      -> { client }
//    POST   /clients          -> { client }            (body parcial; name obrigatório)
//    PUT    /clients/:id      -> { client }            (patch parcial)
//    DELETE /clients/:id      -> { ok: true }          (admin-only no backend)
//
//  Todos os corpos seguem o contrato do backend (src/routes/clients.js):
//    name, squadId, gdvName, gestor, status, fee, metaLucro,
//    startDate, endDate.
// ================================================================
import { api } from './client.js';

export function listClients() {
  return api.get('/clients');
}

export function getClient(id) {
  return api.get(`/clients/${encodeURIComponent(id)}`);
}

export function createClient(body) {
  return api.post('/clients', body);
}

export function updateClient(id, patch) {
  return api.put(`/clients/${encodeURIComponent(id)}`, patch);
}

export function listClientFeeSteps(id) {
  return api.get(`/clients/${encodeURIComponent(id)}/fee-steps`);
}

export function updateClientFeeSteps(id, feeSteps) {
  return api.put(`/clients/${encodeURIComponent(id)}/fee-steps`, { feeSteps });
}

export function deleteClient(id) {
  return api.del(`/clients/${encodeURIComponent(id)}`);
}
