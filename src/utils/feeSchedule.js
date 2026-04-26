import { parseLocaleNumber } from './number.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedSteps(client) {
  const steps = Array.isArray(client?.feeSteps) ? client.feeSteps : [];
  return sortFeeSteps(steps);
}

export function sortFeeSteps(steps = []) {
  return [...(Array.isArray(steps) ? steps : [])]
    .filter((step) => step?.startDate)
    .sort((a, b) => {
      const aStart = String(a.startDate || '');
      const bStart = String(b.startDate || '');
      if (aStart !== bStart) return aStart.localeCompare(bStart);
      return String(a.endDate || '9999-12-31').localeCompare(String(b.endDate || '9999-12-31'));
    });
}

export function clientHasFeeSchedule(client) {
  return normalizedSteps(client).length > 0;
}

export function resolveClientFeeStepAtDate(client, referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : parseDate(referenceDate);
  if (!date) return null;

  for (const step of normalizedSteps(client)) {
    const start = parseDate(step.startDate);
    const end = parseDate(step.endDate);
    if (!start) continue;
    if (date < start) continue;
    if (end && date > end) continue;
    return step;
  }

  return null;
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
  const currentIndex = current ? steps.findIndex((step) => step === current) : -1;
  const next = currentIndex >= 0 ? steps[currentIndex + 1] || null : steps[0] || null;

  return {
    hasSchedule: steps.length > 0,
    current,
    next,
    totalSteps: steps.length,
  };
}
