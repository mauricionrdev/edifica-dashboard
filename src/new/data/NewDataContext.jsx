import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { listClients } from '../../api/clients.js';
import { listSquads } from '../../api/squads.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  canViewClients,
  hasEmptyWorkspaceView,
  hasPermission,
} from '../../utils/permissions.js';

const NewDataContext = createContext(null);

export function NewDataProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    clients: [],
    squads: [],
    status: 'loading',
    error: null,
    updatedAt: null,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', error: null }));

    const emptyView = hasEmptyWorkspaceView(user);
    const mayLoadClients = !emptyView && canViewClients(user);
    const mayLoadSquads = !emptyView && hasPermission(user, 'squads.view');

    try {
      const [clientsResult, squadsResult] = await Promise.all([
        mayLoadClients ? listClients() : Promise.resolve({ clients: [] }),
        mayLoadSquads ? listSquads() : Promise.resolve({ squads: [] }),
      ]);

      setState({
        clients: Array.isArray(clientsResult?.clients) ? clientsResult.clients : [],
        squads: Array.isArray(squadsResult?.squads) ? squadsResult.squads : [],
        status: 'ready',
        error: null,
        updatedAt: new Date(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      loading: state.status === 'loading',
      refresh,
    }),
    [refresh, state]
  );

  return <NewDataContext.Provider value={value}>{children}</NewDataContext.Provider>;
}

export function useNewData() {
  const context = useContext(NewDataContext);
  if (!context) {
    throw new Error('useNewData precisa estar dentro de <NewDataProvider>.');
  }
  return context;
}
