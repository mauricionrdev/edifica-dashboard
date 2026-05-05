import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addProjectMember,
  addTaskCollaborator,
  createClientProject,
  createProjectSection,
  createTask,
  createTaskComment,
  deleteProject,
  deleteProjectSection,
  deleteTaskComment,
  deleteTask,
  getClientProject,
  getProject,
  listTaskCollaborators,
  listTaskComments,
  removeProjectMember,
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
import DateField from '../ui/DateField.jsx';
import Select from '../ui/Select.jsx';
import { TrashIcon } from '../ui/Icons.jsx';
import styles from './ProjectWorkspace.module.css';

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


const TASK_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Abertas' },
  { value: 'done', label: 'Concluídas' },
  { value: 'assigned', label: 'Com responsável' },
  { value: 'unassigned', label: 'Sem responsável' },
  { value: 'due', label: 'Com prazo' },
];

const TASK_SORTS = [
  { value: 'default', label: 'Ordem padrão' },
  { value: 'dueDate', label: 'Prazo' },
  { value: 'assignee', label: 'Responsável' },
  { value: 'title', label: 'Nome' },
  { value: 'status', label: 'Status' },
];

function emptyTaskDraft() {
  return { title: '', assigneeUserId: '', dueDate: '' };
}

function filterTask(task, filter) {
  if (filter === 'open') return task.status !== 'done';
  if (filter === 'done') return task.status === 'done';
  if (filter === 'assigned') return Boolean(task.assigneeUserId);
  if (filter === 'unassigned') return !task.assigneeUserId;
  if (filter === 'due') return Boolean(task.dueDate);
  return true;
}

