import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  Settings2,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import ClientDetailDrawer from '../../components/clients/ClientDetailDrawer.jsx';
import { listClients } from '../../api/clients.js';
import {
  getDashboardTargets,
  getRetentionMetrics,
  getSquadRanking,
  updateDashboardTargets,
} from '../../api/metrics.js';
import { listSquads } from '../../api/squads.js';
import { listUserDirectory } from '../../api/users.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { buildBarChartData, computeCentralMetrics } from '../../utils/centralMetrics.js';
import { fmtMoney, fmtPct, MONTHS_FULL } from '../../utils/format.js';
import { isActiveClientStatus } from '../../utils/clientStatus.js';
import {
  canEditClientFeeSchedule,
  canEditClients,
  canViewClientFeeSchedule,
  hasPermission,
} from '../../utils/permissions.js';
import MetricCard from '../components/MetricCard.jsx';
import Select from '../components/Select.jsx';
import styles from './NewDashboardPage.module.css';

const INTEGER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const CHURN_PROGRESS_REFERENCE = 8;

function buildPeriodOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return {
      value: `${date.getFullYear()}-${date.getMonth()}`,
      year: date.getFullYear(),
      month: date.getMonth(),
      label: `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`,
    };
  });
}

function parseClientDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : parseClientDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatInteger(value) {
  return INTEGER.format(Number(value) || 0);
}

