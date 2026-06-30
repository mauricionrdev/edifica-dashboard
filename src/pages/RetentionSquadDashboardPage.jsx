import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Select from '../components/ui/Select.jsx';
import { getRetentionMetrics } from '../api/metrics.js';
import { fmtPct, MONTHS_FULL } from '../utils/format.js';
import { getSquadAvatar } from '../utils/avatarStorage.js';
import styles from './RetentionSquadDashboardPage.module.css';

function buildMonthOptions() {
  const now = new Date();
  const out = [];
  for (let index = 0; index < 18; index += 1) {
    let year = now.getFullYear();
    let month = now.getMonth() - index;
    while (month < 0) {
      month += 12;
      year -= 1;
    }
    out.push({ value: `${year}-${String(month + 1).padStart(2, '0')}`, label: `${MONTHS_FULL[month]} ${year}` });
  }
  return out;
}

function fmtInt(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('pt-BR') : '0';
}

function progressWidth(value) {
  return `${Math.max(0, Math.min(Number(value) || 0, 100))}%`;
}

function formatLtvMonths(value) {
  const months = Number(value) || 0;
  if (months <= 0) return '0 mês';
  if (months < 1) return `${months.toFixed(1).replace('.', ',')} mês`;
  const rounded = months >= 10 ? Math.round(months) : Number(months.toFixed(1));
  return `${String(rounded).replace('.', ',')} ${rounded === 1 ? 'mês' : 'meses'}`;
}

function Metric({ label, value, helper, progress }) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <em>{helper}</em> : null}
      {progress !== undefined ? (
        <i aria-hidden="true"><b style={{ width: progressWidth(progress) }} /></i>
      ) : null}
    </article>
  );
}

function Distribution({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div className={styles.distribution}>
      {safeRows.map((item) => (
        <div key={item.key || item.label} className={styles.distributionRow}>
          <span>{item.label}</span>
          <div className={styles.distributionTrack} aria-hidden="true">
            <b style={{ width: progressWidth(item.percent) }} />
          </div>
          <strong>{fmtInt(item.count)}</strong>
          <em>{fmtPct(Number(item.percent) || 0)}</em>
        </div>
      ))}
    </div>
  );
}

function SquadBlock({ row }) {
  const churnRate = Number(row?.portfolioChurnRate) || 0;
  const earlyRate = Number(row?.earlyChurnRate) || 0;
  const logoUrl = row?.logoUrl || '';
  const name = row?.squadName || 'Squad';

  return (
    <section className={styles.squadBlock}>
      <header className={styles.squadHeader}>
        <span className={styles.squadAvatar} aria-hidden="true">
          {logoUrl ? <img src={logoUrl} alt="" /> : name.slice(0, 2).toUpperCase()}
        </span>
        <div className={styles.squadTitle}>
          <h2>{name}</h2>
          <p>
            Base {fmtInt(row?.portfolioStart)} · Novos {fmtInt(row?.newClients)} · Churns {fmtInt(row?.churnTotal)}
          </p>
        </div>
      </header>

      <div className={styles.squadBody}>
        <div className={styles.squadMetrics}>
          <Metric
            label="Churn da carteira"
            value={fmtPct(churnRate)}
            helper={`${fmtInt(row?.portfolioChurn)} de ${fmtInt(row?.portfolioStart)}`}
            progress={churnRate}
          />
          <Metric
            label="Churn precoce"
            value={fmtPct(earlyRate)}
            helper={`${fmtInt(row?.earlyChurn)} de ${fmtInt(row?.newClients)} novos`}
            progress={earlyRate}
          />
          <Metric
            label="LTV médio"
            value={formatLtvMonths(row?.ltvAverageMonths)}
            helper="clientes em churn"
          />
        </div>

        <div className={styles.squadDistributionArea}>
          <div className={styles.squadDistributionTitle}>
            <span>Distribuição</span>
            <strong>{fmtInt(row?.churnTotal)} cliente{Number(row?.churnTotal) === 1 ? '' : 's'}</strong>
          </div>
          <Distribution rows={row?.distribution} />
        </div>
      </div>
    </section>
  );
}

