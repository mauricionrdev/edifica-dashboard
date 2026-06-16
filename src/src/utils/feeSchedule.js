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
