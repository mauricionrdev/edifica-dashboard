import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createClientProject,
  createProjectSection,
  createTask,
  deleteProjectSection,
  deleteTask,
  getClientProject,
  getProject,
  updateProjectSection,
  updateTask,
} from '../../api/projects.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import StateBlock from '../ui/StateBlock.jsx';
import styles from './ClientProjectTab.module.css';

function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function statusLabel(status) {
  if (status === 'done') return 'Concluída';
  if (status === 'in_progress') return 'Em andamento';
  if (status === 'canceled') return 'Cancelada';
  return 'Aberta';
}

function formatDate(value) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}

function normalizeProjectPayload(payload) {
  if (!payload) return { project: null, sections: [], members: [], events: [] };

  if (payload.project || payload.sections) {
    return {
      project: payload.project || null,
      sections: Array.isArray(payload.sections) ? payload.sections : [],
      members: Array.isArray(payload.members) ? payload.members : [],
      events: Array.isArray(payload.events) ? payload.events : [],
    };
  }

  return {
    project: payload,
    sections: [],
    members: [],
    events: [],
  };
}

export default function ClientProjectTab({ client, canCreateProject = false }) {
  const { showToast } = useToast();

  const [detail, setDetail] = useState({ project: null, sections: [], members: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sectionDraft, setSectionDraft] = useState('');
  const [taskDrafts, setTaskDrafts] = useState({});
  const [editingSectionId, setEditingSectionId] = useState('');
  const [editingSectionName, setEditingSectionName] = useState('');

  const project = detail.project;
  const sections = Array.isArray(detail.sections) ? detail.sections : [];
  const members = Array.isArray(detail.members) ? detail.members : [];

  const flatTasks = useMemo(
    () => sections.flatMap((section) => section.tasks || []).filter((task) => !task.parentTaskId),
    [sections]
  );

  const totalTasks = flatTasks.length || Number(project?.taskCount || 0);
  const doneTasks = flatTasks.filter((task) => task.status === 'done').length || Number(project?.doneCount || 0);
  const progress = percent(doneTasks, totalTasks);

  const refreshProject = useCallback(
    async (projectId = project?.id) => {
      if (!projectId) return null;
      const response = await getProject(projectId);
      const next = normalizeProjectPayload(response);
      setDetail(next);
      return next;
    },
    [project?.id]
  );

  useEffect(() => {
    if (!client?.id) return undefined;

    let cancelled = false;
    setLoading(true);

    getClientProject(client.id)
      .then(async (response) => {
        if (cancelled) return;
        const payload = normalizeProjectPayload(response);
        const projectId = payload.project?.id;
        if (projectId) {
          const full = await getProject(projectId);
          if (!cancelled) setDetail(normalizeProjectPayload(full));
          return;
        }

        if (!cancelled) setDetail({ project: null, sections: [], members: [], events: [] });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setDetail({ project: null, sections: [], members: [], events: [] });
          return;
        }
        setDetail({ project: null, sections: [], members: [], events: [] });
        showToast(error?.message || 'Não foi possível carregar o projeto.', { variant: 'error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client?.id, showToast]);

  async function handleCreateProject(mode) {
    if (!client?.id || busy) return;

    try {
      setBusy(true);
      const response = await createClientProject(client.id, {
        mode,
        name: `Projeto - ${client.name}`,
      });
      const nextProject = response?.project;
      if (nextProject?.id) {
        await refreshProject(nextProject.id);
      } else {
        setDetail(normalizeProjectPayload(response));
      }
      showToast(response?.alreadyExists ? 'Projeto carregado.' : 'Projeto criado.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível criar o projeto.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSection(event) {
    event.preventDefault();
    const name = sectionDraft.trim();
    if (!name || !project?.id || busy) return;

    try {
      setBusy(true);
      const response = await createProjectSection(project.id, { name });
      setSectionDraft('');
      if (Array.isArray(response?.sections)) {
        setDetail((current) => ({ ...current, sections: response.sections }));
      } else {
        await refreshProject(project.id);
      }
      showToast('Seção criada.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível criar a seção.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSection(section) {
    const name = editingSectionName.trim();
    if (!project?.id || !section?.id || !name) {
      setEditingSectionId('');
      setEditingSectionName('');
      return;
    }

    if (name === section.name) {
      setEditingSectionId('');
      setEditingSectionName('');
      return;
    }

    try {
      setBusy(true);
      const response = await updateProjectSection(project.id, section.id, { name });
      if (Array.isArray(response?.sections)) {
        setDetail((current) => ({ ...current, sections: response.sections }));
      } else {
        await refreshProject(project.id);
      }
      showToast('Seção renomeada.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível renomear a seção.', { variant: 'error' });
    } finally {
      setBusy(false);
      setEditingSectionId('');
      setEditingSectionName('');
    }
  }

  async function handleDeleteSection(section) {
    if (!project?.id || !section?.id || busy) return;

    try {
      setBusy(true);
      const response = await deleteProjectSection(project.id, section.id, { deleteTasks: true });
      if (Array.isArray(response?.sections)) {
        setDetail((current) => ({ ...current, sections: response.sections, project: response.project || current.project }));
      } else {
        await refreshProject(project.id);
      }
      showToast('Seção removida.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover a seção.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTask(event, sectionId) {
    event.preventDefault();
    const title = String(taskDrafts[sectionId] || '').trim();
    if (!title || !project?.id || !sectionId || busy) return;

    try {
      setBusy(true);
      await createTask({
        projectId: project.id,
        sectionId,
        title,
      });
      setTaskDrafts((current) => ({ ...current, [sectionId]: '' }));
      await refreshProject(project.id);
      showToast('Tarefa criada.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível criar a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTask(task) {
    if (!task?.id || busy) return;
    const nextStatus = task.status === 'done' ? 'open' : 'done';

    try {
      setBusy(true);
      await updateTask(task.id, { status: nextStatus, done: nextStatus === 'done' });
      await refreshProject(project.id);
    } catch (error) {
      showToast(error?.message || 'Não foi possível atualizar a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTask(task) {
    if (!task?.id || busy) return;

    try {
      setBusy(true);
      await deleteTask(task.id);
      await refreshProject(project.id);
      showToast('Tarefa removida.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <StateBlock
          variant="loading"
          compact
          title="Carregando projeto"
        />
      </div>
    );
  }

  if (!project?.id) {
    return (
      <div className={styles.wrap}>
        <section className={styles.emptyCard}>
          <div className={styles.emptyHead}>
            <span>Projeto</span>
            <strong>{client?.name}</strong>
          </div>

          {canCreateProject ? (
            <div className={styles.createGrid}>
              <button type="button" onClick={() => handleCreateProject('template')} disabled={busy}>
                <strong>Usar Modelo Oficial</strong>
              </button>
              <button type="button" onClick={() => handleCreateProject('blank')} disabled={busy}>
                <strong>Criar do zero</strong>
              </button>
            </div>
          ) : (
            <StateBlock
              variant="empty"
              compact
              title="Projeto não criado"
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.projectHeader}>
        <div className={styles.projectTitle}>
          <span>Projeto</span>
          <strong>{project.name}</strong>
        </div>

        <div className={styles.projectStats}>
          <div>
            <strong>{progress}%</strong>
            <span>progresso</span>
          </div>
          <div>
            <strong>{doneTasks}/{totalTasks}</strong>
            <span>tarefas</span>
          </div>
          <div>
            <strong>{members.length}</strong>
            <span>membros</span>
          </div>
        </div>
      </section>

      <form className={styles.sectionForm} onSubmit={handleCreateSection}>
        <input
          value={sectionDraft}
          onChange={(event) => setSectionDraft(event.target.value)}
          placeholder="Nova seção"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !sectionDraft.trim()}>
          Adicionar seção
        </button>
      </form>

      <section className={styles.sections}>
        {sections.length === 0 ? (
          <StateBlock
            variant="empty"
            compact
            title="Nenhuma seção criada"
          />
        ) : (
          sections.map((section) => {
            const tasks = (section.tasks || []).filter((task) => !task.parentTaskId);
            const isEditing = editingSectionId === section.id;

            return (
              <article key={section.id} className={styles.sectionCard}>
                <header className={styles.sectionHead}>
                  {isEditing ? (
                    <input
                      value={editingSectionName}
                      onChange={(event) => setEditingSectionName(event.target.value)}
                      onBlur={() => handleSaveSection(section)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveSection(section);
                        if (event.key === 'Escape') {
                          setEditingSectionId('');
                          setEditingSectionName('');
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.sectionName}
                      onClick={() => {
                        setEditingSectionId(section.id);
                        setEditingSectionName(section.name || '');
                      }}
                    >
                      {section.name}
                    </button>
                  )}

                  <div className={styles.sectionActions}>
                    <span>{tasks.length}</span>
                    <button type="button" onClick={() => handleDeleteSection(section)} disabled={busy}>
                      Remover
                    </button>
                  </div>
                </header>

                <form className={styles.taskForm} onSubmit={(event) => handleCreateTask(event, section.id)}>
                  <input
                    value={taskDrafts[section.id] || ''}
                    onChange={(event) =>
                      setTaskDrafts((current) => ({ ...current, [section.id]: event.target.value }))
                    }
                    placeholder="Nova tarefa"
                    disabled={busy}
                  />
                  <button type="submit" disabled={busy || !String(taskDrafts[section.id] || '').trim()}>
                    Adicionar
                  </button>
                </form>

                <div className={styles.taskList}>
                  {tasks.length === 0 ? (
                    <div className={styles.noTasks}>Nenhuma tarefa nesta seção</div>
                  ) : (
                    tasks.map((task) => (
                      <div key={task.id} className={`${styles.taskRow} ${task.status === 'done' ? styles.taskDone : ''}`.trim()}>
                        <button
                          type="button"
                          className={styles.taskCheck}
                          onClick={() => handleToggleTask(task)}
                          disabled={busy}
                          aria-label="Alterar status da tarefa"
                        >
                          {task.status === 'done' ? '✓' : ''}
                        </button>

                        <div className={styles.taskMain}>
                          <strong>{task.title}</strong>
                          <span>{statusLabel(task.status)} · {formatDate(task.dueDate)}</span>
                        </div>

                        <button
                          type="button"
                          className={styles.taskDelete}
                          onClick={() => handleDeleteTask(task)}
                          disabled={busy}
                        >
                          Remover
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
