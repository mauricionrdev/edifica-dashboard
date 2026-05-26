import styles from './WorkspaceApp.module.css';
import { formatDate, taskLabel } from './workspaceUtils.js';

export default function WorkspaceTaskRow({ task }) {
  return (
    <article className={styles.taskRow}>
      <div>
        <strong>{task.title || 'Tarefa sem título'}</strong>
        <span>{task.clientName || task.projectName || task.typeLabel || 'Demanda interna'}</span>
      </div>
      <div className={styles.taskMeta}>
        <span>{taskLabel(task)}</span>
        <span>{formatDate(task.dueDate)}</span>
      </div>
    </article>
  );
}
