import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { useNewData } from '../data/NewDataContext.jsx';
import { computeCentralMetrics } from '../../utils/centralMetrics.js';
import { CLIENT_STATUS, normalizeClientStatus } from '../../utils/clientStatus.js';
import { fmtMoney, MONTHS_FULL } from '../../utils/format.js';

const INTEGER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function buildMonthOptions() {
  const today = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    return {
      value: `${date.getFullYear()}-${date.getMonth()}`,
      year: date.getFullYear(),
      month: date.getMonth(),
      label: `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`,
    };
  });
}

function clientMonthKey(client, field) {
  const raw = client?.[field];
  if (!raw) return '';
  const date = new Date(`${String(raw).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function statusLabel(status) {
  const labels = {
    [CLIENT_STATUS.ACTIVE]: 'Ativo',
    [CLIENT_STATUS.ONBOARDING]: 'Onboarding',
    [CLIENT_STATUS.RAMPAGE]: 'Rampagem',
    [CLIENT_STATUS.PAUSED]: 'Pausado',
    [CLIENT_STATUS.CHURN]: 'Churn',
    [CLIENT_STATUS.FINISHED]: 'Finalizado',
  };
  return labels[normalizeClientStatus(status)] || 'Ativo';
}

function DashboardSkeleton() {
  return (
    <div className="new-dashboard" aria-label="Carregando dashboard">
      <div className="new-toolbar new-skeleton new-skeleton--toolbar" />
      <div className="new-metric-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="new-skeleton new-skeleton--metric" key={index} />
        ))}
      </div>
      <div className="new-dashboard-grid">
        <div className="new-skeleton new-skeleton--panel" />
        <div className="new-skeleton new-skeleton--panel" />
      </div>
    </div>
  );
}

export default function NewDashboardPage() {
  const { clients, squads, loading, error, refresh, updatedAt } = useNewData();
  const monthOptions = useMemo(buildMonthOptions, []);
  const [periodValue, setPeriodValue] = useState(monthOptions[0].value);
  const [squadId, setSquadId] = useState('');

  const period = useMemo(
    () => monthOptions.find((item) => item.value === periodValue) || monthOptions[0],
    [monthOptions, periodValue]
  );

  const visibleClients = useMemo(
    () => (Array.isArray(clients) ? clients : []).filter((client) => (
      !squadId || (client.squadId || client.squad_id) === squadId
    )),
    [clients, squadId]
  );

  const metrics = useMemo(
    () => computeCentralMetrics(visibleClients, period.year, period.month),
    [period, visibleClients]
  );

  const previousPeriod = useMemo(() => {
    const date = new Date(period.year, period.month - 1, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  }, [period]);

  const previousMetrics = useMemo(
    () => computeCentralMetrics(visibleClients, previousPeriod.year, previousPeriod.month),
    [previousPeriod, visibleClients]
  );

  const statusRows = useMemo(() => {
    const order = [
      CLIENT_STATUS.ACTIVE,
      CLIENT_STATUS.ONBOARDING,
      CLIENT_STATUS.RAMPAGE,
      CLIENT_STATUS.PAUSED,
      CLIENT_STATUS.CHURN,
      CLIENT_STATUS.FINISHED,
    ];
    return order.map((status) => ({
      status,
      label: statusLabel(status),
      count: visibleClients.filter((client) => normalizeClientStatus(client.status) === status).length,
    }));
  }, [visibleClients]);

  const squadRows = useMemo(() => {
    const source = Array.isArray(squads) ? squads : [];
    return source
      .map((squad) => {
        const scoped = visibleClients.filter(
          (client) => (client.squadId || client.squad_id) === squad.id
        );
        const squadMetrics = computeCentralMetrics(scoped, period.year, period.month);
        return {
          id: squad.id,
          name: squad.name || 'Squad sem nome',
          active: squadMetrics.active,
          mrr: squadMetrics.mrr,
        };
      })
      .filter((row) => row.active > 0 || row.mrr > 0)
      .sort((a, b) => b.mrr - a.mrr);
  }, [period, squads, visibleClients]);

  const maxSquadMrr = Math.max(...squadRows.map((row) => row.mrr), 1);

  const movements = useMemo(() => {
    const key = `${period.year}-${period.month}`;
    return visibleClients
      .flatMap((client) => {
        const events = [];
        if (clientMonthKey(client, 'startDate') === key) {
          events.push({
            id: `${client.id}-entry`,
            client: client.name,
            label: 'Entrada na carteira',
            value: fmtMoney(client.fee || 0),
            tone: 'positive',
          });
        }
        const churnKey = client.churnYear && client.churnMonth
          ? `${Number(client.churnYear)}-${Number(client.churnMonth) - 1}`
          : clientMonthKey(client, 'churnDate');
        if (churnKey === key) {
          events.push({
            id: `${client.id}-churn`,
            client: client.name,
            label: 'Churn no período',
            value: fmtMoney(client.fee || 0),
            tone: 'negative',
          });
        }
        return events;
      })
      .slice(0, 6);
  }, [period, visibleClients]);

  const mrrDelta = metrics.mrr - previousMetrics.mrr;
  const totalStatus = statusRows.reduce((sum, row) => sum + row.count, 0) || 1;

  if (loading && !clients.length) return <DashboardSkeleton />;

  if (error && !clients.length) {
    return (
      <section className="new-empty-state">
        <span><ShieldCheck size={22} /></span>
        <h2>Não foi possível carregar a visão executiva</h2>
        <p>{error.message || 'A API não respondeu. Nenhum dado alternativo foi exibido.'}</p>
        <button type="button" className="new-button new-button--primary" onClick={refresh}>
          <RefreshCw size={16} /> Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <div className="new-dashboard">
      <section className="new-toolbar" aria-label="Filtros do dashboard">
        <div className="new-toolbar__context">
          <span className="new-live-dot" />
          <div>
            <strong>Dados operacionais</strong>
            <span>
              {updatedAt
                ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Conectado à base real'}
            </span>
          </div>
        </div>
        <div className="new-toolbar__controls">
          <label className="new-field new-field--select">
            <CalendarDays size={16} />
            <span className="sr-only">Período</span>
            <select value={periodValue} onChange={(event) => setPeriodValue(event.target.value)}>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="new-field new-field--select">
            <UsersRound size={16} />
            <span className="sr-only">Squad</span>
            <select value={squadId} onChange={(event) => setSquadId(event.target.value)}>
              <option value="">Todos os squads</option>
              {squads.map((squad) => (
                <option key={squad.id} value={squad.id}>{squad.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="new-icon-button new-icon-button--bordered" onClick={refresh} aria-label="Atualizar">
            <RefreshCw size={16} />
          </button>
        </div>
      </section>

      <section className="new-metric-grid" aria-label="Indicadores principais">
        <article className="new-metric new-metric--hero">
          <div className="new-metric__head">
            <span>MRR da carteira</span>
            <CircleDollarSign size={18} />
          </div>
          <strong>{fmtMoney(metrics.mrr)}</strong>
          <p className={mrrDelta >= 0 ? 'is-positive' : 'is-negative'}>
            {mrrDelta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {mrrDelta >= 0 ? '+' : '−'}{fmtMoney(Math.abs(mrrDelta))} contra o mês anterior
          </p>
        </article>

        <article className="new-metric">
          <div className="new-metric__head">
            <span>Clientes ativos</span>
            <Building2 size={18} />
          </div>
          <strong>{INTEGER.format(metrics.active || 0)}</strong>
          <p>{INTEGER.format(metrics.total || 0)} clientes na carteira do período</p>
        </article>

        <article className="new-metric">
          <div className="new-metric__head">
            <span>Novas entradas</span>
            <Sparkles size={18} />
          </div>
          <strong>{INTEGER.format(metrics.newCnt || 0)}</strong>
          <p>{fmtMoney(metrics.revenueNew)} de nova receita</p>
        </article>

        <article className={`new-metric ${metrics.churnRate > 5 ? 'new-metric--risk' : ''}`}>
          <div className="new-metric__head">
            <span>Churn da carteira</span>
            <TrendingDown size={18} />
          </div>
          <strong>{PERCENT.format(metrics.churnRate || 0)}%</strong>
          <p>
            {INTEGER.format(metrics.churnedPeriodCnt || 0)}{' '}
            {Number(metrics.churnedPeriodCnt || 0) === 1 ? 'cancelamento' : 'cancelamentos'} no período
          </p>
        </article>
      </section>

      <section className="new-dashboard-grid">
        <article className="new-panel new-panel--wide">
          <header className="new-panel__header">
            <div>
              <span className="new-eyebrow">Distribuição de receita</span>
              <h2>MRR por squad</h2>
            </div>
            <span className="new-panel__total">{fmtMoney(metrics.mrr)}</span>
          </header>

          <div className="new-squad-list">
            {squadRows.length ? squadRows.map((row, index) => (
              <div className="new-squad-row" key={row.id}>
                <span className="new-squad-row__rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="new-squad-row__identity">
                  <span>{row.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      {INTEGER.format(row.active)} {row.active === 1 ? 'cliente ativo' : 'clientes ativos'}
                    </small>
                  </div>
                </div>
                <div className="new-squad-row__bar">
                  <span style={{ width: `${Math.max(3, (row.mrr / maxSquadMrr) * 100)}%` }} />
                </div>
                <strong className="new-squad-row__value">{fmtMoney(row.mrr)}</strong>
              </div>
            )) : (
              <div className="new-inline-empty">Nenhum squad com receita neste recorte.</div>
            )}
          </div>
        </article>

        <article className="new-panel">
          <header className="new-panel__header">
            <div>
              <span className="new-eyebrow">Saúde da base</span>
              <h2>Carteira por estágio</h2>
            </div>
          </header>
          <div className="new-status-bar" aria-hidden="true">
            {statusRows.filter((row) => row.count > 0).map((row) => (
              <span
                key={row.status}
                className={`status-${row.status}`}
                style={{ width: `${(row.count / totalStatus) * 100}%` }}
              />
            ))}
          </div>
          <div className="new-status-list">
            {statusRows.map((row) => (
              <div key={row.status}>
                <span><i className={`status-${row.status}`} />{row.label}</span>
                <strong>{INTEGER.format(row.count)}</strong>
              </div>
            ))}
          </div>
          <Link to="/new/clientes" className="new-text-link">
            Explorar carteira <ArrowRight size={15} />
          </Link>
        </article>
      </section>

      <section className="new-panel">
        <header className="new-panel__header new-panel__header--line">
          <div>
            <span className="new-eyebrow">Movimentações do período</span>
            <h2>O que mudou na carteira</h2>
          </div>
          <span className="new-panel__hint">Entradas e cancelamentos confirmados</span>
        </header>
        <div className="new-movement-list">
          {movements.length ? movements.map((item) => (
            <div className="new-movement" key={item.id}>
              <span className={`new-movement__icon is-${item.tone}`}>
                {item.tone === 'positive' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              </span>
              <div>
                <strong>{item.client || 'Cliente sem nome'}</strong>
                <span>{item.label}</span>
              </div>
              <strong className={`is-${item.tone}`}>{item.value}</strong>
            </div>
          )) : (
            <div className="new-inline-empty">Nenhuma entrada ou churn registrado neste período.</div>
          )}
        </div>
      </section>
    </div>
  );
}
