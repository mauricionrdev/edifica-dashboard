const EVENT_NAME = 'edifica-avatar-change';
const MAX_SIZE = 512;
const QUALITY = 0.88;

function emitChange(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function subscribeAvatarChange(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback?.();
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function getUserAvatar(user) {
  return user?.avatarUrl || '';
}

export function saveUserAvatar(user, dataUrl) {
  if (!dataUrl) return false;
  emitChange({ type: 'user', id: user?.id || '', dataUrl });
  return true;
}

export function removeUserAvatar(user) {
  emitChange({ type: 'user', id: user?.id || '', dataUrl: '' });
  return true;
}

export function getClientAvatar(client) {
  return client?.avatarUrl || '';
}

export function saveClientAvatar(client, dataUrl) {
  if (!dataUrl) return false;
  emitChange({ type: 'client', id: client?.id || '', dataUrl });
  return true;
}

export function removeClientAvatar(client) {
  emitChange({ type: 'client', id: client?.id || '', dataUrl: '' });
  return true;
}

export function getSquadAvatar(squad) {
  return squad?.logoUrl || '';
}

export function saveSquadAvatar(squad, dataUrl) {
  if (!dataUrl) return false;
  emitChange({ type: 'squad', id: squad?.id || '', dataUrl });
  return true;
}

export function removeSquadAvatar(squad) {
  emitChange({ type: 'squad', id: squad?.id || '', dataUrl: '' });
  return true;
}

export function getGdvAvatar(gdv) {
  return gdv?.logoUrl || '';
}

export function saveGdvAvatar(gdv, dataUrl) {
  if (!dataUrl) return false;
  emitChange({ type: 'gdv', id: gdv?.id || '', dataUrl });
  return true;
}

export function removeGdvAvatar(gdv) {
  emitChange({ type: 'gdv', id: gdv?.id || '', dataUrl: '' });
  return true;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Imagem inválida.'));
    image.src = src;
  });
}

export async function readAvatarFile(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const sourceX = Math.max(((image.naturalWidth || image.width) - side) / 2, 0);
    const sourceY = Math.max(((image.naturalHeight || image.height) - side) / 2, 0);
    const canvas = document.createElement('canvas');
    canvas.width = MAX_SIZE;
    canvas.height = MAX_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, sourceX, sourceY, side, side, 0, 0, MAX_SIZE, MAX_SIZE);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
