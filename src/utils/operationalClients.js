import { isActiveClientStatus } from './clientStatus.js';

function parseClientDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodEnd(year, month0) {
  return new Date(year, month0 + 1, 0, 23, 59, 59, 999);
}

export function isOperationalClientForPeriod(client, year, month0) {
  if (!client) return false;
  if (!isActiveClientStatus(client.status)) return false;

  const end = periodEnd(year, month0);
  const start = parseClientDate(
    client.startDate || client.start_date || client.createdAt || client.created_at
  );
  const churn = parseClientDate(client.churnDate || client.churn_date);

  if (start && start > end) return false;
  if (churn && churn <= end) return false;

  return true;
}

export function filterOperationalClientsForPeriod(clients, year, month0) {
  return (Array.isArray(clients) ? clients : []).filter((client) =>
    isOperationalClientForPeriod(client, year, month0)
  );
}
