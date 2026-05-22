import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  createTask,
  createTaskComment,
  getTask,
  listTaskComments,
  listUserProjectTasks,
  updateTask as updateProjectTask,
  updateTaskComment,
} from '../api/projects.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import DateField from '../components/ui/DateField.jsx';
import { CloseIcon, PlusIcon } from '../components/ui/Icons.jsx';
import { buildProfilePath, matchesEntityRouteSegment } from '../utils/entityPaths.js';
import styles from './UserProfilePage.module.css';

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

function getTaskStatusLabel(task) {
  const status = getTaskStatus(task);
  if (status === 'done') return 'Concluída';
  if (status === 'overdue') return 'Atrasada';
  return 'Aberta';
}

function canEditProfileTask(task, currentUser) {
  if (!task?.id || !currentUser?.id) return false;
  if (task.assigneeUserId === currentUser.id) return true;
  if (task.createdByUserId === currentUser.id) return true;
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
  const text = `${task?.title || ''} ${task?.description || ''}`.toLowerCase();
  if (text.includes('briefing')) return 'Briefing';
  if (text.includes('rotina')) return 'Rotina';
  if (text.includes('suporte')) return 'Suporte';
  return 'Tarefa';
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
  const [newTask, setNewTask] = useState({ title: '', description: '', dueDate: '' });

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

  const orderedTasks = useMemo(() => orderTasks(profileTasks).slice(0, 12), [profileTasks]);
  const openTasksCount = useMemo(() => profileTasks.filter((task) => getTaskStatus(task) !== 'done').length, [profileTasks]);
  const overdueTasksCount = useMemo(() => profileTasks.filter((task) => getTaskStatus(task) === 'overdue').length, [profileTasks]);
  const completedTasksCount = useMemo(() => profileTasks.filter((task) => getTaskStatus(task) === 'done').length, [profileTasks]);
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
      const [taskRes, commentsRes] = await Promise.all([
        getTask(task.id),
        listTaskComments(task.id),
      ]);
      const loadedTask = taskRes?.task || task;
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
    const title = newTask.title.trim();
    if (!title || !profileUser?.id) return;

    try {
      setAssignSaving(true);
      await createTask({
        title,
        description: newTask.description.trim(),
        assigneeUserId: profileUser.id,
        dueDate: newTask.dueDate || '',
        source: 'profile',
      });
      await reloadProfileTasks(profileUser);
      setNewTask({ title: '', description: '', dueDate: '' });
      setAssignOpen(false);
      showToast('Tarefa atribuída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao atribuir tarefa.', { variant: 'error' });
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
            className={styles.avatar}
            onClick={() => avatarUrl && setAvatarPreviewOpen(true)}
            disabled={!avatarUrl}
            aria-label={avatarUrl ? 'Visualizar foto' : undefined}
          >
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileUser.name)}
          </button>

          <div className={styles.heroCopy}>
            <div className={styles.nameRow}>
              <h1>{profileUser.name}</h1>
              <span className={styles.roleBadge}>{roleLabel(profileUser.role)}</span>
            </div>
            {/* <p>{profileTasks.length ? `${profileUser.name.split(' ')[0]} possui ${openTasksCount} tarefas em aberto.` : `${profileUser.name.split(' ')[0]} não possui tarefas em aberto.`}</p> */}
            <div className={styles.profileMeta}>
              {profileUser.email ? <span>{profileUser.email}</span> : null}
            </div>
          </div>
        </div>

        <button type="button" className={styles.primaryButton} onClick={() => setAssignOpen(true)}>
          Nova demanda
        </button>

        <div className={styles.statRail}>
          <div className={styles.statItem}>
            <span>Em aberto</span>
            <strong>{openTasksCount}</strong>
            {/* <em>{todayTasksCount} para hoje</em> */}
          </div>
          <div className={styles.statItem}>
            <span>Risco</span>
            <strong className={overdueTasksCount ? styles.critical : ''}>{overdueTasksCount}</strong>
            {/* <em>{overdueTasksCount === 1 ? 'atrasada' : 'atrasadas'}</em> */}
          </div>
          <div className={styles.statItem}>
            <span>Concluídas</span>
            <strong>{completedTasksCount}</strong>
            {/* <em>{completionRate}% de conclusão</em> */}
          </div>
          <div className={styles.statItem}>
            <span>Carteira</span>
            <strong>{portfolioCount}</strong>
            {/* <em>{activeProjectsCount} projetos ativos</em> */}
          </div>
        </div>
      </section>

      <div className={styles.profileGrid}>
        <main className={styles.mainColumn}>
          <section className={styles.workPanel}>
            <header className={styles.sectionHeader}>
              <div>
                <h2>Tarefas atribuídas</h2>
                {/* <p>{profileTasks.length ? `${profileTasks.length} registros vinculados ao perfil` : 'Nenhuma tarefa vinculada'}</p> */}
              </div>
            </header>

            <div className={styles.issueTable}>
              <div className={styles.issueHead} aria-hidden="true">
                <span />
                <span>Tarefa</span>
                <span>Contexto</span>
                <span>Propriedades</span>
                <span>Prazo</span>
              </div>

              <div className={styles.issueList}>
                {tasksLoading ? (
                  <StateBlock variant="loading" compact title="Carregando tarefas" />
                ) : orderedTasks.length === 0 ? (
                  <div className={styles.emptyState}>Sem tarefas vinculadas.</div>
                ) : (
                  orderedTasks.map((task) => {
                    const status = getTaskStatus(task);
                    return (
                      <article
                        key={task.id}
                        className={styles.issueRow}
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
                          {/* {task.description ? <span>{task.description}</span> : null} */}
                        </div>

                        <span className={styles.issueContext}>{task.clientName || task.projectName || '—'}</span>

                        <div className={styles.issueProperties}>
                          <span className={`${styles.tag} ${styles[`tag_${status}`] || ''}`.trim()}>{getTaskStatusLabel(task)}</span>
                          <span className={`${styles.tag} ${styles.tagKind}`}>{taskKindLabel(task)}</span>
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

      {activeTaskOpen && activeTask ? (
        <div className={styles.taskDetailOverlay} role="presentation" onClick={closeTaskDetail}>
          <aside className={styles.taskDetailDrawer} role="dialog" aria-modal="true" aria-label="Detalhes da tarefa" onClick={(event) => event.stopPropagation()}>
            <header className={styles.taskDetailHeader}>
              <div className={styles.taskDetailTitleBlock}>
                <span className={`${styles.tag} ${styles[`tag_${getTaskStatus(activeTask)}`] || ''}`.trim()}>{getTaskStatusLabel(activeTask)}</span>
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
                  <h2 onDoubleClick={() => {
                    if (!canEditProfileTask(activeTask, currentUser)) return;
                    setTitleDraft(activeTask.title || '');
                    setEditingTitle(true);
                  }}>{compactText(activeTask.title, 'Tarefa sem título')}</h2>
                )}
                <p>{activeTask.clientName || activeTask.projectName || 'Sem contexto vinculado'}</p>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeTaskDetail} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            {taskDetailLoading ? (
              <StateBlock variant="loading" compact title="Carregando tarefa" />
            ) : (
              <div className={styles.taskDetailBody}>
                <section className={styles.taskDetailSection}>
                  <div className={styles.taskDetailMetaGrid}>
                    <div><span>Responsável</span><strong>{activeTask.assigneeName || 'Sem responsável'}</strong></div>
                    <div><span>Criada por</span><strong>{activeTask.createdByName || '—'}</strong></div>
                    <div><span>Prazo</span><strong>{formatDateLabel(activeTask.dueDate)}</strong></div>
                    <div><span>Prioridade</span><strong>{activeTask.priority || 'medium'}</strong></div>
                  </div>
                </section>

                <section className={styles.taskDetailSection}>
                  <header className={styles.taskDetailSectionHeader}>
                    <h3>Descrição</h3>
                    {!canEditProfileTask(activeTask, currentUser) ? <span>Somente visualização</span> : null}
                  </header>
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

                <section className={styles.taskDetailSection}>
                  <header className={styles.taskDetailSectionHeader}>
                    <h3>Comentários</h3>
                    <span>{taskComments.length}</span>
                  </header>
                  <div className={styles.commentList}>
                    {taskComments.length === 0 ? (
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
            )}

            <footer className={styles.taskDetailFooter}>
              <span>{canEditProfileTask(activeTask, currentUser) ? 'Edição liberada para colaboradores.' : 'Somente visualização.'}</span>
              {canEditProfileTask(activeTask, currentUser) ? (
                <button type="button" onClick={handleToggleTaskStatus} disabled={taskSaving}>
                  {getTaskStatus(activeTask) === 'done' ? 'Reabrir' : 'Concluir'}
                </button>
              ) : null}
            </footer>
          </aside>
        </div>
      ) : null}

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
          <form className={styles.taskModal} onSubmit={handleAssignTask} onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>{profileUser.name}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setAssignOpen(false)} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <input
              value={newTask.title}
              onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Tarefa"
              aria-label="Tarefa"
            />
            <textarea
              value={newTask.description}
              onChange={(event) => setNewTask((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Descrição"
              aria-label="Descrição"
              rows={5}
            />
            <div className={styles.modalGrid}>
              <div>
                <span>Responsável</span>
                <strong>{profileUser.name}</strong>
              </div>
              <DateField
                value={newTask.dueDate}
                onChange={(value) => setNewTask((prev) => ({ ...prev, dueDate: value }))}
                placeholder="Prazo"
                ariaLabel="Prazo"
              />
            </div>

            <footer className={styles.modalFooter}>
              <button type="submit" disabled={assignSaving || !newTask.title.trim()}>
                <PlusIcon size={15} />
                Criar
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
