import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/auth.js';
import { createTask, listMyProjectTasks, updateTask as updateProjectTask } from '../api/projects.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { roleLabel } from '../utils/roles.js';
import {
  getUserAvatar,
  readAvatarFile,
  removeUserAvatar,
  saveUserAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import UserPicker from '../components/users/UserPicker.jsx';
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
    { key: 'today', title: 'A fazer hoje', tasks: today },
    { key: 'next', title: 'Próxima semana', tasks: next },
    { key: 'later', title: 'Mais tarde', tasks: later },
    { key: 'no-date', title: 'Sem prazo', tasks: withoutDate },
  ].filter((section) => section.tasks.length > 0);
}

export default function ProfilePage() {
  const { setPanelHeader, squads = [], userDirectory = [] } = useOutletContext();
  const { user, reloadUser } = useAuth();
  const { showToast } = useToast();
  const avatarInputRef = useRef(null);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    avatarColor: user?.avatarColor || 'amber',
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
  const [newTask, setNewTask] = useState({ title: '', assigneeUserId: user?.id || '', dueDate: '' });
  const [avatarUrl, setAvatarUrl] = useState(() => getUserAvatar(user));
  const [collapsedTaskSections, setCollapsedTaskSections] = useState({});

  useEffect(() => {
    setPanelHeader({
      title: 'Perfil',
      description: null,
      actions: null,
    });
  }, [setPanelHeader]);

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      phone: user?.phone || '',
      avatarColor: user?.avatarColor || 'amber',
    });
  }, [user?.name, user?.phone, user?.avatarColor]);

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
        if (!cancelled) setTasksError(err?.message || 'Não foi possível carregar suas tarefas.');
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setNewTask((prev) => ({ ...prev, assigneeUserId: prev.assigneeUserId || user?.id || '' }));
  }, [user?.id]);


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
  const canCreateTasks = hasPermission(user, 'tasks.create');

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
      showToast('Perfil atualizado com sucesso.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar o perfil.', { variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    try {
      setSavingPassword(true);
      await changePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      showToast('Senha atualizada com sucesso.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível alterar a senha.', { variant: 'error' });
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
      if (!saved) throw new Error('Não foi possível salvar a foto.');
      setAvatarUrl(dataUrl);
      showToast('Foto do perfil atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível usar esta imagem.', { variant: 'error' });
    }
  }

  async function handleRemoveAvatar() {
    try {
      await updateProfile({ avatarUrl: '' });
      await reloadUser();
      removeUserAvatar(user);
      setAvatarUrl('');
      showToast('Foto do perfil removida.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a foto.', { variant: 'error' });
    }
  }

  async function handleToggleTask(task) {
    try {
      setTaskUpdatingId(task.id);
      const nextDone = getTaskStatus(task) !== 'done';
      const nextStatus = nextDone ? 'done' : 'todo';

      await updateProjectTask(task.id, { done: nextDone });

      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id ? { ...item, done: nextDone, status: nextStatus } : item
        )
      );

      showToast(nextDone ? 'Tarefa concluída.' : 'Tarefa reaberta.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar a tarefa.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }

  async function reloadTasks() {
    const res = await listMyProjectTasks();
    setTasks(Array.isArray(res?.tasks) ? res.tasks : []);
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    const title = newTask.title.trim();
    if (!title) return;

    try {
      setCreatingTask(true);
      await createTask({
        title,
        assigneeUserId: newTask.assigneeUserId || user?.id || '',
        dueDate: newTask.dueDate || '',
        source: 'personal',
      });
      await reloadTasks();
      setNewTask((prev) => ({ ...prev, title: '', dueDate: '' }));
      showToast('Tarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a tarefa.', { variant: 'error' });
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
              <span className={styles.boardMeta}>{roleLabel(user?.role)}</span>
            </div>
            {user?.email ? (
              <div className={styles.heroMeta}>
                <span>{user.email}</span>
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className={styles.settingsButton}
          onClick={() => {
            setSettingsTab('profile');
            setSettingsOpen(true);
          }}
        >
          Configurações
        </button>
      </section>

      <section className={styles.tasksBoard}>
        <header className={styles.boardHeader}>
          <div className={styles.boardIdentity}>
            <div className={styles.boardTitle}>
              <div className={styles.boardHeadingRow}>
                <h2>Minhas tarefas</h2>
                <span className={styles.boardMeta}>{visibleTasks.length}</span>
              </div>
              <div className={styles.taskTabs} role="tablist" aria-label="Filtros de tarefas">
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
          </div>

          {canCreateTasks ? (
            <button type="button" className={styles.addTaskButton} onClick={() => setTaskTab('upcoming')}>
              Nova tarefa
            </button>
          ) : null}
        </header>

        <div className={styles.tasksBody}>
          {canCreateTasks ? (
            <form className={styles.createTaskBar} onSubmit={handleCreateTask}>
              <input
                value={newTask.title}
                onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Adicionar tarefa"
                aria-label="Nova tarefa"
              />
              <UserPicker
                users={Array.isArray(userDirectory) ? userDirectory : []}
                value={newTask.assigneeUserId}
                onChange={(userId) => setNewTask((prev) => ({ ...prev, assigneeUserId: userId || user?.id || '' }))}
                placeholder="Responsável"
              />
              <input
                type="date"
                value={newTask.dueDate}
                onChange={(event) => setNewTask((prev) => ({ ...prev, dueDate: event.target.value }))}
                aria-label="Prazo"
              />
              <button type="submit" disabled={creatingTask || !newTask.title.trim()}>
                Criar
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
                <span>Projeto</span>
              </div>

              {taskSections.map((section) => (
                <section key={section.key} className={styles.taskSection}>
                  <button
                    type="button"
                    className={styles.taskSectionTitle}
                    onClick={() =>
                      setCollapsedTaskSections((current) => ({
                        ...current,
                        [section.key]: !current[section.key],
                      }))
                    }
                    aria-expanded={!collapsedTaskSections[section.key]}
                  >
                    <span
                      aria-hidden="true"
                      className={`${styles.taskSectionArrow} ${collapsedTaskSections[section.key] ? styles.taskSectionArrowCollapsed : ''}`.trim()}
                    >
                      ▾
                    </span>
                    <strong>{section.title}</strong>
                    <span>{section.tasks.length}</span>
                  </button>

                  {!collapsedTaskSections[section.key] ? section.tasks.map((task) => (
                    <article
                      key={task.id}
                      className={`${styles.taskRow} ${getTaskStatus(task) === 'done' ? styles.taskRowDone : ''}`.trim()}
                    >
                      <button
                        type="button"
                        className={`${styles.taskCheck} ${getTaskStatus(task) === 'done' ? styles.taskCheckDone : ''}`.trim()}
                        onClick={() => handleToggleTask(task)}
                        disabled={taskUpdatingId === task.id}
                        aria-label={getTaskStatus(task) === 'done' ? 'Reabrir tarefa' : 'Concluir tarefa'}
                      >
                        {getTaskStatus(task) === 'done' ? '✓' : ''}
                      </button>

                      <div className={styles.taskNameWrap}>
                        <strong className={styles.taskName}>{task.title}</strong>
                        {task.clientName && !task.projectName ? (
                          <span className={styles.taskContext}>{task.clientName}</span>
                        ) : null}
                      </div>
                      <span className={`${styles.taskDue} ${styles[`taskDue_${getTaskStatus(task)}`] || ''}`.trim()}>{formatDueLabel(task.dueDate)}</span>
                      <span className={styles.taskProject}>{task.projectName || task.clientName || 'Projeto'}</span>
                    </article>
                  )) : null}
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      {settingsOpen ? (
        <div className={styles.settingsOverlay} onClick={() => setSettingsOpen(false)}>
          <section
            className={styles.settingsModal}
            role="dialog"
            aria-modal="true"
            aria-label="Configurações do perfil"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.settingsHeader}>
              <div>
                <h2>Configurações</h2>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setSettingsOpen(false)}
                aria-label="Fechar configurações"
              >
                ×
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

            <div className={styles.settingsBody}>
              {settingsTab === 'profile' ? (
                <div className={styles.settingsSection}>
                  <div className={styles.photoBlock}>
                    <span className={`${styles.photoAvatar} ${styles[`avatar_${profileForm.avatarColor || 'amber'}`]}`}>
                      {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileForm.name || user?.name)}
                    </span>

                    <div className={styles.photoInfo}>
                      <div className={styles.photoActions}>
                        <button type="button" className={styles.linkButton} onClick={() => avatarInputRef.current?.click()}>
                          Enviar nova foto
                        </button>
                        <span>·</span>
                        <button type="button" className={styles.linkButton} onClick={handleRemoveAvatar} disabled={!avatarUrl}>
                          Remover foto
                        </button>
                      </div>
                      
                    </div>
                    <input
                      ref={avatarInputRef}
                      className={styles.fileInput}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                    />
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Nome completo</span>
                      <input
                        value={profileForm.name}
                        onChange={(event) =>
                          setProfileForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Telefone</span>
                      <input
                        value={profileForm.phone}
                        onChange={(event) =>
                          setProfileForm((prev) => ({ ...prev, phone: event.target.value }))
                        }
                        placeholder="Opcional"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Cargo</span>
                      <input value={roleLabel(user?.role)} disabled />
                    </label>

                    <label className={styles.field}>
                      <span>E-mail</span>
                      <input value={user?.email || ''} disabled />
                    </label>

                    <label className={styles.field}>
                      <span>Equipe ou departamento</span>
                      <input value={squadNames.join(', ') || 'Sem squads'} disabled />
                    </label>

                    <label className={styles.field}>
                      <span>Cor do avatar</span>
                      <div className={styles.avatarChoices}>
                        {AVATAR_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`${styles.avatarChoice} ${styles[`avatar_${option.value}`]} ${
                              profileForm.avatarColor === option.value ? styles.avatarChoiceActive : ''
                            }`.trim()}
                            onClick={() => setProfileForm((prev) => ({ ...prev, avatarColor: option.value }))}
                            aria-label={`Usar avatar ${option.label}`}
                            title={option.label}
                          >
                            {initials(profileForm.name || user?.name)}
                          </button>
                        ))}
                      </div>
                    </label>
                  </div>

                  <div className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                    >
                      {savingProfile ? 'Salvando' : 'Salvar alterações'}
                    </button>
                  </div>
                </div>
              ) : null}

              {settingsTab === 'account' ? (
                <div className={styles.settingsSection}>
                  <div className={styles.sectionCopy}>
                    <h3>Conta e segurança</h3>
                    
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Senha atual</span>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(event) =>
                          setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Nova senha</span>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(event) =>
                          setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <div className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={handleChangePassword}
                      disabled={savingPassword || !passwordForm.currentPassword || !passwordForm.newPassword}
                    >
                      {savingPassword ? 'Atualizando' : 'Atualizar senha'}
                    </button>
                  </div>
                </div>
              ) : null}

            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

