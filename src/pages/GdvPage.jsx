// ================================================================
//  GdvPage (/gdv)
//  Central de Gestão Comercial — carteira do GDV (Luiz Kirschiner).
//
//  CONTEÚDO:
//    1. PanelHeader customizado: título + navegação de mês + tabs S1..S4
//    2. Hero "Meta GDV (70%)" com dial circular mostrando % da carteira
//       batendo meta.
//    3. Grid de 6 cards métrica agregada (Fechados, Taxa, Empate,
//       Lucro, Previstos, CPL).
//    4. Tabela "Clientes sob risco" ordenada por prioridade DESC.
//       Clicar numa linha abre o drawer do cliente na aba GDV.
//
//  BACKEND:
//    - Usa clients + squads do AppShell outlet context.
//    - Para cada cliente com `gdvName`, busca GET /metrics/:id/:periodKey
//      em paralelo via Promise.all. O resultado é cached por periodKey
//      em state; trocar de semana refaz o fetch.
//
//  Tudo é puramente de leitura (GET). Preenchimento de métricas é
//  responsabilidade da tela "Preencher Semana" (próxima rodada).
// ================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOutletContext } from 'react-router-dom';
import { getMetric } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import {
  aggregateCarteira,
  buildPeriodKey,
  calcWeek,
  currentWeek,
  getPriority,
  GDV_TARGET,
  hitRate,
  sortByPriority,
} from '../utils/gdvMetrics.js';
import {
  MONTHS,
  MONTHS_FULL,
  fmtDec,
  fmtInt,
  fmtMoney,
  fmtPct,
} from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdminUser } from '../utils/roles.js';
import { useToast } from '../context/ToastContext.jsx';
import ClientDetailDrawer from '../components/clients/ClientDetailDrawer.jsx';
import styles from './GdvPage.module.css';

// Hero dial: raio e circunferência fixos (o SVG usa 180x180)
const DIAL_R = 70;
const DIAL_C = 2 * Math.PI * DIAL_R;

