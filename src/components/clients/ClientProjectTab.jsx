import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addTaskCollaborator,
  createClientProject,
  createProjectSection,
  createTask,
  createTaskComment,
  deleteProjectSection,
  deleteTask,
  getClientProject,
  getProject,
  listTaskCollaborators,
  listTaskComments,
  removeTaskCollaborator,
  reorderProjectSections,
  reorderProjectTasks,
  updateProjectSection,
  updateTask,
} from '../../api/projects.js';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { hasPermission } from '../../utils/permissions.js';
import StateBlock from '../ui/StateBlock.jsx';
import { TrashIcon } from '../ui/Icons.jsx';
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

function priorityLabel(priority) {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baixa';
  return 'Média';
}

function formatDate(value) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
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

function eventLabel(event) {
  const summary = String(event?.summary || '').trim();
  if (summary) return summary;

  const type = String(event?.type || event?.eventType || '').trim();
  if (type.includes('comment')) return 'Comentário registrado';
  if (type.includes('section')) return 'Seção atualizada';
  if (type.includes('created')) return 'Registro criado';
  if (type.includes('updated')) return 'Registro atualizado';
  if (type.includes('deleted') || type.includes('removed')) return 'Registro removido';
  if (type.includes('done') || type.includes('completed')) return 'Status atualizado';
  return 'Atividade registrada';
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

function moveItemByIndex(list, fromIndex, toIndex) {
  if (!Array.isArray(list)) return [];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function userName(users, userId, fallback = '') {
  const user = (Array.isArray(users) ? users : []).find((entry) => entry.id === userId);
  return user?.name || user?.email || fallback || 'Sem responsável';
}

function initials(value) {
  return String(value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function ClientProjectTab({ client, users = [], canCreateProject = false }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const canEditProject =
    hasPermission(user, 'projects.edit') ||
    hasPermission(user, 'projects.edit.all') ||
    hasPermission(user, 'projects.edit.own');
  const canCreateTasks = hasPermission(user, 'tasks.create');
  const canEditTasks =
    hasPermission(user, 'tasks.edit') ||
    hasPermission(user, 'tasks.edit.all') ||
    hasPermission(user, 'tasks.edit.own');
  const canCommentTasks =
    hasPermission(user, 'tasks.comment') ||
    hasPermission(user, 'tasks.comment.all') ||
    hasPermission(user, 'tasks.comment.own');

  const [detail, setDetail] = useState({ project: null, sections: [], members: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sectionDraft, setSectionDraft] = useState('');
  const [taskDrafts, setTaskDrafts] = useState({});
  const [editingSectionId, setEditingSectionId] = useState('');
  const [editingSectionName, setEditingSectionName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [taskComments, setTaskComments] = useState([]);
  const [taskCollaborators, setTaskCollaborators] = useState([]);
  const [taskPanelLoading, setTaskPanelLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [collaboratorUserId, setCollaboratorUserId] = useState('');
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '' });
  const [deleteSectionTarget, setDeleteSectionTarget] = useState(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState(null);

  const project = detail.project;
  const sections = Array.isArray(detail.sections) ? detail.sections : [];
  const members = Array.isArray(detail.members) ? detail.members : [];
  const events = Array.isArray(detail.events) ? detail.events : [];

  const allTasks = useMemo(() => sections.flatMap((section) => section.tasks || []), [sections]);
  const flatTasks = useMemo(() => allTasks.filter((task) => !task.parentTaskId), [allTasks]);
  const selectedTask = useMemo(
    () => allTasks.find((task) => task.id === selectedTaskId) || null,
    [allTasks, selectedTaskId]
  );
  const selectedSubtasks = useMemo(
    () => (selectedTask ? allTasks.filter((task) => task.parentTaskId === selectedTask.id) : []),
    [allTasks, selectedTask]
  );

  useEffect(() => {
    setTaskDraft({
      title: selectedTask?.title || '',
      description: selectedTask?.description || '',
    });
  }, [selectedTask?.id, selectedTask?.title, selectedTask?.description]);

  const totalTasks = flatTasks.length || Number(project?.taskCount || 0);
  const doneTasks = flatTasks.filter((task) => task.status === 'done').length || Number(project?.doneCount || 0);
  const progress = percent(doneTasks, totalTasks);
  const openTasks = Math.max(totalTasks - doneTasks, 0);

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
    setSelectedTaskId('');

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

  useEffect(() => {
    if (!selectedTask?.id) {
      setTaskComments([]);
      setTaskCollaborators([]);
      return undefined;
    }

    let cancelled = false;
    setTaskPanelLoading(true);

    Promise.all([
      listTaskComments(selectedTask.id).catch(() => ({ comments: [] })),
      listTaskCollaborators(selectedTask.id).catch(() => ({ collaborators: [] })),
    ])
      .then(([commentsResponse, collaboratorsResponse]) => {
        if (cancelled) return;
        setTaskComments(Array.isArray(commentsResponse?.comments) ? commentsResponse.comments : []);
        setTaskCollaborators(
          Array.isArray(collaboratorsResponse?.collaborators)
            ? collaboratorsResponse.collaborators
            : []
        );
      })
      .finally(() => {
        if (!cancelled) setTaskPanelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTask?.id]);

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
    if (!name || !project?.id || busy || !canEditProject) return;

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
    if (!project?.id || !section?.id || !name || !canEditProject) {
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
    if (!project?.id || !section?.id || busy || !canEditProject) return;

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
      setDeleteSectionTarget(null);
    }
  }

  async function handleMoveSection(sectionId, direction) {
    if (!project?.id || busy || !canEditProject) return;

    const currentIndex = sections.findIndex((section) => section.id === sectionId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sections.length) return;

    const nextSections = moveItemByIndex(sections, currentIndex, targetIndex);
    const sectionIds = nextSections.map((section) => section.id);

    setDetail((current) => ({ ...current, sections: nextSections }));

    try {
      setBusy(true);
      const response = await reorderProjectSections(project.id, sectionIds);
      if (Array.isArray(response?.sections)) {
        setDetail((current) => ({ ...current, sections: response.sections, project: response.project || current.project }));
      } else {
        await refreshProject(project.id);
      }
    } catch (error) {
      await refreshProject(project.id);
      showToast(error?.message || 'Não foi possível reordenar a seção.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveTask(sectionId, taskId, direction) {
    if (!project?.id || !sectionId || !taskId || busy || !canEditProject) return;

    const section = sections.find((entry) => entry.id === sectionId);
    const parentTasks = (section?.tasks || []).filter((task) => !task.parentTaskId);
    const currentIndex = parentTasks.findIndex((task) => task.id === taskId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= parentTasks.length) return;

    const nextParentTasks = moveItemByIndex(parentTasks, currentIndex, targetIndex);

    const groups = sections.map((entry) => {
      if (entry.id === sectionId) {
        return {
          sectionId: entry.id,
          taskIds: nextParentTasks.map((task) => task.id),
        };
      }

      return {
        sectionId: entry.id,
        taskIds: (entry.tasks || []).filter((task) => !task.parentTaskId).map((task) => task.id),
      };
    });

    setDetail((current) => ({
      ...current,
      sections: current.sections.map((entry) => {
        if (entry.id !== sectionId) return entry;
        const childTasks = (entry.tasks || []).filter((task) => task.parentTaskId);
        return { ...entry, tasks: [...nextParentTasks, ...childTasks] };
      }),
    }));

    try {
      setBusy(true);
      const response = await reorderProjectTasks(project.id, groups);
      if (Array.isArray(response?.sections)) {
        setDetail((current) => ({ ...current, sections: response.sections, project: response.project || current.project }));
      } else {
        await refreshProject(project.id);
      }
    } catch (error) {
      await refreshProject(project.id);
      showToast(error?.message || 'Não foi possível reordenar a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTask(event, sectionId, parentTaskId = '') {
    event.preventDefault();
    const title = parentTaskId ? subtaskTitle.trim() : String(taskDrafts[sectionId] || '').trim();
    if (!title || !project?.id || !sectionId || busy || !canCreateTasks) return;

    try {
      setBusy(true);
      await createTask({
        projectId: project.id,
        sectionId,
        clientId: client.id,
        parentTaskId,
        title,
      });
      if (parentTaskId) setSubtaskTitle('');
      else setTaskDrafts((current) => ({ ...current, [sectionId]: '' }));
      await refreshProject(project.id);
      showToast(parentTaskId ? 'Subtarefa criada.' : 'Tarefa criada.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível criar a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTaskDraft() {
    if (!selectedTask?.id || busy || !canEditTasks) return;

    const title = taskDraft.title.trim();
    const description = String(taskDraft.description || '').trim();

    if (!title) {
      setTaskDraft((current) => ({ ...current, title: selectedTask.title || '' }));
      return;
    }

    const patch = {};
    if (title !== String(selectedTask.title || '').trim()) patch.title = title;
    if (description !== String(selectedTask.description || '').trim()) patch.description = description;

    if (Object.keys(patch).length === 0) return;
    await handleUpdateTask(selectedTask, patch);
  }

  async function handleUpdateTask(task, patch) {
    if (!task?.id || busy || !canEditTasks) return;

    try {
      setBusy(true);
      await updateTask(task.id, patch);
      await refreshProject(project.id);
    } catch (error) {
      showToast(error?.message || 'Não foi possível atualizar a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTask(task) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await handleUpdateTask(task, { status: nextStatus, done: nextStatus === 'done' });
  }

  async function handleDeleteTask(task) {
    if (!task?.id || busy || !canEditTasks) return;

    try {
      setBusy(true);
      await deleteTask(task.id);
      if (selectedTaskId === task.id) setSelectedTaskId('');
      await refreshProject(project.id);
      showToast('Tarefa removida.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
      setDeleteTaskTarget(null);
    }
  }

  async function handleCreateComment(event) {
    event.preventDefault();
    const body = commentBody.trim();
    if (!selectedTask?.id || !body || busy || !canCommentTasks) return;

    try {
      setBusy(true);
      const response = await createTaskComment(selectedTask.id, { body });
      setCommentBody('');
      setTaskComments(Array.isArray(response?.comments) ? response.comments : []);
      await refreshProject(project.id);
      showToast('Comentário registrado.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível registrar o comentário.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function reloadTaskCollaborators(taskId = selectedTask?.id) {
    if (!taskId) return;
    const response = await listTaskCollaborators(taskId);
    setTaskCollaborators(Array.isArray(response?.collaborators) ? response.collaborators : []);
  }

  async function handleAddCollaborator(event) {
    event.preventDefault();
    if (!selectedTask?.id || !collaboratorUserId || busy || !canEditTasks) return;

    try {
      setBusy(true);
      await addTaskCollaborator(selectedTask.id, { userId: collaboratorUserId });
      setCollaboratorUserId('');
      await reloadTaskCollaborators(selectedTask.id);
      showToast('Colaborador adicionado.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível adicionar colaborador.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveCollaborator(userId) {
    if (!selectedTask?.id || !userId || busy || !canEditTasks) return;

    try {
      setBusy(true);
      await removeTaskCollaborator(selectedTask.id, userId);
      await reloadTaskCollaborators(selectedTask.id);
      showToast('Colaborador removido.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover colaborador.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <StateBlock variant="loading" compact title="Carregando projeto" />
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
            <StateBlock variant="empty" compact title="Projeto não criado" />
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
            <strong>{openTasks}</strong>
            <span>abertas</span>
          </div>
          <div>
            <strong>{doneTasks}/{totalTasks}</strong>
            <span>concluídas</span>
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
          disabled={busy || !canEditProject}
        />
        <button type="submit" disabled={busy || !canEditProject || !sectionDraft.trim()}>
          Adicionar seção
        </button>
      </form>

      <section className={`${styles.workspace} ${selectedTask ? styles.workspaceWithPanel : ''}`.trim()}>
        <div className={styles.sections}>
          {sections.length === 0 ? (
            <StateBlock variant="empty" compact title="Nenhuma seção criada" />
          ) : (
            sections.map((section) => {
              const tasks = (section.tasks || []).filter((task) => !task.parentTaskId);
              const isEditing = editingSectionId === section.id;

              return (
                <article key={section.id} className={styles.sectionCard}>
                  <header className={styles.sectionHead}>
                    <div className={styles.sectionTitleBlock}>
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
                          disabled={busy || !canEditProject}
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
                      <span>{tasks.length} tarefa(s)</span>
                    </div>

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.moveBtn}
                        onClick={() => handleMoveSection(section.id, -1)}
                        disabled={busy || !canEditProject}
                        aria-label="Mover seção para cima"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.moveBtn}
                        onClick={() => handleMoveSection(section.id, 1)}
                        disabled={busy || !canEditProject}
                        aria-label="Mover seção para baixo"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={styles.actionIcon}
                        onClick={() => setDeleteSectionTarget(section)}
                        disabled={busy || !canEditProject}
                        aria-label="Remover seção"
                      >
                        <TrashIcon size={13} aria-hidden="true" />
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
                      disabled={busy || !canCreateTasks}
                    />
                    <button type="submit" disabled={busy || !canCreateTasks || !String(taskDrafts[section.id] || '').trim()}>
                      Adicionar
                    </button>
                  </form>

                  <div className={styles.taskList}>
                    {tasks.length === 0 ? (
                      <div className={styles.noTasks}>Nenhuma tarefa nesta seção</div>
                    ) : (
                      tasks.map((task) => {
                        const subtasks = allTasks.filter((entry) => entry.parentTaskId === task.id);
                        return (
                          <div
                            key={task.id}
                            className={`${styles.taskRow} ${task.status === 'done' ? styles.taskDone : ''} ${
                              selectedTaskId === task.id ? styles.taskSelected : ''
                            }`.trim()}
                          >
                            <button
                              type="button"
                              className={styles.taskCheck}
                              onClick={() => handleToggleTask(task)}
                              disabled={busy || !canEditTasks}
                              aria-label="Alterar status da tarefa"
                            >
                              {task.status === 'done' ? '✓' : ''}
                            </button>

                            <button type="button" className={styles.taskMain} onClick={() => setSelectedTaskId(task.id)}>
                              <strong>{task.title}</strong>
                              <span>
                                {statusLabel(task.status)} · {formatDate(task.dueDate)}
                                {subtasks.length ? ` · ${subtasks.length} subtarefa(s)` : ''}
                              </span>
                            </button>

                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={styles.moveBtn}
                                onClick={() => handleMoveTask(section.id, task.id, -1)}
                                disabled={busy || !canEditProject}
                                aria-label="Mover tarefa para cima"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={styles.moveBtn}
                                onClick={() => handleMoveTask(section.id, task.id, 1)}
                                disabled={busy || !canEditProject}
                                aria-label="Mover tarefa para baixo"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={styles.actionIcon}
                                onClick={() => setDeleteTaskTarget(task)}
                                disabled={busy || !canEditTasks}
                                aria-label="Remover tarefa"
                              >
                                <TrashIcon size={13} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {selectedTask ? (
          <aside className={styles.taskPanel}>
            <div className={styles.taskDetail}>
              <header className={styles.taskDetailHead}>
                <div>
                  <span>Tarefa</span>
                  <input
                    value={taskDraft.title}
                    onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                    onBlur={handleSaveTaskDraft}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                    disabled={busy || !canEditTasks}
                    aria-label="Título da tarefa"
                  />
                </div>
                <button type="button" onClick={() => setSelectedTaskId('')} aria-label="Fechar tarefa">
                  ×
                </button>
              </header>

              <div className={styles.taskDescriptionBox}>
                <span>Descrição</span>
                <textarea
                  value={taskDraft.description}
                  onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))}
                  onBlur={handleSaveTaskDraft}
                  placeholder="Descrição da tarefa"
                  disabled={busy || !canEditTasks}
                />
              </div>

              <div className={styles.taskControls}>
                <label>
                  <span>Status</span>
                  <select
                    value={selectedTask.status || 'todo'}
                    onChange={(event) => handleUpdateTask(selectedTask, { status: event.target.value, done: event.target.value === 'done' })}
                    disabled={busy || !canEditTasks}
                  >
                    <option value="todo">Aberta</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </select>
                </label>

                <label>
                  <span>Prioridade</span>
                  <select
                    value={selectedTask.priority || 'medium'}
                    onChange={(event) => handleUpdateTask(selectedTask, { priority: event.target.value })}
                    disabled={busy || !canEditTasks}
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </label>

                <label>
                  <span>Responsável</span>
                  <select
                    value={selectedTask.assigneeUserId || ''}
                    onChange={(event) => handleUpdateTask(selectedTask, { assigneeUserId: event.target.value })}
                    disabled={busy || !canEditTasks}
                  >
                    <option value="">Sem responsável</option>
                    {(Array.isArray(users) ? users : []).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name || entry.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Prazo</span>
                  <input
                    type="date"
                    value={selectedTask.dueDate || ''}
                    onChange={(event) => handleUpdateTask(selectedTask, { dueDate: event.target.value })}
                    disabled={busy || !canEditTasks}
                  />
                </label>
              </div>

              <div className={styles.taskMetaLine}>
                <span>{statusLabel(selectedTask.status)}</span>
                <span>{priorityLabel(selectedTask.priority)}</span>
                <span>{userName(users, selectedTask.assigneeUserId, selectedTask.assigneeName)}</span>
              </div>

              <section className={styles.taskDetailSection}>
                <div className={styles.taskDetailTitle}>
                  <span>Subtarefas</span>
                  <strong>{selectedSubtasks.length}</strong>
                </div>

                <form className={styles.subtaskForm} onSubmit={(event) => handleCreateTask(event, selectedTask.sectionId, selectedTask.id)}>
                  <input
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    placeholder="Nova subtarefa"
                    disabled={busy || !canCreateTasks}
                  />
                  <button type="submit" disabled={busy || !canCreateTasks || !subtaskTitle.trim()}>
                    Adicionar
                  </button>
                </form>

                <div className={styles.subtaskList}>
                  {selectedSubtasks.length === 0 ? (
                    <div className={styles.noTasks}>Nenhuma subtarefa</div>
                  ) : (
                    selectedSubtasks.map((subtask) => (
                      <div key={subtask.id} className={styles.subtaskRow}>
                        <button type="button" onClick={() => handleToggleTask(subtask)} disabled={busy || !canEditTasks}>
                          {subtask.status === 'done' ? '✓' : ''}
                        </button>
                        <span>{subtask.title}</span>
                        <button type="button" onClick={() => setDeleteTaskTarget(subtask)} disabled={busy || !canEditTasks} aria-label="Remover subtarefa">
                          <TrashIcon size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className={styles.taskDetailSection}>
                <div className={styles.taskDetailTitle}>
                  <span>Colaboradores</span>
                  <strong>{taskCollaborators.length}</strong>
                </div>

                <form className={styles.collabForm} onSubmit={handleAddCollaborator}>
                  <select
                    value={collaboratorUserId}
                    onChange={(event) => setCollaboratorUserId(event.target.value)}
                    disabled={busy || taskPanelLoading || !canEditTasks}
                  >
                    <option value="">Adicionar colaborador</option>
                    {(Array.isArray(users) ? users : [])
                      .filter((entry) => !taskCollaborators.some((collab) => collab.userId === entry.id))
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name || entry.email}
                        </option>
                      ))}
                  </select>
                  <button type="submit" disabled={busy || !canEditTasks || !collaboratorUserId}>
                    Adicionar
                  </button>
                </form>

                <div className={styles.collabList}>
                  {taskCollaborators.length === 0 ? (
                    <div className={styles.noTasks}>Nenhum colaborador</div>
                  ) : (
                    taskCollaborators.map((entry) => (
                      <div key={entry.userId} className={styles.collabRow}>
                        <span>{initials(entry.userName || entry.userEmail)}</span>
                        <strong>{entry.userName || entry.userEmail}</strong>
                        <button type="button" onClick={() => handleRemoveCollaborator(entry.userId)} disabled={busy || !canEditTasks} aria-label="Remover colaborador">
                          <TrashIcon size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className={styles.taskDetailSection}>
                <div className={styles.taskDetailTitle}>
                  <span>Comentários</span>
                  <strong>{taskComments.length}</strong>
                </div>

                <form className={styles.commentForm} onSubmit={handleCreateComment}>
                  <textarea
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Novo comentário"
                    disabled={busy || taskPanelLoading || !canCommentTasks}
                  />
                  <button type="submit" disabled={busy || !canCommentTasks || !commentBody.trim()}>
                    Comentar
                  </button>
                </form>

                <div className={styles.commentList}>
                  {taskComments.length === 0 ? (
                    <div className={styles.noTasks}>Nenhum comentário</div>
                  ) : (
                    taskComments.map((comment) => (
                      <article key={comment.id} className={styles.commentCard}>
                        <header>
                          <strong>{comment.userName || comment.authorName || 'Usuário'}</strong>
                          <span>{formatDateTime(comment.createdAt)}</span>
                        </header>
                        <p>{comment.body || comment.comment || comment.text}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </aside>
        ) : null}
      </section>

      <section className={styles.activityPanel}>
        <header className={styles.activityHead}>
          <div>
            <span>Histórico</span>
            <strong>Atividade recente</strong>
          </div>
          <em>{events.length}</em>
        </header>

        <div className={styles.activityList}>
          {events.length === 0 ? (
            <div className={styles.noTasks}>Nenhuma atividade registrada</div>
          ) : (
            events.slice(0, 12).map((event, index) => (
              <article key={event.id || `${event.type || 'event'}-${index}`} className={styles.activityItem}>
                <span aria-hidden="true" />
                <div>
                  <strong>{eventLabel(event)}</strong>
                  <small>
                    {event.actorName || 'Sistema'}
                    {formatDateTime(event.createdAt) ? ` · ${formatDateTime(event.createdAt)}` : ''}
                  </small>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {deleteSectionTarget ? (
        <div className={styles.confirmBackdrop} role="presentation" onClick={() => setDeleteSectionTarget(null)}>
          <section className={styles.confirmModal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.confirmHead}>
              <span>Remover seção</span>
              <strong>{deleteSectionTarget.name}</strong>
            </div>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setDeleteSectionTarget(null)}>Cancelar</button>
              <button type="button" className={styles.confirmDanger} onClick={() => handleDeleteSection(deleteSectionTarget)} disabled={busy || !canEditProject}>
                Remover
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTaskTarget ? (
        <div className={styles.confirmBackdrop} role="presentation" onClick={() => setDeleteTaskTarget(null)}>
          <section className={styles.confirmModal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.confirmHead}>
              <span>Remover tarefa</span>
              <strong>{deleteTaskTarget.title}</strong>
            </div>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setDeleteTaskTarget(null)}>Cancelar</button>
              <button type="button" className={styles.confirmDanger} onClick={() => handleDeleteTask(deleteTaskTarget)} disabled={busy || !canEditTasks}>
                Remover
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
