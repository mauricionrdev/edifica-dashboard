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
import { CLIENT_STATUS, isActiveClientStatus, isRevenueClientStatus, isVisibleClientStatus, normalizeClientStatus } from '../../utils/clientStatus.js';
import { fmtMoney } from '../../utils/format.js';
import { resolveClientFeeAtDate } from '../../utils/feeSchedule.js';
import { getClientAvatar, subscribeAvatarChange } from '../../utils/avatarStorage.js';
import { matchesAnySearch } from '../../utils/search.js';
import StateBlock from '../../components/ui/StateBlock.jsx';
import {
  CalendarIcon,
  ChartColumnIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  PlusIcon,
  SearchIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from '../../components/ui/Icons.jsx';
import { BareBadge, BareButton } from '../../components/design-system/index.js';
import DesignLabClientCreateModal from '../design-lab/DesignLabClientCreateModal.jsx';
import DesignLabClientDetailModal from '../design-lab/DesignLabClientDetailModal.jsx';
import '../../styles/design-system/barely-there.css';
import styles from './ClientsV2Page.module.css';

const SCOPES = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'onboarding', label: 'Onboard' },
  { key: 'rampage', label: 'Rampagem' },
  { key: 'paused', label: 'Pausados' },
  { key: 'churn', label: 'Churn' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'expired', label: 'Vencidos' },
  { key: 'ending', label: 'Vencendo' },
  { key: 'tcv', label: 'TCV', tone: 'purple' },
  { key: 'internalCommercial', label: 'Comercial Interno', tone: 'purple' },
];

