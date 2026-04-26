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

const DEC2 = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatLocaleNumber(value, fallback = '') {
  const parsed = parseLocaleNumber(value, null);
  if (!Number.isFinite(parsed)) return fallback;
  return DEC2.format(parsed);
}
