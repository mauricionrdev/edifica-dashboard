// ================================================================
//  CentralPage
//  Visual portado do DashboardView do frontend real:
//    - 5 cards métrica (Ativos · MRR · Receita Nova · Ticket · Churn)
//      em grid 3 colunas, com delta no topline e gauge opcional no pé.
//    - Card "chart": barras dos últimos 6 meses com tooltip.
//    - Card "alerta": contratos vencendo em 30 dias.
//
//  Cálculos: utils/centralMetrics.js (computeCentralMetrics,
//  buildBarChartData, clientsEndingSoon).
//
//  PanelHeader: título "Central · Abril 2026" + seletor de período
//  como action.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  CoinsIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from '../components/ui/Icons.jsx';
import {
  buildBarChartData,
  clientsEndingSoon,
  computeCentralMetrics,
} from '../utils/centralMetrics.js';
import {
  MONTHS,
  MONTHS_FULL,
  fmtMoney,
  fmtPct,
} from '../utils/format.js';
import styles from './CentralPage.module.css';

function buildPeriodOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    let y = now.getFullYear();
    let m = now.getMonth() - i;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    out.push({ y, m, label: `${MONTHS_FULL[m]} ${y}` });
  }
  return out;
}

const CHART_W = 1200;
const CHART_H = 360;
const CHART_PAD = { top: 24, right: 28, bottom: 52, left: 38 };
const SERIES_MONTHS = 6;

function niceMax(value) {
  if (value <= 4) return 4;
  if (value <= 8) return 8;
  if (value <= 16) return 16;
  return Math.ceil(value / 10) * 10;
}

function buildChartPoints(rows, maxValue, valueKey) {
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const step = rows.length > 1 ? innerW / (rows.length - 1) : 0;

  return rows.map((row, index) => ({
    ...row,
    year: row.y,
    month: row.m,
    x: CHART_PAD.left + step * index,
    y:
      CHART_PAD.top +
      innerH -
      ((Number(row[valueKey]) || 0) / maxValue) * innerH,
  }));
}

function shiftPeriod(year, month0, offset) {
  let y = year;
  let m = month0 + offset;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  return { y, m };
}

function readDatedEntries(client, keys) {
  return keys.flatMap((key) => {
    const value = client?.[key];
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => ({
        date: entry?.date || entry?.createdAt || entry?.at,
        label: entry?.label || entry?.title || entry?.name || entry?.type,
        detail: entry?.detail || entry?.description || entry?.notes || '',
      }))
      .filter((entry) => entry.date && entry.label);
  });
}

