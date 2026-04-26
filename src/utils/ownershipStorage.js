export function subscribeOwnershipChange() {
  return () => {};
}

export function resolveSquadOwner(squad, users = []) {
  const ownerId = squad?.ownerUserId || squad?.ownerId || squad?.owner?.id || squad?.proprietarioId || '';
  const owner =
    squad?.owner
    || (Array.isArray(users) ? users : []).find((entry) => entry?.id === ownerId)
    || null;

  return {
    ownerId: owner?.id || ownerId || '',
    owner,
    active: Boolean(owner && owner.active !== false),
  };
}

export function resolveGdvOwner(gdv, users = []) {
  const ownerId = gdv?.ownerUserId || gdv?.ownerId || gdv?.owner?.id || '';
  const owner =
    gdv?.owner
    || (Array.isArray(users) ? users : []).find((entry) => entry?.id === ownerId)
    || null;

  return {
    ownerId: owner?.id || ownerId || '',
    owner,
    active: Boolean(owner && owner.active !== false),
  };
}
