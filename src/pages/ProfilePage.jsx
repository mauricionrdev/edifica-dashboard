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
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const squadNames = useMemo(() => {
    const map = new Map((squads || []).map((item) => [item.id, item.name]));
    return (user?.squads || []).map((id) => map.get(id) || id);
  }, [squads, user?.squads]);

  const operationCounts = useMemo(() => getOperationCounts(tasks), [tasks]);
  const visibleTasks = useMemo(() => getVisibleTasks(tasks, operationTab), [operationTab, tasks]);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [activeTaskId, tasks]);
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

  const activeKind = activeTask ? getTaskKind(activeTask) : 'demand';
  const activeStatus = activeTask ? statusKey(activeTask) : 'waiting';

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
          <div>
            <h2>Minha operação</h2>
            <span>{visibleTasks.length}</span>
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
            <StateBlock variant="empty" compact title="Vazio" />
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
                  <span>Tipo</span>
                  <strong>{kindLabel(activeKind)}</strong>
                  <span>Origem</span>
                  <strong>{activeTask.projectId ? 'Projeto' : activeKind === 'routine' ? 'Rotina' : activeKind === 'briefing' ? 'Briefing' : 'Demanda'}</strong>
                  <span>Responsável</span>
                  <strong>{activeTask.assigneeName || profileForm.name || user?.name || '—'}</strong>
                  <span>Solicitante</span>
                  <strong>{metaValue(activeTask.createdByName)}</strong>
                  <span>Cliente</span>
                  <strong>{metaValue(activeTask.clientName)}</strong>
                  <span>Projeto</span>
                  <strong>{metaValue(activeTask.projectName)}</strong>
                  <span>Seção</span>
                  <strong>{metaValue(activeTask.sectionName)}</strong>
                  <span>Prazo</span>
                  <strong className={styles[`due_${activeStatus}`] || ''}>{formatDueLabel(activeTask.dueDate)}</strong>
                  <span>Prioridade</span>
                  <strong>{priorityLabel(activeTask.priority)}</strong>
                </div>
              </section>

              <section className={styles.drawerSection}>
                <h4>Descrição</h4>
                <div className={styles.descriptionBox}>{activeTask.description || '—'}</div>
              </section>

              <section className={styles.drawerSection}>
                <h4>Subtarefas</h4>
                <div className={styles.emptyStrip}>—</div>
              </section>

              <section className={styles.drawerSection}>
                <h4>Comentários</h4>
                <div className={styles.commentComposer}>Adicionar comentário</div>
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
