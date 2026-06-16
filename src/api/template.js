// ================================================================
//  Template (Modelo Oficial) endpoints
//    GET  /template             autenticado
//    PUT  /template              admin only  { sections: [...] }
//    POST /template/reset        admin only  restaura padrão
// ================================================================
import { api } from './client.js';

export function getTemplate() {
  return api.get('/template');
}

export function saveTemplate(sections) {
  return api.put('/template', { sections });
}

export function resetTemplate() {
  return api.post('/template/reset');
}
