export function slugifySegment(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function getEntityRouteSegment(entity, fallbackName = entity?.name || '') {
  const custom = slugifySegment(entity?.customSlug || entity?.custom_slug || '');
  if (custom) return custom;

  const serialized = slugifySegment(entity?.slug || '');
  if (serialized) return serialized;

  const fallback = slugifySegment(fallbackName);
  if (fallback) return fallback;

  return String(entity?.id || '').trim();
}

export function matchesEntityRouteSegment(segment, entity, fallbackName = entity?.name || '') {
  const cleanSegment = decodeURIComponent(String(segment || '').trim());
  if (!cleanSegment || !entity) return false;

  const candidates = new Set([
    String(entity?.id || '').trim(),
    String(entity?.customSlug || entity?.custom_slug || '').trim(),
    String(entity?.slug || '').trim(),
    slugifySegment(entity?.customSlug || entity?.custom_slug || ''),
    slugifySegment(entity?.slug || ''),
    slugifySegment(fallbackName),
  ].filter(Boolean));

  return candidates.has(cleanSegment) || candidates.has(slugifySegment(cleanSegment));
}

export function buildGdvPath(gdv, fallbackName = gdv?.name || '') {
  return `/gdvs/${encodeURIComponent(getEntityRouteSegment(gdv, fallbackName))}`;
}

export function buildSquadPath(squad, fallbackName = squad?.name || '') {
  return `/squads/${encodeURIComponent(getEntityRouteSegment(squad, fallbackName))}`;
}

export function buildProfilePath(user, fallbackName = user?.name || '') {
  return `/perfil/${encodeURIComponent(getEntityRouteSegment(user, fallbackName))}`;
}
