import { MONTHS_FULL, fmtInt, fmtMoney, fmtPct } from '../../utils/format.js';

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeInt(value) {
  const number = safeNumber(value, 0);
  return number > 0 ? fmtInt(number) : '0';
}

export function safeMoney(value) {
  return fmtMoney(safeNumber(value, 0));
}

export function safePct(value) {
  return fmtPct(safeNumber(value, 0));
}

export function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function periodValue(period) {
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}`;
}

export function referenceDate(period) {
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}-15`;
}

export function buildPeriodOptions(base = new Date(), count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - index, 1);
    const year = date.getFullYear();
    const month = date.getMonth();
    return {
      value: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTHS_FULL[month]} de ${year}`,
      year,
      month,
    };
  });
}

export function monthLabel(value) {
  const [year, month] = String(value || '').split('-');
  const monthIndex = Number(month) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) return value || 'Período';
  return `${MONTHS_FULL[monthIndex]} de ${year}`;
}

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function resolveName(value, fallback = 'Sem nome') {
  const clean = String(value || '').trim();
  return clean || fallback;
}

export function resolveSquadName(squads = [], squadId) {
  if (!squadId) return 'Todos os squads';
  return resolveName((squads || []).find((item) => String(item.id) === String(squadId))?.name, 'Squad selecionado');
}

export function progressWidth(value) {
  const number = safeNumber(value, 0);
  if (number <= 0) return 0;
  return Math.max(3, Math.min(100, number));
}

export function errorMessage(error, fallback = 'Não foi possível carregar os dados.') {
  if (!error) return fallback;
  return error instanceof Error ? error.message || fallback : String(error || fallback);
}
