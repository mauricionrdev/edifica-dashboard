import { Link } from 'react-router-dom';
import { ShieldIcon, SparklesIcon } from '../../components/ui/Icons.jsx';
import { V2_ROUTE_REGISTRY } from './v2RouteRegistry.js';
import styles from './V2Operations.module.css';

export default function V2OverviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><SparklesIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Central V2 · hub interno</p>
          <h1>Rotas paralelas de validação segura</h1>
          <p>Este hub reúne as telas V2 criadas em paralelo. Ele não troca a produção, não aparece na sidebar e não executa operações de escrita.</p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Ambiente paralelo</span>
      </section>

      <section className={styles.gridCards} aria-label="Resumo V2">
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Rotas V2</span><SparklesIcon size={15} /></div><strong className={styles.cardValue}>{V2_ROUTE_REGISTRY.length}</strong><p className={styles.cardHelper}>Todas ocultas da sidebar</p></article>
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Modo</span><ShieldIcon size={15} /></div><strong className={styles.cardValue}>Seguro</strong><p className={styles.cardHelper}>Validação antes de substituir rota oficial</p></article>
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Banco</span><ShieldIcon size={15} /></div><strong className={styles.cardValue}>Intacto</strong><p className={styles.cardHelper}>Sem migration neste ciclo</p></article>
        <article className={styles.metricCard}><div className={styles.cardTop}><span>Deploy</span><ShieldIcon size={15} /></div><strong className={styles.cardValue}>Front</strong><p className={styles.cardHelper}>Apenas build do frontend</p></article>
      </section>

      <section className={styles.tablePanel}>
        <header className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>Mapa de validação</p><h2>Rotas disponíveis</h2><p>Acesse cada rota para comparar com a tela oficial antes de qualquer promoção.</p></div>
          <span className={styles.statusBadgeMuted}>Sem alteração de rota oficial</span>
        </header>
        <div className={styles.table} role="table" aria-label="Rotas V2">
          <div className={styles.tableHead} role="row"><span>Tela</span><span>Rota</span><span>Permissão</span><span>Status</span><span>Ação</span></div>
          {V2_ROUTE_REGISTRY.map((route) => (
            <div className={styles.tableRow} role="row" key={route.key}>
              <span><strong>{route.title}</strong></span>
              <span>{route.v2Path}</span>
              <span>{route.permission}</span>
              <span>{route.stage}</span>
              <span><Link className={styles.chip} to={route.v2Path}>Abrir</Link></span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
