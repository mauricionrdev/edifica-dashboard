import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  getContractsSummary,
  getDashboardTargets,
  getGdvRanking,
  getRetentionMetrics,
  getSquadRanking,
  getSquadRankingChampions,
  getTrafficManagement,
} from '../../api/metrics.js';
import { getTemplate } from '../../api/template.js';
import { ChecklistIcon, SearchIcon, ShieldIcon, SparklesIcon, TargetIcon } from '../../components/ui/Icons.jsx';
import {
  currentPeriod,
  errorMessage,
  periodValue,
  referenceDate,
  safeInt,
} from './v2PageUtils.js';
import styles from './V2Operations.module.css';

const ROUTE_MATRIX = [
  ['Dashboard', '/', '/v2/dashboard', 'central.view', 'Comparar indicadores principais e metas'],
  ['Clientes', '/clientes', '/v2/clientes', 'clients.view', 'Conferir status, MRR, Churn e Finalizado'],
  ['Preencher Semana', '/preencher-semana', '/v2/preencher-semana', 'metrics.view', 'Conferir leitura semanal antes de qualquer edição'],
  ['Squads', '/squads/:squadId', '/v2/squads', 'squads.view', 'Conferir carteira sem alterar métricas'],
  ['Rankings', '/ranking-squads', '/v2/rankings', 'ranking.view', 'Conferir ranking ao vivo e campeões fechados'],
  ['GDVs', '/ranking-gdvs', '/v2/gdvs', 'ranking.view', 'Conferir ranking por GDV'],
  ['Retenção', '/dashboard/indicadores-por-squad', '/v2/retencao', 'central.view', 'Conferir churn, LTV e distribuição'],
  ['Gestão de Tráfego', '/gestao-trafego', '/v2/gestao-trafego', 'metrics.view', 'Conferir dados semanais sem criar lançamento'],
  ['Modelo Oficial', '/modelo-oficial', '/v2/modelo-oficial', 'project_template.view', 'Conferir estrutura sem salvar/resetar'],
  ['Equipe', '/equipe', '/v2/equipe', 'team.view', 'Conferir usuários sem editar permissões'],
  ['Projetos', '/projetos', '/v2/projetos', 'projects.view', 'Conferir leitura de projetos'],
  ['Perfil', '/perfil', '/v2/perfil', 'profile.view', 'Conferir visão pessoal sem editar'],
  ['Workspace', '/espaco-trabalho', '/v2/workspace', 'profile.view', 'Conferir leitura do workspace'],
  ['Suporte TI', '/suporte-tecnologia', '/v2/suporte-tecnologia', 'support.view', 'Conferir demandas e operação de suporte'],
];

function buildChecks(period) {
  const refDate = referenceDate(period);
  const month = periodValue(period);
  return [
    {
      key: 'summary',
      label: 'Resumo de contratos',
      endpoint: 'GET /api/metrics/summary',
      permission: 'central.view',
      run: () => getContractsSummary({ date: refDate }),
      describe: (payload) => `${safeInt(payload?.clients?.length || payload?.totals?.clients || 0)} clientes lidos`,
    },
    {
      key: 'retention',
      label: 'Retenção',
      endpoint: 'GET /api/metrics/retention',
      permission: 'central.view',
      run: () => getRetentionMetrics({ month }),
      describe: (payload) => `${safeInt(payload?.summary?.activeClients || payload?.summary?.portfolioClients || 0)} clientes em base`,
    },
    {
      key: 'ranking',
      label: 'Ranking de Squads',
      endpoint: 'GET /api/metrics/ranking',
      permission: 'ranking.view',
      run: () => getSquadRanking({ date: refDate }),
      describe: (payload) => `${safeInt(payload?.rows?.length || 0)} squads no ranking`,
    },
    {
      key: 'gdvRanking',
      label: 'Ranking de GDVs',
      endpoint: 'GET /api/metrics/ranking/gdvs',
      permission: 'ranking.view',
      run: () => getGdvRanking({ date: refDate }),
      describe: (payload) => `${safeInt(payload?.rows?.length || 0)} GDVs no ranking`,
    },
    {
      key: 'champions',
      label: 'Campeões fechados',
      endpoint: 'GET /api/metrics/ranking/champions',
      permission: 'ranking.view',
      run: () => getSquadRankingChampions(),
      describe: (payload) => `${safeInt(payload?.champions?.length || payload?.rows?.length || 0)} campeões gravados`,
    },
    {
      key: 'traffic',
      label: 'Gestão de Tráfego',
      endpoint: 'GET /api/metrics/traffic-management',
      permission: 'metrics.view',
      run: () => getTrafficManagement({ date: refDate }),
      describe: (payload) => `${safeInt(payload?.clients?.length || payload?.rows?.length || 0)} linhas lidas`,
    },
    {
      key: 'targets',
      label: 'Metas do dashboard',
      endpoint: 'GET /api/metrics/dashboard/targets',
      permission: 'central.view',
      run: () => getDashboardTargets({ month }),
      describe: (payload) => payload?.targets ? 'metas carregadas' : 'sem metas configuradas',
    },
    {
      key: 'template',
      label: 'Modelo Oficial',
      endpoint: 'GET /api/template',
      permission: 'project_template.view',
      run: () => getTemplate(),
      describe: (payload) => `${safeInt(Array.isArray(payload) ? payload.length : payload?.sections?.length || 0)} seções lidas`,
    },
  ];
}

