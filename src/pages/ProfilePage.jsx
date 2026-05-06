import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/auth.js';
import { listMyProjectTasks, updateTask as updateProjectTask } from '../api/projects.js';
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
  if (task?.status === 'in_progress') return 'active';
  return 'open';
}

function getTaskStatusLabel(task) {
  const status = getTaskStatus(task);
  if (status === 'done') return 'Concluída';
  if (status === 'overdue') return 'Atrasada';
  if (status === 'active') return 'Em andamento';
  return 'Aberta';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function taskSearchText(task) {
  return normalizeText([
    task?.title,
    task?.description,
    task?.source,
    task?.projectName,
    task?.clientName,
    task?.sectionName,
    task?.createdByName,
  ].filter(Boolean).join(' '));
}

function getOperationType(task) {
  const text = taskSearchText(task);
  if (/pente fino|rotina|diario|diaria|semanal|mensal|auditoria|checklist/.test(text)) return 'routine';
  if (/briefing|implementacao|onboarding|setup|crm\/ia|crm ia|agente|whatsapp|campanha/.test(text)) return 'briefing';
  if (/suporte|bug|erro|acesso|permissao|permissao|ajuste|integracao|conexao|desconect/.test(text)) return 'support';
  if (task?.projectId || task?.projectName) return 'project';
  return 'task';
}

function getOperationTypeLabel(task) {
  const type = getOperationType(task);
  if (type === 'briefing') return 'Briefing';
  if (type === 'routine') return 'Rotina';
  if (type === 'support') return 'Suporte';
  if (type === 'project') return 'Projeto';
  return 'Demanda';
}

function getOriginLabel(task) {
  if (task?.projectName) return 'Projeto';
  if (task?.clientName) return 'Cliente';
  if (getOperationType(task) === 'routine') return 'Rotina';
  if (getOperationType(task) === 'briefing') return 'Briefing';
  return 'Direta';
}

function isWaiting(task) {
  const text = taskSearchText(task);
  return /aguardando|pendente de|retorno|terceiro|cliente/.test(text) || task?.status === 'waiting';
}

function orderTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const order = { overdue: 0, active: 1, open: 2, done: 3 };
    const aStatus = getTaskStatus(a);
    const bStatus = getTaskStatus(b);
    if (order[aStatus] !== order[bStatus]) return order[aStatus] - order[bStatus];
    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });
}

function filterTasksByTab(tasks, tab) {
  const ordered = orderTasks(tasks);
  if (tab === 'done') return ordered.filter((task) => getTaskStatus(task) === 'done');
  if (tab === 'overdue') return ordered.filter((task) => getTaskStatus(task) === 'overdue');
  if (tab === 'briefing') return ordered.filter((task) => getTaskStatus(task) !== 'done' && getOperationType(task) === 'briefing');
  if (tab === 'routine') return ordered.filter((task) => getTaskStatus(task) !== 'done' && getOperationType(task) === 'routine');
  if (tab === 'support') return ordered.filter((task) => getTaskStatus(task) !== 'done' && getOperationType(task) === 'support');
  if (tab === 'waiting') return ordered.filter((task) => getTaskStatus(task) !== 'done' && isWaiting(task));
  return ordered.filter((task) => getTaskStatus(task) !== 'done' && getTaskStatus(task) !== 'overdue');
}

