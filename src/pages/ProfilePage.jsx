import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/auth.js';
import {
  createTask,
  createTaskComment,
  deleteTaskComment,
  listMyProjectTasks,
  listTaskComments,
  updateTask as updateProjectTask,
} from '../api/projects.js';
import { listUserDirectory } from '../api/users.js';
import { listClients } from '../api/clients.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { roleLabel } from '../utils/roles.js';
import { normalizeSlug } from '../utils/slugs.js';
import {
  getUserAvatar,
  readAvatarFile,
  removeUserAvatar,
  saveUserAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import Select from '../components/ui/Select.jsx';
import DateField from '../components/ui/DateField.jsx';
import StateBlock from '../components/ui/StateBlock.jsx';
import { CloseIcon, SettingsIcon, TrashIcon } from '../components/ui/Icons.jsx';
import styles from './ProfilePage.module.css';

const AVATAR_OPTIONS = [
  { value: 'amber', label: 'Âmbar' },
  { value: 'blue', label: 'Azul' },
  { value: 'violet', label: 'Violeta' },
  { value: 'emerald', label: 'Esmeralda' },
  { value: 'rose', label: 'Rose' },
  { value: 'slate', label: 'Grafite' },
];

const SETTINGS_TABS = [
  { value: 'profile', label: 'Perfil' },
  { value: 'account', label: 'Conta' },
];

const DEMAND_TYPES = [
  { value: 'support', label: 'Suporte' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'routine', label: 'Rotina' },
  { value: 'bug', label: 'Bug' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'access', label: 'Acesso' },
  { value: 'other', label: 'Outro' },
];

const DEMAND_PRIORITIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

const BASE_STATUS_OPTIONS = [
  { value: 'todo', label: 'Aberta' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'canceled', label: 'Cancelada' },
];

const STATUS_OPTIONS_BY_KIND = {
  briefing: [
    { value: 'todo', label: 'Novo' },
    { value: 'in_progress', label: 'Em execução' },
    { value: 'done', label: 'Implementado' },
    { value: 'canceled', label: 'Cancelado' },
  ],
  routine: [
    { value: 'todo', label: 'Pendente' },
    { value: 'in_progress', label: 'Em execução' },
    { value: 'done', label: 'Feita' },
    { value: 'canceled', label: 'Pulada' },
  ],
  support: [
    { value: 'todo', label: 'Aberto' },
    { value: 'in_progress', label: 'Em análise' },
    { value: 'done', label: 'Resolvido' },
    { value: 'canceled', label: 'Cancelado' },
  ],
  bug: [
    { value: 'todo', label: 'Aberto' },
    { value: 'in_progress', label: 'Em correção' },
    { value: 'done', label: 'Resolvido' },
    { value: 'canceled', label: 'Cancelado' },
  ],
};

function emptyDemandForm(userId = '') {
  return {
    type: 'support',
    title: '',
    description: '',
    assigneeUserId: userId,
    clientId: '',
    dueDate: '',
    priority: 'medium',
    officeName: '',
    objective: '',
    campaign: '',
    channels: '',
    attendants: '',
    greeting: '',
    location: '',
    notes: '',
    recurrence: 'daily',
    routineScope: '',
    routineChecklist: '',
  };
}

function emptyHandoffForm(userId = '', status = 'in_progress') {
  return {
    assigneeUserId: userId,
    status,
    note: '',
  };
}

function demandTypeLabel(type) {
  return DEMAND_TYPES.find((item) => item.value === type)?.label || 'Demanda';
}

function buildDemandDescription(form, clientName = '') {
  const type = demandTypeLabel(form.type);
  const lines = [`Tipo: ${type}`];

  if (clientName) lines.push(`Cliente: ${clientName}`);

  if (form.type === 'briefing') {
    const briefingLines = [
      ['Nome do escritório', form.officeName],
      ['Objetivo', form.objective],
      ['Nicho/campanha', form.campaign],
      ['Canais', form.channels],
      ['Atendentes', form.attendants],
      ['Saudação', form.greeting],
      ['Localização', form.location],
      ['Observações', form.notes],
    ]
      .filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `${label}: ${String(value).trim()}`);

    if (briefingLines.length) {
      lines.push('', 'Briefing', ...briefingLines);
    }
  }

  if (form.type === 'routine') {
    const routineLines = [
      ['Recorrência', recurrenceLabel(form.recurrence)],
      ['Escopo', form.routineScope],
      ['Checklist', form.routineChecklist],
    ]
      .filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `${label}: ${String(value).trim()}`);

    if (routineLines.length) {
      lines.push('', 'Rotina', ...routineLines);
    }
  }

  const freeDescription = String(form.description || '').trim();
  if (freeDescription) lines.push('', freeDescription);

  return lines.join('\n');
}

const ROUTINE_RECURRENCES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

function recurrenceLabel(value) {
  return ROUTINE_RECURRENCES.find((item) => item.value === value)?.label || value || '';
}


const BRIEFING_FIELDS = [
  { key: 'officeName', label: 'Escritório', source: 'Nome do escritório', required: true },
  { key: 'objective', label: 'Objetivo', source: 'Objetivo', required: true },
  { key: 'campaign', label: 'Nicho/campanha', source: 'Nicho/campanha', required: true },
  { key: 'channels', label: 'Canais', source: 'Canais', required: true },
  { key: 'attendants', label: 'Atendentes', source: 'Atendentes', required: true },
  { key: 'greeting', label: 'Saudação', source: 'Saudação', required: true },
  { key: 'location', label: 'Localização', source: 'Localização', required: true },
  { key: 'notes', label: 'Observações', source: 'Observações', required: false },
];

function parseBriefingDescription(description = '') {
  const rawLines = String(description || '').split(/\r?\n/);
  const values = {};
  const consumed = new Set();

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    BRIEFING_FIELDS.forEach((field) => {
      const prefix = `${field.source}:`;
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        values[field.key] = trimmed.slice(prefix.length).trim();
        consumed.add(index);
      }
    });

    if (/^(tipo|cliente):/i.test(trimmed) || /^briefing$/i.test(trimmed) || !trimmed) {
      consumed.add(index);
    }
  });

  const required = BRIEFING_FIELDS.filter((field) => field.required);
  const filledRequired = required.filter((field) => String(values[field.key] || '').trim()).length;
  const extraDescription = rawLines
    .filter((line, index) => !consumed.has(index) && line.trim())
    .join('\n')
    .trim();

  return {
    values,
    extraDescription,
    completion: required.length ? Math.round((filledRequired / required.length) * 100) : 100,
    isComplete: filledRequired === required.length,
    filledRequired,
    requiredTotal: required.length,
  };
}

const ROUTINE_FIELDS = [
  { key: 'recurrence', label: 'Recorrência', source: 'Recorrência' },
  { key: 'scope', label: 'Escopo', source: 'Escopo' },
  { key: 'checklist', label: 'Checklist', source: 'Checklist' },
];

