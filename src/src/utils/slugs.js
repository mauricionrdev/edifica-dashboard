export function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function publicPath(prefix, record) {
  const key = record?.customSlug || record?.id || '';
  return key ? `/${prefix}/${encodeURIComponent(key)}` : '';
}
