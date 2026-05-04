import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  canCreateClients,
  canDeleteClientRecord,
  canEditClientFeeScheduleRecord,
  canEditClientRecord,
  canViewClientFeeScheduleRecord,
  hasPermission,
} from '../utils/permissions.js';
import {
  clientInitials,
  fmtDateBR,
  isEndingSoon,
  isExpired,
  statusClass,
  statusLabel,
} from '../utils/clientHelpers.js';
import { fmtMoney } from '../utils/format.js';
import { getClientAvatar, subscribeAvatarChange } from '../utils/avatarStorage.js';
import { resolveClientFeeAtDate } from '../utils/feeSchedule.js';
import ClientFormModal from '../components/clients/ClientFormModal.jsx';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import Button from '../components/ui/Button.jsx';
import { PlusIcon, SearchIcon } from '../components/ui/Icons.jsx';
import StateBlock from '../components/ui/StateBlock.jsx';
import Select from '../components/ui/Select.jsx';
import { matchesAnySearch } from '../utils/search.js';
import { CLIENT_STATUS, isActiveClientStatus } from '../utils/clientStatus.js';
import styles from './ClientsPage.module.css';

const SCOPES = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'onboarding', label: 'Onboard' },
  { key: 'paused', label: 'Pausados' },
  { key: 'expired', label: 'Vencidos' },
  { key: 'ending', label: 'Vencendo' },
  { key: 'churn', label: 'Churn' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export default function ClientsPage() {
  const { clients, squads, userDirectory, loading, error, refreshClients, setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const canCreate = canCreateClients(user);
  const canOpenTemplate = hasPermission(user, 'project_template.view');

  const [query, setQuery] = useState(() => searchParams.get('search') || '');
  const [scope, setScope] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  // `today` precisa refletir a data atual ainda que a aba fique aberta a noite toda.
  // Antes era `useMemo(() => new Date(), [])`, que travava no instante do mount —
  // e cálculos de "vencendo em 30 dias" / "vencido" ficavam stale após meia-noite.
  // Aqui guardamos a data e checamos uma vez por minuto se o dia (YYYY-MM-DD) mudou.
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const interval = setInterval(() => {
      const now = new Date();
      setToday((current) => (dayKey(current) === dayKey(now) ? current : now));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    const all = Array.isArray(clients) ? clients : [];
    return {
      all: all.length,
      active: all.filter((c) => isActiveClientStatus(c.status) && !isExpired(c, today)).length,
      onboarding: all.filter((c) => c.status === CLIENT_STATUS.ONBOARDING).length,
      paused: all.filter((c) => c.status === CLIENT_STATUS.PAUSED).length,
      expired: all.filter((c) => isExpired(c, today)).length,
      ending: all.filter((c) => isEndingSoon(c, 30, today)).length,
      churn: all.filter((c) => c.status === 'churn').length,
      squad: all.filter((c) => c.squadId).length,
    };
  }, [clients, today]);

  const filtered = useMemo(() => {
    const rows = Array.isArray(clients) ? clients : [];
    const q = query.trim();

    return rows.filter((c) => {
      if (scope === 'active' && (!isActiveClientStatus(c.status) || isExpired(c, today))) return false;
      if (scope === 'onboarding' && c.status !== CLIENT_STATUS.ONBOARDING) return false;
      if (scope === 'paused' && c.status !== CLIENT_STATUS.PAUSED) return false;
      if (scope === 'expired' && !isExpired(c, today)) return false;
      if (scope === 'ending' && !isEndingSoon(c, 30, today)) return false;
      if (scope === 'churn' && c.status !== CLIENT_STATUS.CHURN) return false;

      if (!q) return true;
      return matchesAnySearch([c.name, c.squadName, c.gestor, c.gdvName], q);
    });
  }, [clients, scope, query, today]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRows = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query, scope, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const title = (
      <>
        <strong>Clientes</strong>
        <span>·</span>
        <span>
          {counts.all} {counts.all === 1 ? 'cadastrado' : 'cadastrados'} · {counts.active}{' '}
          {counts.active === 1 ? 'ativo' : 'ativos'}
        </span>
      </>
    );

    const actions = (
      <div className={styles.headerActions}>
        {canOpenTemplate ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={styles.headerActionButton}
            onClick={() => navigate('/modelo-oficial')}
            aria-label="Abrir modelo oficial"
          >
            <span>Modelo oficial</span>
          </Button>
        ) : null}
        {canCreate ? (
          <Button type="button" variant="secondary" size="sm" className={styles.headerActionButton} onClick={() => setModalOpen(true)} aria-label="Novo cliente">
            <PlusIcon size={14} />
            <span>Novo cliente</span>
          </Button>
        ) : null}
      </div>
    );

    setPanelHeader({ title, actions });
  }, [canCreate, canOpenTemplate, counts.all, counts.active, navigate, setPanelHeader]);

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(() => {
    setDetailId(null);
    const next = new URLSearchParams(searchParams);
    next.delete('client');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectedClient = useMemo(
    () => (detailId ? (clients || []).find((c) => c.id === detailId) || null : null),
    [detailId, clients]
  );

  useEffect(() => {
    const search = searchParams.get('search') || '';
    setQuery(search);
  }, [searchParams]);

  useEffect(() => {
    return subscribeAvatarChange(() => setAvatarVersion((value) => value + 1));
  }, []);

  useEffect(() => {
    const clientId = searchParams.get('client');
    if (!clientId || !Array.isArray(clients) || clients.length === 0) return;
    if (clients.some((c) => c.id === clientId)) setDetailId(clientId);
  }, [clients, searchParams]);

  const handleQueryChange = useCallback(
    (nextQuery) => {
      setQuery(nextQuery);
      const next = new URLSearchParams(searchParams);
      if (nextQuery.trim()) next.set('search', nextQuery);
      else next.delete('search');
      next.delete('client');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleCreated = useCallback(
    async (client) => {
      setModalOpen(false);
      try {
        await refreshClients();
      } catch {
        // ignore
      }
      if (client?.id) setDetailId(client.id);
      showToast(`"${client?.name || 'Cliente'}" criado.`);
    },
    [refreshClients, showToast]
  );

  const handleUpdated = useCallback(async () => {
    try {
      await refreshClients();
    } catch {
      // ignore
    }
  }, [refreshClients]);

  const handleDeleted = useCallback(async () => {
    setDetailId(null);
    try {
      await refreshClients();
    } catch {
      // ignore
    }
  }, [refreshClients]);

  if (loading && (!clients || clients.length === 0)) {
    return (
      <div className={styles.page}>
        <StateBlock variant="loading" title="Carregando clientes" />
      </div>
    );
  }

  if (error && (!clients || clients.length === 0)) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="error"
          title="Erro ao carregar clientes"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => refreshClients()}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className={styles.page}>
        <section className={styles.workbench}>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <SearchIcon size={15} />
              <input
                type="search"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Buscar cliente, squad ou gestor..."
                aria-label="Buscar"
              />
            </label>

            <div className={styles.scopeTabs} role="tablist" aria-label="Filtrar clientes">
              {SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={scope === s.key}
                  className={`${styles.scopeTab} ${scope === s.key ? styles.scopeTabActive : ''}`.trim()}
                  onClick={() => setScope(s.key)}
                >
                  <span>{s.label}</span>
                  <span className={styles.scopeCount}>{counts[s.key]}</span>
                </button>
              ))}
            </div>

            <div className={styles.paginationControl}>
              <Select
                className={styles.pageSizeSelect}
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value) || 20)}
                aria-label="Quantidade de clientes exibidos"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} por página
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className={styles.clientTable}>
            <div className={styles.clientHeader}>
              <span />
              <span>Cliente</span>
              <span>Squad</span>
              <span>Gestor</span>
              <span>Início</span>
              <span>Fim</span>
              <span>Mensalidade</span>
              <span>Status</span>
            </div>

            {filtered.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>
                  {counts.all === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum cliente encontrado'}
                </div>
              </div>
            ) : (
              visibleRows.map((c) => {
                const sc = statusClass(c, today);
                const sl = statusLabel(c, today);
                const ending = isEndingSoon(c, 30, today);
                const avatarUrl = getClientAvatar(c);

                return (
                  <div
                    key={c.id}
                    className={styles.clientRow}
                    onClick={() => openDetail(c.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDetail(c.id);
                      }
                    }}
                  >
                    <div
                      className={styles.avatar}
                      aria-hidden="true"
                      data-avatar-version={avatarVersion}
                    >
                      {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(c.name)}
                    </div>
                    <div className={styles.cellName} title={c.name}>
                      {c.name}
                    </div>
                    <div className={styles.cellMuted} title={c.squadName || ''}>
                      {c.squadName || '—'}
                    </div>
                    <div className={styles.cellMuted} title={c.gestor || ''}>
                      {c.gestor || '—'}
                    </div>
                    <div className={styles.cellDate}>{fmtDateBR(c.startDate)}</div>
                    <div className={`${styles.cellDate} ${ending ? styles.soon : ''}`.trim()}>{fmtDateBR(c.endDate)}</div>
                    <div className={styles.cellFee}>{fmtMoney(resolveClientFeeAtDate(c, today))}</div>
                    <span className={`${styles.statusPill} ${styles[`status_${sc.replace('cc-', '')}`] || ''}`.trim()}>
                      {sl}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {filtered.length > pageSize ? (
            <div className={styles.pagination}>
              <span>
                Exibindo {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, filtered.length)} de {filtered.length}
              </span>
              <div className={styles.pageButtons}>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.pageButton} ${page === value ? styles.pageButtonActive : ''}`.trim()}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {modalOpen && (
        canCreate ? (
          <ClientFormModal
            mode="create"
            squads={squads || []}
            users={userDirectory || []}
            onClose={() => setModalOpen(false)}
            onSaved={handleCreated}
          />
        ) : null
      )}

      {selectedClient && (
        <ClientDetailDrawer
          client={selectedClient}
          squads={squads || []}
          users={userDirectory || []}
          canEditClient={canEditClientRecord(user, selectedClient)}
          canViewFeeSchedule={canViewClientFeeScheduleRecord(user, selectedClient)}
          canEditFeeSchedule={canEditClientFeeScheduleRecord(user, selectedClient)}
          canDelete={canDeleteClientRecord(user, selectedClient)}
          onClose={closeDetail}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
