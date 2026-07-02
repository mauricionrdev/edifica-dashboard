import { useEffect, useMemo, useState } from 'react';
import { getTrafficManagement } from '../../api/metrics.js';
import { ChartColumnIcon, SearchIcon, ShieldIcon, TargetIcon, TrendingUpIcon, TrophyIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import { MONTHS_FULL, fmtInt, fmtMoney, fmtPct } from '../../utils/format.js';
import styles from './TrafficV2Page.module.css';
import V2RouteNav from './V2RouteNav.jsx';

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function referenceDate(period) {
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}-15`;
}

function periodValue(period) {
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

function compactName(name = '') {
  return String(name || '').replace(/^gestor\s+/i, '').trim() || 'Sem gestor';
}

function fmtIntSafe(value) {
  const number = Number(value) || 0;
  return number > 0 ? fmtInt(number) : '0';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function clientName(row) {
  return String(row?.client?.name || 'Cliente sem nome').trim();
}

function clientKey(row) {
  return String(row?.client?.id || row?.client?.clientId || clientName(row));
}

function clientSquad(row) {
  return String(row?.client?.squadName || 'Sem squad').trim();
}

function clientManager(row) {
  return compactName(row?.client?.gestor || row?.client?.trafficManager || row?.client?.traffic_manager || '');
}

function resultTone(percent, target) {
  return Number(percent) >= Number(target) ? styles.goodText : styles.dangerText;
}

function clientPriorityLabel(priority) {
  const value = Number(priority) || 0;
  if (value <= 0) return 'Estável';
  return `${value} ${value === 1 ? 'ponto' : 'pontos'}`;
}

function metricValue(row, key) {
  return Number(row?.metrics?.[key]) || 0;
}

function buildManagerResult(summary) {
  const portfolio = Number(summary?.portfolio) || 0;
  const projected = Number(summary?.projectedHit) || 0;
  if (!portfolio) return 0;
  return (projected / portfolio) * 100;
}

export default function TrafficV2Page() {
  const periodOptions = useMemo(() => buildPeriodOptions(new Date(), 14), []);
  const [period, setPeriod] = useState(currentPeriod);
  const [managerFilter, setManagerFilter] = useState('');
  const [query, setQuery] = useState('');
  const [selectedClientKey, setSelectedClientKey] = useState('');
  const [payload, setPayload] = useState({ managers: [], clients: [], ranking: [], summary: {}, targetPercent: 80 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTraffic() {
      setLoading(true);
      setError(null);
      try {
        const data = await getTrafficManagement({ date: referenceDate(period), gestor: managerFilter });
        if (!cancelled) setPayload(data || {});
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTraffic();

    return () => {
      cancelled = true;
    };
  }, [managerFilter, period.month, period.year]);

  const managers = Array.isArray(payload.managers) ? payload.managers : [];
  const ranking = Array.isArray(payload.ranking) ? payload.ranking : [];
  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  const activeTarget = Number(payload.targetPercent) || 80;
  const selectedPeriod = periodOptions.find((option) => option.value === periodValue(period));
  const selectedManagerName = managerFilter ? compactName(managerFilter) : 'Todos os gestores';
  const managerResultPercent = buildManagerResult(payload.summary);

  const filteredClients = useMemo(() => {
    const clean = normalizeText(query);
    return clients
      .filter((row) => {
        if (!clean) return true;
        const haystack = normalizeText([
          clientName(row),
          clientSquad(row),
          clientManager(row),
        ].join(' '));
        return haystack.includes(clean);
      })
      .sort((a, b) => (Number(b?.priority) || 0) - (Number(a?.priority) || 0) || clientName(a).localeCompare(clientName(b), 'pt-BR'));
  }, [clients, query]);

  const criticalClients = filteredClients.filter((row) => Number(row?.priority) > 0).length;
  const selectedClient = useMemo(() => {
    if (!filteredClients.length) return null;
    if (!selectedClientKey) return filteredClients[0];
    return filteredClients.find((row) => clientKey(row) === selectedClientKey) || filteredClients[0];
  }, [filteredClients, selectedClientKey]);

  return (
    <main className={styles.page}>
      <V2RouteNav currentKey="traffic" />
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <TrendingUpIcon size={20} />
        </div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Gestão de Tráfego V2 · rota paralela</p>
          <h1>Leitura segura dos dados semanais de tráfego</h1>
          <p>
            Tela interna, somente leitura e fora da sidebar. Ela consulta apenas <strong>GET /api/metrics/traffic-management</strong>, não salva meta, não cria lançamento e não substitui <strong>/gestao-trafego</strong>.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros de tráfego">
        <label className={styles.fieldGroup}>
          <span>Período</span>
          <select
            value={periodValue(period)}
            onChange={(event) => {
              const option = periodOptions.find((item) => item.value === event.target.value);
              if (option) setPeriod({ year: option.year, month: option.month });
            }}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.fieldGroup}>
          <span>Gestor</span>
          <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
            <option value="">Todos os gestores</option>
            {managers.map((manager) => (
              <option key={manager.name} value={manager.name}>{compactName(manager.name)}</option>
            ))}
          </select>
        </label>
        <label className={styles.searchBox}>
          <SearchIcon size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, squad ou gestor" />
        </label>
      </section>

      {error ? <section className={styles.stateBox}>Não foi possível carregar Gestão de Tráfego. Valide a API antes de migrar a rota oficial.</section> : null}

      <section className={styles.managerCard} aria-label="Gestor selecionado">
        <div>
          <span className={styles.eyebrow}>Gestor selecionado</span>
          <h2>{selectedManagerName}</h2>
          <p>{selectedPeriod?.label || `${MONTHS_FULL[period.month]} de ${period.year}`} · priorização por CPL, projeção de leads e ICP.</p>
        </div>
        <div className={styles.managerStats}>
          <article>
            <span>Carteira</span>
            <strong>{fmtIntSafe(payload.summary?.portfolio)}</strong>
          </article>
          <article>
            <span>Projetados</span>
            <strong>{fmtIntSafe(payload.summary?.projectedHit)}</strong>
          </article>
          <article>
            <span>Atenção</span>
            <strong>{fmtIntSafe(payload.summary?.critical)}</strong>
          </article>
          <article>
            <span>Resultado</span>
            <strong className={resultTone(managerResultPercent, activeTarget)}>{fmtPct(managerResultPercent)}</strong>
          </article>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Resumo de tráfego">
        <article className={styles.metricCard}>
          <UsersIcon size={16} />
          <span>Carteira</span>
          <strong>{fmtIntSafe(payload.summary?.portfolio)}</strong>
        </article>
        <article className={styles.metricCard}>
          <TargetIcon size={16} />
          <span>Projetados para meta</span>
          <strong>{fmtIntSafe(payload.summary?.projectedHit)}</strong>
        </article>
        <article className={styles.metricCard}>
          <ChartColumnIcon size={16} />
          <span>Clientes em atenção</span>
          <strong>{fmtIntSafe(payload.summary?.critical || criticalClients)}</strong>
        </article>
        <article className={styles.metricCard}>
          <TrophyIcon size={16} />
          <span>Meta do ranking</span>
          <strong>{fmtPct(activeTarget)}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Ranking de gestores</h2>
              <p>Leitura do ranking atual sem salvar meta e sem alterar configuração.</p>
            </div>
            <span className={styles.readOnly}>Somente leitura</span>
          </div>
          <div className={styles.rankingRows}>
            {ranking.map((row) => {
              const percent = Number(row?.resultPercent) || 0;
              return (
                <button
                  key={row.name || row.position}
                  type="button"
                  className={`${styles.rankingRow} ${managerFilter === row.name ? styles.rankingRowActive : ''}`.trim()}
                  onClick={() => setManagerFilter(row.name || '')}
                >
                  <strong>{String(row.position || 0).padStart(2, '0')}</strong>
                  <span>
                    <b>{compactName(row.name)}</b>
                    <small>{fmtIntSafe(row.portfolio)} clientes na carteira</small>
                  </span>
                  <em className={resultTone(percent, activeTarget)}>{fmtPct(percent)}</em>
                  <i aria-hidden="true"><b style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></i>
                </button>
              );
            })}
            {!ranking.length ? <div className={styles.stateText}>{loading ? 'Carregando ranking...' : 'Nenhum gestor encontrado neste período.'}</div> : null}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Validação da rota</h2>
              <p>Esta V2 serve para comparar leitura antes de qualquer troca da rota oficial.</p>
            </div>
            <ShieldIcon size={17} />
          </div>
          <div className={styles.guardList}>
            <span>Não altera banco</span>
            <span>Não salva meta</span>
            <span>Não cria lançamento</span>
            <span>Não substitui /gestao-trafego</span>
          </div>
        </article>
      </section>

      <section className={styles.clientGrid}>
        <article className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>Clientes priorizados</h2>
              <p>{loading ? 'Carregando dados...' : `${filteredClients.length} cliente${filteredClients.length === 1 ? '' : 's'} nesta visão`}</p>
            </div>
            <span className={styles.readOnly}>Dados semanais existentes</span>
          </div>

          {!error && !loading && !filteredClients.length ? <div className={styles.stateBox}>Nenhum cliente encontrado com os filtros atuais.</div> : null}

          {!error && filteredClients.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Gestor</th>
                    <th>Squad</th>
                    <th>Atenção</th>
                    <th>Investimento</th>
                    <th>CPL</th>
                    <th>Leads</th>
                    <th>ICP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.slice(0, 80).map((row) => {
                    const key = clientKey(row);
                    const active = selectedClient ? clientKey(selectedClient) === key : false;
                    return (
                      <tr
                        key={key}
                        className={active ? styles.tableRowActive : ''}
                        onClick={() => setSelectedClientKey(key)}
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedClientKey(key); }}
                      >
                        <td>
                          <div className={styles.clientCell}>
                            <span className={styles.avatar}>{clientName(row).slice(0, 2).toUpperCase()}</span>
                            <div>
                              <strong>{clientName(row)}</strong>
                              <small>{row?.client?.id ? `ID ${row.client.id}` : 'Sem ID'}</small>
                            </div>
                          </div>
                        </td>
                        <td>{clientManager(row)}</td>
                        <td>{clientSquad(row)}</td>
                        <td><span className={`${styles.priorityPill} ${Number(row?.priority) > 0 ? styles.priorityAlert : styles.priorityStable}`}>{clientPriorityLabel(row?.priority)}</span></td>
                        <td className={styles.money}>{metricValue(row, 'investimento') > 0 ? fmtMoney(metricValue(row, 'investimento')) : '—'}</td>
                        <td className={styles.money}>{metricValue(row, 'currentCpl') > 0 ? fmtMoney(metricValue(row, 'currentCpl')) : '—'}</td>
                        <td>{fmtIntSafe(metricValue(row, 'leadsCurrent'))}</td>
                        <td>{metricValue(row, 'icpPercent') > 0 ? fmtPct(metricValue(row, 'icpPercent')) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredClients.length > 80 ? <p className={styles.limitNote}>Exibindo os primeiros 80 registros para manter a validação leve.</p> : null}
            </div>
          ) : null}
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{selectedClient ? clientName(selectedClient) : 'Cliente selecionado'}</h2>
              <p>Detalhe somente leitura para validar priorização sem abrir edição.</p>
            </div>
            <span className={styles.readOnly}>Sem escrita</span>
          </div>
          {selectedClient ? (
            <div className={styles.detailBody}>
              <div className={styles.detailGrid}>
                <div><span>Gestor</span><strong>{clientManager(selectedClient)}</strong></div>
                <div><span>Squad</span><strong>{clientSquad(selectedClient)}</strong></div>
                <div><span>Investimento</span><strong>{metricValue(selectedClient, 'investimento') > 0 ? fmtMoney(metricValue(selectedClient, 'investimento')) : '—'}</strong></div>
                <div><span>CPL atual</span><strong>{metricValue(selectedClient, 'currentCpl') > 0 ? fmtMoney(metricValue(selectedClient, 'currentCpl')) : '—'}</strong></div>
                <div><span>Leads atuais</span><strong>{fmtIntSafe(metricValue(selectedClient, 'leadsCurrent'))}</strong></div>
                <div><span>ICP</span><strong>{metricValue(selectedClient, 'icpPercent') > 0 ? fmtPct(metricValue(selectedClient, 'icpPercent')) : '—'}</strong></div>
              </div>
              <div className={styles.guardList}>
                <span>Prioridade: {clientPriorityLabel(selectedClient?.priority)}</span>
                <span>Origem: GET /api/metrics/traffic-management</span>
              </div>
            </div>
          ) : <div className={styles.stateBox}>Selecione um cliente para validar o detalhe.</div>}
        </article>
      </section>
    </main>
  );
}
