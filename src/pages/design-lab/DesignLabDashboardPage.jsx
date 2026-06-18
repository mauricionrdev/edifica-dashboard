import { useEffect, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChartColumnIcon,
  CoinsIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from '../../components/ui/Icons.jsx';
import StateBlock from '../../components/ui/StateBlock.jsx';
import { BareBadge } from '../../components/design-system/index.js';
import { clientInitials } from '../../utils/clientHelpers.js';
import { getClientAvatar } from '../../utils/avatarStorage.js';
import { CLIENT_STATUS, isRevenueClientStatus, normalizeClientStatus } from '../../utils/clientStatus.js';
import { resolveClientFeeAtDate } from '../../utils/feeSchedule.js';
import { fmtMoney, MONTHS_FULL } from '../../utils/format.js';
import '../../styles/design-system/barely-there.css';
import styles from './DesignLabDashboardPage.module.css';

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayAtStart(reference = new Date()) {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

function daysUntil(value, reference = new Date()) {
  const target = parseDateOnly(value);
  if (!target) return null;
  return Math.round((target.getTime() - todayAtStart(reference).getTime()) / 86400000);
}

function dueLabel(days) {
  if (!Number.isFinite(days)) return 'Sem término';
  if (days < 0) return `Vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence em 1 dia';
  return `Vence em ${days} dias`;
}

function dueTone(days) {
  if (!Number.isFinite(days)) return 'muted';
  if (days <= 7) return 'danger';
  if (days <= 30) return 'warning';
  if (days <= 60) return 'info';
  return 'muted';
}

function isTcvClient(client) {
  return client?.contractType === 'tcv' || client?.contract_type === 'tcv' || client?.isTcv === true;
}

function hasInternalCommercial(client) {
  return Boolean(client?.internalCommercial || client?.internal_commercial_enabled) && Boolean(String(client?.internalSeller || client?.internal_seller || '').trim());
}

function getInternalSeller(client) {
  return String(client?.internalSeller || client?.internal_seller || '').trim() || 'Sem vendedor';
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatShortDate(value) {
  const date = parseDateOnly(value);
  if (!date) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function compactNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function percent(value) {
  const number = Number(value) || 0;
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(number)}%`;
}

function clientStatusTone(status) {
  const normalized = normalizeClientStatus(status);
  if (normalized === CLIENT_STATUS.CHURN) return 'danger';
  if (normalized === CLIENT_STATUS.PAUSED) return 'muted';
  if (normalized === CLIENT_STATUS.ONBOARDING) return 'info';
  if (normalized === CLIENT_STATUS.RAMPAGE) return 'warning';
  return 'success';
}

function clientStatusLabel(status) {
  const normalized = normalizeClientStatus(status);
  if (normalized === CLIENT_STATUS.CHURN) return 'Churn';
  if (normalized === CLIENT_STATUS.PAUSED) return 'Pausado';
  if (normalized === CLIENT_STATUS.ONBOARDING) return 'Onboard';
  if (normalized === CLIENT_STATUS.RAMPAGE) return 'Rampagem';
  return 'Ativo';
}

function groupBySquad(clients, squads, referenceDate) {
  const squadMap = new Map((Array.isArray(squads) ? squads : []).map((squad) => [String(squad.id), squad]));
  const rows = new Map();

  clients.forEach((client) => {
    const squadId = String(client?.squadId || client?.squad_id || '');
    const squad = squadMap.get(squadId);
    const name = client?.squadName || client?.squad_name || squad?.name || 'Sem squad';
    const current = rows.get(name) || {
      name,
      total: 0,
      revenueClients: 0,
      mrr: 0,
      tcv: 0,
      internal: 0,
      ending: 0,
    };

    current.total += 1;
    if (isRevenueClientStatus(client?.status)) {
      current.revenueClients += 1;
      current.mrr += resolveClientFeeAtDate(client, referenceDate);
    }
    if (isTcvClient(client)) current.tcv += 1;
    if (hasInternalCommercial(client)) current.internal += 1;
    const days = daysUntil(client?.endDate || client?.end_date, referenceDate);
    if (Number.isFinite(days) && days >= 0 && days <= 60) current.ending += 1;

    rows.set(name, current);
  });

  return [...rows.values()].sort((a, b) => b.mrr - a.mrr || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
}

function groupInternalSellers(clients, referenceDate) {
  const rows = new Map();

  clients.filter(hasInternalCommercial).forEach((client) => {
    const seller = getInternalSeller(client);
    const current = rows.get(seller) || { seller, clients: 0, mrr: 0, tcv: 0, ending: 0 };
    current.clients += 1;
    if (isRevenueClientStatus(client?.status)) current.mrr += resolveClientFeeAtDate(client, referenceDate);
    if (isTcvClient(client)) current.tcv += 1;
    const days = daysUntil(client?.endDate || client?.end_date, referenceDate);
    if (Number.isFinite(days) && days >= 0 && days <= 60) current.ending += 1;
    rows.set(seller, current);
  });

  return [...rows.values()].sort((a, b) => b.clients - a.clients || b.mrr - a.mrr || a.seller.localeCompare(b.seller, 'pt-BR'));
}

function Metric({ label, value, helper, tone = 'neutral', icon: Icon }) {
  return (
    <article className={`${styles.metric} ${styles[`metric_${tone}`] || ''}`.trim()}>
      <div className={styles.metricTop}>
        <span>{label}</span>
        {Icon ? <Icon size={15} aria-hidden="true" /> : null}
      </div>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

export default function DesignLabDashboardPage() {
  const { clients, squads, loading, error, setPanelHeader } = useOutletContext();
  const referenceDate = useMemo(() => new Date(), []);
  const currentMonthKey = monthKey(referenceDate);

  useEffect(() => {
    setPanelHeader?.({
      title: (
        <>
          <strong>Dashboard</strong>
          <span>·</span>
          <span>{MONTHS_FULL[referenceDate.getMonth()]} {referenceDate.getFullYear()}</span>
        </>
      ),
      actions: (
        <Link className={styles.headerLink} to="/design-lab/clientes">
          Clientes
          <ArrowUpRightIcon size={14} aria-hidden="true" />
        </Link>
      ),
    });
  }, [referenceDate, setPanelHeader]);

  const data = useMemo(() => {
    const all = Array.isArray(clients) ? clients : [];
    const revenueClients = all.filter((client) => isRevenueClientStatus(client?.status));
    const activeClients = all.filter((client) => normalizeClientStatus(client?.status) === CLIENT_STATUS.ACTIVE);
    const onboardingClients = all.filter((client) => normalizeClientStatus(client?.status) === CLIENT_STATUS.ONBOARDING);
    const pausedClients = all.filter((client) => normalizeClientStatus(client?.status) === CLIENT_STATUS.PAUSED);
    const churnClients = all.filter((client) => normalizeClientStatus(client?.status) === CLIENT_STATUS.CHURN);
    const tcvClients = all.filter(isTcvClient);
    const internalClients = all.filter(hasInternalCommercial);
    const endingClients = all
      .map((client) => ({ client, days: daysUntil(client?.endDate || client?.end_date, referenceDate) }))
      .filter((entry) => Number.isFinite(entry.days) && entry.days <= 90)
      .sort((a, b) => a.days - b.days);
    const monthStarts = all.filter((client) => String(client?.startDate || client?.start_date || '').startsWith(currentMonthKey));
    const mrr = revenueClients.reduce((sum, client) => sum + resolveClientFeeAtDate(client, referenceDate), 0);
    const newMrr = monthStarts.reduce((sum, client) => sum + resolveClientFeeAtDate(client, referenceDate), 0);
    const tcvValue = tcvClients.reduce((sum, client) => sum + resolveClientFeeAtDate(client, referenceDate), 0);
    const internalMrr = internalClients.reduce((sum, client) => sum + resolveClientFeeAtDate(client, referenceDate), 0);
    const monthlyRevenueClients = all.filter((client) => String(client?.startDate || client?.start_date || '').startsWith(currentMonthKey) && isRevenueClientStatus(client?.status));

    return {
      total: all.length,
      active: activeClients.length,
      revenue: revenueClients.length,
      onboarding: onboardingClients.length,
      paused: pausedClients.length,
      churn: churnClients.length,
      tcv: tcvClients.length,
      internal: internalClients.length,
      mrr,
      newMrr,
      tcvValue,
      internalMrr,
      monthStarts: monthStarts.length,
      monthRevenue: monthlyRevenueClients.length,
      churnRate: all.length > 0 ? (churnClients.length / all.length) * 100 : 0,
      ending: endingClients,
      squads: groupBySquad(all, squads, referenceDate),
      sellers: groupInternalSellers(all, referenceDate),
      recent: [...all]
        .sort((a, b) => Date.parse(b?.createdAt || b?.created_at || b?.startDate || '') - Date.parse(a?.createdAt || a?.created_at || a?.startDate || ''))
        .slice(0, 6),
    };
  }, [clients, currentMonthKey, referenceDate, squads]);

  if (loading) {
    return (
      <div className={`btScope ${styles.page}`}>
        <StateBlock variant="loading" compact title="Carregando dashboard" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`btScope ${styles.page}`}>
        <StateBlock variant="error" compact title="Não foi possível carregar o dashboard" />
      </div>
    );
  }

  return (
    <div className={`btScope ${styles.page}`}>
      <section className={styles.hero} aria-label="Resumo operacional">
        <div className={styles.heroMain}>
          <span className={styles.kicker}>Operação</span>
          <h2>{fmtMoney(data.mrr)}</h2>
          <p>MRR atual em {compactNumber(data.revenue)} clientes com receita.</p>
        </div>

        <div className={styles.heroAside}>
          <span>Novos no mês</span>
          <strong>{compactNumber(data.monthStarts)}</strong>
          <small>{fmtMoney(data.newMrr)} em novas entradas</small>
        </div>
      </section>

      <section className={styles.metricsGrid} aria-label="Indicadores principais">
        <Metric label="Clientes" value={compactNumber(data.total)} helper={`${compactNumber(data.active)} ativos`} icon={UsersIcon} />
        <Metric label="MRR" value={fmtMoney(data.mrr)} helper={`${compactNumber(data.revenue)} em receita`} icon={CoinsIcon} tone="success" />
        <Metric label="Vencendo" value={compactNumber(data.ending.filter((entry) => entry.days >= 0 && entry.days <= 60).length)} helper="próximos 60 dias" icon={CalendarIcon} tone="info" />
        <Metric label="Churn" value={compactNumber(data.churn)} helper={percent(data.churnRate)} icon={TrendingUpIcon} tone="danger" />
        <Metric label="TCV" value={compactNumber(data.tcv)} helper={fmtMoney(data.tcvValue)} icon={TargetIcon} tone="purple" />
        <Metric label="Comercial interno" value={compactNumber(data.internal)} helper={fmtMoney(data.internalMrr)} icon={BriefcaseIcon} tone="purple" />
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panelLarge}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Squads</span>
              <h3>Distribuição da carteira</h3>
            </div>
            <BareBadge tone="muted">{compactNumber(data.squads.length)} squads</BareBadge>
          </header>

          <div className={styles.squadList}>
            {data.squads.slice(0, 6).map((row) => {
              const progress = data.mrr > 0 ? Math.min((row.mrr / data.mrr) * 100, 100) : 0;
              return (
                <div key={row.name} className={styles.squadRow}>
                  <div className={styles.squadInfo}>
                    <strong>{row.name}</strong>
                    <span>{compactNumber(row.revenueClients)} com receita · {compactNumber(row.total)} clientes</span>
                  </div>
                  <div className={styles.squadMetric}>
                    <strong>{fmtMoney(row.mrr)}</strong>
                    <span className={styles.progressTrack}><i style={{ width: `${progress}%` }} /></span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className={styles.panel}> 
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Contratos</span>
              <h3>Vencimentos</h3>
            </div>
            <BareBadge tone="warning">{compactNumber(data.ending.filter((entry) => entry.days >= 0 && entry.days <= 30).length)} em 30d</BareBadge>
          </header>

          <div className={styles.alertList}>
            {data.ending.length === 0 ? (
              <span className={styles.emptyLine}>Nenhum vencimento crítico.</span>
            ) : data.ending.slice(0, 6).map(({ client, days }) => {
              const avatar = getClientAvatar(client);
              return (
                <Link key={client.id} className={styles.clientLine} to={`/design-lab/clientes?search=${encodeURIComponent(client.name || '')}`}>
                  <span className={styles.avatar}>{avatar ? <img src={avatar} alt="" /> : clientInitials(client.name)}</span>
                  <span className={styles.clientLineText}>
                    <strong>{client.name}</strong>
                    <small>{formatShortDate(client?.endDate || client?.end_date)}</small>
                  </span>
                  <BareBadge tone={dueTone(days)}>{dueLabel(days)}</BareBadge>
                </Link>
              );
            })}
          </div>
        </article>
      </section>

      <section className={styles.bottomGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Comercial interno</span>
              <h3>Vendedores</h3>
            </div>
            <BareBadge tone="purple">{compactNumber(data.internal)} clientes</BareBadge>
          </header>

          <div className={styles.compactRows}>
            {data.sellers.length === 0 ? (
              <span className={styles.emptyLine}>Sem clientes vinculados.</span>
            ) : data.sellers.map((row) => (
              <div key={row.seller} className={styles.compactRow}>
                <strong>{row.seller}</strong>
                <span>{compactNumber(row.clients)} clientes</span>
                <em>{fmtMoney(row.mrr)}</em>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Segmentos</span>
              <h3>Status da carteira</h3>
            </div>
            <ChartColumnIcon size={17} aria-hidden="true" />
          </header>

          <div className={styles.statusGrid}>
            <span><strong>{compactNumber(data.active)}</strong><small>Ativos</small></span>
            <span><strong>{compactNumber(data.onboarding)}</strong><small>Onboard</small></span>
            <span><strong>{compactNumber(data.paused)}</strong><small>Pausados</small></span>
            <span><strong>{compactNumber(data.churn)}</strong><small>Churn</small></span>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Últimos clientes</span>
              <h3>Entradas recentes</h3>
            </div>
          </header>

          <div className={styles.recentList}>
            {data.recent.map((client) => {
              const avatar = getClientAvatar(client);
              return (
                <Link key={client.id} className={styles.clientLine} to={`/design-lab/clientes?search=${encodeURIComponent(client.name || '')}`}>
                  <span className={styles.avatar}>{avatar ? <img src={avatar} alt="" /> : clientInitials(client.name)}</span>
                  <span className={styles.clientLineText}>
                    <strong>{client.name}</strong>
                    <small>{client.squadName || client.squad_name || 'Sem squad'}</small>
                  </span>
                  <BareBadge tone={clientStatusTone(client.status)}>{clientStatusLabel(client.status)}</BareBadge>
                </Link>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}
