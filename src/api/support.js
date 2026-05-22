import { api } from './client.js';

export function listSupportDailyRows(sheetId) {
  const suffix = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : '';
  return api.get(`/support/daily-program${suffix}`);
}

export function createSupportDailySheet(body = {}) {
  return api.post('/support/daily-program/sheets', body);
}

export function updateSupportDailySheet(sheetId, patch = {}) {
  return api.patch(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}`, patch);
}

export function deleteSupportDailySheet(sheetId) {
  return api.del(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}`);
}

export function createSupportDailyColumn(body = {}) {
  return api.post('/support/daily-program/columns', body);
}

export function updateSupportDailyColumn(key, patch = {}) {
  return api.patch(`/support/daily-program/columns/${encodeURIComponent(key)}`, patch);
}

export function deleteSupportDailyColumn(key) {
  return api.del(`/support/daily-program/columns/${encodeURIComponent(key)}`);
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
