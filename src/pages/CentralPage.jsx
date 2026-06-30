import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import Select from '../components/ui/Select.jsx';
import {
  BriefcaseIcon,
  ChartColumnIcon,
  CoinsIcon,
  SettingsIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
  CloseIcon,
} from '../components/ui/Icons.jsx';
import { getDashboardTargets, getRetentionMetrics, getSquadRanking, updateDashboardTargets } from '../api/metrics.js';
import { useAuth } from '../context/AuthContext.jsx';
import { buildBarChartData, computeCentralMetrics } from '../utils/centralMetrics.js';
import { fmtMoney, fmtPct, MONTHS_FULL } from '../utils/format.js';
import { isActiveClientStatus } from '../utils/clientStatus.js';
import { getClientAvatar, getSquadAvatar } from '../utils/avatarStorage.js';
import {
  canEditClientFeeSchedule,
  canEditClients,
  canViewClientFeeSchedule,
  hasPermission,
} from '../utils/permissions.js';
import styles from './CentralPage.module.css';

function buildPeriodOptions() {
  const now = new Date();
  const options = [];
  for (let index = 0; index < 12; index += 1) {
    let year = now.getFullYear();
    let month = now.getMonth() - index;
    while (month < 0) {
      month += 12;
      year -= 1;
    }
    options.push({ y: year, m: month, label: `${MONTHS_FULL[month]} ${year}` });
  }
  return options;
}

function parseClientDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAnyDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? parseClientDate(value) : date;
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : parseAnyDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function fmtInt(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
}

const CHURN_PROGRESS_REFERENCE = 8;

function toneFromChurn(pct) {
  if (pct >= 10) return 'risk';
  if (pct >= 4) return 'warning';
  return 'good';
}

function progressFromChurn(pct) {
  const value = Number(pct) || 0;
  if (value <= 0) return 0;
  return Math.max(0, Math.min((value / CHURN_PROGRESS_REFERENCE) * 100, 100));
}

function previousPeriod(year, month0) {
  if (month0 > 0) return { y: year, m: month0 - 1 };
  return { y: year - 1, m: 11 };
}

