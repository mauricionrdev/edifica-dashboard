import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import Select from '../components/ui/Select.jsx';
import { ProjectBoardIcon } from '../components/ui/Icons.jsx';
import { listProjects } from '../api/projects.js';
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

function MetricCard({
  label,
  value,
  helper,
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
        {draggable ? <span className={styles.metricGrip} aria-hidden="true" /> : null}
      </div>

      <div className={styles.metricBody}>
        <strong className={styles.metricValue}>{value}</strong>
      </div>

      {helper ? <p className={styles.metricHelper}>{helper}</p> : null}
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
      <div className={styles.columnsChart}>
        {rows.map((row) => {
          const height = maxClients > 0 ? Math.max(18, (row.cnt / maxClients) * 100) : 0;
          const monthLabel = MONTHS_FULL[row.m].slice(0, 3);

          return (
            <article
              key={`${row.y}-${row.m}`}
              className={`${styles.columnCard} ${row.isNow ? styles.columnCardCurrent : ''}`.trim()}
            >
              <div className={styles.columnMetaTop}>
                <span className={styles.columnMonth}>{monthLabel}</span>
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
                <span>{String(row.y)}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.columnsLegend}>
        <span className={styles.legendDot} />
        <span>Selecionado</span>
      </div>
    </div>
  );
}

function ComparisonPanel({ current, previous, previousLabel }) {
  const rows = [
    {
      label: 'Ativos',
      value: fmtInt(previous.active),
      delta: fmtDelta((current.active || 0) - (previous.active || 0)),
      tone: (current.active || 0) >= (previous.active || 0) ? 'good' : 'risk',
    },
    {
      label: 'MRR',
      value: fmtMoney(previous.mrr),
      delta: fmtDelta((current.mrr || 0) - (previous.mrr || 0), fmtMoney),
      tone: (current.mrr || 0) >= (previous.mrr || 0) ? 'good' : 'risk',
    },
    {
      label: 'Receita nova',
      value: fmtMoney(previous.revenueNew),
      delta: fmtDelta((current.revenueNew || 0) - (previous.revenueNew || 0), fmtMoney),
      tone: (current.revenueNew || 0) >= (previous.revenueNew || 0) ? 'good' : 'risk',
    },
    {
      label: 'Churn',
      value: fmtPct(previous.churnRate || 0),
      delta: fmtDelta((current.churnRate || 0) - (previous.churnRate || 0), fmtPct),
      tone: (current.churnRate || 0) <= (previous.churnRate || 0) ? 'good' : 'risk',
    },
  ];

  return (
    <section className={styles.detailsPanel}>
      <div className={styles.sectionHeaderCompact}>
        <h3>Comparativo</h3>
      </div>

      <div className={styles.compareBody}>
        <span className={styles.comparePeriod}>{previousLabel}</span>
        <dl className={styles.compareGrid}>
          {rows.map((row) => (
            <div key={row.label} className={styles.compareItem}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
              <span className={`${styles.compareDelta} ${styles[`compareDelta_${row.tone}`]}`}>{row.delta}</span>
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
      <div className={styles.sectionHeaderCompact}>
        <h3>Atividades</h3>
        <span className={styles.panelMetaBadge}>{fmtInt(rows.length)}</span>
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


function projectInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return 'PJ';
  return words.map((word) => word[0]).join('').toUpperCase();
}

function projectStatusLabel(status) {
  if (status === 'done' || status === 'completed') return 'Concluído';
  if (status === 'blocked') return 'Bloqueado';
  if (status === 'planned' || status === 'todo') return 'Planejado';
  if (status === 'paused') return 'Pausado';
  return 'Em andamento';
}

function projectStatusTone(status) {
  if (status === 'done' || status === 'completed') return 'done';
  if (status === 'blocked') return 'blocked';
  if (status === 'planned' || status === 'todo') return 'planned';
  if (status === 'paused') return 'paused';
  return 'progress';
}

function projectProgress(project) {
  const total = Number(project?.taskCount ?? project?.totalTasks ?? project?.tasksCount ?? 0) || 0;
  const done = Number(project?.doneCount ?? project?.completedTasks ?? project?.completedTaskCount ?? 0) || 0;
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function ProjectSummaryPanel({ projects = [], loading = false }) {
  const rows = Array.isArray(projects) ? projects.slice(0, 5) : [];
  const total = Array.isArray(projects) ? projects.length : 0;
  const allProjects = Array.isArray(projects) ? projects : [];
  const totalTasks = allProjects.reduce(
    (sum, project) => sum + (Number(project?.taskCount ?? project?.totalTasks ?? project?.tasksCount ?? 0) || 0),
    0
  );
  const completedTasks = allProjects.reduce(
    (sum, project) => sum + (Number(project?.doneCount ?? project?.completedTasks ?? project?.completedTaskCount ?? 0) || 0),
    0
  );
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <section className={styles.projectsPanel}>
      <div className={styles.projectsHeader}>
        <h3>Projetos</h3>
        <div className={styles.projectsSummary}>
          <span>{fmtInt(total)}</span>
          <span>{fmtInt(overallProgress)}%</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.projectsEmpty}>Carregando projetos</div>
      ) : rows.length > 0 ? (
        <div className={styles.projectsList}>
          {rows.map((project, index) => {
            const progress = projectProgress(project);
            const taskCount = Number(project?.taskCount ?? project?.totalTasks ?? project?.tasksCount ?? 0) || 0;
            const doneCount = Number(project?.doneCount ?? project?.completedTasks ?? project?.completedTaskCount ?? 0) || 0;
            const tone = projectStatusTone(project.status);
            return (
              <article key={project.id || `${project.name}-${index}`} className={styles.projectItem}>
                <span className={styles.projectDot} aria-hidden="true" />
                <span className={styles.projectMark}><ProjectBoardIcon size={18} /></span>
                <span className={styles.projectInfo}>
                  <strong>{project.name || 'Projeto'}</strong>
                  <small>{project.squadName || project.clientName || 'Sem squad'}</small>
                </span>
                <span className={styles.projectProgressGroup}>
                  <strong>{progress}%</strong>
                  <span className={styles.projectProgressTrack} aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                  </span>
                </span>
                <span className={styles.projectTaskCount}>{doneCount}/{taskCount}</span>
                <span className={`${styles.projectStatus} ${styles[`projectStatus_${tone}`]}`}>
                  {projectStatusLabel(project.status)}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.projectsEmpty}>Nenhum projeto encontrado</div>
      )}
    </section>
  );
}

function buildClientActivities(clients = []) {
  const now = new Date();
  const events = [];

  (Array.isArray(clients) ? clients : []).forEach((client) => {
    const created = parseAnyDate(client?.createdAt);
    if (created && created <= now) {
      events.push({
        key: `${client.id}-created`,
        client,
        date: created,
        tone: 'amber',
        text: 'foi cadastrado',
      });
    }

    const start = parseClientDate(client?.startDate);
    if (start && start <= now) {
      events.push({
        key: `${client.id}-start`,
        client,
        date: start,
        tone: 'green',
        text: 'iniciou contrato',
      });
    }

    const churn = parseClientDate(client?.churnDate);
    if (churn && churn <= now) {
      events.push({
        key: `${client.id}-churn`,
        client,
        date: churn,
        tone: 'pink',
        text: 'teve churn registrado',
      });
    }
  });

  return events
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);
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
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);

    listProjects()
      .then((data) => {
        if (!cancelled) setProjects(Array.isArray(data?.projects) ? data.projects : []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    () => [
      {
        id: 'base',
        label: 'Base de dados',
        value: fmtInt(totalClients),
        helper: '',
        detail: '',
        tone: 'neutral',
      },
      {
        id: 'ativos',
        label: 'Clientes ativos',
        value: fmtInt(activeClients),
        helper: '',
        detail: totalClients > 0 ? `${fmtInt(totalClients)} na base` : '',
        tone: 'neutral',
      },
      {
        id: 'novosAtual',
        label: 'Clientes novos no mês atual',
        value: fmtInt(currentMonthNewClients),
        helper: '',
        detail: `${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`,
        tone: currentMonthNewClients > 0 ? 'good' : 'neutral',
      },
      {
        id: 'mrr',
        label: 'MRR atual',
        value: fmtMoney(mrr),
        helper: '',
        detail: activeClients > 0 ? `${fmtInt(activeClients)} clientes` : '',
        tone: 'neutral',
      },
      {
        id: 'receitaNova',
        label: 'Receita nova gerada',
        value: fmtMoney(revenueNew),
        helper: '',
        detail: `${fmtInt(newClients)} novo(s) em ${MONTHS_FULL[period.m]}`,
        tone: revenueNew > 0 ? 'good' : 'neutral',
      },
      {
        id: 'ticket',
        label: 'Ticket médio',
        value: fmtMoney(ticketMedio),
        helper: '',
        detail: '',
        tone: 'neutral',
      },
      {
        id: 'perdida',
        label: 'Receita perdida no mês',
        value: fmtMoney(revenueLost),
        helper: '',
        detail: `${fmtInt(churnedPeriod)} churn(s) em ${MONTHS_FULL[period.m]}`,
        tone: revenueLost > 0 ? 'risk' : 'neutral',
      },
      {
        id: 'churn',
        label: 'Taxa de churn',
        value: fmtPct(churnRate),
        helper: '',
        detail: churnedPeriod > 0 ? `${fmtInt(churnedPeriod)} no período` : '',
        progress: Math.min(churnRate, 100),
        tone: toneFromChurn(churnRate),
      },
    ],
    [
      activeClients,
      churnRate,
      churnedPeriod,
      currentMonthNewClients,
      mrr,
      newClients,
      now,
      period,
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
        <strong>Dashboard</strong>
        <span>·</span>
        <span>{`${MONTHS_FULL[period.m]} ${period.y}`}</span>
      </>
    );

    const handlePeriodChange = (event) => {
      const [year, month] = event.target.value.split('-').map(Number);
      if (Number.isFinite(year) && Number.isFinite(month)) setPeriod({ y: year, m: month });
    };

    const actions = (
      <div className={styles.toolbar}>
        {Array.isArray(squads) && squads.length > 0 ? (
          <Select
            value={squadFilter}
            onChange={(event) => setSquadFilter(event.target.value)}
            aria-label="Filtrar por squad"
          >
            <option value="">Todos squads</option>
            {squads.map((squad) => (
              <option key={squad.id} value={squad.id}>
                {squad.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          aria-label="Filtrar por cliente"
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
  }, [clientFilter, clientOptions, period, periodOptions, setPanelHeader, squadFilter, squads]);

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
            <ProjectSummaryPanel projects={projects} loading={projectsLoading} />
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
