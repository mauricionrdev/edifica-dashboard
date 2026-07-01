import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getContractsSummary, listMetricCampaigns } from '../../api/metrics.js';
import { CalendarIcon, ChecklistIcon, SearchIcon, ShieldIcon, TargetIcon, TrendingUpIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import {
  buildPeriodOptions,
  currentPeriod,
  errorMessage,
  normalizeText,
  periodValue,
  progressWidth,
  resolveSquadName,
  safeInt,
  safePct,
  safeNumber,
} from './v2PageUtils.js';
import styles from './V2Operations.module.css';

const WEEKS = [1, 2, 3, 4];

function weekDate(period, week) {
  const day = Math.min(28, Math.max(1, ((Number(week) || 1) - 1) * 7 + 4));
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekPeriodKey(period, week) {
  return `${periodValue(period)}-S${Number(week) || 1}`;
}

function clientSearchText(row) {
  return normalizeText([row.name, row.squadName, row.gdvName, row.gestor].filter(Boolean).join(' '));
}

export default function WeeklyV2Page() {
  const { squads = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [week, setWeek] = useState(1);
  const [squadId, setSquadId] = useState('');
  const [query, setQuery] = useState('');
  const [summaryPayload, setSummaryPayload] = useState(null);
  const [campaignsPayload, setCampaignsPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const selectedWeekDate = weekDate(period, week);
  const selectedPeriodKey = weekPeriodKey(period, week);

  useEffect(() => {
    let cancelled = false;
    async function loadWeeklySnapshot() {
      setLoading(true);
      setError(null);
      try {
        const summary = await getContractsSummary({ date: selectedWeekDate, squadId });
        if (cancelled) return;
        setSummaryPayload(summary || null);

        const clientIds = (Array.isArray(summary?.clients) ? summary.clients : [])
          .map((client) => client.clientId)
          .filter(Boolean)
          .slice(0, 200);

        if (clientIds.length) {
          const campaigns = await listMetricCampaigns({ clientIds, periodKey: summary?.weekKey || selectedPeriodKey });
          if (!cancelled) setCampaignsPayload(campaigns || null);
        } else {
          setCampaignsPayload({ campaigns: [], campaignsByClient: {} });
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadWeeklySnapshot();
    return () => { cancelled = true; };
  }, [selectedWeekDate, selectedPeriodKey, squadId]);

  const rows = useMemo(() => {
    const needle = normalizeText(query);
    const source = Array.isArray(summaryPayload?.clients) ? summaryPayload.clients : [];
    if (!needle) return source;
    return source.filter((row) => clientSearchText(row).includes(needle));
  }, [query, summaryPayload]);

  const totals = summaryPayload?.totals || {};
  const campaignsByClient = campaignsPayload?.campaignsByClient || {};
  const selectedSquad = resolveSquadName(squads, squadId);
  const withWeekData = rows.filter((row) => safeNumber(row.weekClosed) > 0 || safeNumber(row.weekGoal) > 0).length;
  const hittingWeek = rows.filter((row) => safeNumber(row.weekGoal) > 0 && safeNumber(row.weekClosed) >= safeNumber(row.weekGoal)).length;
  const totalCampaigns = Array.isArray(campaignsPayload?.campaigns) ? campaignsPayload.campaigns.length : 0;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><ChecklistIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Preencher Semana V2 · rota paralela</p>
          <h1>Validação semanal somente leitura</h1>
          <p>
            Consolida clientes, metas semanais e campanhas pela API atual. Esta tela não grava métricas, não altera campanhas e não substitui o Preencher Semana oficial.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros do Preencher Semana V2">
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
          <span className={styles.fieldLabel}>Semana</span>
          <select value={week} onChange={(event) => setWeek(Number(event.target.value) || 1)}>
            {WEEKS.map((item) => <option key={item} value={item}>Semana {item}</option>)}
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
          <span className={styles.fieldLabel}>Busca</span>
          <SearchIcon size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, squad, GDV ou gestor" />
        </label>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar o Preencher Semana V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Indicadores semanais">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Base filtrada</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(rows.length)}</strong>
          <p className={styles.cardHelper}>{selectedSquad}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Semana da API</span><CalendarIcon size={15} /></div>
          <strong className={styles.cardValue}>{summaryPayload?.weekKey || selectedPeriodKey}</strong>
          <p className={styles.cardHelper}>Referência: {selectedWeekDate}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Meta semanal</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safePct(totals.weekProgress)}</strong>
          <p className={styles.cardHelper}>{safeInt(totals.weekClosed)} de {safeInt(totals.weekGoal)} fechados</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Campanhas</span><TrendingUpIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(totalCampaigns)}</strong>
          <p className={styles.cardHelper}>{safeInt(withWeekData)} com dados · {safeInt(hittingWeek)} batendo semana</p>
        </article>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Snapshot operacional</p>
            <h2>Clientes da semana</h2>
            <p>Leitura cruzada de summary e campanhas. Sem edição e sem presença ativa.</p>
          </div>
          <span className={styles.statusBadgeMuted}>GET /api/metrics/summary + /campaigns</span>
        </header>
        <div className={styles.stackList}>
          <div>
            <div className={styles.cardTop}><span>Progresso semanal filtrado</span><strong>{safePct(totals.weekProgress)}</strong></div>
            <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(totals.weekProgress)}%` }} /></div>
          </div>
          <div className={styles.table} role="table" aria-label="Clientes do Preencher Semana V2">
            <div className={styles.tableHead} role="row">
              <span>Cliente</span><span>Squad</span><span>Semana</span><span>Mês</span><span>Campanhas</span>
            </div>
            {rows.slice(0, 80).map((row) => {
              const campaigns = campaignsByClient[row.clientId] || [];
              return (
                <div className={styles.tableRow} role="row" key={row.clientId}>
                  <span><strong>{row.name || 'Cliente'}</strong><br /><small>{row.gdvName || row.gestor || 'Sem responsável'}</small></span>
                  <span>{row.squadName || 'Sem squad'}</span>
                  <span>{safeInt(row.weekClosed)} / {safeInt(row.weekGoal)}<br /><small>{safePct(row.weekProgress)}</small></span>
                  <span>{safeInt(row.monthClosed)} / {safeInt(row.monthGoal)}<br /><small>{safePct(row.monthProgress)}</small></span>
                  <span>{safeInt(campaigns.length)}</span>
                </div>
              );
            })}
          </div>
          {!loading && rows.length === 0 ? <p className={styles.emptyState}>Nenhum cliente retornado para os filtros selecionados.</p> : null}
        </div>
      </section>
    </main>
  );
}
