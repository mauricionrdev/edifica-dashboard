import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/auth.js';
import { createTask, listMyProjectTasks, updateTask as updateProjectTask } from '../api/projects.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { roleLabel } from '../utils/roles.js';
import { normalizeSlug } from '../utils/slugs.js';
import {
  getUserAvatar,
  readAvatarFile,
  removeUserAvatar,
  saveUserAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import DateField from '../components/ui/DateField.jsx';
import StateBlock from '../components/ui/StateBlock.jsx';
import { CloseIcon, PlusIcon, SettingsIcon } from '../components/ui/Icons.jsx';
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

const TASK_TABS = [
  { value: 'upcoming', label: 'Próximas' },
  { value: 'overdue', label: 'Atrasadas' },
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

function formatDueLabel(value) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';

  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const valueKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((valueKey - todayKey) / 86400000);

  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
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
  return 'upcoming';
}

function getVisibleTasks(tasks, tab) {
  const ordered = [...tasks].sort((a, b) => {
    const aDone = a.done || a.status === 'done';
    const bDone = b.done || b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });

  if (tab === 'done') return ordered.filter((task) => getTaskStatus(task) === 'done');
  if (tab === 'overdue') return ordered.filter((task) => getTaskStatus(task) === 'overdue');
  return ordered.filter((task) => getTaskStatus(task) === 'upcoming');
}

function getTaskSections(tasks, tab) {
  const visible = getVisibleTasks(tasks, tab);
  if (tab === 'done') return [{ key: 'done', title: 'Concluídas', tasks: visible }];
  if (tab === 'overdue') return [{ key: 'overdue', title: 'Atrasadas', tasks: visible }];

  const today = [];
  const next = [];
  const later = [];
  const withoutDate = [];
  const todayKey = new Date();
  todayKey.setHours(0, 0, 0, 0);

  visible.forEach((task) => {
    if (!task.dueDate) {
      withoutDate.push(task);
      return;
    }
    const due = new Date(`${task.dueDate}T00:00:00`);
    if (Number.isNaN(due.getTime())) {
      withoutDate.push(task);
      return;
    }
    const diff = Math.round((due.getTime() - todayKey.getTime()) / 86400000);
    if (diff <= 0) today.push(task);
    else if (diff <= 7) next.push(task);
    else later.push(task);
  });

  return [
    { key: 'today', title: 'Hoje', tasks: today },
    { key: 'next', title: 'Semana', tasks: next },
    { key: 'later', title: 'Depois', tasks: later },
    { key: 'no-date', title: 'Sem prazo', tasks: withoutDate },
  ].filter((section) => section.tasks.length > 0);
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
  const [taskTab, setTaskTab] = useState('upcoming');
  const [tasks, setTasks] = useState([]);
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', dueDate: '' });
  const [avatarUrl, setAvatarUrl] = useState(() => getUserAvatar(user));
  const [collapsedTaskSections, setCollapsedTaskSections] = useState({});
  const [activeTaskId, setActiveTaskId] = useState('');

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
    setAvatarUrl(getUserAvatar(user));
    return subscribeAvatarChange(() => setAvatarUrl(getUserAvatar(user)));
  }, [user]);

  async function reloadTasks() {
    const res = await listMyProjectTasks();
    setTasks(Array.isArray(res?.tasks) ? res.tasks : []);
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
        if (!cancelled) setTasksError(err?.message || 'Erro');
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const squadNames = useMemo(() => {
    const map = new Map((squads || []).map((item) => [item.id, item.name]));
    return (user?.squads || []).map((id) => map.get(id) || id);
  }, [squads, user?.squads]);

  const taskGroups = useMemo(() => {
    const upcoming = tasks.filter((task) => getTaskStatus(task) === 'upcoming');
    const overdue = tasks.filter((task) => getTaskStatus(task) === 'overdue');
    const done = tasks.filter((task) => getTaskStatus(task) === 'done');
    return { upcoming, overdue, done };
  }, [tasks]);

  const visibleTasks = useMemo(() => getVisibleTasks(tasks, taskTab), [taskTab, tasks]);
  const taskSections = useMemo(() => getTaskSections(tasks, taskTab), [taskTab, tasks]);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [activeTaskId, tasks]);
  const canCreateTasks = hasPermission(user, 'tasks.create');
  const completionRate = tasks.length ? Math.round((taskGroups.done.length / tasks.length) * 100) : 0;

  useEffect(() => {
    setCollapsedTaskSections((current) => {
      const next = {};
      taskSections.forEach((section) => {
        next[section.key] = current[section.key] ?? false;
      });
      return next;
    });
  }, [taskSections]);

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
      const nextDone = getTaskStatus(task) !== 'done';
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

  async function handleCreateTask(event) {
    event.preventDefault();
    const title = newTask.title.trim();
    if (!title) return;

    try {
      setCreatingTask(true);
      await createTask({
        title,
        assigneeUserId: user?.id || '',
        dueDate: newTask.dueDate || '',
        source: 'personal',
      });
      await reloadTasks();
      setNewTask({ title: '', dueDate: '' });
      showToast('Tarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar tarefa.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={`${styles.avatar} ${styles[`avatar_${profileForm.avatarColor || 'amber'}`]}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileForm.name || user?.name)}
          </span>

          <div className={styles.heroCopy}>
            <div className={styles.heroHeading}>
              <h1>{profileForm.name || user?.name || 'Perfil'}</h1>
              <span className={styles.roleBadge}>{roleLabel(user?.role)}</span>
            </div>
            <div className={styles.heroMeta}>
              {user?.email ? <span>{user.email}</span> : null}
              {squadNames.length ? <span>{squadNames.join(', ')}</span> : null}
            </div>
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

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span>Abertas</span>
            <strong>{taskGroups.upcoming.length}</strong>
          </div>
          <div className={styles.heroStat}>
            <span>Atrasadas</span>
            <strong className={taskGroups.overdue.length ? styles.critical : ''}>{taskGroups.overdue.length}</strong>
          </div>
          <div className={styles.heroStat}>
            <span>Concluídas</span>
            <strong>{taskGroups.done.length}</strong>
          </div>
          <div className={styles.heroStat}>
            <span>Conclusão</span>
            <strong>{completionRate}%</strong>
            <i><b style={{ width: `${completionRate}%` }} /></i>
          </div>
        </div>
      </section>

      <section className={styles.tasksBoard}>
        <header className={styles.boardHeader}>
          <div className={styles.boardTitle}>
            <div className={styles.boardHeadingRow}>
              <h2>Minhas tarefas</h2>
              <span>{visibleTasks.length}</span>
            </div>
            <div className={styles.taskTabs} role="tablist" aria-label="Tarefas">
              {TASK_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={taskTab === tab.value}
                  className={`${styles.taskTab} ${taskTab === tab.value ? styles.taskTabActive : ''}`.trim()}
                  onClick={() => setTaskTab(tab.value)}
                >
                  {tab.label}
                  <span>{taskGroups[tab.value]?.length || 0}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className={styles.tasksBody}>
          {canCreateTasks ? (
            <form className={styles.createTaskBar} onSubmit={handleCreateTask}>
              <input
                value={newTask.title}
                onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Tarefa"
                aria-label="Tarefa"
              />
              <DateField
                value={newTask.dueDate}
                onChange={(value) => setNewTask((prev) => ({ ...prev, dueDate: value }))}
                placeholder="Prazo"
                ariaLabel="Prazo"
                className={styles.taskDateField}
              />
              <button type="submit" disabled={creatingTask || !newTask.title.trim()} aria-label="Criar" title="Criar">
                <PlusIcon size={15} />
              </button>
            </form>
          ) : null}

          {tasksLoading ? (
            <StateBlock variant="loading" compact title="Carregando tarefas" />
          ) : tasksError ? (
            <StateBlock variant="error" compact title="Erro ao carregar tarefas" />
          ) : visibleTasks.length === 0 ? (
            <StateBlock variant="empty" compact title="Nenhuma tarefa" />
          ) : (
            <div className={styles.taskList}>
              <div className={styles.taskTableHead}>
                <span>Nome</span>
                <span>Prazo</span>
                <span>Contexto</span>
              </div>

              {taskSections.map((section) => (
                <section key={section.key} className={styles.taskSection}>
                  <button
                    type="button"
                    className={styles.taskSectionTitle}
                    onClick={() => setCollapsedTaskSections((current) => ({ ...current, [section.key]: !current[section.key] }))}
                    aria-expanded={!collapsedTaskSections[section.key]}
                  >
                    <span aria-hidden="true" className={`${styles.taskSectionArrow} ${collapsedTaskSections[section.key] ? styles.taskSectionArrowCollapsed : ''}`.trim()}>▾</span>
                    <strong>{section.title}</strong>
                    <span>{section.tasks.length}</span>
                  </button>

                  {!collapsedTaskSections[section.key] ? section.tasks.map((task) => (
                    <article
                      key={task.id}
                      className={`${styles.taskRow} ${getTaskStatus(task) === 'done' ? styles.taskRowDone : ''}`.trim()}
                      onClick={() => setActiveTaskId(task.id)}
                    >
                      <button
                        type="button"
                        className={`${styles.taskCheck} ${getTaskStatus(task) === 'done' ? styles.taskCheckDone : ''}`.trim()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleTask(task);
                        }}
                        disabled={taskUpdatingId === task.id}
                        aria-label={getTaskStatus(task) === 'done' ? 'Reabrir tarefa' : 'Concluir tarefa'}
                      >
                        {getTaskStatus(task) === 'done' ? '✓' : ''}
                      </button>

                      <div className={styles.taskNameWrap}>
                        <strong className={styles.taskName}>{task.title}</strong>
                      </div>
                      <span className={`${styles.taskDue} ${styles[`taskDue_${getTaskStatus(task)}`] || ''}`.trim()}>{formatDueLabel(task.dueDate)}</span>
                      <span className={styles.taskProject}>{task.projectName || task.clientName || '—'}</span>
                    </article>
                  )) : null}
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      {activeTask ? (
        <aside className={styles.taskDrawer} aria-label="Tarefa">
          <div className={styles.drawerPanel}>
            <header className={styles.drawerHeader}>
              <button
                type="button"
                className={`${styles.taskCheck} ${getTaskStatus(activeTask) === 'done' ? styles.taskCheckDone : ''}`.trim()}
                onClick={() => handleToggleTask(activeTask)}
                disabled={taskUpdatingId === activeTask.id}
                aria-label={getTaskStatus(activeTask) === 'done' ? 'Reabrir tarefa' : 'Concluir tarefa'}
              >
                {getTaskStatus(activeTask) === 'done' ? '✓' : ''}
              </button>
              <button type="button" className={styles.iconButton} onClick={() => setActiveTaskId('')} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <h3>{activeTask.title}</h3>
            <div className={styles.drawerGrid}>
              <span>Status</span>
              <strong>{getTaskStatus(activeTask) === 'done' ? 'Concluída' : getTaskStatus(activeTask) === 'overdue' ? 'Atrasada' : 'Aberta'}</strong>
              <span>Prazo</span>
              <strong>{formatDueLabel(activeTask.dueDate)}</strong>
              <span>Contexto</span>
              <strong>{activeTask.projectName || activeTask.clientName || '—'}</strong>
            </div>
            {activeTask.description ? (
              <div className={styles.drawerText}>{activeTask.description}</div>
            ) : null}
          </div>
        </aside>
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
                  <select value={profileForm.avatarColor} onChange={(event) => setProfileForm((prev) => ({ ...prev, avatarColor: event.target.value }))}>
                    {AVATAR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
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
