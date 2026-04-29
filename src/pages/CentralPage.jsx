import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import Select from '../components/ui/Select.jsx';
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
        {draggable ? <span className={styles.metricGrip} aria-hidden="true" /> : null}
      </div>

      <div className={styles.metricBody}>
        <strong className={styles.metricValue}>{value}</strong>
      </div>

      {delta ? (
        <p className={`${styles.metricDelta} ${styles[`metricDelta_${deltaTone || 'neutral'}`]}`}>
          <span className={styles.metricDeltaArrow} aria-hidden="true">
            {deltaTone === 'up' ? '↗' : deltaTone === 'down' ? '↘' : '—'}
          </span>
          <span>{delta}</span>
          {helper ? <small className={styles.metricDeltaHelper}>{helper}</small> : null}
        </p>
      ) : helper ? (
        <p className={styles.metricHelper}>{helper}</p>
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
  const hasData = rows.some((row) => row.cnt > 0 || row.mrr > 0);
  const maxClients = Math.max(...rows.map((row) => row.cnt || 0), 0);

  if (!hasData) {
    return <p className={styles.emptyState}>Sem entradas no período recente.</p>;
  }

  return (
    <div className={styles.columnsPanel}>
      <div className={styles.columnsPanelHeader}>
        <div>
          <h3 className={styles.columnsPanelTitle}>Entradas</h3>
          <span className={styles.columnsPanelSubtitle}>novos clientes por mês · últimos 7 meses</span>
        </div>
        <div className={styles.columnsLegend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendSwatch_current}`} aria-hidden="true" />
            Selecionado
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendSwatch_history}`} aria-hidden="true" />
            Histórico
          </span>
        </div>
      </div>

      <div className={styles.columnsChart}>
        {rows.map((row) => {
          const height = maxClients > 0 ? Math.max(8, (row.cnt / maxClients) * 100) : 0;
          const monthLabel = MONTHS_FULL[row.m].slice(0, 3);

          return (
            <article
              key={`${row.y}-${row.m}`}
              className={`${styles.columnCard} ${row.isNow ? styles.columnCardCurrent : ''}`.trim()}
            >
              <div className={styles.columnMetaTop}>
                <strong className={styles.columnCount}>{fmtInt(row.cnt)}</strong>
              </div>

              <div className={styles.columnTrack}>
                <div className={styles.columnBarWrap}>
                  <div
                    className={`${styles.columnBar} ${row.isNow ? styles.columnBarCurrent : ''}`.trim()}
                    style={{ height: `${height}%` }}
                  />
                </div>
              </div>

              <div className={styles.columnMetaBottom}>
                <span className={styles.columnMonth}>{monthLabel}</span>
                <span className={styles.columnYear}>{String(row.y)}</span>
              </div>
            </article>
          );
        })}
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
    const arrow = isFlat ? '—' : diff > 0 ? '↗' : '↘';
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const formatted = formatter ? formatter(Math.abs(diff)) : fmtInt(Math.abs(diff));
    return {
      label,
      value: formatter ? formatter(prev) : fmtInt(prev),
      delta: isFlat ? '0' : `${sign}${formatted}`,
      arrow,
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
        <span className={styles.compareHeaderHint}>vs. mês anterior</span>
      </div>

      <div className={styles.compareBody}>
        <div className={styles.comparePeriodRow}>
          <span className={styles.comparePeriod}>{previousLabel}</span>
          <span className={styles.comparePeriodTag}>baseline</span>
        </div>

        <dl className={styles.compareGrid}>
          {rows.map((row) => (
            <div key={row.label} className={styles.compareItem}>
              <dt className={styles.compareLabel}>{row.label}</dt>
              <dd className={styles.compareValue}>{row.value}</dd>
              <span className={`${styles.compareDelta} ${styles[`compareDelta_${row.tone}`]}`}>
                <span className={styles.compareDeltaArrow} aria-hidden="true">{row.arrow}</span>
                <span>{row.delta}</span>
              </span>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function clientMeta(client) {
  const pieces = [];
  if (client?.squadName || client?.squad) pieces.push(client.squadName || client.squad);
  if (client?.status) pieces.push(client.status);
  if (Number(client?.fee) > 0) pieces.push(fmtMoney(client.fee));
  return pieces.join(' · ');
}

function ActivityPanel({ activities = [], onOpenClient }) {
  const rows = Array.isArray(activities) ? activities.slice(0, 5) : [];

  return (
    <section className={styles.activityPanel}>
      <div className={styles.activityHeader}>
        <h3>Atividades recentes</h3>
        <span className={styles.activityHeaderMeta}>últimas 24h · {fmtInt(rows.length)}</span>
        <span className={styles.activityHeaderBadge}>{fmtInt(rows.length)}</span>
      </div>

      {rows.length > 0 ? (
        <div className={styles.activityList}>
          {rows.map((activity) => (
            <button
              key={activity.key}
              type="button"
              className={styles.activityItem}
              onClick={() => onOpenClient(activity.client.id)}
            >
              <span className={`${styles.activityDot} ${styles[`activityDot_${activity.tone}`]}`} />
              <span className={styles.activityCopy}>
                <span className={styles.activityMain}>
                  <strong>{activity.client.name}</strong>
                  <span>{activity.text}</span>
                </span>
                <span className={styles.activityMeta}>
                  <small>{formatShortDate(activity.date)}</small>
                  {clientMeta(activity.client) ? <small>{clientMeta(activity.client)}</small> : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>Nenhuma atividade recente.</p>
      )}
    </section>
  );
}


function buildClientActivities(clients = []) {
  const now = new Date();
  const events = [];

  (Array.isArray(clients) ? clients : []).forEach((client) => {
    const created = parseAnyDate(client?.createdAt);
    const start = parseClientDate(client?.startDate);
    const churn = parseClientDate(client?.churnDate);
    const endDate = parseClientDate(client?.endDate);
    const fee = Number(client?.fee) || 0;

    // "foi cadastrado(a) como novo cliente"
    // Só dispara se NÃO houver startDate no mesmo dia (evita duplicar
    // cadastro + início de contrato no mesmo evento).
    if (created && created <= now) {
      const sameDayAsStart =
        start && Math.abs(created.getTime() - start.getTime()) < 24 * 60 * 60 * 1000;
      if (!sameDayAsStart) {
        events.push({
          key: `${client.id}-created`,
          client,
          date: created,
          tone: 'amber',
          text: 'foi cadastrado(a) como novo cliente',
        });
      }
    }

    // "iniciou contrato de R$ X/mês" — engloba o caso de cadastro+contrato no mesmo dia
    if (start && start <= now) {
      const feePart = fee > 0 ? ` de ${fmtMoney(fee)}/mês` : '';
      events.push({
        key: `${client.id}-start`,
        client,
        date: start,
        tone: 'green',
        text: `iniciou contrato${feePart}`,
      });
    }

    // "saiu (churn)"
    if (churn && churn <= now) {
      events.push({
        key: `${client.id}-churn`,
        client,
        date: churn,
        tone: 'pink',
        text: 'saiu (churn)',
      });
    }

    // "vencendo em X dias" — só entra se ≤ 7 dias e cliente não está em churn.
    // Date é o endDate (futuro) — assim ordena alto na lista (recente).
    if (endDate && !churn) {
      const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays >= 0 && diffDays <= 7) {
        events.push({
          key: `${client.id}-expiring`,
          client,
          date: endDate,
          tone: 'amber',
          text: diffDays === 0
            ? 'vence hoje'
            : `vencendo em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`,
        });
      }
    }
  });

  return events
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);
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
          tone: 'neutral',
        },
        {
          id: 'ativos',
          label: 'Clientes ativos',
          value: fmtInt(activeClients),
          helper: 'vs. mês passado',
          delta: ativosDelta.delta,
          deltaTone: ativosDelta.deltaTone,
          tone: 'neutral',
        },
        {
          id: 'novosAtual',
          label: 'Clientes novos no mês',
          value: fmtInt(currentMonthNewClients),
          helper: 'vs. mês passado',
          delta: novosDelta.delta,
          deltaTone: novosDelta.deltaTone,
          tone: currentMonthNewClients > 0 ? 'good' : 'neutral',
        },
        {
          id: 'mrr',
          label: 'MRR atual',
          value: fmtMoney(mrr),
          helper: 'vs. mês passado',
          delta: mrrDelta.delta,
          deltaTone: mrrDelta.deltaTone,
          tone: 'neutral',
        },
        {
          id: 'receitaNova',
          label: 'Receita nova gerada',
          value: fmtMoney(revenueNew),
          helper: 'vs. mês passado',
          delta: receitaNovaDelta.delta,
          deltaTone: receitaNovaDelta.deltaTone,
          tone: revenueNew > 0 ? 'good' : 'neutral',
        },
        {
          id: 'ticket',
          label: 'Ticket médio',
          value: fmtMoney(ticketMedio),
          helper: 'vs. mês passado',
          delta: ticketDelta.delta,
          deltaTone: ticketDelta.deltaTone,
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
              <div className={styles.sectionHeaderCompact}>
                <h3>Entradas</h3>
              </div>
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
