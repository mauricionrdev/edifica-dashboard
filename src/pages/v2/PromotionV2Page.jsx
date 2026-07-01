import { Link } from 'react-router-dom';
import { ChecklistIcon, ShieldIcon, SparklesIcon, TargetIcon } from '../../components/ui/Icons.jsx';
import { V2_PROMOTION_BLOCKERS, V2_ROUTE_REGISTRY, criticalRoutes, lockedPromotionRoutes, promotableFlagRoutes, promotionCandidates } from './v2RouteRegistry.js';
import { V2_PROMOTION_FLAGS, enabledV2PromotionFlags, isV2RoutePromoted } from './v2PromotionFlags.js';
import styles from './V2Operations.module.css';

const PHASES = [
  ['01', 'Validar leitura', 'A tela V2 precisa abrir, carregar dados reais e respeitar o espaço do workspace.'],
  ['02', 'Comparar com produção', 'Números e estados precisam bater com a rota oficial no mesmo período.'],
  ['03', 'Ativar flag', 'Alterar apenas uma variável VITE_PROMOTE_* para true, gerar novo build e manter fallback legado.'],
  ['04', 'Observar produção', 'Acompanhar uso real, console, permissões e chamados antes de limpar legado.'],
  ['05', 'Rollback se necessário', 'Voltar a flag para false, gerar novo build e reabrir a rota oficial antiga.'],
  ['06', 'Limpar legado', 'Remover arquivos antigos somente depois do período de estabilidade.'],
];

const DEPLOY_SEQUENCE = [
  'git status',
  'npm run verify:v2',
  'npm run build',
  'npm run verify:prod',
  'subir dist/ no frontend',
  'validar rota oficial e /legacy correspondente',
];