function parseStructuredBlock(description = '', title = '', fields = []) {
  const rawLines = String(description || '').split(/\r?\n/);
  const values = {};
  const consumed = new Set();

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    fields.forEach((field) => {
      const prefix = `${field.source}:`;
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        values[field.key] = trimmed.slice(prefix.length).trim();
        consumed.add(index);
      }
    });

    if (/^(tipo|cliente):/i.test(trimmed) || trimmed.toLowerCase() === title.toLowerCase() || !trimmed) {
      consumed.add(index);
    }
  });

  const extraDescription = rawLines
    .filter((line, index) => !consumed.has(index) && line.trim())
    .join('\n')
    .trim();

  return { values, extraDescription };
}

function parseRoutineDescription(description = '') {
  return parseStructuredBlock(description, 'Rotina', ROUTINE_FIELDS);
}

function clientSearchText(client) {
  return normalizeText([client?.name, client?.companyName, client?.squadName, client?.managerName, client?.gdvName].filter(Boolean).join(' '));
}


const OPERATION_TABS = [
  { value: 'today', label: 'Hoje' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'briefing', label: 'Briefings' },
  { value: 'routine', label: 'Rotinas' },
  { value: 'support', label: 'Suporte' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'done', label: 'Concluídas' },
];

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function dateKey(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getTodayKey() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function formatDueLabel(value) {
  const key = dateKey(value);
  if (!key) return 'Sem prazo';

  const diff = Math.round((key - getTodayKey()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isDone(task) {
  return task?.done || task?.status === 'done';
}

function isOverdue(task) {
  if (isDone(task) || !task?.dueDate) return false;
  const key = dateKey(task.dueDate);
  return key ? key < getTodayKey() : false;
}

function isToday(task) {
  if (isDone(task) || !task?.dueDate) return false;
  const key = dateKey(task.dueDate);
  return key ? key === getTodayKey() : false;
}

function getTaskKind(task) {
  const haystack = normalizeText([
    task?.title,
    task?.description,
    task?.projectName,
    task?.sectionName,
    task?.metadata?.type,
    task?.metadata?.origin,
  ].filter(Boolean).join(' '));

  if (/briefing|implementacao|implementado|implementar|setup|onboarding/.test(haystack)) return 'briefing';
  if (/pente fino|diario|diaria|rotina|recorrente|auditoria/.test(haystack)) return 'routine';
  if (/suporte|bug|erro|acesso|permissao|conexao|desconectado|ajuste|corrigir|problema/.test(haystack)) return 'support';
  if (task?.projectId || task?.projectName) return 'project';
  return 'demand';
}

function kindLabel(kind) {
  const labels = {
    briefing: 'Briefing',
    routine: 'Rotina',
    support: 'Suporte',
    project: 'Projeto',
    demand: 'Demanda',
  };
  return labels[kind] || 'Demanda';
}

function statusOptionsForKind(kind) {
  return STATUS_OPTIONS_BY_KIND[kind] || BASE_STATUS_OPTIONS;
}

function statusLabel(task) {
  const kind = getTaskKind(task);
  if (isOverdue(task) && !isDone(task) && task?.status !== 'canceled') return 'Atrasada';
  const value = isDone(task) ? 'done' : task?.status || 'todo';
  const label = statusOptionsForKind(kind).find((option) => option.value === value)?.label;
  if (label) return label;
  if (isToday(task)) return 'Hoje';
  return 'Aguardando';
}

function statusKey(task) {
  if (task?.status === 'canceled') return 'canceled';
  if (isDone(task)) return 'done';
  if (isOverdue(task)) return 'overdue';
  if (task?.status === 'in_progress') return 'active';
  if (isToday(task)) return 'today';
  return 'waiting';
}

function priorityLabel(value) {
  const labels = { low: 'Baixa', medium: 'Normal', high: 'Alta', critical: 'Crítica' };
  return labels[value] || labels.medium;
}

function nextActionLabel(task) {
  if (!task) return '';
  if (task.status === 'canceled') return 'Encerrada';
  const kind = getTaskKind(task);
  if (kind === 'briefing' && isDone(task)) return 'Aguardando ativação';
  if (kind === 'support' && isDone(task)) return 'Resolvido';
  if (kind === 'routine' && isDone(task)) return 'Rotina feita';
  if (isDone(task)) return 'Concluída';
  if (isOverdue(task)) return 'Regularizar prazo';
  if (kind === 'briefing') return 'Validar briefing';
  if (kind === 'routine') return 'Executar rotina';
  if (kind === 'support') return 'Analisar solicitação';
  if (kind === 'project') return 'Executar tarefa do projeto';
  return 'Executar demanda';
}

function workflowStepsForTask(task) {
  const kind = getTaskKind(task);
  const status = task?.status || 'todo';
  const done = isDone(task);

  if (kind === 'briefing') {
    return [
      { key: 'briefing', label: 'Briefing', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'execution', label: 'Execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'implemented', label: 'Implementado', state: done ? 'current' : 'pending' },
      { key: 'activation', label: 'Ativação', state: done ? 'pending' : 'locked' },
    ];
  }

  if (kind === 'routine') {
    return [
      { key: 'pending', label: 'Pendente', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'execution', label: 'Execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'done', label: 'Feita', state: done ? 'current' : 'pending' },
    ];
  }

  if (kind === 'support') {
    return [
      { key: 'open', label: 'Aberto', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'analysis', label: 'Análise', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'resolved', label: 'Resolvido', state: done ? 'current' : 'pending' },
    ];
  }

  return [
    { key: 'open', label: 'Aberta', state: done || status !== 'todo' ? 'done' : 'current' },
    { key: 'progress', label: 'Execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
    { key: 'done', label: 'Concluída', state: done ? 'current' : 'pending' },
  ];
}

function getOperationCounts(tasks) {
  return {
    today: tasks.filter(isToday).length,
    overdue: tasks.filter(isOverdue).length,
    briefing: tasks.filter((task) => !isDone(task) && getTaskKind(task) === 'briefing').length,
    routine: tasks.filter((task) => !isDone(task) && getTaskKind(task) === 'routine').length,
    support: tasks.filter((task) => !isDone(task) && getTaskKind(task) === 'support').length,
    waiting: tasks.filter((task) => !isDone(task) && !isToday(task) && !isOverdue(task)).length,
    done: tasks.filter(isDone).length,
  };
}

function getVisibleTasks(tasks, tab) {
  const filtered = tasks.filter((task) => {
    if (tab === 'done') return isDone(task);
    if (tab === 'overdue') return isOverdue(task);
    if (tab === 'today') return isToday(task);
    if (tab === 'briefing') return !isDone(task) && getTaskKind(task) === 'briefing';
    if (tab === 'routine') return !isDone(task) && getTaskKind(task) === 'routine';
    if (tab === 'support') return !isDone(task) && getTaskKind(task) === 'support';
    return !isDone(task) && !isToday(task) && !isOverdue(task);
  });

  return filtered.sort((a, b) => {
    const aDone = isDone(a);
    const bDone = isDone(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });
}

function taskSearchText(task) {
  return normalizeText([
    task?.title,
    task?.description,
    task?.clientName,
    task?.projectName,
    task?.sectionName,
    task?.assigneeName,
    task?.createdByName,
    kindLabel(getTaskKind(task)),
    statusLabel(task),
    formatDueLabel(task?.dueDate),
  ].filter(Boolean).join(' '));
}

function filterOperationTasks(tasks, query) {
  const term = normalizeText(query).trim();
  if (!term) return tasks;
  return tasks.filter((task) => taskSearchText(task).includes(term));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function metaValue(value) {
  return value || '—';
}

export default function ProfilePage() {
  const { setPanelHeader, squads = [] } = useOutletContext();
  const { user, reloadUser } = useAuth();
  const { showToast } = useToast();
  const avatarInputRef = useRef(null);
  const clientSearchRef = useRef(null);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    avatarColor: user?.avatarColor || 'amber',
    customSlug: user?.customSlug || '',
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [operationTab, setOperationTab] = useState('waiting');
  const [operationSearch, setOperationSearch] = useState('');
  const [tasks, setTasks] = useState([]);
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(() => getUserAvatar(user));
  const [activeTaskId, setActiveTaskId] = useState('');
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [demandForm, setDemandForm] = useState(() => emptyDemandForm(user?.id || ''));
  const [demandUsers, setDemandUsers] = useState([]);
  const [demandClients, setDemandClients] = useState([]);
  const [demandSaving, setDemandSaving] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [taskComments, setTaskComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentDeleteTarget, setCommentDeleteTarget] = useState(null);
  const [commentDeleting, setCommentDeleting] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffForm, setHandoffForm] = useState(() => emptyHandoffForm(user?.id || ''));
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [completionDraft, setCompletionDraft] = useState('');
  const [completionSaving, setCompletionSaving] = useState(false);

  useEffect(() => {
    setPanelHeader({ title: 'Perfil', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      phone: user?.phone || '',
      avatarColor: user?.avatarColor || 'amber',
      customSlug: user?.customSlug || '',
    });
  }, [user?.name, user?.phone, user?.avatarColor, user?.customSlug]);

  useEffect(() => {
    setDemandForm((prev) => ({ ...prev, assigneeUserId: prev.assigneeUserId || user?.id || '' }));
  }, [user?.id]);

  useEffect(() => {
    setAvatarUrl(getUserAvatar(user));
    return subscribeAvatarChange(() => setAvatarUrl(getUserAvatar(user)));
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([listUserDirectory(), listClients()]).then(([usersRes, clientsRes]) => {
      if (cancelled) return;
      if (usersRes.status === 'fulfilled') {
        setDemandUsers(Array.isArray(usersRes.value?.users) ? usersRes.value.users : []);
      }
      if (clientsRes.status === 'fulfilled') {
        setDemandClients(Array.isArray(clientsRes.value?.clients) ? clientsRes.value.clients : []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    setTasksError('');

    listMyProjectTasks()
      .then((res) => {
        if (!cancelled) setTasks(Array.isArray(res?.tasks) ? res.tasks : []);
      })
      .catch((err) => {
        if (!cancelled) setTasksError(err?.message || 'Erro');
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      setActiveTaskId('');
      setSettingsOpen(false);
      setDemandModalOpen(false);
      setClientSearchOpen(false);
      setHandoffOpen(false);
      setCompletionTarget(null);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!clientSearchOpen) return undefined;

    function handlePointerDown(event) {
      if (clientSearchRef.current?.contains(event.target)) return;
      setClientSearchOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [clientSearchOpen]);

  useEffect(() => {
    if (demandModalOpen) return;
    setClientSearchOpen(false);
  }, [demandModalOpen]);

  useEffect(() => {
    setCommentDraft('');
    setSubtaskDraft('');
    setTaskComments([]);
    setHandoffOpen(false);

    if (!activeTaskId) return undefined;

    let cancelled = false;
    setCommentsLoading(true);
    listTaskComments(activeTaskId)
      .then((res) => {
        if (!cancelled) setTaskComments(Array.isArray(res?.comments) ? res.comments : []);
      })
      .catch(() => {
        if (!cancelled) setTaskComments([]);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTaskId]);

  const squadNames = useMemo(() => {
    const map = new Map((squads || []).map((item) => [item.id, item.name]));
    return (user?.squads || []).map((id) => map.get(id) || id);
  }, [squads, user?.squads]);

  const operationCounts = useMemo(() => getOperationCounts(tasks), [tasks]);
  const tabTasks = useMemo(() => getVisibleTasks(tasks, operationTab), [operationTab, tasks]);
  const visibleTasks = useMemo(() => filterOperationTasks(tabTasks, operationSearch), [operationSearch, tabTasks]);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [activeTaskId, tasks]);
  const activeSubtasks = useMemo(() => (activeTask ? tasks.filter((task) => task.parentTaskId === activeTask.id) : []), [activeTask, tasks]);
  const completionRate = tasks.length ? Math.round((operationCounts.done / tasks.length) * 100) : 0;

  async function handleSaveProfile() {
    try {
      setSavingProfile(true);
      await updateProfile(profileForm);
      await reloadUser();
      showToast('Perfil atualizado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar.', { variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    try {
      setSavingPassword(true);
      await changePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      showToast('Senha atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao alterar senha.', { variant: 'error' });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await readAvatarFile(file);
      await updateProfile({ avatarUrl: dataUrl });
      await reloadUser();
      const saved = saveUserAvatar(user, dataUrl) || true;
      if (!saved) throw new Error('Erro');
      setAvatarUrl(dataUrl);
      showToast('Foto atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar foto.', { variant: 'error' });
    }
  }

  async function handleRemoveAvatar() {
    try {
      await updateProfile({ avatarUrl: '' });
      await reloadUser();
      removeUserAvatar(user);
      setAvatarUrl('');
      showToast('Foto removida.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao remover foto.', { variant: 'error' });
    }
  }

  async function handleUpdateTaskFields(task, patch, successMessage = 'Demanda atualizada.') {
    if (!task?.id) return;

    try {
      setTaskUpdatingId(task.id);
      const res = await updateProjectTask(task.id, patch);
      const nextTask = res?.task || { ...task, ...patch };
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, ...nextTask } : item)));
      showToast(successMessage, { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao atualizar demanda.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }

  async function handleToggleTask(task) {
    if (!task?.id) return;

    if (!isDone(task) && !task.parentTaskId) {
      setCompletionTarget(task);
      setCompletionDraft('');
      return;
    }

    try {
      setTaskUpdatingId(task.id);
      const nextDone = !isDone(task);
      const nextStatus = nextDone ? 'done' : 'todo';
      await updateProjectTask(task.id, { done: nextDone, status: nextStatus });
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, done: nextDone, status: nextStatus } : item)));
      showToast(nextDone ? 'Tarefa concluída.' : 'Tarefa reaberta.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao atualizar tarefa.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }

  async function handleCompleteWithRecord(event) {
    event.preventDefault();
    if (!completionTarget?.id) return;

    const record = completionDraft.trim();
    const kind = getTaskKind(completionTarget);
    const body = [
      kind === 'briefing' ? 'Implementação concluída.' : 'Demanda concluída.',
      record,
    ].filter(Boolean).join('\n\n');

    try {
      setCompletionSaving(true);
      const [taskRes, commentRes] = await Promise.allSettled([
        updateProjectTask(completionTarget.id, { done: true, status: 'done' }),
        body ? createTaskComment(completionTarget.id, { body }) : Promise.resolve(null),
      ]);

      if (taskRes.status === 'rejected') throw taskRes.reason;
      const updated = taskRes.value?.task || { ...completionTarget, done: true, status: 'done' };
      setTasks((prev) => prev.map((item) => (item.id === completionTarget.id ? { ...item, ...updated, done: true, status: 'done' } : item)));
      if (activeTaskId === completionTarget.id && commentRes.status === 'fulfilled' && commentRes.value?.comment) {
        setTaskComments((prev) => [...prev, commentRes.value.comment]);
      }
      setCompletionTarget(null);
      setCompletionDraft('');
      showToast('Demanda concluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao concluir demanda.', { variant: 'error' });
    } finally {
      setCompletionSaving(false);
    }
  }


  async function handleCreateSubtask(event) {
    event.preventDefault();
    if (!activeTask) return;
    const title = subtaskDraft.trim();
    if (!title) return;

    try {
      setSubtaskSaving(true);
      const res = await createTask({
        title,
        parentTaskId: activeTask.id,
        projectId: activeTask.projectId || undefined,
        sectionId: activeTask.sectionId || undefined,
        clientId: activeTask.clientId || undefined,
        assigneeUserId: activeTask.assigneeUserId || user?.id || undefined,
        priority: activeTask.priority || 'medium',
      });
      if (res?.task) setTasks((prev) => [...prev, res.task]);
      setSubtaskDraft('');
      showToast('Subtarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar subtarefa.', { variant: 'error' });
    } finally {
      setSubtaskSaving(false);
    }
  }

  async function handleCreateComment(event) {
    event.preventDefault();
    if (!activeTask) return;
    const body = commentDraft.trim();
    if (!body) return;

    try {
      setCommentSaving(true);
      const res = await createTaskComment(activeTask.id, { body });
      if (res?.comment) setTaskComments((prev) => [...prev, res.comment]);
      setCommentDraft('');
      showToast('Comentário adicionado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao comentar.', { variant: 'error' });
    } finally {
      setCommentSaving(false);
    }
  }


  function openHandoff(task = activeTask) {
    if (!task) return;
    const nextStatus = isDone(task) ? 'done' : task.status || 'in_progress';
    setHandoffForm(emptyHandoffForm(task.assigneeUserId || user?.id || '', nextStatus));
    setHandoffOpen(true);
  }

  async function handleSubmitHandoff(event) {
    event.preventDefault();
    if (!activeTask || !handoffForm.assigneeUserId) return;

    const nextAssignee = assigneeOptions.find((item) => item.id === handoffForm.assigneeUserId);
    const nextStatusLabel = statusOptionsForKind(activeKind).find((option) => option.value === handoffForm.status)?.label || handoffForm.status;
    const lines = [
      `Handoff: ${nextAssignee?.name || 'Responsável'}`,
      `Status: ${nextStatusLabel}`,
      handoffForm.note.trim(),
    ].filter(Boolean);

    try {
      setHandoffSaving(true);
      const updateBody = {
        assigneeUserId: handoffForm.assigneeUserId,
        status: handoffForm.status,
        done: handoffForm.status === 'done',
      };
      const [taskRes, commentRes] = await Promise.allSettled([
        updateProjectTask(activeTask.id, updateBody),
        createTaskComment(activeTask.id, { body: lines.join('\n') }),
      ]);

      if (taskRes.status === 'rejected') throw taskRes.reason;
      const updated = taskRes.value?.task || { ...activeTask, ...updateBody, assigneeName: nextAssignee?.name || activeTask.assigneeName };
      setTasks((prev) => prev.map((item) => (item.id === activeTask.id ? { ...item, ...updated } : item)));
      if (commentRes.status === 'fulfilled' && commentRes.value?.comment) {
        setTaskComments((prev) => [...prev, commentRes.value.comment]);
      }
      setHandoffOpen(false);
      setCompletionTarget(null);
      showToast('Handoff registrado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao registrar handoff.', { variant: 'error' });
    } finally {
      setHandoffSaving(false);
    }
  }

  async function handleDeleteComment() {
    if (!activeTask || !commentDeleteTarget?.id) return;

    try {
      setCommentDeleting(true);
      await deleteTaskComment(activeTask.id, commentDeleteTarget.id);
      setTaskComments((prev) => prev.filter((comment) => comment.id !== commentDeleteTarget.id));
      setCommentDeleteTarget(null);
      showToast('Comentário excluído.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao excluir comentário.', { variant: 'error' });
    } finally {
      setCommentDeleting(false);
    }
  }

  async function handleOpenDemandModal() {
    setDemandForm((prev) => ({ ...emptyDemandForm(user?.id || ''), assigneeUserId: prev.assigneeUserId || user?.id || '' }));
    setClientQuery('');
    setClientSearchOpen(false);
    setDemandModalOpen(true);

    try {
      const [usersRes, clientsRes] = await Promise.allSettled([listUserDirectory(), listClients()]);
      if (usersRes.status === 'fulfilled') {
        const nextUsers = Array.isArray(usersRes.value?.users) ? usersRes.value.users : [];
        setDemandUsers(nextUsers);
        setDemandForm((prev) => ({ ...prev, assigneeUserId: prev.assigneeUserId || nextUsers[0]?.id || user?.id || '' }));
      }
      if (clientsRes.status === 'fulfilled') {
        setDemandClients(Array.isArray(clientsRes.value?.clients) ? clientsRes.value.clients : []);
      }
    } catch {
      // silencioso: a criação de demanda continua com dados disponíveis.
    }
  }

  async function handleCreateDemand(event) {
    event.preventDefault();
    const title = demandForm.title.trim();
    if (!title) {
      showToast('Título obrigatório.', { variant: 'error' });
      return;
    }
    if (!demandForm.assigneeUserId) {
      showToast('Responsável obrigatório.', { variant: 'error' });
      return;
    }

    const selectedClient = demandClients.find((client) => client.id === demandForm.clientId);
    const description = buildDemandDescription(demandForm, selectedClient?.name || '');

    try {
      setDemandSaving(true);
      const res = await createTask({
        title,
        description,
        assigneeUserId: demandForm.assigneeUserId,
        clientId: demandForm.clientId || undefined,
        dueDate: demandForm.dueDate || undefined,
        priority: demandForm.priority,
      });
      const createdTask = res?.task;
      if (createdTask?.assigneeUserId === user?.id) {
        setTasks((prev) => [createdTask, ...prev]);
      }
      setDemandModalOpen(false);
      setDemandForm(emptyDemandForm(user?.id || ''));
      setClientQuery('');
      setClientSearchOpen(false);
      showToast('Demanda criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar demanda.', { variant: 'error' });
    } finally {
      setDemandSaving(false);
    }
  }

  const activeKind = activeTask ? getTaskKind(activeTask) : 'demand';
  const activeStatus = activeTask ? statusKey(activeTask) : 'waiting';
  const activeStatusOptions = activeTask ? statusOptionsForKind(activeKind) : BASE_STATUS_OPTIONS;
  const activeWorkflowSteps = activeTask ? workflowStepsForTask(activeTask) : [];
  const activeAssignee = activeTask ? activeTask.assigneeName || profileForm.name || user?.name || '' : '';
  const activeRequester = activeTask ? activeTask.createdByName || '' : '';
  const activeContextItems = activeTask
    ? [
        ['Tipo', kindLabel(activeKind)],
        ...(activeRequester && activeRequester !== activeAssignee ? [['Solicitante', activeRequester]] : []),
        ...(activeTask.clientName ? [['Cliente', activeTask.clientName]] : []),
        ...(activeTask.projectName ? [['Projeto', activeTask.projectName]] : []),
        ...(activeTask.sectionName ? [['Seção', activeTask.sectionName]] : []),
      ]
    : [];
  const assigneeOptions = useMemo(() => {
    const map = new Map();
    [...(demandUsers || []), user].filter(Boolean).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    if (activeTask?.assigneeUserId && activeTask?.assigneeName && !map.has(activeTask.assigneeUserId)) {
      map.set(activeTask.assigneeUserId, { id: activeTask.assigneeUserId, name: activeTask.assigneeName });
    }
    return Array.from(map.values());
  }, [activeTask?.assigneeName, activeTask?.assigneeUserId, demandUsers, user]);

  const selectedDemandClient = useMemo(
    () => demandClients.find((client) => client.id === demandForm.clientId) || null,
    [demandClients, demandForm.clientId]
  );

  const filteredDemandClients = useMemo(() => {
    const query = normalizeText(clientQuery);
    const source = Array.isArray(demandClients) ? demandClients : [];
    if (!query) return source.slice(0, 8);
    return source.filter((client) => clientSearchText(client).includes(query)).slice(0, 8);
  }, [clientQuery, demandClients]);

  const activeBriefing = useMemo(
    () => (activeTask && getTaskKind(activeTask) === 'briefing' ? parseBriefingDescription(activeTask.description || '') : null),
    [activeTask]
  );
  const activeRoutine = useMemo(
    () => (activeTask && getTaskKind(activeTask) === 'routine' ? parseRoutineDescription(activeTask.description || '') : null),
    [activeTask]
  );

  const activeDescription = activeTask
    ? activeBriefing
      ? activeBriefing.extraDescription
      : activeRoutine
        ? activeRoutine.extraDescription
        : activeTask.description
    : '';

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.identityRow}>
          <span className={`${styles.avatar} ${styles[`avatar_${profileForm.avatarColor || 'amber'}`]}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileForm.name || user?.name)}
          </span>

          <div className={styles.identityCopy}>
            <div className={styles.identityTitle}>
              <h1>{profileForm.name || user?.name || 'Perfil'}</h1>
              <span>{roleLabel(user?.role)}</span>
            </div>
            <div className={styles.identityMeta}>
              {user?.email ? <span>{user.email}</span> : null}
              {squadNames.length ? <span>{squadNames.join(', ')}</span> : null}
            </div>
          </div>

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              setSettingsTab('profile');
              setSettingsOpen(true);
            }}
            aria-label="Configurações"
            title="Configurações"
          >
            <SettingsIcon size={16} />
          </button>
        </div>

        <div className={styles.metricRail}>
          <div className={styles.metricItem}>
            <span>Hoje</span>
            <strong>{operationCounts.today}</strong>
          </div>
          <div className={styles.metricItem}>
            <span>Atrasadas</span>
            <strong className={operationCounts.overdue ? styles.dangerText : ''}>{operationCounts.overdue}</strong>
          </div>
          <div className={styles.metricItem}>
            <span>Aguardando</span>
            <strong>{operationCounts.waiting}</strong>
          </div>
          <div className={styles.metricItem}>
            <span>Conclusão</span>
            <strong>{completionRate}%</strong>
            <i><b style={{ width: `${completionRate}%` }} /></i>
          </div>
        </div>
      </section>

      <section className={styles.operationBoard}>
        <header className={styles.operationHeader}>
          <div className={styles.operationHeaderTop}>
            <h2>Minha operação</h2>
            <button type="button" className={styles.primaryAction} onClick={handleOpenDemandModal}>Nova demanda</button>
          </div>
          <nav className={styles.operationTabs} aria-label="Operação">
            {OPERATION_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`${styles.operationTab} ${operationTab === tab.value ? styles.operationTabActive : ''}`.trim()}
                onClick={() => setOperationTab(tab.value)}
                aria-current={operationTab === tab.value ? 'page' : undefined}
              >
                {tab.label}
                <span>{operationCounts[tab.value] || 0}</span>
              </button>
            ))}
          </nav>
          <div className={styles.operationToolbar}>
            <label className={styles.operationSearch}>
              <input
                type="search"
                value={operationSearch}
                onChange={(event) => setOperationSearch(event.target.value)}
                placeholder="Buscar"
                aria-label="Buscar demandas"
              />
            </label>
            <span>{visibleTasks.length} de {tabTasks.length}</span>
          </div>
        </header>

        <div className={styles.operationBody}>
          {tasksLoading ? (
            <StateBlock variant="loading" compact title="Carregando" />
          ) : tasksError ? (
            <StateBlock variant="error" compact title="Erro" />
          ) : visibleTasks.length === 0 ? (
            <div className={styles.emptyOperation}>
              <span>{operationSearch.trim() ? 'Sem resultados' : 'Sem demandas'}</span>
            </div>
          ) : (
            <div className={styles.operationList}>
              {visibleTasks.map((task) => {
                const itemKind = getTaskKind(task);
                const itemStatus = statusKey(task);
                return (
                  <article
                    key={task.id}
                    className={`${styles.operationRow} ${isDone(task) ? styles.operationRowDone : ''}`.trim()}
                    onClick={() => setActiveTaskId(task.id)}
                  >
                    <button
                      type="button"
                      className={`${styles.statusCheck} ${isDone(task) ? styles.statusCheckDone : ''}`.trim()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleTask(task);
                      }}
                      disabled={taskUpdatingId === task.id}
                      aria-label={isDone(task) ? 'Reabrir' : 'Concluir'}
                    >
                      {isDone(task) ? '✓' : ''}
                    </button>

                    <div className={styles.operationMain}>
                      <strong>{task.title}</strong>
                      <span>{task.clientName || task.projectName || task.createdByName || '—'}</span>
                    </div>

                    <div className={styles.operationMeta}>
                      <span className={`${styles.kindPill} ${styles[`kind_${itemKind}`] || ''}`.trim()}>{kindLabel(itemKind)}</span>
                      <span className={`${styles.dueLabel} ${styles[`due_${itemStatus}`] || ''}`.trim()}>{formatDueLabel(task.dueDate)}</span>
                      <span>{task.projectName || task.sectionName || '—'}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {activeTask ? (
        <aside className={styles.drawerOverlay} aria-label="Demanda" onClick={() => setActiveTaskId('')}>
          <section className={styles.drawerPanel} onClick={(event) => event.stopPropagation()}>
            <header className={styles.drawerTopbar}>
              <button
                type="button"
                className={`${styles.statusCheck} ${isDone(activeTask) ? styles.statusCheckDone : ''}`.trim()}
                onClick={() => handleToggleTask(activeTask)}
                disabled={taskUpdatingId === activeTask.id}
                aria-label={isDone(activeTask) ? 'Reabrir' : 'Concluir'}
              >
                {isDone(activeTask) ? '✓' : ''}
              </button>
              <button type="button" className={styles.iconButton} onClick={() => setActiveTaskId('')} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.drawerScroll}>
              <div className={styles.drawerHero}>
                <span className={`${styles.statusBadge} ${styles[`status_${activeStatus}`] || ''}`.trim()}>{statusLabel(activeTask)}</span>
                <h3>{activeTask.title}</h3>
                <p>{nextActionLabel(activeTask)}</p>
                <div className={styles.drawerHeroActions}>
                  <button type="button" onClick={() => openHandoff(activeTask)}>Handoff</button>
                </div>
              </div>

              <section className={styles.drawerSection}>
                <div className={styles.workflowGrid}>
                  <label className={styles.workflowField}>
                    <span>Status</span>
                    <Select
                      value={activeTask.status || (isDone(activeTask) ? 'done' : 'todo')}
                      onChange={(event) => handleUpdateTaskFields(activeTask, { status: event.target.value }, 'Status atualizado.')}
                      aria-label="Status"
                      className={styles.workflowSelect}
                    >
                      {activeStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </label>

                  <label className={styles.workflowField}>
                    <span>Responsável</span>
                    <Select
                      value={activeTask.assigneeUserId || ''}
                      onChange={(event) => handleUpdateTaskFields(activeTask, { assigneeUserId: event.target.value }, 'Responsável atualizado.')}
                      aria-label="Responsável"
                      className={styles.workflowSelect}
                    >
                      <option value="">Sem responsável</option>
                      {assigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </Select>
                  </label>

                  <label className={styles.workflowField}>
                    <span>Prazo</span>
                    <DateField
                      value={activeTask.dueDate || ''}
                      onChange={(value) => handleUpdateTaskFields(activeTask, { dueDate: value || '' }, 'Prazo atualizado.')}
                      placeholder="Prazo"
                      ariaLabel="Prazo"
                      className={styles.workflowDate}
                    />
                  </label>

                  <label className={styles.workflowField}>
                    <span>Prioridade</span>
                    <Select
                      value={activeTask.priority || 'medium'}
                      onChange={(event) => handleUpdateTaskFields(activeTask, { priority: event.target.value }, 'Prioridade atualizada.')}
                      aria-label="Prioridade"
                      className={styles.workflowSelect}
                    >
                      {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </label>
                </div>

                {activeContextItems.length ? (
                  <div className={styles.contextGrid}>
                    {activeContextItems.map(([label, value]) => (
                      <div key={label} className={styles.contextItem}>
                        <span>{label}</span>
                        <strong>{value || '—'}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              {activeWorkflowSteps.length ? (
                <section className={styles.drawerSection}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Fluxo</h4>
                    <span>{kindLabel(activeKind)}</span>
                  </div>
                  <div className={styles.workflowTimeline}>
                    {activeWorkflowSteps.map((step, index) => (
                      <div key={step.key} className={`${styles.workflowStep} ${styles[`workflowStep_${step.state}`] || ''}`.trim()}>
                        <i>{index + 1}</i>
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeBriefing ? (
                <section className={styles.drawerSection}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Briefing</h4>
                    <span className={activeBriefing.isComplete ? styles.briefingComplete : styles.briefingIncomplete}>
                      {activeBriefing.isComplete ? 'Completo' : 'Incompleto'}
                    </span>
                  </div>
                  <div className={styles.briefingSummary}>
                    <i><b style={{ width: `${activeBriefing.completion}%` }} /></i>
                    <span>{activeBriefing.filledRequired}/{activeBriefing.requiredTotal}</span>
                  </div>
                  <div className={styles.briefingDetailsGrid}>
                    {BRIEFING_FIELDS.map((field) => {
                      const value = activeBriefing.values[field.key];
                      return value ? (
                        <div key={field.key} className={styles.briefingDetailItem}>
                          <span>{field.label}</span>
                          <strong>{value}</strong>
                        </div>
                      ) : null;
                    })}
                  </div>
                </section>
              ) : null}

              {activeRoutine ? (
                <section className={styles.drawerSection}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Rotina</h4>
                    <span>{activeRoutine.values.recurrence || 'Recorrente'}</span>
                  </div>
                  <div className={styles.routineDetailsGrid}>
                    {ROUTINE_FIELDS.map((field) => {
                      const value = activeRoutine.values[field.key];
                      return value ? (
                        <div key={field.key} className={field.key === 'checklist' ? styles.routineChecklistItem : styles.briefingDetailItem}>
                          <span>{field.label}</span>
                          <strong>{value}</strong>
                        </div>
                      ) : null;
                    })}
                  </div>
                </section>
              ) : null}

              {activeDescription ? (
                <section className={styles.drawerSection}>
                  <h4>Descrição</h4>
                  <div className={styles.descriptionBox}>{activeDescription}</div>
                </section>
              ) : null}

              <section className={styles.drawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Subtarefas</h4>
                  <span>{activeSubtasks.length}</span>
                </div>
                <form className={styles.inlineComposer} onSubmit={handleCreateSubtask}>
                  <input value={subtaskDraft} onChange={(event) => setSubtaskDraft(event.target.value)} placeholder="Subtarefa" />
                  <button type="submit" disabled={subtaskSaving || !subtaskDraft.trim()}>+</button>
                </form>
                {activeSubtasks.length ? (
                  <div className={styles.subtaskList}>
                    {activeSubtasks.map((subtask) => (
                      <div key={subtask.id} className={styles.subtaskItem}>
                        <button
                          type="button"
                          className={`${styles.statusCheck} ${isDone(subtask) ? styles.statusCheckDone : ''}`.trim()}
                          onClick={() => handleToggleTask(subtask)}
                          disabled={taskUpdatingId === subtask.id}
                          aria-label={isDone(subtask) ? 'Reabrir' : 'Concluir'}
                        >
                          {isDone(subtask) ? '✓' : ''}
                        </button>
                        <span>{subtask.title}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className={styles.drawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Comentários</h4>
                  <span>{taskComments.length}</span>
                </div>
                <form className={styles.commentForm} onSubmit={handleCreateComment}>
                  <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Comentário" />
                  <button type="submit" disabled={commentSaving || !commentDraft.trim()}>{commentSaving ? 'Enviando' : 'Comentar'}</button>
                </form>
                {commentsLoading ? (
                  <div className={styles.commentState}>Carregando</div>
                ) : taskComments.length ? (
                  <div className={styles.commentList}>
                    {taskComments.map((comment) => {
                      const commentAuthor = comment.authorName || comment.userName || 'Usuário';
                      return (
                        <article key={comment.id} className={styles.commentItem}>
                          <span className={styles.commentAvatar}>{initials(commentAuthor)}</span>
                          <div className={styles.commentBody}>
                            <header className={styles.commentHeader}>
                              <strong>{commentAuthor}</strong>
                              <span>{formatDateTime(comment.createdAt)}</span>
                              <button
                                type="button"
                                className={styles.commentDeleteButton}
                                onClick={() => setCommentDeleteTarget(comment)}
                                aria-label="Excluir comentário"
                                title="Excluir comentário"
                              >
                                <TrashIcon size={13} />
                              </button>
                            </header>
                            <p>{comment.body || comment.content || ''}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section className={styles.drawerSection}>
                <h4>Atividade</h4>
                <div className={styles.activityList}>
                  {activeTask.createdByName ? (
                    <div className={styles.activityItem}>
                      <span>{initials(activeTask.createdByName)}</span>
                      <p><strong>{activeTask.createdByName}</strong> criou esta demanda.</p>
                    </div>
                  ) : null}
                  {isDone(activeTask) ? (
                    <div className={styles.activityItem}>
                      <span className={styles.activityDone}>✓</span>
                      <p><strong>{activeTask.completedByName || activeTask.assigneeName || profileForm.name || user?.name}</strong> concluiu esta demanda.</p>
                    </div>
                  ) : null}
                  {activeTask.updatedAt ? (
                    <div className={styles.activityMeta}>{formatDateTime(activeTask.updatedAt)}</div>
                  ) : null}
                </div>
              </section>
            </div>
          </section>
        </aside>
      ) : null}


      {demandModalOpen ? (
        <div className={styles.settingsOverlay} onClick={() => setDemandModalOpen(false)}>
          <form className={`${styles.settingsModal} ${styles.demandModal}`} onSubmit={handleCreateDemand} role="dialog" aria-modal="true" aria-label="Nova demanda" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>{demandTypeLabel(demandForm.type)}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setDemandModalOpen(false)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.settingsContent}>
              <div className={styles.demandFormGrid}>
                <Select value={demandForm.type} onChange={(event) => setDemandForm((prev) => ({ ...prev, type: event.target.value }))} aria-label="Tipo" className={styles.formSelect}>
                  {DEMAND_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
                <Select value={demandForm.priority} onChange={(event) => setDemandForm((prev) => ({ ...prev, priority: event.target.value }))} aria-label="Prioridade" className={styles.formSelect}>
                  {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
                <input className={styles.fieldWide} value={demandForm.title} onChange={(event) => setDemandForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título" />
                <Select value={demandForm.assigneeUserId} onChange={(event) => setDemandForm((prev) => ({ ...prev, assigneeUserId: event.target.value }))} aria-label="Responsável" className={styles.formSelect}>
                  {(demandUsers.length ? demandUsers : [user]).filter(Boolean).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <div className={styles.clientSearchField} ref={clientSearchRef}>
                  <input
                    value={clientSearchOpen ? clientQuery : selectedDemandClient?.name || clientQuery}
                    onFocus={() => {
                      setClientSearchOpen(true);
                      if (selectedDemandClient) setClientQuery(selectedDemandClient.name || '');
                    }}
                    onChange={(event) => {
                      setClientQuery(event.target.value);
                      setClientSearchOpen(true);
                      if (demandForm.clientId) setDemandForm((prev) => ({ ...prev, clientId: '' }));
                    }}
                    placeholder="Cliente"
                    aria-label="Cliente"
                  />
                  {(selectedDemandClient || clientQuery) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDemandForm((prev) => ({ ...prev, clientId: '' }));
                        setClientQuery('');
                        setClientSearchOpen(false);
                      }}
                      aria-label="Limpar cliente"
                    >
                      <CloseIcon size={13} />
                    </button>
                  ) : null}
                  {clientSearchOpen ? (
                    <div className={styles.clientSearchResults}>
                      {filteredDemandClients.length ? filteredDemandClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setDemandForm((prev) => ({ ...prev, clientId: client.id }));
                            setClientQuery(client.name || '');
                            setClientSearchOpen(false);
                          }}
                        >
                          <strong>{client.name}</strong>
                          {client.squadName || client.managerName || client.gdvName ? (
                            <span>{[client.squadName, client.managerName, client.gdvName].filter(Boolean).join(' · ')}</span>
                          ) : null}
                        </button>
                      )) : (
                        <span className={styles.clientSearchEmpty}>Sem cliente</span>
                      )}
                    </div>
                  ) : null}
                </div>
                <DateField value={demandForm.dueDate} onChange={(value) => setDemandForm((prev) => ({ ...prev, dueDate: value }))} placeholder="Prazo" ariaLabel="Prazo" className={styles.dateField} />
              </div>

              {demandForm.type === 'briefing' ? (
                <div className={styles.briefingGrid}>
                  <input value={demandForm.officeName} onChange={(event) => setDemandForm((prev) => ({ ...prev, officeName: event.target.value }))} placeholder="Escritório" />
                  <input value={demandForm.objective} onChange={(event) => setDemandForm((prev) => ({ ...prev, objective: event.target.value }))} placeholder="Objetivo" />
                  <input value={demandForm.campaign} onChange={(event) => setDemandForm((prev) => ({ ...prev, campaign: event.target.value }))} placeholder="Nicho/campanha" />
                  <input value={demandForm.channels} onChange={(event) => setDemandForm((prev) => ({ ...prev, channels: event.target.value }))} placeholder="Canais" />
                  <input value={demandForm.attendants} onChange={(event) => setDemandForm((prev) => ({ ...prev, attendants: event.target.value }))} placeholder="Atendentes" />
                  <input value={demandForm.greeting} onChange={(event) => setDemandForm((prev) => ({ ...prev, greeting: event.target.value }))} placeholder="Saudação" />
                  <input className={styles.fieldWide} value={demandForm.location} onChange={(event) => setDemandForm((prev) => ({ ...prev, location: event.target.value }))} placeholder="Localização" />
                </div>
              ) : null}

              {demandForm.type === 'routine' ? (
                <div className={styles.routineFormGrid}>
                  <Select value={demandForm.recurrence} onChange={(event) => setDemandForm((prev) => ({ ...prev, recurrence: event.target.value }))} aria-label="Recorrência" className={styles.formSelect}>
                    {ROUTINE_RECURRENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                  <input value={demandForm.routineScope} onChange={(event) => setDemandForm((prev) => ({ ...prev, routineScope: event.target.value }))} placeholder="Escopo" />
                  <textarea className={styles.fieldWide} value={demandForm.routineChecklist} onChange={(event) => setDemandForm((prev) => ({ ...prev, routineChecklist: event.target.value }))} placeholder="Checklist" />
                </div>
              ) : null}

              <textarea value={demandForm.description} onChange={(event) => setDemandForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição" className={styles.demandTextarea} />

              <footer className={styles.settingsFooter}>
                <button type="button" onClick={() => setDemandModalOpen(false)}>Cancelar</button>
                <button type="submit" disabled={demandSaving}>{demandSaving ? 'Criando' : 'Criar demanda'}</button>
              </footer>
            </div>
          </form>
        </div>
      ) : null}


      {commentDeleteTarget ? (
        <div className={styles.settingsOverlay} onClick={() => setCommentDeleteTarget(null)}>
          <section className={`${styles.settingsModal} ${styles.confirmModal}`} role="dialog" aria-modal="true" aria-label="Excluir comentário" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Excluir comentário</h2>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setCommentDeleteTarget(null)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={() => setCommentDeleteTarget(null)}>Cancelar</button>
              <button type="button" onClick={handleDeleteComment} disabled={commentDeleting}>{commentDeleting ? 'Excluindo' : 'Excluir'}</button>
            </footer>
          </section>
        </div>
      ) : null}



      {completionTarget ? (
        <div className={styles.settingsOverlay} onClick={() => setCompletionTarget(null)}>
          <form className={`${styles.settingsModal} ${styles.completionModal}`} onSubmit={handleCompleteWithRecord} role="dialog" aria-modal="true" aria-label="Concluir demanda" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Concluir demanda</h2>
                <span>{completionTarget.title}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setCompletionTarget(null)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <div className={styles.settingsContent}>
              <div className={styles.completionSummary}>
                <span>{kindLabel(getTaskKind(completionTarget))}</span>
                <strong>{completionTarget.clientName || completionTarget.projectName || '—'}</strong>
              </div>
              <textarea
                className={styles.completionTextarea}
                value={completionDraft}
                onChange={(event) => setCompletionDraft(event.target.value)}
                placeholder="Registro"
              />
            </div>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={() => setCompletionTarget(null)}>Cancelar</button>
              <button type="submit" disabled={completionSaving}>{completionSaving ? 'Concluindo' : 'Concluir'}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {handoffOpen && activeTask ? (
        <div className={styles.settingsOverlay} onClick={() => setHandoffOpen(false)}>
          <form className={`${styles.settingsModal} ${styles.handoffModal}`} onSubmit={handleSubmitHandoff} role="dialog" aria-modal="true" aria-label="Handoff" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Handoff</h2>
                <span>{activeTask.title}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setHandoffOpen(false)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <div className={styles.settingsContent}>
              <div className={styles.handoffGrid}>
                <Select
                  value={handoffForm.assigneeUserId}
                  onChange={(event) => setHandoffForm((prev) => ({ ...prev, assigneeUserId: event.target.value }))}
                  aria-label="Responsável"
                  className={styles.formSelect}
                >
                  {assigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <Select
                  value={handoffForm.status}
                  onChange={(event) => setHandoffForm((prev) => ({ ...prev, status: event.target.value }))}
                  aria-label="Status"
                  className={styles.formSelect}
                >
                  {activeStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
                <textarea
                  className={styles.fieldWide}
                  value={handoffForm.note}
                  onChange={(event) => setHandoffForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Nota"
                />
              </div>
            </div>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={() => setHandoffOpen(false)}>Cancelar</button>
              <button type="submit" disabled={handoffSaving || !handoffForm.assigneeUserId}>{handoffSaving ? 'Salvando' : 'Registrar'}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className={styles.settingsOverlay} onClick={() => setSettingsOpen(false)}>
          <section className={styles.settingsModal} role="dialog" aria-modal="true" aria-label="Configurações" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Configurações</h2>
                <span>{profileForm.name || user?.name}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setSettingsOpen(false)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.settingsTabs}>
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.settingsTab} ${settingsTab === tab.value ? styles.settingsTabActive : ''}`.trim()}
                  onClick={() => setSettingsTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {settingsTab === 'profile' ? (
              <div className={styles.settingsContent}>
                <div className={styles.photoRow}>
                  <span className={`${styles.photoAvatar} ${styles[`avatar_${profileForm.avatarColor || 'amber'}`]}`}>
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileForm.name || user?.name)}
                  </span>
                  <div className={styles.photoActions}>
                    <button type="button" onClick={() => avatarInputRef.current?.click()}>Alterar foto</button>
                    {avatarUrl ? <button type="button" onClick={handleRemoveAvatar}>Remover</button> : null}
                    <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarFile} hidden />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <input value={profileForm.name} onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nome" />
                  <input value={profileForm.phone} onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Telefone" />
                  <input value={profileForm.customSlug} onChange={(event) => setProfileForm((prev) => ({ ...prev, customSlug: normalizeSlug(event.target.value) }))} placeholder="Slug" />
                  <Select
                    value={profileForm.avatarColor}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, avatarColor: event.target.value }))}
                    aria-label="Cor"
                    className={styles.formSelect}
                  >
                    {AVATAR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </div>

                <footer className={styles.settingsFooter}>
                  <button type="button" onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? 'Salvando' : 'Salvar'}</button>
                </footer>
              </div>
            ) : (
              <div className={styles.settingsContent}>
                <div className={styles.formGrid}>
                  <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))} placeholder="Senha atual" />
                  <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))} placeholder="Nova senha" />
                </div>
                <footer className={styles.settingsFooter}>
                  <button type="button" onClick={handleChangePassword} disabled={savingPassword}>{savingPassword ? 'Salvando' : 'Salvar'}</button>
                </footer>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