function buildTaskCounters(tasks) {
  return {
    today: filterTasksByTab(tasks, 'today').length,
    overdue: filterTasksByTab(tasks, 'overdue').length,
    briefing: filterTasksByTab(tasks, 'briefing').length,
    routine: filterTasksByTab(tasks, 'routine').length,
    support: filterTasksByTab(tasks, 'support').length,
    waiting: filterTasksByTab(tasks, 'waiting').length,
    done: filterTasksByTab(tasks, 'done').length,
  };
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
  const [operationTab, setOperationTab] = useState('today');
  const [tasks, setTasks] = useState([]);
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(() => getUserAvatar(user));
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

  const taskCounters = useMemo(() => buildTaskCounters(tasks), [tasks]);
  const visibleTasks = useMemo(() => filterTasksByTab(tasks, operationTab), [operationTab, tasks]);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [activeTaskId, tasks]);
  const completionRate = tasks.length ? Math.round((taskCounters.done / tasks.length) * 100) : 0;

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
      await reloadTasks();
    } catch (err) {
      showToast(err?.message || 'Erro ao atualizar tarefa.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }

  const activeStatus = activeTask ? getTaskStatus(activeTask) : '';

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (activeTaskId) setActiveTaskId('');
      if (settingsOpen) setSettingsOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTaskId, settingsOpen]);

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
            <span>Hoje</span>
            <strong>{taskCounters.today}</strong>
          </div>
          <div className={styles.heroStat}>
            <span>Atrasadas</span>
            <strong className={taskCounters.overdue ? styles.critical : ''}>{taskCounters.overdue}</strong>
          </div>
          <div className={styles.heroStat}>
            <span>Briefings</span>
            <strong>{taskCounters.briefing}</strong>
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
              <h2>Minha operação</h2>
              <span>{visibleTasks.length}</span>
            </div>
            <div className={styles.operationTabs} role="tablist" aria-label="Operação">
              {OPERATION_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={operationTab === tab.value}
                  className={`${styles.operationTab} ${operationTab === tab.value ? styles.operationTabActive : ''}`.trim()}
                  onClick={() => setOperationTab(tab.value)}
                >
                  {tab.label}
                  <span>{taskCounters[tab.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className={styles.tasksBody}>
          {tasksLoading ? (
            <StateBlock variant="loading" compact title="Carregando" />
          ) : tasksError ? (
            <StateBlock variant="error" compact title="Erro" />
          ) : visibleTasks.length === 0 ? (
            <StateBlock variant="empty" compact title="Sem demandas" />
          ) : (
            <div className={styles.taskList}>
              <div className={styles.taskTableHead}>
                <span>Demanda</span>
                <span>Tipo</span>
                <span>Prazo</span>
                <span>Contexto</span>
              </div>

              {visibleTasks.map((task) => {
                const status = getTaskStatus(task);
                return (
                  <article
                    key={task.id}
                    className={`${styles.taskRow} ${status === 'done' ? styles.taskRowDone : ''}`.trim()}
                    onClick={() => setActiveTaskId(task.id)}
                  >
                    <button
                      type="button"
                      className={`${styles.taskCheck} ${status === 'done' ? styles.taskCheckDone : ''}`.trim()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleTask(task);
                      }}
                      disabled={taskUpdatingId === task.id}
                      aria-label={status === 'done' ? 'Reabrir' : 'Concluir'}
                    >
                      {status === 'done' ? '✓' : ''}
                    </button>

                    <div className={styles.taskNameWrap}>
                      <strong className={styles.taskName}>{task.title}</strong>
                      {task.createdByName ? <span>{task.createdByName}</span> : null}
                    </div>
                    <span className={`${styles.taskKind} ${styles[`taskKind_${getOperationType(task)}`] || ''}`.trim()}>{getOperationTypeLabel(task)}</span>
                    <span className={`${styles.taskDue} ${styles[`taskDue_${status}`] || ''}`.trim()}>{formatDueLabel(task.dueDate)}</span>
                    <span className={styles.taskProject}>{task.clientName || task.projectName || task.sectionName || '—'}</span>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {activeTask ? (
        <aside className={styles.taskDrawer} aria-label="Demanda" onClick={() => setActiveTaskId('')}>
          <div className={styles.drawerPanel} onClick={(event) => event.stopPropagation()}>
            <header className={styles.drawerHeader}>
              <button
                type="button"
                className={`${styles.taskCheck} ${activeStatus === 'done' ? styles.taskCheckDone : ''}`.trim()}
                onClick={() => handleToggleTask(activeTask)}
                disabled={taskUpdatingId === activeTask.id}
                aria-label={activeStatus === 'done' ? 'Reabrir' : 'Concluir'}
              >
                {activeStatus === 'done' ? '✓' : ''}
              </button>
              <button type="button" className={styles.iconButton} onClick={() => setActiveTaskId('')} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.drawerContent}>
              <div className={styles.drawerTitleBlock}>
                <span className={`${styles.statusPill} ${styles[`statusPill_${activeStatus}`] || ''}`.trim()}>{getTaskStatusLabel(activeTask)}</span>
                <h3>{activeTask.title}</h3>
              </div>

              <div className={styles.drawerGrid}>
                <span>Tipo</span>
                <strong>{getOperationTypeLabel(activeTask)}</strong>
                <span>Origem</span>
                <strong>{getOriginLabel(activeTask)}</strong>
                <span>Solicitante</span>
                <strong>{activeTask.createdByName || '—'}</strong>
                <span>Cliente</span>
                <strong>{activeTask.clientName || '—'}</strong>
                <span>Projeto</span>
                <strong>{activeTask.projectName || '—'}</strong>
                <span>Seção</span>
                <strong>{activeTask.sectionName || '—'}</strong>
                <span>Prazo</span>
                <strong>{formatDueLabel(activeTask.dueDate)}</strong>
              </div>

              {activeTask.description ? (
                <section className={styles.drawerSection}>
                  <h4>Descrição</h4>
                  <div className={styles.drawerText}>{activeTask.description}</div>
                </section>
              ) : null}
            </div>
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
