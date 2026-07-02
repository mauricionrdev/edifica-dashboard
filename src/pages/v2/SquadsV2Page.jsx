import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getContractsSummary, getSquadRanking } from '../../api/metrics.js';
import { ChartColumnIcon, SearchIcon, ShieldIcon, TargetIcon, TrophyIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import {
  buildPeriodOptions,
  currentPeriod,
  errorMessage,
  normalizeText,
  periodValue,
  progressWidth,
  referenceDate,
  safeInt,
  safeMoney,
  safePct,
  safeNumber,
} from './v2PageUtils.js';
import styles from './V2Operations.module.css';
import V2RouteNav from './V2RouteNav.jsx';

function rowSearchText(row) {
  return normalizeText([row.squad?.name, row.squadName, row.ownerName, row.gdvName].filter(Boolean).join(' '));
}

export default function SquadsV2Page() {
  const { squads = [], clients = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [query, setQuery] = useState('');
  const [rankingPayload, setRankingPayload] = useState(null);
  const [summaryPayload, setSummaryPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSquads() {
      setLoading(true);
      setError(null);
      try {
        const [ranking, summary] = await Promise.all([
          getSquadRanking({ date: referenceDate(period) }),
          getContractsSummary({ date: referenceDate(period) }),
        ]);
        if (cancelled) return;
        setRankingPayload(ranking || null);
        setSummaryPayload(summary || null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSquads();
    return () => { cancelled = true; };
  }, [period.month, period.year]);

  const rows = useMemo(() => {
    const needle = normalizeText(query);
    const source = Array.isArray(rankingPayload?.rows) ? rankingPayload.rows : [];
    if (!needle) return source;
    return source.filter((row) => rowSearchText(row).includes(needle));
  }, [query, rankingPayload]);

  const totals = summaryPayload?.totals || {};
  const globalGoal = rankingPayload?.globalGoal || {};
  const totalSquads = squads.length || rows.length;
  const totalClients = Array.isArray(clients) ? clients.length : 0;
  const activeRows = rows.filter((row) => safeNumber(row.rankingGoalBaseClients ?? row.activeClients) > 0).length;
  const leader = rows[0] || null;

  return (
    <main className={styles.page}>
      <V2RouteNav currentKey="squads" />
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TrophyIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Squads V2 · rota paralela</p>
          <h1>Leitura operacional dos squads</h1>
          <p>
            Cruza ranking ao vivo e summary mensal usando os endpoints atuais. Não grava campeão, não altera squad e não substitui a Carteira oficial.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros dos Squads V2">
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
        <label className={styles.searchBox}>
          <span className={styles.fieldLabel}>Busca</span>
          <SearchIcon size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Squad ou responsável" />
        </label>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar os Squads V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Indicadores dos Squads V2">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Squads cadastrados</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(totalSquads)}</strong>
          <p className={styles.cardHelper}>{safeInt(activeRows)} com base ativa no ranking</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Clientes no shell</span><ChartColumnIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(totalClients)}</strong>
          <p className={styles.cardHelper}>Base carregada pelo AppShell</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Meta global</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safePct(globalGoal.progress)}</strong>
          <p className={styles.cardHelper}>{safeInt(globalGoal.clientsWithGoal)} de {safeInt(globalGoal.targetClients)} clientes</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>MRR em ranking</span><TrophyIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeMoney(rows.reduce((sum, row) => sum + safeNumber(row.mrr), 0))}</strong>
          <p className={styles.cardHelper}>Fechados no mês: {safeInt(totals.monthClosed)}</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Líder atual</p>
              <h2>{leader?.squad?.name || leader?.squadName || 'Sem líder'}</h2>
              <p>Ranking ao vivo. Campeão oficial continua dependendo do fechamento mensal no backend.</p>
            </div>
            <span className={styles.statusBadgeMuted}>GET /api/metrics/ranking</span>
          </header>
          {leader ? (
            <div className={styles.stackList}>
              <div>
                <div className={styles.cardTop}><span>Meta ativa</span><strong>{safePct(leader.metaActiveProgress ?? leader.metaIndex)}</strong></div>
                <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(leader.metaActiveProgress ?? leader.metaIndex)}%` }} /></div>
              </div>
              <div className={styles.chips}>
                <span className={styles.chip}>MRR {safeMoney(leader.mrr)}</span>
                <span className={styles.chip}>Churn {safePct(leader.churnRate)}</span>
                <span className={styles.chip}>Previsto {safePct(leader.projectedProgress ?? leader.projectedRate)}</span>
              </div>
            </div>
          ) : <p className={styles.emptyState}>Nenhum squad retornado para o período.</p>}
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Validação</p>
              <h2>Sem impacto operacional</h2>
              <p>Esta rota apenas lê dados. A carteira oficial de cada squad permanece em /squads/:squadId.</p>
            </div>
          </header>
          <div className={styles.chips}>
            <span className={styles.chip}>Ranking ao vivo</span>
            <span className={styles.chip}>Sem snapshot</span>
            <span className={styles.chip}>Sem PUT/POST</span>
          </div>
        </article>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Tabela</p>
            <h2>Squads do período</h2>
            <p>Mesma base do ranking, em leitura simplificada para comparação.</p>
          </div>
        </header>
        <div className={styles.table} role="table" aria-label="Squads V2">
          <div className={styles.tableHead} role="row">
            <span>Squad</span><span>Meta</span><span>Previsto</span><span>Churn</span><span>MRR</span>
          </div>
          {rows.map((row, index) => (
            <div className={styles.tableRow} role="row" key={row.squad?.id || row.squadId || index}>
              <span><strong>{String(index + 1).padStart(2, '0')} · {row.squad?.name || row.squadName || 'Squad'}</strong><br /><small>{row.ownerName || 'Sem responsável'}</small></span>
              <span>{safePct(row.metaActiveProgress ?? row.metaIndex)}</span>
              <span>{safePct(row.projectedProgress ?? row.projectedRate)}</span>
              <span>{safePct(row.churnRate)}</span>
              <span>{safeMoney(row.mrr)}</span>
            </div>
          ))}
        </div>
        {!loading && rows.length === 0 ? <p className={styles.emptyState}>Nenhum squad retornado.</p> : null}
      </section>
    </main>
  );
}
