import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getRetentionMetrics } from '../../api/metrics.js';
import { SearchIcon, ShieldIcon, TargetIcon, TrendingUpIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import {
  buildPeriodOptions,
  currentPeriod,
  errorMessage,
  monthLabel,
  normalizeText,
  periodValue,
  progressWidth,
  resolveSquadName,
  safeInt,
  safePct,
  safeNumber,
} from './v2PageUtils.js';
import styles from './V2Operations.module.css';

function distributionLabel(row) {
  return row?.label || row?.name || row?.reason || row?.key || 'Sem classificação';
}

function distributionValue(row) {
  return safeNumber(row?.count ?? row?.total ?? row?.value, 0);
}

function formatLtvMonths(value) {
  const number = safeNumber(value, 0);
  if (!number) return '0 meses';
  return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`;
}

export default function RetentionV2Page() {
  const { squads = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [squadId, setSquadId] = useState('');
  const [query, setQuery] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const month = periodValue(period);

  useEffect(() => {
    let cancelled = false;
    async function loadRetention() {
      setLoading(true);
      setError(null);
      try {
        const response = await getRetentionMetrics({ month, squadId });
        if (!cancelled) setPayload(response || null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRetention();
    return () => { cancelled = true; };
  }, [month, squadId]);

  const summary = payload?.summary || {};
  const rows = Array.isArray(payload?.squads) ? payload.squads : [];
  const filteredRows = useMemo(() => {
    const clean = normalizeText(query);
    if (!clean) return rows;
    return rows.filter((row) => normalizeText(`${row.squadName || row.name || ''} ${row.ownerName || ''}`).includes(clean));
  }, [query, rows]);
  const selectedSquad = resolveSquadName(squads, squadId);
  const distribution = Array.isArray(summary.distribution) ? summary.distribution : [];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TrendingUpIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Retenção V2 · rota paralela</p>
          <h1>Leitura limpa de churn, finalizados e retenção</h1>
          <p>
            Tela interna, somente leitura e focada em validar o contrato atual da API. Mantém Finalizado separado de Churn e não substitui Indicadores por Squad.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros da Retenção V2">
        <label className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Mês</span>
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
        <label className={styles.searchBox}>
          <span className={styles.fieldLabel}>Buscar</span>
          <SearchIcon size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar squad" />
        </label>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar retenção.')}</section> : null}

      <section className={styles.gridCards} aria-label="Resumo da Retenção V2">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Churn da carteira</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safePct(summary.portfolioChurnRate)}</strong>
          <p className={styles.cardHelper}>{safeInt(summary.portfolioChurn)} de {safeInt(summary.portfolioStart)} clientes</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Churn precoce</span><TrendingUpIcon size={15} /></div>
          <strong className={styles.cardValue}>{safePct(summary.earlyChurnRate)}</strong>
          <p className={styles.cardHelper}>{safeInt(summary.earlyChurn)} de {safeInt(summary.newClients)} novos</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>LTV médio</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{formatLtvMonths(summary.ltvAverageMonths)}</strong>
          <p className={styles.cardHelper}>base de clientes em churn</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Churns no período</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(summary.churnTotal)}</strong>
          <p className={styles.cardHelper}>{monthLabel(month)} · {selectedSquad}</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Squads</p>
              <h2>Distribuição operacional</h2>
              <p>Comparação por squad sem recalcular regra no frontend.</p>
            </div>
            <span className={styles.statusBadgeMuted}>GET /api/metrics/retention</span>
          </header>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Squad</span>
              <span>Carteira</span>
              <span>Churn</span>
              <span>Churn precoce</span>
              <span>LTV</span>
            </div>
            {filteredRows.map((row) => (
              <div className={styles.tableRow} key={row.squadId || row.squadName}>
                <strong>{row.squadName || row.name || 'Squad'}</strong>
                <span>{safeInt(row.portfolioStart)} clientes</span>
                <span>{safePct(row.portfolioChurnRate)} · {safeInt(row.portfolioChurn)}</span>
                <span>{safePct(row.earlyChurnRate)} · {safeInt(row.earlyChurn)}</span>
                <span>{formatLtvMonths(row.ltvAverageMonths)}</span>
              </div>
            ))}
          </div>
          {!loading && filteredRows.length === 0 ? <p className={styles.emptyState}>Nenhum squad retornado para este filtro.</p> : null}
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Distribuição</p>
              <h2>Motivos de churn</h2>
              <p>Usa a classificação consolidada do backend.</p>
            </div>
          </header>
          <div className={styles.stackList}>
            {distribution.map((row, index) => {
              const value = distributionValue(row);
              const total = safeNumber(summary.churnTotal, 0);
              const percent = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={`${distributionLabel(row)}-${index}`}>
                  <div className={styles.cardTop}><span>{distributionLabel(row)}</span><strong>{safeInt(value)}</strong></div>
                  <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(percent)}%` }} /></div>
                </div>
              );
            })}
            {!loading && distribution.length === 0 ? <p className={styles.emptyState}>Sem distribuição classificada no período.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
