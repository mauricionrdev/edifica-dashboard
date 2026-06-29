import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getTrafficManagement, updateTrafficRankingSettings } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import { ChartColumnIcon, RotateCcwIcon, SearchIcon, Select, TargetIcon, TrendingUpIcon, TrophyIcon, UsersIcon } from '../components/ui/index.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { MONTHS_FULL, fmtInt, fmtMoney, fmtPct } from '../utils/format.js';
import { getClientAvatar, subscribeAvatarChange } from '../utils/avatarStorage.js';
import { clientInitials } from '../utils/clientHelpers.js';
import styles from './TrafficManagementPage.module.css';

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function referenceDate(period) {
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}-15`;
}

function monthKey(period) {
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}`;
}

function buildPeriodOptions(base = new Date(), amount = 12) {
  return Array.from({ length: amount }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - index, 1);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS_FULL[date.getMonth()]} de ${date.getFullYear()}`,
      year: date.getFullYear(),
      month: date.getMonth(),
    };
  });
}

function toneClass(tone) {
  if (tone === 'danger') return styles.tagDanger;
  if (tone === 'warning') return styles.tagWarning;
  if (tone === 'good') return styles.tagGood;
  if (tone === 'info') return styles.tagInfo;
  return styles.tagMuted;
}

function compactName(name = '') {
  return String(name || '').replace(/^gestor\s+/i, '').trim() || 'Sem gestor';
}

function fmtIntSafe(value) {
  const number = Number(value) || 0;
  return number > 0 ? fmtInt(number) : '0';
}

function attentionLabel(priority) {
  const value = Number(priority) || 0;
  if (value <= 0) return 'Operação estável';
  return `${value} ${value === 1 ? 'ponto' : 'pontos'} de atenção`;
}

function ClientAvatar({ client }) {
  const src = getClientAvatar(client) || client?.avatarUrl || '';
  return (
    <span className={styles.avatar}>
      {src ? <img src={src} alt="" /> : <span>{clientInitials(client?.name)}</span>}
    </span>
  );
}

function MetricLine({ label, value, muted }) {
  return (
    <div className={styles.metricLine}>
      <span>{label}</span>
      <strong className={muted ? styles.mutedValue : ''}>{value}</strong>
    </div>
  );
}

export default function TrafficManagementPage() {
  const { setPanelHeader, loading: shellLoading } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const canManageTarget = hasPermission(user, 'ranking.view.all');
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [managerFilter, setManagerFilter] = useState('');
  const [payload, setPayload] = useState({ managers: [], clients: [], ranking: [], summary: {}, targetPercent: 80 });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [query, setQuery] = useState('');
  const [targetDraft, setTargetDraft] = useState('80');
  const [assetVersion, setAssetVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [error, setError] = useState(null);

  async function loadTraffic() {
    setLoading(true);
    setError(null);
    try {
      const data = await getTrafficManagement({ date: referenceDate(period), gestor: managerFilter });
      setPayload(data || {});
      setTargetDraft(String(Number(data?.targetPercent) || 80));
      const rows = Array.isArray(data?.clients) ? data.clients : [];
      setSelectedClientId((current) => (rows.some((row) => row.client.id === current) ? current : rows[0]?.client?.id || ''));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Não foi possível carregar Gestão de Tráfego.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTraffic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.year, period.month, managerFilter]);

  useEffect(() => subscribeAvatarChange(() => setAssetVersion((current) => current + 1)), []);

  useEffect(() => {
    setPanelHeader({
      title: <strong>Gestão de Tráfego</strong>,
      actions: (
        <div className={styles.headerActions}>
          <Select
            aria-label="Período"
            value={monthKey(period)}
            onChange={(event) => {
              const option = periodOptions.find((item) => item.value === event.target.value);
              if (option) setPeriod({ year: option.year, month: option.month });
            }}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" iconOnly onClick={loadTraffic} aria-label="Atualizar Gestão de Tráfego" title="Atualizar">
            <RotateCcwIcon size={15} aria-hidden="true" />
          </Button>
        </div>
      ),
    });
  }, [period, periodOptions, setPanelHeader]);

  const managers = Array.isArray(payload.managers) ? payload.managers : [];
  const ranking = Array.isArray(payload.ranking) ? payload.ranking : [];
  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  const selectedClient = clients.find((row) => row.client.id === selectedClientId) || clients[0] || null;
  const visibleClients = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return clients;
    return clients.filter((row) => [row.client.name, row.client.squadName, row.client.gestor].some((value) => String(value || '').toLowerCase().includes(clean)));
  }, [clients, query]);
  const activeTarget = Number(payload.targetPercent) || 80;
  const selectedPeriodLabel = periodOptions.find((option) => option.value === monthKey(period))?.label || `${MONTHS_FULL[period.month]} de ${period.year}`;
  const summaryPortfolio = Number(payload.summary?.portfolio) || 0;
  const summaryProjected = Number(payload.summary?.projectedHit) || 0;
  const summaryCritical = Number(payload.summary?.critical) || 0;
  const selectedManagerName = managerFilter ? compactName(managerFilter) : 'Todos os gestores';
  const managerResultPercent = summaryPortfolio > 0 ? (summaryProjected / summaryPortfolio) * 100 : 0;
  const managerContext = managerFilter ? 'Gestor selecionado' : 'Visão geral da carteira';

  async function saveTarget() {
    if (!canManageTarget) return;
    setSavingTarget(true);
    try {
      const result = await updateTrafficRankingSettings({ targetPercent: targetDraft });
      setPayload((current) => ({ ...current, targetPercent: Number(result?.targetPercent) || Number(targetDraft) || 80 }));
      toast.showToast('Meta do ranking de tráfego atualizada.');
      await loadTraffic();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar a meta.';
      toast.showToast(message, 'error');
    } finally {
      setSavingTarget(false);
    }
  }

  if (shellLoading && !clients.length) {
    return <StateBlock variant="loading" title="Carregando Gestão de Tráfego" />;
  }

  return (
    <div className={styles.page} data-asset-version={assetVersion}>
      <section className={styles.commandBar}>
        <label className={styles.searchBox}>
          <SearchIcon size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, squad ou gestor" />
        </label>
        <Select aria-label="Gestor" value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
          <option value="">Todos os gestores</option>
          {managers.map((manager) => <option key={manager.name} value={manager.name}>{compactName(manager.name)}</option>)}
        </Select>
      </section>

      {error ? <StateBlock variant="error" title={error.message} /> : null}

      <section className={styles.managerHero} aria-label="Gestor de tráfego em revisão">
        <div className={styles.managerHeroMain}>
          <span className={styles.managerIcon}><TrendingUpIcon size={18} aria-hidden="true" /></span>
          <div>
            <span>{managerContext}</span>
            <h1>{selectedManagerName}</h1>
            <small>{selectedPeriodLabel} · prioridade por CPL, projeção de leads e ICP</small>
          </div>
        </div>
        <div className={styles.managerHeroStats}>
          <div><span>Carteira</span><strong>{fmtIntSafe(summaryPortfolio)}</strong></div>
          <div><span>Projetados</span><strong>{fmtIntSafe(summaryProjected)}</strong></div>
          <div><span>Atenção</span><strong>{fmtIntSafe(summaryCritical)}</strong></div>
          <div><span>Resultado</span><strong className={managerResultPercent >= activeTarget ? styles.goodText : styles.dangerText}>{fmtPct(managerResultPercent)}</strong></div>
        </div>
      </section>

      <section className={styles.kpis}>
        <article><UsersIcon size={16} /><span>Carteira</span><strong>{fmtIntSafe(payload.summary?.portfolio)}</strong></article>
        <article><TargetIcon size={16} /><span>Projetados para meta</span><strong>{fmtIntSafe(payload.summary?.projectedHit)}</strong></article>
        <article><ChartColumnIcon size={16} /><span>Precisam de otimização</span><strong>{fmtIntSafe(payload.summary?.critical)}</strong></article>
        <article><TrophyIcon size={16} /><span>Meta ranking</span><strong>{fmtPct(activeTarget)}</strong></article>
      </section>

      <section className={styles.rankingPanel}>
        <header>
          <div><span>Ranking</span><h2>Gestores de tráfego</h2></div>
          <div className={styles.targetEditor}>
            <label>Meta (%)</label>
            <input value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} disabled={!canManageTarget || savingTarget} />
            {canManageTarget ? <button type="button" onClick={saveTarget} disabled={savingTarget}>Salvar</button> : null}
          </div>
        </header>
        <div className={styles.rankingRows}>
          {ranking.map((row) => (
            <button
              key={row.name}
              type="button"
              className={`${styles.rankingRow} ${managerFilter === row.name ? styles.rankingRowActive : ''}`.trim()}
              onClick={() => setManagerFilter(row.name)}
              aria-pressed={managerFilter === row.name}
            >
              <strong className={styles.rankingPosition}>{String(row.position).padStart(2, '0')}</strong>
              <span className={styles.rankingIdentity}>
                <strong>{compactName(row.name)}</strong>
                <small>{fmtIntSafe(row.portfolio)} clientes na carteira</small>
              </span>
              <span className={styles.rankingGoal}>
                <strong>{fmtIntSafe(row.projectedHit)} de {fmtIntSafe(row.portfolio)}</strong>
                <small>projetados para meta</small>
              </span>
              <span className={styles.rankingResult}>
                <em className={row.status === 'above' ? styles.goodText : styles.dangerText}>{fmtPct(row.resultPercent)}</em>
                <i aria-hidden="true"><b style={{ width: `${Math.max(0, Math.min(100, Number(row.resultPercent) || 0))}%` }} /></i>
              </span>
            </button>
          ))}
          {!ranking.length ? <div className={styles.empty}>Nenhum gestor com carteira neste período.</div> : null}
        </div>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.clientList}>
          <header>
            <span>{managerFilter ? `Carteira de ${selectedManagerName}` : 'Carteira'}</span>
            <strong>{fmtIntSafe(visibleClients.length)}</strong>
          </header>
          <div className={styles.clientRows}>
            {visibleClients.map((row) => (
              <button
                key={row.client.id}
                type="button"
                className={`${styles.clientRow} ${selectedClient?.client?.id === row.client.id ? styles.clientRowActive : ''}`.trim()}
                onClick={() => setSelectedClientId(row.client.id)}
              >
                <ClientAvatar client={row.client} />
                <span><strong>{row.client.name}</strong><small>{row.client.squadName || 'Sem squad'} · {compactName(row.client.gestor)}</small></span>
                <em>{fmtIntSafe(row.priority)}</em>
              </button>
            ))}
            {!visibleClients.length ? <div className={styles.empty}>Nenhum cliente encontrado.</div> : null}
          </div>
        </aside>

        <article className={styles.detailPanel}>
          {selectedClient ? (
            <>
              <header>
                <div className={styles.detailTitle}>
                  <ClientAvatar client={selectedClient.client} />
                  <div>
                    <h2>{selectedClient.client.name}</h2>
                    <span>{selectedClient.client.squadName || 'Sem squad'} · {compactName(selectedClient.client.gestor)}</span>
                  </div>
                </div>
                <strong className={selectedClient.priority > 0 ? styles.priorityDanger : styles.priorityGood}>
                  {attentionLabel(selectedClient.priority)}
                </strong>
              </header>

              <div className={styles.detailGrid}>
                <MetricLine label="Investimento" value={selectedClient.metrics.investimento > 0 ? fmtMoney(selectedClient.metrics.investimento) : '—'} />
                <MetricLine label="Leads atuais" value={fmtIntSafe(selectedClient.metrics.leadsCurrent)} />
                <MetricLine label="Meta de leads" value={selectedClient.metrics.metaLeads > 0 ? fmtIntSafe(selectedClient.metrics.metaLeads) : '—'} />
                <MetricLine label="Projeção de leads" value={selectedClient.metrics.projectedLeads > 0 ? fmtIntSafe(Math.round(selectedClient.metrics.projectedLeads)) : '—'} />
                <MetricLine label="CPL atual" value={selectedClient.metrics.currentCpl > 0 ? fmtMoney(selectedClient.metrics.currentCpl) : '—'} />
                <MetricLine label="Meta de CPL" value={selectedClient.metrics.metaCpl > 0 ? fmtMoney(selectedClient.metrics.metaCpl) : '—'} />
                <MetricLine label="ICP atual" value={selectedClient.metrics.icpPercent > 0 ? fmtPct(selectedClient.metrics.icpPercent) : '—'} />
                <MetricLine label="Meta de ICP" value={selectedClient.metrics.metaIcp > 0 ? fmtPct(selectedClient.metrics.metaIcp) : '—'} />
                <MetricLine label="ICP validado" value={selectedClient.metrics.icpValidated === true ? 'Sim' : selectedClient.metrics.icpValidated === false ? 'Não' : '—'} />
              </div>

              <div className={styles.tags}>
                {selectedClient.tags.map((tag) => <span key={tag.key} className={`${styles.tag} ${toneClass(tag.tone)}`.trim()}>{tag.label}</span>)}
                {!selectedClient.tags.length ? <span className={`${styles.tag} ${styles.tagMuted}`}>Sem etiquetas automáticas</span> : null}
              </div>
            </>
          ) : (
            <StateBlock compact variant="empty" title="Selecione um cliente" />
          )}
        </article>
      </section>
    </div>
  );
}
