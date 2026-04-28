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

function isUnauthorized(err) {
  return err instanceof ApiError && err.status === 401;
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'loading',
    user: null,
    error: null,
  });
  const didBootstrapRef = useRef(false);

  const clear = useCallback(() => {
    setState({ status: 'anon', user: null, error: null });
  }, []);

  const markAuthError = useCallback((err) => {
    setState((current) => ({
      status: 'auth_error',
      user: current.user,
      error: err instanceof Error ? err : new Error(String(err)),
    }));
  }, []);

  const login = useCallback(async ({ identifier, password }) => {
    await authApi.login({ identifier, password }, { timeoutMs: 15000 });
    const { user } = await authApi.me({ timeoutMs: 10000 });
    setState({ status: 'authed', user, error: null });
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

  const reloadUser = useCallback(async () => {
    setState((current) => ({
      status: 'loading',
      user: current.user,
      error: null,
    }));

    try {
      const { user } = await authApi.me({ timeoutMs: 10000 });
      setState({ status: 'authed', user, error: null });
      return user;
    } catch (err) {
      if (isUnauthorized(err)) {
        clear();
        return null;
      }
      markAuthError(err);
      throw err;
    }
  }, [clear, markAuthError]);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { user } = await authApi.me({ timeoutMs: 10000 });
        if (cancelled) return;
        setState({ status: 'authed', user, error: null });
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          clear();
          return;
        }
        markAuthError(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clear, markAuthError]);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      error: state.error,
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