const PAGE_SIZE_OPTIONS = [12, 20, 30, 50];
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const SHORT_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromClientChurn(client) {
  const year = Number(client?.churnYear || client?.churn_year);
  const month = Number(client?.churnMonth || client?.churn_month);
  if (year && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  const raw = String(client?.churnDate || client?.churn_date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function monthLabel(monthKey, formatter = MONTH_LABEL_FORMATTER) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return 'Mês não informado';
  const [year, month] = monthKey.split('-').map(Number);
  const text = formatter.format(new Date(year, month - 1, 1));
  return text.charAt(0).toUpperCase() + text.slice(1).replace('.', '');
}

function churnPeriodLabel(client) {
  const key = monthKeyFromClientChurn(client);
  return key ? monthLabel(key, SHORT_MONTH_LABEL_FORMATTER).replace(/\s+de\s+/i, '/') : 'Mês não informado';
}

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
  const normalized = normalizeClientStatus(client?.status);
  if (normalized === CLIENT_STATUS.CHURN) return { label: `Churn ${churnPeriodLabel(client)}`, tone: 'danger', days: null };
  if (normalized === CLIENT_STATUS.FINISHED) return { label: 'Finalizado', tone: 'muted', days: null };

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

function statusTone(client, today) {
  const normalized = normalizeClientStatus(client?.status);
  if (isExpired(client, today)) return 'danger';
  if (normalized === CLIENT_STATUS.CHURN) return 'danger';
  if (normalized === CLIENT_STATUS.ONBOARDING) return 'info';
  if (normalized === CLIENT_STATUS.RAMPAGE) return 'warning';
  if (normalized === CLIENT_STATUS.PAUSED) return 'muted';
  if (normalized === CLIENT_STATUS.FINISHED) return 'muted';
  if (isActiveClientStatus(normalized)) return 'success';
  return 'muted';
}

function listStatusTone(client, today) {
  const normalized = normalizeClientStatus(client?.status);
  if (normalized === CLIENT_STATUS.RAMPAGE) return 'muted';
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

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function uniqueOptions(clients, getter) {
  return [...new Set((Array.isArray(clients) ? clients : [])
    .map(getter)
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function clientStatusKey(client) {
  return normalizeClientStatus(client?.status);
}

const ANALYSIS_ITEMS = [
  { key: 'icp', tab: 'icp', label: 'ICP', icon: ChartColumnIcon },
  { key: 'gdv', tab: 'gdv', label: 'GDV', icon: ChartColumnIcon },
  { key: 'routes', tab: 'routes', label: 'Rotas', icon: ClipboardListIcon },
];

export default function ClientsV2Page() {
  const { clients, squads, userDirectory, loading, error, refreshClients, setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const canCreate = canCreateClients(user);
  const canOpenTemplate = hasPermission(user, 'project_template.view');
  const [query, setQuery] = useState(() => searchParams.get('search') || '');
  const [scope, setScope] = useState(() => {
    const initial = searchParams.get('scope') || 'all';
    return SCOPES.some((item) => item.key === initial) ? initial : 'all';
  });
  const [squadFilter, setSquadFilter] = useState(() => searchParams.get('squad') || '');
  const [gdvFilter, setGdvFilter] = useState(() => searchParams.get('gdv') || '');
  const [managerFilter, setManagerFilter] = useState(() => searchParams.get('gestor') || '');
  const [churnMonth, setChurnMonth] = useState(() => searchParams.get('churnMonth') || currentMonthKey());
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [today, setToday] = useState(() => new Date());
  const tableTopRef = useRef(null);

  useEffect(() => {
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const interval = setInterval(() => {
      const now = new Date();
      setToday((current) => (dayKey(current) === dayKey(now) ? current : now));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => subscribeAvatarChange(() => setAvatarVersion((current) => current + 1)), []);

  const visibleBase = useMemo(
    () => (Array.isArray(clients) ? clients : []).filter((client) => isVisibleClientStatus(client.status)),
    [clients]
  );

  const counts = useMemo(() => ({
    all: visibleBase.length,
    active: visibleBase.filter((client) => isActiveClientStatus(clientStatusKey(client)) && !isExpired(client, today)).length,
    onboarding: visibleBase.filter((client) => clientStatusKey(client) === CLIENT_STATUS.ONBOARDING).length,
    rampage: visibleBase.filter((client) => clientStatusKey(client) === CLIENT_STATUS.RAMPAGE).length,
    paused: visibleBase.filter((client) => clientStatusKey(client) === CLIENT_STATUS.PAUSED).length,
    churn: visibleBase.filter((client) => clientStatusKey(client) === CLIENT_STATUS.CHURN).length,
    finished: visibleBase.filter((client) => clientStatusKey(client) === CLIENT_STATUS.FINISHED).length,
    expired: visibleBase.filter((client) => isExpired(client, today)).length,
    ending: visibleBase.filter((client) => isEndingSoon(client, 30, today)).length,
    tcv: visibleBase.filter(isTcvClient).length,
    internalCommercial: visibleBase.filter(hasInternalCommercial).length,
    revenue: visibleBase.filter((client) => isRevenueClientStatus(clientStatusKey(client))).length,
  }), [today, visibleBase]);

  const summary = useMemo(() => {
    const revenueClients = visibleBase.filter((client) => isRevenueClientStatus(clientStatusKey(client)));
    const mrr = revenueClients.reduce((sum, client) => sum + numberValue(resolveClientFeeAtDate(client, today)), 0);
    const risk = visibleBase.filter((client) => isExpired(client, today) || isEndingSoon(client, 30, today));
    return { mrr, risk: risk.length };
  }, [today, visibleBase]);

  const churnMonthOptions = useMemo(() => {
    const values = new Set([currentMonthKey(today)]);
    visibleBase.forEach((client) => {
      if (clientStatusKey(client) !== CLIENT_STATUS.CHURN) return;
      const key = monthKeyFromClientChurn(client);
      if (key) values.add(key);
    });
    return [...values].sort((a, b) => b.localeCompare(a));
  }, [today, visibleBase]);

  const squadOptions = useMemo(() => uniqueOptions(visibleBase, (client) => client?.squadName || client?.squad_name), [visibleBase]);
  const gdvOptions = useMemo(() => uniqueOptions(visibleBase, (client) => client?.gdvName || client?.gdv_name), [visibleBase]);
  const managerOptions = useMemo(() => uniqueOptions(visibleBase, (client) => client?.gestor || client?.trafficManagerName || client?.traffic_manager_name), [visibleBase]);

  useEffect(() => {
    if (scope !== 'churn') return;
    if (churnMonth) return;
    setChurnMonth(churnMonthOptions[0] || currentMonthKey(today));
  }, [churnMonth, churnMonthOptions, scope, today]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim();
    const scoped = visibleBase.filter((client) => {
      const status = clientStatusKey(client);
      if (scope === 'active' && !(isActiveClientStatus(status) && !isExpired(client, today))) return false;
      if (scope === 'onboarding' && status !== CLIENT_STATUS.ONBOARDING) return false;
      if (scope === 'rampage' && status !== CLIENT_STATUS.RAMPAGE) return false;
      if (scope === 'paused' && status !== CLIENT_STATUS.PAUSED) return false;
      if (scope === 'churn' && !(status === CLIENT_STATUS.CHURN && (!churnMonth || monthKeyFromClientChurn(client) === churnMonth))) return false;
      if (scope === 'finished' && status !== CLIENT_STATUS.FINISHED) return false;
      if (scope === 'expired' && !isExpired(client, today)) return false;
      if (scope === 'ending' && !isEndingSoon(client, 30, today)) return false;
      if (scope === 'tcv' && !isTcvClient(client)) return false;
      if (scope === 'internalCommercial' && !hasInternalCommercial(client)) return false;

      if (squadFilter && String(client?.squadName || client?.squad_name || '') !== squadFilter) return false;
      if (gdvFilter && String(client?.gdvName || client?.gdv_name || '') !== gdvFilter) return false;
      if (managerFilter && String(client?.gestor || client?.trafficManagerName || client?.traffic_manager_name || '') !== managerFilter) return false;

      return true;
    });

    const searched = !normalized
      ? scoped
      : scoped.filter((client) => matchesAnySearch([
          client.name,
          client.squadName,
          client.squad_name,
          client.gestor,
          client.trafficManagerName,
          client.gdvName,
          client.gdv_name,
          getInternalSeller(client),
          client.contractType,
          client.icp,
          client.routeName,
          client.route_name,
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
  }, [churnMonth, gdvFilter, managerFilter, query, scope, squadFilter, today, visibleBase]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safePage]);

  const selectedClient = useMemo(
    () => (Array.isArray(clients) ? clients : []).find((client) => String(client.id) === String(detailId)) || null,
    [clients, detailId]
  );

  useEffect(() => {
    setPage(1);
  }, [churnMonth, gdvFilter, managerFilter, pageSize, query, scope, squadFilter]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set('search', query.trim());
    if (scope !== 'all') next.set('scope', scope);
    if (squadFilter) next.set('squad', squadFilter);
    if (gdvFilter) next.set('gdv', gdvFilter);
    if (managerFilter) next.set('gestor', managerFilter);
    if (scope === 'churn' && churnMonth) next.set('churnMonth', churnMonth);
    setSearchParams(next, { replace: true });
  }, [churnMonth, gdvFilter, managerFilter, query, scope, setSearchParams, squadFilter]);

  useEffect(() => {
    const title = (
      <>
        <strong>Clientes</strong>
        <span>·</span>
        <span>{counts.all} cadastrados · {counts.active} ativos</span>
      </>
    );

    const actions = (
      <div className={styles.panelActions}>
        {canOpenTemplate ? (
          <BareButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate('/modelo-oficial')}
            aria-label="Abrir modelo padrão"
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

    setPanelHeader?.({ title, actions });
    return () => setPanelHeader?.(null);
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

  const resetFilters = () => {
    setQuery('');
    setScope('all');
    setSquadFilter('');
    setGdvFilter('');
    setManagerFilter('');
    setChurnMonth(currentMonthKey(today));
    tableTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const pageStart = filteredRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = filteredRows.length ? Math.min(safePage * pageSize, filteredRows.length) : 0;
  const hasFilters = query.trim() || scope !== 'all' || squadFilter || gdvFilter || managerFilter || (scope === 'churn' && churnMonth !== currentMonthKey(today));

  return (
    <div className={`btScope ${styles.page}`}>
      <section className={styles.commandLayer} aria-label="Controle da carteira de clientes">
        <label className={styles.searchBox}>
          <SearchIcon size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, squad, GDV, gestor, ICP ou rota"
            aria-label="Buscar cliente"
          />
        </label>

        <div className={styles.segmentCloud} aria-label="Escopos da carteira">
          {SCOPES.map((item) => {
            const active = scope === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`${styles.segmentChip} ${item.tone === 'purple' ? styles.segmentChipPurple : ''} ${active ? styles.segmentChipActive : ''}`.trim()}
                onClick={() => setScope(item.key)}
                aria-pressed={active}
              >
                <span>{item.label}</span>
                <strong>{counts[item.key] ?? 0}</strong>
              </button>
            );
          })}
        </div>

        <div className={styles.filterStrip} aria-label="Filtros da carteira">
          <label className={styles.selectPill}>
            <span>Squad</span>
            <select value={squadFilter} onChange={(event) => setSquadFilter(event.target.value)}>
              <option value="">Todos</option>
              {squadOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className={styles.selectPill}>
            <span>GDV</span>
            <select value={gdvFilter} onChange={(event) => setGdvFilter(event.target.value)}>
              <option value="">Todos</option>
              {gdvOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className={styles.selectPill}>
            <span>Gestor</span>
            <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
              <option value="">Todos</option>
              {managerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          {scope === 'churn' ? (
            <label className={styles.selectPill}>
              <span>Mês</span>
              <select value={churnMonth} onChange={(event) => setChurnMonth(event.target.value)}>
                {churnMonthOptions.map((option) => <option key={option} value={option}>{monthLabel(option)}</option>)}
              </select>
            </label>
          ) : null}
          <label className={styles.selectPill}>
            <span>Exibição</span>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className={styles.clearButton} onClick={resetFilters}>Limpar</button>
          ) : null}
        </div>
      </section>

      <section className={styles.board} aria-label="Lista de clientes" ref={tableTopRef}>
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
            <span>Ajuste a busca ou os filtros para localizar outro grupo da carteira.</span>
          </div>
        ) : (
          <div className={styles.clientList}>
            {pagedRows.map((client) => {
              const avatar = getClientAvatar(client);
              const due = contractEndInfo(client, today);
              const tcv = isTcvClient(client);
              const squadVisual = clientSquadVisual(squads, client);
              const internalSeller = getInternalSeller(client);
              const onboardingDays = getClientOnboardingDays(client, today);
              const showOnboardingDays = Number.isFinite(onboardingDays);
              const onboardingTone = showOnboardingDays ? onboardingDaysTone(onboardingDays) : 'neutral';
              const status = statusLabel(client, today);
              const normalizedStatus = clientStatusKey(client);
              const fee = resolveClientFeeAtDate(client, today);
              const managerName = client?.gestor || client?.trafficManagerName || client?.traffic_manager_name || 'Sem gestor';
              const gdvName = client?.gdvName || client?.gdv_name || 'Sem GDV';
              const rowTone = due.tone && styles[`clientItem_${due.tone}`] ? styles[`clientItem_${due.tone}`] : '';
              const squadCover = squadVisual.coverUrl ? { '--squad-cover': `url("${squadVisual.coverUrl}")` } : undefined;

              return (
                <button
                  key={client.id}
                  type="button"
                  className={`${styles.clientItem} ${rowTone}`.trim()}
                  style={squadCover}
                  onClick={() => openDetail(client.id)}
                >
                  <span className={styles.identityBlock}>
                    <span className={styles.avatar} data-avatar-version={avatarVersion} aria-hidden="true">
                      {avatar ? <img src={avatar} alt="" /> : clientInitials(client.name)}
                    </span>
                    <span className={styles.identityText}>
                      <strong>{client.name}</strong>
                      <small>{client?.routeName || client?.route_name || client?.icp || 'Sem rota vinculada'}</small>
                    </span>
                  </span>

                  <span className={styles.statusStack}>
                    <BareBadge tone={listStatusTone(client, today)}>{status}</BareBadge>
                    {showOnboardingDays ? (
                      <BareBadge tone={onboardingTone === 'overdue' ? 'danger' : onboardingTone === 'warning' ? 'warning' : 'info'}>
                        {onboardingDaysLabel(onboardingDays)}
                      </BareBadge>
                    ) : null}
                    {normalizedStatus === CLIENT_STATUS.CHURN ? <BareBadge tone="muted">{churnPeriodLabel(client)}</BareBadge> : null}
                    {normalizedStatus === CLIENT_STATUS.FINISHED ? <BareBadge tone="muted">Finalizado</BareBadge> : null}
                  </span>

                  <span className={styles.squadBlock}>
                    <strong>{squadVisual.name}</strong>
                  </span>

                  <span className={styles.valueBlock}>{fmtMoney(fee)}</span>

                  <span className={styles.contractTags}>
                    <BareBadge tone={tcv ? 'purple' : 'muted'}>{tcv ? 'TCV' : 'Recorrente'}</BareBadge>
                    {internalSeller ? <BareBadge tone="purple">Comercial interno</BareBadge> : null}
                  </span>

                  <span className={styles.ownerBlock}>
                    <strong>{gdvName}</strong>
                    <small>{managerName}</small>
                  </span>

                  <span className={styles.dueBlock}>
                    <span className={styles.dueHeader}>
                      <BareBadge tone={due.tone}>{due.label}</BareBadge>
                      <small>{fmtDateBR(client?.startDate || client?.start_date) || 'Sem entrada'}</small>
                    </span>
                  </span>

                  <span className={styles.analysisGroup} aria-label="Análises do cliente">
                    {ANALYSIS_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const count = analysisCount(client, item.key);
                      return (
                        <span
                          key={item.key}
                          role="button"
                          tabIndex={0}
                          className={`${styles.analysisButton} ${styles[`analysis_${item.key}`] || ''}`.trim()}
                          title={item.label}
                          aria-label={`Abrir ${item.label} de ${client.name}. Registros: ${count}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(client.id, item.tab);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              openDetail(client.id, item.tab);
                            }
                          }}
                        >
                          <Icon size={13} strokeWidth={2} aria-hidden="true" />
                          {count > 0 ? <span>{count}</span> : null}
                        </span>
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <footer className={styles.pagination}>
          <span>{pageStart}-{pageEnd} de {filteredRows.length}</span>
          <div className={styles.pageButtons}>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1}>Anterior</button>
            <strong>{safePage} / {totalPages}</strong>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages}>Próxima</button>
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
