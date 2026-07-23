import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  RefreshCw,
  Target,
  TrendingDown,
  Users,
} from 'lucide-react';
import { listClients } from '../../api/clients.js';
import { getRetentionMetrics, getSquadRanking } from '../../api/metrics.js';
import { listSquads } from '../../api/squads.js';
import { buildBarChartData, clientsEndingSoon, computeCentralMetrics } from '../../utils/centralMetrics.js';
import { fmtMoney, fmtPct, MONTHS_FULL } from '../../utils/format.js';
import MetricCard from '../components/MetricCard.jsx';
import Select from '../components/Select.jsx';
import styles from './NewDashboardPage.module.css';

function buildPeriodOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`,
    };
  });
}

function parseMonth(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month0: Number.isFinite(month) ? month - 1 : new Date().getMonth(),
  };
}

function referenceDate(monthKey) {
  return `${monthKey}-15`;
}

function clientSquadId(client) {
  return client?.squadId || client?.squad_id || '';
}

function formatInteger(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function premiumFlag(client) {
  const value = client?.isPremium ?? client?.is_premium;
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

function LoadingState() {
  return (
    <div className={styles.loadingGrid} aria-label="Carregando dashboard">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={styles.loadingBlock} />
      ))}
      <span className={`${styles.loadingBlock} ${styles.loadingWide}`} />
      <span className={`${styles.loadingBlock} ${styles.loadingWide}`} />
    </div>
  );
}

export default function NewDashboardPage() {
  const periods = useMemo(buildPeriodOptions, []);
  const [period, setPeriod] = useState(periods[0]?.value || '');
  const [squadId, setSquadId] = useState('');
  const [clients, setClients] = useState([]);
  const [squads, setSquads] = useState([]);
  const [rankingRows, setRankingRows] = useState([]);
  const [retention, setRetention] = useState(null);
  const [rankingAvailable, setRankingAvailable] = useState(false);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [error, setError] = useState('');
  const [baseNotice, setBaseNotice] = useState('');
  const [metricsNotice, setMetricsNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadBaseData() {
      setLoadingBase(true);
      setError('');
      setBaseNotice('');
      const [clientsResult, squadsResult] = await Promise.allSettled([
        listClients(),
        listSquads(),
      ]);
      if (!active) return;

      if (clientsResult.status === 'fulfilled') {
        setClients(Array.isArray(clientsResult.value?.clients) ? clientsResult.value.clients : []);
      } else {
        setClients([]);
        setError(clientsResult.reason?.message || 'Não foi possível carregar os clientes.');
      }

      if (squadsResult.status === 'fulfilled') {
        setSquads(Array.isArray(squadsResult.value?.squads) ? squadsResult.value.squads : []);
      } else {
        setSquads([]);
        setBaseNotice('O filtro de Squads não pôde ser carregado pelo backend.');
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
    async function loadMetrics() {
      setLoadingMetrics(true);
      setMetricsNotice('');
      const [rankingResult, retentionResult] = await Promise.allSettled([
        getSquadRanking({ date: referenceDate(period), squadId }),
        getRetentionMetrics({ month: period, squadId }),
      ]);
      if (!active) return;

      setRankingRows(
        rankingResult.status === 'fulfilled' && Array.isArray(rankingResult.value?.rows)
          ? rankingResult.value.rows
          : []
      );
      setRankingAvailable(rankingResult.status === 'fulfilled');
      setRetention(
        retentionResult.status === 'fulfilled'
          ? retentionResult.value?.summary || null
          : null
      );
      if (rankingResult.status === 'rejected' || retentionResult.status === 'rejected') {
        setMetricsNotice(
          'Parte dos indicadores analíticos não pôde ser carregada pelo backend. Os dados indisponíveis estão sinalizados.'
        );
      }
      setLoadingMetrics(false);
    }
    loadMetrics();
    return () => {
      active = false;
    };
  }, [period, squadId, refreshKey]);

  const squadOptions = useMemo(
    () => [
      { value: '', label: 'Todos os Squads' },
      ...squads
        .filter((squad) => squad?.id && squad?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
        .map((squad) => ({ value: squad.id, label: squad.name })),
    ],
    [squads]
  );

  const filteredClients = useMemo(
    () => (squadId ? clients.filter((client) => String(clientSquadId(client)) === String(squadId)) : clients),
    [clients, squadId]
  );
  const { year, month0 } = useMemo(() => parseMonth(period), [period]);
  const metrics = useMemo(
    () => computeCentralMetrics(filteredClients, year, month0),
    [filteredClients, month0, year]
  );
  const previousPeriod = useMemo(() => {
    const date = new Date(year, month0 - 1, 1);
    return computeCentralMetrics(filteredClients, date.getFullYear(), date.getMonth());
  }, [filteredClients, month0, year]);
  const entries = useMemo(
    () => buildBarChartData(filteredClients, year, month0, 6),
    [filteredClients, month0, year]
  );
  const endingSoon = useMemo(
    () => clientsEndingSoon(filteredClients, 45).slice(0, 5),
    [filteredClients]
  );

  const predictedGoal = useMemo(() => {
    const totals = rankingRows.reduce(
      (acc, row) => ({
        clients: acc.clients + (Number(row?.predictedGoalClients) || 0),
        base: acc.base + (Number(row?.predictedGoalBaseClients) || 0),
      }),
      { clients: 0, base: 0 }
    );
    return {
      percent: totals.base > 0 ? (totals.clients / totals.base) * 100 : 0,
      clients: totals.clients,
      base: totals.base,
    };
  }, [rankingRows]);

  const mrrDelta = Number(metrics.mrr || 0) - Number(previousPeriod.mrr || 0);
  const activeDelta = Number(metrics.active || 0) - Number(previousPeriod.active || 0);
  const maxEntries = Math.max(...entries.map((entry) => Number(entry.cnt) || 0), 1);
  const selectedSquad = squads.find((squad) => String(squad.id) === String(squadId));
  const loading = loadingBase || loadingMetrics;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Visão executiva</span>
          <h1>Dashboard</h1>
        </div>
        <div className={styles.filters}>
          <Select
            value={period}
            options={periods}
            onChange={setPeriod}
            ariaLabel="Selecionar período"
          />
          <Select
            value={squadId}
            options={squadOptions}
            onChange={setSquadId}
            ariaLabel="Filtrar por Squad"
            className={styles.squadSelect}
          />
          <button
            type="button"
            className={styles.refreshButton}
            aria-label="Atualizar dashboard"
            title="Atualizar"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? styles.spinning : ''} />
          </button>
        </div>
      </header>

      {error ? (
        <div className={styles.errorState} role="alert">
          <div>
            <strong>Não foi possível carregar o Dashboard</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Tentar novamente</button>
        </div>
      ) : null}

      {baseNotice || metricsNotice ? (
        <div className={styles.noticeState} role="status">
          {[baseNotice, metricsNotice].filter(Boolean).join(' ')}
        </div>
      ) : null}

      {loading && clients.length === 0 ? <LoadingState /> : (
        <>
          <section className={styles.metricsGrid} aria-label="Indicadores principais">
            <MetricCard
              label="MRR"
              value={fmtMoney(metrics.mrr)}
              detail={selectedSquad?.name || 'Carteira consolidada'}
              meta={`${mrrDelta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(mrrDelta))}`}
              icon={CircleDollarSign}
              tone={mrrDelta >= 0 ? 'positive' : 'danger'}
            />
            <MetricCard
              label="Carteira ativa"
              value={formatInteger(metrics.active)}
              detail={`${formatInteger(metrics.total)} clientes vinculados`}
              meta={`${activeDelta >= 0 ? '+' : '−'}${formatInteger(Math.abs(activeDelta))}`}
              icon={Users}
              tone="neutral"
            />
            <MetricCard
              label="Novos clientes"
              value={formatInteger(metrics.newCnt)}
              detail={fmtMoney(metrics.revenueNew)}
              meta="no período"
              icon={ArrowUpRight}
              tone={metrics.newCnt > 0 ? 'positive' : 'neutral'}
            />
            <MetricCard
              label="Churn da carteira"
              value={loadingMetrics || !retention ? '—' : fmtPct(retention.portfolioChurnRate)}
              detail={retention
                ? `${formatInteger(retention.portfolioChurn)} de ${formatInteger(retention.portfolioStart)}`
                : 'Indicador indisponível'}
              meta={retention ? 'no período' : ''}
              icon={TrendingDown}
              tone={Number(retention?.portfolioChurnRate) > 8 ? 'danger' : 'neutral'}
            />
            <MetricCard
              label="Receita perdida"
              value={fmtMoney(metrics.revLost)}
              detail={`${formatInteger(metrics.churnedPeriodCnt)} churn`}
              meta={`${formatInteger(metrics.finishedPeriodCnt)} finalizado`}
              icon={ArrowDownRight}
              tone={metrics.revLost > 0 ? 'danger' : 'neutral'}
            />
            <MetricCard
              label="Meta prevista"
              value={loadingMetrics || !rankingAvailable ? '—' : fmtPct(predictedGoal.percent)}
              detail={rankingAvailable
                ? `${formatInteger(predictedGoal.clients)} de ${formatInteger(predictedGoal.base)} clientes`
                : 'Indicador indisponível'}
              meta={rankingAvailable ? 'bateu + previsto' : ''}
              icon={Target}
              tone={rankingAvailable && predictedGoal.percent >= 80 ? 'brand' : 'warning'}
            />
          </section>

          <section className={styles.contentGrid}>
            <article className={`${styles.panel} ${styles.entriesPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Entradas de clientes</h2>
                  <span>Últimos seis meses</span>
                </div>
                <strong>{formatInteger(entries.reduce((sum, entry) => sum + Number(entry.cnt || 0), 0))}</strong>
              </header>

              {entries.some((entry) => Number(entry.cnt) > 0) ? (
                <div className={styles.barChart} aria-label="Entradas de clientes por mês">
                  {entries.map((entry) => {
                    const height = Math.max(8, (Number(entry.cnt || 0) / maxEntries) * 100);
                    const current = `${entry.y}-${String(entry.m + 1).padStart(2, '0')}` === period;
                    return (
                      <div key={`${entry.y}-${entry.m}`} className={styles.barColumn}>
                        <span className={styles.barValue}>{formatInteger(entry.cnt)}</span>
                        <div className={styles.barTrack}>
                          <i
                            className={current ? styles.barCurrent : ''}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <span className={current ? styles.barLabelCurrent : styles.barLabel}>
                          {MONTHS_FULL[entry.m].slice(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyCheck}>✓</span>
                  <strong>Nenhuma entrada no período</strong>
                </div>
              )}
            </article>

            <article className={`${styles.panel} ${styles.retentionPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Retenção</h2>
                  <span>{periods.find((item) => item.value === period)?.label}</span>
                </div>
                <span className={`${styles.healthStatus} ${
                  !retention
                    ? styles.healthUnavailable
                    : Number(retention.portfolioChurnRate) > 8
                      ? styles.healthRisk
                      : styles.healthStable
                }`}>
                  {!retention
                    ? 'Indisponível'
                    : Number(retention.portfolioChurnRate) > 8
                      ? 'Atenção'
                      : 'Estável'}
                </span>
              </header>

              {retention ? (
                <>
                  <div className={styles.retentionHero}>
                    <span>Churn da carteira</span>
                    <strong>{fmtPct(retention.portfolioChurnRate)}</strong>
                    <i>
                      <b style={{ width: `${Math.min(Number(retention.portfolioChurnRate) || 0, 100)}%` }} />
                    </i>
                  </div>
                  <div className={styles.retentionStats}>
                    <div>
                      <span>Churn precoce</span>
                      <strong>{fmtPct(retention.earlyChurnRate)}</strong>
                    </div>
                    <div>
                      <span>LTV médio</span>
                      <strong>{Number(retention.ltvAverageMonths || 0).toFixed(1).replace('.', ',')} meses</strong>
                    </div>
                    <div>
                      <span>Churns</span>
                      <strong>{formatInteger(retention.churnTotal)}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyCheck}>✓</span>
                  <strong>Indicadores de retenção indisponíveis</strong>
                </div>
              )}
            </article>
          </section>

          <section className={styles.lowerGrid}>
            <article className={`${styles.panel} ${styles.squadsPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Performance por Squad</h2>
                  <span>Meta, previsão e retenção no mesmo período</span>
                </div>
              </header>

              {rankingRows.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Squad</th>
                        <th>Carteira</th>
                        <th>Realizada</th>
                        <th>Prevista</th>
                        <th>Churn</th>
                        <th>MRR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingRows.slice(0, 6).map((row) => (
                        <tr key={row?.squad?.id || row?.squad?.name}>
                          <td>
                            <span className={styles.squadCell}>
                              <span className={styles.squadMark}>
                                {row?.squad?.logoUrl ? <img src={row.squad.logoUrl} alt="" /> : <Building2 size={15} />}
                              </span>
                              <span>
                                <strong>{row?.squad?.name || 'Squad'}</strong>
                                <small>{row?.ownerName || 'Sem responsável'}</small>
                              </span>
                            </span>
                          </td>
                          <td>{formatInteger(row?.activeClients)}</td>
                          <td>{fmtPct(row?.metaActiveProgress)}</td>
                          <td className={styles.predictedCell}>{fmtPct(row?.predictedGoalProgress)}</td>
                          <td className={Number(row?.churnRate) > 8 ? styles.riskCell : ''}>{fmtPct(row?.churnRate)}</td>
                          <td>{fmtMoney(row?.mrr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyCheck}>✓</span>
                  <strong>
                    {rankingAvailable ? 'Nenhum Squad disponível' : 'Ranking indisponível'}
                  </strong>
                </div>
              )}
            </article>

            <article className={`${styles.panel} ${styles.expiringPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Contratos vencendo</h2>
                  <span>Próximos 45 dias</span>
                </div>
                <CalendarDays size={17} aria-hidden="true" />
              </header>

              {endingSoon.length > 0 ? (
                <div className={styles.expiringList}>
                  {endingSoon.map(({ client, daysLeft }) => (
                    <div key={client.id} className={styles.expiringItem}>
                      <span className={styles.clientMark}>
                        {client.avatarUrl ? <img src={client.avatarUrl} alt="" /> : initials(client.name)}
                      </span>
                      <span className={styles.clientInfo}>
                        <span className={styles.clientNameRow}>
                          <strong>{client.name || 'Cliente'}</strong>
                          {premiumFlag(client) ? <em>Premium</em> : null}
                        </span>
                        <small>{client.squadName || 'Sem Squad'}</small>
                      </span>
                      <span className={styles.expiringDate}>
                        <strong>{formatDate(client.endDate)}</strong>
                        <small>{daysLeft === 0 ? 'hoje' : `${daysLeft} dias`}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyCheck}>✓</span>
                  <strong>Nenhum contrato próximo do vencimento</strong>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
