import { useMemo, useState } from 'react';
import WorkspaceEmptyState from './WorkspaceEmptyState.jsx';
import WorkspaceTaskRow from './WorkspaceTaskRow.jsx';
import styles from './WorkspaceApp.module.css';
import { isDone, isOverdue, isToday, normalizeText, taskPriorityScore } from './workspaceUtils.js';

const FILTERS = [
  ['open', 'Abertas'],
  ['overdue', 'Atrasadas'],
  ['today', 'Hoje'],
  ['all', 'Todas'],
];

export default function WorkspaceTasks({ tasks }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('open');
  const visibleTasks = useMemo(() => {
    const term = normalizeText(query);
    return tasks.filter((task) => {
      if (filter === 'open' && isDone(task)) return false;
      if (filter === 'overdue' && !isOverdue(task)) return false;
      if (filter === 'today' && !isToday(task)) return false;
      if (term && !normalizeText(`${task.title || ''} ${task.clientName || ''} ${task.projectName || ''}`).includes(term)) return false;
      return true;
    }).sort((a, b) => taskPriorityScore(b) - taskPriorityScore(a));
  }, [tasks, query, filter]);

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelHeader}>
        <div><span className={styles.eyebrow}>Execução</span><h1>Tarefas</h1></div>
        <input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar tarefa" />
      </div>
      <div className={styles.segmented}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" data-active={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {visibleTasks.map((task) => <WorkspaceTaskRow key={task.id} task={task} />)}
      {!visibleTasks.length ? <WorkspaceEmptyState title="Nenhuma tarefa encontrada" /> : null}
    </section>
  );
}
