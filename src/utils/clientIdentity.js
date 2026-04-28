export function getClientAvatarUrl(client) {
  return (
    client?.avatarUrl ||
    client?.avatar_url ||
    client?.avatarDataUrl ||
    client?.avatar_data_url ||
    client?.logoUrl ||
    client?.logo_url ||
    ''
  );
}

export function getGdvLogoUrl(gdv) {
  return (
    gdv?.logoUrl ||
    gdv?.logo_url ||
    gdv?.avatarUrl ||
    gdv?.avatar_url ||
    gdv?.avatarDataUrl ||
    gdv?.avatar_data_url ||
    ''
  );
}

export function initialsFromName(name = '', fallback = 'CL') {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

export function resolveClientIdentity(client, sourceClients = []) {
  const source =
    Array.isArray(sourceClients) && client?.id
      ? sourceClients.find((entry) => entry?.id === client.id)
      : null;

  const avatarUrl = getClientAvatarUrl(client) || getClientAvatarUrl(source);

  const merged = {
    ...(source || {}),
    ...(client || {}),
    avatarUrl,
  };

  return {
    client: merged,
    avatarUrl,
    initials: initialsFromName(merged?.name || source?.name || client?.name || '', 'CL'),
  };
}

export function resolveGdvIdentity(gdv) {
  return {
    gdv,
    logoUrl: getGdvLogoUrl(gdv),
    initials: initialsFromName(gdv?.name || gdv?.ownerName || '', 'GD'),
  };
}
