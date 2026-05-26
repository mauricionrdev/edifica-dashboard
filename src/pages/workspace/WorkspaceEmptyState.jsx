import styles from './WorkspaceApp.module.css';

export default function WorkspaceEmptyState({ title, description }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}
