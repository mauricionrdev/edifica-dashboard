import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { createTask, listUserProjectTasks, listUserProjects } from '../api/projects.js';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import DateField from '../components/ui/DateField.jsx';
import { CloseIcon, PlusIcon, ProjectBoardIcon } from '../components/ui/Icons.jsx';
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
  const [profileProjects, setProfileProjects] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
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

  useEffect(() => {
    if (!profileUser?.id) {
      setProfileProjects([]);
      return undefined;
    }

    let cancelled = false;
    setProjectsLoading(true);

    listUserProjects(profileUser.id)
      .then((res) => {
        if (!cancelled) setProfileProjects(Array.isArray(res?.projects) ? res.projects : []);
      })
      .catch(() => {
        if (!cancelled) setProfileProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
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
  const activeProjectsCount = useMemo(
    () => profileProjects.filter((project) => Number(project.taskCount || 0) !== Number(project.doneCount || 0)).length,
    [profileProjects]
  );
  const portfolioCount = gdvClients.length + gestorClients.length;
  const profileContext = userSquads.length
    ? userSquads.map((squad) => squad.name).join(', ')
    : roleLabel(profileUser?.role);

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
          Atribuir tarefa
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
                      <article key={task.id} className={styles.issueRow}>
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

          <section className={styles.workPanel}>
            <header className={styles.sectionHeader}>
              <div>
                <h2>Projetos</h2>
                {/* <p>{profileProjects.length ? `${profileProjects.length} projetos relacionados` : 'Nenhum projeto relacionado'}</p> */}
              </div>
            </header>

            <div className={styles.projectList}>
              {projectsLoading ? (
                <StateBlock variant="loading" compact title="Carregando projetos" />
              ) : profileProjects.length === 0 ? (
                <div className={styles.emptyState}>Sem projetos vinculados.</div>
              ) : (
                profileProjects.map((project) => (
                  <article key={project.id} className={styles.projectRow}>
                    <span className={styles.projectIcon}><ProjectBoardIcon size={15} /></span>
                    <div className={styles.projectCopy}>
                      <strong>{project.name}</strong>
                      <span>{project.clientName || project.squadName || '—'}</span>
                    </div>
                    <div className={styles.projectMeta}>
                      <strong>{project.taskCount ? Math.round(((project.doneCount || 0) / project.taskCount) * 100) : 0}%</strong>
                      <span>{project.doneCount || 0}/{project.taskCount || 0}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </main>
      </div>

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
                <h2>Nova tarefa</h2>
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
