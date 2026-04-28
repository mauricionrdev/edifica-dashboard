const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const API_BASE_URL = BASE_URL;

const DEFAULT_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}


function createRequestSignal(externalSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal: externalSignal, cleanup: () => {} };
  }

  const controller = new AbortController();
  let settled = false;

  const timeoutId = window.setTimeout(() => {
    if (settled) return;
    controller.abort(new DOMException('Tempo limite da requisição excedido', 'TimeoutError'));
  }, timeoutMs);

  const abortFromExternal = () => {
    if (settled || controller.signal.aborted) return;
    controller.abort(externalSignal?.reason || new DOMException('Requisição cancelada', 'AbortError'));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      settled = true;
      window.clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
    },
  };
}

async function request(method, path, { body, signal, timeoutMs } = {}) {
  if (!BASE_URL) {
    throw new ApiError(
      'VITE_API_URL nao configurada. Copie .env.example para .env.',
      { status: 0 }
    );
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const requestSignal = createRequestSignal(signal, timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: requestSignal.signal,
    });
  } catch (networkErr) {
    const isTimeout =
      requestSignal.signal?.aborted &&
      (requestSignal.signal.reason?.name === 'TimeoutError' || String(requestSignal.signal.reason || '').includes('Tempo limite'));

    throw new ApiError(
      isTimeout ? 'Tempo limite ao contatar o servidor' : 'Falha de rede ao contatar o servidor',
      {
        status: 0,
        body: {
          cause: String(networkErr),
          timeout: isTimeout,
        },
      }
    );
  } finally {
    requestSignal.cleanup();
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
