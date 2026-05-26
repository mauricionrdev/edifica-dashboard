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
        <strong>Base preparada</strong>
        <span>As preferências do workspace serão ativadas somente com persistência real.</span>
      </div>
    </section>
  );
}
