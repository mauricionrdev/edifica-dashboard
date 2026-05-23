import { useEffect, useMemo, useRef, useState } from 'react';
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

const SIDEBAR_MIN_WIDTH = 72;
const SIDEBAR_DEFAULT_WIDTH = 232;
const SIDEBAR_MAX_WIDTH = 320;
const SIDEBAR_COMPACT_WIDTH = 136;

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


function taskExecutionScore(task) {
  let score = 0;
  if (isOverdue(task)) score += 80;
  if (String(task?.priority || '').toLowerCase() === 'critical') score += 45;
  if (String(task?.priority || '').toLowerCase() === 'high') score += 24;
  if (isToday(task)) score += 30;
  if (isThisWeek(task)) score += 12;
  if (!task?.dueDate) score -= 4;
  return score;
}

function taskExecutionReason(task) {
  if (isOverdue(task)) return 'Atrasada';
  if (String(task?.priority || '').toLowerCase() === 'critical') return 'Crítica';
  if (isToday(task)) return 'Vence hoje';
  if (isThisWeek(task)) return 'Semana';
  if (!task?.dueDate) return 'Sem prazo';
  return 'Próxima';
}

function getDateKey(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dayShortLabel(offset) {
  if (offset === 0) return 'Hoje';
  if (offset === 1) return 'Amanhã';
  const date = new Date(`${getDateKey(offset)}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '');
}

function dayDateLabel(offset) {
  const date = new Date(`${getDateKey(offset)}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
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

function formatLongDate(value) {
  if (!value) return 'Sem prazo definido';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo definido';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function taskContext(task) {
  return task?.clientName || task?.projectName || task?.typeLabel || 'Demanda interna';
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

function TaskRow({ task, active = false, onSelect }) {
  const Element = onSelect ? 'button' : 'article';
  return (
    <Element
      type={onSelect ? 'button' : undefined}
      className={`${styles.taskRow} ${active ? styles.taskRowActive : ''}`.trim()}
      onClick={onSelect ? () => onSelect(task) : undefined}
    >
      <span className={`${styles.taskStatus} ${isDone(task) ? styles.taskStatusDone : ''}`} aria-hidden="true" />
      <div className={styles.taskMain}>
        <strong>{task?.title || 'Tarefa sem título'}</strong>
        <span>{taskContext(task)}</span>
      </div>
      <div className={styles.taskMeta}>
        <span>{statusLabel(task?.status)}</span>
        <em>{priorityLabel(task?.priority)}</em>
        <time className={isOverdue(task) ? styles.overdue : ''}>{formatDate(task?.dueDate)}</time>
      </div>
    </Element>
  );
}

function TaskMiniRow({ task, onSelect }) {
  return (
    <button type="button" className={styles.focusItem} onClick={onSelect ? () => onSelect(task) : undefined}>
      <span className={`${styles.taskStatus} ${isOverdue(task) ? styles.taskStatusHot : ''}`} aria-hidden="true" />
      <div>
        <strong>{task?.title || 'Tarefa sem título'}</strong>
        <span>{formatDate(task?.dueDate)} · {priorityLabel(task?.priority)}</span>
      </div>
    </button>
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


function ExecutionQueue({ tasks: queueTasks, selectedTaskId, onSelectTask, onOpenTasks }) {
  return (
    <section className={styles.executionQueue} aria-label="Fila de execução">
      <div className={styles.sectionHeader}>
        <span>Execução</span>
        <strong>Fila sugerida</strong>
      </div>
      <div className={styles.executionList}>
        {!queueTasks.length ? <span className={styles.inlineState}>Nenhuma tarefa aberta para organizar.</span> : null}
        {queueTasks.map((task, index) => (
          <button
            key={task.id}
            type="button"
            className={`${styles.executionItem} ${String(task.id) === String(selectedTaskId) ? styles.executionItemActive : ''}`.trim()}
            onClick={() => onSelectTask(task)}
          >
            <span className={styles.executionIndex}>{String(index + 1).padStart(2, '0')}</span>
            <div className={styles.executionContent}>
              <strong>{task?.title || 'Tarefa sem título'}</strong>
              <span>{taskContext(task)} · {formatDate(task?.dueDate)}</span>
            </div>
            <em>{taskExecutionReason(task)}</em>
          </button>
        ))}
      </div>
      <button type="button" className={styles.executionOpenButton} onClick={onOpenTasks}>Abrir quadro</button>
    </section>
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

function TaskBoardColumn({ title, eyebrow, tasks: columnTasks, emptyText, selectedTaskId, onSelectTask }) {
  return (
    <section className={styles.boardColumn}>
      <div className={styles.boardColumnHeader}>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <em>{columnTasks.length}</em>
      </div>
      <div className={styles.boardColumnList}>
        {!columnTasks.length ? <span className={styles.columnEmpty}>{emptyText}</span> : null}
        {columnTasks.map((task) => (
          <TaskRow key={task.id} task={task} active={String(task.id) === String(selectedTaskId)} onSelect={onSelectTask} />
        ))}
      </div>
    </section>
  );
}

function TaskInspector({ task, onClear }) {
  if (!task) {
    return (
      <aside className={styles.inspectorPanel}>
        <div className={styles.inspectorEmpty}>
          <span><ChecklistIcon size={18} /></span>
          <strong>Selecione uma tarefa</strong>
          <p>Use o painel lateral para revisar contexto, prazo e prioridade sem sair do workspace.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.inspectorPanel}>
      <div className={styles.inspectorHeader}>
        <span>Detalhes</span>
        <button type="button" onClick={onClear}>Limpar</button>
      </div>
      <div className={styles.inspectorBody}>
        <strong className={styles.inspectorTitle}>{task.title || 'Tarefa sem título'}</strong>
        <span className={styles.inspectorContext}>{taskContext(task)}</span>
        <div className={styles.inspectorMetaGrid}>
          <div><span>Status</span><strong>{statusLabel(task.status)}</strong></div>
          <div><span>Prioridade</span><strong>{priorityLabel(task.priority)}</strong></div>
          <div><span>Prazo</span><strong className={isOverdue(task) ? styles.inspectorDanger : ''}>{formatLongDate(task.dueDate)}</strong></div>
          <div><span>Origem</span><strong>{task.projectName || task.clientName || 'Workspace'}</strong></div>
        </div>
        <div className={styles.inspectorNote}>
          <span>Próxima ação</span>
          <p>{isOverdue(task) ? 'Regularizar a demanda atrasada antes de abrir novas frentes.' : isToday(task) ? 'Executar hoje e atualizar a etapa da tarefa.' : 'Acompanhar no quadro e manter o prazo atualizado.'}</p>
        </div>
      </div>
    </aside>
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
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const pageRef = useRef(null);
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Meu espaço de trabalho';
  const sidebarCompact = sidebarCollapsed || sidebarWidth <= SIDEBAR_COMPACT_WIDTH;

  const activeTabLabel = useMemo(() => TABS.find((tab) => tab.id === activeTab)?.label || 'Início', [activeTab]);

  useEffect(() => {
    if (!sidebarResizing) return undefined;

    function handlePointerMove(event) {
      const left = pageRef.current?.getBoundingClientRect?.().left || 0;
      const nextWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(event.clientX - left)));
      setSidebarWidth(nextWidth);
      setSidebarCollapsed(false);
    }

    function handlePointerUp() {
      setSidebarResizing(false);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [sidebarResizing]);

  function toggleSidebar() {
    setSidebarCollapsed((value) => !value);
  }

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

  const selectedTask = useMemo(() => tasks.find((task) => String(task.id) === String(selectedTaskId)) || null, [selectedTaskId, tasks]);

  function handleSelectTask(task) {
    setSelectedTaskId(task?.id || null);
  }

  const focusTasks = useMemo(() => (
    activeTasks
      .filter((task) => isOverdue(task) || String(task?.priority || '').toLowerCase() === 'critical' || isToday(task))
      .slice(0, 4)
  ), [activeTasks]);


  const executionQueue = useMemo(() => (
    activeTasks
      .slice()
      .sort((a, b) => {
        const scoreDiff = taskExecutionScore(b) - taskExecutionScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return String(a?.dueDate || '9999-12-31').localeCompare(String(b?.dueDate || '9999-12-31'));
      })
      .slice(0, 5)
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

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => String(task.id) === String(selectedTaskId))) setSelectedTaskId(null);
  }, [selectedTaskId, tasks]);

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

  const weekAgenda = useMemo(() => (
    Array.from({ length: 7 }, (_, index) => {
      const key = getDateKey(index);
      const dayTasks = activeTasks.filter((task) => String(task?.dueDate || '').slice(0, 10) === key);
      const critical = dayTasks.filter((task) => String(task?.priority || '').toLowerCase() === 'critical').length;
      return {
        id: key,
        offset: index,
        label: dayShortLabel(index),
        date: dayDateLabel(index),
        count: dayTasks.length,
        critical,
      };
    })
  ), [activeTasks]);

  const contextSummary = useMemo(() => {
    const groups = new Map();
    activeTasks.forEach((task) => {
      const key = taskContext(task);
      const current = groups.get(key) || { label: key, total: 0, overdue: 0, critical: 0 };
      current.total += 1;
      if (isOverdue(task)) current.overdue += 1;
      if (String(task?.priority || '').toLowerCase() === 'critical') current.critical += 1;
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .sort((a, b) => (b.overdue + b.critical + b.total) - (a.overdue + a.critical + a.total))
      .slice(0, 5);
  }, [activeTasks]);

  return (
    <main ref={pageRef} className={`${styles.page} ${sidebarCompact ? styles.pageCompact : ''}`.trim()} style={{ '--workspace-sidebar-width': sidebarCollapsed ? `${SIDEBAR_MIN_WIDTH}px` : `${sidebarWidth}px` }}>
      <aside className={`${styles.sidebar} ${sidebarCompact ? styles.sidebarCompact : ''}`.trim()} aria-label="Meu espaço de trabalho">
        <div className={styles.sidebarHeader}>
          <span className={styles.brandMark}>edi</span>
          <div className={styles.sidebarTitle}>
            <strong>Workspace</strong>
            <span>pessoal</span>
          </div>
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            title={sidebarCollapsed ? 'Expandir' : 'Recolher'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
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
          <Link to="/" className={styles.backButton}><HomeIcon size={15} /> <span>Voltar para a central</span></Link>
        </div>
        <button
          type="button"
          className={styles.sidebarResizeHandle}
          aria-label="Ajustar largura da sidebar"
          onPointerDown={(event) => {
            event.preventDefault();
            setSidebarResizing(true);
          }}
        />
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

            <ExecutionQueue
              tasks={executionQueue}
              selectedTaskId={selectedTaskId}
              onSelectTask={(task) => { handleSelectTask(task); setActiveTab('tasks'); }}
              onOpenTasks={() => setActiveTab('tasks')}
            />

            <section className={styles.personalPulse} aria-label="Pulso do workspace">
              <div className={styles.weekPanel}>
                <div className={styles.sectionHeader}>
                  <span>Semana</span>
                  <strong>Mapa dos próximos dias</strong>
                </div>
                <div className={styles.weekGrid}>
                  {weekAgenda.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      className={`${styles.weekDay} ${day.offset === 0 ? styles.weekDayToday : ''}`.trim()}
                      onClick={() => { setActiveTab('tasks'); setTaskFilter(day.offset === 0 ? 'today' : 'all'); }}
                    >
                      <span>{day.label}</span>
                      <strong>{day.date}</strong>
                      <em>{day.count}</em>
                      {day.critical ? <small>{day.critical} crítica{day.critical > 1 ? 's' : ''}</small> : <small>normal</small>}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.contextPanel}>
                <div className={styles.sectionHeader}>
                  <span>Contextos</span>
                  <strong>Carga por origem</strong>
                </div>
                <div className={styles.contextList}>
                  {!contextSummary.length ? <span className={styles.inlineState}>Nenhuma origem com tarefa aberta.</span> : null}
                  {contextSummary.map((item) => (
                    <button key={item.label} type="button" className={styles.contextRow} onClick={() => { setActiveTab('tasks'); setTaskQuery(item.label); }}>
                      <span>{item.label}</span>
                      <strong>{item.total}</strong>
                      <em>{item.overdue ? `${item.overdue} atrasada${item.overdue > 1 ? 's' : ''}` : item.critical ? `${item.critical} crítica${item.critical > 1 ? 's' : ''}` : 'em dia'}</em>
                    </button>
                  ))}
                </div>
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
                    {!tasksLoading ? focusTasks.map((task) => <TaskMiniRow key={task.id} task={task} onSelect={handleSelectTask} />) : null}
                  </div>
                </div>
              </div>

              <div className={styles.timelinePanel}>
                <div className={styles.sectionHeader}>
                  <span>Próximas</span>
                  <strong>Tarefas em aberto</strong>
                </div>
                <div className={styles.taskList}>
                  <ExecutionQueue
              tasks={executionQueue}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onOpenTasks={() => setTaskFilter('all')}
            />

            {tasksLoading ? <span className={styles.inlineState}>Carregando tarefas...</span> : null}
                  {!tasksLoading && tasksError ? <span className={styles.inlineState}>{tasksError}</span> : null}
                  {!tasksLoading && !tasksError && !visibleTasks.length ? <span className={styles.inlineState}>Nenhuma tarefa aberta.</span> : null}
                  {!tasksLoading && !tasksError ? visibleTasks.map((task) => <TaskRow key={task.id} task={task} active={String(task.id) === String(selectedTaskId)} onSelect={handleSelectTask} />) : null}
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
              <div className={styles.tasksLayout}>
                <div className={styles.personalBoard}>
                  <TaskBoardColumn title="Atrasadas" eyebrow="Prioridade" tasks={taskBuckets.overdue} emptyText="Nenhuma tarefa atrasada." selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                  <TaskBoardColumn title="Hoje" eyebrow="Execução" tasks={taskBuckets.today} emptyText="Nada com prazo hoje." selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                  <TaskBoardColumn title="Esta semana" eyebrow="Próximas" tasks={taskBuckets.week} emptyText="Sem prazos nesta semana." selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                  <TaskBoardColumn title="Sem prazo" eyebrow="Backlog" tasks={taskBuckets.noDue} emptyText="Sem itens sem prazo." selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                </div>
                <TaskInspector task={selectedTask} onClear={() => setSelectedTaskId(null)} />
              </div>
            ) : null}

            <div className={styles.completedStrip}>
              <div className={styles.sectionHeader}>
                <span>Histórico</span>
                <strong>Concluídas recentes</strong>
              </div>
              <div className={styles.taskList}>
                {!completedTasks.length ? <span className={styles.inlineState}>Nenhuma tarefa concluída recente.</span> : null}
                {completedTasks.map((task) => <TaskRow key={task.id} task={task} active={String(task.id) === String(selectedTaskId)} onSelect={handleSelectTask} />)}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'sheets' ? (
          <section className={styles.sheetSection} aria-label="Planilhas pessoais">
            <div className={styles.sheetHeader}>
              <div>
                <span>Planilhas</span>
                <strong>Área de controles pessoais</strong>
              </div>
              <button type="button" onClick={() => setActiveTab('home')}>Voltar ao início</button>
            </div>
            <div className={styles.sheetShell}>
              <UserSpreadsheetPanel ownerUserId={user?.id} canEdit showToast={showToast} />
            </div>
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
