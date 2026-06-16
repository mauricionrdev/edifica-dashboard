import styles from './WorkspaceApp.module.css';

export default function WorkspaceEmptyState({ title }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
    </div>
  );
}
