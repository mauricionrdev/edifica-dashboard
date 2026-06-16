const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const API_BASE_URL = BASE_URL;

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request(method, path, { body, signal } = {}) {
  if (!BASE_URL) {
    throw new ApiError(
      'VITE_API_URL nao configurada. Copie .env.example para .env.',
      { status: 0 }
    );
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkErr) {
    throw new ApiError('Falha de rede ao contatar o servidor', {
      status: 0,
      body: { cause: String(networkErr) },
    });
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      for (const listener of unauthorizedListeners) {
        try {
          listener();
        } catch {
          // Ignore listener errors.
        }
      }
    }

    const message =
      (data && (data.error || data.message)) ||
      `Erro ${res.status} em ${method} ${path}`;

    throw new ApiError(message, { status: res.status, body: data });
  }

  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
};
