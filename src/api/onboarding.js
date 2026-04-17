// ================================================================
//  Onboarding endpoints
//    GET /clients/:clientId/onboarding  -> { onboarding: { sections } }
//    PUT /clients/:clientId/onboarding  -> { onboarding: { sections } }
//
//  O PUT substitui o array inteiro. Fluxo típico: carregar, mutar local,
//  persistir com PUT. O backend não tem endpoints granulares (toggle
//  task, add task etc.) - essa responsabilidade é do cliente.
// ================================================================
import { api } from './client.js';

export function getOnboarding(clientId) {
  return api.get(`/clients/${encodeURIComponent(clientId)}/onboarding`);
}

export function saveOnboarding(clientId, sections) {
  return api.put(`/clients/${encodeURIComponent(clientId)}/onboarding`, {
    sections,
  });
}
