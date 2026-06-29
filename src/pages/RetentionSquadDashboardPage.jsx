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

function SummaryMetric({ label, value, helper, tone = 'neutral' }) {
  return (
    <article className={`${styles.summaryMetric} ${styles[`summaryMetric_${tone}`] || ''}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <em>{helper}</em> : null}
    </article>
  );
}

function Distribution({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div className={styles.distribution}>
      {safeRows.map((item) => (
        <div key={item.key || item.label} className={styles.distributionRow}>
          <div className={styles.distributionTopline}>
            <span>{item.label}</span>
            <strong>{fmtInt(item.count)} cliente{Number(item.count) === 1 ? '' : 's'}</strong>
          </div>
          <div className={styles.distributionTrack} aria-hidden="true">
            <span style={{ width: progressWidth(item.percent) }} />
          </div>
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

  return (
    <section className={styles.squadBlock}>
      <header className={styles.squadHeader}>
        <span className={styles.squadAvatar} aria-hidden="true">
          {logoUrl ? <img src={logoUrl} alt="" /> : (row?.squadName || 'S').slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h3>{row?.squadName || 'Squad'}</h3>
          <p>Carteira inicial: {fmtInt(row?.portfolioStart)} cliente{Number(row?.portfolioStart) === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className={styles.squadMetrics}>
        <div className={styles.squadMetric}>
          <span>Churn da carteira</span>
          <strong>{fmtPct(churnRate)}</strong>
          <em>{fmtInt(row?.portfolioChurn)} de {fmtInt(row?.portfolioStart)} clientes</em>
          <i aria-hidden="true"><b style={{ width: progressWidth(churnRate) }} /></i>
        </div>
        <div className={styles.squadMetric}>
          <span>Churn precoce</span>
          <strong>{fmtPct(earlyRate)}</strong>
          <em>{fmtInt(row?.earlyChurn)} de {fmtInt(row?.newClients)} novos</em>
          <i aria-hidden="true"><b style={{ width: progressWidth(earlyRate) }} /></i>
        </div>
        <div className={styles.squadMetric}>
          <span>Clientes novos</span>
          <strong>{fmtInt(row?.newClients)}</strong>
          <em>base do churn precoce</em>
          <i aria-hidden="true"><b style={{ width: progressWidth(Number(row?.newClients) > 0 ? 100 : 0) }} /></i>
        </div>
      </div>

      <div className={styles.squadDistributionArea}>
        <div className={styles.squadDistributionTitle}>
          <span>Distribuição do churn</span>
          <strong>{fmtInt(row?.churnTotal)} cliente{Number(row?.churnTotal) === 1 ? '' : 's'}</strong>
        </div>
        <Distribution rows={row?.distribution} />
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

  return (
    <div className="content">
      <main className={styles.page}>
        <section className={styles.retentionHero}>
          <div>
            <span>Retenção por Squad</span>
            <h1>{selectedSquadName}</h1>
            <p>{selectedMonthLabel} · base congelada no primeiro dia do período</p>
          </div>
          <div className={styles.retentionHeroStats}>
            <strong>{fmtPct(summary.portfolioChurnRate || 0)}</strong>
            <span>Churn da carteira</span>
          </div>
        </section>

        <section className={styles.summaryPanel}>
          <SummaryMetric
            label="Churn da carteira"
            value={fmtPct(summary.portfolioChurnRate || 0)}
            helper={`${fmtInt(summary.portfolioChurn)} de ${fmtInt(summary.portfolioStart)} clientes`}
            tone={Number(summary.portfolioChurnRate) > 8 ? 'risk' : 'neutral'}
          />
          <SummaryMetric
            label="Churn precoce"
            value={fmtPct(summary.earlyChurnRate || 0)}
            helper={`${fmtInt(summary.earlyChurn)} de ${fmtInt(summary.newClients)} novos clientes`}
            tone={Number(summary.earlyChurnRate) > 10 ? 'risk' : 'neutral'}
          />
          <SummaryMetric
            label="Distribuição do churn"
            value={`${fmtInt(summary.churnTotal)} cliente${Number(summary.churnTotal) === 1 ? '' : 's'}`}
            helper="churns classificados por tempo de permanência"
          />
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
