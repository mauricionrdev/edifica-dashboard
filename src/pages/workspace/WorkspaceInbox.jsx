import WorkspaceEmptyState from './WorkspaceEmptyState.jsx';
import styles from './WorkspaceApp.module.css';
import { isDone, isOverdue, taskLabel } from './workspaceUtils.js';

export default function WorkspaceInbox({ tasks, documents, onNavigate }) {
  const items = [
    ...tasks.filter((task) => !isDone(task) && (isOverdue(task) || !task.dueDate)).map((task) => ({ type: 'task', id: task.id, title: task.title || 'Tarefa sem título', meta: taskLabel(task), action: 'tasks' })),
    ...documents.filter((document) => !String(document.content || '').trim()).slice(0, 8).map((document) => ({ type: 'doc', id: document.id, title: document.title || 'Documento sem conteúdo', meta: 'Documento vazio', action: 'documents' })),
  ];

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelHeader}>
        <div><span className={styles.eyebrow}>Entrada</span><h1>Caixa de entrada</h1></div>
      </div>
      {items.map((item) => (
        <button type="button" key={`${item.type}-${item.id}`} className={styles.inboxItem} onClick={() => onNavigate(item.action)}>
          <div><strong>{item.title}</strong><span>{item.meta}</span></div>
          <span>Abrir</span>
        </button>
      ))}
      {!items.length ? <WorkspaceEmptyState title="Entrada limpa" /> : null}
    </section>
  );
}
