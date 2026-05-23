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
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
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

const TASK_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'critical', label: 'Críticas' },
  { id: 'today', label: 'Hoje' },
];

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

function isToday(task) {
  if (!task?.dueDate || isDone(task)) return false;
  const due = String(task.dueDate).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return due === today;
}

function isThisWeek(task) {
  if (!task?.dueDate || isDone(task)) return false;
  const due = new Date(`${String(task.dueDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - weekday + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return due >= monday && due <= sunday;
}

function hasNoDueDate(task) {
  return !task?.dueDate && !isDone(task);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
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

function TaskMiniRow({ task }) {
  return (
    <article className={styles.focusItem}>
      <span className={`${styles.taskStatus} ${isOverdue(task) ? styles.taskStatusHot : ''}`} aria-hidden="true" />
      <div>
        <strong>{task?.title || 'Tarefa sem título'}</strong>
        <span>{formatDate(task?.dueDate)} · {priorityLabel(task?.priority)}</span>
      </div>
    </article>
  );
}

function RoutineStep({ eyebrow, title, description, count, onClick }) {
  return (
    <button type="button" className={styles.routineStep} onClick={onClick}>
      <span>{eyebrow}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      <em>{count}</em>
    </button>
  );
}

function ResourceAction({ icon: Icon, title, description, onClick }) {
  return (
    <button type="button" className={styles.resourceAction} onClick={onClick}>
      <span><Icon size={16} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      <ArrowUpRightIcon size={14} />
    </button>
  );
}

function TaskBoardColumn({ title, eyebrow, tasks: columnTasks, emptyText }) {
  return (
    <section className={styles.boardColumn}>
      <div className={styles.boardColumnHeader}>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <em>{columnTasks.length}</em>
      </div>
      <div className={styles.boardColumnList}>
        {!columnTasks.length ? <span className={styles.columnEmpty}>{emptyText}</span> : null}
        {columnTasks.map((task) => <TaskRow key={task.id} task={task} />)}
      </div>
    </section>
  );
}

export default function WorkspacePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('home');
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskQuery, setTaskQuery] = useState('');
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

  const focusTasks = useMemo(() => (
    activeTasks
      .filter((task) => isOverdue(task) || String(task?.priority || '').toLowerCase() === 'critical' || isToday(task))
      .slice(0, 4)
  ), [activeTasks]);

  const filteredActiveTasks = useMemo(() => {
    const query = normalize(taskQuery);
    return activeTasks.filter((task) => {
      const matchesQuery = !query || normalize(`${task?.title || ''} ${task?.clientName || ''} ${task?.projectName || ''} ${task?.typeLabel || ''}`).includes(query);
      if (!matchesQuery) return false;
      if (taskFilter === 'overdue') return isOverdue(task);
      if (taskFilter === 'critical') return String(task?.priority || '').toLowerCase() === 'critical';
      if (taskFilter === 'today') return isToday(task);
      return true;
    });
  }, [activeTasks, taskFilter, taskQuery]);

  const taskBuckets = useMemo(() => {
    const base = activeTab === 'tasks' ? filteredActiveTasks : activeTasks;
    const overdue = base.filter((task) => isOverdue(task));
    const today = base.filter((task) => !isOverdue(task) && isToday(task));
    const week = base.filter((task) => !isOverdue(task) && !isToday(task) && isThisWeek(task));
    const noDue = base.filter((task) => hasNoDueDate(task));
    const next = base.filter((task) => !isOverdue(task) && !isToday(task) && !isThisWeek(task) && !hasNoDueDate(task));
    return { overdue, today, week, noDue, next };
  }, [activeTab, activeTasks, filteredActiveTasks]);

  const visibleTasks = activeTab === 'tasks' ? filteredActiveTasks : activeTasks.slice(0, 5);

  const tabCounters = useMemo(() => ({
    tasks: taskStats.open,
    sheets: 'novo',
  }), [taskStats.open]);

  const routineSteps = useMemo(() => [
    {
      id: 'now',
      eyebrow: 'Agora',
      title: 'Resolver urgências',
      description: taskBuckets.overdue.length ? 'Comece pelas demandas atrasadas e críticas.' : 'Sem atrasos. Mantenha o ritmo das tarefas do dia.',
      count: taskBuckets.overdue.length + taskStats.critical,
      filter: taskBuckets.overdue.length ? 'overdue' : 'critical',
    },
    {
      id: 'today',
      eyebrow: 'Hoje',
      title: 'Executar prazos do dia',
      description: taskBuckets.today.length ? 'Priorize o que vence hoje antes de abrir novos itens.' : 'Nenhuma tarefa com vencimento hoje.',
      count: taskBuckets.today.length,
      filter: 'today',
    },
    {
      id: 'week',
      eyebrow: 'Semana',
      title: 'Organizar próximos passos',
      description: taskBuckets.week.length ? 'Revise as entregas da semana e antecipe gargalos.' : 'Sem prazos relevantes nesta semana.',
      count: taskBuckets.week.length,
      filter: 'all',
    },
  ], [taskBuckets.overdue.length, taskBuckets.today.length, taskBuckets.week.length, taskStats.critical]);

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
                <span>{tab.label}</span>
                {tabCounters[tab.id] ? <em>{tabCounters[tab.id]}</em> : null}
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
                <span>{tab.label}</span>
                {tabCounters[tab.id] ? <em>{tabCounters[tab.id]}</em> : null}
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

            <section className={styles.planningStrip} aria-label="Planejamento pessoal">
              <div className={styles.planningHeader}>
                <span>Planejamento</span>
                <strong>Agenda da semana</strong>
              </div>
              <div className={styles.planningCards}>
                <button type="button" onClick={() => { setActiveTab('tasks'); setTaskFilter('overdue'); }}>
                  <span>Atrasadas</span>
                  <strong>{taskBuckets.overdue.length}</strong>
                </button>
                <button type="button" onClick={() => { setActiveTab('tasks'); setTaskFilter('today'); }}>
                  <span>Hoje</span>
                  <strong>{taskBuckets.today.length}</strong>
                </button>
                <button type="button" onClick={() => setActiveTab('tasks')}>
                  <span>Esta semana</span>
                  <strong>{taskBuckets.week.length}</strong>
                </button>
                <button type="button" onClick={() => setActiveTab('tasks')}>
                  <span>Sem prazo</span>
                  <strong>{taskBuckets.noDue.length}</strong>
                </button>
              </div>
            </section>

            <section className={styles.routinePanel} aria-label="Rotina pessoal">
              <div className={styles.sectionHeader}>
                <span>Rotina</span>
                <strong>Ordem sugerida de execução</strong>
              </div>
              <div className={styles.routineGrid}>
                {routineSteps.map((step) => (
                  <RoutineStep
                    key={step.id}
                    eyebrow={step.eyebrow}
                    title={step.title}
                    description={step.description}
                    count={step.count}
                    onClick={() => { setActiveTab('tasks'); setTaskFilter(step.filter); }}
                  />
                ))}
              </div>
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

                <div className={styles.focusBlock}>
                  <div className={styles.focusHeader}>
                    <span>Prioridade</span>
                    <strong>Foco atual</strong>
                  </div>
                  <div className={styles.focusList}>
                    {tasksLoading ? <span className={styles.inlineState}>Carregando foco...</span> : null}
                    {!tasksLoading && !focusTasks.length ? <span className={styles.inlineState}>Nada crítico no momento.</span> : null}
                    {!tasksLoading ? focusTasks.map((task) => <TaskMiniRow key={task.id} task={task} />) : null}
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
          <section className={styles.tasksArea}>
            <div className={styles.tasksToolbar}>
              <label className={styles.searchBox}>
                <SearchIcon size={15} />
                <input
                  value={taskQuery}
                  onChange={(event) => setTaskQuery(event.target.value)}
                  placeholder="Buscar tarefa, cliente ou projeto"
                />
              </label>
              <div className={styles.filterRail} aria-label="Filtros de tarefas">
                {TASK_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={taskFilter === filter.id ? styles.filterActive : ''}
                    onClick={() => setTaskFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {tasksLoading ? <span className={styles.inlineState}>Carregando tarefas...</span> : null}
            {!tasksLoading && tasksError ? <span className={styles.inlineState}>{tasksError}</span> : null}
            {!tasksLoading && !tasksError ? (
              <div className={styles.personalBoard}>
                <TaskBoardColumn title="Atrasadas" eyebrow="Prioridade" tasks={taskBuckets.overdue} emptyText="Nenhuma tarefa atrasada." />
                <TaskBoardColumn title="Hoje" eyebrow="Execução" tasks={taskBuckets.today} emptyText="Nada com prazo hoje." />
                <TaskBoardColumn title="Esta semana" eyebrow="Próximas" tasks={taskBuckets.week} emptyText="Sem prazos nesta semana." />
                <TaskBoardColumn title="Sem prazo" eyebrow="Backlog" tasks={taskBuckets.noDue} emptyText="Sem itens sem prazo." />
              </div>
            ) : null}

            <div className={styles.completedStrip}>
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

        {activeTab === 'resources' ? (
          <section className={styles.resourcesArea}>
            <div className={styles.resourcesHero}>
              <span>Recursos</span>
              <strong>Atalhos do seu workspace</strong>
            </div>
            <div className={styles.resourceActions}>
              <ResourceAction
                icon={BuildingIcon}
                title="Planilhas pessoais"
                description="Organize controles próprios sem misturar com a operação central."
                onClick={() => setActiveTab('sheets')}
              />
              <ResourceAction
                icon={ChecklistIcon}
                title="Quadro de tarefas"
                description="Acompanhe prazos, atrasos, prioridades e histórico recente."
                onClick={() => setActiveTab('tasks')}
              />
              <ResourceAction
                icon={CalendarIcon}
                title="Planejamento"
                description="Volte para a visão inicial e revise sua agenda da semana."
                onClick={() => setActiveTab('home')}
              />
              <ResourceAction
                icon={SettingsIcon}
                title="Preferências"
                description="Veja o estado atual das configurações do seu espaço pessoal."
                onClick={() => setActiveTab('settings')}
              />
            </div>
          </section>
        ) : null}
        {activeTab === 'settings' ? (
          <section className={styles.settingsGrid}>
            <div className={styles.settingsPanel}>
              <div className={styles.sectionHeader}>
                <span>Workspace</span>
                <strong>Preferências</strong>
              </div>
              <div className={styles.settingsRows}>
                <div><span>Proprietário</span><strong>{displayName}</strong></div>
                <div><span>Planilhas</span><strong>Pessoais</strong></div>
                <div><span>Tarefas</span><strong>Sincronizadas pela API</strong></div>
                <div><span>Visibilidade</span><strong>Espaço individual</strong></div>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
