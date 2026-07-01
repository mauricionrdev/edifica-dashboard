import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getGdvRanking } from '../../api/metrics.js';
import { SearchIcon, ShieldIcon, TargetIcon, TrophyIcon, UsersIcon } from '../../components/ui/Icons.jsx';
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

function rowSearchText(row) {
  return normalizeText([row.gdv?.name, row.gdvName, row.name].filter(Boolean).join(' '));
}

export default function GdvsV2Page() {
  const { gdvs = [], clients = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [query, setQuery] = useState('');
  const [rankingPayload, setRankingPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadGdvs() {
      setLoading(true);
      setError(null);
      try {
        const ranking = await getGdvRanking({ date: referenceDate(period) });
        if (!cancelled) setRankingPayload(ranking || null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadGdvs();
    return () => { cancelled = true; };
  }, [period.month, period.year]);

  const rows = useMemo(() => {
    const needle = normalizeText(query);
    const source = Array.isArray(rankingPayload?.rows) ? rankingPayload.rows : [];
    if (!needle) return source;
    return source.filter((row) => rowSearchText(row).includes(needle));
  }, [query, rankingPayload]);

  const leader = rows[0] || null;
  const globalGoal = rankingPayload?.globalGoal || {};
  const activeGdvs = rows.filter((row) => safeNumber(row.activeClients ?? row.rankingGoalBaseClients) > 0).length;
  const clientsWithGdv = clients.filter((client) => String(client.gdvName || client.gdv_name || '').trim()).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TrophyIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>GDVs V2 · rota paralela</p>
          <h1>Leitura do ranking de GDVs</h1>
          <p>
            Visualiza o ranking por GDV usando apenas GET. Não altera permissões, carteira, metas ou dados de cliente.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros dos GDVs V2">
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="GDV" />
        </label>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar os GDVs V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Indicadores dos GDVs V2">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>GDVs cadastrados</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(gdvs.length || rows.length)}</strong>
          <p className={styles.cardHelper}>{safeInt(activeGdvs)} com base ativa no ranking</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Clientes com GDV</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(clientsWithGdv)}</strong>
          <p className={styles.cardHelper}>Base carregada pelo shell</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Meta global</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safePct(globalGoal.progress)}</strong>
          <p className={styles.cardHelper}>{safeInt(globalGoal.clientsWithGoal)} de {safeInt(globalGoal.targetClients)} clientes</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>MRR em ranking</span><TrophyIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeMoney(rows.reduce((sum, row) => sum + safeNumber(row.mrr), 0))}</strong>
          <p className={styles.cardHelper}>Leitura mensal do período</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Líder atual</p>
              <h2>{leader?.gdv?.name || leader?.gdvName || leader?.name || 'Sem líder'}</h2>
              <p>Ranking ao vivo por GDV. Não interfere no ranking oficial nem em permissões.</p>
            </div>
            <span className={styles.statusBadgeMuted}>GET /api/metrics/ranking/gdvs</span>
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
                <span className={styles.chip}>Clientes {safeInt(leader.rankingGoalBaseClients ?? leader.activeClients)}</span>
              </div>
            </div>
          ) : <p className={styles.emptyState}>Nenhum GDV retornado para o período.</p>}
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Validação</p>
              <h2>Sem impacto operacional</h2>
              <p>Rota criada para comparação visual antes de qualquer troca em produção.</p>
            </div>
          </header>
          <div className={styles.chips}>
            <span className={styles.chip}>Somente GET</span>
            <span className={styles.chip}>Sem alteração de banco</span>
            <span className={styles.chip}>Oculta da sidebar</span>
          </div>
        </article>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Tabela</p>
            <h2>GDVs do período</h2>
            <p>Visão simplificada do ranking para validação de dados.</p>
          </div>
        </header>
        <div className={styles.table} role="table" aria-label="GDVs V2">
          <div className={styles.tableHead} role="row">
            <span>GDV</span><span>Meta</span><span>Previsto</span><span>Churn</span><span>MRR</span>
          </div>
          {rows.map((row, index) => (
            <div className={styles.tableRow} role="row" key={row.gdv?.id || row.gdvId || row.id || index}>
              <span><strong>{String(index + 1).padStart(2, '0')} · {row.gdv?.name || row.gdvName || row.name || 'GDV'}</strong><br /><small>{safeInt(row.rankingGoalClients ?? row.clientsWithGoal)} bateram meta</small></span>
              <span>{safePct(row.metaActiveProgress ?? row.metaIndex)}</span>
              <span>{safePct(row.projectedProgress ?? row.projectedRate)}</span>
              <span>{safePct(row.churnRate)}</span>
              <span>{safeMoney(row.mrr)}</span>
            </div>
          ))}
        </div>
        {!loading && rows.length === 0 ? <p className={styles.emptyState}>Nenhum GDV retornado.</p> : null}
      </section>
    </main>
  );
}
