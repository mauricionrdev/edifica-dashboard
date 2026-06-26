import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  canCreateClients,
  canDeleteClientRecord,
  canEditClientFeeScheduleRecord,
  canEditClientRecord,
  canViewClientFeeScheduleRecord,
  hasPermission,
} from '../../utils/permissions.js';
import {
  clientInitials,
  fmtDateBR,
  getClientOnboardingDays,
  onboardingDaysLabel,
  onboardingDaysTone,
  isEndingSoon,
  isExpired,
  statusLabel,
} from '../../utils/clientHelpers.js';
import { CLIENT_STATUS, isActiveClientStatus, isVisibleClientStatus } from '../../utils/clientStatus.js';
import { fmtMoney } from '../../utils/format.js';
import { resolveClientFeeAtDate } from '../../utils/feeSchedule.js';
import { getClientAvatar, subscribeAvatarChange } from '../../utils/avatarStorage.js';
import { matchesAnySearch } from '../../utils/search.js';
import StateBlock from '../../components/ui/StateBlock.jsx';
import { ChartColumnIcon, ChevronDownIcon, ClipboardListIcon, PlusIcon, SearchIcon } from '../../components/ui/Icons.jsx';
import { BareBadge, BareButton } from '../../components/design-system/index.js';
import DesignLabClientCreateModal from './DesignLabClientCreateModal.jsx';
import DesignLabClientDetailModal from './DesignLabClientDetailModal.jsx';
import '../../styles/design-system/barely-there.css';
import styles from './DesignLabClientsPage.module.css';

