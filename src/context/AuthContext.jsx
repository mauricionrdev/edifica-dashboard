// ================================================================
//  AuthContext
//  - Mantém { token, user, status } em memória e espelha em sessionStorage
//    para sobreviver a reloads sem persistir entre sessões do browser.
//  - Expõe login / logout / reloadUser.
//  - Em qualquer 401 do backend, chama logout() automaticamente.
//
//  Decisão consciente: sessionStorage em vez de localStorage. Fecha o
//  navegador, precisa logar de novo. É menos chato que localStorage com
//  tokens expirados e mantém a segurança simples.
// ================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as authApi from '../api/auth.js';
import {
  setAuthToken,
  onUnauthorized,
  ApiError,
} from '../api/client.js';

const STORAGE_KEY = 'edifica.auth';

const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuth(state) {
  try {
    if (state && state.token && state.user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* storage pode falhar em modo privado — OK, roda só em memória */
  }
}

export function AuthProvider({ children }) {
  // status: 'loading' (conferindo token) | 'anon' | 'authed'
  const [state, setState] = useState(() => {
    const stored = readStoredAuth();
    if (stored) {
      setAuthToken(stored.token);
      return { status: 'loading', token: stored.token, user: stored.user };
    }
    return { status: 'anon', token: null, user: null };
  });

  // Evita requisição /me duplicada em StrictMode (dev).
  const didBootstrapRef = useRef(false);

  const clear = useCallback(() => {
    setAuthToken(null);
    writeStoredAuth(null);
    setState({ status: 'anon', token: null, user: null });
  }, []);

  const login = useCallback(async ({ identifier, password }) => {
    const { token, user } = await authApi.login({ identifier, password });
    setAuthToken(token);
    const next = { status: 'authed', token, user };
    writeStoredAuth({ token, user });
    setState(next);
    return user;
  }, []);

  const logout = useCallback(async () => {
    // Tenta notificar o backend mas não bloqueia em caso de erro/rede.
    try {
      await authApi.logout();
    } catch {
      /* no-op: logout é idempotente no cliente */
    }
    clear();
  }, [clear]);

  const reloadUser = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setState((prev) => {
        if (!prev.token) return prev;
        const next = { status: 'authed', token: prev.token, user };
        writeStoredAuth({ token: prev.token, user });
        return next;
      });
      return user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clear();
      }
      throw err;
    }
  }, [clear]);

  // Bootstrap: se havia token guardado, valida via /me.
  useEffect(() => {
    if (state.status !== 'loading') return;
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { user } = await authApi.me();
        if (cancelled) return;
        setState((prev) => {
          if (!prev.token) return prev;
          const next = { status: 'authed', token: prev.token, user };
          writeStoredAuth({ token: prev.token, user });
          return next;
        });
      } catch {
        if (cancelled) return;
        clear();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.status, clear]);

  // 401 em qualquer request -> logout automático.
  useEffect(() => {
    return onUnauthorized(() => {
      clear();
    });
  }, [clear]);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      token: state.token,
      login,
      logout,
      reloadUser,
    }),
    [state, login, logout, reloadUser]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  }
  return ctx;
}
