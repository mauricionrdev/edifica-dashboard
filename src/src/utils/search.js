export function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesSearch(value, query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizeSearch(value).includes(normalizedQuery);
}

export function matchesAnySearch(values, query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalizeSearch(value).includes(normalizedQuery));
}
