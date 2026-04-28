import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { listClients } from '../../api/clients.js';
import { listGdvs } from '../../api/gdvs.js';
import { listSquads } from '../../api/squads.js';
import { listUserDirectory } from '../../api/users.js';
import {
  createNotificationsStream,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/notifications.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ApiError } from '../../api/client.js';
import {
  canViewClients,
  canViewGdv,
  hasPermission,
} from '../../utils/permissions.js';
import styles from './AppShell.module.css';


function getRoutePanelHeader(pathname = '/') {
  if (pathname.startsWith('/clientes')) return { title: 'Clientes', description: null, actions: null };
  if (pathname.startsWith('/preencher-semana')) return { title: 'Semana', description: null, actions: null };
  if (pathname.startsWith('/gdv')) return { title: 'GDV', description: null, actions: null };
  if (pathname.startsWith('/equipe')) return { title: 'Equipe & Acessos', description: null, actions: null };
  if (pathname.startsWith('/perfil')) return { title: 'Perfil', description: null, actions: null };
  if (pathname.startsWith('/modelo-oficial')) return { title: 'Modelo Oficial', description: null, actions: null };
  if (pathname.startsWith('/ranking-squads')) return { title: 'Ranking de Squads', description: null, actions: null };
  if (pathname.startsWith('/squads')) return { title: 'Squad', description: null, actions: null };
  if (pathname.startsWith('/projetos')) return { title: 'Projetos', description: null, actions: null };
  return { title: 'Central', description: null, actions: null };
}

