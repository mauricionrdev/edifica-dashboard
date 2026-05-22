import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  addTaskCollaborator,
  createTask,
  createTaskAttachment,
  createTaskComment,
  getTask,
  listTaskComments,
  listTaskCollaborators,
  listUserProjectTasks,
  updateTask as updateProjectTask,
  updateTaskComment,
} from '../api/projects.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getClientAvatar, getUserAvatar } from '../utils/avatarStorage.js';
import { roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Select from '../components/ui/Select.jsx';
import DateField from '../components/ui/DateField.jsx';
import { ChecklistIcon, CloseIcon, PlusIcon } from '../components/ui/Icons.jsx';
import { buildProfilePath, matchesEntityRouteSegment } from '../utils/entityPaths.js';
import styles from './UserProfilePage.module.css';


const STATUS_OPTIONS = [
  { value: 'todo', label: 'Aberta' },
  { value: 'in_progress', label: 'Em execução' },
  { value: 'activation_gdv', label: 'Ativação GDV' },
  { value: 'access_delivery', label: 'Acessos' },
  { value: 'traffic_activation', label: 'Tráfego' },
  { value: 'final_validation', label: 'Validação' },
  { value: 'done', label: 'Concluída' },
  { value: 'canceled', label: 'Cancelada' },
];

function clientSearchLabel(client) {
  return [client?.name, client?.squadName, client?.managerName, client?.gdvName].filter(Boolean).join(' ').toLowerCase();
}

function initials(name) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

function formatDateLabel(value) {
  if (!value) return 'Sem prazo';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Sem prazo';

  const now = new Date();
  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const valueKey = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  const diff = Math.round((valueKey - todayKey) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function isOverdue(task) {
  if (task?.done || task?.status === 'done' || !task?.dueDate) return false;
  const today = new Date();
  const due = new Date(`${task.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dueKey = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  return dueKey < todayKey;
}

function getTaskStatus(task) {
  if (task?.done || task?.status === 'done') return 'done';
  if (isOverdue(task)) return 'overdue';
  return 'open';
}

function publicTaskKind(task) {
  const direct = String(task?.kind || task?.type || task?.demandType || '').toLowerCase();
  if (['briefing', 'routine', 'support', 'bug', 'adjustment', 'access', 'project', 'other'].includes(direct)) return direct;
  const label = taskKindLabel(task).toLowerCase();
  if (label.includes('briefing')) return 'briefing';
  if (label.includes('rotina')) return 'routine';
  if (label.includes('suporte')) return 'support';
  if (label.includes('bug')) return 'bug';
  if (label.includes('acesso')) return 'access';
  if (label.includes('projeto')) return 'project';
  return 'other';
}

function statusLabel(task) {
  if (task?.status === 'canceled') return 'Cancelada';
  if (getTaskStatus(task) === 'overdue') return 'Atrasada';
  if (getTaskStatus(task) === 'done') return publicTaskKind(task) === 'support' || publicTaskKind(task) === 'bug' ? 'Resolvido' : 'Concluída';
  const kind = publicTaskKind(task);
  const briefingLabels = {
    todo: 'Briefing',
    in_progress: 'Implementação',
    activation_gdv: 'Ativação GDV',
    access_delivery: 'Acessos',
    traffic_activation: 'Tráfego',
    final_validation: 'Validação',
    done: 'Concluída',
  };
  const genericLabels = {
    todo: 'Aberta',
    in_progress: 'Em execução',
    activation_gdv: 'Ativação GDV',
    access_delivery: 'Acessos',
    traffic_activation: 'Tráfego',
    final_validation: 'Validação',
  };
  return (kind === 'briefing' ? briefingLabels : genericLabels)[task?.status || 'todo'] || 'Aberta';
}

function getTaskStatusLabel(task) {
  return statusLabel(task);
}

function canEditProfileTask(task, currentUser) {
  if (!task?.id || !currentUser?.id) return false;
  const currentId = String(currentUser.id);
  if (String(task.assigneeUserId || task.assignee_user_id || '') === currentId) return true;
  if (String(task.createdByUserId || task.created_by_user_id || '') === currentId) return true;
  if (Array.isArray(task.collaborators) && task.collaborators.some((item) => String(item?.userId || item?.user_id || item?.id || '') === currentId)) return true;
  return ['responsible', 'collaborator'].includes(task.profileRelation);
}

function formatDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function isTodayTask(task) {
  if (!task?.dueDate || task?.done || task?.status === 'done') return false;
  const today = new Date();
  const due = new Date(`${task.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  return today.getFullYear() === due.getFullYear() && today.getMonth() === due.getMonth() && today.getDate() === due.getDate();
}

function taskKindLabel(task) {
  const text = `${task?.title || ''} ${task?.description || ''} ${task?.kind || ''} ${task?.type || ''}`.toLowerCase();
  if (text.includes('briefing')) return 'Briefing';
  if (text.includes('rotina') || text.includes('routine')) return 'Rotina';
  if (text.includes('suporte') || text.includes('support')) return 'Suporte';
  if (text.includes('bug')) return 'Bug';
  if (text.includes('acesso') || text.includes('access')) return 'Acesso';
  return 'Tarefa';
}

function taskStageInfo(task) {
  const kind = publicTaskKind(task);
  const status = task?.status || (getTaskStatus(task) === 'done' ? 'done' : 'todo');

  if (task?.status === 'canceled') return { label: 'Cancelada', progress: 100, tone: 'red' };

  if (kind === 'briefing') {
    const order = ['todo', 'in_progress', 'activation_gdv', 'access_delivery', 'traffic_activation', 'final_validation', 'done'];
    const currentIndex = Math.max(0, order.indexOf(getTaskStatus(task) === 'done' ? 'done' : status));
    const progress = Math.round(((currentIndex + 1) / order.length) * 100);
    return {
      label: statusLabel(task),
      progress,
      tone: getTaskStatus(task) === 'done' ? 'green' : getTaskStatus(task) === 'overdue' ? 'red' : currentIndex >= 4 ? 'teal' : currentIndex >= 2 ? 'amber' : 'yellow',
    };
  }

  if (getTaskStatus(task) === 'done') return { label: statusLabel(task), progress: 100, tone: 'green' };
  if (status === 'in_progress') return { label: statusLabel(task), progress: 62, tone: 'amber' };
  if (getTaskStatus(task) === 'overdue') return { label: statusLabel(task), progress: 42, tone: 'red' };
  if (isTodayTask(task)) return { label: statusLabel(task), progress: 48, tone: 'yellow' };
  return { label: statusLabel(task), progress: 28, tone: 'yellow' };
}

function workflowStepsForTask(task) {
  const kind = publicTaskKind(task);
  const status = task?.status || (getTaskStatus(task) === 'done' ? 'done' : 'todo');
  const done = getTaskStatus(task) === 'done';

  if (kind === 'briefing') {
    const order = ['todo', 'in_progress', 'activation_gdv', 'access_delivery', 'traffic_activation', 'final_validation', 'done'];
    const labels = {
      todo: 'Briefing',
      in_progress: 'Implementação',
      activation_gdv: 'Ativação GDV',
      access_delivery: 'Acessos',
      traffic_activation: 'Tráfego',
      final_validation: 'Validação',
      done: 'Concluída',
    };
    const currentIndex = Math.max(0, order.indexOf(done ? 'done' : status));
    return order.map((key, index) => ({
      key,
      label: labels[key],
      state: done && key === 'done' ? 'current' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
    }));
  }

  if (kind === 'routine') {
    return [
      { key: 'pending', label: 'Pendente', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'execution', label: 'Execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'done', label: 'Feita', state: done ? 'current' : 'pending' },
    ];
  }

  if (kind === 'support' || kind === 'bug' || kind === 'access') {
    return [
      { key: 'open', label: kind === 'bug' ? 'Reportado' : 'Aberto', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'analysis', label: kind === 'access' ? 'Em separação' : 'Análise', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'resolved', label: kind === 'access' ? 'Entregue' : 'Resolvido', state: done ? 'current' : 'pending' },
    ];
  }

  return [
    { key: 'open', label: 'Aberta', state: done || status !== 'todo' ? 'done' : 'current' },
    { key: 'execution', label: 'Em execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
    { key: 'done', label: 'Concluída', state: done ? 'current' : 'pending' },
  ];
}


function findDirectoryUser(userDirectory, id, name) {
  const users = Array.isArray(userDirectory) ? userDirectory : [];
  return users.find((entry) => String(entry?.id || '') === String(id || ''))
    || users.find((entry) => sameName(entry?.name, name))
    || null;
}

function buildPublicTaskPeople(task, profileUser, userDirectory) {
  const candidates = [
    ...(Array.isArray(task?.collaborators) ? task.collaborators : []),
    ...(Array.isArray(task?.people) ? task.people : []),
    { userId: task?.assigneeUserId || task?.assignee_user_id, userName: task?.assigneeName || task?.assignee_name },
    { userId: task?.createdByUserId || task?.created_by_user_id, userName: task?.createdByName || task?.created_by_name },
    { userId: profileUser?.id, userName: profileUser?.name },
  ];

  const seen = new Set();
  return candidates.reduce((acc, person) => {
    const personId = person?.userId || person?.user_id || person?.id;
    const personName = person?.userName || person?.user_name || person?.name;
    const key = String(personId || personName || '').trim().toLowerCase();
    if (!key || seen.has(key)) return acc;
    seen.add(key);
    const directoryUser = findDirectoryUser(userDirectory, personId, personName);
    acc.push({
      ...directoryUser,
      userId: personId || directoryUser?.id || '',
      userName: personName || directoryUser?.name || 'Usuário',
      name: personName || directoryUser?.name || 'Usuário',
      avatarUrl: person?.avatarUrl || person?.avatar_url || directoryUser?.avatarUrl || '',
      avatarColor: person?.avatarColor || person?.avatar_color || directoryUser?.avatarColor || directoryUser?.avatar_color || 'slate',
    });
    return acc;
  }, []).slice(0, 8);
}

const PUBLIC_TASK_TABS = [
  { value: 'all', label: 'Todas' },
  { value: 'today', label: 'Hoje' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'critical', label: 'Críticas' },
  { value: 'done', label: 'Concluídas' },
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

const ROUTINE_RECURRENCES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

const TASK_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

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
    collaboratorUserIds: [],
    attachments: [],
  };
}

function demandTypeLabel(type) {
  return DEMAND_TYPES.find((item) => item.value === type)?.label || 'Demanda';
}

function recurrenceLabel(value) {
  return ROUTINE_RECURRENCES.find((item) => item.value === value)?.label || value || '';
}

function buildDemandDescription(form, clientName = '') {
  const lines = [`Tipo: ${demandTypeLabel(form.type)}`];
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

    if (briefingLines.length) lines.push('', 'Briefing', ...briefingLines);
  }

  if (form.type === 'routine') {
    const routineLines = [
      ['Recorrência', recurrenceLabel(form.recurrence)],
      ['Escopo', form.routineScope],
      ['Checklist', form.routineChecklist],
    ]
      .filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `${label}: ${String(value).trim()}`);

    if (routineLines.length) lines.push('', 'Rotina', ...routineLines);
  }

  const freeDescription = String(form.description || '').trim();
  if (freeDescription) lines.push('', freeDescription);
  return lines.join('\n');
}

function joinMissingFields(items = []) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function validateDemandForm(form = {}) {
  const missing = [];
  const requiredText = (key, label) => {
    if (!String(form[key] || '').trim()) missing.push(label);
  };

  requiredText('title', 'Título');
  if (!String(form.assigneeUserId || '').trim()) missing.push('Responsável');

  if (form.type === 'briefing') {
    if (!String(form.clientId || '').trim()) missing.push('Cliente');
    [
      ['officeName', 'Escritório'],
      ['objective', 'Objetivo'],
      ['campaign', 'Nicho/campanha'],
      ['channels', 'Canais'],
      ['attendants', 'Atendentes'],
      ['greeting', 'Saudação'],
      ['location', 'Localização'],
    ].forEach(([key, label]) => requiredText(key, label));
  }

  if (form.type === 'routine') {
    requiredText('routineScope', 'Escopo');
    requiredText('routineChecklist', 'Checklist');
  }

  return missing;
}

function demandCollaboratorOptions(users = [], form = {}) {
  const blocked = new Set([form.assigneeUserId, ...(form.collaboratorUserIds || [])].filter(Boolean));
  return users
    .filter((item) => item?.id && !blocked.has(item.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
}

function isSupportedTaskAttachment(file) {
  const mime = String(file?.type || '');
  return mime.startsWith('image/') || mime === 'application/pdf';
}

function taskAttachmentKind(item) {
  const mime = String(item?.mimeType || '');
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function compactText(value, fallback = '—') {
  const text = String(value || '').trim();
  return text || fallback;
}

function orderTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const order = { overdue: 0, open: 1, done: 2 };
    const aStatus = getTaskStatus(a);
    const bStatus = getTaskStatus(b);
    if (order[aStatus] !== order[bStatus]) return order[aStatus] - order[bStatus];
    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });
}

export default function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const {
    clients = [],
    squads = [],
    gdvs = [],
    userDirectory = [],
    refreshUserDirectory,
    setPanelHeader,
  } = useOutletContext();

  const [profileTasks, setProfileTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [activeTaskOpen, setActiveTaskOpen] = useState(false);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskComments, setTaskComments] = useState([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [newTask, setNewTask] = useState(() => emptyDemandForm(''));
  const [clientQuery, setClientQuery] = useState('');
  const [taskTab, setTaskTab] = useState('all');

  useEffect(() => {
    if (!Array.isArray(userDirectory) || userDirectory.length === 0) {
      refreshUserDirectory?.().catch(() => { });
    }
  }, [refreshUserDirectory, userDirectory]);

  const profileUser = useMemo(
    () => (Array.isArray(userDirectory) ? userDirectory.find((entry) => matchesEntityRouteSegment(userId, entry)) : null),
    [userDirectory, userId]
  );

  useEffect(() => {
    if (!profileUser?.id || !userId) return;
    const current = `/perfil/${encodeURIComponent(String(userId))}`;
    const canonical = buildProfilePath(profileUser);
    if (current !== canonical) navigate(canonical, { replace: true });
  }, [navigate, profileUser, userId]);

  useEffect(() => {
    setPanelHeader({
      title: profileUser ? <strong>{profileUser.name}</strong> : <strong>Perfil</strong>,
      description: null,
      actions: null,
    });
  }, [profileUser, setPanelHeader]);

  const avatarUrl = getUserAvatar(profileUser);

  const demandAssigneeOptions = useMemo(() => {
    const users = Array.isArray(userDirectory) ? userDirectory : [];
    const map = new Map();
    [profileUser, currentUser, ...users].filter(Boolean).forEach((item) => {
      if (!item?.id) return;
      map.set(String(item.id), item);
    });
    return Array.from(map.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }, [currentUser, profileUser, userDirectory]);

  const selectedNewTaskClient = useMemo(
    () => (Array.isArray(clients) ? clients.find((client) => String(client.id) === String(newTask.clientId)) : null),
    [clients, newTask.clientId]
  );

  const filteredClientOptions = useMemo(() => {
    const source = Array.isArray(clients) ? clients : [];
    const query = clientQuery.trim().toLowerCase();
    const list = query ? source.filter((client) => clientSearchLabel(client).includes(query)) : source;
    return list.slice(0, 80);
  }, [clientQuery, clients]);

  const selectedNewTaskCollaborators = useMemo(
    () => (newTask.collaboratorUserIds || [])
      .map((id) => demandAssigneeOptions.find((item) => String(item.id) === String(id)))
      .filter(Boolean),
    [demandAssigneeOptions, newTask.collaboratorUserIds]
  );

  const availableNewTaskCollaborators = useMemo(
    () => demandCollaboratorOptions(demandAssigneeOptions, newTask),
    [demandAssigneeOptions, newTask.assigneeUserId, newTask.collaboratorUserIds]
  );

  function openAssignModal() {
    setNewTask(emptyDemandForm(profileUser?.id || currentUser?.id || ''));
    setClientQuery('');
    setAssignOpen(true);
  }

  async function handleNewTaskAttachmentFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const accepted = [];
    for (const file of files) {
      if (!isSupportedTaskAttachment(file)) {
        showToast('Use apenas imagens ou PDF.', { variant: 'error' });
        continue;
      }
      if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
        showToast('Anexo acima do limite de 8MB.', { variant: 'error' });
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        accepted.push({
          id: `${Date.now()}-${file.name}-${accepted.length}`,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataUrl,
        });
      } catch {
        showToast('Erro ao ler anexo.', { variant: 'error' });
      }
    }

    if (accepted.length) {
      setNewTask((prev) => ({ ...prev, attachments: [...(prev.attachments || []), ...accepted] }));
    }
  }

  function handleRemoveNewTaskAttachment(id) {
    setNewTask((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((item) => item.id !== id) }));
  }

  async function reloadProfileTasks(user) {
    if (!user?.id) {
      setProfileTasks([]);
      return;
    }
    const res = await listUserProjectTasks(user.id);
    setProfileTasks(Array.isArray(res?.tasks) ? res.tasks : []);
  }

  useEffect(() => {
    if (!profileUser?.id) {
      setProfileTasks([]);
      return undefined;
    }

    let cancelled = false;
    setTasksLoading(true);

    listUserProjectTasks(profileUser.id)
      .then((res) => {
        if (!cancelled) setProfileTasks(Array.isArray(res?.tasks) ? res.tasks : []);
      })
      .catch(() => {
        if (!cancelled) setProfileTasks([]);
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileUser?.id]);

  const userSquads = useMemo(() => {
    const assigned = new Set(Array.isArray(profileUser?.squads) ? profileUser.squads : []);
    return (Array.isArray(squads) ? squads : []).filter((squad) => assigned.has(squad.id));
  }, [profileUser?.squads, squads]);

  const ownedSquads = useMemo(() => {
    if (!profileUser) return [];
    return (Array.isArray(squads) ? squads : []).filter((squad) => squad?.ownerUserId === profileUser.id);
  }, [profileUser, squads]);

  const ownedGdvs = useMemo(() => {
    if (!profileUser) return [];
    return (Array.isArray(gdvs) ? gdvs : []).filter((gdv) => gdv?.ownerUserId === profileUser.id);
  }, [gdvs, profileUser]);

  const relatedClients = useMemo(() => {
    if (!profileUser) return [];
    return (Array.isArray(clients) ? clients : []).filter((client) => (
      sameName(client?.gestor, profileUser.name) || sameName(client?.gdvName, profileUser.name)
    ));
  }, [clients, profileUser]);

  const gdvClients = useMemo(
    () => relatedClients.filter((client) => sameName(client?.gdvName, profileUser?.name)),
    [profileUser?.name, relatedClients]
  );

  const gestorClients = useMemo(
    () => relatedClients.filter((client) => sameName(client?.gestor, profileUser?.name)),
    [profileUser?.name, relatedClients]
  );

  const openTasksCount = useMemo(() => profileTasks.filter((task) => getTaskStatus(task) !== 'done').length, [profileTasks]);
  const overdueTasksCount = useMemo(() => profileTasks.filter((task) => getTaskStatus(task) === 'overdue').length, [profileTasks]);
  const completedTasksCount = useMemo(() => profileTasks.filter((task) => getTaskStatus(task) === 'done').length, [profileTasks]);
  const watchingTasksCount = useMemo(() => profileTasks.filter((task) => task.profileRelation === 'collaborator').length, [profileTasks]);
  const taskTabCounts = useMemo(() => ({
    all: profileTasks.length,
    today: profileTasks.filter(isTodayTask).length,
    overdue: overdueTasksCount,
    critical: profileTasks.filter((task) => task.priority === 'critical' || getTaskStatus(task) === 'overdue').length,
    done: completedTasksCount,
  }), [completedTasksCount, overdueTasksCount, profileTasks]);
  const filteredTasks = useMemo(() => {
    const byTab = profileTasks.filter((task) => {
      if (taskTab === 'today') return isTodayTask(task);
      if (taskTab === 'overdue') return getTaskStatus(task) === 'overdue';
      if (taskTab === 'critical') return task.priority === 'critical' || getTaskStatus(task) === 'overdue';
      if (taskTab === 'done') return getTaskStatus(task) === 'done';
      return true;
    });
    return orderTasks(byTab).slice(0, 12);
  }, [profileTasks, taskTab]);
  const completionRate = profileTasks.length ? Math.round((completedTasksCount / profileTasks.length) * 100) : 0;
  const todayTasksCount = useMemo(() => profileTasks.filter(isTodayTask).length, [profileTasks]);
  const portfolioCount = gdvClients.length + gestorClients.length;
  const profileContext = userSquads.length
    ? userSquads.map((squad) => squad.name).join(', ')
    : roleLabel(profileUser?.role);

  async function openTaskDetail(task) {
    if (!task?.id) return;
    setActiveTaskOpen(true);
    setTaskDetailLoading(true);
    setTaskComments([]);
    setEditingTitle(false);
    setEditingDescription(false);
    setEditingCommentId('');

    try {
      const [taskRes, commentsRes, collaboratorsRes] = await Promise.all([
        getTask(task.id),
        listTaskComments(task.id),
        listTaskCollaborators(task.id).catch(() => ({ collaborators: [] })),
      ]);
      const loadedCollaborators = Array.isArray(collaboratorsRes?.collaborators) ? collaboratorsRes.collaborators : [];
      const loadedTask = { ...(taskRes?.task || task), collaborators: loadedCollaborators };
      setActiveTask(loadedTask);
      setTitleDraft(loadedTask.title || '');
      setDescriptionDraft(loadedTask.description || '');
      setTaskComments(Array.isArray(commentsRes?.comments) ? commentsRes.comments : []);
    } catch (err) {
      setActiveTask(task);
      setTitleDraft(task.title || '');
      setDescriptionDraft(task.description || '');
      showToast(err?.message || 'Erro ao abrir tarefa.', { variant: 'error' });
    } finally {
      setTaskDetailLoading(false);
    }
  }

  function closeTaskDetail() {
    setActiveTaskOpen(false);
    setActiveTask(null);
    setTaskComments([]);
    setCommentText('');
    setEditingTitle(false);
    setEditingDescription(false);
    setEditingCommentId('');
  }

  async function saveActiveTask(fields) {
    if (!activeTask?.id || !canEditProfileTask(activeTask, currentUser)) return;
    try {
      setTaskSaving(true);
      const res = await updateProjectTask(activeTask.id, fields);
      const nextTask = res?.task || { ...activeTask, ...fields };
      setActiveTask(nextTask);
      setProfileTasks((prev) => prev.map((task) => (task.id === nextTask.id ? { ...task, ...nextTask } : task)));
      if (fields.title !== undefined) setEditingTitle(false);
      if (fields.description !== undefined) setEditingDescription(false);
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar tarefa.', { variant: 'error' });
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleTitleBlur() {
    const title = titleDraft.trim();
    if (!activeTask?.id || !title || title === activeTask.title) {
      setEditingTitle(false);
      setTitleDraft(activeTask?.title || '');
      return;
    }
    await saveActiveTask({ title });
  }

  async function handleDescriptionBlur() {
    const description = descriptionDraft.trim();
    if (!activeTask?.id || description === (activeTask.description || '')) {
      setEditingDescription(false);
      setDescriptionDraft(activeTask?.description || '');
      return;
    }
    await saveActiveTask({ description });
  }

  async function handleToggleTaskStatus() {
    if (!activeTask?.id || !canEditProfileTask(activeTask, currentUser)) return;
    const nextDone = getTaskStatus(activeTask) !== 'done';
    await saveActiveTask({ done: nextDone });
  }

  async function handleCreateComment(event) {
    event.preventDefault();
    const body = commentText.trim();
    if (!activeTask?.id || !body || !canEditProfileTask(activeTask, currentUser)) return;
    try {
      setCommentSaving(true);
      const res = await createTaskComment(activeTask.id, { body });
      setTaskComments((prev) => [...prev, res?.comment].filter(Boolean));
      setCommentText('');
    } catch (err) {
      showToast(err?.message || 'Erro ao comentar tarefa.', { variant: 'error' });
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleCommentBlur(comment) {
    const body = commentDraft.trim();
    if (!activeTask?.id || !comment?.id || !body || body === comment.body) {
      setEditingCommentId('');
      setCommentDraft('');
      return;
    }
    try {
      setCommentSaving(true);
      const res = await updateTaskComment(activeTask.id, comment.id, { body });
      const nextComment = res?.comment || { ...comment, body };
      setTaskComments((prev) => prev.map((entry) => (entry.id === comment.id ? nextComment : entry)));
    } catch (err) {
      showToast(err?.message || 'Erro ao editar comentário.', { variant: 'error' });
    } finally {
      setCommentSaving(false);
      setEditingCommentId('');
      setCommentDraft('');
    }
  }

  async function handleAssignTask(event) {
    event.preventDefault();
    const missingFields = validateDemandForm(newTask);
    if (missingFields.length) {
      showToast(`Preencha: ${joinMissingFields(missingFields)}.`, { variant: 'error' });
      return;
    }

    const title = newTask.title.trim();
    const assigneeUserId = newTask.assigneeUserId || profileUser?.id || currentUser?.id || '';
    const selectedClient = selectedNewTaskClient;
    const description = buildDemandDescription(newTask, selectedClient?.name || '');

    try {
      setAssignSaving(true);
      const res = await createTask({
        title,
        description,
        assigneeUserId,
        clientId: newTask.clientId || undefined,
        dueDate: newTask.dueDate || undefined,
        priority: newTask.priority,
        status: 'todo',
        source: 'profile',
      });
      const createdTask = res?.task;
      const collaboratorIds = [...new Set((newTask.collaboratorUserIds || []).filter((id) => id && id !== assigneeUserId))];
      if (createdTask?.id && collaboratorIds.length) {
        await Promise.all(collaboratorIds.map((userId) => addTaskCollaborator(createdTask.id, { userId }).catch(() => null)));
      }
      if (createdTask?.id && Array.isArray(newTask.attachments) && newTask.attachments.length) {
        await Promise.all(newTask.attachments.map((item) => createTaskAttachment(createdTask.id, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        }).catch(() => null)));
      }
      await reloadProfileTasks(profileUser);
      setNewTask(emptyDemandForm(profileUser?.id || currentUser?.id || ''));
      setClientQuery('');
      setAssignOpen(false);
      showToast('Demanda criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar demanda.', { variant: 'error' });
    } finally {
      setAssignSaving(false);
    }
  }

  if (!profileUser) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="empty"
          title="Usuário não encontrado"
          action={<Link to="/equipe" className={styles.inlineLink}>Equipe</Link>}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.profileHero}>
        <div className={styles.heroIdentity}>
          <button
            type="button"
            className={`${styles.avatar} ${avatarUrl ? styles.avatarWithPhoto : ''}`.trim()}
            onClick={() => avatarUrl && setAvatarPreviewOpen(true)}
            disabled={!avatarUrl}
            aria-label={avatarUrl ? 'Visualizar foto' : undefined}
          >
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileUser.name)}
          </button>

          <div className={styles.heroCopy}>
            <div className={styles.nameRow}>
              <h1>{profileUser.name}</h1>
              <span className={`${styles.roleBadge} ${roleLabel(profileUser.role) === 'Suporte de tecnologia (TI)' ? styles.roleBadgeBlackHole : ''}`.trim()}>{roleLabel(profileUser.role)}</span>
            </div>
            {/* <p>{profileTasks.length ? `${profileUser.name.split(' ')[0]} possui ${openTasksCount} tarefas em aberto.` : `${profileUser.name.split(' ')[0]} não possui tarefas em aberto.`}</p> */}
            <div className={styles.profileMeta}>
              <span>{todayTasksCount === 1 ? `${profileUser.name.split(' ')[0]} possui 1 demanda agendada para hoje.` : todayTasksCount > 1 ? `${profileUser.name.split(' ')[0]} possui ${todayTasksCount} demandas agendadas para hoje.` : `${profileUser.name.split(' ')[0]} não possui demandas agendadas para hoje.`}</span>
            </div>
          </div>
        </div>


        <div className={styles.statRail}>
          <div className={styles.statItem}>
            <span>Total de tarefas</span>
            <strong>{profileTasks.length}</strong>
          </div>
          <div className={styles.statItem}>
            <span>Acompanhando</span>
            <strong>{watchingTasksCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>Em aberto</span>
            <strong>{openTasksCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>Risco operacional</span>
            <strong className={overdueTasksCount ? styles.critical : ''}>{overdueTasksCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>Taxa de conclusão</span>
            <strong className={completionRate >= 50 ? styles.positive : ''}>{completionRate}%</strong>
          </div>
        </div>
      </section>

      <div className={styles.profileGrid}>
        <main className={styles.mainColumn}>
          <section className={styles.workPanel}>
            <header className={styles.sectionHeader}>
              <div className={styles.sectionTitleBlock}>
                <h2>
                  <ChecklistIcon size={16} strokeWidth={2} aria-hidden="true" />
                  <span>Minhas tarefas</span>
                </h2>
              </div>
              <button type="button" className={styles.primaryButton} onClick={openAssignModal}>
                Nova demanda
              </button>
            </header>

            <div className={styles.taskTabs} aria-label="Filtros de tarefas">
              {PUBLIC_TASK_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.taskTab} ${taskTab === tab.value ? styles.taskTabActive : ''}`.trim()}
                  onClick={() => setTaskTab(tab.value)}
                  aria-current={taskTab === tab.value ? 'page' : undefined}
                >
                  <span>{tab.label}</span>
                  <strong>{taskTabCounts[tab.value] || 0}</strong>
                </button>
              ))}
            </div>

            <div className={styles.issueTable}>
              <div className={styles.issueHead} aria-hidden="true">
                <span />
                <span>Tarefa</span>
                <span>Propriedades</span>
                <span>Etapa</span>
                <span>Colab.</span>
                <span>Prazo</span>
              </div>

              <div className={styles.issueList}>
                {tasksLoading ? (
                  <StateBlock variant="loading" compact title="Carregando tarefas" />
                ) : filteredTasks.length === 0 ? (
                  <div className={styles.emptyState}>Sem tarefas neste filtro.</div>
                ) : (
                  filteredTasks.map((task) => {
                    const status = getTaskStatus(task);
                    const stage = taskStageInfo(task);
                    const people = buildPublicTaskPeople(task, profileUser, userDirectory);
                    return (
                      <article
                        key={task.id}
                        className={`${styles.issueRow} ${status === 'done' ? styles.issueRowDone : ''}`.trim()}
                        role="button"
                        tabIndex={0}
                        onClick={() => openTaskDetail(task)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openTaskDetail(task);
                          }
                        }}
                      >
                        <span className={`${styles.checkCircle} ${status === 'done' ? styles.checkCircleDone : ''}`} aria-hidden="true">
                          {status === 'done' ? '✓' : ''}
                        </span>

                        <div className={styles.issueTitle}>
                          <strong>{compactText(task.title, 'Tarefa sem título')}</strong>
                          {(task.clientName || task.projectName) ? (
                            <span>{task.clientName || task.projectName}</span>
                          ) : null}
                        </div>

                        <div className={styles.issueProperties}>
                          <span className={`${styles.tag} ${styles.tagKind} ${styles[`kind_${publicTaskKind(task)}`] || ''}`.trim()}>{taskKindLabel(task)}</span>
                          {task.priority === 'critical' ? <span className={`${styles.tag} ${styles.tag_overdue}`}>Crítica</span> : null}
                        </div>

                        <div className={styles.issueStageCell}>
                          <span
                            className={`${styles.stagePill} ${styles[`stage_${stage.tone}`] || ''}`.trim()}
                            style={{ '--public-stage-progress': `${stage.progress}%` }}
                          >
                            <span className={styles.stageTrack} aria-hidden="true" />
                            <span className={styles.stageLabel}>{stage.label}</span>
                            <span className={styles.stageValue}>{stage.progress}%</span>
                          </span>
                        </div>

                        <div className={styles.issuePeopleCell}>
                          {people.length ? (
                            <span className={styles.taskAvatarStack} aria-label="Colaboradores">
                              {people.slice(0, 4).map((person) => {
                                const avatar = getUserAvatar(person);
                                return (
                                  <span key={person.userId || person.userName} className={`${styles.taskAvatar} ${avatar ? styles.avatarWithPhoto : ''}`.trim()} title={person.userName || person.name}>
                                    {avatar ? <img src={avatar} alt="" /> : initials(person.userName || person.name)}
                                  </span>
                                );
                              })}
                              {people.length > 4 ? <span className={`${styles.taskAvatar} ${styles.taskAvatarMore}`}>+{people.length - 4}</span> : null}
                            </span>
                          ) : (
                            <span className={styles.taskAvatarEmpty}>—</span>
                          )}
                        </div>

                        <span className={`${styles.issueDue} ${isOverdue(task) ? styles.issueDueLate : ''}`.trim()}>{formatDateLabel(task.dueDate)}</span>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </section>

        </main>
      </div>

      {activeTaskOpen && activeTask ? (() => {
        const drawerPeople = buildPublicTaskPeople(activeTask, profileUser, userDirectory);
        return (
        <aside className={styles.taskDrawerOverlay} aria-label="Demanda" onClick={closeTaskDetail}>
          <section className={styles.taskDrawerPanel} onClick={(event) => event.stopPropagation()}>
            <header className={styles.taskDrawerTopbar}>
              <div className={styles.drawerStatusGroup}>
                <button
                  type="button"
                  className={`${styles.statusCheck} ${getTaskStatus(activeTask) === 'done' ? styles.statusCheckDone : ''}`.trim()}
                  onClick={handleToggleTaskStatus}
                  disabled={!canEditProfileTask(activeTask, currentUser) || taskSaving}
                  aria-label={getTaskStatus(activeTask) === 'done' ? 'Reabrir' : 'Concluir'}
                >
                  {getTaskStatus(activeTask) === 'done' ? '✓' : ''}
                </button>
                <span className={`${styles.statusBadge} ${styles[`tag_${getTaskStatus(activeTask)}`] || ''}`.trim()}>{getTaskStatusLabel(activeTask)}</span>
              </div>
              <div className={styles.drawerTopbarActions}>
                <button
                  type="button"
                  className={styles.drawerTopbarButton}
                  onClick={() => {
                    if (!canEditProfileTask(activeTask, currentUser)) return;
                    setTitleDraft(activeTask.title || '');
                    setDescriptionDraft(activeTask.description || '');
                    setEditingTitle(true);
                  }}
                  disabled={!canEditProfileTask(activeTask, currentUser) || taskSaving}
                >
                  Editar
                </button>
                <button type="button" className={styles.iconButton} onClick={closeTaskDetail} aria-label="Fechar">
                  <CloseIcon size={16} />
                </button>
              </div>
            </header>

            <div className={styles.taskDrawerScroll}>
              <div className={styles.taskDrawerHero}>
                {canEditProfileTask(activeTask, currentUser) && editingTitle ? (
                  <input
                    className={styles.taskTitleInput}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') {
                        setTitleDraft(activeTask.title || '');
                        setEditingTitle(false);
                      }
                    }}
                    autoFocus
                    disabled={taskSaving}
                  />
                ) : (
                  <h3
                    onDoubleClick={() => {
                      if (!canEditProfileTask(activeTask, currentUser)) return;
                      setTitleDraft(activeTask.title || '');
                      setEditingTitle(true);
                    }}
                  >
                    {compactText(activeTask.title, 'Tarefa sem título')}
                  </h3>
                )}
                {(activeTask.clientName || activeTask.projectName) ? (
                  <div className={styles.drawerHeroMeta}>
                    {activeTask.clientName ? <span>{activeTask.clientName}</span> : null}
                    {activeTask.projectName ? <em>Projeto · {activeTask.projectName}</em> : null}
                  </div>
                ) : null}
              </div>

              <section className={`${styles.taskDrawerSection} ${styles.taskDrawerSectionWorkflow}`}>
                <div className={styles.workflowGrid}>
                  <div className={styles.workflowField}>
                    <span>Status</span>
                    <Select
                      value={activeTask.status || (getTaskStatus(activeTask) === 'done' ? 'done' : 'todo')}
                      onChange={(event) => saveActiveTask({ status: event.target.value })}
                      aria-label="Status"
                      className={styles.workflowSelect}
                      disabled={!canEditProfileTask(activeTask, currentUser) || taskSaving}
                    >
                      {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </div>

                  <div className={styles.workflowField}>
                    <span>Responsável</span>
                    <Select
                      type="user"
                      value={activeTask.assigneeUserId || ''}
                      onChange={(event) => saveActiveTask({ assigneeUserId: event.target.value })}
                      aria-label="Responsável"
                      className={styles.workflowSelect}
                      disabled={!canEditProfileTask(activeTask, currentUser) || taskSaving}
                    >
                      <option value="">Sem responsável</option>
                      {demandAssigneeOptions.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                    </Select>
                  </div>

                  <div className={styles.workflowField}>
                    <span>Prioridade</span>
                    <Select
                      value={activeTask.priority || 'medium'}
                      onChange={(event) => saveActiveTask({ priority: event.target.value })}
                      aria-label="Prioridade"
                      className={styles.workflowSelect}
                      disabled={!canEditProfileTask(activeTask, currentUser) || taskSaving}
                    >
                      {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </div>

                  <div className={styles.workflowField}>
                    <span>Prazo</span>
                    <DateField
                      value={activeTask.dueDate || ''}
                      onChange={(value) => saveActiveTask({ dueDate: value || '' })}
                      placeholder="Prazo"
                      ariaLabel="Prazo"
                      className={styles.workflowDate}
                      disabled={!canEditProfileTask(activeTask, currentUser) || taskSaving}
                    />
                  </div>
                </div>
              </section>

              <section className={styles.taskDrawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Colaboradores</h4>
                  <span>{drawerPeople.length}</span>
                </div>
                <div className={styles.drawerPeopleList}>
                  {drawerPeople.length ? drawerPeople.map((person) => {
                    const personAvatar = getUserAvatar(person) || person.avatarUrl || '';
                    return (
                      <span key={person.userId || person.userName} className={styles.drawerPersonChip}>
                        <span className={`${styles.drawerPersonAvatar} ${personAvatar ? styles.avatarWithPhoto : ''}`.trim()}>
                          {personAvatar ? <img src={personAvatar} alt="" /> : initials(person.userName || person.name)}
                        </span>
                        <span>{person.userName || person.name}</span>
                      </span>
                    );
                  }) : <div className={styles.emptyText}>Sem colaboradores vinculados.</div>}
                </div>
              </section>

              <section className={styles.taskDrawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Fluxo</h4>
                  <span>{taskKindLabel(activeTask)}</span>
                </div>
                <div className={styles.workflowTimeline}>
                  {workflowStepsForTask(activeTask).map((step, index) => (
                    <div key={step.key} className={`${styles.workflowStep} ${styles[`workflowStep_${step.state}`] || ''}`.trim()}>
                      <i>{index + 1}</i>
                      <span>{step.label}</span>
                      {step.state === 'current' ? <em>{activeTask.assigneeName || 'Responsável'}</em> : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.taskDrawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Descrição</h4>
                  {!canEditProfileTask(activeTask, currentUser) ? <span>Somente visualização</span> : null}
                </div>
                {canEditProfileTask(activeTask, currentUser) && editingDescription ? (
                  <textarea
                    className={styles.taskDescriptionInput}
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    onBlur={handleDescriptionBlur}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setDescriptionDraft(activeTask.description || '');
                        setEditingDescription(false);
                      }
                    }}
                    autoFocus
                    disabled={taskSaving}
                  />
                ) : (
                  <p
                    className={styles.taskDescriptionBox}
                    onDoubleClick={() => {
                      if (!canEditProfileTask(activeTask, currentUser)) return;
                      setDescriptionDraft(activeTask.description || '');
                      setEditingDescription(true);
                    }}
                  >
                    {activeTask.description || 'Sem descrição.'}
                  </p>
                )}
              </section>

              <section className={styles.taskDrawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Comentários</h4>
                  <span>{taskComments.length}</span>
                </div>
                <div className={styles.commentList}>
                  {taskDetailLoading ? (
                    <StateBlock variant="loading" compact title="Carregando tarefa" />
                  ) : taskComments.length === 0 ? (
                    <div className={styles.emptyText}>Sem comentários.</div>
                  ) : (
                    taskComments.map((comment) => {
                      const canEditComment = canEditProfileTask(activeTask, currentUser) && comment.userId === currentUser?.id;
                      return (
                        <article key={comment.id} className={styles.commentItem}>
                          <span className={styles.commentAvatar}>{comment.avatarUrl ? <img src={comment.avatarUrl} alt="" /> : initials(comment.userName)}</span>
                          <div className={styles.commentContent}>
                            <header><strong>{comment.userName}</strong><span>{formatDateTime(comment.createdAt)}</span></header>
                            {editingCommentId === comment.id ? (
                              <textarea
                                className={styles.commentEditInput}
                                value={commentDraft}
                                onChange={(event) => setCommentDraft(event.target.value)}
                                onBlur={() => handleCommentBlur(comment)}
                                autoFocus
                                disabled={commentSaving}
                              />
                            ) : (
                              <p onDoubleClick={() => {
                                if (!canEditComment) return;
                                setEditingCommentId(comment.id);
                                setCommentDraft(comment.body || '');
                              }}>{comment.body}</p>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                {canEditProfileTask(activeTask, currentUser) ? (
                  <form className={styles.commentForm} onSubmit={handleCreateComment}>
                    <textarea
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="Novo comentário"
                      rows={3}
                    />
                    <button type="submit" disabled={commentSaving || !commentText.trim()}>Comentar</button>
                  </form>
                ) : null}
              </section>
            </div>
          </section>
        </aside>
        );
      })() : null}

      {avatarPreviewOpen && avatarUrl ? (
        <div className={styles.avatarPreviewOverlay} role="presentation" onClick={() => setAvatarPreviewOpen(false)}>
          <section className={styles.avatarPreviewModal} role="dialog" aria-modal="true" aria-label="Foto do perfil" onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.avatarPreviewClose} onClick={() => setAvatarPreviewOpen(false)} aria-label="Fechar">
              <CloseIcon size={16} />
            </button>
            <img src={avatarUrl} alt="" />
          </section>
        </div>
      ) : null}

{assignOpen ? (
        <div className={styles.modalOverlay} onClick={() => setAssignOpen(false)}>
          <form className={`${styles.taskModal} ${styles.demandModal} ${styles[`demandModal_${newTask.type}`] || ''}`.trim()} onSubmit={handleAssignTask} onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>{demandTypeLabel(newTask.type)}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setAssignOpen(false)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.demandFormContent}>
              <div className={styles.demandFormGrid}>
                <div className={`${styles.labeledField} ${styles.fieldCompact}`.trim()}>
                  <span>Tipo</span>
                  <Select value={newTask.type} onChange={(event) => setNewTask((prev) => ({ ...prev, type: event.target.value }))} aria-label="Tipo" className={styles.formSelect}>
                    {DEMAND_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </div>
                <div className={`${styles.labeledField} ${styles.fieldCompact}`.trim()}>
                  <span>Prioridade</span>
                  <Select value={newTask.priority} onChange={(event) => setNewTask((prev) => ({ ...prev, priority: event.target.value }))} aria-label="Prioridade" className={styles.formSelect}>
                    {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </div>
                <label className={`${styles.labeledField} ${styles.fieldTitle}`.trim()}>
                  <span>Título</span>
                  <input
                    value={newTask.title}
                    onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Título"
                    aria-label="Título"
                  />
                </label>
                <div className={`${styles.labeledField} ${styles.fieldDouble}`.trim()}>
                  <span>Responsável</span>
                  <Select
                    type="user"
                    value={newTask.assigneeUserId}
                    onChange={(event) => setNewTask((prev) => ({
                      ...prev,
                      assigneeUserId: event.target.value,
                      collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== event.target.value),
                    }))}
                    aria-label="Responsável"
                    className={styles.formSelect}
                  >
                    {demandAssigneeOptions.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </div>
                <div className={`${styles.labeledField} ${styles.fieldDouble}`.trim()}>
                  <span>Cliente</span>
                  <Select
                    type="client"
                    value={newTask.clientId}
                    onChange={(event) => {
                      const value = event.target.value;
                      const client = filteredClientOptions.find((item) => String(item.id) === String(value));
                      setNewTask((prev) => ({ ...prev, clientId: value }));
                      setClientQuery(client?.name || '');
                    }}
                    aria-label="Cliente"
                    className={styles.formSelect}
                  >
                    <option value="">Sem cliente</option>
                    {filteredClientOptions.map((client) => <option key={client.id} value={client.id} data-avatar={getClientAvatar(client) || client.avatarUrl || ''} data-name={client.name}>{client.name}</option>)}
                  </Select>
                </div>
                <label className={`${styles.labeledField} ${styles.fieldDouble}`.trim()}>
                  <span>Prazo</span>
                  <DateField value={newTask.dueDate} onChange={(value) => setNewTask((prev) => ({ ...prev, dueDate: value }))} placeholder="Prazo" ariaLabel="Prazo" className={styles.dateField} />
                </label>
                <div className={`${styles.labeledField} ${styles.fieldDouble}`.trim()}>
                  <span>Colaboradores</span>
                  <Select
                    type="user"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setNewTask((prev) => ({
                        ...prev,
                        collaboratorUserIds: [...new Set([...(prev.collaboratorUserIds || []), value])],
                      }));
                    }}
                    aria-label="Colaboradores"
                    className={styles.formSelect}
                  >
                    <option value="">Adicionar colaborador</option>
                    {availableNewTaskCollaborators.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </div>
                {selectedNewTaskCollaborators.length ? (
                  <div className={`${styles.selectedCollaborators} ${styles.fieldWide}`}>
                    {selectedNewTaskCollaborators.map((item) => (
                      <span key={item.id}>
                        <Avatar src={getUserAvatar(item) || item.avatarUrl || undefined} name={item.name} size="xs" />
                        {item.name}
                        <button
                          type="button"
                          onClick={() => setNewTask((prev) => ({ ...prev, collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== item.id) }))}
                          aria-label={`Remover ${item.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {newTask.type === 'briefing' ? (
                <div className={styles.briefingGrid}>
                  <input value={newTask.officeName} onChange={(event) => setNewTask((prev) => ({ ...prev, officeName: event.target.value }))} placeholder="Escritório" />
                  <input value={newTask.objective} onChange={(event) => setNewTask((prev) => ({ ...prev, objective: event.target.value }))} placeholder="Objetivo" />
                  <input value={newTask.campaign} onChange={(event) => setNewTask((prev) => ({ ...prev, campaign: event.target.value }))} placeholder="Nicho/campanha" />
                  <input value={newTask.channels} onChange={(event) => setNewTask((prev) => ({ ...prev, channels: event.target.value }))} placeholder="Canais" />
                  <input value={newTask.attendants} onChange={(event) => setNewTask((prev) => ({ ...prev, attendants: event.target.value }))} placeholder="Atendentes" />
                  <input value={newTask.greeting} onChange={(event) => setNewTask((prev) => ({ ...prev, greeting: event.target.value }))} placeholder="Saudação" />
                  <input value={newTask.location} onChange={(event) => setNewTask((prev) => ({ ...prev, location: event.target.value }))} placeholder="Localização" />
                  <textarea className={styles.fieldWide} value={newTask.notes} onChange={(event) => setNewTask((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Observações" />
                </div>
              ) : null}

              {newTask.type === 'routine' ? (
                <div className={styles.routineFormGrid}>
                  <Select value={newTask.recurrence} onChange={(event) => setNewTask((prev) => ({ ...prev, recurrence: event.target.value }))} aria-label="Recorrência" className={`${styles.formSelect} ${styles.fieldThird}`}>
                    {ROUTINE_RECURRENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                  <input value={newTask.routineScope} onChange={(event) => setNewTask((prev) => ({ ...prev, routineScope: event.target.value }))} placeholder="Escopo" />
                  <textarea className={styles.fieldWide} value={newTask.routineChecklist} onChange={(event) => setNewTask((prev) => ({ ...prev, routineChecklist: event.target.value }))} placeholder="Checklist" />
                </div>
              ) : null}

              <textarea
                value={newTask.description}
                onChange={(event) => setNewTask((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Descrição"
                aria-label="Descrição"
                rows={6}
              />

              <div className={styles.attachmentComposer}>
                <div>
                  <span>Anexos</span>
                  <strong>{(newTask.attachments || []).length}</strong>
                </div>
                <input type="file" accept="image/*,application/pdf" multiple onChange={handleNewTaskAttachmentFiles} hidden id="public-profile-demand-attachments" />
                <button type="button" onClick={() => document.getElementById('public-profile-demand-attachments')?.click()}>Anexar imagem ou PDF</button>
                {(newTask.attachments || []).length ? (
                  <div className={styles.attachmentPreviewGrid}>
                    {(newTask.attachments || []).map((item) => (
                      <figure key={item.id} className={styles.attachmentPreviewItem}>
                        {item.mimeType === 'application/pdf' ? (
                          <span className={styles.attachmentPdfPreview}>PDF</span>
                        ) : (
                          <img src={item.dataUrl} alt={item.fileName || 'Anexo'} loading="lazy" decoding="async" />
                        )}
                        <figcaption>{item.fileName || taskAttachmentKind(item)}</figcaption>
                        <button type="button" onClick={() => handleRemoveNewTaskAttachment(item.id)} aria-label={`Remover ${item.fileName || 'anexo'}`}>×</button>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <footer className={styles.modalFooter}>
              <button type="button" onClick={() => setAssignOpen(false)}>Cancelar</button>
              <button type="submit" disabled={assignSaving || !newTask.title.trim()}>
                <PlusIcon size={15} />
                {assignSaving ? 'Criando' : 'Criar demanda'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
