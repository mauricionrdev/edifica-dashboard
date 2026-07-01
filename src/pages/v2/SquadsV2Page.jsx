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

function squadRowKey(row, index = 0) {
  return String(row?.squad?.id ?? row?.squadId ?? row?.id ?? row?.squadName ?? index);
}

function squadRowId(row) {
  return row?.squad?.id ?? row?.squadId ?? row?.id ?? null;
}

function squadRowName(row) {
  return row?.squad?.name || row?.squadName || row?.name || 'Squad';
}

function squadOwnerName(row) {
  return row?.ownerName || row?.leaderName || row?.responsibleName || 'Sem responsável';
}

function rowSearchText(row) {
  return normalizeText([squadRowName(row), squadOwnerName(row), row?.gdvName].filter(Boolean).join(' '));
}

function clientName(client) {
  return client?.name || client?.clientName || client?.client_name || 'Cliente';
}

function clientSquadId(client) {
  return client?.squadId ?? client?.squad_id ?? client?.squad?.id ?? null;
}

function clientSquadName(client) {
  return client?.squadName || client?.squad_name || client?.squad?.name || '';
}

function clientFee(client) {
  return safeNumber(client?.fee ?? client?.monthlyFee ?? client?.monthly_fee, 0);
}

function statusText(client) {
  return String(client?.status || 'sem_status').replace(/_/g, ' ');
}

function isClientFromSquad(client, row) {
  const selectedId = squadRowId(row);
  const selectedName = normalizeText(squadRowName(row));
  const candidateId = clientSquadId(client);
  if (selectedId !== null && candidateId !== null && String(selectedId) === String(candidateId)) return true;
  return Boolean(selectedName && normalizeText(clientSquadName(client)) === selectedName);
}

function SelectedSquadPanel({ row, clients }) {
  if (!row) {
    return (
      <article className={styles.panel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Carteira</p>
            <h2>Selecione um squad</h2>
            <p>Clique em uma linha da tabela para validar a carteira carregada no shell.</p>
          </div>
        </header>
      </article>
    );
  }

  const linkedClients = (Array.isArray(clients) ? clients : [])
    .filter((client) => isClientFromSquad(client, row))
    .sort((a, b) => clientName(a).localeCompare(clientName(b), 'pt-BR'));
  const shellMrr = linkedClients.reduce((sum, client) => sum + clientFee(client), 0);

  return (
    <article className={styles.panel}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Squad selecionado</p>
          <h2>{squadRowName(row)}</h2>
          <p>{squadOwnerName(row)} · comparação entre ranking e carteira carregada no shell.</p>
        </div>
        <span className={styles.statusBadgeMuted}>Somente leitura</span>
      </header>

      <div className={styles.detailGrid}>
        <div className={styles.detailMetric}>
          <span>Meta ativa</span>
          <strong>{safePct(row.metaActiveProgress ?? row.metaIndex)}</strong>
        </div>
        <div className={styles.detailMetric}>
          <span>Previsto</span>
          <strong>{safePct(row.projectedProgress ?? row.projectedRate)}</strong>
        </div>
        <div className={styles.detailMetric}>
          <span>Churn</span>
          <strong>{safePct(row.churnRate)}</strong>
        </div>
        <div className={styles.detailMetric}>
          <span>MRR ranking</span>
          <strong>{safeMoney(row.mrr)}</strong>
        </div>
        <div className={styles.detailMetric}>
          <span>Clientes no ranking</span>
          <strong>{safeInt(row.rankingGoalBaseClients ?? row.activeClients)}</strong>
        </div>
        <div className={styles.detailMetric}>
          <span>Clientes no shell</span>
          <strong>{safeInt(linkedClients.length)}</strong>
        </div>
      </div>

      <div className={styles.stackList}>
        <div>
          <div className={styles.cardTop}><span>Progresso do squad</span><strong>{safePct(row.metaActiveProgress ?? row.metaIndex)}</strong></div>
          <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${progressWidth(row.metaActiveProgress ?? row.metaIndex)}%` }} /></div>
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>Shell MRR {safeMoney(shellMrr)}</span>
          <span className={styles.chip}>Meta {safeInt(row.rankingGoalClients ?? row.clientsWithGoal)}</span>
          <span className={styles.chip}>Sem PUT/POST</span>
        </div>
        <div className={styles.miniList}>
          {linkedClients.slice(0, 8).map((client) => (
            <div className={styles.miniListRow} key={client?.id || clientName(client)}>
              <strong>{clientName(client)}</strong>
              <span>{statusText(client)} · {safeMoney(clientFee(client))}</span>
            </div>
          ))}
          {linkedClients.length > 8 ? <p className={styles.sectionNote}>+{linkedClients.length - 8} cliente(s) fora da prévia.</p> : null}
          {linkedClients.length === 0 ? <p className={styles.emptyState}>Nenhum cliente do shell vinculado a este squad.</p> : null}
        </div>
      </div>
    </article>
  );
}

export default function SquadsV2Page() {
  const { squads = [], clients = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
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

  const selectedRow = useMemo(() => {
    if (!rows.length) return null;
    if (!selectedKey) return rows[0];
    return rows.find((row, index) => squadRowKey(row, index) === selectedKey) || rows[0];
  }, [rows, selectedKey]);

  const totals = summaryPayload?.totals || {};
  const globalGoal = rankingPayload?.globalGoal || {};
  const totalSquads = squads.length || rows.length;
  const totalClients = Array.isArray(clients) ? clients.length : 0;
  const activeRows = rows.filter((row) => safeNumber(row.rankingGoalBaseClients ?? row.activeClients) > 0).length;
  const leader = rows[0] || null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TrophyIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Squads V2 · rota paralela</p>
          <h1>Leitura operacional dos squads</h1>
          <p>
            Cruza ranking ao vivo, summary mensal e carteira carregada no shell. Não grava campeão, não altera squad e não substitui a Carteira oficial.
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
              <h2>{leader ? squadRowName(leader) : 'Sem líder'}</h2>
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

        <SelectedSquadPanel row={selectedRow} clients={clients} />
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Tabela</p>
            <h2>Squads do período</h2>
            <p>Clique em uma linha para abrir a prévia da carteira sem sair da rota V2.</p>
          </div>
        </header>
        <div className={styles.table} role="table" aria-label="Squads V2">
          <div className={styles.tableHead} role="row">
            <span>Squad</span><span>Meta</span><span>Previsto</span><span>Churn</span><span>MRR</span>
          </div>
          {rows.map((row, index) => {
            const key = squadRowKey(row, index);
            const active = selectedRow ? squadRowKey(selectedRow, index) === key : false;
            return (
              <button
                type="button"
                className={`${styles.tableRow} ${styles.tableRowClickable} ${active ? styles.tableRowActive : ''}`}
                role="row"
                key={key}
                onClick={() => setSelectedKey(key)}
              >
                <span><strong>{String(index + 1).padStart(2, '0')} · {squadRowName(row)}</strong><br /><small>{squadOwnerName(row)}</small></span>
                <span>{safePct(row.metaActiveProgress ?? row.metaIndex)}</span>
                <span>{safePct(row.projectedProgress ?? row.projectedRate)}</span>
                <span>{safePct(row.churnRate)}</span>
                <span>{safeMoney(row.mrr)}</span>
              </button>
            );
          })}
        </div>
        {!loading && rows.length === 0 ? <p className={styles.emptyState}>Nenhum squad retornado.</p> : null}
      </section>
    </main>
  );
}
