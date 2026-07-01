import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getContractsSummary, getDashboardTargets, getRetentionMetrics, getSquadRanking } from '../../api/metrics.js';
import { ChartColumnIcon, SearchIcon, ShieldIcon, TargetIcon, TrendingUpIcon, TrophyIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import {
  buildPeriodOptions,
  currentPeriod,
  errorMessage,
  periodValue,
  progressWidth,
  referenceDate,
  resolveSquadName,
  safeInt,
  safeMoney,
  safePct,
  safeNumber,
} from './v2PageUtils.js';
import styles from './V2Operations.module.css';

function targetTone(value, target, invert = false) {
  const safeValue = safeNumber(value, 0);
  const safeTarget = safeNumber(target, 0);
  if (!safeTarget) return styles.toneWarning;
  const ok = invert ? safeValue <= safeTarget : safeValue >= safeTarget;
  return ok ? styles.toneGood : styles.toneDanger;
}

export default function DashboardV2Page() {
  const { squads = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [squadId, setSquadId] = useState('');
  const [summaryPayload, setSummaryPayload] = useState(null);
  const [rankingPayload, setRankingPayload] = useState(null);
  const [retentionPayload, setRetentionPayload] = useState(null);
  const [targetsPayload, setTargetsPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const month = periodValue(period);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const [summary, ranking, retention, targets] = await Promise.all([
          getContractsSummary({ date: referenceDate(period), squadId }),
          getSquadRanking({ date: referenceDate(period), squadId }),
          getRetentionMetrics({ month, squadId }),
          getDashboardTargets({ month }),
        ]);
        if (cancelled) return;
        setSummaryPayload(summary || null);
        setRankingPayload(ranking || null);
        setRetentionPayload(retention || null);
        setTargetsPayload(targets || null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDashboard();
    return () => { cancelled = true; };
  }, [month, period.month, period.year, squadId]);

  const totals = summaryPayload?.totals || {};
  const clients = Array.isArray(summaryPayload?.clients) ? summaryPayload.clients : [];
  const globalGoal = rankingPayload?.globalGoal || {};
  const retentionSummary = retentionPayload?.summary || {};
  const targets = targetsPayload?.targets || {};
  const selectedSquad = resolveSquadName(squads, squadId);
  const bestSquads = Array.isArray(rankingPayload?.rows) ? rankingPayload.rows.slice(0, 5) : [];
  const clientsWithoutGoal = Math.max(0, clients.length - safeNumber(totals.clientsWithGoal, 0));

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><ChartColumnIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Dashboard V2 · rota paralela</p>
          <h1>Painel executivo somente leitura</h1>
          <p>
            Consolida contratos, ranking e retenção pelos endpoints já existentes. Não salva metas, não altera o banco e não substitui o Dashboard oficial.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros do Dashboard V2">
        <label className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Período</span>
          <select
            value={periodValue(period)}
            onChange={(event) => {
              const option = periodOptions.find((item) => item.value === event.target.value);
              if (option) setPeriod({ year: option.year, month: option.month });
            }}
          >
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Squad</span>
          <select value={squadId} onChange={(event) => setSquadId(event.target.value)}>
            <option value="">Todos os squads</option>
            {squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
          </select>
        </label>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar o Dashboard V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Indicadores do Dashboard V2">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Clientes na base</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(totals.total)}</strong>
          <p className={styles.cardHelper}>{safeInt(totals.clientsWithGoal)} com meta · {safeInt(clientsWithoutGoal)} sem meta</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Fechados no mês</span><TrendingUpIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(totals.monthClosed)}</strong>
          <p className={styles.cardHelper}>Meta mensal: {safeInt(totals.monthGoal)}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Meta global</span><TargetIcon size={15} /></div>
          <strong className={`${styles.cardValue} ${targetTone(globalGoal.progress, 100)}`}>{safePct(globalGoal.progress)}</strong>
          <p className={styles.cardHelper}>{safeInt(globalGoal.clientsWithGoal)} de {safeInt(globalGoal.targetClients)} clientes</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Churn carteira</span><TrophyIcon size={15} /></div>
          <strong className={`${styles.cardValue} ${targetTone(retentionSummary.portfolioChurnRate, targets.churnTarget, true)}`}>{safePct(retentionSummary.portfolioChurnRate)}</strong>
          <p className={styles.cardHelper}>Meta: {targets.churnTarget ? safePct(targets.churnTarget) : 'não cadastrada'}</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Operação</p>
              <h2>{selectedSquad}</h2>
              <p>Resumo do mês em andamento pela API de métricas.</p>
            </div>
            <span className={styles.statusBadgeMuted}>GET /api/metrics/summary</span>
          </header>
          <div className={styles.stackList}>
            <div>
              <div className={styles.cardTop}><span>Progresso mensal</span><strong>{safePct(totals.monthProgress)}</strong></div>
              <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(totals.monthProgress)}%` }} /></div>
            </div>
            <div>
              <div className={styles.cardTop}><span>Progresso semanal</span><strong>{safePct(totals.weekProgress)}</strong></div>
              <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(totals.weekProgress)}%` }} /></div>
            </div>
            <div className={styles.chips}>
              <span className={styles.chip}>Semana: {summaryPayload?.weekKey || '—'}</span>
              <span className={styles.chip}>Mês: {summaryPayload?.monthPrefix || month}</span>
              <span className={styles.chip}>Delta mensal: {safeInt(totals.monthDelta)}</span>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Ranking</p>
              <h2>Top squads</h2>
              <p>Leitura do ranking ao vivo, sem snapshot de campeão.</p>
            </div>
            <span className={styles.statusBadgeMuted}>GET /api/metrics/ranking</span>
          </header>
          <div className={styles.leaderList}>
            {bestSquads.map((row, index) => (
              <article className={styles.leaderCard} key={row.squad?.id || row.squadId || index}>
                <span className={styles.rankPill}>{String(index + 1).padStart(2, '0')}</span>
                <div className={styles.leaderIdentity}>
                  <strong className={styles.leaderName}>{row.squad?.name || row.squadName || 'Squad'}</strong>
                  <p className={styles.rowMeta}>{row.ownerName || 'Sem responsável'}</p>
                </div>
                <div className={styles.leaderStats}>
                  <span>{safePct(row.metaActiveProgress ?? row.metaIndex)}</span>
                  <span>{safeMoney(row.mrr)}</span>
                </div>
              </article>
            ))}
            {!loading && bestSquads.length === 0 ? <p className={styles.emptyState}>Nenhum ranking retornado para o período.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
