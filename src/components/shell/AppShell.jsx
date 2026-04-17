// ================================================================
//  AppShell
//  - Layout: Sidebar fixa à esquerda + .main com Topbar sticky +
//    contentFrame arredondado contendo panelHeader + conteúdo da página.
//  - Carrega clients + squads uma vez e compartilha via Outlet context.
//  - Cada página define seu título e ações de panelHeader chamando
//    `setPanelHeader({ title, actions })` (exposto no Outlet context).
//    Isso evita portais DOM (o frontend real usava createPortal para
//    enfiar um select dentro de uma div com id fixo).
// ================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './TopbarPremium.jsx';
import { listClients } from '../../api/clients.js';
import { listSquads } from '../../api/squads.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ApiError } from '../../api/client.js';
import styles from './AppShell.module.css';

export default function AppShell() {
  const { status } = useAuth();

  const [clients, setClients] = useState([]);
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Panel header controlado pelas páginas filhas.
  // Guarda elementos React (não apenas strings) para permitir título
  // composto tipo <>Central · <strong>Abril 2026</strong></>.
  const [panelHeader, setPanelHeader] = useState({
    title: 'Edifica',
    actions: null,
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshClients = useCallback(async () => {
    try {
      const data = await listClients();
      if (mountedRef.current) {
        setClients(Array.isArray(data?.clients) ? data.clients : []);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      throw err;
    }
  }, []);

  const refreshSquads = useCallback(async () => {
    try {
      const data = await listSquads();
      if (mountedRef.current) {
        setSquads(Array.isArray(data?.squads) ? data.squads : []);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      throw err;
    }
  }, []);

  useEffect(() => {
    if (status !== 'authed') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([refreshClients(), refreshSquads()]);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, refreshClients, refreshSquads]);

  // Estabiliza a referência para as páginas não re-rodarem effects em loop.
  const setPanelHeaderStable = useCallback((next) => {
    setPanelHeader((prev) => {
      const merged =
        typeof next === 'function' ? next(prev) : { ...prev, ...next };
      return merged;
    });
  }, []);

  const outletContext = useMemo(
    () => ({
      clients,
      squads,
      loading,
      error,
      refreshClients,
      refreshSquads,
      setPanelHeader: setPanelHeaderStable,
    }),
    [
      clients,
      squads,
      loading,
      error,
      refreshClients,
      refreshSquads,
      setPanelHeaderStable,
    ]
  );

  return (
    // id="vApp" ativa o escopo Stage 20 do base.css que define:
    //   --top-shell-height: 52px
    //   --sw: 260px
    //   .tbar -> position: absolute (presa no topo do .main)
    //   .sb-logo -> 52px para casar com a .tbar
    // Sem esse id, as medidas caem no Stage 17 e o layout desmonta.
    <div id="vApp" className={styles.shell}>
      <Sidebar clients={clients} squads={squads} />
      <div className={styles.main}>
        <Topbar />
        <div className={styles.contentFrame}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>{panelHeader.title}</div>
            <div className={styles.panelActions}>{panelHeader.actions}</div>
          </div>
          <div className={styles.contentBody}>
            <Outlet context={outletContext} />
          </div>
        </div>
      </div>
    </div>
  );
}