function statusLabel(status) {
  if (status === 'ok') return 'OK';
  if (status === 'error') return 'Falhou';
  return 'Aguardando';
}

export default function ValidationV2Page() {
  const { clients = [], squads = [], gdvs = [] } = useOutletContext();
  const period = useMemo(() => currentPeriod(), []);
  const checks = useMemo(() => buildChecks(period), [period]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function runChecks() {
      setLoading(true);
      const entries = await Promise.all(checks.map(async (check) => {
        try {
          const payload = await check.run();
          return [check.key, {
            status: 'ok',
            label: check.label,
            endpoint: check.endpoint,
            permission: check.permission,
            message: check.describe(payload),
          }];
        } catch (err) {
          return [check.key, {
            status: 'error',
            label: check.label,
            endpoint: check.endpoint,
            permission: check.permission,
            message: errorMessage(err, 'Falha na leitura.'),
          }];
        }
      }));
      if (!cancelled) {
        setResults(Object.fromEntries(entries));
        setLoading(false);
      }
    }
    runChecks();
    return () => { cancelled = true; };
  }, [checks]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    const ok = values.filter((item) => item.status === 'ok').length;
    const failed = values.filter((item) => item.status === 'error').length;
    return { total: checks.length, ok, failed };
  }, [checks.length, results]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><ChecklistIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Validação V2 · diagnóstico seguro</p>
          <h1>Checklist de promoção das rotas paralelas</h1>
          <p>
            Executa apenas leituras GET e organiza o caminho oficial de comparação entre produção e V2. Não substitui rotas, não cria registros e não grava no banco.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.gridCards} aria-label="Resumo de validação">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Checks GET</span><SearchIcon size={15} /></div>
          <strong className={styles.cardValue}>{loading ? '...' : `${summary.ok}/${summary.total}`}</strong>
          <p className={styles.cardHelper}>Endpoints lidos com sucesso</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Falhas</span><ShieldIcon size={15} /></div>
          <strong className={summary.failed ? `${styles.cardValue} ${styles.toneDanger}` : `${styles.cardValue} ${styles.toneGood}`}>{loading ? '...' : summary.failed}</strong>
          <p className={styles.cardHelper}>Falha impede promoção da rota</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Base local</span><TargetIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(clients.length)}</strong>
          <p className={styles.cardHelper}>Clientes carregados pelo shell</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Estrutura</span><SparklesIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(squads.length + gdvs.length)}</strong>
          <p className={styles.cardHelper}>Squads + GDVs disponíveis</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Saúde dos endpoints</p>
              <h2>Leituras críticas</h2>
              <p>Todos os itens abaixo usam somente GET para evitar impacto operacional.</p>
            </div>
            <span className={styles.statusBadgeMuted}>Período {periodValue(period)}</span>
          </header>
          <div className={styles.stackList}>
            {checks.map((check) => {
              const result = results[check.key] || { status: 'pending', message: 'Aguardando leitura.' };
              const tone = result.status === 'ok' ? styles.toneGood : result.status === 'error' ? styles.toneDanger : '';
              return (
                <div className={styles.leaderCard} key={check.key}>
                  <span className={styles.rankPill}>{result.status === 'ok' ? '✓' : result.status === 'error' ? '!' : '...'}</span>
                  <div className={styles.leaderIdentity}>
                    <strong className={styles.leaderName}>{check.label}</strong>
                    <p className={styles.rowMeta}>{check.endpoint} · {check.permission}</p>
                  </div>
                  <div className={styles.leaderStats}>
                    <span className={tone}>{statusLabel(result.status)}</span>
                    <span>{result.message}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Critério de promoção</p>
              <h2>Antes de trocar rota oficial</h2>
              <p>Uma tela V2 só deve substituir a tela atual depois de passar por esta sequência.</p>
            </div>
          </header>
          <div className={styles.stackList}>
            {[
              'GET crítico sem erro no diagnóstico.',
              'Dados da V2 batem com a rota oficial no mesmo período.',
              'Permissão testada com usuário autorizado e não autorizado.',
              'Responsividade validada em notebook e desktop.',
              'Rollback documentado antes do deploy.',
            ].map((item, index) => (
              <div className={styles.safeNotice} key={item}>
                <span className={styles.badgeIcon}>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Mapa de comparação</p>
            <h2>Produção x V2</h2>
            <p>Use a rota oficial como referência visual/numérica e a rota V2 como candidata. A troca só acontece depois da validação manual.</p>
          </div>
          <span className={styles.statusBadgeMuted}>Sem promoção automática</span>
        </header>
        <div className={styles.table} role="table" aria-label="Comparação de rotas oficiais e V2">
          <div className={styles.tableHead} role="row"><span>Tela</span><span>Produção</span><span>V2</span><span>Permissão</span><span>Validação</span></div>
          {ROUTE_MATRIX.map(([label, currentRoute, v2Route, permission, validation]) => (
            <div className={styles.tableRow} role="row" key={v2Route}>
              <span><strong>{label}</strong></span>
              <span>{currentRoute.includes(':') ? currentRoute : <Link className={styles.chip} to={currentRoute}>Abrir atual</Link>}</span>
              <span><Link className={styles.chip} to={v2Route}>Abrir V2</Link></span>
              <span>{permission}</span>
              <span>{validation}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
