import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  CalendarIcon,
  ChartColumnIcon,
  CloseIcon,
  SearchIcon,
  ShieldIcon,
  TargetIcon,
  UsersIcon,
} from '../../components/ui/Icons.jsx';
import {
  clientInitials,
  fmtDateBR,
  getClientOnboardingDays,
  isEndingSoon,
  isExpired,
  statusLabel,
} from '../../utils/clientHelpers.js';
import { CLIENT_STATUS, isRevenueClientStatus, normalizeClientStatus } from '../../utils/clientStatus.js';
import { fmtMoney } from '../../utils/format.js';
import styles from './ClientsV2Page.module.css';
import V2RouteNav from './V2RouteNav.jsx';

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: CLIENT_STATUS.ACTIVE, label: 'Ativos' },
  { key: CLIENT_STATUS.ONBOARDING, label: 'Onboard' },
  { key: CLIENT_STATUS.RAMPAGE, label: 'Rampagem' },
  { key: CLIENT_STATUS.PAUSED, label: 'Pausados' },
  { key: CLIENT_STATUS.CHURN, label: 'Churn' },
  { key: CLIENT_STATUS.FINISHED, label: 'Finalizados' },
];

const SCOPE_FILTERS = [
  { key: 'all', label: 'Carteira completa' },
  { key: 'revenue', label: 'Conta receita' },
  { key: 'attention', label: 'Atenção' },
  { key: 'tcv', label: 'TCV' },
  { key: 'internal', label: 'Comercial interno' },
  { key: 'closed', label: 'Encerrados' },
];

const DETAIL_TABS = [
  { key: 'overview', label: 'Resumo' },
  { key: 'operation', label: 'Operação' },
  { key: 'finance', label: 'Financeiro' },
  { key: 'retention', label: 'Retenção' },
  { key: 'validation', label: 'Validação' },
];

const SORT_OPTIONS = [
  { key: 'name', label: 'Nome' },
  { key: 'mrr', label: 'Maior MRR' },
  { key: 'status', label: 'Status' },
  { key: 'entry', label: 'Entrada mais recente' },
  { key: 'ending', label: 'Término mais próximo' },
];

const PAGE_SIZE = 20;

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function clientId(client) {
  return client?.id || client?.clientId || client?.client_id || '';
}

function clientKey(client) {
  return String(clientId(client) || clientName(client));
}

function clientName(client) {
  return String(client?.name || client?.clientName || client?.client_name || 'Cliente sem nome').trim();
}

