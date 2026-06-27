import Button from '../../components/ui/Button.jsx';
import WorkspaceEmptyState from './WorkspaceEmptyState.jsx';
import WorkspaceTaskRow from './WorkspaceTaskRow.jsx';
import styles from './WorkspaceApp.module.css';
import { formatDate, isDone, isOverdue, isToday, taskPriorityScore } from './workspaceUtils.js';

export default function WorkspaceHome({ tasks, documents, supportMetrics = [], onNavigate }) {
  const openTasks = tasks.filter((task) => !isDone(task));
  const focusTasks = [...openTasks].sort((a, b) => taskPriorityScore(b) - taskPriorityScore(a)).slice(0, 6);
  const overdue = openTasks.filter(isOverdue).length;
  const today = openTasks.filter(isToday).length;
  const noDue = openTasks.filter((task) => !task.dueDate).length;
  const recentDocuments = documents.slice(0, 5);

  return (
    <div className={styles.viewGrid}>
      <section className={styles.panelFull}>
        <div className={styles.workspaceHeaderRow}>
          <div>
            <span className={styles.eyebrow}>Início</span>
            <h1>Operação</h1>
          </div>
          <div className={styles.quickActions}>
            <Button type="button" size="sm" onClick={() => onNavigate('sheets')}>Planilhas</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('documents')}>Documentos</Button>
          </div>
        </div>

        <div className={styles.metricStrip} aria-label="Resumo do workspace">
          <button type="button" onClick={() => onNavigate('tasks')}><span>Abertas</span><strong>{openTasks.length}</strong></button>
          <button type="button" onClick={() => onNavigate('inbox')}><span>Atrasadas</span><strong>{overdue}</strong></button>
          <button type="button" onClick={() => onNavigate('tasks')}><span>Hoje</span><strong>{today}</strong></button>
          <button type="button" onClick={() => onNavigate('inbox')}><span>Sem prazo</span><strong>{noDue}</strong></button>
        </div>

        {supportMetrics.length ? (
          <div className={styles.supportMetricStrip} aria-label="Indicadores financeiros mantidos para suporte">
            {supportMetrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <div><span className={styles.eyebrow}>Prioridade</span><h2>Tarefas</h2></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('tasks')}>Abrir</Button>
        </div>
        {focusTasks.length ? focusTasks.map((task) => <WorkspaceTaskRow key={task.id} task={task} />) : <WorkspaceEmptyState title="Sem tarefas prioritárias" />}
      </section>

      <section className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <div><span className={styles.eyebrow}>Recentes</span><h2>Documentos</h2></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('documents')}>Abrir</Button>
        </div>
        {recentDocuments.map((document) => (
          <article className={styles.documentLine} key={document.id}>
            <strong>{document.title || 'Documento sem título'}</strong>
            <span>{document.updatedAt ? formatDate(document.updatedAt) : 'Sem atualização'}</span>
          </article>
        ))}
        {!recentDocuments.length ? <WorkspaceEmptyState title="Sem documentos" /> : null}
      </section>
    </div>
  );
}
