import { Link } from 'react-router-dom';
import { ChecklistIcon, ShieldIcon, SparklesIcon, TargetIcon } from '../../components/ui/Icons.jsx';
import { V2_PROMOTION_BLOCKERS, V2_ROUTE_REGISTRY, criticalRoutes, promotionCandidates } from './v2RouteRegistry.js';
import styles from './V2Operations.module.css';

const PHASES = [
  ['01', 'Validar leitura', 'A tela V2 precisa abrir, carregar dados reais e respeitar o espaço do workspace.'],
  ['02', 'Comparar com produção', 'Números e estados precisam bater com a rota oficial no mesmo período.'],
  ['03', 'Promover rota', 'A rota oficial aponta para V2, mantendo a tela antiga disponível como fallback temporário.'],
  ['04', 'Observar produção', 'Acompanhar uso real, console, permissões e chamados antes de limpar legado.'],
  ['05', 'Limpar legado', 'Remover arquivos antigos somente depois do período de estabilidade.'],
];

export default function PromotionV2Page() {
  const candidates = promotionCandidates();
  const critical = criticalRoutes();

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
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Banco</span><ShieldIcon size={15} /></div><strong className={styles.cardValue}>Sem mudança</strong><p className={styles.cardHelper}>Nada de migration nesta etapa</p></article>
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
