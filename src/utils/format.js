// ================================================================
//  Helpers de formatação.
//  Equivalentes diretos de fmt/fmtMoney/fmtPct/fmtD do protótipo,
//  mas usando Intl e retornando strings pt-BR consistentes.
// ================================================================

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INT = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const DEC2 = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return BRL.format(0);
  return BRL.format(v);
}

export function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '';
  return INT.format(Math.round(v));
}

export function fmtDec(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0,00';
  return DEC2.format(v);
}

export function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0%';
  return `${DEC2.format(v)}%`;
}

export const MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export const MONTHS_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/**
 * Retorna prefixo 'YYYY-MM' para uma data ou para (year, month0).
 */
export function monthKey(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

/**
 * Diferença em dias (inteiros, arredondados) entre duas datas.
 * Retorna NaN se alguma data for inválida.
 */
export function daysBetween(from, to) {
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return NaN;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