const SCOPES = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'onboarding', label: 'Onboard' },
  { key: 'paused', label: 'Pausados' },
  { key: 'churn', label: 'Churn' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'expired', label: 'Vencidos' },
  { key: 'ending', label: 'Vencendo' },
  { key: 'tcv', label: 'TCV', tone: 'purple' },
  { key: 'internalCommercial', label: 'Comercial Interno', tone: 'purple' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const ANALYSIS_ITEMS = [
  { key: 'icp', tab: 'icp', label: 'Análise ICP', className: 'analysisIcp', icon: ChartColumnIcon },
  { key: 'gdv', tab: 'gdv', label: 'Análise GDV', className: 'analysisGdv', icon: ChartColumnIcon },
  { key: 'routes', tab: 'routes', label: 'Resumo de Rotas', className: 'analysisRoutes', icon: ClipboardListIcon },
];

function isTcvClient(client) {
  return client?.contractType === 'tcv' || client?.contract_type === 'tcv' || client?.isTcv === true;
}

function hasInternalCommercial(client) {
  return Boolean(client?.internalCommercial || client?.internal_commercial_enabled) && Boolean(String(client?.internalSeller || client?.internal_seller || '').trim());
}

function getInternalSeller(client) {
  return String(client?.internalSeller || client?.internal_seller || '').trim();
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function contractEndInfo(client, today = new Date()) {
  const end = parseDateOnly(client?.endDate || client?.end_date);
  if (!end) return { label: 'Sem término', tone: 'muted', days: null };

  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.round((target.getTime() - base.getTime()) / 86400000);

  if (diff < 0) {
    const days = Math.abs(diff);
    return { label: `Vencido há ${days} ${days === 1 ? 'dia' : 'dias'}`, tone: 'danger', days: diff };
  }
  if (diff === 0) return { label: 'Vence hoje', tone: 'danger', days: diff };
  if (diff <= 7) return { label: `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`, tone: 'danger', days: diff };
  if (diff <= 30) return { label: `Vence em ${diff} dias`, tone: 'warning', days: diff };
  if (diff <= 60) return { label: `Vence em ${diff} dias`, tone: 'info', days: diff };
  return { label: `Vence em ${diff} dias`, tone: 'muted', days: diff };
}

function dueProgressValue(due) {
  if (!Number.isFinite(Number(due?.days))) return 0;
  const days = Number(due.days);
  if (days <= 0) return 100;
  if (days >= 120) return 12;
  return Math.max(12, Math.min(100, Math.round(((120 - days) / 120) * 100)));
}

function statusTone(client, today) {
  if (isExpired(client, today)) return 'danger';
  if (client?.status === CLIENT_STATUS.CHURN) return 'danger';
  if (client?.status === CLIENT_STATUS.FINISHED) return 'muted';
  if (client?.status === CLIENT_STATUS.ONBOARDING) return 'info';
  if (client?.status === CLIENT_STATUS.RAMPAGE) return 'warning';
  if (client?.status === CLIENT_STATUS.PAUSED) return 'muted';
  if (isActiveClientStatus(client?.status)) return 'success';
  return 'muted';
}

function listStatusTone(client, today) {
  if (client?.status === CLIENT_STATUS.RAMPAGE) return 'muted';
  return statusTone(client, today);
}

function analysisCount(client, key) {
  const counts = client?.analysisCounts || client?.analysesCount || client?.analysisSummary || {};
  const aliases = {
    icp: ['icp'],
    gdv: ['gdv', 'gdvanalise'],
    routes: ['routes', 'route_summary'],
  }[key] || [key];

  for (const alias of aliases) {
    const value = Number(counts?.[alias]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function dueSortValue(client) {
  const end = parseDateOnly(client?.endDate || client?.end_date);
  return end ? end.getTime() : Number.MAX_SAFE_INTEGER;
}

function createdSortValue(client) {
  const timestamp = Date.parse(client?.createdAt || client?.created_at || client?.updatedAt || client?.updated_at || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function clientSquadVisual(squads, client) {
  const squadId = client?.squadId || client?.squad_id;
  const squadName = client?.squadName || client?.squad_name || '';
  const match = (Array.isArray(squads) ? squads : []).find((squad) => (
    String(squad?.id) === String(squadId || '') ||
    String(squad?.name || '').toLowerCase() === String(squadName || '').toLowerCase()
  ));
  const coverUrl = match?.coverUrl || match?.cover_url || match?.bannerUrl || match?.banner_url || '';
  return {
    name: squadName || match?.name || 'Sem squad',
    coverUrl,
  };
}

export default function DesignLabClientsPage() {
  const { clients, squads, userDirectory, loading, error, refreshClients, setPanelHeader } = useOutletContext();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const canCreate = canCreateClients(user);
  const canOpenTemplate = hasPermission(user, 'project_template.view') || hasPermission(user, 'project_template.edit');
  const [query, setQuery] = useState(() => searchParams.get('search') || '');
  const [scope, setScope] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [today, setToday] = useState(() => new Date());
  const searchRef = useRef(null);
  const filterRef = useRef(null);
  const pageSizeRef = useRef(null);

  useEffect(() => {
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const interval = setInterval(() => {
      const now = new Date();
      setToday((current) => (dayKey(current) === dayKey(now) ? current : now));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => subscribeAvatarChange(() => setAvatarVersion((current) => current + 1)), []);

  useEffect(() => {
    if (!pageSizeOpen) return undefined;
    const onPointerDown = (event) => {
      if (!pageSizeRef.current || pageSizeRef.current.contains(event.target)) return;
      setPageSizeOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPageSizeOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pageSizeOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const onPointerDown = (event) => {
      if (!searchRef.current || searchRef.current.contains(event.target)) return;
      setSearchOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const onPointerDown = (event) => {
      if (!filterRef.current || filterRef.current.contains(event.target)) return;
      setFilterOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen]);

  const visibleBase = useMemo(
    () => (Array.isArray(clients) ? clients : []).filter((client) => isVisibleClientStatus(client.status)),
    [clients]
  );

  const counts = useMemo(() => ({
    all: visibleBase.length,
    active: visibleBase.filter((client) => isActiveClientStatus(client.status) && !isExpired(client, today)).length,
    onboarding: visibleBase.filter((client) => client.status === CLIENT_STATUS.ONBOARDING).length,
    paused: visibleBase.filter((client) => client.status === CLIENT_STATUS.PAUSED).length,
    churn: visibleBase.filter((client) => client.status === CLIENT_STATUS.CHURN).length,
    finished: visibleBase.filter((client) => client.status === CLIENT_STATUS.FINISHED).length,
    expired: visibleBase.filter((client) => isExpired(client, today)).length,
    ending: visibleBase.filter((client) => isEndingSoon(client, 30, today)).length,
    tcv: visibleBase.filter(isTcvClient).length,
    internalCommercial: visibleBase.filter(hasInternalCommercial).length,
  }), [today, visibleBase]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim();
    const scoped = visibleBase.filter((client) => {
      if (scope === 'active') return isActiveClientStatus(client.status) && !isExpired(client, today);
      if (scope === 'onboarding') return client.status === CLIENT_STATUS.ONBOARDING;
      if (scope === 'paused') return client.status === CLIENT_STATUS.PAUSED;
      if (scope === 'churn') return client.status === CLIENT_STATUS.CHURN;
      if (scope === 'finished') return client.status === CLIENT_STATUS.FINISHED;
      if (scope === 'expired') return isExpired(client, today);
      if (scope === 'ending') return isEndingSoon(client, 30, today);
      if (scope === 'tcv') return isTcvClient(client);
      if (scope === 'internalCommercial') return hasInternalCommercial(client);
      return true;
    });

    const searched = !normalized
      ? scoped
      : scoped.filter((client) => matchesAnySearch([
          client.name,
          client.squadName,
          client.gestor,
          client.gdvName,
          getInternalSeller(client),
          client.contractType,
        ], normalized));

    return [...searched].sort((a, b) => {
      if (scope === 'tcv' || scope === 'ending' || scope === 'expired') {
        const byDue = dueSortValue(a) - dueSortValue(b);
        if (byDue !== 0) return byDue;
      }
      const byCreated = createdSortValue(b) - createdSortValue(a);
      if (byCreated !== 0) return byCreated;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
    });
  }, [query, scope, today, visibleBase]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safePage]);

  const selectedClient = useMemo(
    () => (Array.isArray(clients) ? clients : []).find((client) => client.id === detailId) || null,
    [clients, detailId]
  );

  const selectedScope = useMemo(
    () => SCOPES.find((item) => item.key === scope) || SCOPES[0],
    [scope]
  );

  useEffect(() => {
    setPage(1);
  }, [query, scope, pageSize]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set('search', query.trim());
    setSearchParams(next, { replace: true });
  }, [query, setSearchParams]);

  useEffect(() => {
    const title = (
      <>
        <strong>Clientes</strong>
        <span>·</span>
        <span>{counts.all} cadastrados · {counts.active} ativos</span>
      </>
    );

    const actions = (
      <div className={styles.headerActions}>
        {canOpenTemplate ? (
          <BareButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate('/modelo-oficial')}
            aria-label="Editar modelo padrão de projeto"
            title="Editar modelo padrão de projeto"
          >
            <ClipboardListIcon size={14} aria-hidden="true" />
            Modelo padrão
          </BareButton>
        ) : null}
        {canCreate ? (
          <BareButton type="button" variant="primary" size="sm" onClick={() => setModalOpen(true)}>
            <PlusIcon size={14} aria-hidden="true" />
            Novo cliente
          </BareButton>
        ) : null}
      </div>
    );

    setPanelHeader({ title, actions });
  }, [canCreate, canOpenTemplate, counts.active, counts.all, navigate, setPanelHeader]);

  const openDetail = useCallback((id, tab = 'overview') => {
    setDetailId(id);
    setDetailTab(tab);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetailTab('overview');
  }, []);

  async function handleCreated(client) {
    setModalOpen(false);
    showToast('Cliente cadastrado.', { variant: 'success' });
    await refreshClients?.();
    if (client?.id) openDetail(client.id);
  }

  async function handleUpdated(nextClient) {
    await refreshClients?.();
    if (nextClient?.id) setDetailId(nextClient.id);
  }

  async function handleDeleted() {
    closeDetail();
    await refreshClients?.();
  }

  const pageStart = filteredRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = filteredRows.length ? Math.min(safePage * pageSize, filteredRows.length) : 0;

  return (
    <div className={`btScope ${styles.page}`}>
      <section className={styles.commandLayer}>
        <div className={`${styles.searchWrap} ${styles.searchWrapOpen}`.trim()} ref={searchRef}>
          <label className={styles.searchBox}>
            <SearchIcon size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente ou squad"
              aria-label="Buscar cliente"
            />
          </label>
        </div>

        <div className={styles.filterDropdown} ref={filterRef}>
          <button
            type="button"
            className={styles.filterButton}
            onClick={() => setFilterOpen((current) => !current)}
            aria-expanded={filterOpen}
            aria-label="Filtrar clientes"
          >
            <span>{selectedScope.label}</span>
            <strong>{counts[selectedScope.key] ?? 0}</strong>
            <ChevronDownIcon size={14} aria-hidden="true" />
          </button>

          {filterOpen ? (
            <div className={styles.filterMenu} role="listbox" aria-label="Filtros de clientes">
              {SCOPES.map((item) => {
                const active = scope === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`${styles.filterOption} ${active ? styles.filterOptionActive : ''} ${item.tone === 'purple' ? styles.filterOptionPurple : ''}`.trim()}
                    onClick={() => {
                      setScope(item.key);
                      setFilterOpen(false);
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{counts[item.key] ?? 0}</strong>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className={styles.pageSizeDropdown} ref={pageSizeRef}>
          <button
            type="button"
            className={styles.pageSizeButton}
            onClick={() => setPageSizeOpen((current) => !current)}
            aria-expanded={pageSizeOpen}
            aria-label="Quantidade por página"
          >
            <span>{pageSize} por página</span>
            <ChevronDownIcon size={14} aria-hidden="true" />
          </button>

          {pageSizeOpen ? (
            <div className={styles.pageSizeMenu} role="listbox" aria-label="Quantidade de clientes por página">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.pageSizeOption} ${pageSize === option ? styles.pageSizeOptionActive : ''}`.trim()}
                  onClick={() => {
                    setPageSize(option);
                    setPageSizeOpen(false);
                  }}
                  role="option"
                  aria-selected={pageSize === option}
                >
                  {option} por página
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.board} aria-label="Clientes">
        {loading ? (
          <div className={styles.stateWrap}>
            <StateBlock variant="loading" compact title="Carregando clientes" />
          </div>
        ) : error ? (
          <div className={styles.stateWrap}>
            <StateBlock variant="error" compact title="Não foi possível carregar clientes" />
          </div>
        ) : pagedRows.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>Nenhum cliente encontrado</strong>
            <span>Ajuste a busca ou selecione outro filtro.</span>
          </div>
        ) : (
          <div className={styles.clientList}>
            {pagedRows.map((client) => {
              const avatar = getClientAvatar(client);
              const due = contractEndInfo(client, today);
              const tcv = isTcvClient(client);
              const squadVisual = clientSquadVisual(squads, client);
              const squadStyle = squadVisual.coverUrl ? { '--squad-cover': `url("${squadVisual.coverUrl}")` } : undefined;
              const internalSeller = getInternalSeller(client);
              const onboardingDays = getClientOnboardingDays(client, today);
              const showOnboardingDays = Number.isFinite(onboardingDays);
              const onboardingTone = showOnboardingDays ? onboardingDaysTone(onboardingDays) : 'neutral';
              const status = statusLabel(client, today);

              return (
                <article
                  key={client.id}
                  className={`${styles.clientItem} ${styles[`clientItem_${due.tone}`] || ''}`.trim()}
                  style={squadStyle}
                  onClick={() => openDetail(client.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDetail(client.id);
                    }
                  }}
                >
                  <div className={styles.identityBlock}>
                    <span className={styles.avatar} data-avatar-version={avatarVersion} aria-hidden="true">
                      {avatar ? <img src={avatar} alt="" /> : clientInitials(client.name)}
                    </span>
                    <span className={styles.identityText}>
                      <strong>{client.name}</strong>
                    </span>
                  </div>

                  <div className={styles.squadBlock}>
                    <strong>{squadVisual.name}</strong>
                  </div>

                  <div className={styles.typeBlock}>
                    <BareBadge tone={tcv ? 'purple' : 'muted'}>{tcv ? 'TCV' : 'Recorrente'}</BareBadge>
                  </div>

                  <strong className={styles.valueBlock}>{fmtMoney(resolveClientFeeAtDate(client, today))}</strong>

                  <div className={styles.dueBlock}>
                    <div className={styles.dueHeader}>
                      <BareBadge tone={due.tone}>{due.label}</BareBadge>
                    </div>
                  </div>

                  <div className={styles.analysisGroup} aria-label="Análises do cliente">
                    {ANALYSIS_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const count = analysisCount(client, item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.analysisButton} ${styles[item.className]}`.trim()}
                          title={item.label}
                          aria-label={`Abrir ${item.label} de ${client.name}. Registros: ${count}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(client.id, item.tab);
                          }}
                        >
                          <Icon size={13} strokeWidth={2} aria-hidden="true" />
                          {count > 0 ? <span>{count}</span> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.statusStack}>
                    {showOnboardingDays ? (
                      <BareBadge tone={onboardingTone === 'overdue' ? 'danger' : onboardingTone === 'warning' ? 'warning' : 'info'}>
                        {onboardingDaysLabel(onboardingDays)}
                      </BareBadge>
                    ) : null}
                    <BareBadge tone={listStatusTone(client, today)}>{status}</BareBadge>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <footer className={styles.pagination}>
          <span>Exibindo {pageStart}-{pageEnd} de {filteredRows.length}</span>
          <div className={styles.pageButtons}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.pageButton} ${safePage === value ? styles.pageButtonActive : ''}`.trim()}
                onClick={() => setPage(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </footer>
      </section>

      {modalOpen && canCreate ? (
        <DesignLabClientCreateModal
          squads={squads || []}
          users={userDirectory || []}
          onClose={() => setModalOpen(false)}
          onSaved={handleCreated}
        />
      ) : null}

      {selectedClient ? (
        <DesignLabClientDetailModal
          client={selectedClient}
          squads={squads || []}
          users={userDirectory || []}
          canEditClient={canEditClientRecord(user, selectedClient)}
          canViewFeeSchedule={canViewClientFeeScheduleRecord(user, selectedClient)}
          canEditFeeSchedule={canEditClientFeeScheduleRecord(user, selectedClient)}
          canViewTasks={hasPermission(user, 'tasks.view')}
          canViewProject={hasPermission(user, 'projects.view')}
          canCreateProject={hasPermission(user, 'projects.create')}
          canDelete={canDeleteClientRecord(user, selectedClient)}
          onClose={closeDetail}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          initialTab={detailTab}
        />
      ) : null}
    </div>
  );
}