function previousPeriod(year, month) {
  const date = new Date(year, month - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function monthParam(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function referenceDateForPeriod(year, month) {
  return `${monthParam(year, month)}-15`;
}

function progressPercent(current, target) {
  const safeTarget = Number(target) || 0;
  if (safeTarget <= 0) return 0;
  return Math.max(0, Math.min((Number(current) / safeTarget) * 100, 100));
}

function progressFromChurn(value) {
  const churn = Number(value) || 0;
  if (churn <= 0) return 0;
  return Math.max(0, Math.min((churn / CHURN_PROGRESS_REFERENCE) * 100, 100));
}

function toneFromChurn(value) {
  const churn = Number(value) || 0;
  if (churn >= 10) return 'danger';
  if (churn >= 4) return 'warning';
  return 'positive';
}

function buildKpiDelta(currentValue, previousValue, formatter, options = {}) {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  const difference = current - previous;
  if (Math.abs(difference) < 0.0001) {
    return { value: '0', tone: 'neutral' };
  }
  const positive = options.invert ? difference < 0 : difference > 0;
  const formatted = formatter
    ? formatter(Math.abs(difference))
    : formatInteger(Math.abs(difference));
  return {
    value: `${difference > 0 ? '+' : '−'}${formatted}`,
    tone: positive ? 'positive' : 'danger',
  };
}

function buildKpiPctDelta(currentValue, previousValue, options = {}) {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  if (previous === 0) {
    if (current === 0) return { value: '0%', tone: 'neutral' };
    return { value: 'novo', tone: options.invert ? 'danger' : 'positive' };
  }
  const percentage = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(percentage) < 0.1) return { value: '0%', tone: 'neutral' };
  const positive = options.invert ? percentage < 0 : percentage > 0;
  return {
    value: `${percentage > 0 ? '+' : '−'}${Math.abs(percentage).toFixed(1)}%`,
    tone: positive ? 'positive' : 'danger',
  };
}

function moveItem(order, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return order;
  const next = [...order];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) return order;
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function clientInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'CL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function isPremium(client) {
  const value = client?.isPremium ?? client?.is_premium ?? client?.cliente_premium;
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

function buildClientActivities(clients = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (Array.isArray(clients) ? clients : [])
    .map((client) => {
      const churn = parseClientDate(client?.churnDate);
      const status = String(client?.status || '').toLowerCase();
      const endDate = parseClientDate(client?.endDate);
      const hasChurn = status === 'churn' || Boolean(churn);

      if (!endDate || hasChurn || !isActiveClientStatus(client?.status)) return null;

      const daysLeft = Math.ceil(
        (endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysLeft < 0) return null;

      return {
        key: `${client.id}-expiring`,
        client,
        date: endDate,
        daysLeft,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);
}

function formatLtvMonths(value) {
  const months = Number(value) || 0;
  if (months <= 0) return '0 mês';
  if (months < 1) return `${months.toFixed(1).replace('.', ',')} mês`;
  const rounded = months >= 10 ? Math.round(months) : Number(months.toFixed(1));
  return `${String(rounded).replace('.', ',')} ${rounded === 1 ? 'mês' : 'meses'}`;
}

function retentionDistributionLabel(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const top = source.reduce(
    (best, item) => (
      Number(item?.count || 0) > Number(best?.count || 0) ? item : best
    ),
    source[0] || null
  );
  if (!top || Number(top.count || 0) <= 0) return 'Sem churn no período';
  return `${top.label} · ${formatInteger(top.count)} cliente${Number(top.count) === 1 ? '' : 's'}`;
}

function LoadingState() {
  return (
    <div className={styles.loadingGrid} aria-label="Carregando dashboard">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={styles.loadingMetric} />
      ))}
      <span className={styles.loadingPanel} />
      <span className={styles.loadingPanel} />
    </div>
  );
}

function GoalCard({ title, value, detail, target, progress, tone = 'neutral' }) {
  return (
    <article className={`${styles.goalCard} ${styles[`goal_${tone}`] || ''}`.trim()}>
      <div className={styles.goalHeader}>
        <span>{title}</span>
        <em>{target}</em>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      <i aria-hidden="true">
        <b style={{ width: `${Math.max(0, Math.min(Number(progress) || 0, 100))}%` }} />
      </i>
    </article>
  );
}

export default function NewDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const periodOptions = useMemo(buildPeriodOptions, []);
  const [periodValue, setPeriodValue] = useState(periodOptions[0]?.value || '');
  const [squadId, setSquadId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState([]);
  const [squads, setSquads] = useState([]);
  const [userDirectory, setUserDirectory] = useState([]);
  const [globalGoal, setGlobalGoal] = useState(null);
  const [retentionSummary, setRetentionSummary] = useState(null);
  const [dashboardTargets, setDashboardTargets] = useState({
    churnTarget: 0,
    revenueLostTarget: 0,
  });
  const [targetDraft, setTargetDraft] = useState({
    churnTarget: '0',
    revenueLostTarget: '0',
  });
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [targetsSaving, setTargetsSaving] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [draggingMetric, setDraggingMetric] = useState('');
  const [metricOrder, setMetricOrder] = useState([
    'base',
    'novosAtual',
    'churnCount',
    'churn',
    'perdida',
    'squadMrr',
  ]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [error, setError] = useState('');
  const [baseNotice, setBaseNotice] = useState('');
  const [indicatorNotice, setIndicatorNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const period = useMemo(
    () => periodOptions.find((item) => item.value === periodValue) || periodOptions[0],
    [periodOptions, periodValue]
  );

  const reloadClients = useCallback(async () => {
    const response = await listClients();
    setClients(Array.isArray(response?.clients) ? response.clients : []);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadBaseData() {
      setLoadingBase(true);
      setError('');
      setBaseNotice('');

      const [clientsResult, squadsResult, usersResult] = await Promise.allSettled([
        listClients(),
        listSquads(),
        listUserDirectory(),
      ]);
      if (!active) return;

      if (clientsResult.status === 'fulfilled') {
        setClients(
          Array.isArray(clientsResult.value?.clients)
            ? clientsResult.value.clients
            : []
        );
      } else {
        setClients([]);
        setError(
          clientsResult.reason?.message || 'Não foi possível carregar os clientes.'
        );
      }

      if (squadsResult.status === 'fulfilled') {
        setSquads(
          Array.isArray(squadsResult.value?.squads)
            ? squadsResult.value.squads
            : []
        );
      } else {
        setSquads([]);
      }

      if (usersResult.status === 'fulfilled') {
        setUserDirectory(
          (Array.isArray(usersResult.value?.users) && usersResult.value.users)
          || (Array.isArray(usersResult.value?.directory) && usersResult.value.directory)
          || []
        );
      } else {
        setUserDirectory([]);
      }

      if (squadsResult.status === 'rejected' || usersResult.status === 'rejected') {
        setBaseNotice(
          'Parte dos dados auxiliares do Dashboard não pôde ser carregada pelo backend.'
        );
      }
      setLoadingBase(false);
    }

    loadBaseData();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    async function loadIndicators() {
      setIndicatorNotice('');
      const dashboardMonth = monthParam(period.year, period.month);
      const [rankingResult, targetsResult, retentionResult] = await Promise.allSettled([
        getSquadRanking({
          date: referenceDateForPeriod(period.year, period.month),
        }),
        getDashboardTargets({ month: dashboardMonth }),
        getRetentionMetrics({ month: dashboardMonth, squadId }),
      ]);
      if (!active) return;

      setGlobalGoal(
        rankingResult.status === 'fulfilled'
          ? rankingResult.value?.globalGoal || null
          : null
      );

      if (targetsResult.status === 'fulfilled') {
        const targets = targetsResult.value?.targets || {};
        const nextTargets = {
          churnTarget: Number(targets.churnTarget) || 0,
          revenueLostTarget: Number(targets.revenueLostTarget) || 0,
        };
        setDashboardTargets(nextTargets);
        setTargetDraft({
          churnTarget: String(nextTargets.churnTarget || 0),
          revenueLostTarget: String(nextTargets.revenueLostTarget || 0),
        });
      } else {
        setDashboardTargets({ churnTarget: 0, revenueLostTarget: 0 });
      }

      setRetentionSummary(
        retentionResult.status === 'fulfilled'
          ? retentionResult.value?.summary || null
          : null
      );

      if (
        rankingResult.status === 'rejected'
        || targetsResult.status === 'rejected'
        || retentionResult.status === 'rejected'
      ) {
        setIndicatorNotice(
          'Parte dos indicadores do Dashboard não pôde ser carregada pelo backend.'
        );
      }
    }

    loadIndicators();
    return () => {
      active = false;
    };
  }, [period.month, period.year, squadId, refreshKey]);

  const squadOptions = useMemo(
    () => [
      { value: '', label: 'Todos os Squads' },
      ...squads
        .filter((squad) => squad?.id && squad?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
        .map((squad) => ({
          value: squad.id,
          label: squad.name,
          avatar: squad.logoUrl || squad.logo_url || '',
        })),
    ],
    [squads]
  );

  const clientOptions = useMemo(() => {
    const source = squadId
      ? clients.filter(
          (client) => String(client.squadId || client.squad_id) === String(squadId)
        )
      : clients;
    return [
      { value: '', label: 'Todos os clientes' },
      ...source
        .filter((client) => client?.id && client?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
        .map((client) => ({
          value: client.id,
          label: client.name,
          avatar: client.avatarUrl || client.avatar_url || '',
        })),
    ];
  }, [clients, squadId]);

  useEffect(() => {
    if (!clientId) return;
    const visible = clientOptions.some(
      (option) => String(option.value) === String(clientId)
    );
    if (!visible) setClientId('');
  }, [clientId, clientOptions]);

  const visibleClients = useMemo(() => {
    let source = clients;
    if (squadId) {
      source = source.filter(
        (client) => String(client.squadId || client.squad_id) === String(squadId)
      );
    }
    if (clientId) {
      source = source.filter((client) => String(client.id) === String(clientId));
    }
    return source;
  }, [clientId, clients, squadId]);

  const metrics = useMemo(
    () => computeCentralMetrics(visibleClients, period.year, period.month),
    [period.month, period.year, visibleClients]
  );
  const previous = useMemo(
    () => previousPeriod(period.year, period.month),
    [period.month, period.year]
  );
  const previousMetrics = useMemo(
    () => computeCentralMetrics(visibleClients, previous.year, previous.month),
    [previous.month, previous.year, visibleClients]
  );
  const currentMonthNewClients = useMemo(
    () => visibleClients.filter((client) => {
      const start = parseClientDate(client.startDate);
      return (
        start
        && start.getFullYear() === period.year
        && start.getMonth() === period.month
      );
    }).length,
    [period.month, period.year, visibleClients]
  );
  const entryRows = useMemo(
    () => buildBarChartData(visibleClients, period.year, period.month, 6),
    [period.month, period.year, visibleClients]
  );
  const activities = useMemo(
    () => buildClientActivities(visibleClients),
    [visibleClients]
  );

  const totalClients = metrics.total ?? 0;
  const mrr = metrics.mrr ?? 0;
  const revenueLost = metrics.revLost ?? 0;
  const churnedPeriod = metrics.churnedPeriodCnt ?? 0;
  const finishedPeriod = metrics.finishedPeriodCnt ?? 0;
  const lostPeriod = metrics.lostPeriodCnt ?? churnedPeriod + finishedPeriod;
  const selectedSquadName = squadId
    ? squads.find((squad) => String(squad.id) === String(squadId))?.name
      || 'Squad selecionado'
    : 'Todos os Squads';
  const retention = retentionSummary || {
    portfolioStart: metrics.churnBaseCnt || 0,
    portfolioChurn: metrics.portfolioChurnedPeriodCnt || 0,
    portfolioChurnRate: metrics.churnRate || 0,
    newClients: currentMonthNewClients,
    earlyChurn: 0,
    earlyChurnRate: 0,
    ltvAverageMonths: 0,
    churnTotal: churnedPeriod,
    distribution: [],
  };
  const displayChurnRate = Number(retention.portfolioChurnRate) || 0;
  const displayChurnedPeriod = Number(retention.portfolioChurn) || 0;
  const globalGoalSummary = globalGoal || {};
  const globalTargetClients = Number(globalGoalSummary.targetClients) || 0;
  const globalClientsWithGoal = Number(globalGoalSummary.clientsWithGoal) || 0;
  const globalGoalProgress = Number(globalGoalSummary.progress)
    || progressPercent(globalClientsWithGoal, globalTargetClients);
  const globalGoalTargetPercent = Number(globalGoalSummary.targetPercent) || 80;
  const churnTargetProgress = progressPercent(
    displayChurnRate,
    dashboardTargets.churnTarget
  );
  const revenueLostProgress = progressPercent(
    revenueLost,
    dashboardTargets.revenueLostTarget
  );
  const periodLabel = period.label;
  const canEditDashboardTargets = hasPermission(user, 'ranking.view.all');
  const maxEntries = Math.max(...entryRows.map((row) => Number(row.cnt) || 0), 1);
  const selectedClient = selectedClientId
    ? clients.find((client) => String(client.id) === String(selectedClientId)) || null
    : null;

  const metricDefinitions = useMemo(() => {
    const baseDelta = buildKpiDelta(totalClients, previousMetrics.total);
    const newDelta = buildKpiDelta(
      currentMonthNewClients,
      previousMetrics.newCnt
    );
    const churnCountDelta = buildKpiDelta(
      displayChurnedPeriod,
      previousMetrics.churnedPeriodCnt,
      formatInteger,
      { invert: true }
    );
    const churnDelta = buildKpiPctDelta(
      displayChurnRate,
      previousMetrics.churnRate,
      { invert: true }
    );
    const lostDelta = buildKpiDelta(
      revenueLost,
      previousMetrics.revLost,
      fmtMoney,
      { invert: true }
    );
    const mrrDelta = buildKpiPctDelta(mrr, previousMetrics.mrr);

    return [
      {
        id: 'base',
        label: 'Clientes acumulados',
        value: formatInteger(totalClients),
        detail: 'carteira atualizada',
        meta: baseDelta.value,
        icon: Users,
        tone: baseDelta.tone,
      },
      {
        id: 'novosAtual',
        label: 'Novos clientes no mês',
        value: formatInteger(currentMonthNewClients),
        detail: 'entradas no período',
        meta: newDelta.value,
        icon: TrendingUp,
        tone: currentMonthNewClients > 0 ? 'positive' : 'neutral',
      },
      {
        id: 'churnCount',
        label: 'Clientes churn no mês',
        value: formatInteger(displayChurnedPeriod),
        detail: 'cancelamentos no período',
        meta: displayChurnedPeriod > 0 ? churnCountDelta.value : '',
        icon: BriefcaseBusiness,
        tone: displayChurnedPeriod > 0 ? 'danger' : 'neutral',
      },
      {
        id: 'churn',
        label: 'Taxa de churn',
        value: fmtPct(displayChurnRate),
        detail: displayChurnedPeriod > 0
          ? `${formatInteger(displayChurnedPeriod)} no período`
          : 'sem churn',
        meta: displayChurnedPeriod > 0 ? churnDelta.value : '',
        icon: BarChart3,
        progress: progressFromChurn(displayChurnRate),
        tone: toneFromChurn(displayChurnRate),
      },
      {
        id: 'perdida',
        label: 'Receita perdida',
        value: fmtMoney(revenueLost),
        detail: lostPeriod > 0
          ? `${formatInteger(churnedPeriod)} churn · ${formatInteger(finishedPeriod)} finalizado(s)`
          : 'sem perdas',
        meta: revenueLost > 0 ? lostDelta.value : '',
        icon: TrendingDown,
        tone: revenueLost > 0 ? 'danger' : 'neutral',
      },
      {
        id: 'squadMrr',
        label: 'MRR por Squad',
        value: fmtMoney(mrr),
        detail: selectedSquadName,
        meta: mrrDelta.value,
        icon: CircleDollarSign,
        tone: 'neutral',
      },
    ];
  }, [
    currentMonthNewClients,
    displayChurnRate,
    displayChurnedPeriod,
    finishedPeriod,
    lostPeriod,
    mrr,
    previousMetrics,
    revenueLost,
    selectedSquadName,
    churnedPeriod,
    totalClients,
  ]);

  const orderedMetrics = useMemo(() => {
    const metricMap = new Map(metricDefinitions.map((metric) => [metric.id, metric]));
    return metricOrder.map((id) => metricMap.get(id)).filter(Boolean);
  }, [metricDefinitions, metricOrder]);

  const handleSaveTargets = useCallback(async () => {
    setTargetsSaving(true);
    setTargetError('');
    try {
      const payload = {
        periodMonth: monthParam(period.year, period.month),
        churnTarget:
          Number(String(targetDraft.churnTarget).replace(',', '.')) || 0,
        revenueLostTarget:
          Number(
            String(targetDraft.revenueLostTarget)
              .replace(/\./g, '')
              .replace(',', '.')
          ) || 0,
      };
      const response = await updateDashboardTargets(payload);
      const targets = response?.targets || payload;
      const nextTargets = {
        churnTarget: Number(targets.churnTarget) || 0,
        revenueLostTarget: Number(targets.revenueLostTarget) || 0,
      };
      setDashboardTargets(nextTargets);
      setTargetDraft({
        churnTarget: String(nextTargets.churnTarget || 0),
        revenueLostTarget: String(nextTargets.revenueLostTarget || 0),
      });
      setTargetsOpen(false);
    } catch (saveError) {
      setTargetError(
        saveError?.message || 'Não foi possível salvar as metas operacionais.'
      );
    } finally {
      setTargetsSaving(false);
    }
  }, [
    period.month,
    period.year,
    targetDraft.churnTarget,
    targetDraft.revenueLostTarget,
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Dashboard</h1>
        <div className={styles.filters}>
          <Select
            value={squadId}
            options={squadOptions}
            onChange={setSquadId}
            ariaLabel="Filtrar por Squad"
            className={styles.squadSelect}
          />
          <Select
            value={clientId}
            options={clientOptions}
            onChange={setClientId}
            ariaLabel="Filtrar por cliente"
            className={styles.clientSelect}
          />
          <Select
            value={periodValue}
            options={periodOptions}
            onChange={setPeriodValue}
            ariaLabel="Selecionar período"
          />
        </div>
      </header>

      {error ? (
        <div className={styles.errorState} role="alert">
          <div>
            <strong>Não foi possível carregar o Dashboard</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {baseNotice || indicatorNotice ? (
        <div className={styles.noticeState} role="status">
          {[baseNotice, indicatorNotice].filter(Boolean).join(' ')}
        </div>
      ) : null}

      {loadingBase && clients.length === 0 ? (
        <LoadingState />
      ) : (
        <>
          <section className={styles.metricsGrid} aria-label="Indicadores principais">
            {orderedMetrics.map((metric) => (
              <MetricCard
                key={metric.id}
                {...metric}
                draggable
                dragging={draggingMetric === metric.id}
                onDragStart={() => setDraggingMetric(metric.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setMetricOrder((current) =>
                    moveItem(current, draggingMetric, metric.id)
                  );
                  setDraggingMetric('');
                }}
                onDragEnd={() => setDraggingMetric('')}
              />
            ))}
          </section>

          <section className={styles.goalsPanel} aria-label="Metas operacionais">
            <header className={styles.goalsHeader}>
              <h2>Metas operacionais</h2>
              <div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => navigate('/dashboard/indicadores-por-squad')}
                >
                  Indicadores por Squad
                </button>
                {canEditDashboardTargets ? (
                  <button
                    type="button"
                    className={styles.settingsButton}
                    onClick={() => {
                      setTargetError('');
                      setTargetsOpen(true);
                    }}
                  >
                    <Settings2 size={15} aria-hidden="true" />
                    Configurar metas
                  </button>
                ) : null}
              </div>
            </header>
            <div className={styles.goalsGrid}>
              <GoalCard
                title="Meta Global"
                value={`${formatInteger(globalClientsWithGoal)} de ${formatInteger(globalTargetClients)} clientes`}
                detail={`${fmtPct(globalGoalProgress)} · Meta ${fmtPct(globalGoalTargetPercent)}`}
                target={`${formatInteger(globalGoalSummary.remainingClients || 0)} faltam`}
                progress={globalGoalProgress}
                tone={globalGoalProgress >= 100 ? 'positive' : 'warning'}
              />
              <GoalCard
                title="Meta de Churn"
                value={fmtPct(displayChurnRate)}
                detail={
                  dashboardTargets.churnTarget > 0
                    ? `${fmtPct(churnTargetProgress)} da meta`
                    : 'meta não cadastrada'
                }
                target={
                  dashboardTargets.churnTarget > 0
                    ? `Meta ${fmtPct(dashboardTargets.churnTarget)}`
                    : 'Sem meta'
                }
                progress={churnTargetProgress}
                tone={
                  displayChurnRate <= dashboardTargets.churnTarget
                  || dashboardTargets.churnTarget === 0
                    ? 'positive'
                    : 'danger'
                }
              />
              <GoalCard
                title="Meta de Receita Perdida"
                value={fmtMoney(revenueLost)}
                detail={
                  dashboardTargets.revenueLostTarget > 0
                    ? `${fmtPct(revenueLostProgress)} da meta`
                    : 'meta não cadastrada'
                }
                target={
                  dashboardTargets.revenueLostTarget > 0
                    ? `Meta ${fmtMoney(dashboardTargets.revenueLostTarget)}`
                    : 'Sem meta'
                }
                progress={revenueLostProgress}
                tone={
                  revenueLost <= dashboardTargets.revenueLostTarget
                  || dashboardTargets.revenueLostTarget === 0
                    ? 'positive'
                    : 'danger'
                }
              />
            </div>
          </section>

          <section className={styles.insightGrid}>
            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Entradas de clientes</h2>
                  <span>Últimos seis meses</span>
                </div>
                <strong>
                  {formatInteger(
                    entryRows.reduce((sum, row) => sum + Number(row.cnt || 0), 0)
                  )}
                </strong>
              </header>

              {entryRows.some((row) => Number(row.cnt) > 0) ? (
                <div className={styles.barChart} aria-label="Entradas por mês">
                  {entryRows.map((row) => {
                    const height = Math.max(
                      8,
                      (Number(row.cnt || 0) / maxEntries) * 100
                    );
                    const current =
                      row.y === period.year && row.m === period.month;
                    return (
                      <div key={`${row.y}-${row.m}`} className={styles.barColumn}>
                        <span>{formatInteger(row.cnt)}</span>
                        <i>
                          <b
                            className={current ? styles.currentBar : ''}
                            style={{ height: `${height}%` }}
                          />
                        </i>
                        <em className={current ? styles.currentLabel : ''}>
                          {MONTHS_FULL[row.m].slice(0, 3)}
                        </em>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span>✓</span>
                  <strong>Sem entradas no período recente</strong>
                </div>
              )}
            </article>

            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Retenção mensal</h2>
                  <span>{periodLabel} · {selectedSquadName}</span>
                </div>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => navigate('/dashboard/indicadores-por-squad')}
                >
                  Ver por Squad
                </button>
              </header>

              <div className={styles.retentionPrimary}>
                <span>Churn da carteira</span>
                <strong>{fmtPct(displayChurnRate)}</strong>
                <em>
                  {formatInteger(retention.portfolioChurn)} de{' '}
                  {formatInteger(retention.portfolioStart)} clientes da base inicial
                </em>
                <i>
                  <b
                    style={{
                      width: `${Math.max(0, Math.min(displayChurnRate, 100))}%`,
                    }}
                  />
                </i>
              </div>

              <div className={styles.retentionStats}>
                <div>
                  <span>Churn precoce</span>
                  <strong>{fmtPct(retention.earlyChurnRate)}</strong>
                  <em>
                    {formatInteger(retention.earlyChurn)} de{' '}
                    {formatInteger(retention.newClients)} novos
                  </em>
                </div>
                <div>
                  <span>LTV médio</span>
                  <strong>{formatLtvMonths(retention.ltvAverageMonths)}</strong>
                  <em>clientes em churn no período</em>
                </div>
                <div>
                  <span>Churns</span>
                  <strong>{formatInteger(retention.churnTotal)}</strong>
                  <em>
                    {retentionDistributionLabel(retention.distribution)}
                  </em>
                </div>
              </div>

              {Array.isArray(retention.distribution)
              && retention.distribution.length > 0 ? (
                <div className={styles.retentionDistribution}>
                  {retention.distribution.map((item) => (
                    <div key={item.key || item.label}>
                      <span>{item.label}</span>
                      <strong>{formatInteger(item.count)}</strong>
                      <i>
                        <b
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(Number(item.percent) || 0, 100)
                            )}%`,
                          }}
                        />
                      </i>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </section>

          <section className={styles.contractsPanel}>
            <header className={styles.panelHeader}>
              <div>
                <h2>Contratos vencendo</h2>
                <span>Clientes ativos com vencimento mais próximo</span>
              </div>
              <span className={styles.contractCount}>{activities.length}</span>
            </header>

            {activities.length > 0 ? (
              <div className={styles.contractList}>
                {activities.map(({ key, client, date, daysLeft }) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.contractItem}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <span className={styles.clientAvatar}>
                      {client.avatarUrl || client.avatar_url ? (
                        <img
                          src={client.avatarUrl || client.avatar_url}
                          alt=""
                        />
                      ) : (
                        clientInitials(client.name)
                      )}
                    </span>
                    <span className={styles.clientIdentity}>
                      <span>
                        <strong>{client.name || 'Cliente'}</strong>
                        {isPremium(client) ? <em>Premium</em> : null}
                      </span>
                      <small>
                        {client.squadName || client.squad || 'Sem Squad'}
                      </small>
                    </span>
                    <span className={styles.contractDate}>
                      <strong>{formatShortDate(date)}</strong>
                      <small>
                        {daysLeft === 0
                          ? 'hoje'
                          : `${formatInteger(daysLeft)} dias`}
                      </small>
                    </span>
                    <CalendarDays size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span>✓</span>
                <strong>Nenhum contrato vencendo</strong>
              </div>
            )}
          </section>
        </>
      )}

      {targetsOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => (targetsSaving ? null : setTargetsOpen(false))}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Configurar metas operacionais"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <span>
                <Target size={17} aria-hidden="true" />
              </span>
              <div>
                <h2>Configurar metas</h2>
                <p>{periodLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setTargetsOpen(false)}
                aria-label="Fechar"
                disabled={targetsSaving}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.modalBody}>
              <label>
                <span>Meta de Churn mensal</span>
                <div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={targetDraft.churnTarget}
                    onChange={(event) =>
                      setTargetDraft((current) => ({
                        ...current,
                        churnTarget: event.target.value,
                      }))
                    }
                  />
                  <em>%</em>
                </div>
              </label>
              <label>
                <span>Meta de Receita Perdida</span>
                <div>
                  <em>R$</em>
                  <input
                    type="text"
                    value={targetDraft.revenueLostTarget}
                    onChange={(event) =>
                      setTargetDraft((current) => ({
                        ...current,
                        revenueLostTarget: event.target.value,
                      }))
                    }
                  />
                </div>
              </label>
              {targetError ? (
                <p className={styles.modalError} role="alert">
                  {targetError}
                </p>
              ) : null}
            </div>

            <footer className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setTargetsOpen(false)}
                disabled={targetsSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSaveTargets}
                disabled={targetsSaving}
              >
                {targetsSaving ? 'Salvando…' : 'Salvar metas'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedClient ? (
        <ClientDetailDrawer
          client={selectedClient}
          squads={squads}
          users={userDirectory}
          canEditClient={canEditClients(user)}
          canViewFeeSchedule={canViewClientFeeSchedule(user)}
          canEditFeeSchedule={canEditClientFeeSchedule(user)}
          canDelete={canEditClients(user)}
          onClose={() => setSelectedClientId(null)}
          onUpdated={reloadClients}
          onDeleted={() => {
            setSelectedClientId(null);
            reloadClients();
          }}
        />
      ) : null}
    </div>
  );
}
