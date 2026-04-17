// ================================================================
//  CentralPage
//  Visual portado do DashboardView do frontend real:
//    - 5 cards métrica (Ativos · MRR · Receita Nova · Ticket · Churn)
//      em grid 3 colunas, com delta no topline e gauge opcional no pé.
//    - Card "chart": barras dos últimos 6 meses com tooltip.
//    - Card "alerta": contratos vencendo em 30 dias.
//
//  Cálculos: utils/centralMetrics.js (computeCentralMetrics,
//  buildBarChartData, clientsEndingSoon).
//
//  PanelHeader: título "Central · Abril 2026" + seletor de período
//  como action.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  buildBarChartData,
  clientsEndingSoon,
  computeCentralMetrics,
} from '../utils/centralMetrics.js';
import {
  MONTHS,
  MONTHS_FULL,
  fmtMoney,
  fmtPct,
} from '../utils/format.js';
import styles from './CentralPage.module.css';

function buildPeriodOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    let y = now.getFullYear();
    let m = now.getMonth() - i;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    out.push({ y, m, label: `${MONTHS_FULL[m]} ${y}` });
  }
  return out;
}

export default function CentralPage() {
  const { clients, loading, error, refreshClients, setPanelHeader } =
    useOutletContext();

  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(() => ({
    y: now.getFullYear(),
    m: now.getMonth(),
  }));

  const periodOptions = useMemo(buildPeriodOptions, []);
  const isNow =
    period.y === now.getFullYear() && period.m === now.getMonth();

  const metrics = useMemo(
    () => computeCentralMetrics(clients, period.y, period.m),
    [clients, period]
  );

  const prevMonth = useMemo(() => {
    const m = period.m > 0 ? period.m - 1 : 11;
    const y = period.m > 0 ? period.y : period.y - 1;
    return { y, m };
  }, [period]);

  const prevMetrics = useMemo(
    () => computeCentralMetrics(clients, prevMonth.y, prevMonth.m),
    [clients, prevMonth]
  );

  const mrrDelta =
    prevMetrics.mrr > 0
      ? ((metrics.mrr - prevMetrics.mrr) / prevMetrics.mrr) * 100
      : null;

  const ticketMedio =
    metrics.active > 0 ? metrics.mrr / metrics.active : 0;

  const bars = useMemo(
    () => buildBarChartData(clients, period.y, period.m, 6),
    [clients, period]
  );
  const maxBar = Math.max(...bars.map((b) => b.cnt), 1);

  const ending = useMemo(
    () => clientsEndingSoon(clients, 30, now),
    [clients, now]
  );

  const activePct =
    metrics.total > 0
      ? Math.min((metrics.active / metrics.total) * 100, 100)
      : 0;

  // Registra título + seletor de período no panelHeader do AppShell.
  useEffect(() => {
    const periodValue = `${period.y}-${period.m}`;
    const handleChange = (e) => {
      const [y, m] = e.target.value.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m)) setPeriod({ y, m });
    };

    const title = (
      <>
        <strong>Central</strong>
        <span>·</span>
        <span>{`${MONTHS_FULL[period.m]} ${period.y}`}</span>
      </>
    );

    const actions = (
      <div className={styles.periodControl}>
        {!isNow && (
          <span className={styles.historyChip}>Histórico</span>
        )}
        <select
          className={styles.linearSelect}
          value={periodValue}
          onChange={handleChange}
          aria-label="Período do dashboard"
        >
          {periodOptions.map((p) => (
            <option key={`${p.y}-${p.m}`} value={`${p.y}-${p.m}`}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    );

    setPanelHeader({ title, actions });
  }, [period, isNow, periodOptions, setPanelHeader]);

  // --- Estados ---
  if (loading && clients.length === 0) {
    return (
      <div className="content">
        <div className={styles.state}>Carregando dados…</div>
      </div>
    );
  }

  if (error && clients.length === 0) {
    return (
      <div className="content">
        <div className={`${styles.state} ${styles.error}`}>
          <div>{error.message || 'Erro ao carregar clientes'}</div>
          <button
            type="button"
            className={styles.retry}
            onClick={() => refreshClients()}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className={`${styles.workspace} ${styles.linearCardsDashboard}`}>
        {/* --- Linha 1: Ativos · MRR · Receita Nova --- */}
        <section className={styles.cardGrid} aria-label="Indicadores do dashboard">
          <article className={styles.metricCard}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Clientes Ativos</span>
            </div>
            <strong className={styles.metricValue}>{metrics.active}</strong>
            <span className={styles.metricSub}>
              de <b>{metrics.total}</b> cadastrados
            </span>
            <div className={styles.gauge}>
              <span style={{ width: `${activePct}%` }} />
            </div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>MRR Atual</span>
              {mrrDelta === null ? (
                <span className={`${styles.delta} ${styles.delta_nd}`}>
                  Primeiro mês
                </span>
              ) : (
                <span
                  className={`${styles.delta} ${
                    mrrDelta >= 0 ? styles.delta_pos : styles.delta_neg
                  }`}
                >
                  {mrrDelta >= 0 ? '▲' : '▼'}{' '}
                  {Math.abs(mrrDelta).toFixed(1)}%
                </span>
              )}
            </div>
            <strong className={styles.metricValue}>
              {fmtMoney(metrics.mrr)}
            </strong>
            <span className={styles.metricSub}>
              Receita Mensal Recorrente
            </span>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>
                Receita Nova Adicionada
              </span>
            </div>
            <strong className={styles.metricValue}>
              {fmtMoney(metrics.revenueNew)}
            </strong>
            <span className={styles.metricSub}>
              <b>{metrics.newCnt}</b> novos em {MONTHS[period.m]}
            </span>
          </article>
        </section>

        {/* --- Linha 2: Ticket · Receita Perdida · Churn --- */}
        <section className={styles.cardGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Ticket Médio</span>
            </div>
            <strong className={styles.metricValue}>
              {ticketMedio > 0 ? fmtMoney(ticketMedio) : '—'}
            </strong>
            <span className={styles.metricSub}>
              MRR ÷ clientes ativos
            </span>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>
                Receita Perdida no Mês
              </span>
            </div>
            <strong className={styles.metricValue}>
              {fmtMoney(metrics.revLost)}
            </strong>
            <span className={styles.metricSub}>
              <b>{metrics.churnedPeriodCnt}</b> churns em{' '}
              {MONTHS[period.m]}
            </span>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Taxa de Churn</span>
            </div>
            <strong className={styles.metricValue}>
              {metrics.churnRate > 0 ? fmtPct(metrics.churnRate) : '0%'}
            </strong>
            <span className={styles.metricSub}>
              Cancelamentos / total
            </span>
            <div className={`${styles.gauge} ${styles.gauge_red}`}>
              <span
                style={{ width: `${Math.min(metrics.churnRate, 100)}%` }}
              />
            </div>
          </article>
        </section>

        {/* --- Chart de barras --- */}
        <section className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Atividade</span>
              <h3>Entradas de Clientes por Mês</h3>
            </div>
            <p>Novos clientes nos últimos 6 meses</p>
          </div>

          <div className={styles.chart}>
            {bars.map((b) => {
              const h =
                b.cnt > 0
                  ? Math.max(Math.round((b.cnt / maxBar) * 100), 8)
                  : 0;
              return (
                <div key={`${b.y}-${b.m}`} className={styles.barColumn}>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.bar} ${
                        b.isNow ? styles.barActive : ''
                      }`}
                      style={{ height: `${h}%` }}
                    >
                      <div className={styles.tooltip}>
                        <span>{`${MONTHS[b.m]}: ${b.cnt} cliente(s)`}</span>
                        <span>{`${fmtMoney(b.mrr)} MRR`}</span>
                      </div>
                    </div>
                  </div>
                  <span>{MONTHS[b.m]}</span>
                  <strong>{b.cnt}</strong>
                </div>
              );
            })}
          </div>
        </section>

        {/* --- Alerta de contratos vencendo --- */}
        {ending.length > 0 && (
          <section className={styles.alertCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span>Status</span>
                <h3>Contratos vencendo em 30 dias</h3>
              </div>
            </div>

            <div>
              {ending.map(({ client, daysLeft }) => (
                <div key={client.id} className={styles.alertRow}>
                  <span className={styles.alertName}>{client.name}</span>
                  <span className={styles.alertDate}>{client.endDate}</span>
                  <span className={styles.alertDays}>
                    {daysLeft} dia{daysLeft === 1 ? '' : 's'}
                  </span>
                  <span className={styles.alertFee}>
                    {fmtMoney(client.fee)}/mês
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
