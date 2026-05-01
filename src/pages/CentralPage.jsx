import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import Select from '../components/ui/Select.jsx';
import {
  BriefcaseIcon,
  ChartColumnIcon,
  CoinsIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from '../components/ui/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { buildBarChartData, computeCentralMetrics } from '../utils/centralMetrics.js';
import { fmtMoney, fmtPct, MONTHS_FULL } from '../utils/format.js';
import {
  canEditClientFeeSchedule,
  canEditClients,
  canViewClientFeeSchedule,
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

function fmtDelta(value, formatter = fmtInt) {
  const numeric = Number(value) || 0;
  if (numeric === 0) return '0';
  return `${numeric > 0 ? '+' : '-'}${formatter(Math.abs(numeric))}`;
}

function toneFromChurn(pct) {
  if (pct >= 10) return 'risk';
  if (pct >= 4) return 'warning';
  return 'good';
}

function previousPeriod(year, month0) {
  if (month0 > 0) return { y: year, m: month0 - 1 };
  return { y: year - 1, m: 11 };
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
  // Para churn, "subir é ruim". options.invert = true.
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
  tone = 'neutral',
  detail,
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
            className={`${styles.metricProgressBar} ${styles[`metricProgressBar_${tone}`]}`}
            style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
          />
        </div>
      ) : null}
    </article>
  );
}

