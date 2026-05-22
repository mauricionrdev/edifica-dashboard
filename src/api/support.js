import { api } from './client.js';

export function listSupportDailyRows() {
  return api.get('/support/daily-program');
}

export function createSupportDailyRow(body = {}) {
  return api.post('/support/daily-program', body);
}

export function updateSupportDailyRow(id, patch = {}) {
  return api.patch(`/support/daily-program/${encodeURIComponent(id)}`, patch);
}

export function deleteSupportDailyRow(id) {
  return api.del(`/support/daily-program/${encodeURIComponent(id)}`);
}

export function listSupportTasks() {
  return api.get('/support/tasks');
}

export function createSupportTask(body = {}) {
  return api.post('/support/tasks', body);
}
