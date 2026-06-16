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
        <strong>Sem configurações ativas</strong>
      </div>
    </section>
  );
}
