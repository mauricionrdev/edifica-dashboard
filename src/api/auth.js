import { api } from './client.js';

export function login({ identifier, password }, opts) {
  return api.post('/auth/login', { identifier, password }, opts);
}

export function me(opts) {
  return api.get('/auth/me', opts);
}

export function updateProfile(body, opts) {
  return api.patch('/auth/profile', body, opts);
}

export function changePassword(body, opts) {
  return api.post('/auth/change-password', body, opts);
}

export function logout(opts) {
  return api.post('/auth/logout', undefined, opts);
}