function pickText(client, keys, fallback = 'Não informado') {
  for (const key of keys) {
    const value = client?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function pickNumber(client, keys, fallback = 0) {
  for (const key of keys) {
    const numeric = Number(client?.[key]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}

function parseDateValue(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clientStartDate(client) {
  return client?.startDate || client?.start_date || client?.createdAt || client?.created_at || '';
}

function clientEndDate(client) {
  return client?.endDate || client?.end_date || client?.churnDate || client?.churn_date || '';
}

function dateSortValue(value, fallback = 0) {
  const date = parseDateValue(value);
  return date ? date.getTime() : fallback;
}

function clientFee(client) {
  return pickNumber(client, ['fee', 'monthlyFee', 'monthly_fee', 'mrr']);
}

function clientMetaLucro(client) {
  return pickNumber(client, ['metaLucro', 'meta_lucro', 'profitTarget', 'profit_target']);
}

function clientSquadName(client, squads) {
  const squadId = client?.squadId || client?.squad_id;
  const directName = client?.squadName || client?.squad_name;
  if (directName) return directName;
  const match = (Array.isArray(squads) ? squads : []).find((squad) => String(squad?.id) === String(squadId || ''));
  return match?.name || 'Sem squad';
}

function clientGdvName(client, gdvs = []) {
  const gdvId = client?.gdvId || client?.gdv_id;
  const directName = client?.gdvName || client?.gdv_name || client?.gdv;
  if (directName) return directName;
  const match = (Array.isArray(gdvs) ? gdvs : []).find((gdv) => String(gdv?.id) === String(gdvId || ''));
  return match?.name || 'Sem GDV';
}

function clientGestorName(client) {
  return pickText(client, ['gestor', 'trafficManager', 'traffic_manager', 'managerName', 'manager_name'], 'Sem gestor');
}

function clientContractType(client) {
  const raw = normalizeText(client?.contractType || client?.contract_type || (client?.isTcv ? 'tcv' : 'recorrente'));
  return raw.includes('tcv') ? 'tcv' : 'recorrente';
}

function contractLabel(client) {
  return clientContractType(client) === 'tcv' ? 'TCV' : 'Recorrente';
}

function hasInternalCommercial(client) {
  return Boolean(client?.internalCommercial || client?.internal_commercial_enabled) && Boolean(String(client?.internalSeller || client?.internal_seller || '').trim());
}

function internalSeller(client) {
  return pickText(client, ['internalSeller', 'internal_seller'], 'Não informado');
}

function churnMonthKey(client) {
  const year = Number(client?.churnYear || client?.churn_year);
  const month = Number(client?.churnMonth || client?.churn_month);
  if (year && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  const raw = String(client?.churnDate || client?.churn_date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function monthLabel(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return 'Não informado';
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, (char) => char.toUpperCase());
}

function optionValue(value) {
  return value && value !== 'Não informado' ? value : '';
}

function uniqueOptions(values) {
  return Array.from(new Set(values.map(optionValue).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function analysisCount(client, key) {
  const counts = client?.analysisCounts || client?.analysesCount || client?.analysisSummary || {};
  const aliases = {
    icp: ['icp'],
    gdv: ['gdv', 'gdvanalise'],
    routes: ['routes', 'route_summary'],
  }[key] || [key];

  for (const alias of aliases) {
    const numeric = Number(counts?.[alias]);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function dueInfo(client, today = new Date()) {
  const end = parseDateValue(clientEndDate(client));
  if (!end) return { label: 'Sem término', days: null, tone: 'muted' };
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((end.getTime() - base.getTime()) / 86400000);
  if (diff < 0) return { label: `Vencido há ${Math.abs(diff)} dias`, days: diff, tone: 'danger' };
  if (diff === 0) return { label: 'Vence hoje', days: diff, tone: 'danger' };
  if (diff <= 30) return { label: `Vence em ${diff} dias`, days: diff, tone: 'warning' };
  return { label: `Vence em ${diff} dias`, days: diff, tone: 'muted' };
}

function attentionReasons(client, today = new Date()) {
  const status = normalizeClientStatus(client?.status);
  const reasons = [];
  if (isExpired(client, today)) reasons.push('Contrato vencido');
  if (isEndingSoon(client, 30, today)) reasons.push('Contrato vencendo');
  if (status === CLIENT_STATUS.CHURN) reasons.push('Cliente em churn');
  if (status === CLIENT_STATUS.PAUSED) reasons.push('Cliente pausado');
  if (status === CLIENT_STATUS.ONBOARDING) {
    const days = getClientOnboardingDays(client, today);
    if (Number.isFinite(days) && days >= 7) reasons.push('Onboarding acima de 7 dias');
  }
  if (clientMetaLucro(client) > 0 && clientFee(client) <= 0) reasons.push('Meta sem mensalidade');
  return reasons;
}

function clientMatchesScope(client, scope, today) {
  const status = normalizeClientStatus(client?.status);
  if (scope === 'revenue') return isRevenueClientStatus(status);
  if (scope === 'attention') return attentionReasons(client, today).length > 0;
  if (scope === 'tcv') return clientContractType(client) === 'tcv';
  if (scope === 'internal') return hasInternalCommercial(client);
  if (scope === 'closed') return status === CLIENT_STATUS.CHURN || status === CLIENT_STATUS.FINISHED;
  return true;
}

function buildSummary(clients, today) {
  const list = Array.isArray(clients) ? clients : [];
  return list.reduce(
    (acc, client) => {
      const status = normalizeClientStatus(client?.status);
      acc.total += 1;
      acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
      if (isRevenueClientStatus(status)) {
        acc.revenueClients += 1;
        acc.mrr += clientFee(client);
      }
      if (status === CLIENT_STATUS.CHURN) acc.churn += 1;
      if (status === CLIENT_STATUS.FINISHED) acc.finished += 1;
      if (clientContractType(client) === 'tcv') acc.tcv += 1;
      if (hasInternalCommercial(client)) acc.internal += 1;
      if (attentionReasons(client, today).length > 0) acc.attention += 1;
      return acc;
    },
    { total: 0, revenueClients: 0, churn: 0, finished: 0, tcv: 0, internal: 0, attention: 0, mrr: 0, byStatus: {} }
  );
}

function sortClients(list, sortKey, squads, gdvs) {
  return [...list].sort((a, b) => {
    if (sortKey === 'mrr') return clientFee(b) - clientFee(a) || clientName(a).localeCompare(clientName(b), 'pt-BR');
    if (sortKey === 'status') return statusLabel(a).localeCompare(statusLabel(b), 'pt-BR') || clientName(a).localeCompare(clientName(b), 'pt-BR');
    if (sortKey === 'entry') return dateSortValue(clientStartDate(b)) - dateSortValue(clientStartDate(a)) || clientName(a).localeCompare(clientName(b), 'pt-BR');
    if (sortKey === 'ending') return dateSortValue(clientEndDate(a), Number.MAX_SAFE_INTEGER) - dateSortValue(clientEndDate(b), Number.MAX_SAFE_INTEGER) || clientName(a).localeCompare(clientName(b), 'pt-BR');
    if (sortKey === 'squad') return clientSquadName(a, squads).localeCompare(clientSquadName(b, squads), 'pt-BR') || clientName(a).localeCompare(clientName(b), 'pt-BR');
    if (sortKey === 'gdv') return clientGdvName(a, gdvs).localeCompare(clientGdvName(b, gdvs), 'pt-BR') || clientName(a).localeCompare(clientName(b), 'pt-BR');
    return clientName(a).localeCompare(clientName(b), 'pt-BR');
  });
}

function StatusPill({ client }) {
  const status = normalizeClientStatus(client?.status);
  return <span className={`${styles.statusPill} ${styles[`status_${status}`] || ''}`}>{statusLabel(client)}</span>;
}

function DetailRow({ label, value, wide = false }) {
  return (
    <div className={`${styles.detailRow} ${wide ? styles.detailRowWide : ''}`}>
      <span>{label}</span>
      <strong>{value || 'Não informado'}</strong>
    </div>
  );
}

function DetailTag({ children, tone = 'neutral' }) {
  return <span className={`${styles.detailTag} ${styles[`tone_${tone}`] || ''}`}>{children}</span>;
}

function ClientDetailTab({ tab, client, squads, gdvs, today }) {
  const status = normalizeClientStatus(client?.status);
  const due = dueInfo(client, today);
  const reasons = attentionReasons(client, today);
  const onboardingDays = getClientOnboardingDays(client, today);
  const churnKey = churnMonthKey(client);

  if (tab === 'operation') {
    return (
      <div className={styles.detailGrid}>
        <DetailRow label="Squad" value={clientSquadName(client, squads)} />
        <DetailRow label="GDV" value={clientGdvName(client, gdvs)} />
        <DetailRow label="Gestor de tráfego" value={clientGestorName(client)} />
        <DetailRow label="Rota" value={pickText(client, ['route', 'routeName', 'route_name'])} />
        <DetailRow label="ICP" value={pickText(client, ['icp', 'icpName', 'icp_name'])} />
        <DetailRow label="Comercial interno" value={hasInternalCommercial(client) ? internalSeller(client) : 'Não'} />
      </div>
    );
  }

  if (tab === 'finance') {
    return (
      <div className={styles.detailGrid}>
        <DetailRow label="MRR / mensalidade" value={fmtMoney(clientFee(client))} />
        <DetailRow label="Meta lucro" value={clientMetaLucro(client) ? fmtMoney(clientMetaLucro(client)) : 'Não informado'} />
        <DetailRow label="Tipo de contrato" value={contractLabel(client)} />
        <DetailRow label="Conta receita" value={isRevenueClientStatus(status) ? 'Sim' : 'Não'} />
        <DetailRow label="Fee steps" value={Array.isArray(client?.feeSteps || client?.fee_steps) ? `${(client?.feeSteps || client?.fee_steps).length} etapa(s)` : 'Não informado'} />
        <DetailRow label="Contrato TCV" value={clientContractType(client) === 'tcv' ? 'Sim' : 'Não'} />
      </div>
    );
  }

  if (tab === 'retention') {
    return (
      <div className={styles.detailGrid}>
        <DetailRow label="Status operacional" value={statusLabel(client)} />
        <DetailRow label="Entrada" value={fmtDateBR(clientStartDate(client))} />
        <DetailRow label="Término / saída" value={fmtDateBR(clientEndDate(client))} />
        <DetailRow label="Mês de churn" value={monthLabel(churnKey)} />
        <DetailRow label="Prazo do contrato" value={due.label} />
        <DetailRow label="Dias em onboarding" value={Number.isFinite(onboardingDays) ? `${onboardingDays} dias` : 'Não se aplica'} />
      </div>
    );
  }

  if (tab === 'validation') {
    return (
      <div className={styles.validationBlock}>
        <div className={styles.validationItem}>
          <strong>Fonte de dados</strong>
          <span>Lista já carregada pelo shell da plataforma via GET de clientes.</span>
        </div>
        <div className={styles.validationItem}>
          <strong>Escrita em banco</strong>
          <span>Não executa POST, PUT, PATCH ou DELETE nesta rota V2.</span>
        </div>
        <div className={styles.validationItem}>
          <strong>Churn e Finalizado</strong>
          <span>Separados por status. Finalizado não é tratado como churn.</span>
        </div>
        <div className={styles.validationItem}>
          <strong>Pontos de atenção</strong>
          <span>{reasons.length ? reasons.join(' · ') : 'Nenhum alerta operacional calculado nesta visão.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.detailGrid}>
      <DetailRow label="ID" value={clientId(client) || 'Sem ID'} />
      <DetailRow label="Status" value={statusLabel(client)} />
      <DetailRow label="Squad" value={clientSquadName(client, squads)} />
      <DetailRow label="MRR" value={fmtMoney(clientFee(client))} />
      <DetailRow label="Entrada" value={fmtDateBR(clientStartDate(client))} />
      <DetailRow label="Prazo" value={due.label} />
      <DetailRow label="Observação" value={pickText(client, ['notes', 'observation', 'observacao'], 'Não informado')} wide />
    </div>
  );
}

function ReadOnlyClientDetail({ client, squads, gdvs, today, activeTab, onTabChange, onClose }) {
  if (!client) return null;
  const status = normalizeClientStatus(client?.status);
  const reasons = attentionReasons(client, today);

  return (
    <aside className={styles.detailPanel} aria-label="Detalhes do cliente selecionado">
      <header className={styles.detailHeader}>
        <div className={styles.detailIdentity}>
          <span className={styles.detailAvatar}>{clientInitials(clientName(client))}</span>
          <div>
            <p className={styles.eyebrow}>Cliente selecionado</p>
            <h2>{clientName(client)}</h2>
            <div className={styles.detailTags}>
              <StatusPill client={client} />
              <DetailTag tone={isRevenueClientStatus(status) ? 'success' : 'neutral'}>
                {isRevenueClientStatus(status) ? 'Conta receita' : 'Não conta receita'}
              </DetailTag>
              {reasons.length ? <DetailTag tone="warning">Atenção</DetailTag> : null}
            </div>
          </div>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar detalhes">
          <CloseIcon size={16} />
        </button>
      </header>

      <nav className={styles.detailTabs} aria-label="Abas de detalhes do cliente">
        {DETAIL_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.detailTab} ${activeTab === item.key ? styles.detailTabActive : ''}`}
            onClick={() => onTabChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <ClientDetailTab tab={activeTab} client={client} squads={squads} gdvs={gdvs} today={today} />

      <footer className={styles.detailFooter}>
        <Link className={styles.secondaryLink} to="/v2/modelo-oficial">Abrir modelo oficial V2</Link>
        <p>Painel somente leitura. A promoção para produção só deve ocorrer após comparação com /clientes.</p>
      </footer>
    </aside>
  );
}

export default function ClientsV2Page() {
  const { clients, squads, gdvs, loading, error, refreshClients } = useOutletContext();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [squadFilter, setSquadFilter] = useState('all');
  const [gdvFilter, setGdvFilter] = useState('all');
  const [gestorFilter, setGestorFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [today] = useState(() => new Date());

  const allClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients]);
  const summary = useMemo(() => buildSummary(allClients, today), [allClients, today]);

  const squadOptions = useMemo(() => uniqueOptions(allClients.map((client) => clientSquadName(client, squads))), [allClients, squads]);
  const gdvOptions = useMemo(() => uniqueOptions(allClients.map((client) => clientGdvName(client, gdvs))), [allClients, gdvs]);
  const gestorOptions = useMemo(() => uniqueOptions(allClients.map((client) => clientGestorName(client))), [allClients]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const base = allClients.filter((client) => {
      const status = normalizeClientStatus(client?.status);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!clientMatchesScope(client, scopeFilter, today)) return false;
      if (squadFilter !== 'all' && clientSquadName(client, squads) !== squadFilter) return false;
      if (gdvFilter !== 'all' && clientGdvName(client, gdvs) !== gdvFilter) return false;
      if (gestorFilter !== 'all' && clientGestorName(client) !== gestorFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = normalizeText([
        clientName(client),
        clientSquadName(client, squads),
        clientGdvName(client, gdvs),
        clientGestorName(client),
        statusLabel(client),
        pickText(client, ['icp', 'icpName', 'icp_name'], ''),
        pickText(client, ['route', 'routeName', 'route_name'], ''),
      ].join(' '));
      return haystack.includes(normalizedQuery);
    });
    return sortClients(base, sortKey, squads, gdvs);
  }, [allClients, gdvFilter, gdvs, gestorFilter, query, scopeFilter, sortKey, squadFilter, squads, statusFilter, today]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageClients = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredClients.slice(start, start + PAGE_SIZE);
  }, [filteredClients, safePage]);

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return allClients.find((client) => clientKey(client) === String(selectedClientId)) || null;
  }, [allClients, selectedClientId]);

  const selectedVisible = useMemo(() => {
    if (!selectedClientId) return true;
    return filteredClients.some((client) => clientKey(client) === String(selectedClientId));
  }, [filteredClients, selectedClientId]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, scopeFilter, squadFilter, gdvFilter, gestorFilter, sortKey]);

  useEffect(() => {
    if (!selectedVisible) setSelectedClientId(null);
  }, [selectedVisible]);

  function resetFilters() {
    setQuery('');
    setStatusFilter('all');
    setScopeFilter('all');
    setSquadFilter('all');
    setGdvFilter('all');
    setGestorFilter('all');
    setSortKey('name');
  }

  return (
    <main className={styles.page}>
      <V2RouteNav currentKey="clients" />

      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <UsersIcon size={20} />
        </div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Clientes V2 · tela completa em rota paralela</p>
          <h1>Carteira de clientes pronta para validação</h1>
          <p>
            Nova tela de clientes com filtros, paginação, leitura operacional e detalhe por abas. Continua sem substituir <strong>/clientes</strong> e sem qualquer escrita no banco.
          </p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.safeBadge}><ShieldIcon size={14} /> Somente leitura</span>
          <button type="button" className={styles.heroButton} onClick={() => refreshClients?.()}>
            Atualizar dados
          </button>
          <Link className={styles.heroButton} to="/clientes">Comparar produção</Link>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Resumo da carteira">
        <article className={styles.metricCard}>
          <UsersIcon size={16} />
          <span>Total</span>
          <strong>{summary.total}</strong>
        </article>
        <article className={styles.metricCard}>
          <TargetIcon size={16} />
          <span>Conta receita</span>
          <strong>{summary.revenueClients}</strong>
        </article>
        <article className={styles.metricCard}>
          <ChartColumnIcon size={16} />
          <span>MRR estimado</span>
          <strong>{fmtMoney(summary.mrr)}</strong>
        </article>
        <article className={styles.metricCard}>
          <CalendarIcon size={16} />
          <span>Atenção</span>
          <strong>{summary.attention}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Churn</span>
          <strong>{summary.churn}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Finalizados</span>
          <strong>{summary.finished}</strong>
        </article>
      </section>

      <section className={styles.scopeBar} aria-label="Escopos rápidos">
        {SCOPE_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.scopeButton} ${scopeFilter === item.key ? styles.scopeButtonActive : ''}`}
            onClick={() => setScopeFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </section>

      <section className={styles.toolbar} aria-label="Filtros de clientes">
        <label className={styles.searchBox}>
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, squad, GDV, gestor, ICP ou rota"
          />
        </label>

        <div className={styles.selectGrid}>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUS_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span>Squad</span>
            <select value={squadFilter} onChange={(event) => setSquadFilter(event.target.value)}>
              <option value="all">Todos</option>
              {squadOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>GDV</span>
            <select value={gdvFilter} onChange={(event) => setGdvFilter(event.target.value)}>
              <option value="all">Todos</option>
              {gdvOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Gestor</span>
            <select value={gestorFilter} onChange={(event) => setGestorFilter(event.target.value)}>
              <option value="all">Todos</option>
              {gestorOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Ordenar</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
              {SORT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <button type="button" className={styles.resetButton} onClick={resetFilters}>Limpar filtros</button>
      </section>

      <section className={`${styles.contentGrid} ${selectedClient ? styles.contentGridWithDetail : ''}`}>
        <section className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>Clientes filtrados</h2>
              <p>{loading ? 'Carregando dados...' : `${filteredClients.length} de ${summary.total} cliente${summary.total === 1 ? '' : 's'}`}</p>
            </div>
            <span className={styles.readOnly}>Rota V2 paralela</span>
          </div>

          {error ? <div className={styles.stateBox}>Não foi possível carregar clientes. Verifique a API antes de validar a V2.</div> : null}
          {!error && !loading && filteredClients.length === 0 ? <div className={styles.stateBox}>Nenhum cliente encontrado com os filtros atuais.</div> : null}

          {!error && pageClients.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Squad</th>
                    <th>GDV</th>
                    <th>Gestor</th>
                    <th>Contrato</th>
                    <th>MRR</th>
                    <th>Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {pageClients.map((client) => {
                    const key = clientKey(client);
                    const isSelected = selectedClient && clientKey(selectedClient) === key;
                    const due = dueInfo(client, today);
                    const reasons = attentionReasons(client, today);
                    return (
                      <tr
                        key={key}
                        className={isSelected ? styles.selectedRow : ''}
                        onClick={() => {
                          setSelectedClientId(key);
                          setDetailTab('overview');
                        }}
                      >
                        <td>
                          <div className={styles.clientCell}>
                            <span className={styles.avatar}>{clientInitials(clientName(client))}</span>
                            <div>
                              <strong>{clientName(client)}</strong>
                              <small>{clientId(client) ? `ID ${clientId(client)}` : 'Sem ID'}{reasons.length ? ` · ${reasons[0]}` : ''}</small>
                            </div>
                          </div>
                        </td>
                        <td><StatusPill client={client} /></td>
                        <td>{clientSquadName(client, squads)}</td>
                        <td>{clientGdvName(client, gdvs)}</td>
                        <td>{clientGestorName(client)}</td>
                        <td>{contractLabel(client)}</td>
                        <td className={styles.money}>{fmtMoney(clientFee(client))}</td>
                        <td><span className={`${styles.duePill} ${styles[`tone_${due.tone}`] || ''}`}>{due.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <footer className={styles.pagination}>
            <span>Página {safePage} de {totalPages}</span>
            <div>
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1}>Anterior</button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages}>Próxima</button>
            </div>
          </footer>
        </section>

        <ReadOnlyClientDetail
          client={selectedClient}
          squads={squads}
          gdvs={gdvs}
          today={today}
          activeTab={detailTab}
          onTabChange={setDetailTab}
          onClose={() => setSelectedClientId(null)}
        />
      </section>

      <section className={styles.validationPanel} aria-label="Checklist de validação">
        <div>
          <p className={styles.eyebrow}>Checklist antes de promover</p>
          <h2>Critérios mínimos para trocar /clientes</h2>
        </div>
        <ul>
          <li>Total de clientes deve bater com a tela oficial.</li>
          <li>Churn e Finalizado devem aparecer como status separados.</li>
          <li>Filtros por squad, GDV, gestor e status devem responder com dados reais.</li>
          <li>Detalhe do cliente deve ser suficiente para operação sem abrir modal legado.</li>
          <li>Nenhuma ação de escrita deve existir nesta rota antes da aprovação visual.</li>
        </ul>
      </section>
    </main>
  );
}
