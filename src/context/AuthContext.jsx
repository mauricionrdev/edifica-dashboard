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
import { ApiError } from '../api/client.js';

const AuthContext = createContext(null);
const AUTH_CACHE_KEY = 'edifica:last-user';

function isUnauthorized(err) {
  return err instanceof ApiError && err.status === 401;
}

function readCachedUser() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.user) return null;

    return parsed.user;
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  if (typeof window === 'undefined' || !user) return;

  try {
    window.localStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        user,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Cache local é apenas fallback de UX.
  }
}

function clearCachedUser() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // Cache local é apenas fallback de UX.
  }
}

export function AuthProvider({ children }) {
  const cachedUserRef = useRef(readCachedUser());
  const [state, setState] = useState(() => ({
    status: cachedUserRef.current ? 'authed' : 'loading',
    user: cachedUserRef.current,
    error: null,
    validating: Boolean(cachedUserRef.current),
  }));
  const didBootstrapRef = useRef(false);

  const clear = useCallback(() => {
    clearCachedUser();
    setState({ status: 'anon', user: null, error: null, validating: false });
  }, []);

  const keepCurrentSessionWithError = useCallback((err) => {
    setState((current) => {
      if (current.user) {
        return {
          status: 'authed',
          user: current.user,
          error: err instanceof Error ? err : new Error(String(err)),
          validating: false,
        };
      }

      return {
        status: 'auth_error',
        user: null,
        error: err instanceof Error ? err : new Error(String(err)),
        validating: false,
      };
    });
  }, []);

  const login = useCallback(async ({ identifier, password }) => {
    await authApi.login({ identifier, password }, { timeoutMs: 15000 });
    const { user } = await authApi.me({ timeoutMs: 10000 });
    writeCachedUser(user);
    setState({ status: 'authed', user, error: null, validating: false });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout({ timeoutMs: 8000 });
    } catch {
      // Logout deve limpar o cliente mesmo com falha de rede.
    }
    clear();
  }, [clear]);

  const reloadUser = useCallback(async ({ background = false } = {}) => {
    setState((current) => ({
      status: current.user || background ? 'authed' : 'loading',
      user: current.user,
      error: null,
      validating: true,
    }));

    try {
      const { user } = await authApi.me({ timeoutMs: 10000 });
      writeCachedUser(user);
      setState({ status: 'authed', user, error: null, validating: false });
      return user;
    } catch (err) {
      if (isUnauthorized(err)) {
        clear();
        return null;
      }
      keepCurrentSessionWithError(err);
      throw err;
    }
  }, [clear, keepCurrentSessionWithError]);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { user } = await authApi.me({ timeoutMs: cachedUserRef.current ? 8000 : 10000 });
        if (cancelled) return;
        writeCachedUser(user);
        setState({ status: 'authed', user, error: null, validating: false });
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          clear();
          return;
        }

        keepCurrentSessionWithError(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clear, keepCurrentSessionWithError]);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      error: state.error,
      validating: state.validating,
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
