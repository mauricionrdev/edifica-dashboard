// ================================================================
//  ClientsPage (/clientes)
//  - Lista todos os clientes visíveis ao usuário (o backend já filtra
//    por squads). Métricas no topo, busca, scope tabs, tabela.
//  - Botão "+ Novo cliente" fica no panelHeader do AppShell.
//  - Drawer lateral ao clicar numa linha para ver/editar detalhes.
//  - Após criar/editar/excluir, chama refreshClients() do AppShell.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { isAdminUser } from '../utils/roles.js';
import {
  clientInitials,
  colorFromName,
  fmtDateBR,
  isEndingSoon,
  statusClass,
  statusLabel,
} from '../utils/clientHelpers.js';
import { fmtMoney } from '../utils/format.js';
import ClientFormModal from '../components/clients/ClientFormModal.jsx';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import { PlusIcon, SearchIcon } from '../components/ui/Icons.jsx';
import styles from './ClientsPage.module.css';

const SCOPES = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'ending', label: 'Vencendo' },
  { key: 'churn', label: 'Churn' },
  { key: 'squad', label: 'Com squad' },
];

export default function ClientsPage() {
  const { clients, squads, loading, error, refreshClients, setPanelHeader } =
    useOutletContext();
  const { user } = useAuth();
  const { showToast } = useToast();

  const admin = isAdminUser(user);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const today = useMemo(() => new Date(), []);

  // Contagens por scope (para exibir nos chips)
  const counts = useMemo(() => {
    const all = Array.isArray(clients) ? clients : [];
    return {
      all: all.length,
      active: all.filter((c) => c.status !== 'churn').length,
      ending: all.filter((c) => isEndingSoon(c, 30, today)).length,
      churn: all.filter((c) => c.status === 'churn').length,
      squad: all.filter((c) => c.squadId).length,
    };
  }, [clients, today]);

  // Clientes filtrados (scope + busca)
  const filtered = useMemo(() => {
    const rows = Array.isArray(clients) ? clients : [];
    const q = query.trim().toLowerCase();

    return rows.filter((c) => {
      if (scope === 'active' && c.status === 'churn') return false;
      if (scope === 'ending' && !isEndingSoon(c, 30, today)) return false;
      if (scope === 'churn' && c.status !== 'churn') return false;
      if (scope === 'squad' && !c.squadId) return false;

      if (!q) return true;
      return [c.name, c.squadName, c.gestor, c.gdvName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [clients, scope, query, today]);

  // Registra título e botão no panelHeader do AppShell
  useEffect(() => {
    const title = (
      <>
        <strong>Clientes</strong>
        <span>·</span>
        <span>
          {counts.all} {counts.all === 1 ? 'cadastrado' : 'cadastrados'} ·{' '}
          {counts.active} {counts.active === 1 ? 'ativo' : 'ativos'}
        </span>
      </>
    );

    const actions = (
      <button
        type="button"
        className={styles.headerBtn}
        onClick={() => setModalOpen(true)}
        aria-label="Novo cliente"
      >
        <PlusIcon size={14} />
        <span>Novo cliente</span>
      </button>
    );

    setPanelHeader({ title, actions });
    // Ao desmontar, o próximo componente que montar chama setPanelHeader
    // com seu próprio conteúdo. Não é preciso limpar aqui.
  }, [counts.all, counts.active, setPanelHeader]);

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const selectedClient = useMemo(
    () =>
      detailId
        ? (clients || []).find((c) => c.id === detailId) || null
        : null,
    [detailId, clients]
  );

  // Depois de criar, abre o drawer do novo cliente (espelha o real)
  const handleCreated = useCallback(
    async (client) => {
      setModalOpen(false);
      try {
        await refreshClients();
      } catch {
        /* erro de rede já tratado pelo api client */
      }
      if (client?.id) setDetailId(client.id);
      showToast(`"${client?.name || 'Cliente'}" criado.`);
    },
    [refreshClients, showToast]
  );

  // Após update inline no drawer, propaga pra lista sem fechar o drawer
  const handleUpdated = useCallback(
    async (_updated) => {
      try {
        await refreshClients();
      } catch {
        /* ignore */
      }
    },
    [refreshClients]
  );

  const handleDeleted = useCallback(
    async (_id) => {
      setDetailId(null);
      try {
        await refreshClients();
      } catch {
        /* ignore */
      }
    },
    [refreshClients]
  );

  // --- render ---

  if (loading && (!clients || clients.length === 0)) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>Carregando clientes…</div>
      </div>
    );
  }

  if (error && (!clients || clients.length === 0)) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          {error.message || 'Erro ao carregar clientes.'}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className={styles.scopeTab}
              onClick={() => refreshClients()}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.page}>
        {/* Métricas */}
        <section className={styles.metrics} aria-label="Métricas de clientes">
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Total</span>
            <strong className={styles.metricValue}>{counts.all}</strong>
            <span className={styles.metricSub}>clientes cadastrados</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Ativos</span>
            <strong className={styles.metricValue}>{counts.active}</strong>
            <span className={styles.metricSub}>em operação agora</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Vencendo</span>
            <strong
              className={styles.metricValue}
              style={{ color: counts.ending > 0 ? '#fb923c' : undefined }}
            >
              {counts.ending}
            </strong>
            <span className={styles.metricSub}>contratos em 30 dias</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Com squad</span>
            <strong className={styles.metricValue}>{counts.squad}</strong>
            <span className={styles.metricSub}>alocados a algum squad</span>
          </div>
        </section>

        {/* Ações: busca + scope tabs */}
        <section className={styles.actions} aria-label="Filtros">
          <label className={styles.searchBox}>
            <SearchIcon size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, squad ou gestor…"
              aria-label="Buscar"
            />
          </label>

          <div className={styles.scopeTabs} role="tablist">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={scope === s.key}
                className={`${styles.scopeTab} ${
                  scope === s.key ? styles.scopeTabActive : ''
                }`.trim()}
                onClick={() => setScope(s.key)}
              >
                <span>{s.label}</span>
                <span className={styles.scopeCount}>{counts[s.key]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Tabela */}
        <div className="central-clients">
          <div className="cc-hdr">
            <span />
            <span>Cliente</span>
            <span>Squad</span>
            <span>Gestor</span>
            <span>Início</span>
            <span>Fim</span>
            <span>Mensalidade</span>
            <span>Status</span>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>
                {counts.all === 0
                  ? 'Nenhum cliente cadastrado ainda'
                  : 'Nenhum cliente corresponde aos filtros'}
              </div>
              <div>
                {counts.all === 0
                  ? 'Crie o primeiro clicando em "+ Novo cliente".'
                  : 'Ajuste a busca ou escolha outra aba acima.'}
              </div>
            </div>
          ) : (
            filtered.map((c) => {
              const sc = statusClass(c, today);
              const sl = statusLabel(c, today);
              const ending = isEndingSoon(c, 30, today);

              return (
                <div
                  key={c.id}
                  className="cc-row"
                  onClick={() => openDetail(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(c.id);
                    }
                  }}
                >
                  <div
                    className={styles.avatar}
                    style={{ background: colorFromName(c.name) }}
                    aria-hidden="true"
                  >
                    {clientInitials(c.name)}
                  </div>
                  <div className={styles.cellName} title={c.name}>
                    {c.name}
                  </div>
                  <div className={styles.cellMuted} title={c.squadName || ''}>
                    {c.squadName || '—'}
                  </div>
                  <div className={styles.cellMuted} title={c.gestor || ''}>
                    {c.gestor || '—'}
                  </div>
                  <div className={styles.cellDate}>
                    {fmtDateBR(c.startDate)}
                  </div>
                  <div
                    className={`${styles.cellDate} ${
                      ending ? styles.soon : ''
                    }`.trim()}
                  >
                    {fmtDateBR(c.endDate)}
                  </div>
                  <div className={styles.cellFee}>{fmtMoney(c.fee || 0)}</div>
                  <span className={`cc-status ${sc}`}>{sl}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal "Novo cliente" */}
      {modalOpen && (
        <ClientFormModal
          mode="create"
          squads={squads || []}
          onClose={() => setModalOpen(false)}
          onSaved={handleCreated}
        />
      )}

      {/* Drawer de detalhe */}
      {selectedClient && (
        <ClientDetailDrawer
          client={selectedClient}
          squads={squads || []}
          canDelete={admin}
          onClose={closeDetail}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
