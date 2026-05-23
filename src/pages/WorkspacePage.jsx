import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import UserSpreadsheetPanel from '../components/spreadsheets/UserSpreadsheetPanel.jsx';
import { listMyProjectTasks } from '../api/projects.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import {
  ArrowUpRightIcon,
  BuildingIcon,
  CalendarIcon,
  ChecklistIcon,
  HomeIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
} from '../components/ui/Icons.jsx';
import styles from './WorkspacePage.module.css';

const TABS = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'tasks', label: 'Tarefas', icon: ChecklistIcon },
  { id: 'sheets', label: 'Planilhas', icon: BuildingIcon },
  { id: 'resources', label: 'Recursos', icon: SparklesIcon },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
];

const STATUS_LABELS = {
  todo: 'Aberta',
  in_progress: 'Em andamento',
  activation_gdv: 'Ativação GDV',
  final_validation: 'Validação',
  done: 'Concluída',
  canceled: 'Cancelada',
};

const PRIORITY_LABELS = {
  low: 'Baixa',
  medium: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function isDone(task) {
  return ['done', 'canceled'].includes(String(task?.status || '').toLowerCase());
}

function isOverdue(task) {
  if (!task?.dueDate || isDone(task)) return false;
  const due = new Date(`${String(task.dueDate).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(due.getTime())) return false;
  return due < new Date();
}

function formatDate(value) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function statusLabel(value) {
  return STATUS_LABELS[String(value || '').toLowerCase()] || 'Aberta';
}

function priorityLabel(value) {
  return PRIORITY_LABELS[String(value || '').toLowerCase()] || 'Normal';
}

function EmptyPanel({ title, eyebrow = 'Em construção', icon: Icon = SparklesIcon }) {
  return (
    <section className={styles.emptyPanel} aria-label={title}>
      <span className={styles.emptyIcon}><Icon size={18} /></span>
      <span>{eyebrow}</span>
      <strong>{title}</strong>
    </section>
  );
}

function TaskRow({ task }) {
  return (
    <article className={styles.taskRow}>
      <span className={`${styles.taskStatus} ${isDone(task) ? styles.taskStatusDone : ''}`} aria-hidden="true" />
      <div className={styles.taskMain}>
        <strong>{task?.title || 'Tarefa sem título'}</strong>
        <span>{task?.clientName || task?.projectName || task?.typeLabel || 'Demanda interna'}</span>
      </div>
      <div className={styles.taskMeta}>
        <span>{statusLabel(task?.status)}</span>
        <em>{priorityLabel(task?.priority)}</em>
        <time className={isOverdue(task) ? styles.overdue : ''}>{formatDate(task?.dueDate)}</time>
      </div>
    </article>
  );
}

export default function WorkspacePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('home');
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Meu espaço de trabalho';

  const activeTabLabel = useMemo(() => TABS.find((tab) => tab.id === activeTab)?.label || 'Início', [activeTab]);

  function loadTasks() {
    setTasksLoading(true);
    setTasksError('');

    listMyProjectTasks()
      .then((res) => setTasks(Array.isArray(res?.tasks) ? res.tasks : []))
      .catch((err) => {
        const message = err?.message || 'Não foi possível carregar suas tarefas.';
        setTasksError(message);
        showToast?.(message, { variant: 'error' });
      })
      .finally(() => setTasksLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    setTasksError('');

    listMyProjectTasks()
      .then((res) => {
        if (!cancelled) setTasks(Array.isArray(res?.tasks) ? res.tasks : []);
      })
      .catch((err) => {
        if (!cancelled) setTasksError(err?.message || 'Não foi possível carregar suas tarefas.');
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const taskStats = useMemo(() => {
    const open = tasks.filter((task) => !isDone(task));
    const done = tasks.filter((task) => isDone(task));
    const overdue = tasks.filter((task) => isOverdue(task));
    const critical = open.filter((task) => String(task?.priority || '').toLowerCase() === 'critical');
    return {
      open: open.length,
      done: done.length,
      overdue: overdue.length,
      critical: critical.length,
    };
  }, [tasks]);

  const activeTasks = useMemo(() => (
    tasks
      .filter((task) => !isDone(task))
      .slice()
      .sort((a, b) => String(a?.dueDate || '9999-12-31').localeCompare(String(b?.dueDate || '9999-12-31')))
  ), [tasks]);

  const completedTasks = useMemo(() => tasks.filter((task) => isDone(task)).slice(0, 6), [tasks]);
  const visibleTasks = activeTab === 'tasks' ? activeTasks : activeTasks.slice(0, 5);

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="Meu espaço de trabalho">
        <div className={styles.sidebarHeader}>
          <span className={styles.brandMark}>edi</span>
          <div>
            <strong>Workspace</strong>
            <span>pessoal</span>
          </div>
        </div>

        <nav className={styles.sideNav} aria-label="Navegação do espaço">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? styles.sideActive : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link to="/" className={styles.backButton}><HomeIcon size={15} /> Voltar para a central</Link>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.avatar} title={displayName}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(displayName)}</span>
            <div>
              <span className={styles.eyebrow}>Meu espaço de trabalho</span>
              <h1>{displayName}</h1>
            </div>
          </div>

          <div className={styles.headerActions}>
            <Button size="sm" variant="secondary" onClick={loadTasks} disabled={tasksLoading}><RotateCcwIcon size={15} /> Atualizar</Button>
            <Button size="sm" variant="secondary" onClick={() => setActiveTab('settings')}><SettingsIcon size={15} /> Configurações</Button>
            <Button size="sm" variant="primary" onClick={() => setActiveTab('sheets')}><PlusIcon size={15} /> Nova planilha</Button>
          </div>
        </header>

        <div className={styles.topStrip}>
          <div className={styles.workspaceTitle}>
            <span>{activeTabLabel}</span>
            <strong>{activeTab === 'home' ? 'Central pessoal' : activeTabLabel}</strong>
          </div>
          <nav className={styles.tabRail} aria-label="Áreas do workspace">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? styles.tabActive : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'home' ? (
          <>
            <section className={styles.commandGrid}>
              <button type="button" className={styles.commandCard} onClick={() => setActiveTab('tasks')}>
                <span><ChecklistIcon size={17} /></span>
                <strong>Minhas tarefas</strong>
                <em>{taskStats.open} abertas</em>
                <ArrowUpRightIcon size={15} />
              </button>
              <button type="button" className={styles.commandCard} onClick={() => setActiveTab('sheets')}>
                <span><BuildingIcon size={17} /></span>
                <strong>Planilhas</strong>
                <em>Workspace pessoal</em>
                <ArrowUpRightIcon size={15} />
              </button>
              <button type="button" className={styles.commandCard} onClick={() => setActiveTab('resources')}>
                <span><SparklesIcon size={17} /></span>
                <strong>Recursos</strong>
                <em>Área pessoal</em>
                <ArrowUpRightIcon size={15} />
              </button>
            </section>

            <section className={styles.overviewGrid}>
              <div className={styles.summaryPanel}>
                <div className={styles.sectionHeader}>
                  <span>Resumo</span>
                  <strong>Operação pessoal</strong>
                </div>

                <div className={styles.metricsGrid}>
                  <div>
                    <span>Abertas</span>
                    <strong>{taskStats.open}</strong>
                  </div>
                  <div>
                    <span>Atrasadas</span>
                    <strong>{taskStats.overdue}</strong>
                  </div>
                  <div>
                    <span>Críticas</span>
                    <strong>{taskStats.critical}</strong>
                  </div>
                  <div>
                    <span>Concluídas</span>
                    <strong>{taskStats.done}</strong>
                  </div>
                </div>
              </div>

              <div className={styles.timelinePanel}>
                <div className={styles.sectionHeader}>
                  <span>Próximas</span>
                  <strong>Tarefas em aberto</strong>
                </div>
                <div className={styles.taskList}>
                  {tasksLoading ? <span className={styles.inlineState}>Carregando tarefas...</span> : null}
                  {!tasksLoading && tasksError ? <span className={styles.inlineState}>{tasksError}</span> : null}
                  {!tasksLoading && !tasksError && !visibleTasks.length ? <span className={styles.inlineState}>Nenhuma tarefa aberta.</span> : null}
                  {!tasksLoading && !tasksError ? visibleTasks.map((task) => <TaskRow key={task.id} task={task} />) : null}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === 'tasks' ? (
          <section className={styles.tasksBoard}>
            <div className={styles.tasksColumn}>
              <div className={styles.sectionHeader}>
                <span>Abertas</span>
                <strong>{activeTasks.length} tarefas</strong>
              </div>
              <div className={styles.taskList}>
                {tasksLoading ? <span className={styles.inlineState}>Carregando tarefas...</span> : null}
                {!tasksLoading && tasksError ? <span className={styles.inlineState}>{tasksError}</span> : null}
                {!tasksLoading && !tasksError && !activeTasks.length ? <span className={styles.inlineState}>Nenhuma tarefa aberta.</span> : null}
                {!tasksLoading && !tasksError ? activeTasks.map((task) => <TaskRow key={task.id} task={task} />) : null}
              </div>
            </div>

            <div className={styles.tasksColumn}>
              <div className={styles.sectionHeader}>
                <span>Histórico</span>
                <strong>Concluídas recentes</strong>
              </div>
              <div className={styles.taskList}>
                {!completedTasks.length ? <span className={styles.inlineState}>Nenhuma tarefa concluída recente.</span> : null}
                {completedTasks.map((task) => <TaskRow key={task.id} task={task} />)}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'sheets' ? (
          <section className={styles.sheetSection} aria-label="Planilhas pessoais">
            <UserSpreadsheetPanel ownerUserId={user?.id} canEdit showToast={showToast} />
          </section>
        ) : null}

        {activeTab === 'resources' ? <EmptyPanel title="Recursos pessoais" icon={TargetIcon} /> : null}
        {activeTab === 'settings' ? <EmptyPanel title="Configurações do espaço" icon={SettingsIcon} /> : null}
      </section>
    </main>
  );
}
