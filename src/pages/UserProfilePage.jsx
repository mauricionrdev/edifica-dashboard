import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { createTask, listUserProjectTasks, listUserProjects } from '../api/projects.js';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import DateField from '../components/ui/DateField.jsx';
import { CloseIcon, ProjectBoardIcon } from '../components/ui/Icons.jsx';
import { buildProfilePath, matchesEntityRouteSegment } from '../utils/entityPaths.js';
import { useToast } from '../context/ToastContext.jsx';
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
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function getTaskStatusLabel(task) {
  return task?.status === 'done' ? 'Concluída' : 'Aberta';
}

export default function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
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
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', dueDate: '' });
  const { showToast } = useToast();

  useEffect(() => {
    if (!Array.isArray(userDirectory) || userDirectory.length === 0) {
      refreshUserDirectory?.().catch(() => {});
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

  const visibleProfileTasks = useMemo(() => profileTasks.slice(0, 10), [profileTasks]);
  const openTasksCount = useMemo(() => profileTasks.filter((task) => task?.status !== 'done').length, [profileTasks]);
  const completedTasksCount = useMemo(() => profileTasks.filter((task) => task?.status === 'done').length, [profileTasks]);
  const groupedProfileTasks = useMemo(() => ([
    {
      key: 'open',
      title: 'Abertas',
      tasks: profileTasks.filter((task) => task?.status !== 'done').slice(0, 6),
    },
    {
      key: 'done',
      title: 'Concluídas',
      tasks: profileTasks.filter((task) => task?.status === 'done').slice(0, 4),
    },
  ]).filter((section) => section.tasks.length > 0), [profileTasks]);

  async function reloadProfileTasks() {
    if (!profileUser?.id) return;
    const res = await listUserProjectTasks(profileUser.id);
    setProfileTasks(Array.isArray(res?.tasks) ? res.tasks : []);
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    const title = newTask.title.trim();
    if (!title || !profileUser?.id) return;

    try {
      setCreatingTask(true);
      await createTask({
        title,
        description: newTask.description.trim(),
        assigneeUserId: profileUser.id,
        dueDate: newTask.dueDate || '',
        source: 'profile',
      });
      await reloadProfileTasks();
      setNewTask({ title: '', description: '', dueDate: '' });
      setTaskModalOpen(false);
      showToast('Tarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a tarefa.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  }

  if (!profileUser) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="empty"
          title="Usuário não encontrado"
          description="Esse perfil não está disponível no diretório carregado."
          action={<Link to="/equipe" className={styles.inlineLink}>Voltar para Equipe</Link>}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.avatar}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileUser.name)}
          </span>

          <div className={styles.heroCopy}>
            <div className={styles.nameRow}>
              <h1>{profileUser.name}</h1>
              <span className={styles.roleBadge}>{roleLabel(profileUser.role)}</span>
            </div>

            {profileUser.email ? (
              <div className={styles.profileMeta}>
                <span>{profileUser.email}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.heroActions}>
          {profileUser.email ? (
            <a href={`mailto:${profileUser.email}`} className={styles.secondaryButton}>E-mail</a>
          ) : null}
          <button type="button" className={styles.primaryButton} onClick={() => setTaskModalOpen(true)}>
            Atribuir tarefa
          </button>
        </div>
      </section>

      <div className={styles.layout}>
        <main className={styles.mainColumn}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <h2>Tarefas</h2>
                <p>{profileTasks.length} vinculadas</p>
              </div>

            </header>

            <div className={styles.taskTableHead}>
              <span>Nome</span>
              <span>Projeto</span>
              <span>Status</span>
              <span>Prazo</span>
            </div>

            <div className={styles.taskList}>
              {tasksLoading ? (
                <StateBlock variant="loading" compact title="Carregando tarefas" />
              ) : visibleProfileTasks.length === 0 ? (
                <StateBlock variant="empty" compact title="Sem tarefas" />
              ) : (
                groupedProfileTasks.map((section) => (
                  <section key={section.key} className={styles.taskSection}>
                    <header className={styles.taskSectionHeader}>
                      <strong>{section.title}</strong>
                      <span>{section.tasks.length}</span>
                    </header>
                    {section.tasks.map((task) => (
                      <article
                        key={task.id}
                        className={styles.taskRow}
                      >
                        <span className={styles.checkCircle} aria-hidden="true" />
                        <div className={styles.taskCopy}>
                          <strong>{task.title}</strong>
                        </div>
                        <span className={styles.taskProject}>{task.projectName || task.clientName || 'Projeto'}</span>
                        <span className={styles.taskTag}>{getTaskStatusLabel(task)}</span>
                        <span className={styles.taskDue}>{formatDateLabel(task.dueDate)}</span>
                      </article>
                    ))}
                  </section>
                ))
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <h2>Projetos</h2>
                <p>{profileProjects.length} ativos</p>
              </div>
            </header>

            <div className={styles.projectList}>
              {projectsLoading ? (
                <StateBlock variant="loading" compact title="Carregando projetos" />
              ) : profileProjects.length === 0 ? (
                <span className={styles.emptyText}>Sem projetos vinculados.</span>
              ) : (
                profileProjects.map((project) => (
                  <article
                    key={project.id}
                    className={styles.projectRow}
                  >
                    <span className={styles.projectIcon}><ProjectBoardIcon size={18} /></span>
                    <div className={styles.projectCopy}>
                      <strong>{project.name}</strong>
                      <span>{project.clientName || project.squadName || 'Projeto vinculado'}</span>
                    </div>
                    <div className={styles.projectMeta}>
                      <span className={styles.projectProgress}>
                        {project.taskCount ? Math.round(((project.doneCount || 0) / project.taskCount) * 100) : 0}%
                      </span>
                      <span className={styles.projectArrow}>
                        {project.doneCount}/{project.taskCount}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </main>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <h2>Atuação</h2>
                <p>Resumo operacional</p>
              </div>
            </header>

            <div className={styles.infoList}>
              <div className={styles.infoRow}>
                <span>Carteira GDV</span>
                <strong>{gdvClients.length} clientes</strong>
              </div>
              <div className={styles.infoRow}>
                <span>Carteira gestor</span>
                <strong>{gestorClients.length} clientes</strong>
              </div>
              <div className={styles.infoRow}>
                <span>Squads</span>
                <strong>{userSquads.length ? userSquads.map((squad) => squad.name).join(', ') : 'Sem vínculo'}</strong>
              </div>
              <div className={styles.infoRow}>
                <span>Squads próprios</span>
                <strong>{ownedSquads.length ? ownedSquads.map((squad) => squad.name).join(', ') : 'Nenhum'}</strong>
              </div>
              <div className={styles.infoRow}>
                <span>GDVs próprios</span>
                <strong>{ownedGdvs.length ? ownedGdvs.map((gdv) => gdv.name).join(', ') : 'Nenhum'}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {taskModalOpen ? (
        <div className={styles.modalOverlay} onMouseDown={() => setTaskModalOpen(false)}>
          <section
            className={styles.taskModal}
            role="dialog"
            aria-modal="true"
            aria-label="Nova tarefa"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.modalKicker}>Tarefa</span>
                <h2>Nova tarefa</h2>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setTaskModalOpen(false)} aria-label="Fechar">
                <CloseIcon size={18} />
              </button>
            </header>

            <form className={styles.taskForm} onSubmit={handleCreateTask}>
              <input
                value={newTask.title}
                onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Nome da tarefa"
                aria-label="Nome da tarefa"
                autoFocus
              />
              <textarea
                value={newTask.description}
                onChange={(event) => setNewTask((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Descrição"
                aria-label="Descrição"
                rows={5}
              />
              <div className={styles.assignmentRow}>
                <div className={styles.assigneeChip}>
                  <span className={styles.miniAvatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileUser.name)}</span>
                  <span>{profileUser.name}</span>
                </div>
                <DateField
                  value={newTask.dueDate}
                  onChange={(value) => setNewTask((prev) => ({ ...prev, dueDate: value }))}
                  placeholder="Prazo"
                  ariaLabel="Prazo"
                />
              </div>
              <footer className={styles.modalFooter}>
                <button type="button" className={styles.secondaryButton} onClick={() => setTaskModalOpen(false)}>Cancelar</button>
                <button type="submit" className={styles.primaryButton} disabled={creatingTask || !newTask.title.trim()}>Criar tarefa</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

    </div>
  );
}