export default function AppShell() {
  const { status, user } = useAuth();
  const location = useLocation();
  const routePanelHeader = useMemo(() => getRoutePanelHeader(location.pathname), [location.pathname]);

  const [clients, setClients] = useState([]);
  const [squads, setSquads] = useState([]);
  const [gdvs, setGdvs] = useState([]);
  const [userDirectory, setUserDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [panelHeader, setPanelHeader] = useState(routePanelHeader);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPanelHeader(routePanelHeader);
  }, [routePanelHeader]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    setClients([]);
    setSquads([]);
    setGdvs([]);
    setUserDirectory([]);
    setNotifications([]);
    setUnreadCount(0);
    setNotificationsOpen(false);
    setSidebarOpen(false);
    setPanelHeader(routePanelHeader);
    setLoading(status === 'authed');
    setError(null);
  }, [routePanelHeader, status, user?.id]);

  const refreshClients = useCallback(async () => {
    if (!canViewClients(user)) {
      if (mountedRef.current) setClients([]);
      return;
    }
    try {
      const data = await listClients();
      if (mountedRef.current) {
        setClients(Array.isArray(data?.clients) ? data.clients : []);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (mountedRef.current) setClients([]);
        return;
      }
      throw err;
    }
  }, [user]);

  const refreshSquads = useCallback(async () => {
    if (!hasPermission(user, 'squads.view')) {
      if (mountedRef.current) setSquads([]);
      return;
    }
    try {
      const data = await listSquads();
      if (mountedRef.current) {
        setSquads(Array.isArray(data?.squads) ? data.squads : []);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (mountedRef.current) setSquads([]);
        return;
      }
      throw err;
    }
  }, [user]);

  const refreshGdvs = useCallback(async () => {
    if (!canViewGdv(user)) {
      if (mountedRef.current) setGdvs([]);
      return;
    }
    try {
      const data = await listGdvs();
      if (mountedRef.current) {
        setGdvs(Array.isArray(data?.gdvs) ? data.gdvs : []);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (mountedRef.current) setGdvs([]);
        return;
      }
      throw err;
    }
  }, [user]);

  const refreshUserDirectory = useCallback(async () => {
    try {
      const data = await listUserDirectory();
      if (mountedRef.current) {
        const next =
          (Array.isArray(data?.users) && data.users) ||
          (Array.isArray(data?.directory) && data.directory) ||
          [];
        setUserDirectory(next);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (mountedRef.current) setUserDirectory([]);
        return;
      }
      throw err;
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (status !== 'authed') {
      if (mountedRef.current) {
        setNotifications([]);
        setUnreadCount(0);
      }
      return;
    }
    setNotificationsLoading(true);
    try {
      const data = await listNotifications({ limit: 30 });
      if (mountedRef.current) {
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
        setUnreadCount(Number(data?.unreadCount) || 0);
      }
    } catch (err) {
      if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) {
        throw err;
      }
    } finally {
      if (mountedRef.current) setNotificationsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authed') return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([refreshClients(), refreshSquads(), refreshGdvs(), refreshUserDirectory()]);
        await refreshNotifications();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshClients, refreshGdvs, refreshNotifications, refreshSquads, refreshUserDirectory, status]);

  useEffect(() => {
    if (status !== 'authed') return undefined;
    let closed = false;
    let stream = null;
    let reconnectTimer = null;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 5000);
    };

    const connect = () => {
      if (closed) return;
      stream?.close();
      stream = createNotificationsStream();
      if (!stream) return;

      stream.addEventListener('connected', () => {
        refreshNotifications().catch(() => {});
      });
      stream.addEventListener('notifications.changed', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          if (mountedRef.current && payload?.unreadCount !== undefined) {
            setUnreadCount(Number(payload.unreadCount) || 0);
          }
        } catch {
          // Evento inválido não derruba a conexão.
        }
        refreshNotifications().catch(() => {});
      });
      stream.onerror = () => {
        stream?.close();
        scheduleReconnect();
      };
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNotifications().catch(() => {});
      }
    };

    connect();
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      stream?.close();
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshNotifications, status]);

  const handleMarkNotificationRead = useCallback(async (id) => {
    if (!id) return;
    await markNotificationRead(id);
    if (!mountedRef.current) return;
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item))
    );
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    await markAllNotificationsRead();
    if (!mountedRef.current) return;
    const nowIso = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || nowIso })));
    setUnreadCount(0);
  }, []);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const handleRefreshNotifications = useCallback(() => {
    refreshNotifications().catch(() => {});
  }, [refreshNotifications]);

  const handleToggleNotifications = useCallback(() => {
    setNotificationsOpen((current) => !current);
    refreshNotifications().catch(() => {});
  }, [refreshNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1101px)');
    const sync = (event) => {
      if (event.matches) setSidebarOpen(false);
    };
    sync(mq);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  const setPanelHeaderStable = useCallback((next) => {
    setPanelHeader((prev) => {
      const base = routePanelHeader;
      const merged = typeof next === 'function' ? next(prev) : { ...base, ...next };
      return merged;
    });
  }, [routePanelHeader]);

  const outletContext = useMemo(
    () => ({
      clients,
      squads,
      gdvs,
      userDirectory,
      loading,
      error,
      refreshClients,
      refreshSquads,
      refreshGdvs,
      refreshUserDirectory,
      setPanelHeader: setPanelHeaderStable,
      theme,
      setTheme,
    }),
    [
      clients,
      squads,
      gdvs,
      userDirectory,
      loading,
      error,
      refreshClients,
      refreshSquads,
      refreshGdvs,
      refreshUserDirectory,
      setPanelHeaderStable,
      theme,
    ]
  );

  return (
    <div className={styles.shell} data-theme={theme}>
      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ''}`}
        aria-hidden={sidebarOpen ? 'false' : 'true'}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        clients={clients}
        squads={squads}
        gdvs={gdvs}
        userDirectory={userDirectory}
        refreshSquads={refreshSquads}
        refreshGdvs={refreshGdvs}
        refreshClients={refreshClients}
        refreshUserDirectory={refreshUserDirectory}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
      />

      <div className={styles.main}>
        <Topbar
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onOpenSidebar={() => setSidebarOpen(true)}
          onToggleSidebarCollapse={() => setSidebarCollapsed((current) => !current)}
          sidebarCollapsed={sidebarCollapsed}
          user={user}
          userDirectory={userDirectory}
          title={panelHeader.title}
          notifications={notifications}
          notificationsLoading={notificationsLoading}
          notificationsOpen={notificationsOpen}
          unreadCount={unreadCount}
          onToggleNotifications={handleToggleNotifications}
          onCloseNotifications={handleCloseNotifications}
          onRefreshNotifications={handleRefreshNotifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        />

        <div className={styles.pageRail}>
          <header className={styles.pageHeader}>
            <div className={styles.pageTitleBlock}>
              <div className={styles.pageTitleRow}>{panelHeader.title}</div>
              {panelHeader.description ? (
                <p className={styles.pageDescription}>{panelHeader.description}</p>
              ) : null}
            </div>
            {panelHeader.actions ? <div className={styles.pageActions}>{panelHeader.actions}</div> : null}
          </header>

          <main className={styles.pageContent}>
            <Outlet context={outletContext} />
          </main>
        </div>
      </div>
    </div>
  );
}