function sortTasks(tasks, sort, users = []) {
  const list = Array.isArray(tasks) ? [...tasks] : [];
  if (sort === 'default') return list;

  const text = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');
  const dateValue = (value) => (value ? String(value).slice(0, 10) : '9999-12-31');

  return list.sort((a, b) => {
    if (sort === 'dueDate') return dateValue(a.dueDate).localeCompare(dateValue(b.dueDate));
    if (sort === 'assignee') {
      return text(userName(users, a.assigneeUserId, a.assigneeName)).localeCompare(
        text(userName(users, b.assigneeUserId, b.assigneeName)),
        'pt-BR'
      );
    }
    if (sort === 'title') return text(a.title).localeCompare(text(b.title), 'pt-BR');
    if (sort === 'status') return text(statusLabel(a.status)).localeCompare(text(statusLabel(b.status)), 'pt-BR');
    return 0;
  });
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


function sameId(a, b) {
  return String(a || '') === String(b || '');
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function metadataLabel(key, value, users = [], sections = []) {
  const labels = {
    from: 'De',
    to: 'Para',
    oldValue: 'Antes',
    newValue: 'Depois',
    status: 'Status',
    priority: 'Prioridade',
    dueDate: 'Prazo',
    assigneeUserId: 'Responsável',
    sectionId: 'Seção',
    userId: 'Usuário',
    role: 'Papel',
    taskCount: 'Tarefas',
    sectionCount: 'Seções',
    taskIds: 'Tarefas',
    sectionIds: 'Seções',
  };

  const resolveSectionName = (sectionId) => {
    const section = (Array.isArray(sections) ? sections : []).find((entry) => sameId(entry.id, sectionId));
    return section?.name || sectionId || 'Sem seção';
  };

  const countLabel = (count, singular, plural) => {
    const safeCount = Number(count) || 0;
    return `${safeCount} ${safeCount === 1 ? singular : plural}`;
  };

  const safeDisplay = (rawValue, rawKey = key) => {
    if (rawValue === undefined || rawValue === null || rawValue === '') return '—';

    const normalizedKey = String(rawKey || '').toLowerCase();

    if (Array.isArray(rawValue)) {
      if (normalizedKey.includes('task')) return countLabel(rawValue.length, 'tarefa', 'tarefas');
      if (normalizedKey.includes('section')) return countLabel(rawValue.length, 'seção', 'seções');
      return rawValue.map((entry) => safeDisplay(entry, rawKey)).filter(Boolean).join(', ') || '—';
    }

    if (typeof rawValue === 'object') {
      const sectionText = rawValue.sectionId ? resolveSectionName(rawValue.sectionId) : '';
      const taskIds = Array.isArray(rawValue.taskIds) ? countLabel(rawValue.taskIds.length, 'tarefa', 'tarefas') : '';
      const sectionIds = Array.isArray(rawValue.sectionIds) ? countLabel(rawValue.sectionIds.length, 'seção', 'seções') : '';
      const taskCount = rawValue.taskCount !== undefined ? countLabel(rawValue.taskCount, 'tarefa', 'tarefas') : '';
      const sectionCount = rawValue.sectionCount !== undefined ? countLabel(rawValue.sectionCount, 'seção', 'seções') : '';

      const composed = [sectionText, taskIds, sectionIds, taskCount, sectionCount].filter(Boolean).join(' · ');
      if (composed) return composed;

      if (rawValue.label || rawValue.name || rawValue.title || rawValue.value) {
        return String(rawValue.label || rawValue.name || rawValue.title || rawValue.value);
      }

      try {
        return JSON.stringify(rawValue);
      } catch {
        return 'Registro atualizado';
      }
    }

    if (normalizedKey.includes('status')) return statusLabel(rawValue);
    if (normalizedKey.includes('priority')) return priorityLabel(rawValue);
    if (normalizedKey.includes('duedate')) return formatDate(rawValue);
    if (normalizedKey.includes('userid') || rawKey === 'userId') return userName(users, rawValue, rawValue);
    if (normalizedKey.includes('sectionid')) return resolveSectionName(rawValue);

    return String(rawValue);
  };

  return { label: labels[key] || key, value: safeDisplay(value) };
}

function eventMetadataItems(event, users = [], sections = []) {
  const metadata = parseMetadata(event?.metadata);
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 6)
    .map(([key, value]) => metadataLabel(key, value, users, sections));
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

export default function ProjectWorkspace({ client = null, users = [], canCreateProject = false, projectId = '', projectLabel = '' }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const canEditProjectAll = hasPermission(user, 'projects.edit') || hasPermission(user, 'projects.edit.all');
  const canEditProjectOwn = hasPermission(user, 'projects.edit.own');
  const canCreateTasks = hasPermission(user, 'tasks.create');
  const canEditTasksAll = hasPermission(user, 'tasks.edit') || hasPermission(user, 'tasks.edit.all');
  const canEditTasksOwn = hasPermission(user, 'tasks.edit.own');
  const canCommentTasksAll = hasPermission(user, 'tasks.comment') || hasPermission(user, 'tasks.comment.all');
  const canCommentTasksOwn = hasPermission(user, 'tasks.comment.own');
  const canCompleteTasksAny = hasPermission(user, 'tasks.complete.any') || canEditTasksAll;
  const canCompleteTasksOwn = hasPermission(user, 'tasks.complete.own') || canEditTasksOwn;

  const [detail, setDetail] = useState({ project: null, sections: [], members: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sectionDraft, setSectionDraft] = useState('');
  const [taskDrafts, setTaskDrafts] = useState({});
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskSort, setTaskSort] = useState('default');
  const [collapsedSections, setCollapsedSections] = useState([]);
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
  const [deleteCommentTarget, setDeleteCommentTarget] = useState(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('member');

  const project = detail.project;
  const sections = Array.isArray(detail.sections) ? detail.sections : [];
  const members = Array.isArray(detail.members) ? detail.members : [];
  const events = Array.isArray(detail.events) ? detail.events : [];

  const isProjectOwner = sameId(project?.ownerUserId || project?.createdByUserId || project?.createdBy, user?.id);
  const canEditProject = canEditProjectAll || (canEditProjectOwn && isProjectOwner);

  const isProjectMember = useCallback(
    (userId = user?.id) => members.some((member) => sameId(member.userId || member.id, userId)),
    [members, user?.id]
  );

  const isOwnTask = useCallback(
    (task) =>
      sameId(task?.assigneeUserId, user?.id) ||
      sameId(task?.createdByUserId || task?.createdBy, user?.id) ||
      taskCollaborators.some((collab) => sameId(collab.userId, user?.id)) ||
      isProjectMember(user?.id),
    [isProjectMember, taskCollaborators, user?.id]
  );

  const canEditTask = useCallback(
    (task) => canEditTasksAll || (canEditTasksOwn && isOwnTask(task)),
    [canEditTasksAll, canEditTasksOwn, isOwnTask]
  );

  const canCompleteTask = useCallback(
    (task) => canCompleteTasksAny || canEditTask(task) || (canCompleteTasksOwn && isOwnTask(task)),
    [canCompleteTasksAny, canCompleteTasksOwn, canEditTask, isOwnTask]
  );

  const canCommentTask = useCallback(
    (task) => canCommentTasksAll || (canCommentTasksOwn && isOwnTask(task)),
    [canCommentTasksAll, canCommentTasksOwn, isOwnTask]
  );

  const allTasks = useMemo(() => sections.flatMap((section) => section.tasks || []), [sections]);
  const flatTasks = useMemo(() => allTasks.filter((task) => !task.parentTaskId), [allTasks]);
  const visibleFlatTasks = useMemo(
    () => sortTasks(flatTasks.filter((task) => filterTask(task, taskFilter)), taskSort, users),
    [flatTasks, taskFilter, taskSort, users]
  );
  const selectedTask = useMemo(
    () => allTasks.find((task) => task.id === selectedTaskId) || null,
    [allTasks, selectedTaskId]
  );
  const selectedSubtasks = useMemo(
    () => (selectedTask ? allTasks.filter((task) => task.parentTaskId === selectedTask.id) : []),
    [allTasks, selectedTask]
  );
  const canEditSelectedTask = selectedTask ? canEditTask(selectedTask) : false;
  const canCompleteSelectedTask = selectedTask ? canCompleteTask(selectedTask) : false;
  const canCommentSelectedTask = selectedTask ? canCommentTask(selectedTask) : false;

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
    if (!client?.id && !projectId) return undefined;

    let cancelled = false;
    setLoading(true);
    setSelectedTaskId('');

    const loader = projectId
      ? getProject(projectId)
      : getClientProject(client.id).then(async (response) => {
          const payload = normalizeProjectPayload(response);
          const foundProjectId = payload.project?.id;
          if (!foundProjectId) return payload;
          return getProject(foundProjectId);
        });

    loader
      .then((response) => {
        if (cancelled) return;
        setDetail(normalizeProjectPayload(response));
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
  }, [client?.id, projectId, showToast]);

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

  function toggleSectionCollapse(sectionId) {
    setCollapsedSections((current) =>
      current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]
    );
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
    const draft = taskDrafts[sectionId] && typeof taskDrafts[sectionId] === 'object'
      ? taskDrafts[sectionId]
      : { ...emptyTaskDraft(), title: String(taskDrafts[sectionId] || '') };
    const title = parentTaskId ? subtaskTitle.trim() : String(draft.title || '').trim();
    if (!title || !project?.id || !sectionId || busy || !canCreateTasks) return;

    const payload = {
      projectId: project.id,
      sectionId,
      clientId: client?.id || project?.clientId || '',
      parentTaskId,
      title,
    };

    if (!parentTaskId) {
      if (draft.assigneeUserId) payload.assigneeUserId = draft.assigneeUserId;
      if (draft.dueDate) payload.dueDate = draft.dueDate;
    }

    try {
      setBusy(true);
      await createTask(payload);
      if (parentTaskId) setSubtaskTitle('');
      else setTaskDrafts((current) => ({ ...current, [sectionId]: emptyTaskDraft() }));
      await refreshProject(project.id);
      showToast(parentTaskId ? 'Subtarefa criada.' : 'Tarefa criada.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível criar a tarefa.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTaskDraft() {
    if (!selectedTask?.id || busy || !canEditSelectedTask) return;

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
    if (!task?.id || busy) return;

    const isStatusOnly = Object.keys(patch || {}).every((key) => ['status', 'done'].includes(key));
    if (!canEditTask(task) && !(isStatusOnly && canCompleteTask(task))) return;

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
    if (!task?.id || busy || !canEditTask(task)) return;

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
    if (!selectedTask?.id || !body || busy || !canCommentSelectedTask) return;

    try {
      setBusy(true);
      const response = await createTaskComment(selectedTask.id, { body });
      setCommentBody('');
      // Backend devolve { comment: {...} } (singular). Faz append local
      // ao invés de substituir a lista, mantendo os comentários anteriores.
      if (response?.comment?.id) {
        setTaskComments((current) =>
          current.some((entry) => entry.id === response.comment.id)
            ? current
            : [...current, response.comment]
        );
      } else if (Array.isArray(response?.comments)) {
        setTaskComments(response.comments);
      }
      await refreshProject(project.id);
      showToast('Comentário registrado.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível registrar o comentário.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteComment(comment) {
    if (!selectedTask?.id || !comment?.id || busy) return;

    const isAuthor = sameId(comment.userId || comment.authorUserId || comment.createdByUserId, user?.id);
    if (!isAuthor && !canCommentTasksAll && !canEditSelectedTask) return;

    try {
      setBusy(true);
      await deleteTaskComment(selectedTask.id, comment.id);
      setTaskComments((current) => current.filter((entry) => entry.id !== comment.id));
      await refreshProject(project.id);
      showToast('Comentário excluído.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível excluir o comentário.', { variant: 'error' });
    } finally {
      setBusy(false);
      setDeleteCommentTarget(null);
    }
  }

  async function reloadTaskCollaborators(taskId = selectedTask?.id) {
    if (!taskId) return;
    const response = await listTaskCollaborators(taskId);
    setTaskCollaborators(Array.isArray(response?.collaborators) ? response.collaborators : []);
  }

  async function handleAddCollaborator(event) {
    event.preventDefault();
    if (!selectedTask?.id || !collaboratorUserId || busy || !canEditSelectedTask) return;

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
    if (!selectedTask?.id || !userId || busy || !canEditSelectedTask) return;

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


  async function handleAddProjectMember(event) {
    event.preventDefault();
    if (!project?.id || !memberUserId || busy || !canEditProject) return;

    try {
      setBusy(true);
      await addProjectMember(project.id, { userId: memberUserId, role: memberRole });
      setMemberUserId('');
      setMemberRole('member');
      await refreshProject(project.id);
      showToast('Membro adicionado.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível adicionar membro.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveProjectMember(member) {
    const userId = member?.userId || member?.id;
    if (!project?.id || !userId || busy || !canEditProject || member?.role === 'owner') return;

    try {
      setBusy(true);
      await removeProjectMember(project.id, userId);
      await refreshProject(project.id);
      showToast('Membro removido.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover membro.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject() {
    if (!project?.id || busy || !canEditProject) return;

    try {
      setBusy(true);
      await deleteProject(project.id);
      setDetail({ project: null, sections: [], members: [], events: [] });
      setSelectedTaskId('');
      showToast('Projeto excluído.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível excluir o projeto.', { variant: 'error' });
    } finally {
      setBusy(false);
      setDeleteProjectTarget(null);
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
            <strong>{client?.name || projectLabel || 'Projeto'}</strong>
          </div>

          {client?.id && canCreateProject ? (
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

        {canEditProject ? (
          <button
            type="button"
            className={styles.deleteProjectButton}
            onClick={() => setDeleteProjectTarget(project)}
            disabled={busy}
            aria-label="Excluir projeto"
            title="Excluir projeto"
          >
            <TrashIcon size={14} aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <section className={styles.memberPanel}>
        <header className={styles.memberPanelHead}>
          <div>
            <span>Membros</span>
            <strong>{members.length}</strong>
          </div>
        </header>

        <div className={styles.memberList}>
          {members.length === 0 ? (
            <div className={styles.noTasks}>Nenhum membro vinculado</div>
          ) : (
            members.map((member) => {
              const memberId = member.userId || member.id;
              const memberName = member.userName || member.name || member.email || 'Usuário';
              return (
                <div key={memberId} className={styles.memberRow}>
                  <span>{initials(memberName)}</span>
                  <div>
                    <strong>{memberName}</strong>
                    <small>{member.role === 'owner' ? 'Proprietário' : member.role === 'viewer' ? 'Visualizador' : 'Membro'}</small>
                  </div>
                  <button
                    type="button"
                    className={styles.actionIcon}
                    onClick={() => handleRemoveProjectMember(member)}
                    disabled={busy || !canEditProject || member.role === 'owner'}
                    aria-label="Remover membro"
                  >
                    <TrashIcon size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {canEditProject ? (
          <form className={styles.memberForm} onSubmit={handleAddProjectMember}>
            <Select
              className={styles.projectInlineSelect}
              value={memberUserId}
              onChange={(event) => setMemberUserId(event.target.value)}
              disabled={busy}
              aria-label="Adicionar membro ao projeto"
            >
              <option value="">Adicionar membro</option>
              {(Array.isArray(users) ? users : [])
                .filter((entry) => !members.some((member) => sameId(member.userId || member.id, entry.id)))
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name || entry.email}</option>
                ))}
            </Select>
            <Select
              className={styles.projectInlineSelect}
              value={memberRole}
              onChange={(event) => setMemberRole(event.target.value)}
              disabled={busy}
              aria-label="Papel do membro"
            >
              <option value="member">Membro</option>
              <option value="viewer">Visualizador</option>
            </Select>
            <button type="submit" className={styles.inlineAddButton} disabled={busy || !memberUserId} aria-label="Adicionar membro" title="Adicionar membro">+</button>
          </form>
        ) : null}
      </section>

      <div className={styles.projectTopTools}>
        <form className={styles.sectionForm} onSubmit={handleCreateSection}>
          <input
            value={sectionDraft}
            onChange={(event) => setSectionDraft(event.target.value)}
            placeholder="Nova seção"
            disabled={busy || !canEditProject}
          />
          <button type="submit" className={styles.inlineAddButton} disabled={busy || !canEditProject || !sectionDraft.trim()} aria-label="Adicionar seção" title="Adicionar seção">+</button>
        </form>

        <section className={styles.projectTools}>
          <div className={styles.projectToolGroup}>
            <Select
              className={styles.projectToolSelect}
              value={taskFilter}
              onChange={(event) => setTaskFilter(event.target.value)}
              aria-label="Filtrar tarefas"
            >
              {TASK_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <Select
              className={styles.projectToolSelect}
              value={taskSort}
              onChange={(event) => setTaskSort(event.target.value)}
              aria-label="Ordenar tarefas"
            >
              {TASK_SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <span>{visibleFlatTasks.length} de {flatTasks.length} tarefa(s)</span>
        </section>
      </div>

      <section className={`${styles.workspace} ${selectedTask ? styles.workspaceWithPanel : ''}`.trim()}>
        <div className={styles.sections}>
          {sections.length === 0 ? (
            <StateBlock variant="empty" compact title="Nenhuma seção criada" />
          ) : (
            sections.map((section) => {
              const rawTasks = (section.tasks || []).filter((task) => !task.parentTaskId);
              const tasks = sortTasks(rawTasks.filter((task) => filterTask(task, taskFilter)), taskSort, users);
              const isEditing = editingSectionId === section.id;
              const isCollapsed = collapsedSections.includes(section.id);

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
                      <span>{tasks.length} de {rawTasks.length} tarefa(s)</span>
                    </div>

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.moveBtn}
                        onClick={() => toggleSectionCollapse(section.id)}
                        aria-label={isCollapsed ? 'Expandir seção' : 'Recolher seção'}
                      >
                        {isCollapsed ? '+' : '−'}
                      </button>
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

                  {!isCollapsed ? (
                    <>
                      <form className={styles.taskForm} onSubmit={(event) => handleCreateTask(event, section.id)}>
                        <input
                          value={(taskDrafts[section.id] && typeof taskDrafts[section.id] === 'object' ? taskDrafts[section.id].title : taskDrafts[section.id]) || ''}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [section.id]: {
                                ...(current[section.id] && typeof current[section.id] === 'object' ? current[section.id] : emptyTaskDraft()),
                                title: event.target.value,
                              },
                            }))
                          }
                          placeholder="Nova tarefa"
                          disabled={busy || !canCreateTasks}
                        />
                        <Select
                          className={styles.projectInlineSelect}
                          value={(taskDrafts[section.id] && typeof taskDrafts[section.id] === 'object' ? taskDrafts[section.id].assigneeUserId : '') || ''}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [section.id]: {
                                ...(current[section.id] && typeof current[section.id] === 'object' ? current[section.id] : emptyTaskDraft()),
                                assigneeUserId: event.target.value,
                              },
                            }))
                          }
                          disabled={busy || !canCreateTasks}
                          aria-label="Responsável da nova tarefa"
                        >
                          <option value="">Sem responsável</option>
                          {(Array.isArray(users) ? users : []).map((entry) => (
                            <option key={entry.id} value={entry.id}>{entry.name || entry.email}</option>
                          ))}
                        </Select>
                        <DateField
                          value={(taskDrafts[section.id] && typeof taskDrafts[section.id] === 'object' ? taskDrafts[section.id].dueDate : '') || ''}
                          onChange={(value) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [section.id]: {
                                ...(current[section.id] && typeof current[section.id] === 'object' ? current[section.id] : emptyTaskDraft()),
                                dueDate: value,
                              },
                            }))
                          }
                          disabled={busy || !canCreateTasks}
                          placeholder="Prazo"
                          ariaLabel="Prazo da nova tarefa"
                          className={styles.dateField}
                        />
                        <button
                          type="submit"
                          className={styles.inlineAddButton}
                          disabled={
                            busy ||
                            !canCreateTasks ||
                            !String(taskDrafts[section.id] && typeof taskDrafts[section.id] === 'object' ? taskDrafts[section.id].title : taskDrafts[section.id] || '').trim()
                          }
                          aria-label="Adicionar tarefa"
                          title="Adicionar tarefa"
                        >
                          +
                        </button>
                      </form>

                  <div className={styles.taskList}>
                    {tasks.length === 0 ? (
                      <div className={styles.noTasks}>Nenhuma tarefa nesta seção</div>
                    ) : (
                      tasks.map((task) => {
                        const subtasks = allTasks.filter((entry) => entry.parentTaskId === task.id);
                        const canEditThisTask = canEditTask(task);
                        const canCompleteThisTask = canCompleteTask(task);
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
                              disabled={busy || !canCompleteThisTask}
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
                                disabled={busy || !canEditThisTask}
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
                    </>
                  ) : null}
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
                    disabled={busy || !canEditSelectedTask}
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
                  disabled={busy || !canEditSelectedTask}
                />
              </div>

              <div className={styles.taskControls}>
                <label>
                  <span>Seção</span>
                  <Select
                    className={styles.projectInlineSelect}
                    value={selectedTask.sectionId || ''}
                    onChange={(event) => handleUpdateTask(selectedTask, { sectionId: event.target.value })}
                    disabled={busy || !canEditSelectedTask}
                    aria-label="Seção da tarefa"
                  >
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </Select>
                </label>

                <label>
                  <span>Status</span>
                  <Select
                    className={styles.projectInlineSelect}
                    value={selectedTask.status || 'todo'}
                    onChange={(event) => handleUpdateTask(selectedTask, { status: event.target.value, done: event.target.value === 'done' })}
                    disabled={busy || !canEditSelectedTask}
                    aria-label="Status da tarefa"
                  >
                    <option value="todo">Aberta</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </Select>
                </label>

                <label>
                  <span>Prioridade</span>
                  <Select
                    className={styles.projectInlineSelect}
                    value={selectedTask.priority || 'medium'}
                    onChange={(event) => handleUpdateTask(selectedTask, { priority: event.target.value })}
                    disabled={busy || !canEditSelectedTask}
                    aria-label="Prioridade da tarefa"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </Select>
                </label>

                <label>
                  <span>Responsável</span>
                  <Select
                    className={styles.projectInlineSelect}
                    value={selectedTask.assigneeUserId || ''}
                    onChange={(event) => handleUpdateTask(selectedTask, { assigneeUserId: event.target.value })}
                    disabled={busy || !canEditSelectedTask}
                    aria-label="Responsável da tarefa"
                  >
                    <option value="">Sem responsável</option>
                    {(Array.isArray(users) ? users : []).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name || entry.email}
                      </option>
                    ))}
                  </Select>
                </label>

                <label>
                  <span>Prazo</span>
                  <DateField
                    value={selectedTask.dueDate || ''}
                    onChange={(value) => handleUpdateTask(selectedTask, { dueDate: value })}
                    disabled={busy || !canEditSelectedTask}
                    placeholder="Sem prazo"
                    ariaLabel="Prazo da tarefa"
                    className={styles.dateField}
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
                  <button type="submit" className={styles.inlineAddButton} disabled={busy || !canCreateTasks || !subtaskTitle.trim()} aria-label="Adicionar subtarefa" title="Adicionar subtarefa">+</button>
                </form>

                <div className={styles.subtaskList}>
                  {selectedSubtasks.length === 0 ? (
                    <div className={styles.noTasks}>Nenhuma subtarefa</div>
                  ) : (
                    selectedSubtasks.map((subtask) => (
                      <div key={subtask.id} className={styles.subtaskRow}>
                        <button type="button" onClick={() => handleToggleTask(subtask)} disabled={busy || !canCompleteTask(subtask)}>
                          {subtask.status === 'done' ? '✓' : ''}
                        </button>
                        <span>{subtask.title}</span>
                        <button type="button" onClick={() => setDeleteTaskTarget(subtask)} disabled={busy || !canEditTask(subtask)} aria-label="Remover subtarefa">
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
                  <Select
                    className={styles.projectInlineSelect}
                    value={collaboratorUserId}
                    onChange={(event) => setCollaboratorUserId(event.target.value)}
                    disabled={busy || taskPanelLoading || !canEditSelectedTask}
                    aria-label="Adicionar colaborador"
                  >
                    <option value="">Adicionar colaborador</option>
                    {(Array.isArray(users) ? users : [])
                      .filter((entry) => !taskCollaborators.some((collab) => collab.userId === entry.id))
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name || entry.email}
                        </option>
                      ))}
                  </Select>
                  <button type="submit" className={styles.inlineAddButton} disabled={busy || !canEditSelectedTask || !collaboratorUserId} aria-label="Adicionar colaborador" title="Adicionar colaborador">+</button>
                </form>

                <div className={styles.collabList}>
                  {taskCollaborators.length === 0 ? (
                    <div className={styles.noTasks}>Nenhum colaborador</div>
                  ) : (
                    taskCollaborators.map((entry) => (
                      <div key={entry.userId} className={styles.collabRow}>
                        <span>{initials(entry.userName || entry.userEmail)}</span>
                        <strong>{entry.userName || entry.userEmail}</strong>
                        <button type="button" onClick={() => handleRemoveCollaborator(entry.userId)} disabled={busy || !canEditSelectedTask} aria-label="Remover colaborador">
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
                    disabled={busy || taskPanelLoading || !canCommentSelectedTask}
                  />
                  <button type="submit" disabled={busy || !canCommentSelectedTask || !commentBody.trim()}>
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
                        <button
                          type="button"
                          className={styles.commentDelete}
                          onClick={() => setDeleteCommentTarget(comment)}
                          disabled={
                            busy ||
                            (!sameId(comment.userId || comment.authorUserId || comment.createdByUserId, user?.id) &&
                              !canCommentTasksAll &&
                              !canEditSelectedTask)
                          }
                        >
                          Excluir
                        </button>
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
                  {eventMetadataItems(event, users, sections).length ? (
                    <div className={styles.activityMeta}>
                      {eventMetadataItems(event, users, sections).map((item) => (
                        <span key={`${item.label}-${item.value}`}>
                          {item.label}: {item.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {deleteCommentTarget ? (
        <div className={styles.confirmBackdrop} role="presentation" onClick={() => setDeleteCommentTarget(null)}>
          <section className={styles.confirmModal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.confirmHead}>
              <span>Excluir comentário</span>
              <strong>{deleteCommentTarget.userName || deleteCommentTarget.authorName || 'Comentário'}</strong>
              <p>Essa ação não pode ser desfeita.</p>
            </div>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setDeleteCommentTarget(null)}>Cancelar</button>
              <button type="button" className={styles.confirmDanger} onClick={() => handleDeleteComment(deleteCommentTarget)} disabled={busy}>
                Excluir
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
              <button type="button" className={styles.confirmDanger} onClick={() => handleDeleteTask(deleteTaskTarget)} disabled={busy || !canEditTask(deleteTaskTarget)}>
                Remover
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteProjectTarget ? (
        <div className={styles.confirmBackdrop} role="presentation" onClick={() => setDeleteProjectTarget(null)}>
          <section className={styles.confirmModal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.confirmHead}>
              <span>Excluir projeto</span>
              <strong>{deleteProjectTarget.name}</strong>
              <p>Essa ação remove seções, tarefas e histórico do projeto.</p>
            </div>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setDeleteProjectTarget(null)}>Cancelar</button>
              <button type="button" className={styles.confirmDanger} onClick={handleDeleteProject} disabled={busy || !canEditProject}>
                Excluir projeto
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
