// ================================================================
//  API client - wrapper minimalista sobre fetch.
//  - Injeta Authorization: Bearer <token> quando disponível.
//  - Lança ApiError em respostas não-ok, com status e mensagem do servidor.
//  - Base URL vem de VITE_API_URL (ex: http://localhost:3001/api).
// ================================================================

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Token em módulo (single source of truth em runtime). Persistência fica
// a cargo do AuthContext via sessionStorage — aqui guardamos só o valor
// corrente para não depender de storage a cada request.
let currentToken = null;

export function setAuthToken(token) {
  currentToken = token || null;
}

export function getAuthToken() {
  return currentToken;
}

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Listeners notificados quando o servidor devolve 401. O AuthContext
 * se registra aqui para fazer logout automático em caso de token expirado.
 */
const unauthorizedListeners = new Set();
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request(method, path, { body, signal } = {}) {
  if (!BASE_URL) {
    throw new ApiError(
      'VITE_API_URL não configurada. Copie .env.example para .env.',
      { status: 0 }
    );
  }

  const headers = { Accept: 'application/json' };
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkErr) {
    // Network failure (CORS, server offline, DNS). Erro genérico.
    throw new ApiError('Falha de rede ao contatar o servidor', {
      status: 0,
      body: { cause: String(networkErr) },
    });
  }

  // Parse defensivo: algumas rotas podem devolver vazio.
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
          /* ignore listener errors */
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