function collectMonthEvents(clients, year, month0) {
  const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}`;
  return (Array.isArray(clients) ? clients : [])
    .flatMap((client) =>
      readDatedEntries(client, [
        'dashboardEvents',
        'events',
        'notes',
        'annotations',
      ]).map((event) => ({
        ...event,
        clientName: client.name,
      }))
    )
    .filter((event) => String(event.date).startsWith(prefix));
}

function enrichDashboardSeries(rows, clients) {
  const all = Array.isArray(clients) ? clients : [];
  return rows.map((row) => {
    const prefix = `${row.y}-${String(row.m + 1).padStart(2, '0')}`;
    const added = all.filter(
      (client) =>
        client.status !== 'churn' &&
        client.startDate &&
        String(client.startDate).startsWith(prefix)
    );
    return {
      ...row,
      benchmark: added.reduce(
        (sum, client) => sum + (Number(client.metaLucro) || 0),
        0
      ),
      events: collectMonthEvents(all, row.y, row.m),
    };
  });
}

function smoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return path.join(' ');
}

function formatCompactValue(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function ratioPercent(part, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min((part / total) * 100, 999));
}

function MetricCard({
  icon,
  label,
  badge,
  badgeTone = 'gold',
  primary,
  helperTitle,
  helperText,
  legendPrimary,
  legendSecondary,
}) {
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricTopline}>
        <div className={styles.metricHeader}>
          <span className={styles.metricIcon} aria-hidden="true">{icon}</span>
          <span className={styles.metricLabel}>{label}</span>
        </div>
        <span className={`${styles.metricBadge} ${styles[`metricBadge_${badgeTone}`]}`}>
          {badge}
        </span>
      </div>
      <strong className={styles.metricValue}>{primary}</strong>
      <span className={styles.metricHelperTitle}>{helperTitle}</span>
      <span className={styles.metricSub}>{helperText}</span>
      <div className={styles.metricLegend}>
        <span><i className={styles.legendDotPrimary} />{legendPrimary}</span>
        <span><i className={styles.legendDotSecondary} />{legendSecondary}</span>
      </div>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="content">
      <div className={`${styles.workspace} ${styles.linearCardsDashboard}`}>
        <section className={styles.cardGrid} aria-label="Carregando indicadores">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className={`${styles.metricCard} ${styles.skeletonCard}`}>
              <span className={`${styles.skeletonLine} ${styles.skeletonLabel}`} />
              <span className={styles.skeletonValue} />
              <span className={`${styles.skeletonLine} ${styles.skeletonSub}`} />
              <span className={styles.skeletonGauge} />
            </article>
          ))}
        </section>
        <section className={`${styles.chartCard} ${styles.skeletonChartCard}`}>
          <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
          <div className={styles.skeletonChart} />
        </section>
      </div>
    </div>
  );
}

export default function CentralPage() {
  const { clients, loading, error, refreshClients, setPanelHeader } =
    useOutletContext();

  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(() => ({
    y: now.getFullYear(),
    m: now.getMonth(),
  }));

  const periodOptions = useMemo(buildPeriodOptions, []);
  const isNow =
    period.y === now.getFullYear() && period.m === now.getMonth();

  const metrics = useMemo(
    () => computeCentralMetrics(clients, period.y, period.m),
    [clients, period]
  );

  const prevMonth = useMemo(() => {
    const m = period.m > 0 ? period.m - 1 : 11;
    const y = period.m > 0 ? period.y : period.y - 1;
    return { y, m };
  }, [period]);

  const prevMetrics = useMemo(
    () => computeCentralMetrics(clients, prevMonth.y, prevMonth.m),
    [clients, prevMonth]
  );

  const mrrDelta =
    prevMetrics.mrr > 0
      ? ((metrics.mrr - prevMetrics.mrr) / prevMetrics.mrr) * 100
      : null;

  const ticketMedio =
    metrics.active > 0 ? metrics.mrr / metrics.active : 0;

  const activePct =
    metrics.total > 0
      ? Math.min((metrics.active / metrics.total) * 100, 100)
      : 0;

  const dashboardMetrics = useMemo(
    () => ({
      active_clients: metrics.active,
      total_clients: metrics.total,
      current_mrr: metrics.mrr,
      new_revenue: metrics.revenueNew,
      new_clients: metrics.newCnt,
      lost_revenue: metrics.revLost,
      churn_count: metrics.churnedPeriodCnt,
      churn_rate: metrics.churnRate,
      average_ticket: ticketMedio,
      active_ratio: activePct,
    }),
    [activePct, metrics, ticketMedio]
  );

  const newClientPct = ratioPercent(
    dashboardMetrics.new_clients,
    dashboardMetrics.total_clients
  );
  const newRevenuePct = ratioPercent(
    dashboardMetrics.new_revenue,
    dashboardMetrics.current_mrr || dashboardMetrics.new_revenue
  );
  const churnPeriodPct = ratioPercent(
    dashboardMetrics.churn_count,
    dashboardMetrics.total_clients
  );

  const rawBars = useMemo(
    () => buildBarChartData(clients, period.y, period.m, SERIES_MONTHS),
    [clients, period]
  );
  const bars = useMemo(
    () => enrichDashboardSeries(rawBars, clients),
    [clients, rawBars]
  );
  const previousPeriodEnd = useMemo(
    () => shiftPeriod(period.y, period.m, -SERIES_MONTHS),
    [period]
  );
  const previousBars = useMemo(
    () =>
      buildBarChartData(
        clients,
        previousPeriodEnd.y,
        previousPeriodEnd.m,
        SERIES_MONTHS
      ),
    [clients, previousPeriodEnd]
  );
  const chartMax = niceMax(
    Math.max(
      ...bars.map((b) => b.cnt),
      ...previousBars.map((b) => b.cnt),
      1
    )
  );
  const revenueMax = Math.max(...bars.map((b) => Number(b.mrr) || 0), 1);
  const benchmarkMax = Math.max(
    ...bars.map((b) => Number(b.benchmark) || 0),
    0
  );
  const chartPoints = useMemo(
    () => buildChartPoints(bars, chartMax, 'cnt'),
    [bars, chartMax]
  );
  const previousPoints = useMemo(
    () => buildChartPoints(previousBars, chartMax, 'cnt'),
    [previousBars, chartMax]
  );
  const revenuePoints = useMemo(
    () => buildChartPoints(bars, revenueMax, 'mrr'),
    [bars, revenueMax]
  );
  const benchmarkPoints = useMemo(
    () =>
      benchmarkMax > 0
        ? buildChartPoints(bars, Math.max(benchmarkMax, 1), 'benchmark')
        : [],
    [bars, benchmarkMax]
  );
  const lineD = useMemo(() => smoothPath(chartPoints), [chartPoints]);
  const previousLineD = useMemo(
    () => smoothPath(previousPoints),
    [previousPoints]
  );
  const revenueLineD = useMemo(
    () => smoothPath(revenuePoints),
    [revenuePoints]
  );
  const benchmarkLineD = useMemo(
    () => smoothPath(benchmarkPoints),
    [benchmarkPoints]
  );
  const baselineY = CHART_H - CHART_PAD.bottom;
  const areaD = lineD
    ? `${lineD} L ${chartPoints.at(-1).x} ${baselineY} L ${chartPoints[0].x} ${baselineY} Z`
    : '';
  const revenueAreaD = revenueLineD
    ? `${revenueLineD} L ${revenuePoints.at(-1).x} ${baselineY} L ${revenuePoints[0].x} ${baselineY} Z`
    : '';
  const benchmarkAreaD = benchmarkLineD
    ? `${benchmarkLineD} L ${benchmarkPoints.at(-1).x} ${baselineY} L ${benchmarkPoints[0].x} ${baselineY} Z`
    : '';
  const chartTicks = [
    chartMax,
    chartMax * 0.75,
    chartMax * 0.5,
    chartMax * 0.25,
    0,
  ];

  const ending = useMemo(
    () => clientsEndingSoon(clients, 30, now),
    [clients, now]
  );

  // Registra título + seletor de período no panelHeader do AppShell.
  useEffect(() => {
    const periodValue = `${period.y}-${period.m}`;
    const handleChange = (e) => {
      const [y, m] = e.target.value.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m)) setPeriod({ y, m });
    };

    const title = (
      <>
        <strong>Central</strong>
        <span>·</span>
        <span>{`${MONTHS_FULL[period.m]} ${period.y}`}</span>
      </>
    );

    const actions = (
      <div className={styles.periodControl}>
        {!isNow && (
          <span className={styles.historyChip}>Histórico</span>
        )}
        <select
          className={styles.linearSelect}
          value={periodValue}
          onChange={handleChange}
          aria-label="Período do dashboard"
        >
          {periodOptions.map((p) => (
            <option key={`${p.y}-${p.m}`} value={`${p.y}-${p.m}`}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    );

    setPanelHeader({ title, actions });
  }, [period, isNow, periodOptions, setPanelHeader]);

  // --- Estados ---
  if (loading && clients.length === 0) {
    return <DashboardSkeleton />;
  }

  if (error && clients.length === 0) {
    return (
      <div className="content">
        <div className={`${styles.state} ${styles.error}`}>
          <div>{error.message || 'Erro ao carregar clientes'}</div>
          <button
            type="button"
            className={styles.retry}
            onClick={() => refreshClients()}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className={`${styles.workspace} ${styles.linearCardsDashboard}`}>
        <section className={styles.cardGrid} aria-label="Indicadores do dashboard">
          <MetricCard
            icon={<UsersIcon size={16} strokeWidth={1.8} />}
            label="Clientes ativos"
            badge={`${Math.round(dashboardMetrics.active_ratio)}%`}
            badgeTone="green"
            primary={formatCompactValue(dashboardMetrics.active_clients)}
            helperTitle="Quantos seguem ativos?"
            helperText={`${dashboardMetrics.active_clients} clientes ativos de ${dashboardMetrics.total_clients} cadastrados`}
            legendPrimary="Clientes ativos"
            legendSecondary="Base total"
          />

          <MetricCard
            icon={<TargetIcon size={16} strokeWidth={1.8} />}
            label="Novos no mês"
            badge={`${Math.round(newClientPct)}%`}
            badgeTone="green"
            primary={formatCompactValue(dashboardMetrics.new_clients)}
            helperTitle={`Entraram em ${MONTHS[period.m]}`}
            helperText={`${dashboardMetrics.new_clients} novos clientes no mês selecionado`}
            legendPrimary="Novos no mês"
            legendSecondary="Base total"
          />

          <MetricCard
            icon={<CoinsIcon size={16} strokeWidth={1.8} />}
            label="Receita nova"
            badge={`${Math.round(newRevenuePct)}%`}
            badgeTone="amber"
            primary={fmtMoney(dashboardMetrics.new_revenue)}
            helperTitle="Nova receita sobre o MRR"
            helperText={`${dashboardMetrics.new_clients} clientes adicionaram ${fmtMoney(dashboardMetrics.new_revenue)} em ${MONTHS[period.m]}`}
            legendPrimary="Receita nova"
            legendSecondary="MRR atual"
          />

          <MetricCard
            icon={<TrendingUpIcon size={16} strokeWidth={1.8} />}
            label="Churn do mês"
            badge={fmtPct(churnPeriodPct)}
            badgeTone="red"
            primary={formatCompactValue(dashboardMetrics.churn_count)}
            helperTitle="Saídas no mês selecionado"
            helperText={`${dashboardMetrics.churn_count} cancelamentos e ${fmtMoney(dashboardMetrics.lost_revenue)} de receita perdida`}
            legendPrimary="Churns no mês"
            legendSecondary="Base total"
          />
        </section>
        {false && (
          <>
        <section className={styles.cardGrid} aria-label="Indicadores do dashboard">
          <MetricCard
            label="Clientes Ativos"
            value={dashboardMetrics.active_clients}
            sub={<>de <b>{dashboardMetrics.total_clients}</b> cadastrados</>}
            gaugePct={dashboardMetrics.active_ratio}
          />

          <MetricCard
            label="MRR Atual"
            value={fmtMoney(dashboardMetrics.current_mrr)}
            sub="Receita Mensal Recorrente"
            delta={
              mrrDelta === null ? (
                <span className={`${styles.delta} ${styles.delta_nd}`}>
                  Primeiro mês
                </span>
              ) : (
                <span
                  className={`${styles.delta} ${
                    mrrDelta >= 0 ? styles.delta_pos : styles.delta_neg
                  }`}
                >
                  {mrrDelta >= 0 ? '+' : '-'}{' '}
                  {Math.abs(mrrDelta).toFixed(1)}%
                </span>
              )
            }
          />

          <MetricCard
            label="Receita Nova Adicionada"
            value={fmtMoney(dashboardMetrics.new_revenue)}
            sub={<> <b>{dashboardMetrics.new_clients}</b> novos em {MONTHS[period.m]}</>}
          />
        </section>

        <section className={styles.cardGrid}>
          <MetricCard
            label="Ticket Médio"
            value={
              dashboardMetrics.average_ticket > 0
                ? fmtMoney(dashboardMetrics.average_ticket)
                : '-'
            }
            sub="MRR / clientes ativos"
          />

          <MetricCard
            label="Receita Perdida no Mês"
            value={fmtMoney(dashboardMetrics.lost_revenue)}
            sub={<> <b>{dashboardMetrics.churn_count}</b> churns em {MONTHS[period.m]}</>}
          />

          <MetricCard
            label="Taxa de Churn"
            value={
              dashboardMetrics.churn_rate > 0
                ? fmtPct(dashboardMetrics.churn_rate)
                : '0%'
            }
            sub="Cancelamentos / total"
            gaugePct={dashboardMetrics.churn_rate}
            gaugeTone="red"
          />
        </section>
          </>
        )}
        {/* --- Chart de linha --- */}
        <section className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Entradas de clientes e receita nova</h3>
            </div>
          </div>

          <div className={styles.lineChartWrap}>
            <svg
              className={styles.lineChart}
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              role="img"
              aria-label="Novos clientes por mês nos últimos 6 meses"
            >
              <defs>
                <linearGradient id="clientsLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5c300" stopOpacity="0.22" />
                  <stop offset="64%" stopColor="#f5c300" stopOpacity="0.07" />
                  <stop offset="100%" stopColor="#f5c300" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="revenueLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.2" />
                  <stop offset="64%" stopColor="#6aa6ff" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#6aa6ff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="benchmarkLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9b7cff" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#9b7cff" stopOpacity="0" />
                </linearGradient>
              </defs>

              {chartTicks.map((tick) => {
                const y =
                  CHART_PAD.top +
                  (1 - tick / chartMax) *
                    (CHART_H - CHART_PAD.top - CHART_PAD.bottom);
                return (
                  <g key={tick}>
                    <text x="4" y={y + 4} className={styles.axisLabel}>
                      {Math.round(tick)}
                    </text>
                    <line
                      x1={CHART_PAD.left}
                      x2={CHART_W - CHART_PAD.right}
                      y1={y}
                      y2={y}
                      className={styles.gridLine}
                    />
                  </g>
                );
              })}

              <path d={areaD} className={styles.areaPath} />
              <path d={revenueAreaD} className={styles.revenueAreaPath} />
              {benchmarkAreaD && (
                <path d={benchmarkAreaD} className={styles.benchmarkAreaPath} />
              )}
              {previousLineD && (
                <path d={previousLineD} className={styles.comparisonLinePath} />
              )}
              <path d={lineD} className={styles.linePath} />
              <path d={revenueLineD} className={styles.revenueLinePath} />
              {benchmarkLineD && (
                <path d={benchmarkLineD} className={styles.benchmarkLinePath} />
              )}

              {chartPoints.map((point, index) => {
                const revenuePoint = revenuePoints[index];
                const previousPoint = previousBars[index];
                const benchmarkPoint = benchmarkPoints[index];
                const hasEvents = point.events?.length > 0;
                return (
                <g
                  key={`${point.year}-${point.month}`}
                  className={styles.dataNode}
                  tabIndex="0"
                  aria-label={`${MONTHS[point.month]}: ${point.cnt} novos clientes, ${fmtMoney(point.mrr)} em receita nova`}
                >
                  <line
                    x1={point.x}
                    x2={point.x}
                    y1={baselineY - 5}
                    y2={baselineY + 5}
                    className={styles.tickLine}
                  />
                  <text
                    x={point.x}
                    y={CHART_H - 14}
                    textAnchor="middle"
                    className={styles.monthLabel}
                  >
                    {MONTHS[point.month]}
                  </text>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={point.isNow ? 7 : 5.5}
                    className={`${styles.point} ${
                      point.isNow ? styles.pointActive : ''
                    }`}
                  />
                  <circle
                    cx={revenuePoint.x}
                    cy={revenuePoint.y}
                    r={4.5}
                    className={styles.revenuePoint}
                  />
                  {benchmarkPoint && (
                    <circle
                      cx={benchmarkPoint.x}
                      cy={benchmarkPoint.y}
                      r={4}
                      className={styles.benchmarkPoint}
                    />
                  )}
                  {hasEvents && (
                    <g>
                      <circle
                        cx={point.x}
                        cy={baselineY - 24}
                        r="9"
                        className={styles.eventHalo}
                      />
                      <text
                        x={point.x}
                        y={baselineY - 20}
                        textAnchor="middle"
                        className={styles.eventMarker}
                      >
                        !
                      </text>
                    </g>
                  )}
                  <foreignObject
                    x={Math.min(Math.max(point.x - 96, 4), CHART_W - 204)}
                    y={Math.max(Math.min(point.y, revenuePoint.y) - 126, 0)}
                    width="200"
                    height="120"
                    className={styles.pointTip}
                  >
                    <div className={styles.hudPanel}>
                      <strong>{MONTHS[point.month]} {point.year}</strong>
                      <span>Novos: {point.cnt}</span>
                      <span>Receita: {fmtMoney(point.mrr)}</span>
                      {previousPoint && (
                        <span>Periodo anterior: {previousPoint.cnt}</span>
                      )}
                      {benchmarkPoint && (
                        <span>Meta agregada: {point.benchmark}</span>
                      )}
                      {hasEvents && (
                        <span>Evento: {point.events[0].label}</span>
                      )}
                    </div>
                  </foreignObject>
                </g>
                );
              })}
            </svg>
            <div className={styles.chartLegend}>
              <span>
                <i className={styles.legendClients} />
                Novos clientes
              </span>
              <span>
                <i className={styles.legendRevenue} />
                Receita nova no mês
              </span>
              <span>
                <i className={styles.legendComparison} />
                Periodo anterior
              </span>
              {benchmarkLineD && (
                <span>
                  <i className={styles.legendBenchmark} />
                  Meta agregada
                </span>
              )}
            </div>
          </div>
        </section>

        {/* --- Alerta de contratos vencendo --- */}
        {ending.length > 0 && (
          <section className={styles.alertCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span>Status</span>
                <h3>Contratos vencendo em 30 dias</h3>
              </div>
            </div>

            <div>
              {ending.map(({ client, daysLeft }) => (
                <div key={client.id} className={styles.alertRow}>
                  <span className={styles.alertName}>{client.name}</span>
                  <span className={styles.alertDate}>{client.endDate}</span>
                  <span className={styles.alertDays}>
                    {daysLeft} dia{daysLeft === 1 ? '' : 's'}
                  </span>
                  <span className={styles.alertFee}>
                    {fmtMoney(client.fee)}/mês
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
