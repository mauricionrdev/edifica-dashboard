import { api } from './client.js';

function withQuery(base, params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!entries.length) return base;
  const query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return `${base}?${query}`;
}

export function listSupportDailyRows(sheetId, params = {}) {
  return api.get(withQuery('/support/daily-program', { ...params, sheetId }));
}

export function createSupportDailySheet(body = {}) {
  return api.post('/support/daily-program/sheets', body);
}

export function updateSupportDailySheet(sheetId, patch = {}) {
  return api.patch(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}`, patch);
}

export function deleteSupportDailySheet(sheetId, params = {}) {
  return api.del(withQuery(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}`, params));
}

export function createSupportDailyColumn(body = {}) {
  return api.post('/support/daily-program/columns', body);
}

export function updateSupportDailyColumn(key, patch = {}) {
  return api.patch(`/support/daily-program/columns/${encodeURIComponent(key)}`, patch);
}

export function deleteSupportDailyColumn(key, params = {}) {
  return api.del(withQuery(`/support/daily-program/columns/${encodeURIComponent(key)}`, params));
}

export function createSupportDailyRow(body = {}) {
  return api.post('/support/daily-program', body);
}

export function updateSupportDailyRow(id, patch = {}) {
  return api.patch(`/support/daily-program/${encodeURIComponent(id)}`, patch);
}

export function deleteSupportDailyRow(id, params = {}) {
  return api.del(withQuery(`/support/daily-program/${encodeURIComponent(id)}`, params));
}



export function listSupportDailySheetShares(sheetId, params = {}) {
  return api.get(withQuery(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}/shares`, params));
}

export function createSupportDailySheetShare(sheetId, body = {}) {
  return api.post(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}/shares`, body);
}

export function updateSupportDailySheetShare(sheetId, shareId, patch = {}) {
  return api.patch(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}/shares/${encodeURIComponent(shareId)}`, patch);
}

export function deleteSupportDailySheetShare(sheetId, shareId, params = {}) {
  return api.del(withQuery(`/support/daily-program/sheets/${encodeURIComponent(sheetId)}/shares/${encodeURIComponent(shareId)}`, params));
}

export function listSupportTasks() {
  return api.get('/support/tasks');
}

export function createSupportTask(body = {}) {
  return api.post('/support/tasks', body);
}
