import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { getRoutePanelHeader } from '../../utils/routeMeta.js';
import styles from './AppShell.module.css';

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
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [panelHeader, setPanelHeader] = useState(routePanelHeader);

  const mountedRef = useRef(true);

  // userRef sempre carrega o user mais recente. Usado dentro dos refresh*
  // para que esses callbacks possam ter dependência apenas em user?.id
  // (string estável), evitando recriação espúria a cada re-render.
  const userRef = useRef(user);
  userRef.current = user;

  // Detecta troca real de usuário (login -> outro user, ou logout).
  // O bootstrap inicial (loading -> authed) não conta como troca, então
  // não dispara reset (que zerava arrays e criava janela de UI vazia).
  const prevUserIdRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  // useLayoutEffect (não useEffect) é crítico aqui:
  // - useEffect do filho roda ANTES do useEffect do pai em updates;
  //   se este reset estivesse em useEffect, ele rodaria DEPOIS do
  //   setPanelHeader(...) que a página filha (ex: CentralPage) chama
  //   no mount, sobrescrevendo os actions custom (selects do header).
  // - useLayoutEffect roda síncrono na fase de commit do pai, antes
  //   do mount do filho disparar seus effects. Assim o reset acontece
  //   primeiro e a página filha tem a última palavra sobre seus actions.
  // Sintoma que isto resolve: Dashboard -> outra tela -> volta para
  // Dashboard fazia os 3 selects do header sumirem até F5.
  useLayoutEffect(() => {
    setNotificationsOpen(false);
    setSidebarOpen(false);
    setPanelHeader(routePanelHeader);
  }, [routePanelHeader]);

  useEffect(() => {
    const previousUserId = prevUserIdRef.current;
    const currentUserId = user?.id || null;

    // Caso 1: bootstrap (primeiro render). previousUserId é null.
    //   - Se status virou authed e há user, é só registrar o id.
    //     Os arrays já são [] do useState inicial, refetch vai populá-los
    //     diretamente sem precisar zerar.
    // Caso 2: troca de user OU logout (authed -> anon).
    //   - Aí sim zera tudo para evitar vazar dados do user antigo.
    const isUserSwitch =
      previousUserId !== null && previousUserId !== currentUserId;
    const isLogout = previousUserId !== null && status !== 'authed';

    if (isUserSwitch || isLogout) {
      setClients([]);
      setSquads([]);
      setGdvs([]);
      setUserDirectory([]);
      setNotifications([]);
      setUnreadCount(0);
      setNotificationsOpen(false);
      setSidebarOpen(false);
    }

    setLoading(status === 'authed');
    setError(null);
    prevUserIdRef.current = currentUserId;
  }, [status, user?.id]);

  const refreshClients = useCallback(async () => {
    const currentUser = userRef.current;
    if (!canViewClients(currentUser)) {
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
  }, [user?.id]);

  const refreshSquads = useCallback(async () => {
    const currentUser = userRef.current;
    if (!hasPermission(currentUser, 'squads.view')) {
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
  }, [user?.id]);

  const refreshGdvs = useCallback(async () => {
    const currentUser = userRef.current;
    if (!canViewGdv(currentUser)) {
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
  }, [user?.id]);

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
    ]
  );

  return (
    <div className={styles.shell} data-theme="dark">
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
