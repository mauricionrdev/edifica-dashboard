import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Crown,
  Filter,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react';
import { useNewData } from '../data/NewDataContext.jsx';
import {
  CLIENT_STATUS_OPTIONS,
  normalizeClientStatus,
} from '../../utils/clientStatus.js';
import { fmtMoney } from '../../utils/format.js';

const INTEGER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function initials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CL';
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function shortDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function statusMeta(status) {
  const normalized = normalizeClientStatus(status);
  const option = CLIENT_STATUS_OPTIONS.find((item) => item.value === normalized);
  return { value: normalized, label: option?.label || 'Ativo' };
}

export default function NewClientsPage() {
  const { clients, squads, loading, error, refresh } = useNewData();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [squadId, setSquadId] = useState('');

  const squadMap = useMemo(
    () => new Map((squads || []).map((squad) => [squad.id, squad.name])),
    [squads]
  );

  const rows = useMemo(() => {
    const needle = normalizedText(query);
    return (Array.isArray(clients) ? clients : [])
      .filter((client) => {
        if (status && normalizeClientStatus(client.status) !== status) return false;
        if (squadId && (client.squadId || client.squad_id) !== squadId) return false;
        if (!needle) return true;
        return [
          client.name,
          client.gdvName,
          client.gdv,
          client.gestor,
          squadMap.get(client.squadId || client.squad_id),
        ].some((value) => normalizedText(value).includes(needle));
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }, [clients, query, squadId, squadMap, status]);

  const activeCount = rows.filter((client) => normalizeClientStatus(client.status) === 'active').length;
  const premiumCount = rows.filter((client) => Boolean(client.isPremium ?? client.is_premium)).length;
  const totalMrr = rows
    .filter((client) => ['active', 'onboarding', 'rampagem_comercial'].includes(normalizeClientStatus(client.status)))
    .reduce((sum, client) => sum + (Number(client.fee) || 0), 0);

  return (
    <div className="new-clients">
      <section className="new-client-summary" aria-label="Resumo da carteira">
        <div>
          <span>Clientes encontrados</span>
          <strong>{INTEGER.format(rows.length)}</strong>
        </div>
        <div>
          <span>Ativos</span>
          <strong>{INTEGER.format(activeCount)}</strong>
        </div>
        <div>
          <span>Premium</span>
          <strong>{INTEGER.format(premiumCount)}</strong>
        </div>
        <div>
          <span>MRR no recorte</span>
          <strong>{fmtMoney(totalMrr)}</strong>
        </div>
      </section>

      <section className="new-panel new-clients__panel">
        <header className="new-client-toolbar">
          <label className="new-field new-field--search">
            <Search size={17} />
            <span className="sr-only">Buscar clientes</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente, responsável ou squad"
            />
            <kbd>⌘ K</kbd>
          </label>

          <div className="new-client-toolbar__filters">
            <label className="new-field new-field--select">
              <Filter size={16} />
              <span className="sr-only">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos os status</option>
                {CLIENT_STATUS_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="new-field new-field--select">
              <UsersRound size={16} />
              <span className="sr-only">Squad</span>
              <select value={squadId} onChange={(event) => setSquadId(event.target.value)}>
                <option value="">Todos os squads</option>
                {squads.map((squad) => (
                  <option value={squad.id} key={squad.id}>{squad.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="new-icon-button new-icon-button--bordered" onClick={refresh} aria-label="Atualizar clientes">
              <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
            </button>
          </div>
        </header>

        {error ? (
          <div className="new-table-message is-error">
            <strong>Falha ao carregar a carteira.</strong>
            <span>{error.message}</span>
          </div>
        ) : null}

        <div className="new-table-wrap">
          <table className="new-table">
            <thead>
              <tr>
                <th><button type="button">Cliente <ArrowDownUp size={13} /></button></th>
                <th>Status</th>
                <th>Squad</th>
                <th>Responsáveis</th>
                <th>Início</th>
                <th className="is-numeric">Fee / MRR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => {
                const clientStatus = statusMeta(client.status);
                const isPremium = Boolean(client.isPremium ?? client.is_premium);
                const gdv = client.gdvName || client.gdv || 'Sem GDV';
                const gestor = client.gestor || 'Sem gestor';
                return (
                  <tr key={client.id}>
                    <td>
                      <div className="new-client-cell">
                        <span className="new-client-avatar">{initials(client.name)}</span>
                        <div>
                          <strong>
                            {client.name || 'Cliente sem nome'}
                            {isPremium ? <Crown size={13} aria-label="Cliente Premium" /> : null}
                          </strong>
                          <span>{client.contractType === 'tcv' ? 'Contrato TCV' : 'Contrato recorrente'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`new-badge status-${clientStatus.value}`}>
                        <i />{clientStatus.label}
                      </span>
                    </td>
                    <td>{squadMap.get(client.squadId || client.squad_id) || client.squadName || '—'}</td>
                    <td>
                      <div className="new-responsibles">
                        <strong>{gestor}</strong>
                        <span>{gdv}</span>
                      </div>
                    </td>
                    <td>{shortDate(client.startDate)}</td>
                    <td className="is-numeric"><strong>{fmtMoney(client.fee || 0)}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && !rows.length ? (
          <div className="new-table-message">
            <span className="new-table-message__icon"><Search size={20} /></span>
            <strong>Nenhum cliente neste recorte</strong>
            <span>Ajuste a busca ou os filtros para ampliar a carteira.</span>
          </div>
        ) : null}

        <footer className="new-table-footer">
          <span>Exibindo {INTEGER.format(rows.length)} de {INTEGER.format(clients.length)} clientes</span>
          <span>Dados sincronizados com a API</span>
        </footer>
      </section>
    </div>
  );
}