export default function PromotionV2Page() {
  const candidates = promotionCandidates();
  const critical = criticalRoutes();
  const flagRoutes = promotableFlagRoutes();
  const lockedRoutes = lockedPromotionRoutes();
  const activeFlags = enabledV2PromotionFlags();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><TargetIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Promoção V2 · controle de produção</p>
          <h1>Mapa seguro para substituir rotas oficiais</h1>
          <p>Esta tela organiza a ordem de promoção das rotas paralelas. Ela não substitui produção, não grava no banco e não altera permissões.</p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem deploy destrutivo</span>
      </section>

      <section className={styles.gridCards} aria-label="Resumo de promoção">
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Rotas mapeadas</span><SparklesIcon size={15} /></div><strong className={styles.cardValue}>{V2_ROUTE_REGISTRY.length}</strong><p className={styles.cardHelper}>Todas em paralelo</p></article>
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Candidatas iniciais</span><ChecklistIcon size={15} /></div><strong className={styles.cardValue}>{candidates.length}</strong><p className={styles.cardHelper}>Baixo ou médio risco</p></article>
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Críticas</span><ShieldIcon size={15} /></div><strong className={styles.cardValue}>{critical.length}</strong><p className={styles.cardHelper}>Exigem comparação numérica</p></article>
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Flags ativas</span><ShieldIcon size={15} /></div><strong className={styles.cardValue}>{activeFlags.length}</strong><p className={styles.cardHelper}>{activeFlags.length ? 'Revisar produção' : 'Padrão seguro'}</p></article>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Flags de promoção</p>
            <h2>Troca controlada por variável de build</h2>
            <p>As rotas oficiais continuam usando as telas atuais. Uma V2 só assume a rota produtiva se a variável correspondente estiver exatamente como true no build.</p>
          </div>
          <span className={styles.safeBadge}><ShieldIcon size={14} /> Padrão desligado</span>
        </header>
        <div className={styles.flagGrid}>
          {flagRoutes.map((route) => {
            const flag = V2_PROMOTION_FLAGS[route.flagKey];
            const active = isV2RoutePromoted(route.flagKey);
            return (
              <article className={styles.flagRow} key={route.key}>
                <div className={styles.flagMeta}>
                  <strong>{route.title}</strong>
                  <span>{flag?.env || 'sem flag'} · fallback: {route.productionPath.replace('/', '/legacy/')}</span>
                </div>
                <span className={active ? `${styles.switchPill} ${styles.switchPillActive}` : styles.switchPill}>{active ? 'V2 ativa' : 'Legado ativo'}</span>
              </article>
            );
          })}
        </div>
        <p className={styles.sectionNote}>Rotas críticas ainda não têm flag de promoção. Permanecem apenas em /v2 até comparação numérica completa: {lockedRoutes.map((route) => route.title).join(', ')}.</p>
      </section>

      <section className={styles.guardPanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Guard rail</p>
            <h2>Estado atual das flags</h2>
            <p>Use esta leitura antes de qualquer build. Em produção, o estado seguro é zero flag ativa até a rota estar validada.</p>
          </div>
          <span className={activeFlags.length ? `${styles.statusBadge} ${styles.statusBadgeWarning}` : styles.safeBadge}>
            <ShieldIcon size={14} /> {activeFlags.length ? 'Atenção: V2 promovida' : 'Nenhuma promoção ativa'}
          </span>
        </header>
        <div className={styles.guardGrid}>
          <article className={styles.guardCard}>
            <strong>Ativas neste build</strong>
            <p>{activeFlags.length ? activeFlags.map((flag) => flag.env).join(', ') : 'Nenhuma flag ativa. As rotas oficiais continuam no legado.'}</p>
          </article>
          <article className={styles.guardCard}>
            <strong>Rollback</strong>
            <p>Defina a flag da tela como false, rode novo build e suba novamente o conteúdo de dist/. O fallback /legacy deve continuar acessível.</p>
          </article>
          <article className={styles.guardCard}>
            <strong>Verificação local</strong>
            <p>Antes do build final, rode npm run verify:v2 para bloquear flags críticas ou fallback ausente.</p>
          </article>
        </div>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Sequência recomendada</p>
            <h2>Ordem segura de promoção</h2>
            <p>Começar pelas rotas de menor risco e deixar Preencher Semana, Squad, Ranking e Dashboard para depois da comparação numérica.</p>
          </div>
          <Link className={styles.chip} to="/v2/validacao">Abrir validação</Link>
        </header>
        <div className={styles.promotionGrid}>
          {V2_ROUTE_REGISTRY.filter((route) => route.productionPath !== '—').map((route) => (
            <article className={styles.promotionCard} key={route.key}>
              <div className={styles.cardTop}>
                <span>{route.domain}</span>
                <span className={route.risk === 'Crítico' || route.risk === 'Alto' ? styles.toneDanger : route.risk === 'Médio' ? styles.toneWarning : styles.toneGood}>{route.risk}</span>
              </div>
              <h3>{route.title}</h3>
              <p>{route.promotion}</p>
              <div className={styles.chips}>
                <Link className={styles.chip} to={route.productionPath}>Produção</Link>
                <Link className={styles.chip} to={route.v2Path}>V2</Link>
              </div>
              <ul className={styles.compactList}>
                {route.checks.slice(0, 4).map((check) => <li key={check}>{check}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Deploy controlado</p>
            <h2>Sequência mínima antes de subir frontend</h2>
            <p>Este fluxo evita troca acidental de rota crítica e mantém rollback simples na Hostinger.</p>
          </div>
          <span className={styles.statusBadgeMuted}>Frontend only</span>
        </header>
        <div className={styles.commandList}>
          {DEPLOY_SEQUENCE.map((command, index) => (
            <div className={styles.commandRow} key={command}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <code>{command}</code>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>Fases</p><h2>Fluxo de troca sem big bang</h2><p>Cada rota deve passar por estas etapas antes de substituir a oficial.</p></div>
          </header>
          <div className={styles.timelineList}>
            {PHASES.map(([number, title, description]) => (
              <div className={styles.timelineItem} key={number}>
                <span>{number}</span>
                <div><strong>{title}</strong><p>{description}</p></div>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>Bloqueios</p><h2>O que impede promoção</h2><p>Se qualquer item ocorrer, a tela deve permanecer em V2.</p></div>
          </header>
          <ul className={styles.compactList}>
            {V2_PROMOTION_BLOCKERS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </section>
    </main>
  );
}
