import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { SearchIcon, ShieldIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import { clientInitials, fmtDateBR, statusLabel } from '../../utils/clientHelpers.js';
import { CLIENT_STATUS, isRevenueClientStatus, normalizeClientStatus } from '../../utils/clientStatus.js';
import { fmtMoney } from '../../utils/format.js';
import styles from './ClientsV2Page.module.css';

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: CLIENT_STATUS.ACTIVE, label: 'Ativos' },
  { key: CLIENT_STATUS.ONBOARDING, label: 'Onboard' },
  { key: CLIENT_STATUS.RAMPAGE, label: 'Rampagem' },
  { key: CLIENT_STATUS.PAUSED, label: 'Pausados' },
  { key: CLIENT_STATUS.CHURN, label: 'Churn' },
  { key: CLIENT_STATUS.FINISHED, label: 'Finalizados' },
];

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

function clientName(client) {
  return String(client?.name || client?.clientName || client?.client_name || 'Cliente sem nome').trim();
}

function clientSquadName(client, squads) {
  const squadId = client?.squadId || client?.squad_id;
  const directName = client?.squadName || client?.squad_name;
  if (directName) return directName;
  const match = (Array.isArray(squads) ? squads : []).find((squad) => String(squad?.id) === String(squadId || ''));
  return match?.name || 'Sem squad';
}

function clientGdvName(client) {
  return client?.gdvName || client?.gdv_name || client?.gdv || 'Sem GDV';
}

function clientGestorName(client) {
  return client?.gestor || client?.trafficManager || client?.traffic_manager || 'Sem gestor';
}

function clientFee(client) {
  return Number(client?.fee ?? client?.monthlyFee ?? client?.monthly_fee ?? 0) || 0;
}

function clientStartDate(client) {
  return client?.startDate || client?.start_date || client?.createdAt || client?.created_at || '';
}

function buildSummary(clients) {
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
      return acc;
    },
    { total: 0, revenueClients: 0, churn: 0, finished: 0, mrr: 0, byStatus: {} }
  );
}

export default function ClientsV2Page() {
  const { clients, squads, loading, error } = useOutletContext();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const summary = useMemo(() => buildSummary(clients), [clients]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return (Array.isArray(clients) ? clients : [])
      .filter((client) => {
        const status = normalizeClientStatus(client?.status);
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (!normalizedQuery) return true;
        const haystack = normalizeText([
          clientName(client),
          clientSquadName(client, squads),
          clientGdvName(client),
          clientGestorName(client),
          statusLabel(client),
        ].join(' '));
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => clientName(a).localeCompare(clientName(b), 'pt-BR'));
  }, [clients, query, squads, statusFilter]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <UsersIcon size={20} />
        </div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Clientes V2 · rota paralela</p>
          <h1>Visão segura da carteira de clientes</h1>
          <p>
            Tela interna, somente leitura e fora da sidebar. Ela usa os dados reais já carregados pelo shell atual, sem alterar o cadastro, sem criar endpoint e sem substituir <strong>/clientes</strong>.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem impacto em produção</span>
      </section>

      <section className={styles.metrics} aria-label="Resumo da carteira">
        <article className={styles.metricCard}>
          <span>Total</span>
          <strong>{summary.total}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Receita ativa</span>
          <strong>{summary.revenueClients}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>MRR estimado</span>
          <strong>{fmtMoney(summary.mrr)}</strong>
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

      <section className={styles.toolbar} aria-label="Filtros de clientes">
        <label className={styles.searchBox}>
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, squad, GDV ou gestor"
          />
        </label>
        <div className={styles.filterGroup} aria-label="Filtrar por status">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.filterButton} ${statusFilter === item.key ? styles.filterButtonActive : ''}`}
              onClick={() => setStatusFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.tablePanel}>
        <div className={styles.tableHeader}>
          <div>
            <h2>Carteira carregada</h2>
            <p>{loading ? 'Carregando dados...' : `${filteredClients.length} cliente${filteredClients.length === 1 ? '' : 's'} nesta visão`}</p>
          </div>
          <span className={styles.readOnly}>Somente leitura</span>
        </div>

        {error ? (
          <div className={styles.stateBox}>Não foi possível carregar clientes. Verifique a API antes de validar a V2.</div>
        ) : null}

        {!error && !loading && filteredClients.length === 0 ? (
          <div className={styles.stateBox}>Nenhum cliente encontrado com os filtros atuais.</div>
        ) : null}

        {!error && filteredClients.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Squad</th>
                  <th>GDV</th>
                  <th>Gestor</th>
                  <th>MRR</th>
                  <th>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.slice(0, 80).map((client) => {
                  const id = clientId(client);
                  const status = normalizeClientStatus(client?.status);
                  return (
                    <tr key={id || clientName(client)}>
                      <td>
                        <div className={styles.clientCell}>
                          <span className={styles.avatar}>{clientInitials(clientName(client))}</span>
                          <div>
                            <strong>{clientName(client)}</strong>
                            <small>{id ? `ID ${id}` : 'Sem ID'}</small>
                          </div>
                        </div>
                      </td>
                      <td><span className={`${styles.statusPill} ${styles[`status_${status}`] || ''}`}>{statusLabel(client)}</span></td>
                      <td>{clientSquadName(client, squads)}</td>
                      <td>{clientGdvName(client)}</td>
                      <td>{clientGestorName(client)}</td>
                      <td className={styles.money}>{fmtMoney(clientFee(client))}</td>
                      <td>{fmtDateBR(clientStartDate(client))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {filteredClients.length > 80 ? (
          <p className={styles.limitNote}>Exibindo os primeiros 80 clientes para manter a rota de validação leve.</p>
        ) : null}
      </section>
    </main>
  );
}