function monthParam(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

function referenceDateForPeriod(year, month0) {
  return `${monthParam(year, month0)}-15`;
}

function progressPercent(current, target) {
  const safeTarget = Number(target) || 0;
  if (safeTarget <= 0) return 0;
  return Math.max(0, Math.min((Number(current) / safeTarget) * 100, 100));
}

function safePercent(value) {
  return Math.max(0, Math.min(Number(value) || 0, 100));
}

function formatLtvMonths(value) {
  const months = Number(value) || 0;
  if (months <= 0) return '0 mês';
  if (months < 1) return `${months.toFixed(1).replace('.', ',')} mês`;
  const rounded = months >= 10 ? Math.round(months) : Number(months.toFixed(1));
  return `${String(rounded).replace('.', ',')} ${rounded === 1 ? 'mês' : 'meses'}`;
}

function retentionDistributionLabel(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const top = safeRows.reduce((best, item) => (
    Number(item?.count || 0) > Number(best?.count || 0) ? item : best
  ), safeRows[0] || null);
  if (!top || Number(top.count || 0) <= 0) return 'sem churn no período';
  return `${top.label} · ${fmtInt(top.count)} cliente${Number(top.count) === 1 ? '' : 's'}`;
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

function buildKpiDelta(currentValue, previousValue, formatter, options = {}) {
  const cur = Number(currentValue) || 0;
  const prev = Number(previousValue) || 0;
  const diff = cur - prev;
  if (Math.abs(diff) < 0.0001) {
    return { delta: '0', deltaTone: 'flat' };
  }
  const isUp = options.invert ? diff < 0 : diff > 0;
  const deltaTone = isUp ? 'up' : 'down';
  const formatted = formatter ? formatter(Math.abs(diff)) : fmtInt(Math.abs(diff));
  const sign = diff > 0 ? '+' : '−';
  return { delta: `${sign}${formatted}`, deltaTone };
}

function buildKpiPctDelta(currentValue, previousValue, options = {}) {
  const cur = Number(currentValue) || 0;
  const prev = Number(previousValue) || 0;
  if (prev === 0) {
    if (cur === 0) return { delta: '0%', deltaTone: 'flat' };
    return { delta: 'novo', deltaTone: options.invert ? 'down' : 'up' };
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.1) return { delta: '0%', deltaTone: 'flat' };
  const isUp = options.invert ? pct < 0 : pct > 0;
  const deltaTone = isUp ? 'up' : 'down';
  const sign = pct > 0 ? '+' : '−';
  return { delta: `${sign}${Math.abs(pct).toFixed(1)}%`, deltaTone };
}

function MetricCard({
  label,
  value,
  helper,
  delta,
  deltaTone,
  icon,
  progress,
  progressTone,
  tone = 'neutral',
  draggable = false,
  dragging = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const toneClass = styles[`metricCard_${tone}`] || styles.metricCard_neutral;

  return (
    <article
      className={`${styles.metricCard} ${toneClass} ${dragging ? styles.metricCardDragging : ''}`.trim()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.metricCardTop}>
        <span className={styles.metricLabel}>{label}</span>
        {icon ? <span className={styles.metricIcon} aria-hidden="true">{icon}</span> : null}
      </div>

      <div className={styles.metricBody}>
        <strong className={styles.metricValue}>{value}</strong>
      </div>

      {delta || helper ? (
        <p className={styles.metricFooter}>
          {delta ? (
            <span className={`${styles.metricDelta} ${styles[`metricDelta_${deltaTone || 'neutral'}`]}`}>
              {delta}
            </span>
          ) : null}
          {helper ? <span className={styles.metricHelper}>{helper}</span> : null}
        </p>
      ) : null}

      {typeof progress === 'number' ? (
        <div className={styles.metricProgress}>
          <span
            className={`${styles.metricProgressBar} ${styles[`metricProgressBar_${progressTone || tone}`]}`}
            style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
          />
        </div>
      ) : null}
    </article>
  );
}


function GoalCard({ title, value, helper, target, progress, tone = 'neutral', children }) {
  return (
    <article className={`${styles.goalCard} ${styles[`goalCard_${tone}`] || styles.goalCard_neutral}`.trim()}>
      <div className={styles.goalCardHeader}>
        <span>{title}</span>
        {target ? <em>{target}</em> : null}
      </div>
      <strong className={styles.goalCardValue}>{value}</strong>
      {helper ? <p className={styles.goalCardHelper}>{helper}</p> : null}
      <div className={styles.goalCardProgress} aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(Number(progress) || 0, 100))}%` }} />
      </div>
      {children ? <div className={styles.goalCardActions}>{children}</div> : null}
    </article>
  );
}

function RetentionDashboardPanel({ summary, periodLabel, selectedSquadName, onOpenSquads }) {
  const churnRate = Number(summary?.portfolioChurnRate) || 0;
  const earlyRate = Number(summary?.earlyChurnRate) || 0;
  const ltv = Number(summary?.ltvAverageMonths) || 0;
  const distribution = Array.isArray(summary?.distribution) ? summary.distribution : [];

  return (
    <section className={styles.retentionPanel} aria-label="Indicadores de retenção do dashboard">
      <header className={styles.retentionPanelHeader}>
        <div>
          <span>Retenção mensal</span>
          <h3>Indicadores da carteira</h3>
          <p>{periodLabel} · {selectedSquadName}</p>
        </div>
        <button type="button" className={styles.retentionOpenButton} onClick={onOpenSquads}>
          Ver por Squad
        </button>
      </header>

      <div className={styles.retentionPanelGrid}>
        <article className={styles.retentionMainCard}>
          <span>Churn da Carteira</span>
          <strong>{fmtPct(churnRate)}</strong>
          <p>{fmtInt(summary?.portfolioChurn)} de {fmtInt(summary?.portfolioStart)} clientes da base inicial</p>
          <div className={styles.retentionProgress} aria-hidden="true">
            <i style={{ width: `${safePercent(churnRate)}%` }} />
          </div>
        </article>

        <article className={styles.retentionMiniCard}>
          <span>Churn Precoce</span>
          <strong>{fmtPct(earlyRate)}</strong>
          <p>{fmtInt(summary?.earlyChurn)} de {fmtInt(summary?.newClients)} novos clientes</p>
        </article>

        <article className={styles.retentionMiniCard}>
          <span>LTV Médio</span>
          <strong>{formatLtvMonths(ltv)}</strong>
          <p>média dos clientes em churn no período</p>
        </article>

        <article className={styles.retentionMiniCard}>
          <span>Distribuição do Churn</span>
          <strong>{fmtInt(summary?.churnTotal)}</strong>
          <p>{retentionDistributionLabel(distribution)}</p>
        </article>
      </div>

      <div className={styles.retentionDistributionStrip}>
        {distribution.map((item) => (
          <div key={item.key || item.label} className={styles.retentionDistributionItem}>
            <div>
              <span>{item.label}</span>
              <strong>{fmtInt(item.count)}</strong>
            </div>
            <i aria-hidden="true"><b style={{ width: `${safePercent(item.percent)}%` }} /></i>
          </div>
        ))}
      </div>
    </section>
  );
}

function getChartTickStep(scaleMax) {
  if (scaleMax <= 8) return 2;
  if (scaleMax <= 25) return 5;
  if (scaleMax <= 60) return 10;
  return 20;
}

function EntryColumnsChart({ rows = [] }) {
  const hasData = rows.some((row) => row.cnt > 0);

  if (!hasData) {
    return (
      <div className={styles.columnsPanel}>
        <div className={styles.columnsPanelHeader}>
          <h3 className={styles.columnsPanelTitle}>Entradas</h3>
        </div>
        <p className={styles.emptyState}>Sem entradas no período recente.</p>
      </div>
    );
  }

  const maxClients = Math.max(...rows.map((row) => row.cnt || 0), 0);
  const tickStep = getChartTickStep(maxClients);
  const scaleMax = Math.max(6, Math.ceil(maxClients / tickStep) * tickStep);
  const ticks = [];
  for (let value = 0; value <= scaleMax; value += tickStep) ticks.push(value);
  if (ticks[ticks.length - 1] !== scaleMax) ticks.push(scaleMax);

  const VB_W = 760;
  const VB_H = 320;
  const padding = { top: 26, right: 24, bottom: 56, left: 82 };
  const plotW = VB_W - padding.left - padding.right;
  const plotH = VB_H - padding.top - padding.bottom;
  const stepX = rows.length > 1 ? plotW / (rows.length - 1) : plotW;

  const points = rows.map((row, index) => {
    const px = padding.left + stepX * index;
    const py = padding.top + plotH - ((row.cnt || 0) / scaleMax) * plotH;
    return { ...row, px, py };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.px} ${point.py}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].px} ${padding.top + plotH} L ${points[0].px} ${padding.top + plotH} Z`;
  const currentPoint = points.find((point) => point.isNow) || points[points.length - 1];

  return (
    <div className={styles.columnsPanel}>
      <div className={styles.columnsPanelHeader}>
        <h3 className={styles.columnsPanelTitle}>Entradas</h3>
      </div>

      <div className={styles.columnsCanvas}>
        <svg
          className={styles.columnsSvg}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          aria-label="Entradas por mês"
        >
          <defs>
            <linearGradient id="entriesAreaFade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.055)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <linearGradient id="entriesLineFade" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
              <stop offset="78%" stopColor="rgba(255,255,255,0.30)" />
              <stop offset="100%" stopColor="rgba(245,184,0,0.95)" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => {
            const y = padding.top + plotH - (tick / scaleMax) * plotH;
            return (
              <g key={`grid-${tick}`}>
                <line
                  x1={padding.left}
                  x2={VB_W - padding.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.032)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={padding.left - 42}
                  y={y + 4}
                  textAnchor="end"
                  className={styles.columnsAxisText}
                >
                  {tick}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#entriesAreaFade)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#entriesLineFade)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <line
            x1={currentPoint.px}
            x2={currentPoint.px}
            y1={padding.top}
            y2={padding.top + plotH}
            stroke="rgba(245,184,0,0.12)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {points.map((point) => {
            const isCurrent = Boolean(point.isNow);
            return (
              <g key={`${point.y}-${point.m}`}>
                <circle
                  cx={point.px}
                  cy={point.py}
                  r={isCurrent ? '12' : '8'}
                  fill={isCurrent ? 'rgba(245,184,0,0.08)' : 'rgba(255,255,255,0.035)'}
                />
                <circle
                  cx={point.px}
                  cy={point.py}
                  r={isCurrent ? '6' : '4'}
                  fill={isCurrent ? 'rgba(245,184,0,0.92)' : 'rgba(232,234,238,0.82)'}
                />
                <text
                  x={point.px}
                  y={point.py - 16}
                  textAnchor="middle"
                  className={`${styles.columnsValue} ${isCurrent ? styles.columnsValueCurrent : ''}`}
                >
                  {fmtInt(point.cnt)}
                </text>
                <text
                  x={point.px}
                  y={VB_H - 28}
                  textAnchor="middle"
                  className={`${styles.columnsMonth} ${isCurrent ? styles.columnsMonthCurrent : ''}`}
                >
                  {MONTHS_FULL[point.m].slice(0, 3).toUpperCase()}
                </text>
                <text
                  x={point.px}
                  y={VB_H - 12}
                  textAnchor="middle"
                  className={styles.columnsYear}
                >
                  {String(point.y)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ComparisonPanel({ current, previous, currentLabel }) {
  const buildRow = (label, currentVal, previousVal, formatter, options = {}) => {
    const cur = Number(currentVal) || 0;
    const prev = Number(previousVal) || 0;
    const diff = cur - prev;
    const isFlat = Math.abs(diff) < 0.0001;
    let tone;
    if (isFlat) {
      tone = 'flat';
    } else if (options.invert) {
      tone = diff < 0 ? 'good' : 'risk';
    } else {
      tone = diff > 0 ? 'good' : 'risk';
    }
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const formatted = formatter ? formatter(Math.abs(diff)) : fmtInt(Math.abs(diff));
    return {
      label,
      value: formatter ? formatter(cur) : fmtInt(cur),
      delta: isFlat ? '0' : `${sign}${formatted}`,
      tone,
    };
  };

  const rows = [
    buildRow('Churn', current.churnRate, previous.churnRate, fmtPct, { invert: true }),
    buildRow('Clientes churn', current.churnedPeriodCnt, previous.churnedPeriodCnt, fmtInt, { invert: true }),
    buildRow('Receita perdida', current.revLost, previous.revLost, fmtMoney, { invert: true }),
  ];

  return (
    <section className={styles.detailsPanel}>
      <div className={styles.compareHeader}>
        <h3>Comparativo</h3>
        <span className={styles.compareHeaderHint}>{currentLabel}</span>
      </div>

      <div className={styles.compareBody}>
        <dl className={styles.compareGrid}>
          {rows.map((row) => (
            <div key={row.label} className={styles.compareItem}>
              <div className={styles.compareLeft}>
                <dt className={styles.compareLabel}>{row.label}</dt>
                <span className={`${styles.compareDelta} ${styles[`compareDelta_${row.tone}`]}`}>
                  {row.delta}
                </span>
              </div>
              <dd className={styles.compareValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function clientInitials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function ActivityPanel({ activities = [], onOpenClient }) {
  const rows = Array.isArray(activities) ? activities.slice(0, 5) : [];

  return (
    <section className={styles.activityPanel}>
      <div className={styles.activityHeader}>
        <h3>Contratos vencendo</h3>
        <span className={styles.activityHeaderBadge}>{rows.length}</span>
      </div>

      {rows.length > 0 ? (
        <div className={styles.activityList}>
          {rows.map((activity) => {
            const client = activity.client || {};
            const initials = clientInitials(client.name);
            const avatarUrl = client.avatarUrl || '';
            const fee = Number(client.fee) > 0 ? fmtMoney(client.fee) : '';
            const squad = client.squadName || client.squad || 'Sem squad';

            return (
              <button
                key={activity.key}
                type="button"
                className={styles.activityItem}
                onClick={() => onOpenClient(client.id)}
              >
                <span className={styles.activityAvatar} aria-hidden="true">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <span className={styles.activityAvatarInitials}>{initials}</span>
                  )}
                </span>

                <span className={styles.activityName}>{client.name || 'Cliente'}</span>
                <span className={styles.activityDate}>{formatShortDate(activity.date)}</span>
                <span className={styles.activitySquad}>{squad}</span>
                <span className={styles.activityFee}>{fee || 'Sem mensalidade'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className={styles.emptyState}>Nenhum contrato vencendo.</p>
      )}
    </section>
  );
}

function buildClientActivities(clients = []) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const events = [];

  (Array.isArray(clients) ? clients : []).forEach((client) => {
    const churn = parseClientDate(client?.churnDate);
    const status = String(client?.status || '').toLowerCase();
    const isChurn = status === 'churn' || Boolean(churn);
    const endDate = parseClientDate(client?.endDate);

    if (!endDate || isChurn || !isActiveClientStatus(client?.status)) return;

    const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return;

    events.push({
      key: `${client.id}-expiring`,
      client,
      date: endDate,
      diffDays,
      tone: diffDays <= 3 ? 'risk' : 'amber',
      text: '',
    });
  });

  return events
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);
}

function DashboardSkeleton() {
  return (
    <div className="content">
      <div className={styles.dashboard}>
        <section className={styles.metricsGrid}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={`${styles.metricCard} ${styles.skeletonBlock}`} />
          ))}
        </section>
        <section className={`${styles.boardSection} ${styles.skeletonTall}`} />
      </div>
    </div>
  );
}

export default function CentralPage() {
  const {
    clients,
    squads,
    userDirectory,
    loading: shellLoading,
    error: shellError,
    refreshClients,
    setPanelHeader,
  } = useOutletContext();
  const { user } = useAuth();
  const navigate = useNavigate();

  const now = useMemo(() => new Date(), []);
  const periodOptions = useMemo(buildPeriodOptions, []);
  const [period, setPeriod] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [squadFilter, setSquadFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [draggingMetric, setDraggingMetric] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [globalGoal, setGlobalGoal] = useState(null);
  const [retentionSummary, setRetentionSummary] = useState(null);
  const [dashboardTargets, setDashboardTargets] = useState({ churnTarget: 0, revenueLostTarget: 0 });
  const [targetDraft, setTargetDraft] = useState({ churnTarget: '0', revenueLostTarget: '0' });
  const [targetsModalOpen, setTargetsModalOpen] = useState(false);
  const [targetsSaving, setTargetsSaving] = useState(false);

  const clientOptions = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    const filtered = squadFilter
      ? list.filter((client) => (client.squadId || client.squad_id) === squadFilter)
      : list;
    return [...filtered]
      .filter((client) => client?.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [clients, squadFilter]);

  useEffect(() => {
    if (!clientFilter) return;
    const stillVisible = clientOptions.some((client) => client.id === clientFilter);
    if (!stillVisible) setClientFilter('');
  }, [clientFilter, clientOptions]);

  const visibleClients = useMemo(() => {
    let rows = Array.isArray(clients) ? clients : [];
    if (squadFilter) rows = rows.filter((client) => (client.squadId || client.squad_id) === squadFilter);
    if (clientFilter) rows = rows.filter((client) => client.id === clientFilter);
    return rows;
  }, [clientFilter, clients, squadFilter]);

  const selectedClient = useMemo(
    () => (selectedClientId ? (clients || []).find((client) => client.id === selectedClientId) || null : null),
    [clients, selectedClientId]
  );

  const openClientDetail = useCallback((clientId) => setSelectedClientId(clientId), []);
  const closeClientDetail = useCallback(() => setSelectedClientId(null), []);

  const handleClientUpdated = useCallback(() => {
    refreshClients?.();
  }, [refreshClients]);

  const handleClientDeleted = useCallback(() => {
    setSelectedClientId(null);
    refreshClients?.();
  }, [refreshClients]);

  const executiveMetrics = useMemo(
    () => computeCentralMetrics(visibleClients, period.y, period.m),
    [visibleClients, period]
  );
  const prevPeriod = useMemo(() => previousPeriod(period.y, period.m), [period]);
  const previousMetrics = useMemo(
    () => computeCentralMetrics(visibleClients, prevPeriod.y, prevPeriod.m),
    [prevPeriod, visibleClients]
  );

  const currentMonthNewClients = useMemo(
    () =>
      visibleClients.filter((client) => {
        const start = parseClientDate(client.startDate);
        return start && start.getFullYear() === period.y && start.getMonth() === period.m;
      }).length,
    [period.m, period.y, visibleClients]
  );

  const entryColumns = useMemo(
    () => buildBarChartData(visibleClients, period.y, period.m, 6),
    [period, visibleClients]
  );

  const recentActivities = useMemo(
    () => buildClientActivities(visibleClients),
    [visibleClients]
  );


  const dashboardMonth = useMemo(() => monthParam(period.y, period.m), [period.m, period.y]);

  useEffect(() => {
    let active = true;
    async function loadDashboardIndicators() {
      try {
        const [rankingResult, targetResult, retentionResult] = await Promise.allSettled([
          getSquadRanking({ date: referenceDateForPeriod(period.y, period.m) }),
          getDashboardTargets({ month: dashboardMonth }),
          getRetentionMetrics({ month: dashboardMonth, squadId: squadFilter }),
        ]);
        if (!active) return;
        if (rankingResult.status === 'fulfilled') {
          setGlobalGoal(rankingResult.value?.globalGoal || null);
        }
        if (targetResult.status === 'fulfilled') {
          const targets = targetResult.value?.targets || {};
          const nextTargets = {
            churnTarget: Number(targets.churnTarget) || 0,
            revenueLostTarget: Number(targets.revenueLostTarget) || 0,
          };
          setDashboardTargets(nextTargets);
          setTargetDraft({
            churnTarget: String(nextTargets.churnTarget || 0),
            revenueLostTarget: String(nextTargets.revenueLostTarget || 0),
          });
        }
        if (retentionResult.status === 'fulfilled') {
          setRetentionSummary(retentionResult.value?.summary || null);
        } else {
          setRetentionSummary(null);
        }
      } catch {
        if (active) {
          setGlobalGoal(null);
          setRetentionSummary(null);
        }
      }
    }
    loadDashboardIndicators();
    return () => { active = false; };
  }, [dashboardMonth, period.m, period.y, squadFilter]);

  const handleSaveDashboardTargets = useCallback(async () => {
    setTargetsSaving(true);
    try {
      const payload = {
        periodMonth: dashboardMonth,
        churnTarget: Number(String(targetDraft.churnTarget).replace(',', '.')) || 0,
        revenueLostTarget: Number(String(targetDraft.revenueLostTarget).replace(/\./g, '').replace(',', '.')) || 0,
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
      setTargetsModalOpen(false);
    } finally {
      setTargetsSaving(false);
    }
  }, [dashboardMonth, targetDraft.churnTarget, targetDraft.revenueLostTarget]);

  const activeClients = executiveMetrics.active ?? 0;
  const totalClients = executiveMetrics.total ?? 0;
  const mrr = executiveMetrics.mrr ?? 0;
  const revenueNew = executiveMetrics.revenueNew ?? 0;
  const ticketMedio = activeClients > 0 ? mrr / activeClients : 0;
  const revenueLost = executiveMetrics.revLost ?? 0;
  const churnRate = executiveMetrics.churnRate ?? 0;
  const churnedPeriod = executiveMetrics.churnedPeriodCnt ?? 0;
  const finishedPeriod = executiveMetrics.finishedPeriodCnt ?? 0;
  const lostPeriod = executiveMetrics.lostPeriodCnt ?? churnedPeriod + finishedPeriod;
  const selectedSquadName = squadFilter ? (squads || []).find((squad) => squad.id === squadFilter)?.name || 'Squad selecionado' : 'Todos squads';
  const dashboardRetentionSummary = retentionSummary || {
    portfolioStart: executiveMetrics.churnBaseCnt || 0,
    portfolioChurn: executiveMetrics.portfolioChurnedPeriodCnt || 0,
    portfolioChurnRate: churnRate,
    newClients: currentMonthNewClients,
    earlyChurn: 0,
    earlyChurnRate: 0,
    ltvAverageMonths: 0,
    churnTotal: churnedPeriod,
    distribution: [],
  };
  const displayChurnRate = Number(dashboardRetentionSummary.portfolioChurnRate) || 0;
  const displayChurnedPeriod = Number(dashboardRetentionSummary.portfolioChurn) || 0;
  const revenueLostProgress = progressPercent(revenueLost, dashboardTargets.revenueLostTarget);
  const churnTargetProgress = progressPercent(displayChurnRate, dashboardTargets.churnTarget);
  const globalGoalSummary = globalGoal || {};
  const globalTargetClients = Number(globalGoalSummary.targetClients) || 0;
  const globalClientsWithGoal = Number(globalGoalSummary.clientsWithGoal) || 0;
  const globalGoalProgress = Number(globalGoalSummary.progress) || progressPercent(globalClientsWithGoal, globalTargetClients);
  const globalGoalTargetPercent = Number(globalGoalSummary.targetPercent) || 80;
  const canEditDashboardTargets = hasPermission(user, 'ranking.view.all');
  const periodLabel = `${MONTHS_FULL[period.m]} ${period.y}`;

  const metricDefinitions = useMemo(
    () => {
      const prevTotal = previousMetrics.total ?? 0;
      const prevNewCnt = previousMetrics.newCnt ?? 0;
      const prevRevenueLost = previousMetrics.revLost ?? 0;
      const prevChurnRate = previousMetrics.churnRate ?? 0;
      const prevChurnedPeriod = previousMetrics.churnedPeriodCnt ?? 0;
      const prevMrr = previousMetrics.mrr ?? 0;

      const baseDelta = buildKpiDelta(totalClients, prevTotal);
      const novosDelta = buildKpiDelta(currentMonthNewClients, prevNewCnt);
      const churnCountDelta = buildKpiDelta(displayChurnedPeriod, prevChurnedPeriod, fmtInt, { invert: true });
      const churnDelta = buildKpiPctDelta(displayChurnRate, prevChurnRate, { invert: true });
      const perdidaDelta = buildKpiDelta(revenueLost, prevRevenueLost, fmtMoney, { invert: true });
      const squadMrrDelta = buildKpiPctDelta(mrr, prevMrr);

      return [
        {
          id: 'base',
          label: 'Clientes acumulados',
          value: fmtInt(totalClients),
          helper: 'carteira atualizada',
          delta: baseDelta.delta,
          deltaTone: baseDelta.deltaTone,
          icon: <UsersIcon size={14} />,
          tone: 'neutral',
        },
        {
          id: 'novosAtual',
          label: 'Novos clientes no mês',
          value: fmtInt(currentMonthNewClients),
          helper: 'entradas no período',
          delta: novosDelta.delta,
          deltaTone: novosDelta.deltaTone,
          icon: <TrendingUpIcon size={14} />,
          tone: currentMonthNewClients > 0 ? 'good' : 'neutral',
        },
        {
          id: 'churnCount',
          label: 'Clientes churn no mês',
          value: fmtInt(displayChurnedPeriod),
          helper: 'cancelamentos no período',
          delta: displayChurnedPeriod > 0 ? churnCountDelta.delta : '',
          deltaTone: churnCountDelta.deltaTone,
          icon: <BriefcaseIcon size={14} />,
          tone: displayChurnedPeriod > 0 ? 'risk' : 'neutral',
        },
        {
          id: 'churn',
          label: 'Taxa de churn',
          value: fmtPct(displayChurnRate),
          helper: displayChurnedPeriod > 0 ? `${fmtInt(displayChurnedPeriod)} no período` : 'sem churn',
          delta: displayChurnedPeriod > 0 ? churnDelta.delta : '',
          deltaTone: churnDelta.deltaTone,
          icon: <ChartColumnIcon size={14} />,
          progress: progressFromChurn(displayChurnRate),
          progressTone: 'risk',
          tone: toneFromChurn(displayChurnRate),
        },
        {
          id: 'perdida',
          label: 'Receita perdida',
          value: fmtMoney(revenueLost),
          helper: lostPeriod > 0 ? `${fmtInt(churnedPeriod)} churn · ${fmtInt(finishedPeriod)} finalizado(s)` : 'sem perdas',
          delta: revenueLost > 0 ? perdidaDelta.delta : '',
          deltaTone: perdidaDelta.deltaTone,
          icon: <ChartColumnIcon size={14} />,
          tone: revenueLost > 0 ? 'risk' : 'neutral',
        },
        {
          id: 'squadMrr',
          label: 'MRR por Squad',
          value: fmtMoney(mrr),
          helper: selectedSquadName,
          delta: squadMrrDelta.delta,
          deltaTone: squadMrrDelta.deltaTone,
          icon: <CoinsIcon size={14} />,
          tone: 'neutral',
        },
      ];
    },
    [
      displayChurnRate,
      displayChurnedPeriod,
      currentMonthNewClients,
      dashboardTargets.revenueLostTarget,
      finishedPeriod,
      lostPeriod,
      mrr,
      previousMetrics,
      revenueLost,
      selectedSquadName,
      totalClients,
    ]
  );

  const defaultMetricOrder = useMemo(() => metricDefinitions.map((metric) => metric.id), [metricDefinitions]);
  const [metricOrder, setMetricOrder] = useState(defaultMetricOrder);

  useEffect(() => {
    setMetricOrder((current) => {
      const valid = current.filter((item) => defaultMetricOrder.includes(item));
      const missing = defaultMetricOrder.filter((item) => !valid.includes(item));
      return [...valid, ...missing];
    });
  }, [defaultMetricOrder]);

  const orderedMetrics = useMemo(() => {
    const map = new Map(metricDefinitions.map((metric) => [metric.id, metric]));
    return metricOrder.map((id) => map.get(id)).filter(Boolean);
  }, [metricDefinitions, metricOrder]);

  useEffect(() => {
    const title = (
      <>
        <strong className={styles.headerTitleMain}>Dashboard</strong>
        <span className={styles.headerTitleSep} aria-hidden="true">·</span>
        <span className={styles.headerTitlePeriod}>{`${MONTHS_FULL[period.m]} ${period.y}`}</span>
      </>
    );

    const handlePeriodChange = (event) => {
      const [year, month] = event.target.value.split('-').map(Number);
      if (Number.isFinite(year) && Number.isFinite(month)) setPeriod({ y: year, m: month });
    };

    const squadsList = Array.isArray(squads) ? squads : [];
    const isSquadsLoading = shellLoading && squadsList.length === 0;

    const actions = (
      <div className={styles.toolbar}>
        <Select
          type="squad"
          value={squadFilter}
          onChange={(event) => setSquadFilter(event.target.value)}
          aria-label="Filtrar por squad"
          disabled={isSquadsLoading}
          placeholder={isSquadsLoading ? 'Carregando squads…' : 'Todos squads'}
        >
          <option value="">Todos squads</option>
          {squadsList.map((squad) => (
            <option
              key={squad.id}
              value={squad.id}
              data-avatar={getSquadAvatar(squad) || squad.avatarUrl || squad.logoUrl || ''}
              data-name={squad.name}
            >
              {squad.name}
            </option>
          ))}
        </Select>

        <Select
          type="client"
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          aria-label="Filtrar por cliente"
          disabled={shellLoading && clientOptions.length === 0}
          placeholder={shellLoading && clientOptions.length === 0 ? 'Carregando clientes…' : 'Todos clientes'}
        >
          <option value="">Todos clientes</option>
          {clientOptions.map((client) => (
            <option
              key={client.id}
              value={client.id}
              data-avatar={getClientAvatar(client) || client.avatarUrl || ''}
              data-name={client.name}
            >
              {client.name}
            </option>
          ))}
        </Select>

        <Select value={`${period.y}-${period.m}`} onChange={handlePeriodChange} aria-label="Selecionar período">
          {periodOptions.map((option) => (
            <option key={`${option.y}-${option.m}`} value={`${option.y}-${option.m}`}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    );

    setPanelHeader({ title, description: '', actions });
  }, [clientFilter, clientOptions, period, periodOptions, setPanelHeader, shellLoading, squadFilter, squads]);

  if (shellLoading && !clients?.length) return <DashboardSkeleton />;

  if (shellError && !clients?.length) {
    return (
      <div className="content">
        <div className={styles.stateBlock}>
          <strong>Não foi possível carregar o dashboard.</strong>
          <button type="button" className={styles.retryButton} onClick={refreshClients}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <>
        <div className={styles.dashboard}>
          <section className={styles.metricsGrid}>
            {orderedMetrics.map((metric) => (
              <MetricCard
                key={metric.id}
                {...metric}
                draggable
                dragging={draggingMetric === metric.id}
                onDragStart={() => setDraggingMetric(metric.id)}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setMetricOrder((current) => moveItem(current, draggingMetric, metric.id));
                  setDraggingMetric('');
                }}
                onDragEnd={() => setDraggingMetric('')}
              />
            ))}
          </section>

          <section className={styles.goalsPanel} aria-label="Metas operacionais do dashboard">
            <header className={styles.goalsPanelHeader}>
              <span>Metas operacionais</span>
              <div className={styles.goalsPanelActions}>
                <button type="button" className={styles.goalNavButton} onClick={() => navigate('/dashboard/indicadores-por-squad')}>
                  Indicadores por Squad
                </button>
                {canEditDashboardTargets ? (
                  <button
                    type="button"
                    className={styles.goalConfigButton}
                    onClick={() => setTargetsModalOpen(true)}
                    aria-label="Configurar metas operacionais"
                    title="Configurar metas operacionais"
                  >
                    <SettingsIcon size={14} aria-hidden="true" />
                    Configurar metas
                  </button>
                ) : null}
              </div>
            </header>

            <div className={styles.goalsGrid}>
              <GoalCard
                title="Meta Global"
                value={`${fmtInt(globalClientsWithGoal)} de ${fmtInt(globalTargetClients)} clientes`}
                helper={`${fmtPct(globalGoalProgress)} · Meta ${fmtPct(globalGoalTargetPercent)}`}
                target={`${fmtInt(globalGoalSummary.remainingClients || 0)} faltam`}
                progress={globalGoalProgress}
                tone={globalGoalProgress >= 100 ? 'good' : 'warning'}
              />
              <GoalCard
                title="Meta de Churn"
                value={fmtPct(displayChurnRate)}
                helper={dashboardTargets.churnTarget > 0 ? `${fmtPct(churnTargetProgress)} da meta` : 'meta não cadastrada'}
                target={dashboardTargets.churnTarget > 0 ? `Meta ${fmtPct(dashboardTargets.churnTarget)}` : 'Sem meta'}
                progress={churnTargetProgress}
                tone={displayChurnRate <= dashboardTargets.churnTarget || dashboardTargets.churnTarget === 0 ? 'good' : 'risk'}
              />
              <GoalCard
                title="Meta de Receita Perdida"
                value={fmtMoney(revenueLost)}
                helper={dashboardTargets.revenueLostTarget > 0 ? `${fmtPct(revenueLostProgress)} da meta` : 'meta não cadastrada'}
                target={dashboardTargets.revenueLostTarget > 0 ? `Meta ${fmtMoney(dashboardTargets.revenueLostTarget)}` : 'Sem meta'}
                progress={revenueLostProgress}
                tone={revenueLost <= dashboardTargets.revenueLostTarget || dashboardTargets.revenueLostTarget === 0 ? 'good' : 'risk'}
              />
            </div>
          </section>

          <RetentionDashboardPanel
            summary={dashboardRetentionSummary}
            periodLabel={periodLabel}
            selectedSquadName={selectedSquadName}
            onOpenSquads={() => navigate('/dashboard/indicadores-por-squad')}
          />

          <section className={styles.boardSection}>
            <EntryColumnsChart rows={entryColumns} />
          </section>

          <section className={styles.dashboardLastCard}>
            <ActivityPanel activities={recentActivities} onOpenClient={openClientDetail} />
          </section>
        </div>

        {targetsModalOpen ? (
          <div className={styles.targetsModalBackdrop} role="presentation" onClick={() => (targetsSaving ? null : setTargetsModalOpen(false))}>
            <section
              className={styles.targetsModal}
              role="dialog"
              aria-modal="true"
              aria-label="Configurar metas operacionais"
              onClick={(event) => event.stopPropagation()}
            >
              <header className={styles.targetsModalHeader}>
                <span className={styles.targetsModalIcon} aria-hidden="true">
                  <SettingsIcon size={17} />
                </span>
                <div>
                  <span>Dashboard operacional</span>
                  <h3>Configurar metas</h3>
                  <p>{periodLabel}</p>
                </div>
                <button type="button" onClick={() => setTargetsModalOpen(false)} aria-label="Fechar" disabled={targetsSaving}>
                  <CloseIcon size={16} aria-hidden="true" />
                </button>
              </header>

              <div className={styles.targetsModalBody}>
                <label className={styles.targetsField}>
                  <span>Meta de Churn mensal</span>
                  <div className={styles.targetsInputWrap}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={targetDraft.churnTarget}
                      onChange={(event) => setTargetDraft((current) => ({ ...current, churnTarget: event.target.value }))}
                      aria-label="Meta de churn mensal"
                    />
                    <em>%</em>
                  </div>
                </label>

                <label className={styles.targetsField}>
                  <span>Meta de Receita Perdida</span>
                  <div className={styles.targetsInputWrap}>
                    <em>R$</em>
                    <input
                      type="text"
                      value={targetDraft.revenueLostTarget}
                      onChange={(event) => setTargetDraft((current) => ({ ...current, revenueLostTarget: event.target.value }))}
                      aria-label="Meta de receita perdida mensal"
                    />
                  </div>
                </label>
              </div>

              <footer className={styles.targetsModalFooter}>
                <button type="button" className={styles.targetsCancelButton} onClick={() => setTargetsModalOpen(false)} disabled={targetsSaving}>
                  Cancelar
                </button>
                <button type="button" className={styles.targetsSaveButton} onClick={handleSaveDashboardTargets} disabled={targetsSaving}>
                  {targetsSaving ? 'Salvando…' : 'Salvar metas'}
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {selectedClient ? (
          <ClientDetailDrawer
            client={selectedClient}
            squads={squads || []}
            users={userDirectory || []}
            canEditClient={canEditClients(user)}
            canViewFeeSchedule={canViewClientFeeSchedule(user)}
            canEditFeeSchedule={canEditClientFeeSchedule(user)}
            canDelete={canEditClients(user)}
            onClose={closeClientDetail}
            onUpdated={handleClientUpdated}
            onDeleted={handleClientDeleted}
          />
        ) : null}
      </>
    </div>
  );
}
