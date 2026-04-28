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
import { onUnauthorized, ApiError } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'loading',
    user: null,
  });
  const didBootstrapRef = useRef(false);

  const clear = useCallback(() => {
    setState({ status: 'anon', user: null });
  }, []);

  const login = useCallback(async ({ identifier, password }) => {
    await authApi.login({ identifier, password }, { timeoutMs: 15000 });
    const { user } = await authApi.me({ timeoutMs: 10000 });
    setState({ status: 'authed', user });
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
    try {
      const { user } = await authApi.me({ timeoutMs: 10000 });
      setState({ status: 'authed', user });
      return user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clear();
      }
      throw err;
    }
  }, [clear]);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { user } = await authApi.me({ timeoutMs: 10000 });
        if (cancelled) return;
        setState({ status: 'authed', user });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clear();
          return;
        }
        setState({ status: 'anon', user: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clear]);

  useEffect(() => {
    return onUnauthorized(() => {
      clear();
    });
  }, [clear]);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
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
