import { api } from './client.js';

export function listUsers() {
  return api.get('/users');
}

export function listUserDirectory() {
  return api.get('/users/directory');
}

export function createUser(body) {
  return api.post('/users', body);
}

export function updateUser(id, body) {
  return api.put(`/users/${encodeURIComponent(id)}`, body);
}

export function toggleUserActive(id) {
  return api.patch(`/users/${encodeURIComponent(id)}/toggle`);
}

export function deleteUser(id) {
  return api.del(`/users/${encodeURIComponent(id)}`);
}

export function resetUserPassword(id, body = {}) {
  return api.post(`/users/${encodeURIComponent(id)}/reset-password`, body);
}
