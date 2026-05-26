import Button from '../../components/ui/Button.jsx';
import WorkspaceEmptyState from './WorkspaceEmptyState.jsx';
import WorkspaceTaskRow from './WorkspaceTaskRow.jsx';
import styles from './WorkspaceApp.module.css';
import { formatDate, isDone, isOverdue, isToday, taskPriorityScore } from './workspaceUtils.js';

export default function WorkspaceHome({ tasks, documents, onNavigate }) {
  const openTasks = tasks.filter((task) => !isDone(task));
  const focusTasks = [...openTasks].sort((a, b) => taskPriorityScore(b) - taskPriorityScore(a)).slice(0, 5);
  const overdue = openTasks.filter(isOverdue).length;
  const today = openTasks.filter(isToday).length;
  const noDue = openTasks.filter((task) => !task.dueDate).length;

  return (
    <div className={styles.viewGrid}>
      <section className={styles.heroPanel}>
        <div>
          <span className={styles.eyebrow}>Central pessoal</span>
          <h1>Execução, documentos e planilhas em uma base limpa.</h1>
          <p>Workspace reconstruído em arquivos novos para separar responsabilidades e reduzir regressões.</p>
        </div>
        <div className={styles.quickActions}>
          <Button type="button" size="sm" onClick={() => onNavigate('sheets')}>Abrir planilhas</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('documents')}>Documentos</Button>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="Resumo do workspace">
        <button type="button" onClick={() => onNavigate('tasks')} className={styles.kpiCard}><span>Abertas</span><strong>{openTasks.length}</strong></button>
        <button type="button" onClick={() => onNavigate('inbox')} className={styles.kpiCard}><span>Atrasadas</span><strong>{overdue}</strong></button>
        <button type="button" onClick={() => onNavigate('tasks')} className={styles.kpiCard}><span>Hoje</span><strong>{today}</strong></button>
        <button type="button" onClick={() => onNavigate('inbox')} className={styles.kpiCard}><span>Sem prazo</span><strong>{noDue}</strong></button>
      </section>

      <section className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <div><span className={styles.eyebrow}>Fila sugerida</span><h2>Próximas ações</h2></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('tasks')}>Ver tarefas</Button>
        </div>
        {focusTasks.length ? focusTasks.map((task) => <WorkspaceTaskRow key={task.id} task={task} />) : <WorkspaceEmptyState title="Sem tarefas urgentes" description="Nada crítico ou atrasado neste momento." />}
      </section>

      <section className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <div><span className={styles.eyebrow}>Recentes</span><h2>Documentos</h2></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('documents')}>Abrir documentos</Button>
        </div>
        {documents.slice(0, 4).map((document) => (
          <article className={styles.documentLine} key={document.id}>
            <strong>{document.title || 'Documento sem título'}</strong>
            <span>{document.updatedAt ? `Atualizado em ${formatDate(document.updatedAt)}` : 'Sem atualização'}</span>
          </article>
        ))}
        {!documents.length ? <WorkspaceEmptyState title="Nenhum documento" description="Crie páginas operacionais para registrar decisões e processos." /> : null}
      </section>
    </div>
  );
}
