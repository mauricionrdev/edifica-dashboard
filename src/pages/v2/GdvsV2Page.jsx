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

function gdvRowKey(row, index = 0) {
  return String(row?.gdv?.id ?? row?.gdvId ?? row?.id ?? row?.gdvName ?? row?.name ?? index);
}

function gdvRowName(row) {
  return row?.gdv?.name || row?.gdvName || row?.name || 'GDV';
}

function rowSearchText(row) {
  return normalizeText([gdvRowName(row)].filter(Boolean).join(' '));
}

function clientName(client) {
  return client?.name || client?.clientName || client?.client_name || 'Cliente';
}

function clientGdvName(client) {
  return client?.gdvName || client?.gdv_name || client?.gdv?.name || client?.gdv || '';
}

function clientFee(client) {
  return safeNumber(client?.fee ?? client?.monthlyFee ?? client?.monthly_fee, 0);
}

function clientSquadName(client) {
  return client?.squadName || client?.squad_name || client?.squad?.name || 'Sem squad';
}

function statusText(client) {
  return String(client?.status || 'sem_status').replace(/_/g, ' ');
}

function isClientFromGdv(client, row) {
  const selectedName = normalizeText(gdvRowName(row));
  return Boolean(selectedName && normalizeText(clientGdvName(client)) === selectedName);
}

function SelectedGdvPanel({ row, clients }) {
  if (!row) {
    return (
      <article className={styles.panel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Carteira</p>
            <h2>Selecione um GDV</h2>
            <p>Clique em uma linha da tabela para validar os clientes vinculados no shell.</p>
          </div>
        </header>
      </article>
    );
  }

  const linkedClients = (Array.isArray(clients) ? clients : [])
    .filter((client) => isClientFromGdv(client, row))
    .sort((a, b) => clientName(a).localeCompare(clientName(b), 'pt-BR'));
  const shellMrr = linkedClients.reduce((sum, client) => sum + clientFee(client), 0);

  return (
    <article className={styles.panel}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>GDV selecionado</p>
          <h2>{gdvRowName(row)}</h2>
          <p>Comparação entre ranking de GDVs e clientes carregados no shell.</p>
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
          <div className={styles.cardTop}><span>Progresso do GDV</span><strong>{safePct(row.metaActiveProgress ?? row.metaIndex)}</strong></div>
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
              <span>{clientSquadName(client)} · {statusText(client)} · {safeMoney(clientFee(client))}</span>
            </div>
          ))}
          {linkedClients.length > 8 ? <p className={styles.sectionNote}>+{linkedClients.length - 8} cliente(s) fora da prévia.</p> : null}
          {linkedClients.length === 0 ? <p className={styles.emptyState}>Nenhum cliente do shell vinculado a este GDV.</p> : null}
        </div>
      </div>
    </article>
  );
}

export default function GdvsV2Page() {
  const { gdvs = [], clients = [] } = useOutletContext();
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
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

  const selectedRow = useMemo(() => {
    if (!rows.length) return null;
    if (!selectedKey) return rows[0];
    return rows.find((row, index) => gdvRowKey(row, index) === selectedKey) || rows[0];
  }, [rows, selectedKey]);

  const leader = rows[0] || null;
  const globalGoal = rankingPayload?.globalGoal || {};
  const activeGdvs = rows.filter((row) => safeNumber(row.activeClients ?? row.rankingGoalBaseClients) > 0).length;
  const clientsWithGdv = clients.filter((client) => String(clientGdvName(client)).trim()).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TrophyIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>GDVs V2 · rota paralela</p>
          <h1>Leitura do ranking de GDVs</h1>
          <p>
            Visualiza o ranking por GDV e uma prévia da carteira carregada no shell usando apenas GET. Não altera permissões, metas ou dados de cliente.
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
              <h2>{leader ? gdvRowName(leader) : 'Sem líder'}</h2>
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

        <SelectedGdvPanel row={selectedRow} clients={clients} />
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Tabela</p>
            <h2>GDVs do período</h2>
            <p>Clique em uma linha para abrir a prévia dos clientes vinculados no shell.</p>
          </div>
        </header>
        <div className={styles.table} role="table" aria-label="GDVs V2">
          <div className={styles.tableHead} role="row">
            <span>GDV</span><span>Meta</span><span>Previsto</span><span>Churn</span><span>MRR</span>
          </div>
          {rows.map((row, index) => {
            const key = gdvRowKey(row, index);
            const active = selectedRow ? gdvRowKey(selectedRow, index) === key : false;
            return (
              <button
                type="button"
                className={`${styles.tableRow} ${styles.tableRowClickable} ${active ? styles.tableRowActive : ''}`}
                role="row"
                key={key}
                onClick={() => setSelectedKey(key)}
              >
                <span><strong>{String(index + 1).padStart(2, '0')} · {gdvRowName(row)}</strong><br /><small>{safeInt(row.rankingGoalClients ?? row.clientsWithGoal)} bateram meta</small></span>
                <span>{safePct(row.metaActiveProgress ?? row.metaIndex)}</span>
                <span>{safePct(row.projectedProgress ?? row.projectedRate)}</span>
                <span>{safePct(row.churnRate)}</span>
                <span>{safeMoney(row.mrr)}</span>
              </button>
            );
          })}
        </div>
        {!loading && rows.length === 0 ? <p className={styles.emptyState}>Nenhum GDV retornado.</p> : null}
      </section>
    </main>
  );
}
