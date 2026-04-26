// ================================================================
//  Client helpers
//  Funções puras de UI para clientes: iniciais, cor do avatar,
//  detecção de "vencendo em 30 dias", label de status.
// ================================================================

/**
 * Duas primeiras iniciais (primeiro + último nome).
 * "Maria Silva Santos" -> "MS"
 * "João" -> "JO"
 */
export function clientInitials(name) {
  if (!name) return '??';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Cor estável do avatar derivada do nome. Usa hash simples para
 * distribuir as cores sem precisar persistir nada. As 10 cores
 * foram selecionadas para funcionar em fundo escuro.
 */
const AVATAR_PALETTE = [
  '#f5c300', // amber
  '#60a5fa', // blue
  '#22c55e', // green
  '#ef4444', // red
  '#2dd4bf', // teal
  '#a78bfa', // purple
  '#fb923c', // orange
  '#f472b6', // pink
  '#34d399', // emerald
  '#c084fc', // violet
];

export function colorFromName(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/**
 * Cliente está com contrato vencendo em até `days` dias?
 * - Ignora clientes em churn.
 * - Retorna false se endDate for inválido ou já venceu.
 */
export function isEndingSoon(client, days = 30, today = new Date()) {
  if (!client || !client.endDate || client.status === 'churn') return false;
  const end = parseDateOnly(client.endDate);
  if (Number.isNaN(end.getTime())) return false;
  const base = startOfDay(today);
  const diff = Math.round((end - base) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= days;
}

function parseDateOnly(value) {
  if (!value) return new Date(Number.NaN);
  if (value instanceof Date) return startOfDay(value);
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return startOfDay(new Date(value));
}

function startOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isExpired(client, today = new Date()) {
  if (!client || !client.endDate || client.status === 'churn') return false;
  const end = parseDateOnly(client.endDate);
  if (Number.isNaN(end.getTime())) return false;
  return end < startOfDay(today);
}

/**
 * Classe CSS do badge de status - casa com .cc-active / .cc-ending /
 * .cc-churn já existentes no base.css.
 */
export function statusClass(client, today = new Date()) {
  if (!client) return '';
  if (client.status === 'churn') return 'cc-churn';
  if (isExpired(client, today)) return 'cc-expired';
  if (isEndingSoon(client, 30, today)) return 'cc-ending';
  return 'cc-active';
}

export function statusLabel(client, today = new Date()) {
  if (!client) return '';
  if (client.status === 'churn') return 'Churn';
  if (isExpired(client, today)) return 'Vencido';
  if (isEndingSoon(client, 30, today)) return 'Vencendo';
  return 'Ativo';
}

/**
 * Formata data ISO (YYYY-MM-DD) para pt-BR "DD/MM/YYYY".
 * Retorna '—' se inválida/vazia.
 */
export function fmtDateBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
