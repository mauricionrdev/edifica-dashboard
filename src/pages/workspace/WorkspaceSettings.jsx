import styles from './WorkspaceApp.module.css';

export default function WorkspaceSettings() {
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Preferências</span>
          <h1>Configurações</h1>
        </div>
      </div>
      <div className={styles.emptyState}>
        <strong>Nenhuma preferência ativa</strong>
        <span>Esta área fica reservada para configurações reais do workspace.</span>
      </div>
    </section>
  );
}