function EntryColumnsChart({ rows = [] }) {
  const hasData = rows.some((row) => row.cnt > 0);
  const maxClients = Math.max(...rows.map((row) => row.cnt || 0), 0);

  if (!hasData) {
    return <p className={styles.emptyState}>Sem entradas no período recente.</p>;
  }

  // Escala em incrementos de 5, sempre arredondando pra cima.
  const scaleMax = Math.max(5, Math.ceil(maxClients / 5) * 5);
  const ticks = [];
  for (let v = 0; v <= scaleMax; v += 5) ticks.push(v);

  // Grid SVG: viewBox fluido. As coordenadas internas em "user units"
  // permitem que tudo escale junto (texto, barras, gap) com o tamanho do card.
  const VB_W = 700;
  const VB_H = 280;
  const padding = { top: 26, right: 16, bottom: 36, left: 36 };
  const plotW = VB_W - padding.left - padding.right;
  const plotH = VB_H - padding.top - padding.bottom;

  const cols = rows.length;
  const slotW = plotW / cols;
  // Barra premium: largura fixa proporcional ao slot, deixando ar dos lados.
  const barW = Math.min(56, slotW * 0.5);

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
          {/* Linhas de grade horizontais */}
          {ticks.map((tick) => {
            const y = padding.top + plotH - (tick / scaleMax) * plotH;
            return (
              <line
                key={`grid-${tick}`}
                x1={padding.left}
                x2={VB_W - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.045)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Labels da escala vertical */}
          {ticks.map((tick) => {
            const y = padding.top + plotH - (tick / scaleMax) * plotH;
            return (
              <text
                key={`tick-${tick}`}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className={styles.columnsAxisText}
              >
                {tick}
              </text>
            );
          })}

          {/* Barras */}
          {rows.map((row, i) => {
            const cx = padding.left + slotW * i + slotW / 2;
            const barH = scaleMax > 0 ? (row.cnt / scaleMax) * plotH : 0;
            const x = cx - barW / 2;
            const y = padding.top + plotH - barH;
            const fill = row.isNow ? 'var(--accent-amber)' : 'rgba(255,255,255,0.075)';
            const labelColor = row.isNow ? 'var(--accent-amber)' : 'var(--text-tertiary)';

            return (
              <g key={`bar-${row.y}-${row.m}`}>
                {/* Valor em cima da barra */}
                <text
                  x={cx}
                  y={y - 8}
                  textAnchor="middle"
                  className={`${styles.columnsValue} ${row.isNow ? styles.columnsValueCurrent : ''}`}
                  fill={labelColor}
                >
                  {fmtInt(row.cnt)}
                </text>
                {/* Barra */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(barH, 2)}
                  rx="3"
                  ry="3"
                  fill={fill}
                />
                {/* Mês embaixo */}
                <text
                  x={cx}
                  y={VB_H - padding.bottom + 18}
                  textAnchor="middle"
                  className={`${styles.columnsMonth} ${row.isNow ? styles.columnsMonthCurrent : ''}`}
                >
                  {MONTHS_FULL[row.m].slice(0, 3).toUpperCase()}
                </text>
                <text
                  x={cx}
                  y={VB_H - padding.bottom + 30}
                  textAnchor="middle"
                  className={styles.columnsYear}
                >
                  {String(row.y)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ComparisonPanel({ current, previous, previousLabel }) {
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
      value: formatter ? formatter(prev) : fmtInt(prev),
      delta: isFlat ? '0' : `${sign}${formatted}`,
      tone,
    };
  };

  const rows = [
    buildRow('Ativos', current.active, previous.active),
    buildRow('MRR', current.mrr, previous.mrr, fmtMoney),
    buildRow('Receita nova', current.revenueNew, previous.revenueNew, fmtMoney),
    buildRow('Churn', current.churnRate, previous.churnRate, fmtPct, { invert: true }),
  ];

  return (
    <section className={styles.detailsPanel}>
      <div className={styles.compareHeader}>
        <h3>Comparativo</h3>
        <span className={styles.compareHeaderHint}>{previousLabel}</span>
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

function clientMeta(client) {
  const pieces = [];
  if (client?.squadName || client?.squad) pieces.push(client.squadName || client.squad);
  if (client?.status) pieces.push(client.status);
  if (Number(client?.fee) > 0) pieces.push(fmtMoney(client.fee));
  return pieces.join(' · ');
}

function ActivityPanel({ activities = [], onOpenClient }) {
  const rows = Array.isArray(activities) ? activities.slice(0, 8) : [];

  return (
    <section className={styles.activityPanel}>
      <div className={styles.activityHeader}>
        <h3>Contratos vencendo</h3>
      </div>

      {rows.length > 0 ? (
        <div className={styles.activityList}>
          {rows.map((activity) => {
            const client = activity.client || {};
            const initials = clientInitials(client.name);
            const avatarUrl = client.avatarUrl || '';
            const fee = Number(client.fee) > 0 ? fmtMoney(client.fee) : '';
            const squad = client.squadName || client.squad || '';

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

                <span className={styles.activityCopy}>
                  <strong>{client.name || 'Cliente'}</strong>
                </span>

                <span className={styles.activityDate}>{formatShortDate(activity.date)}</span>

                {squad ? <span className={styles.activitySquad}>{squad}</span> : <span className={styles.activityMuted}>Sem squad</span>}

                {fee ? <span className={styles.activityFee}>{fee}</span> : <span className={styles.activityMuted}>Sem mensalidade</span>}
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

    if (!endDate || isChurn) return;

    const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays > 30) return;

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
    .slice(0, 12);
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

  const now = useMemo(() => new Date(), []);
  const periodOptions = useMemo(buildPeriodOptions, []);
  const [period, setPeriod] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [squadFilter, setSquadFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [draggingMetric, setDraggingMetric] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);

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
        return start && start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
      }).length,
    [now, visibleClients]
  );

  const entryColumns = useMemo(
    () => buildBarChartData(visibleClients, period.y, period.m, 6),
    [period, visibleClients]
  );

  const recentActivities = useMemo(
    () => buildClientActivities(visibleClients),
    [visibleClients]
  );

  const activeClients = executiveMetrics.active ?? 0;
  const totalClients = executiveMetrics.total ?? 0;
  const mrr = executiveMetrics.mrr ?? 0;
  const revenueNew = executiveMetrics.revenueNew ?? 0;
  const ticketMedio = activeClients > 0 ? mrr / activeClients : 0;
  const revenueLost = executiveMetrics.revLost ?? 0;
  const churnRate = executiveMetrics.churnRate ?? 0;
  const churnedPeriod = executiveMetrics.churnedPeriodCnt ?? 0;
  const newClients = executiveMetrics.newCnt ?? 0;
  const periodLabel = `${MONTHS_FULL[period.m]} ${period.y}`;
  const previousLabel = `${MONTHS_FULL[prevPeriod.m]} ${prevPeriod.y}`;

  const metricDefinitions = useMemo(
    () => {
      const prevTotal = previousMetrics.total ?? 0;
      const prevActive = previousMetrics.active ?? 0;
      const prevMrr = previousMetrics.mrr ?? 0;
      const prevRevenueNew = previousMetrics.revenueNew ?? 0;
      const prevRevenueLost = previousMetrics.revLost ?? 0;
      const prevChurnRate = previousMetrics.churnRate ?? 0;
      const prevTicket = prevActive > 0 ? prevMrr / prevActive : 0;
      const prevNewCnt = previousMetrics.newCnt ?? 0;

      const baseDelta = buildKpiDelta(totalClients, prevTotal);
      const ativosDelta = buildKpiDelta(activeClients, prevActive);
      const novosDelta = buildKpiDelta(currentMonthNewClients, prevNewCnt);
      const mrrDelta = buildKpiPctDelta(mrr, prevMrr);
      const receitaNovaDelta = buildKpiPctDelta(revenueNew, prevRevenueNew);
      const ticketDelta = buildKpiDelta(ticketMedio, prevTicket, fmtMoney);
      const perdidaDelta = buildKpiDelta(revenueLost, prevRevenueLost, fmtMoney, { invert: true });
      const churnDelta = buildKpiPctDelta(churnRate, prevChurnRate, { invert: true });

      return [
        {
          id: 'base',
          label: 'Base de dados',
          value: fmtInt(totalClients),
          helper: 'vs. mês passado',
          delta: baseDelta.delta,
          deltaTone: baseDelta.deltaTone,
          icon: <UsersIcon size={14} />,
          tone: 'neutral',
        },
        {
          id: 'ativos',
          label: 'Clientes ativos',
          value: fmtInt(activeClients),
          helper: 'vs. mês passado',
          delta: ativosDelta.delta,
          deltaTone: ativosDelta.deltaTone,
          icon: <BriefcaseIcon size={14} />,
          tone: 'neutral',
        },
        {
          id: 'novosAtual',
          label: 'Clientes novos no mês',
          value: fmtInt(currentMonthNewClients),
          helper: 'vs. mês passado',
          delta: novosDelta.delta,
          deltaTone: novosDelta.deltaTone,
          icon: <TrendingUpIcon size={14} />,
          tone: currentMonthNewClients > 0 ? 'good' : 'neutral',
        },
        {
          id: 'mrr',
          label: 'MRR atual',
          value: fmtMoney(mrr),
          helper: 'vs. mês passado',
          delta: mrrDelta.delta,
          deltaTone: mrrDelta.deltaTone,
          icon: <CoinsIcon size={14} />,
          tone: 'neutral',
        },
        {
          id: 'receitaNova',
          label: 'Receita nova gerada',
          value: fmtMoney(revenueNew),
          helper: 'vs. mês passado',
          delta: receitaNovaDelta.delta,
          deltaTone: receitaNovaDelta.deltaTone,
          icon: <TrendingUpIcon size={14} />,
          tone: revenueNew > 0 ? 'good' : 'neutral',
        },
        {
          id: 'ticket',
          label: 'Ticket médio',
          value: fmtMoney(ticketMedio),
          helper: 'vs. mês passado',
          delta: ticketDelta.delta,
          deltaTone: ticketDelta.deltaTone,
          icon: <TargetIcon size={14} />,
          tone: 'neutral',
        },
        {
          id: 'perdida',
          label: 'Receita perdida no mês',
          value: fmtMoney(revenueLost),
          helper: revenueLost > 0
            ? `${fmtInt(churnedPeriod)} churn(s) em ${MONTHS_FULL[period.m]}`
            : 'sem perdas',
          delta: revenueLost > 0 ? perdidaDelta.delta : '',
          deltaTone: perdidaDelta.deltaTone,
          icon: <ChartColumnIcon size={14} />,
          tone: revenueLost > 0 ? 'risk' : 'neutral',
        },
        {
          id: 'churn',
          label: 'Taxa de churn',
          value: fmtPct(churnRate),
          helper: churnedPeriod > 0
            ? `${fmtInt(churnedPeriod)} no período`
            : 'sem churn',
          delta: churnedPeriod > 0 ? churnDelta.delta : '',
          deltaTone: churnDelta.deltaTone,
          icon: <ChartColumnIcon size={14} />,
          progress: Math.min(churnRate, 100),
          tone: toneFromChurn(churnRate),
        },
      ];
    },
    [
      activeClients,
      churnRate,
      churnedPeriod,
      currentMonthNewClients,
      mrr,
      newClients,
      now,
      period,
      previousMetrics,
      revenueLost,
      revenueNew,
      ticketMedio,
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
          value={squadFilter}
          onChange={(event) => setSquadFilter(event.target.value)}
          aria-label="Filtrar por squad"
          disabled={isSquadsLoading}
          placeholder={isSquadsLoading ? 'Carregando squads…' : 'Todos squads'}
        >
          <option value="">Todos squads</option>
          {squadsList.map((squad) => (
            <option key={squad.id} value={squad.id}>
              {squad.name}
            </option>
          ))}
        </Select>

        <Select
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          aria-label="Filtrar por cliente"
          disabled={shellLoading && clientOptions.length === 0}
          placeholder={shellLoading && clientOptions.length === 0 ? 'Carregando clientes…' : 'Todos clientes'}
        >
          <option value="">Todos clientes</option>
          {clientOptions.map((client) => (
            <option key={client.id} value={client.id}>
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

          <div className={styles.dashboardPanels}>
            <section className={styles.boardSection}>
              <EntryColumnsChart rows={entryColumns} />
            </section>

            <ComparisonPanel
              current={executiveMetrics}
              previous={previousMetrics}
              previousLabel={previousLabel}
            />
          </div>

          <section className={styles.dashboardLastCard}>
            <ActivityPanel activities={recentActivities} onOpenClient={openClientDetail} />
          </section>
        </div>

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