export default function GdvPage() {
  const { clients, squads, loading: shellLoading, refreshClients, setPanelHeader } =
    useOutletContext();
  const { user } = useAuth();
  const { showToast } = useToast();

  const admin = isAdminUser(user);

  // --- período ---
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth()); // 0..11
  const [week, setWeek] = useState(() => currentWeek(now));
  const periodKey = useMemo(
    () => buildPeriodKey(year, month0, week),
    [year, month0, week]
  );

  // --- filtro: só clientes com gdvName ---
  const gdvClients = useMemo(() => {
    return (clients || []).filter(
      (c) => c && c.gdvName && String(c.gdvName).trim().length > 0
    );
  }, [clients]);

  // --- fetch paralelo das métricas para este periodKey ---
  // Cache por periodKey. Evita refetch ao voltar para semana já vista.
  const [metricsByKey, setMetricsByKey] = useState({});
  const [fetchingKey, setFetchingKey] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Guardamos clientIds em uma ref pra não reiniciar fetch quando só
  // a referência do array muda (ex: atualização do clients global).
  const gdvIdsKey = useMemo(
    () => gdvClients.map((c) => c.id).sort().join('|'),
    [gdvClients]
  );

  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!gdvClients.length) {
      setMetricsByKey((prev) => ({ ...prev, [periodKey]: [] }));
      return;
    }
    // Se já temos cache para este periodKey e o conjunto de IDs bate, reaproveita
    const cached = metricsByKey[periodKey];
    if (Array.isArray(cached)) {
      const cachedIds = cached.map((r) => r.clientId).sort().join('|');
      if (cachedIds === gdvIdsKey) return;
    }

    const gen = ++fetchGenRef.current;
    setFetchingKey(periodKey);
    setFetchError(null);

    Promise.all(
      gdvClients.map((c) =>
        getMetric(c.id, periodKey)
          .then((res) => ({ clientId: c.id, metric: res?.metric || null, err: null }))
          .catch((err) => ({ clientId: c.id, metric: null, err }))
      )
    )
      .then((results) => {
        if (fetchGenRef.current !== gen) return;
        const anyAuthErr = results.find(
          (r) => r.err instanceof ApiError && r.err.status === 401
        );
        if (anyAuthErr) return; // AuthContext trata

        setMetricsByKey((prev) => ({ ...prev, [periodKey]: results }));

        const fails = results.filter((r) => r.err && !(r.err instanceof ApiError && r.err.status === 404));
        if (fails.length > 0 && fails.length === results.length) {
          setFetchError(new Error('Falha ao carregar métricas da carteira.'));
        }
      })
      .finally(() => {
        if (fetchGenRef.current === gen) setFetchingKey(null);
      });
  }, [periodKey, gdvIdsKey, gdvClients, metricsByKey]);

  // --- dados derivados ---

  const currentResults = metricsByKey[periodKey] || [];
  const loadingMetrics = fetchingKey === periodKey && currentResults.length === 0;

  // Linhas { client, metric, calc, priority } para a tabela e agregação
  const rows = useMemo(() => {
    return gdvClients.map((client) => {
      const entry = currentResults.find((r) => r.clientId === client.id);
      const metric = entry?.metric || { data: {}, computed: {} };
      const calc = calcWeek(metric);
      const priority = getPriority(calc);
      return { client, metric, calc, priority };
    });
  }, [gdvClients, currentResults]);

  const agg = useMemo(() => aggregateCarteira(rows), [rows]);
  const hit = useMemo(() => hitRate(rows), [rows]);
  const sortedRows = useMemo(() => sortByPriority(rows), [rows]);

  const gdvOk = hit ? hit.pct >= GDV_TARGET : false;
  const lucroOk = agg.tLuc > 0 && agg.tCp >= agg.tLuc;
  const cplOk = agg.cpl > 0 && agg.avgMC > 0 && agg.cpl <= agg.avgMC;
  const volOk = agg.tLp > 0 && agg.tMV > 0 && agg.tLp >= agg.tMV;

  // Nome do GDV (pega do primeiro cliente — todos devem ter o mesmo nome
  // já que a carteira é do mesmo GDV. Se houver múltiplos nomes,
  // mostra o mais frequente).
  const gdvDisplayName = useMemo(() => {
    if (gdvClients.length === 0) return 'Luiz Kirschiner';
    const counts = new Map();
    for (const c of gdvClients) {
      const key = String(c.gdvName).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = 'Luiz Kirschiner';
    let max = 0;
    for (const [k, v] of counts) {
      if (v > max) {
        best = k;
        max = v;
      }
    }
    return best;
  }, [gdvClients]);

  // --- drawer state ---
  const [detailId, setDetailId] = useState(null);
  const selectedClient = useMemo(
    () => (detailId ? gdvClients.find((c) => c.id === detailId) || null : null),
    [detailId, gdvClients]
  );

  const handleUpdated = useCallback(async () => {
    try {
      await refreshClients();
    } catch {
      /* ignore */
    }
  }, [refreshClients]);

  const handleDeleted = useCallback(async () => {
    setDetailId(null);
    try {
      await refreshClients();
    } catch {
      /* ignore */
    }
  }, [refreshClients]);

  // --- navegação de período ---
  const prevMonth = useCallback(() => {
    setMonth0((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setMonth0((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  // --- PanelHeader ---
  useEffect(() => {
    const title = (
      <>
        <strong>Análises de GDV</strong>
        <span>·</span>
        <span>{gdvDisplayName}</span>
      </>
    );

    const actions = (
      <div className={styles.headerActions}>
        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={prevMonth}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <div className={styles.monthLabel}>
            {MONTHS[month0]} {year}
          </div>
          <button
            type="button"
            className={styles.navBtn}
            onClick={nextMonth}
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
        <div className={styles.weekTabs} role="tablist" aria-label="Semana">
          {[1, 2, 3, 4].map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={week === w}
              className={`${styles.weekTab} ${
                week === w ? styles.weekTabActive : ''
              }`.trim()}
              onClick={() => setWeek(w)}
            >
              S{w}
            </button>
          ))}
        </div>
        {fetchingKey === periodKey && (
          <span
            title="Carregando métricas"
            className={styles.inlineSpinner}
            aria-label="Carregando"
          />
        )}
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    gdvDisplayName,
    month0,
    year,
    week,
    periodKey,
    fetchingKey,
    prevMonth,
    nextMonth,
    setPanelHeader,
  ]);

  // --- render ---

  if (shellLoading && (!clients || clients.length === 0)) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <span className={styles.loadingSpinner} />
          <span>Carregando carteira…</span>
        </div>
      </div>
    );
  }

  if (!gdvClients.length) {
    return (
      <div className={styles.page}>
        <div className={`${styles.card} ${styles.emptyState}`}>
          <div className={styles.emptyTitle}>
            Nenhum cliente com GDV atribuído
          </div>
          <div>
            A carteira do GDV é composta pelos clientes que têm um responsável
            definido no campo <b>GDV</b>.
            <br />
            Abra um cliente em <b>/clientes</b> e preencha o campo "GDV" para
            incluí-lo na carteira.
          </div>
        </div>
      </div>
    );
  }

  // Hero dial
  const dialPct = hit?.pct ?? 0;
  const dialOffset = DIAL_C * (1 - Math.min(dialPct, 100) / 100);

  return (
    <>
      <div className={styles.page}>
        {/* HERO - Meta GDV */}
        <div
          className={`${styles.card} ${
            gdvOk ? styles.cardTeal : styles.cardRed
          } ${styles.hero}`}
        >
          <div className={styles.heroLeft}>
            <div className={styles.heroLabel}>
              <span>Meta GDV · {GDV_TARGET}%</span>
              <span className={styles.heroOperator}>
                <span className={styles.heroOperatorDot} />
                {gdvDisplayName}
              </span>
            </div>
            <h2 className={styles.heroTitle}>
              {hit ? (
                <>
                  <strong className={gdvOk ? '' : styles.below}>
                    {hit.h}/{hit.t}
                  </strong>{' '}
                  <span style={{ opacity: 0.5, fontSize: '0.7em' }}>
                    clientes
                  </span>{' '}
                  devem bater meta em {MONTHS_FULL[month0]} · S{week}
                </>
              ) : (
                <>Sem clientes na carteira</>
              )}
            </h2>
            <div className={styles.heroSubtitle}>
              {hit && hit.pct >= GDV_TARGET ? (
                <>
                  Carteira está <b>acima</b> do target de {GDV_TARGET}%. Foque
                  em ajustes finos nos clientes de prioridade média para
                  consolidar o resultado.
                </>
              ) : hit && hit.pct > 0 ? (
                <>
                  Carteira está <b>abaixo</b> do target. Faltam{' '}
                  <b>{Math.max(0, Math.ceil((GDV_TARGET / 100) * hit.t) - hit.h)}</b>{' '}
                  cliente(s) batendo meta para atingir {GDV_TARGET}%.
                </>
              ) : (
                <>
                  Ainda não há clientes batendo meta neste período. Revise as
                  metas de lucro dos clientes de alta prioridade.
                </>
              )}
            </div>
            <div
              className={`${styles.heroGaugeBar} ${
                gdvOk ? '' : styles.below
              }`.trim()}
            >
              <span style={{ width: `${Math.min(dialPct, 100)}%` }} />
            </div>
          </div>

          <div
            className={styles.heroDialWrap}
            aria-label={`${dialPct}% da carteira`}
          >
            <svg viewBox="0 0 180 180" className={styles.heroDial}>
              <circle
                cx="90"
                cy="90"
                r={DIAL_R}
                className={styles.heroDialTrack}
              />
              <circle
                cx="90"
                cy="90"
                r={DIAL_R}
                className={`${styles.heroDialFill} ${
                  gdvOk ? '' : styles.below
                }`.trim()}
                style={{
                  strokeDasharray: DIAL_C,
                  strokeDashoffset: dialOffset,
                }}
              />
            </svg>
            <div className={styles.heroDialCenter}>
              <div
                className={`${styles.heroDialValue} ${
                  gdvOk ? styles.above : dialPct > 0 ? styles.below : ''
                }`.trim()}
              >
                {dialPct}%
              </div>
              <div className={styles.heroDialMeta}>
                {gdvOk ? '✓ Acima da meta' : 'Meta ' + GDV_TARGET + '%'}
              </div>
            </div>
          </div>
        </div>

        {/* GRID DE MÉTRICAS */}
        <div className={styles.cardGrid}>
          {/* Contratos Fechados */}
          <div className={`${styles.card} ${styles.metricCard}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Contratos Fechados</span>
              <span className={`${styles.metricPill} ${styles.pillNd}`}>
                S{week}
              </span>
            </div>
            <span className={styles.metricValue}>
              {fmtInt(agg.tF) || '0'}
            </span>
            <span className={styles.metricSub}>
              Soma da carteira · <b>{agg.filled}</b>/{agg.total} preencheram
            </span>
          </div>

          {/* Taxa de Conversão */}
          <div className={`${styles.card} ${styles.metricCard}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Taxa de Conversão</span>
            </div>
            <span className={styles.metricValue}>
              {agg.taxa > 0 ? fmtPct(agg.taxa) : '—'}
            </span>
            <span className={styles.metricSub}>
              Fechados / Volume total
            </span>
          </div>

          {/* Meta de Lucro (colorida) */}
          <div className={`${styles.card} ${styles.metricCard}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Meta de Lucro</span>
              {agg.tLuc > 0 && (
                <span
                  className={`${styles.metricPill} ${
                    lucroOk ? styles.pillOk : styles.pillBad
                  }`}
                >
                  {lucroOk ? '✓ Vai bater' : '✗ Em risco'}
                </span>
              )}
            </div>
            <span
              className={`${styles.metricValue} ${
                agg.tLuc > 0 ? (lucroOk ? styles.green : styles.red) : styles.muted
              }`}
            >
              {fmtInt(agg.tLuc) || '—'}
            </span>
            <span className={styles.metricSub}>
              Previsto: <b>{fmtInt(agg.tCp) || '—'}</b> · Empate:{' '}
              <b>{fmtInt(agg.tEmp) || '—'}</b>
            </span>
          </div>

          {/* Contratos Previstos */}
          <div className={`${styles.card} ${styles.metricCard}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Contratos Previstos</span>
            </div>
            <span className={styles.metricValue}>
              {fmtInt(agg.tCp) || '—'}
            </span>
            <span className={styles.metricSub}>
              Pela taxa atual da carteira
            </span>
          </div>

          {/* CPL Atual */}
          <div className={`${styles.card} ${styles.metricCard}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>CPL Atual</span>
              {agg.cpl > 0 && agg.avgMC > 0 && (
                <span
                  className={`${styles.metricPill} ${
                    cplOk ? styles.pillOk : styles.pillBad
                  }`}
                >
                  {cplOk ? '✓ ok' : '✗ alto'}
                </span>
              )}
            </div>
            <span className={styles.metricValue}>
              {agg.cpl > 0 ? 'R$ ' + fmtDec(agg.cpl) : '—'}
            </span>
            <span className={styles.metricSub}>
              Meta média:{' '}
              <b>{agg.avgMC > 0 ? 'R$ ' + fmtDec(agg.avgMC) : '—'}</b>
            </span>
          </div>

          {/* Leads Previstos */}
          <div className={`${styles.card} ${styles.metricCard}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>Leads Previstos</span>
              {agg.tLp > 0 && agg.tMV > 0 && (
                <span
                  className={`${styles.metricPill} ${
                    volOk ? styles.pillOk : styles.pillBad
                  }`}
                >
                  {volOk ? '✓ ok' : '✗ baixo'}
                </span>
              )}
            </div>
            <span className={styles.metricValue}>
              {fmtInt(agg.tLp) || '—'}
            </span>
            <span className={styles.metricSub}>
              Meta volume: <b>{fmtInt(agg.tMV) || '—'}</b>
            </span>
          </div>
        </div>

        {/* TABELA DE CLIENTES */}
        <div className={`${styles.card} ${styles.tableCard}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Clientes da carteira</h3>
              <p className={styles.sectionSubtitle}>
                Ordenados por prioridade de atenção. Clientes em{' '}
                <b>prioridade alta</b> estão significativamente abaixo da meta
                de lucro — priorize análise e ajuste de rota.
              </p>
            </div>
            <div className={styles.sectionHeaderRight}>
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span
                    className={`${styles.legendDot} ${styles.legendHigh}`}
                  />
                  Alta
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={`${styles.legendDot} ${styles.legendMid}`}
                  />
                  Média
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendOk}`} />
                  Meta ok
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendNd}`} />
                  Sem dados
                </span>
              </div>
            </div>
          </div>

          {loadingMetrics ? (
            <div className={styles.loadingState}>
              <span className={styles.loadingSpinner} />
              <span>Carregando métricas da carteira…</span>
            </div>
          ) : fetchError ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>Erro ao carregar</div>
              <div>{fetchError.message}</div>
            </div>
          ) : (
            <div className={styles.table}>
              <div className={styles.tableHdr}>
                <span />
                <span>Cliente</span>
                <span>Prioridade</span>
                <span>Fechados</span>
                <span>Previstos</span>
                <span>Meta</span>
                <span>Taxa</span>
                <span>Status</span>
              </div>

              {sortedRows.map((row) => {
                const { client, calc, priority } = row;
                const priClass =
                  priority.cls === 'pri-h'
                    ? styles.high
                    : priority.cls === 'pri-m'
                    ? styles.mid
                    : priority.cls === 'pri-l'
                    ? styles.ok
                    : styles.nd;

                const squadName =
                  (squads || []).find((s) => s.id === client.squadId)?.name ||
                  '';

                return (
                  <div
                    key={client.id}
                    className={styles.tableRow}
                    onClick={() => setDetailId(client.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailId(client.id);
                      }
                    }}
                  >
                    <div className={`${styles.priBar} ${priClass}`} />

                    <div className={styles.clientCell}>
                      <div className={styles.clientName}>{client.name}</div>
                      <div className={styles.clientMeta}>
                        {squadName ? <span>{squadName}</span> : null}
                        {client.gestor ? <span>{client.gestor}</span> : null}
                        {!squadName && !client.gestor ? (
                          <span style={{ opacity: 0.5 }}>sem squad</span>
                        ) : null}
                      </div>
                    </div>

                    <span className={`${styles.priBadge} ${priClass}`}>
                      {priority.label}
                    </span>

                    <span className={styles.numCell}>
                      {fmtInt(calc.fec) || '—'}
                    </span>

                    <span className={styles.numCell}>
                      {fmtInt(calc.cp) || '—'}
                    </span>

                    <span
                      className={`${styles.numCell} ${
                        calc.mLuc > 0 && calc.cp >= calc.mLuc
                          ? styles.green
                          : calc.mLuc > 0
                          ? styles.red
                          : styles.muted
                      }`}
                    >
                      {fmtInt(calc.mLuc) || '—'}
                    </span>

                    <span className={styles.numCell}>
                      {calc.taxa > 0 ? fmtPct(calc.taxa) : '—'}
                    </span>

                    {calc.hasData ? (
                      calc.isHit ? (
                        <span
                          className={`${styles.statusPill} ${styles.hit}`}
                        >
                          ✓ Meta ok
                        </span>
                      ) : (
                        <span
                          className={`${styles.statusPill} ${styles.miss}`}
                        >
                          ✗ Em risco
                        </span>
                      )
                    ) : (
                      <span
                        className={`${styles.statusPill} ${styles.empty}`}
                      >
                        Sem dados
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drawer de detalhe do cliente */}
      {selectedClient && (
        <ClientDetailDrawer
          client={selectedClient}
          squads={squads || []}
          canDelete={admin}
          onClose={() => setDetailId(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
