const EVENT_NAME = 'edifica-avatar-change';
const MAX_SIZE = 512;
const COVER_WIDTH = 1600;
const COVER_HEIGHT = 420;
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

export function getSquadCover(squad) {
  return squad?.coverUrl || '';
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


export async function readCoverFile(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const targetRatio = COVER_WIDTH / COVER_HEIGHT;
    const sourceRatio = naturalWidth / naturalHeight;

    let sourceWidth = naturalWidth;
    let sourceHeight = naturalHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceRatio > targetRatio) {
      sourceWidth = naturalHeight * targetRatio;
      sourceX = Math.max((naturalWidth - sourceWidth) / 2, 0);
    } else {
      sourceHeight = naturalWidth / targetRatio;
      sourceY = Math.max((naturalHeight - sourceHeight) / 2, 0);
    }

    const canvas = document.createElement('canvas');
    canvas.width = COVER_WIDTH;
    canvas.height = COVER_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, COVER_WIDTH, COVER_HEIGHT);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
