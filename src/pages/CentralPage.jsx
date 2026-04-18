// ================================================================
//  CentralPage
//  Dashboard operacional da Edifica:
//    - KPIs de contratos fechados, metas e conversão por período.
//    - Relatório visual por semana do mês ou ranking por cliente.
//    - Dados reais vêm de weekly_metrics (/api/metrics).
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  CalendarIcon,
  ClipboardListIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from '../components/ui/Icons.jsx';
import { listClientMetrics } from '../api/metrics.js';
import {
  buildClientGoalReport,
  buildMarketingDashboardData,
  buildWeeklyGoalReport,
  clientsEndingSoon,
} from '../utils/centralMetrics.js';
import {
  MONTHS_FULL,
  fmtInt,
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

const CHART_W = 1095;
const CHART_H = 344;
const CHART_TOP = 6.83572;
const CHART_BASELINE = 314.821;
const CHART_GRID_LEFT = 37.1858;
const CHART_GRID_RIGHT = 1093.34;
const CHART_LABEL_Y = 337;
const CHART_DATA_X = [70, 269.447, 468.895, 668.342, 867.789, 1067.24];
const CHART_GRID_X = [36.5644, 212.59, 388.617, 564.643, 740.669, 916.695, 1092.72];
const CHART_TICKS = [
  { ratio: 1, y: 6.83572 },
  { ratio: 0.7, y: 68.4329 },
  { ratio: 0.5, y: 130.03 },
  { ratio: 0.3, y: 191.627 },
  { ratio: 0.1, y: 253.224 },
  { ratio: 0, y: 314.821 },
];

function niceMax(value) {
  if (!value || value <= 0) return 10;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function buildChartPoints(rows, maxValue, valueKey) {
  const chartMax = maxValue > 0 ? maxValue : 100;
  const firstX = CHART_DATA_X[0];
  const lastX = CHART_DATA_X.at(-1);
  const step = rows.length > 1 ? (lastX - firstX) / (rows.length - 1) : 0;
  return rows.map((row, index) => ({
    ...row,
    year: row.y,
    month: row.m,
    x: rows.length > 1 ? firstX + step * index : (firstX + lastX) / 2,
    y:
      CHART_BASELINE -
      ((Number(row[valueKey]) || 0) / chartMax) *
        (CHART_BASELINE - CHART_TOP),
  }));
}

function weekOfMonth(date = new Date()) {
  return Math.min(Math.max(Math.ceil(date.getDate() / 7), 1), 4);
}

function buildLinearPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function formatCompactValue(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

const CHART_MODES = {
  weeks: {
    label: 'Semanas',
    title: 'Evolução por semana',
    description: 'Contratos fechados, meta contratada e super meta no mês selecionado.',
    ariaLabel: 'Contratos fechados e metas por semana no mês selecionado',
  },
  clients: {
    label: 'Clientes',
    title: 'Ranking por cliente',
    description: 'Quem está mais perto de bater a meta mensal de contratos.',
    ariaLabel: 'Contratos fechados e metas por cliente no mês selecionado',
  },
};

function ChartCallout({ x, y, width, tone, children }) {
  const left = x - width / 2;
  const top = y - 38.38;
  const tipTop = top + 23;
  const tipBottom = top + 26.75;

  return (
    <g className={styles.calloutGroup}>
      <rect
        x={left + 0.25}
        y={top + 0.25}
        width={width - 0.5}
        height="22.5"
        rx="1.75"
        className={`${styles.calloutBox} ${styles[`calloutBox_${tone}`]}`}
      />
      <text
        x={x}
        y={top + 14.75}
        textAnchor="middle"
        className={styles.calloutText}
      >
        {children}
      </text>
      <path
        d={`M ${x - 3.0311} ${tipTop} L ${x + 3.0311} ${tipTop} L ${x} ${tipBottom} Z`}
        className={`${styles.calloutTip} ${styles[`calloutTip_${tone}`]}`}
      />
    </g>
  );
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
          {Array.from({ length: 4 }).map((_, index) => (
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
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [chartMode, setChartMode] = useState('weeks');
  const [weeklyMetricsByClient, setWeeklyMetricsByClient] = useState({});

  const periodOptions = useMemo(buildPeriodOptions, []);
  const isNow =
    period.y === now.getFullYear() && period.m === now.getMonth();
  const dashboardWeek = isNow ? weekOfMonth(now) : 4;

  useEffect(() => {
    let cancelled = false;
    const loadMetrics = async () => {
      const source = Array.isArray(clients) ? clients : [];
      if (source.length === 0) {
        setWeeklyMetricsByClient({});
        return;
      }

      const entries = await Promise.all(
        source.map(async (client) => {
          try {
            const response = await listClientMetrics(client.id);
            return [
              client.id,
              Array.isArray(response?.metrics) ? response.metrics : [],
            ];
          } catch {
            return [client.id, []];
          }
        })
      );

      if (!cancelled) {
        setWeeklyMetricsByClient(Object.fromEntries(entries));
      }
    };

    loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [clients]);

  const marketingData = useMemo(
    () =>
      buildMarketingDashboardData(
        clients,
        weeklyMetricsByClient,
        period.y,
        period.m,
        dashboardWeek
      ),
    [clients, weeklyMetricsByClient, period, dashboardWeek]
  );

  const contractTrend = useMemo(
    () =>
      chartMode === 'clients'
        ? buildClientGoalReport(marketingData)
        : buildWeeklyGoalReport(marketingData),
    [chartMode, marketingData]
  );
  const chartMax = useMemo(
    () =>
      niceMax(
        Math.max(
          ...contractTrend.flatMap((row) => [
            row.contracts,
            row.ideal,
            row.stretch,
          ]),
          1
        )
      ),
    [contractTrend]
  );
  const chartPoints = useMemo(
    () => buildChartPoints(contractTrend, chartMax, 'contracts'),
    [contractTrend, chartMax]
  );
  const idealPoints = useMemo(
    () => buildChartPoints(contractTrend, chartMax, 'ideal'),
    [contractTrend, chartMax]
  );
  const stretchPoints = useMemo(
    () => buildChartPoints(contractTrend, chartMax, 'stretch'),
    [contractTrend, chartMax]
  );
  const lineD = useMemo(() => buildLinearPath(chartPoints), [chartPoints]);
  const idealLineD = useMemo(() => buildLinearPath(idealPoints), [idealPoints]);
  const stretchLineD = useMemo(
    () => buildLinearPath(stretchPoints),
    [stretchPoints]
  );
  const baselineY = CHART_BASELINE;
  const areaD = lineD
    ? `${lineD} L ${chartPoints.at(-1).x} ${baselineY} L ${chartPoints[0].x} ${baselineY} Z`
    : '';
  const idealAreaD = idealLineD
    ? `${idealLineD} L ${idealPoints.at(-1).x} ${baselineY} L ${idealPoints[0].x} ${baselineY} Z`
    : '';
  const stretchAreaD = stretchLineD
    ? `${stretchLineD} L ${stretchPoints.at(-1).x} ${baselineY} L ${stretchPoints[0].x} ${baselineY} Z`
    : '';
  const chartTicks = CHART_TICKS;
  const peakClientsIndex = useMemo(() => {
    if (contractTrend.length === 0) return -1;
    return contractTrend.reduce(
      (best, row, index, list) =>
        row.contracts > list[best].contracts ? index : best,
      0
    );
  }, [contractTrend]);
  const peakIdealIndex = useMemo(() => {
    if (contractTrend.length === 0) return -1;
    return contractTrend.reduce(
      (best, row, index, list) =>
        Number(row.ideal) > Number(list[best].ideal) ? index : best,
      0
    );
  }, [contractTrend]);

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
            label="Contratos no mês"
            badge={`${Math.round(marketingData.totals.monthProgress)}%`}
            badgeTone="green"
            primary={`${formatCompactValue(marketingData.totals.monthClosed)} / ${formatCompactValue(marketingData.totals.monthGoal)}`}
            helperTitle={`Resultado de ${MONTHS_FULL[period.m]}`}
            helperText="Contratos fechados pelos clientes contra a meta mensal contratada"
            legendPrimary="Fechados"
            legendSecondary="Meta mensal"
          />

          <MetricCard
            icon={<TargetIcon size={16} strokeWidth={1.8} />}
            label={isNow ? 'Semana atual' : 'Última semana'}
            badge={`${Math.round(marketingData.totals.weekProgress)}%`}
            badgeTone="green"
            primary={`${formatCompactValue(marketingData.totals.weekClosed)} / ${formatCompactValue(marketingData.totals.weekGoal)}`}
            helperTitle={`S${dashboardWeek} de ${MONTHS_FULL[period.m]}`}
            helperText="Fechados na semana de referência contra a meta proporcional"
            legendPrimary="Fechados"
            legendSecondary="Meta da semana"
          />

          <MetricCard
            icon={<TargetIcon size={16} strokeWidth={1.8} />}
            label="Clientes na meta"
            badge={`${Math.round(marketingData.totals.hitRate)}%`}
            badgeTone="amber"
            primary={`${formatCompactValue(marketingData.totals.hitClients)} / ${formatCompactValue(marketingData.totals.clientsWithGoal)}`}
            helperTitle="Advogados batendo o combinado"
            helperText="Clientes que já atingiram a meta mensal de contratos"
            legendPrimary="Na meta"
            legendSecondary="Com meta"
          />

          <MetricCard
            icon={<TrendingUpIcon size={16} strokeWidth={1.8} />}
            label="Conversão em contratos"
            badge={`${formatCompactValue(marketingData.totals.monthLeads)} leads`}
            badgeTone="green"
            primary={fmtPct(marketingData.totals.conversion)}
            helperTitle="Leads que viraram contrato"
            helperText="Taxa calculada a partir dos leads e contratos preenchidos"
            legendPrimary="Contratos"
            legendSecondary="Leads"
          />
        </section>
        {/* --- Gráfico de linha --- */}
        <section className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.chartHeading}>
              <span>Relatório visual</span>
              <h3>{CHART_MODES[chartMode].title}</h3>
              <p>{CHART_MODES[chartMode].description}</p>
            </div>
            <div className={styles.chartControls}>
              <div className={styles.chartControlGroup}>
                {Object.entries(CHART_MODES).map(([mode, option]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.chartControlButton} ${
                      chartMode === mode ? styles.chartControlButtonActive : ''
                    }`}
                    onClick={() => setChartMode(mode)}
                  >
                    <ClipboardListIcon size={14} strokeWidth={1.8} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              <div className={styles.chartPeriodPicker}>
                <button
                  type="button"
                  className={`${styles.chartControlButton} ${
                    chartPickerOpen ? styles.chartControlButtonActive : ''
                  }`}
                  onClick={() => {
                    setChartPickerOpen((open) => !open);
                  }}
                  aria-expanded={chartPickerOpen}
                  aria-haspopup="listbox"
                >
                  <CalendarIcon size={14} strokeWidth={1.8} />
                  <span>Definir período</span>
                </button>
                {chartPickerOpen && (
                  <div className={styles.chartPeriodPopover}>
                    <select
                      className={styles.chartPeriodSelect}
                      value={`${period.y}-${period.m}`}
                      onChange={(e) => {
                        const [y, m] = e.target.value.split('-').map(Number);
                        if (Number.isFinite(y) && Number.isFinite(m)) {
                          setPeriod({ y, m });
                        }
                        setChartPickerOpen(false);
                      }}
                      aria-label="Selecionar período do gráfico"
                    >
                      {periodOptions.map((p) => (
                        <option key={`${p.y}-${p.m}`} value={`${p.y}-${p.m}`}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.lineChartWrap}>
            <svg
              className={styles.lineChart}
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              role="img"
              aria-label={CHART_MODES[chartMode].ariaLabel}
            >
              <defs>
                <linearGradient id="clientsLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7086fd" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#7086fd" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="revenueLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6fd195" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6fd195" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="benchmarkLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffae4c" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#ffae4c" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {chartTicks.map(({ ratio, y }) => {
                const value = Math.round(chartMax * ratio);
                return (
                  <g key={ratio}>
                    <text x="4" y={y + 4} className={styles.axisLabel}>
                      {value}
                    </text>
                    <line
                      x1={CHART_GRID_LEFT}
                      x2={CHART_GRID_RIGHT}
                      y1={y}
                      y2={y}
                      className={value === 0 ? styles.baselineLine : styles.gridLine}
                    />
                  </g>
                );
              })}

              {CHART_GRID_X.map((x) => (
                <line
                  key={`grid-${x}`}
                  x1={x}
                  x2={x}
                  y1={CHART_TOP}
                  y2={baselineY}
                  className={styles.gridLineVertical}
                />
              ))}

              <path d={stretchAreaD} className={styles.benchmarkAreaPath} />
              <path d={idealAreaD} className={styles.revenueAreaPath} />
              <path d={areaD} className={styles.areaPath} />
              <path d={stretchLineD} className={styles.benchmarkLinePath} />
              <path d={idealLineD} className={styles.revenueLinePath} />
              <path d={lineD} className={styles.linePath} />

              {chartPoints.map((point, index) => {
                const idealPoint = idealPoints[index];
                const stretchPoint = stretchPoints[index];
                return (
                  <g
                    key={`${chartMode}-${point.label}-${index}`}
                    className={styles.dataNode}
                    tabIndex="0"
                    aria-label={`${point.fullLabel || point.label}: ${point.contracts} contratos fechados, meta ${point.ideal}`}
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
                      y={CHART_LABEL_Y}
                      textAnchor="middle"
                      className={styles.monthLabel}
                    >
                      {point.label}
                    </text>
                    <circle
                      cx={stretchPoint.x}
                      cy={stretchPoint.y}
                      r={9.94286}
                      className={styles.benchmarkPointHalo}
                    />
                    <circle
                      cx={stretchPoint.x}
                      cy={stretchPoint.y}
                      r={4.35}
                      className={styles.benchmarkPoint}
                    />
                    <circle
                      cx={idealPoint.x}
                      cy={idealPoint.y}
                      r={9.94286}
                      className={styles.revenuePointHalo}
                    />
                    <circle
                      cx={idealPoint.x}
                      cy={idealPoint.y}
                      r={4.35}
                      className={styles.revenuePoint}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={9.94286}
                      className={styles.pointHalo}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={4.35}
                      className={`${styles.point} ${
                        point.isNow ? styles.pointActive : ''
                      }`}
                    />
                    {index === peakIdealIndex && point.ideal > 0 && (
                      <ChartCallout x={idealPoint.x} y={idealPoint.y} width={76} tone="ideal">
                        {`${fmtInt(point.ideal)} Contratos`}
                      </ChartCallout>
                    )}
                    {index === peakClientsIndex && point.contracts > 0 && (
                      <ChartCallout x={point.x} y={point.y} width={70} tone="clients">
                        {`${fmtInt(point.contracts)} Contrato${
                          point.contracts === 1 ? '' : 's'
                        }`}
                      </ChartCallout>
                    )}
                    {index === contractTrend.length - 1 && point.stretch > 0 && (
                      <ChartCallout x={stretchPoint.x} y={stretchPoint.y} width={76} tone="stretch">
                        {`${fmtInt(point.stretch)} Contratos`}
                      </ChartCallout>
                    )}
                    <foreignObject
                      x={Math.min(Math.max(point.x - 96, 4), CHART_W - 204)}
                      y={Math.max(Math.min(point.y, idealPoint.y, stretchPoint.y) - 126, 0)}
                      width="200"
                      height="120"
                      className={styles.pointTip}
                    >
                      <div className={styles.hudPanel}>
                        <strong>{point.label}</strong>
                        <span>Contratos fechados: {fmtInt(point.contracts)}</span>
                        <span>Meta: {fmtInt(point.ideal)}</span>
                        <span>Super meta: {fmtInt(point.stretch)}</span>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
            <div className={styles.chartLegend}>
              <span>
                <i className={styles.legendClients} />
                Contratos fechados
              </span>
              <span>
                <i className={styles.legendRevenue} />
                Meta contratada
              </span>
              <span>
                <i className={styles.legendBenchmark} />
                Super meta
              </span>
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
