import { api } from './client.js';

export function login({ identifier, password }) {
  return api.post('/auth/login', { identifier, password });
}

export function me() {
  return api.get('/auth/me');
}

export function updateProfile(body) {
  return api.patch('/auth/profile', body);
}

export function changePassword(body) {
  return api.post('/auth/change-password', body);
}

export function logout() {
  return api.post('/auth/logout');
}
