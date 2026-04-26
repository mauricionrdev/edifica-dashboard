// ==============================================================
//  Utilitários gerais
// ==============================================================
import { randomUUID } from 'node:crypto';

export const uuid = () => randomUUID();

/**
 * Normaliza um valor vindo do MySQL que pode ter sido entregue
 * como string JSON (em alguns drivers) ou já como objeto.
 */
export function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Converte uma Date (ou string) para 'YYYY-MM-DD' ou null.
 */
export function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Se já vier como string YYYY-MM-DD, mantém.
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Aceita um valor de data ('YYYY-MM-DD' ou vazio) vindo do cliente
 * e devolve string válida ou null para inserir no MySQL.
 */
export function fromClientDate(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? value : null;
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function parseLocaleNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  let normalized = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/[^\d,.-]/g, '');

  if (!normalized) return fallback;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? /\./g : /,/g;
    normalized = normalized.replace(thousandSeparator, '');
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
  } else if (lastComma > -1) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = normalized.split('.');
    if (parts.length > 2) {
      const decimalPart = parts.pop();
      normalized = `${parts.join('')}.${decimalPart}`;
    } else if (parts.length === 2) {
      const [, fraction = ''] = parts;
      if (/^\d{3}$/.test(fraction)) {
        normalized = parts.join('');
      }
    }
    normalized = normalized.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Erro HTTP tipado - será capturado pelo errorHandler central.
 */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Não autorizado') => new HttpError(401, msg);
export const forbidden = (msg = 'Acesso negado') => new HttpError(403, msg);
export const notFound = (msg = 'Recurso não encontrado') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);
