// ================================================================
//  Auth endpoints
//  Contrato fiel ao backend (src/routes/auth.js):
//    POST /auth/login   { identifier, password }  -> { token, user }
//    GET  /auth/me                                -> { user }
//    POST /auth/logout                            -> { ok: true }
// ================================================================
import { api } from './client.js';

export function login({ identifier, password }) {
  return api.post('/auth/login', { identifier, password });
}

export function me() {
  return api.get('/auth/me');
}

export function logout() {
  return api.post('/auth/logout');
}
