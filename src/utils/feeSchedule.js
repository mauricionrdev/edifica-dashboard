import { parseLocaleNumber } from './number.js';

function monthKeyFromDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizedSteps(client) {
  const steps = Array.isArray(client?.feeSteps) ? client.feeSteps : [];
  return sortFeeSteps(steps);
}

function normalizeFeeType(value) {
  return String(value || '').trim() === 'single' ? 'single' : 'recurring';
}


function normalizeContractType(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'tcv' || raw === 'single' || raw === 'one_time' || raw === 'valor_total'
    ? 'tcv'
    : 'recurring';
}

function parseClientDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value || '').slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveContractDurationMonths(client) {
  const start = parseClientDate(
    client?.startDate || client?.start_date || client?.createdAt || client?.created_at
  );
  const end = parseClientDate(client?.endDate || client?.end_date);
  if (!start || !end || end <= start) return 1;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() > start.getDate()) months += 1;
  return Math.max(1, months);
}

export function resolveTcvMonthlyFee(client) {
  const contractType = normalizeContractType(client?.contractType || client?.contract_type);
  if (contractType !== 'tcv' && client?.isTcv !== true) return null;

  const total = parseLocaleNumber(client?.baseFee ?? client?.base_fee ?? client?.fee, 0);
  if (!Number.isFinite(total) || total <= 0) return 0;

  const months = resolveContractDurationMonths(client);
  return Number((total / months).toFixed(2));
}

export function sortFeeSteps(steps = []) {
  return [...(Array.isArray(steps) ? steps : [])]
    .map((step) => {
      const month = monthKeyFromDate(step?.month || step?.referenceMonth || step?.competence || step?.startDate);
      return {
        ...step,
        month,
        type: normalizeFeeType(step?.type || step?.kind || step?.mode),
        fee: step?.fee ?? step?.amount ?? 0,
      };
    })
    .filter((step) => step.month)
    .sort((a, b) => String(a.month || '').localeCompare(String(b.month || '')));
}

export function clientHasFeeSchedule(client) {
  return normalizedSteps(client).length > 0;
}

export function resolveClientFeeStepAtDate(client, referenceDate = new Date()) {
  const referenceMonth = monthKeyFromDate(referenceDate);
  if (!referenceMonth) return null;

  const steps = normalizedSteps(client);
  const exactSingle = steps.find((step) => step.month === referenceMonth && step.type === 'single');
  if (exactSingle) return exactSingle;

  const exactRecurring = steps.find((step) => step.month === referenceMonth && step.type !== 'single');
  if (exactRecurring) return exactRecurring;

  let latest = null;
  for (const step of steps) {
    if (step.type === 'single') continue;
    if (step.month <= referenceMonth) latest = step;
    if (step.month > referenceMonth) break;
  }

  return latest;
}

export function resolveClientFeeAtDate(client, referenceDate = new Date()) {
  const tcvMonthlyFee = resolveTcvMonthlyFee(client);
  if (tcvMonthlyFee !== null) return tcvMonthlyFee;

  const step = resolveClientFeeStepAtDate(client, referenceDate);
  if (step) return parseLocaleNumber(step.fee, 0);
  return parseLocaleNumber(client?.fee, 0);
}

export function resolveClientFeeAtMonthEnd(client, year, month0) {
  return resolveClientFeeAtDate(client, new Date(year, month0 + 1, 0));
}

export function summarizeFeeSchedule(client, referenceDate = new Date()) {
  const steps = normalizedSteps(client);
  const current = resolveClientFeeStepAtDate(client, referenceDate);
  const referenceMonth = monthKeyFromDate(referenceDate);
  const next = steps.find((step) => step.type !== 'single' && step.month > referenceMonth) || null;

  return {
    hasSchedule: steps.length > 0,
    current,
    next,
    totalSteps: steps.length,
  };
}
