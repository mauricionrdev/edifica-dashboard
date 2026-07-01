import { useEffect, useMemo, useState } from 'react';
import { getGdvRanking, getSquadRanking, getSquadRankingChampions } from '../../api/metrics.js';
import { SearchIcon, ShieldIcon, TargetIcon, TrophyIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import {
  buildPeriodOptions,
  currentPeriod,
  errorMessage,
  monthLabel,
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

function entityName(row, type) {
  if (type === 'gdv') return row?.gdv?.name || row?.gdvName || row?.name || 'GDV';
  return row?.squad?.name || row?.squadName || row?.name || 'Squad';
}

function ownerName(row) {
  return row?.ownerName || row?.owner?.name || 'Sem responsável';
}

function realizedPercent(row) {
  return safeNumber(row?.metaActiveProgress ?? row?.metaIndex ?? row?.realizedPercent, 0);
}

function predictedPercent(row) {
  return safeNumber(row?.predictedGoalProgress ?? row?.projectedGoalProgress ?? row?.predictedPercent, 0);
}

function rankingRowId(row, index, type) {
  return row?.[`${type}Id`] || row?.[type]?.id || row?.id || `${type}-${index}`;
}

function RankingList({ title, subtitle, rows, type }) {
  return (
    <article className={styles.panel}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>{type === 'gdv' ? 'Ranking GDV' : 'Ranking Squad'}</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className={styles.statusBadgeMuted}>Somente leitura</span>
      </header>
      <div className={styles.leaderList}>
        {rows.map((row, index) => {
          const realized = realizedPercent(row);
          const predicted = predictedPercent(row);
          return (
            <article className={styles.leaderCard} key={rankingRowId(row, index, type)}>
              <span className={styles.rankPill}>{String(index + 1).padStart(2, '0')}</span>
              <div className={styles.leaderIdentity}>
                <strong className={styles.leaderName}>{entityName(row, type)}</strong>
                <p className={styles.rowMeta}>{ownerName(row)}</p>
              </div>
              <div className={styles.leaderStats}>
                <span>Meta {safePct(realized)}</span>
                <span>Prev. {safePct(predicted)}</span>
                <span>MRR {safeMoney(row?.mrr)}</span>
              </div>
              <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(realized)}%` }} /></div>
            </article>
          );
        })}
        {rows.length === 0 ? <p className={styles.emptyState}>Nenhum item retornado para o período.</p> : null}
      </div>
    </article>
  );
}

export default function RankingsV2Page() {
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [query, setQuery] = useState('');
  const [squadPayload, setSquadPayload] = useState(null);
  const [gdvPayload, setGdvPayload] = useState(null);
  const [championsPayload, setChampionsPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRankings() {
      setLoading(true);
      setError(null);
      try {
        const [squad, gdv, champions] = await Promise.all([
          getSquadRanking({ date: referenceDate(period) }),
          getGdvRanking({ date: referenceDate(period) }),
          getSquadRankingChampions(),
        ]);
        if (cancelled) return;
        setSquadPayload(squad || null);
        setGdvPayload(gdv || null);
        setChampionsPayload(champions || null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRankings();
    return () => { cancelled = true; };
  }, [period.month, period.year]);

  const cleanQuery = normalizeText(query);
  const squadRows = (Array.isArray(squadPayload?.rows) ? squadPayload.rows : []).filter((row) => {
    if (!cleanQuery) return true;
    return normalizeText(`${entityName(row, 'squad')} ${ownerName(row)}`).includes(cleanQuery);
  }).slice(0, 8);
  const gdvRows = (Array.isArray(gdvPayload?.rows) ? gdvPayload.rows : []).filter((row) => {
    if (!cleanQuery) return true;
    return normalizeText(`${entityName(row, 'gdv')} ${ownerName(row)}`).includes(cleanQuery);
  }).slice(0, 8);
  const champions = Array.isArray(championsPayload?.rows) ? championsPayload.rows.slice(0, 6) : [];
  const globalGoal = squadPayload?.globalGoal || {};
  const currentLeader = squadRows[0] || null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TrophyIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Rankings V2 · rota paralela</p>
          <h1>Ranking ao vivo separado do campeão oficial</h1>
          <p>
            A tela lê o ranking do mês corrente, mas a lista de campeões vem apenas do endpoint de snapshots já fechados. Não grava campeão e não edita metas.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros dos Rankings V2">
        <label className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Período do ranking ao vivo</span>
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
          <span className={styles.fieldLabel}>Buscar</span>
          <SearchIcon size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar squad, GDV ou responsável" />
        </label>
      </section>

      <section className={styles.safeNotice}>
        <span className={styles.badgeIcon}><TargetIcon size={16} /></span>
        <p>
          Regra preservada: <strong>campeão oficial só deve existir após 00:00 em America/Sao_Paulo no primeiro dia do mês seguinte</strong>. O líder abaixo é apenas leitura ao vivo de {monthLabel(periodValue(period))}.
        </p>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar rankings.')}</section> : null}

      <section className={styles.gridCards} aria-label="Resumo dos Rankings V2">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Líder ao vivo</span><TrophyIcon size={15} /></div>
          <strong className={styles.cardValue}>{currentLeader ? entityName(currentLeader, 'squad') : '—'}</strong>
          <p className={styles.cardHelper}>{currentLeader ? ownerName(currentLeader) : 'Ranking em carregamento'}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Meta global</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safePct(globalGoal.progress)}</strong>
          <p className={styles.cardHelper}>{safeInt(globalGoal.clientsWithGoal)} de {safeInt(globalGoal.targetClients)} clientes</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Squads ranqueados</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(Array.isArray(squadPayload?.rows) ? squadPayload.rows.length : 0)}</strong>
          <p className={styles.cardHelper}>endpoint de ranking de squads</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Campeões oficiais</span><TrophyIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(champions.length)}</strong>
          <p className={styles.cardHelper}>histórico fechado no banco</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <RankingList title="Squads" subtitle="Fonte: GET /api/metrics/ranking." rows={squadRows} type="squad" />
        <RankingList title="GDVs" subtitle="Fonte: GET /api/metrics/ranking/gdvs." rows={gdvRows} type="gdv" />
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Campeões fechados</p>
            <h2>Histórico oficial no banco</h2>
            <p>Esta lista não deve incluir o mês ainda em aberto.</p>
          </div>
          <span className={styles.statusBadgeMuted}>GET /api/metrics/ranking/champions</span>
        </header>
        <div className={styles.table}>
          <div className={styles.tableHead}>
            <span>Competência</span>
            <span>Campeão</span>
            <span>Meta</span>
            <span>Churn</span>
            <span>MRR</span>
          </div>
          {champions.map((item) => (
            <div className={styles.tableRow} key={item.periodMonth || item.id}>
              <strong>{monthLabel(item.periodMonth)}</strong>
              <span>{item.squadName || 'Squad'}</span>
              <span>{safePct(item.realizedPercent)}</span>
              <span>{safePct(item.churnPercent)}</span>
              <span>{safeMoney(item.mrr || item.snapshot?.mrr)}</span>
            </div>
          ))}
        </div>
        {!loading && champions.length === 0 ? <p className={styles.emptyState}>Nenhum campeão oficial retornado pelo backend.</p> : null}
      </section>
    </main>
  );
}
