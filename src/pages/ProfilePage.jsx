import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/auth.js';
import {
  createTask,
  createTaskComment,
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
import { CloseIcon, SettingsIcon } from '../components/ui/Icons.jsx';
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
];

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

  const freeDescription = String(form.description || '').trim();
  if (freeDescription) lines.push('', freeDescription);

  return lines.join('\n');
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

function statusLabel(task) {
  if (isDone(task)) return 'Concluída';
  if (isOverdue(task)) return 'Atrasada';
  if (isToday(task)) return 'Hoje';
  return 'Aguardando';
}

function statusKey(task) {
  if (isDone(task)) return 'done';
  if (isOverdue(task)) return 'overdue';
  if (isToday(task)) return 'today';
  return 'waiting';
}

function priorityLabel(value) {
  const labels = { low: 'Baixa', medium: 'Normal', high: 'Alta', critical: 'Crítica' };
  return labels[value] || labels.medium;
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
  const [taskComments, setTaskComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskSaving, setSubtaskSaving] = useState(false);

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
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  useEffect(() => {
    setCommentDraft('');
    setSubtaskDraft('');
    setTaskComments([]);

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
  const visibleTasks = useMemo(() => getVisibleTasks(tasks, operationTab), [operationTab, tasks]);
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

  async function handleToggleTask(task) {
    try {
      setTaskUpdatingId(task.id);
      const nextDone = !isDone(task);
      const nextStatus = nextDone ? 'done' : 'todo';
      await updateProjectTask(task.id, { done: nextDone });
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, done: nextDone, status: nextStatus } : item)));
      showToast(nextDone ? 'Tarefa concluída.' : 'Tarefa reaberta.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao atualizar tarefa.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
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

  async function handleOpenDemandModal() {
    setDemandForm((prev) => ({ ...emptyDemandForm(user?.id || ''), assigneeUserId: prev.assigneeUserId || user?.id || '' }));
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
      showToast('Demanda criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar demanda.', { variant: 'error' });
    } finally {
      setDemandSaving(false);
    }
  }

  const activeKind = activeTask ? getTaskKind(activeTask) : 'demand';
  const activeStatus = activeTask ? statusKey(activeTask) : 'waiting';
  const activeAssignee = activeTask ? activeTask.assigneeName || profileForm.name || user?.name || '' : '';
  const activeRequester = activeTask ? activeTask.createdByName || '' : '';
  const activeDetailItems = activeTask
    ? [
        ['Tipo', kindLabel(activeKind)],
        ['Responsável', activeAssignee || '—'],
        ...(activeRequester && activeRequester !== activeAssignee ? [['Solicitante', activeRequester]] : []),
        ...(activeTask.clientName ? [['Cliente', activeTask.clientName]] : []),
        ...(activeTask.projectName ? [['Projeto', activeTask.projectName]] : []),
        ...(activeTask.sectionName ? [['Seção', activeTask.sectionName]] : []),
        ['Prazo', formatDueLabel(activeTask.dueDate), styles[`due_${activeStatus}`] || ''],
        ['Prioridade', priorityLabel(activeTask.priority)],
      ]
    : [];

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
        </header>

        <div className={styles.operationBody}>
          {tasksLoading ? (
            <StateBlock variant="loading" compact title="Carregando" />
          ) : tasksError ? (
            <StateBlock variant="error" compact title="Erro" />
          ) : visibleTasks.length === 0 ? (
            <div className={styles.emptyOperation}>
              <span>Sem demandas</span>
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
              </div>

              <section className={styles.drawerSection}>
                <div className={styles.detailGrid}>
                  {activeDetailItems.map(([label, value, className]) => (
                    <div key={label} className={styles.detailItem}>
                      <span>{label}</span>
                      <strong className={className || ''}>{value || '—'}</strong>
                    </div>
                  ))}
                </div>
              </section>

              {activeTask.description ? (
                <section className={styles.drawerSection}>
                  <h4>Descrição</h4>
                  <div className={styles.descriptionBox}>{activeTask.description}</div>
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
                    {taskComments.map((comment) => (
                      <article key={comment.id} className={styles.commentItem}>
                        <div>
                          <strong>{comment.authorName || comment.userName || 'Usuário'}</strong>
                          <span>{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p>{comment.body || comment.content || ''}</p>
                      </article>
                    ))}
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
                <Select value={demandForm.clientId} onChange={(event) => setDemandForm((prev) => ({ ...prev, clientId: event.target.value }))} aria-label="Cliente" className={styles.formSelect}>
                  <option value="">Cliente</option>
                  {demandClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </Select>
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

              <textarea value={demandForm.description} onChange={(event) => setDemandForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição" className={styles.demandTextarea} />

              <footer className={styles.settingsFooter}>
                <button type="button" onClick={() => setDemandModalOpen(false)}>Cancelar</button>
                <button type="submit" disabled={demandSaving}>{demandSaving ? 'Criando' : 'Criar demanda'}</button>
              </footer>
            </div>
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
