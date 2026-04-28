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

export function clientInitials(name = '') {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'CL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

export function resolveClientIdentity(client, sourceClients = []) {
  const source =
    Array.isArray(sourceClients) && client?.id
      ? sourceClients.find((entry) => entry?.id === client.id)
      : null;

  const merged = {
    ...(client || {}),
    ...(source || {}),
  };

  return {
    client: merged,
    avatarUrl: getClientAvatarUrl(merged),
    initials: clientInitials(merged?.name || client?.name || ''),
  };
}