export default function RetentionSquadDashboardPage() {
  const { squads, loading: shellLoading, setPanelHeader } = useOutletContext();
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(() => monthOptions[0]?.value || '');
  const [squadId, setSquadId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await getRetentionMetrics({ month, squadId });
        if (active) setData(response || null);
      } catch (err) {
        if (active) setError(err?.message || 'Não foi possível carregar os indicadores.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [month, squadId]);

  useEffect(() => {
    const actions = (
      <div className={styles.headerActions}>
        <Select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Mês dos indicadores">
          {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <Select
          type="squad"
          value={squadId}
          onChange={(event) => setSquadId(event.target.value)}
          aria-label="Squad dos indicadores"
          placeholder="Todos os squads"
          disabled={shellLoading && !squads?.length}
        >
          <option value="">Todos os squads</option>
          {(squads || []).map((squad) => (
            <option key={squad.id} value={squad.id} data-avatar={getSquadAvatar(squad)} data-name={squad.name}>
              {squad.name}
            </option>
          ))}
        </Select>
      </div>
    );
    setPanelHeader({ title: 'Indicadores por Squad', description: '', actions });
  }, [month, monthOptions, setPanelHeader, shellLoading, squadId, squads]);

  const summary = data?.summary || {};
  const rows = Array.isArray(data?.squads) ? data.squads : [];
  const selectedMonthLabel = monthOptions.find((option) => option.value === month)?.label || month;
  const selectedSquadName = squadId ? (squads || []).find((squad) => squad.id === squadId)?.name || 'Squad selecionado' : 'Todos os squads';
  const churnRate = Number(summary.portfolioChurnRate) || 0;
  const earlyRate = Number(summary.earlyChurnRate) || 0;

  return (
    <div className="content">
      <main className={styles.page}>
        <section className={styles.contextBar}>
          <div>
            <span>Retenção</span>
            <strong>{selectedSquadName}</strong>
          </div>
          <p>{selectedMonthLabel}</p>
        </section>

        <section className={styles.summaryLine} aria-label="Resumo de retenção">
          <Metric
            label="Churn da carteira"
            value={fmtPct(churnRate)}
            helper={`${fmtInt(summary.portfolioChurn)} de ${fmtInt(summary.portfolioStart)} clientes`}
            progress={churnRate}
          />
          <Metric
            label="Churn precoce"
            value={fmtPct(earlyRate)}
            helper={`${fmtInt(summary.earlyChurn)} de ${fmtInt(summary.newClients)} novos`}
            progress={earlyRate}
          />
          <Metric
            label="LTV médio"
            value={formatLtvMonths(summary.ltvAverageMonths)}
            helper="clientes em churn"
          />
          <Metric
            label="Churns"
            value={fmtInt(summary.churnTotal)}
            helper="classificados no período"
          />
        </section>

        <section className={styles.summaryDistribution} aria-label="Distribuição consolidada do churn">
          <div className={styles.squadDistributionTitle}>
            <span>Distribuição geral</span>
            <strong>{fmtInt(summary.churnTotal)} cliente{Number(summary.churnTotal) === 1 ? '' : 's'}</strong>
          </div>
          <Distribution rows={summary.distribution} />
        </section>

        {error ? <p className={styles.state}>{error}</p> : null}
        {loading && !rows.length ? <p className={styles.state}>Carregando indicadores…</p> : null}

        <section className={styles.squadsList}>
          {rows.length > 0 ? rows.map((row) => <SquadBlock key={row.squadId} row={row} />) : null}
          {!loading && !error && rows.length === 0 ? <p className={styles.state}>Nenhum squad encontrado para o período.</p> : null}
        </section>
      </main>
    </div>
  );
}
