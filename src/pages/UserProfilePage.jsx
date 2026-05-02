import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { listUserProjectTasks, listUserProjects } from '../api/projects.js';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import { ProjectBoardIcon } from '../components/ui/Icons.jsx';
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

  useEffect(() => {
    if (!Array.isArray(userDirectory) || userDirectory.length === 0) {
      refreshUserDirectory?.().catch(() => {});
    }
  }, [refreshUserDirectory, userDirectory]);

  const profileUser = useMemo(
    () => (Array.isArray(userDirectory) ? userDirectory.find((entry) => String(entry?.id) === String(userId) || String(entry?.customSlug || '') === String(userId)) : null),
    [userDirectory, userId]
  );

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

        <Link to="/projetos" className={styles.primaryButton}>Abrir projetos</Link>
      </section>

      <div className={styles.layout}>
        <main className={styles.mainColumn}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <h2>Tarefas</h2>
                <p>{profileTasks.length} vinculadas</p>
              </div>
              <Link to="/projetos" className={styles.panelAction}>Ver projetos</Link>
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
                      <Link
                        key={task.id}
                        to={task.projectId ? `/projetos?id=${encodeURIComponent(task.projectId)}` : '/projetos'}
                        className={styles.taskRow}
                      >
                        <span className={styles.checkCircle} aria-hidden="true" />
                        <div className={styles.taskCopy}>
                          <strong>{task.title}</strong>
                        </div>
                        <span className={styles.taskProject}>{task.projectName || task.clientName || 'Projeto'}</span>
                        <span className={styles.taskTag}>{getTaskStatusLabel(task)}</span>
                        <span className={styles.taskDue}>{formatDateLabel(task.dueDate)}</span>
                      </Link>
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
                  <Link
                    key={project.id}
                    to={`/projetos?id=${encodeURIComponent(project.id)}`}
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
                  </Link>
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
    </div>
  );
}

