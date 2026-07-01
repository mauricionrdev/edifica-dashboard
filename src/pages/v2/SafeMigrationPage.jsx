import {
  ChecklistIcon,
  ProjectBoardIcon,
  RotateCcwIcon,
  ShieldIcon,
  SparklesIcon,
  TargetIcon,
} from '../../components/ui/Icons.jsx';
import styles from './SafeMigrationPage.module.css';

const guardrails = [
  'Produção atual permanece ativa durante toda a reconstrução.',
  'Nenhuma migration deve ser executada em produção sem clone, backup e rollback.',
  'Rotas V2 nascem ocultas da sidebar e protegidas por permissão.',
  'Cada rota produtiva só troca depois de comparação com dados reais.',
  'Legado permanece como fallback temporário depois da troca.',
];

const phases = [
  {
    title: 'Proteção',
    status: 'em execução',
    description: 'Backup, documentação e checkpoints antes de qualquer alteração destrutiva.',
  },
  {
    title: 'Shell V2',
    status: 'iniciado',
    description: 'Base paralela para testar estrutura nova sem substituir telas produtivas.',
  },
  {
    title: 'Clientes V2',
    status: 'próxima',
    description: 'Primeira tela candidata porque já existe divergência entre legado e tela atual.',
  },
  {
    title: 'Telas críticas',
    status: 'aguardando validação',
    description: 'Dashboard, Ranking, Preencher Semana e Squad entram só com comparação numérica.',
  },
];

const routeOrder = [
  'Clientes',
  'Modelo Oficial',
  'Equipe',
  'Gestão de Tráfego',
  'Dashboard',
  'Ranking',
  'Preencher Semana',
  'Carteira do Squad',
];

const validation = [
  'Build aprovado',
  'Permissão aplicada',
  'Sem dados fake',
  'Sem localStorage operacional',
  'Números batendo com produção',
  'Rollback possível',
];

export default function SafeMigrationPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <ShieldIcon size={20} />
        </div>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Migração segura</p>
          <h1>Reconstrução paralela da Edifica Central</h1>
          <p>
            Esta rota é interna, protegida e somente leitura. Ela inaugura a base V2 sem alterar as rotas produtivas, sem mexer em banco e sem remover legado.
          </p>
        </div>
      </section>

      <section className={styles.grid} aria-label="Controles de segurança">
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <TargetIcon size={17} />
            <h2>Regra principal</h2>
          </div>
          <p className={styles.lead}>Produção ativa, V2 em paralelo e troca somente por rota validada.</p>
          <div className={styles.flow}>
            <span>Atual</span>
            <span>V2 oculta</span>
            <span>Validação</span>
            <span>Troca</span>
            <span>Fallback</span>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <ChecklistIcon size={17} />
            <h2>Travas obrigatórias</h2>
          </div>
          <ul className={styles.list}>
            {guardrails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <ProjectBoardIcon size={18} />
          <div>
            <h2>Fases de execução</h2>
            <p>Primeira entrega segura: documentação + rota V2 interna.</p>
          </div>
        </div>

        <div className={styles.phaseGrid}>
          {phases.map((phase) => (
            <article className={styles.phaseCard} key={phase.title}>
              <span className={styles.status}>{phase.status}</span>
              <h3>{phase.title}</h3>
              <p>{phase.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <SparklesIcon size={17} />
            <h2>Ordem segura de migração</h2>
          </div>
          <ol className={styles.orderList}>
            {routeOrder.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <RotateCcwIcon size={17} />
            <h2>Checklist antes de trocar uma rota</h2>
          </div>
          <ul className={styles.checkGrid}>
            {validation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
