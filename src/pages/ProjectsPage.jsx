import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  addProjectMember,
  addTaskCollaborator,
  createProjectSection,
  createTask,
  createTaskComment,
  deleteProject,
  deleteProjectSection,
  deleteTask,
  getProject,
  listProjects,
  listTaskCollaborators,
  listTaskComments,
  removeProjectMember,
  removeTaskCollaborator,
  reorderProjectSections,
  reorderProjectTasks,
  updateProjectSection,
  updateTask,
} from '../api/projects.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import Select from '../components/ui/Select.jsx';
import UserPicker from '../components/users/UserPicker.jsx';
import UserHoverCard from '../components/users/UserHoverCard.jsx';
import {
  BookTemplateIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  TrashIcon,
} from '../components/ui/Icons.jsx';
import obStyles from '../components/clients/OnboardingTab.module.css';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { getUserAvatar } from '../utils/avatarStorage.js';
import styles from './ProjectsPage.module.css';

function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
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

function formatDate(value) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}

function formatDateInput(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${String(year).slice(-2)}`;
}

function parseDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!br) return null;
  const [, day, month, yearValue] = br;
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return `${year}-${month}-${day}`;
}

function isoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromIso(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatEventTime(value) {
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

function formatLocalTime() {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function moveItem(list, draggedId, targetId) {
  const next = [...list];
  const fromIndex = next.indexOf(draggedId);
  const toIndex = next.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, draggedId);
  return next;
}

function isStatusOnlyPatch(patch = {}) {
  const keys = Object.keys(patch || {});
  return keys.length > 0 && keys.every((key) => key === 'status' || key === 'done');
}

function AssigneeAvatar({ name, avatarUrl }) {
  return (
    <span className={styles.taskAssigneeAvatar} aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}
    </span>
  );
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

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { setPanelHeader, userDirectory = [] } = useOutletContext();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('id') || '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const [memberSaving, setMemberSaving] = useState(false);
  const [memberRemovingId, setMemberRemovingId] = useState('');
  const [memberRemoveTarget, setMemberRemoveTarget] = useState(null);
  const [projectMemberUserId, setProjectMemberUserId] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [creatingTask, setCreatingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', sectionId: '', assigneeUserId: '', dueDate: '' });
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskSort, setTaskSort] = useState('section');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [sectionDraft, setSectionDraft] = useState('');
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionEditingId, setSectionEditingId] = useState('');
  const [sectionEditingName, setSectionEditingName] = useState('');
  const [sectionDeletingId, setSectionDeletingId] = useState('');
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState(null);
  const [draggedSectionId, setDraggedSectionId] = useState('');
  const [draggedTask, setDraggedTask] = useState(null);
  const [orderingBusy, setOrderingBusy] = useState(false);
  const [inlineSavingTaskId, setInlineSavingTaskId] = useState('');
  const [duePicker, setDuePicker] = useState(null);

  const [selectedTask, setSelectedTask] = useState(null);
  const [taskComments, setTaskComments] = useState([]);
  const [taskCollaborators, setTaskCollaborators] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [collaboratorUserId, setCollaboratorUserId] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);

  const loadProjects = useCallback(async (preferredId = '') => {
    const res = await listProjects();
    const nextProjects = Array.isArray(res?.projects) ? res.projects : [];
    const nextSelected = preferredId || nextProjects[0]?.id || '';
    setProjects(nextProjects);
    setSelectedId(nextSelected);
    if (nextSelected) {
      setParams({ id: nextSelected }, { replace: true });
    } else {
      setParams({}, { replace: true });
      setDetail(null);
    }
    return { nextProjects, nextSelected };
  }, [setParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loadProjects(selectedId)
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar projetos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    getProject(selectedId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedProject = detail?.project || projects.find((project) => project.id === selectedId);
  const sections = Array.isArray(detail?.sections) ? detail.sections : [];
  const projectMembers = Array.isArray(detail?.members) ? detail.members : [];
  const projectEvents = Array.isArray(detail?.events) ? detail.events : [];
  const firstSectionId = sections[0]?.id || '';
  const sectionIds = sections.map((section) => section.id).join('|');

  const flatTasks = useMemo(
    () => sections.flatMap((section) => section.tasks || []).filter((task) => !task.parentTaskId),
    [sections]
  );

  const selectedSubtasks = useMemo(() => {
    if (!selectedTask?.id) return [];
    return sections
      .flatMap((section) => section.tasks || [])
      .filter((task) => task.parentTaskId === selectedTask.id);
  }, [sections, selectedTask?.id]);

  const totalTasks = flatTasks.length || selectedProject?.taskCount || 0;
  const doneCount = flatTasks.filter((task) => task.status === 'done').length;
  const progress = percent(doneCount, totalTasks);
  const openCount = Math.max(totalTasks - doneCount, 0);

  const projectMemberOptions = useMemo(() => {
    const usedIds = new Set(projectMembers.map((entry) => entry.userId));
    return (Array.isArray(userDirectory) ? userDirectory : []).filter((entry) => !usedIds.has(entry.id));
  }, [projectMembers, userDirectory]);


  function resolveTaskUser(userId = '', userName = '', userEmail = '') {
    const byId = userId ? (Array.isArray(userDirectory) ? userDirectory : []).find((entry) => entry.id === userId) : null;
    if (byId) return byId;

    const byName = userName
      ? (Array.isArray(userDirectory) ? userDirectory : []).find((entry) => entry.name === userName)
      : null;

    return {
      id: userId || byName?.id || '',
      name: userName || byName?.name || 'Sem usuário',
      email: userEmail || byName?.email || '',
      avatarUrl: byName?.avatarUrl || '',
    };
  }

  const collaboratorOptions = useMemo(() => {
    const usedIds = new Set(taskCollaborators.map((entry) => entry.userId));
    if (selectedTask?.assigneeUserId) usedIds.add(selectedTask.assigneeUserId);
    return (Array.isArray(userDirectory) ? userDirectory : []).filter((entry) => !usedIds.has(entry.id));
  }, [taskCollaborators, selectedTask?.assigneeUserId, userDirectory]);

  const canAccessTemplate = hasPermission(user, 'projects.view');
  const canManageProjects = hasPermission(user, 'projects.edit');
  const canCreateTasks = hasPermission(user, 'tasks.create');
  const canEditTasks = hasPermission(user, 'tasks.edit');
  const canCommentTasks = hasPermission(user, 'tasks.comment');
  const canCompleteAnyTask = hasPermission(user, 'tasks.complete.any');
  const canCompleteOwnTask = hasPermission(user, 'tasks.complete.own');
  const canCompleteTask = useCallback((task) => {
    if (!task) return false;
    if (canEditTasks || canCompleteAnyTask) return true;
    const ownTask = task.assigneeUserId === user?.id || task.createdByUserId === user?.id;
    return canCompleteOwnTask && ownTask;
  }, [canCompleteAnyTask, canCompleteOwnTask, canEditTasks, user?.id]);
  const projectHeaderActions = useMemo(() => {
    if (!selectedProject) return null;
    return (
      <div className={styles.projectHeaderActions}>
        {selectedProject.clientName && selectedProject.clientName !== selectedProject.name ? (
          <span className={styles.panelHeaderClient}>{selectedProject.clientName}</span>
        ) : null}
        <div className={styles.projectHeaderGroup}>
          {projectMembers.length ? (
            <div className={styles.memberStack} aria-label="Membros do projeto">
              {projectMembers.slice(0, 5).map((member) => (
                <div key={member.userId} className={styles.memberBadge}>
                  <span className={styles.memberAvatar} title={member.userName}>
                    {initials(member.userName)}
                  </span>
                  {canManageProjects && member.role !== 'owner' ? (
                    <button
                      type="button"
                      className={styles.memberRemove}
                      disabled={memberRemovingId === member.userId}
                      onClick={() => handleRemoveProjectMember(member)}
                      aria-label={`Remover ${member.userName}`}
                      title={`Remover ${member.userName}`}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {projectMembers.length > 5 ? <span className={styles.memberCounter}>+{projectMembers.length - 5}</span> : null}
            </div>
          ) : null}
          {canAccessTemplate ? (
            <button
              type="button"
              className={styles.headerAction}
              onClick={() => navigate('/modelo-oficial')}
              title="Abrir modelo oficial"
            >
              <BookTemplateIcon size={13} />
              <span>Modelo</span>
            </button>
          ) : null}
        </div>
        {canManageProjects ? (
          <div className={styles.projectHeaderGroup}>
            <form className={styles.shareForm} onSubmit={handleAddProjectMember}>
              <UserPicker
                className={styles.shareSelect}
                users={projectMemberOptions}
                value={projectMemberUserId}
                disabled={memberSaving || projectMemberOptions.length === 0}
                onChange={setProjectMemberUserId}
                placeholder="Compartilhar com"
              />
              <button type="submit" disabled={memberSaving || !projectMemberUserId} title="Adicionar membro" aria-label="Adicionar membro">
                <PlusIcon size={13} />
              </button>
            </form>
            <button
              type="button"
              className={`${styles.headerAction} ${styles.headerActionDanger}`.trim()}
              onClick={() => setDeleteConfirmOpen(true)}
              title="Excluir projeto"
            >
              <TrashIcon size={13} />
              <span>Excluir projeto</span>
            </button>
          </div>
        ) : null}
      </div>
    );
  }, [
    canManageProjects,
    canAccessTemplate,
    handleRemoveProjectMember,
    memberSaving,
    memberRemovingId,
    navigate,
    projectMemberOptions,
    projectMemberUserId,
    projectMembers,
    selectedProject,
  ]);

  useEffect(() => {
    setPanelHeader({ title: 'Projetos', description: null, actions: null });
    return () => setPanelHeader({ title: 'Dashboard', description: null, actions: null });
  }, [setPanelHeader]);

  const renderedTaskGroups = useMemo(() => {
    const filteredTasks = flatTasks.filter((task) => {
      if (taskFilter === 'open') return task.status !== 'done';
      if (taskFilter === 'done') return task.status === 'done';
      if (taskFilter === 'assigned') return Boolean(task.assigneeName);
      if (taskFilter === 'unassigned') return !task.assigneeName;
      if (taskFilter === 'due') return Boolean(task.dueDate);
      return true;
    });

    const sortedTasks = [...filteredTasks].sort((left, right) => {
      if (taskSort === 'due') {
        const leftValue = left.dueDate || '9999-12-31';
        const rightValue = right.dueDate || '9999-12-31';
        return leftValue.localeCompare(rightValue);
      }
      if (taskSort === 'assignee') {
        return normalizeText(left.assigneeName).localeCompare(normalizeText(right.assigneeName));
      }
      if (taskSort === 'title') {
        return normalizeText(left.title).localeCompare(normalizeText(right.title));
      }
      if (taskSort === 'status') {
        return normalizeText(statusLabel(left.status)).localeCompare(normalizeText(statusLabel(right.status)));
      }
      return 0;
    });

    return sections
      .map((section) => ({
        key: section.id,
        name: section.name,
        tasks: sortedTasks.filter((task) => task.sectionId === section.id),
      }));
  }, [flatTasks, sections, taskFilter, taskSort]);

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = {};
      renderedTaskGroups.forEach((group) => {
        next[group.key] = current[group.key] ?? false;
      });
      return next;
    });
  }, [renderedTaskGroups]);

  useEffect(() => {
    setNewTask((prev) => (
      !firstSectionId || sectionIds.split('|').includes(prev.sectionId)
        ? prev
        : { ...prev, sectionId: firstSectionId }
    ));
  }, [firstSectionId, sectionIds]);

  useEffect(() => {
    if (!duePicker) return undefined;

    const close = () => setDuePicker(null);

    const handlePointerDown = (event) => {
      const target = event.target;

      if (
        target?.closest?.(`.${styles.duePicker}`) ||
        target?.closest?.(`.${styles.inlineDate}`)
      ) {
        return;
      }

      close();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [duePicker]);

  function syncProjectSummary(project) {
    if (!project?.id) return;
    setProjects((current) =>
      current.map((entry) => {
        if (entry.id !== project.id) return entry;
        return {
          ...entry,
          ...project,
          taskCount: project.taskCount ?? entry.taskCount,
          doneCount: project.doneCount ?? entry.doneCount,
        };
      })
    );
  }

  async function refreshProject(projectId = selectedId) {
    const res = await getProject(projectId);
    setDetail(res);
    syncProjectSummary(res?.project);
    return res;
  }

  async function handleCreateSection(event) {
    event.preventDefault();
    const name = sectionDraft.trim();
    if (!name || !selectedId) return;

    try {
      setSectionSaving(true);
      const res = await createProjectSection(selectedId, { name });
      setDetail((prev) => (prev ? { ...prev, sections: Array.isArray(res?.sections) ? res.sections : prev.sections } : prev));
      setSectionDraft('');
      showToast('Seção criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a seção.', { variant: 'error' });
    } finally {
      setSectionSaving(false);
    }
  }

  function startRenameSection(section) {
    if (!section?.id) return;
    setSectionEditingId(section.id);
    setSectionEditingName(section.name || '');
  }

  async function saveSectionName(section) {
    const name = sectionEditingName.trim();
    if (!section?.id) return;
    if (!name || name === section.name) {
      setSectionEditingId('');
      setSectionEditingName('');
      return;
    }

    try {
      setSectionSaving(true);
      const res = await updateProjectSection(selectedId, section.id, { name });
      setDetail((prev) => (prev ? { ...prev, sections: Array.isArray(res?.sections) ? res.sections : prev.sections } : prev));
      showToast('Seção renomeada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível renomear a seção.', { variant: 'error' });
    } finally {
      setSectionSaving(false);
      setSectionEditingId('');
      setSectionEditingName('');
    }
  }

  async function saveInlineSectionName(section, value) {
    if (!section?.id || !canManageProjects) return;
    const name = String(value || '').trim();
    if (!name || name === section.name) return;

    try {
      setSectionSaving(true);
      const res = await updateProjectSection(selectedId, section.id, { name });
      setDetail((prev) => (prev ? { ...prev, sections: Array.isArray(res?.sections) ? res.sections : prev.sections } : prev));
      showToast('Seção renomeada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível renomear a seção.', { variant: 'error' });
    } finally {
      setSectionSaving(false);
    }
  }

  function handleDeleteSection(section, taskCount = 0) {
    if (!selectedId || !section?.id) return;

    setSectionDeleteTarget({
      id: section.id,
      name: section.name,
      taskCount: Number(taskCount || 0),
    });
  }

  async function confirmDeleteSection({ deleteTasks = false } = {}) {
    if (!selectedId || !sectionDeleteTarget?.id) return;

    try {
      setSectionDeletingId(sectionDeleteTarget.id);

      const res = await deleteProjectSection(selectedId, sectionDeleteTarget.id, { deleteTasks });

      setDetail((prev) => (prev ? { ...prev, sections: Array.isArray(res?.sections) ? res.sections : prev.sections } : prev));
      syncProjectSummary(res?.project);
      showToast(sectionDeleteTarget.taskCount > 0 ? 'Seção e tarefas excluídas.' : 'Seção excluída.', { variant: 'success' });
      setSectionDeleteTarget(null);
    } catch (err) {
      showToast(err?.message || 'Não foi possível excluir a seção.', { variant: 'error' });
    } finally {
      setSectionDeletingId('');
    }
  }

  async function handleSectionDrop(targetSectionId) {
    if (!selectedId || !draggedSectionId || draggedSectionId === targetSectionId || orderingBusy) return;
    const nextIds = moveItem(
      sections.map((section) => section.id),
      draggedSectionId,
      targetSectionId
    );
    if (nextIds.join('|') === sections.map((section) => section.id).join('|')) return;

    try {
      setOrderingBusy(true);
      const res = await reorderProjectSections(selectedId, nextIds);
      setDetail((prev) => (prev ? { ...prev, sections: Array.isArray(res?.sections) ? res.sections : prev.sections } : prev));
      syncProjectSummary(res?.project);
    } catch (err) {
      showToast(err?.message || 'Não foi possível reordenar as seções.', { variant: 'error' });
    } finally {
      setOrderingBusy(false);
      setDraggedSectionId('');
    }
  }

  async function handleTaskDrop(targetSectionId, targetTaskId = '', position = 'before') {
    if (!selectedId || !draggedTask?.id || !targetSectionId || orderingBusy) return;
    if (!canEditTasks) return;
    if (taskFilter !== 'all' || taskSort !== 'section') return;

    const groups = sections.map((section) => ({
      sectionId: section.id,
      taskIds: (section.tasks || [])
        .filter((task) => !task.parentTaskId)
        .map((task) => task.id),
    }));

    const sourceGroup = groups.find((group) => group.taskIds.includes(draggedTask.id));
    const targetGroup = groups.find((group) => group.sectionId === targetSectionId);

    if (!sourceGroup || !targetGroup) return;

    const beforeSignature = groups
      .map((group) => `${group.sectionId}:${group.taskIds.join(',')}`)
      .join('|');

    sourceGroup.taskIds = sourceGroup.taskIds.filter((taskId) => taskId !== draggedTask.id);

    const targetIndex = targetTaskId ? targetGroup.taskIds.indexOf(targetTaskId) : -1;

    if (targetIndex >= 0) {
      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      targetGroup.taskIds.splice(insertIndex, 0, draggedTask.id);
    } else {
      targetGroup.taskIds.push(draggedTask.id);
    }

    const afterSignature = groups
      .map((group) => `${group.sectionId}:${group.taskIds.join(',')}`)
      .join('|');

    if (beforeSignature === afterSignature) {
      setDraggedTask(null);
      return;
    }

    try {
      setOrderingBusy(true);
      const res = await reorderProjectTasks(selectedId, groups);
      setDetail((prev) => (prev ? { ...prev, sections: Array.isArray(res?.sections) ? res.sections : prev.sections } : prev));
      syncProjectSummary(res?.project);
    } catch (err) {
      showToast(err?.message || 'Não foi possível reordenar as tarefas.', { variant: 'error' });
    } finally {
      setOrderingBusy(false);
      setDraggedTask(null);
    }
  }

  async function handleToggleTask(task) {
    if (!canCompleteTask(task)) {
      showToast('Sem permissão para alterar o status desta tarefa.', { variant: 'error' });
      return;
    }
    const nextDone = task.status !== 'done';
    try {
      setInlineSavingTaskId(task.id);
      await updateTask(task.id, { done: nextDone });
      const res = await refreshProject(selectedId);
      if (selectedTask?.id === task.id) {
        const nextTask = (res?.sections || [])
          .flatMap((section) => section.tasks || [])
          .find((entry) => entry.id === task.id);
        if (nextTask) setSelectedTask(nextTask);
      }
    } catch (err) {
      showToast(err?.message || 'Não foi possível alterar a tarefa.', { variant: 'error' });
    } finally {
      setInlineSavingTaskId('');
    }
  }

  async function handleInlineTaskUpdate(task, patch) {
    if (!task?.id || !canEditTasks) return;
    const cleanPatch = { ...patch };
    if (cleanPatch.title !== undefined) {
      cleanPatch.title = cleanPatch.title.trim();
      if (!cleanPatch.title || cleanPatch.title === task.title) return;
    }
    if (cleanPatch.assigneeUserId !== undefined && cleanPatch.assigneeUserId === (task.assigneeUserId || '')) return;
    if (cleanPatch.dueDate !== undefined && cleanPatch.dueDate === (task.dueDate || '')) return;

    try {
      setInlineSavingTaskId(task.id);
      await updateTask(task.id, cleanPatch);
      const res = await refreshProject(selectedId);
      if (selectedTask?.id === task.id) {
        const nextTask = (res?.sections || [])
          .flatMap((section) => section.tasks || [])
          .find((entry) => entry.id === task.id);
        if (nextTask) setSelectedTask(nextTask);
      }
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar a tarefa.', { variant: 'error' });
    } finally {
      setInlineSavingTaskId('');
    }
  }

  async function handleInlineDueDateUpdate(task, rawValue, input) {
    const nextDate = parseDateInput(rawValue);
    if (nextDate === null) {
      if (input) input.value = formatDateInput(task.dueDate);
      showToast('Use o formato dd/mm/aa.', { variant: 'error' });
      return;
    }
    await handleInlineTaskUpdate(task, { dueDate: nextDate });
  }

  function openDuePicker(task) {
    const month = dateFromIso(task.dueDate);
    setDuePicker({
      taskId: task.id,
      draft: formatDateInput(task.dueDate),
      month: new Date(month.getFullYear(), month.getMonth(), 1),
    });
  }

  async function commitDuePicker(task, value = '') {
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
      ? value
      : parseDateInput(value || duePicker?.draft || '');

    if (!nextDate) {
      showToast('Selecione uma data no calendário.', { variant: 'error' });
      return;
    }

    await handleInlineTaskUpdate(task, { dueDate: nextDate });
    setDuePicker(null);
    showToast('Prazo atualizado.', { variant: 'success' });
  }

  async function clearDueDate(task) {
    await handleInlineTaskUpdate(task, { dueDate: '' });
    setDuePicker(null);
    showToast('Prazo removido.', { variant: 'success' });
  }

  function renderDuePicker(task) {
    if (duePicker?.taskId !== task.id) return null;
    const monthDate = duePicker.month || dateFromIso(task.dueDate);
    const selectedIso = task.dueDate || '';
    const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    return (
      <div
        className={styles.duePicker}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.duePickerTop}>
          <span className={styles.duePickerAdd}>Selecione a data no calendário</span>
          <button
            type="button"
            className={styles.duePickerClose}
            onClick={() => setDuePicker(null)}
            aria-label="Fechar seletor de data"
          >
            <CloseIcon size={13} />
          </button>
        </div>

        <div className={styles.duePickerMonth}>
          <button
            type="button"
            onClick={() => setDuePicker((current) => ({ ...current, month: addMonths(current.month, -1) }))}
            aria-label="Mês anterior"
          >
            <ChevronLeftIcon size={15} />
          </button>
          <strong>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(monthDate)}</strong>
          <button
            type="button"
            onClick={() => setDuePicker((current) => ({ ...current, month: addMonths(current.month, 1) }))}
            aria-label="Próximo mês"
          >
            <ChevronRightIcon size={15} />
          </button>
        </div>

        <div className={styles.duePickerGrid}>
          {weekdays.map((day, index) => <span key={`${day}-${index}`} className={styles.duePickerWeekday}>{day}</span>)}
          {calendarDays(monthDate).map((date) => {
            const iso = isoFromDate(date);
            const muted = date.getMonth() !== monthDate.getMonth();
            const selected = iso === selectedIso;
            return (
              <button
                key={iso}
                type="button"
                className={`${styles.duePickerDay} ${muted ? styles.duePickerDayMuted : ''} ${selected ? styles.duePickerDaySelected : ''}`.trim()}
                onClick={() => commitDuePicker(task, iso)}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className={styles.duePickerFooter}>
          <CalendarIcon size={16} />
          <button type="button" onClick={() => clearDueDate(task)}>Apagar</button>
        </div>
      </div>
    );
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    if (!canCreateTasks) return;
    const title = newTask.title.trim();
    if (!title || !selectedId) return;

    try {
      setCreatingTask(true);
      await createTask({
        projectId: selectedId,
        sectionId: newTask.sectionId || sections[0]?.id || '',
        title,
        assigneeUserId: newTask.assigneeUserId || '',
        dueDate: newTask.dueDate || '',
      });
      await refreshProject(selectedId);
      setNewTask((prev) => ({ ...prev, title: '', dueDate: '' }));
      showToast('Tarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a tarefa.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleAddProjectMember(event) {
    event.preventDefault();
    if (!selectedId || !projectMemberUserId) return;

    try {
      setMemberSaving(true);
      const res = await addProjectMember(selectedId, { userId: projectMemberUserId, role: 'member' });
      setDetail((prev) => (prev ? { ...prev, members: Array.isArray(res?.members) ? res.members : prev.members } : prev));
      setProjectMemberUserId('');
      showToast('Membro adicionado ao projeto.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível compartilhar o projeto.', { variant: 'error' });
    } finally {
      setMemberSaving(false);
    }
  }

  async function handleRemoveProjectMember(member) {
    if (!selectedId || !member?.userId) return;
    if (!window.confirm(`Remover ${member.userName} deste projeto?`)) return;

    try {
      setMemberRemovingId(member.userId);
      const res = await removeProjectMember(selectedId, member.userId);
      setDetail((prev) =>
        prev ? { ...prev, members: Array.isArray(res?.members) ? res.members : prev.members } : prev
      );
      showToast('Membro removido do projeto.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover o membro.', { variant: 'error' });
    } finally {
      setMemberRemovingId('');
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject?.id) return;
    try {
      setDeleteBusy(true);
      const remainingProjects = projects.filter((project) => project.id !== selectedProject.id);
      const fallbackId = remainingProjects[0]?.id || '';
      await deleteProject(selectedProject.id);
      setDeleteConfirmOpen(false);
      setSelectedTask(null);
      await loadProjects(fallbackId);
      showToast('Projeto excluído.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível excluir o projeto.', { variant: 'error' });
    } finally {
      setDeleteBusy(false);
    }
  }

  async function openTask(task) {
    setSelectedTask(task);
    setTaskComments([]);
    setTaskCollaborators([]);
    setCommentBody('');
    setCollaboratorUserId('');
    setSubtaskTitle('');
    setCommentsLoading(true);
    setCollaboratorsLoading(true);
    try {
      const [commentsRes, collaboratorsRes] = await Promise.all([
        listTaskComments(task.id),
        listTaskCollaborators(task.id),
      ]);
      setTaskComments(Array.isArray(commentsRes?.comments) ? commentsRes.comments : []);
      setTaskCollaborators(Array.isArray(collaboratorsRes?.collaborators) ? collaboratorsRes.collaborators : []);
    } catch (err) {
      showToast(err?.message || 'Não foi possível carregar os detalhes da tarefa.', { variant: 'error' });
    } finally {
      setCommentsLoading(false);
      setCollaboratorsLoading(false);
    }
  }

  async function refreshSelectedTask(taskId) {
    const res = await refreshProject(selectedId);
    const nextTask = (res?.sections || [])
      .flatMap((section) => section.tasks || [])
      .find((task) => task.id === taskId);
    if (nextTask) setSelectedTask(nextTask);
  }

  async function refreshTaskCollaborators(taskId) {
    const res = await listTaskCollaborators(taskId);
    setTaskCollaborators(Array.isArray(res?.collaborators) ? res.collaborators : []);
  }

  async function handleUpdateSelectedTask(patch) {
    if (!selectedTask?.id) return;
    if (!isStatusOnlyPatch(patch) && !canEditTasks) {
      showToast('Sem permissão para editar tarefas.', { variant: 'error' });
      return;
    }
    if (isStatusOnlyPatch(patch) && !canCompleteTask(selectedTask)) {
      showToast('Sem permissão para alterar o status desta tarefa.', { variant: 'error' });
      return;
    }
    try {
      setTaskSaving(true);
      await updateTask(selectedTask.id, patch);
      await refreshSelectedTask(selectedTask.id);
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar a tarefa.', { variant: 'error' });
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleTitleBlur(event) {
    if (!canEditTasks) return;
    const title = event.target.value.trim();
    if (!title || title === selectedTask?.title) return;
    await handleUpdateSelectedTask({ title });
  }

  async function handleDeleteSelectedTask() {
    if (!selectedTask?.id) return;
    if (!canEditTasks) return;

    try {
      setTaskSaving(true);
      await deleteTask(selectedTask.id);
      setSelectedTask(null);
      await refreshProject(selectedId);
      showToast('Tarefa excluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível excluir a tarefa.', { variant: 'error' });
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleSubmitComment(event) {
    event.preventDefault();
    if (!canCommentTasks) return;
    const body = commentBody.trim();
    if (!body || !selectedTask?.id) return;

    try {
      const res = await createTaskComment(selectedTask.id, { body });
      setTaskComments((prev) => [...prev, res.comment].filter(Boolean));
      setCommentBody('');
      await refreshSelectedTask(selectedTask.id);
      showToast('Comentário enviado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível comentar.', { variant: 'error' });
    }
  }

  async function handleCreateSubtask(event) {
    event.preventDefault();
    if (!canCreateTasks) return;
    const title = subtaskTitle.trim();
    if (!title || !selectedTask?.id || !selectedId) return;

    try {
      setCreatingSubtask(true);
      await createTask({
        projectId: selectedId,
        sectionId: selectedTask.sectionId || sections[0]?.id || '',
        parentTaskId: selectedTask.id,
        title,
        assigneeUserId: selectedTask.assigneeUserId || '',
        dueDate: selectedTask.dueDate || '',
      });
      await refreshSelectedTask(selectedTask.id);
      setSubtaskTitle('');
      showToast('Subtarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a subtarefa.', { variant: 'error' });
    } finally {
      setCreatingSubtask(false);
    }
  }

  async function handleAddCollaborator(event) {
    event.preventDefault();
    if (!canEditTasks) return;
    if (!selectedTask?.id || !collaboratorUserId) return;

    try {
      setCollaboratorSaving(true);
      await addTaskCollaborator(selectedTask.id, { userId: collaboratorUserId, role: 'follower' });
      await Promise.all([
        refreshTaskCollaborators(selectedTask.id),
        refreshSelectedTask(selectedTask.id),
      ]);
      setCollaboratorUserId('');
      showToast('Colaborador adicionado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível adicionar o colaborador.', { variant: 'error' });
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleRemoveCollaborator(userId) {
    if (!canEditTasks) return;
    if (!selectedTask?.id || !userId) return;
    try {
      setCollaboratorSaving(true);
      await removeTaskCollaborator(selectedTask.id, userId);
      await Promise.all([
        refreshTaskCollaborators(selectedTask.id),
        refreshSelectedTask(selectedTask.id),
      ]);
      showToast('Colaborador removido.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover o colaborador.', { variant: 'error' });
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function taskAssignee(task) {
    if (!task?.assigneeName) return null;
    const match = (Array.isArray(userDirectory) ? userDirectory : []).find(
      (entry) => entry.id === task.assigneeUserId || entry.name === task.assigneeName
    );
    const projectCount = Number(
      match?.projectCount ?? match?.projectsCount ?? match?.project_count
    );
    return {
      id: match?.id || task.assigneeUserId || '',
      name: task.assigneeName,
      email: match?.email || match?.username || '',
      avatarUrl: getUserAvatar(match) || match?.avatarUrl || '',
      projectCount: Number.isFinite(projectCount) ? projectCount : null,
    };
  }

  if (loading) return <StateBlock variant="loading" title="Carregando projetos" />;
  if (error) return <StateBlock variant="error" title="Erro ao carregar projetos" description={error} />;

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <aside className={`${styles.panel} ${styles.sidebarPanel}`}>
          <div className={styles.projectList}>
            {projects.length === 0 ? (
              <div className={styles.empty}>Nenhum projeto ativo.</div>
            ) : (
              projects.map((project) => {
                const value = percent(project.doneCount, project.taskCount);
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`${styles.projectButton} ${project.id === selectedId ? styles.projectButtonActive : ''}`.trim()}
                    onClick={() => {
                      setSelectedId(project.id);
                      setParams({ id: project.id }, { replace: true });
                    }}
                  >
                    <span className={styles.projectButtonBody}>
                      <span className={styles.projectNameRow}>
                        <span className={styles.projectName}>{project.name}</span>
                        <span className={styles.projectCount}>{value}%</span>
                      </span>
                      <span className={styles.projectMeta}>
                        <span>{project.squadName || 'Sem squad'}</span>
                        <span>{project.taskCount || 0} tarefas</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className={`${styles.panel} ${styles.mainPanel}`}>
          {!selectedProject ? (
            <div className={styles.empty}>Selecione um projeto.</div>
          ) : detailLoading ? (
            <StateBlock variant="loading" compact title="Carregando projeto" />
          ) : (
            <>
              <section className={styles.detailHero}>
                <div className={styles.heroMainRow}>
                  <div className={styles.projectTitleRow}>
                    <span className={styles.projectIcon}>{selectedProject.type === 'client' ? 'C' : 'P'}</span>
                    <div className={styles.projectHeading}>
                      <h1>{selectedProject.name}</h1>
                      <div className={styles.heroMeta}>
                        <span>{selectedProject.ownerName || 'Sem responsável'}</span>
                        {selectedProject.squadName ? <span>{selectedProject.squadName}</span> : null}
                      </div>
                    </div>
                  </div>
                  {projectHeaderActions}
                </div>

                <div className={`${obStyles.toolbarMeta} ${styles.summaryInline}`.trim()}>
                  <span>{totalTasks} tarefa{totalTasks === 1 ? '' : 's'}</span>
                  <span>{openCount} abertas</span>
                  <span>Concluídas <b>{doneCount || selectedProject.doneCount || 0}</b></span>
                  <b>{progress}%</b>
                </div>
              </section>

              <div className={obStyles.progressLine} aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>

              <section className={styles.workspace}>
                {canCreateTasks ? (
                <form className={styles.createTask} onSubmit={handleCreateTask}>
                  <div className={styles.createTaskTitleWrap}>
                    <input
                      value={newTask.title}
                      onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
                      aria-label="Título da tarefa"
                      placeholder="Nova tarefa"
                    />
                  </div>
                  <Select
                    className={styles.createSelect}
                    value={newTask.sectionId}
                    onChange={(event) => setNewTask((prev) => ({ ...prev, sectionId: event.target.value }))}
                    aria-label="Seção"
                  >
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </Select>
                  <UserPicker
                    className={styles.createSelect}
                    users={Array.isArray(userDirectory) ? userDirectory : []}
                    value={newTask.assigneeUserId}
                    onChange={(userId) => setNewTask((prev) => ({ ...prev, assigneeUserId: userId }))}
                    placeholder="Responsável"
                  />
                  <input
                    key={newTask.dueDate || 'empty-due'}
                    type="text"
                    defaultValue={formatDateInput(newTask.dueDate)}
                    onBlur={(event) => {
                      const nextDate = parseDateInput(event.target.value);
                      if (nextDate === null) {
                        event.currentTarget.value = formatDateInput(newTask.dueDate);
                        showToast('Use o formato dd/mm/aa.', { variant: 'error' });
                        return;
                      }
                      setNewTask((prev) => ({ ...prev, dueDate: nextDate }));
                    }}
                    placeholder="dd/mm/aa"
                    aria-label="Prazo"
                  />
                  <button type="submit" disabled={creatingTask || !newTask.title.trim()}>
                    Criar
                  </button>
                </form>
                ) : null}

                <section className={styles.sections}>
                  <div className={styles.taskToolbar}>
                    <div className={styles.taskToolbarGroup}>
                      <label className={styles.toolbarField}>
                        <span>Filtrar</span>
                        <Select className={styles.toolbarSelect} value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} aria-label="Filtrar tarefas">
                          <option value="all">Tudo</option>
                          <option value="open">Abertas</option>
                          <option value="done">Concluídas</option>
                          <option value="assigned">Com responsável</option>
                          <option value="unassigned">Sem responsável</option>
                          <option value="due">Com prazo</option>
                        </Select>
                      </label>
                      <label className={styles.toolbarField}>
                        <span>Ordenar</span>
                        <Select className={styles.toolbarSelect} value={taskSort} onChange={(event) => setTaskSort(event.target.value)} aria-label="Ordenar tarefas">
                          <option value="section">Padrão</option>
                          <option value="due">Prazo</option>
                          <option value="assignee">Responsável</option>
                          <option value="title">Nome</option>
                          <option value="status">Status</option>
                        </Select>
                      </label>
                    </div>
                    {canManageProjects ? (
                      <form className={styles.sectionCreateForm} onSubmit={handleCreateSection}>
                        <input
                          value={sectionDraft}
                          onChange={(event) => setSectionDraft(event.target.value)}
                          placeholder="Nova seção"
                          aria-label="Nova seção"
                        />
                        <button type="submit" disabled={sectionSaving || !sectionDraft.trim()}>
                          Adicionar seção
                        </button>
                      </form>
                    ) : null}
                  </div>

                  <div className={styles.taskTableHeader} aria-hidden="true">
                    <span>Nome</span>
                    <span>Responsável</span>
                    <span>Prazo</span>
                    <span />
                  </div>

                  {renderedTaskGroups.map((group) => {
                    const section = sections.find((entry) => entry.id === group.key);
                    const doneInGroup = group.tasks.filter((task) => task.status === 'done').length;
                    const toggleGroup = () =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.key]: !current[group.key],
                      }));

                    return (
                      <article
                        key={group.key}
                        className={`${styles.section} ${draggedSectionId === group.key ? styles.sectionDragging : ''}`.trim()}
                        draggable={Boolean(canManageProjects && section)}
                        onDragStart={(event) => {
                          if (!section) return;
                          setDraggedSectionId(section.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', `section:${section.id}`);
                        }}
                        onDragEnd={() => setDraggedSectionId('')}
                        onDragOver={(event) => {
                          if (draggedSectionId || draggedTask) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          if (draggedTask) {
                            handleTaskDrop(group.key);
                            return;
                          }

                          handleSectionDrop(group.key);
                        }}
                      >
                        <div className={styles.sectionToggle}>
                        <button
                          type="button"
                          className={styles.sectionCollapse}
                          onClick={toggleGroup}
                          aria-label={collapsedGroups[group.key] ? 'Expandir seção' : 'Recolher seção'}
                          aria-expanded={!collapsedGroups[group.key]}
                        >
                          <ChevronDownIcon
                            size={13}
                            className={`${styles.sectionChevron} ${collapsedGroups[group.key] ? styles.sectionCollapsed : ''}`.trim()}
                          />
                        </button>
                        <span className={styles.sectionIndex}>
                          {String(sections.findIndex((entry) => entry.id === group.key) + 1).padStart(2, '0')}
                        </span>
                        {sectionEditingId === group.key ? (
                          <input
                            className={styles.sectionTitleInput}
                            value={sectionEditingName}
                            autoFocus
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setSectionEditingName(event.target.value)}
                            onBlur={() => saveSectionName(section)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') {
                                setSectionEditingId('');
                                setSectionEditingName('');
                              }
                            }}
                            aria-label="Nome da seção"
                          />
                        ) : (
                          <button
                            type="button"
                            className={styles.sectionTitle}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (canManageProjects && section) startRenameSection(section);
                            }}
                          >
                            {group.name}
                          </button>
                        )}
                        <span className={styles.sectionCount}>{group.tasks.length} tarefas</span>
                        <span className={styles.sectionDone}>
                          {doneInGroup} concluídas
                        </span>
                        {canManageProjects && section ? (
                          <span className={styles.sectionActions} onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              className={styles.sectionAction}
                              onClick={() => startRenameSection(section)}
                            >
                              Renomear
                            </button>
                            <button
                              type="button"
                              className={styles.sectionAction}
                              disabled={sectionDeletingId === section.id}
                              onClick={() => handleDeleteSection(section, group.tasks.length)}
                              title={group.tasks.length > 0 ? 'Excluir seção e tarefas' : 'Excluir seção'}
                              aria-label="Excluir seção"
                            >
                              <TrashIcon size={12} />
                            </button>
                          </span>
                        ) : null}
                        <span className={styles.sectionChevronLegacy} aria-hidden="true">
                          ▾
                        </span>
                      </div>

                      {!collapsedGroups[group.key]
                        ? group.tasks.map((task) => {
                            const assignee = taskAssignee(task);
                            return (
                              <div
                                key={task.id}
                                className={`${styles.task} ${
                                  task.status === 'done' ? styles.done : ''
                                } ${draggedTask?.id === task.id ? styles.taskDragging : ''} ${
                                  inlineSavingTaskId === task.id ? styles.taskSaving : ''
                                }`.trim()}
                                draggable={canEditTasks && taskFilter === 'all' && taskSort === 'section'}
                                onDragStart={(event) => {
                                  setDraggedTask({ id: task.id, sectionId: group.key, startedAt: Date.now() });
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', `task:${task.id}`);
                                }}
                                onDragEnd={() => setDraggedTask(null)}
                                onDragOver={(event) => {
                                  if (draggedTask?.id && draggedTask.id !== task.id) {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = 'move';
                                  }
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();

                                  if (!draggedTask?.id || draggedTask.id === task.id) return;

                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const position = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';

                                  handleTaskDrop(group.key, task.id, position);
                                }}
                              >
                                <button
                                  type="button"
                                  className={styles.check}
                                  onClick={() => handleToggleTask(task)}
                                  disabled={!canCompleteTask(task)}
                                  aria-label={task.status === 'done' ? 'Reabrir tarefa' : 'Concluir tarefa'}
                                >
                                  {task.status === 'done' ? '✓' : ''}
                                </button>
                                <div className={styles.taskTitleCell}>
                                  <input
                                    className={styles.taskTitleInput}
                                    defaultValue={task.title}
                                    disabled={!canEditTasks || inlineSavingTaskId === task.id}
                                    onClick={(event) => event.stopPropagation()}
                                    onBlur={(event) => handleInlineTaskUpdate(task, { title: event.target.value })}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') event.currentTarget.blur();
                                      if (event.key === 'Escape') event.currentTarget.value = task.title;
                                    }}
                                    aria-label="Nome da tarefa"
                                  />
                                  <span className={styles.taskStatus}>{statusLabel(task.status)}</span>
                                </div>
                                <span className={styles.taskMeta} onClick={(event) => event.stopPropagation()}>
                                  {canEditTasks ? (
                                    <UserPicker
                                      className={styles.userPickerInline}
                                      users={Array.isArray(userDirectory) ? userDirectory : []}
                                      value={task.assigneeUserId || ''}
                                      disabled={inlineSavingTaskId === task.id}
                                      onChange={(userId) => handleInlineTaskUpdate(task, { assigneeUserId: userId })}
                                    />
                                  ) : assignee ? (
                                    <UserHoverCard user={assignee} placement="right">
                                      <span className={styles.taskAssignee}>
                                        <span className={styles.taskAssigneeAvatar}>
                                          {assignee.avatarUrl ? <img src={assignee.avatarUrl} alt="" /> : initials(assignee.name)}
                                        </span>
                                        <span className={styles.taskAssigneeName}>{assignee.name}</span>
                                      </span>
                                    </UserHoverCard>
                                  ) : (
                                    <span className={styles.taskAssigneeEmpty}>
                                      <span className={styles.taskAssigneeAvatar}>NA</span>
                                      <span>Sem responsável</span>
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`${styles.taskDue} ${
                                    duePicker?.taskId === task.id ? styles.taskDueActive : ''
                                  }`.trim()}
                                >
                                  {canEditTasks ? (
                                    <>
                                      <button
                                        type="button"
                                        className={styles.inlineDate}
                                        disabled={inlineSavingTaskId === task.id}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDuePicker(task);
                                        }}
                                      >
                                        {formatDateInput(task.dueDate) || 'Sem prazo'}
                                      </button>
                                      {renderDuePicker(task)}
                                    </>
                                  ) : (
                                    formatDate(task.dueDate)
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className={`${styles.noteButton} ${
                                    task.description ? styles.noteButtonActive : ''
                                  }`.trim()}
                                  onClick={() => openTask(task)}
                                >
                                  {task.description ? 'Notas' : 'Abrir'}
                                </button>
                              </div>
                            );
                          })
                        : null}
                      </article>
                    );
                  })}
                </section>
              </section>

              <section className={styles.activityPanel}>
                <header className={styles.activityHeader}>
                  <h2>Atividade</h2>
                  <span>{projectEvents.length}</span>
                </header>
                {projectEvents.length === 0 ? (
                  <div className={styles.emptyActivity}>Sem atividades registradas.</div>
                ) : (
                  <div className={styles.activityList}>
                    {projectEvents.slice(0, 8).map((event) => (
                      <article key={event.id} className={styles.activityItem}>
                        <span className={styles.activityDot} aria-hidden="true" />
                        <div>
                          <p>
                            <strong>{event.actorName || 'Sistema'}</strong>
                            <span>{event.summary}</span>
                          </p>
                          <time>{formatEventTime(event.createdAt)}</time>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {deleteConfirmOpen && selectedProject ? (
        <div className={styles.confirmOverlay} onClick={() => !deleteBusy && setDeleteConfirmOpen(false)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar exclusão do projeto"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.confirmHeader}>
              <h2>Excluir projeto</h2>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteBusy}
                aria-label="Fechar confirmação"
              >
                ×
              </button>
            </header>
            <div className={styles.confirmBody}>
              <p>
                Você está prestes a excluir <strong>{selectedProject.name}</strong>.
              </p>
              <p>Essa ação remove tarefas, comentários e estrutura vinculada ao projeto.</p>
            </div>
            <footer className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
                onClick={handleDeleteProject}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {memberRemoveTarget ? (
        <div className={styles.confirmOverlay} onClick={() => !memberRemovingId && setMemberRemoveTarget(null)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar remoção de membro"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.confirmHeader}>
              <h2>Remover membro</h2>
              <button
                type="button"
                onClick={() => setMemberRemoveTarget(null)}
                disabled={Boolean(memberRemovingId)}
                aria-label="Fechar confirmação"
              >
                ×
              </button>
            </header>
            <div className={styles.confirmBody}>
              <p>
                Você está prestes a remover <strong>{memberRemoveTarget.userName}</strong> deste projeto.
              </p>
              <p>As tarefas atribuídas a essa pessoa não serão excluídas.</p>
            </div>
            <footer className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setMemberRemoveTarget(null)}
                disabled={Boolean(memberRemovingId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
                onClick={confirmRemoveMember}
                disabled={Boolean(memberRemovingId)}
              >
                {memberRemovingId ? 'Removendo...' : 'Remover membro'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {sectionDeleteTarget ? (
        <div className={styles.confirmOverlay} onClick={() => !sectionDeletingId && setSectionDeleteTarget(null)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar exclusão da seção"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.confirmHeader}>
              <h2>Excluir seção</h2>
              <button
                type="button"
                onClick={() => setSectionDeleteTarget(null)}
                disabled={Boolean(sectionDeletingId)}
                aria-label="Fechar confirmação"
              >
                ×
              </button>
            </header>
            <div className={styles.confirmBody}>
              <p>
                Você está prestes a excluir <strong>{sectionDeleteTarget.name}</strong>.
              </p>
              {sectionDeleteTarget.taskCount > 0 ? (
                <p>
                  Esta seção possui <strong>{sectionDeleteTarget.taskCount} tarefa(s)</strong>. Ao confirmar, as tarefas, comentários e colaboradores vinculados também serão removidos.
                </p>
              ) : (
                <p>Esta seção está vazia e será removida do projeto.</p>
              )}
            </div>
            <footer className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setSectionDeleteTarget(null)}
                disabled={Boolean(sectionDeletingId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
                onClick={() => confirmDeleteSection({ deleteTasks: sectionDeleteTarget.taskCount > 0 })}
                disabled={Boolean(sectionDeletingId)}
              >
                {sectionDeletingId ? 'Excluindo...' : sectionDeleteTarget.taskCount > 0 ? 'Excluir seção e tarefas' : 'Excluir seção'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedTask ? (
        <div className={styles.taskOverlay} onClick={() => setSelectedTask(null)}>
          <section
            className={styles.taskModal}
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da tarefa"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.taskModalHeader}>
              <div>
                <span>{selectedTask.projectName || selectedProject?.name || 'Projeto'}</span>
                <input
                  value={selectedTask.title || ''}
                  onChange={(event) => setSelectedTask((prev) => ({ ...prev, title: event.target.value }))}
                  onBlur={handleTitleBlur}
                  disabled={!canEditTasks}
                  aria-label="Título da tarefa"
                />
                <div className={styles.taskModalMeta}>
                  <small>{sections.find((section) => section.id === selectedTask.sectionId)?.name || 'Sem seção'}</small>
                  <small>{statusLabel(selectedTask.status)}</small>
                  <small>{selectedTask.assigneeName || 'Sem responsável'}</small>
                  <small>{formatDate(selectedTask.dueDate)}</small>
                </div>
              </div>
              <div className={styles.taskModalActions}>
                <button
                  type="button"
                  className={styles.taskCompleteButton}
                  onClick={() => handleToggleTask(selectedTask)}
                  disabled={!canCompleteTask(selectedTask) || taskSaving}
                >
                  {selectedTask.status === 'done' ? 'Reabrir' : 'Concluir'}
                </button>
                {canEditTasks ? (
                  <button
                    type="button"
                    className={styles.taskHeaderDeleteButton}
                    onClick={handleDeleteSelectedTask}
                    disabled={taskSaving}
                  >
                    Excluir
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.taskCloseButton}
                  onClick={() => setSelectedTask(null)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </header>

            <div className={styles.taskModalGrid}>
              <main className={styles.taskModalMain}>
                <section className={styles.taskSection}>
                  <div className={styles.taskSectionHeader}>
                    <h3>Descrição</h3>
                  </div>
                  <label className={styles.taskField}>
                    <textarea
                      value={selectedTask.description || ''}
                      onChange={(event) => setSelectedTask((prev) => ({ ...prev, description: event.target.value }))}
                      onBlur={(event) => handleUpdateSelectedTask({ description: event.target.value })}
                      disabled={!canEditTasks}
                      placeholder="Descreva o contexto, combinados e próximos passos..."
                    />
                  </label>
                </section>

                <section className={`${styles.taskSection} ${styles.subtasks}`}>
                  <div className={styles.taskSectionHeader}>
                    <h3>Subtarefas</h3>
                    <small>{selectedSubtasks.length}</small>
                  </div>
                  {selectedSubtasks.length === 0 ? (
                    <div className={styles.emptyInline}>Sem subtarefas.</div>
                  ) : (
                    <div className={styles.subtaskList}>
                      {selectedSubtasks.map((subtask) => (
                        <article key={subtask.id} className={styles.subtaskItem}>
                          <button
                            type="button"
                            className={styles.check}
                            onClick={() => handleToggleTask(subtask)}
                            disabled={!canCompleteTask(subtask)}
                            aria-label={subtask.status === 'done' ? 'Reabrir subtarefa' : 'Concluir subtarefa'}
                          >
                            {subtask.status === 'done' ? '✓' : ''}
                          </button>
                          <div className={styles.subtaskContent}>
                            <span>{subtask.title}</span>
                            {subtask.assigneeName ? (
                              <UserHoverCard user={resolveTaskUser(subtask.assigneeUserId, subtask.assigneeName)} placement="left">
                                <span className={styles.subtaskMeta}>
                                  <AssigneeAvatar
                                    name={subtask.assigneeName}
                                    avatarUrl={resolveTaskUser(subtask.assigneeUserId, subtask.assigneeName)?.avatarUrl || ''}
                                  />
                                  <small>{subtask.assigneeName}</small>
                                </span>
                              </UserHoverCard>
                            ) : (
                              <small>Sem responsável</small>
                            )}
                          </div>
                          <small className={styles.subtaskStatus}>{statusLabel(subtask.status)}</small>
                        </article>
                      ))}
                    </div>
                  )}
                  {canCreateTasks ? (
                  <form className={styles.subtaskForm} onSubmit={handleCreateSubtask}>
                    <input
                      value={subtaskTitle}
                      onChange={(event) => setSubtaskTitle(event.target.value)}
                      placeholder="Adicionar subtarefa"
                    />
                    <button type="submit" disabled={creatingSubtask || !subtaskTitle.trim()}>
                      Criar
                    </button>
                  </form>
                  ) : null}
                </section>

                <section className={`${styles.taskSection} ${styles.comments}`}>
                  <div className={styles.taskSectionHeader}>
                    <h3>Comentários</h3>
                    <small>{taskComments.length}</small>
                  </div>
                  {commentsLoading ? (
                    <StateBlock variant="loading" compact title="Carregando comentários" />
                  ) : taskComments.length === 0 ? (
                    <div className={styles.emptyInline}>Sem comentários.</div>
                  ) : (
                    taskComments.map((comment) => (
                      <article key={comment.id} className={styles.comment}>
                        <div className={styles.commentHeader}>
                          <UserHoverCard user={resolveTaskUser(comment.userId, comment.userName)} placement="left">
                            <div className={styles.commentAuthor}>
                              <AssigneeAvatar
                                name={comment.userName}
                                avatarUrl={resolveTaskUser(comment.userId, comment.userName)?.avatarUrl || ''}
                              />
                              <strong>{comment.userName}</strong>
                            </div>
                          </UserHoverCard>
                          <time>{formatEventTime(comment.createdAt)}</time>
                        </div>
                        <p>{comment.body}</p>
                      </article>
                    ))
                  )}
                  {canCommentTasks ? (
                  <form className={styles.commentForm} onSubmit={handleSubmitComment}>
                    <textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder="Adicionar comentário"
                      rows={3}
                    />
                    <button type="submit" disabled={!commentBody.trim()}>
                      Enviar
                    </button>
                  </form>
                  ) : null}
                </section>
              </main>

              <aside className={styles.taskAside}>
                <section className={styles.taskSummaryCard}>
                  <span>Resumo</span>
                  <strong>{statusLabel(selectedTask.status)}</strong>
                  <small>{sections.find((section) => section.id === selectedTask.sectionId)?.name || 'Sem seção'}</small>
                </section>

                <label className={styles.taskField}>
                  <span>Status</span>
                  <Select
                    className={styles.taskSelect}
                    value={selectedTask.status || 'todo'}
                    disabled={taskSaving || !canCompleteTask(selectedTask)}
                    onChange={(event) => handleUpdateSelectedTask({ status: event.target.value })}
                  >
                    <option value="todo">Aberta</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </Select>
                </label>

                <label className={styles.taskField}>
                  <span>Seção</span>
                  <Select
                    className={styles.taskSelect}
                    value={selectedTask.sectionId || ''}
                    disabled={taskSaving || !canEditTasks}
                    onChange={(event) => handleUpdateSelectedTask({ sectionId: event.target.value })}
                  >
                    <option value="" disabled>Sem seção</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </Select>
                </label>

                <label className={styles.taskField}>
                  <span>Prioridade</span>
                  <div className={styles.priorityField}>
                    <Select
                      className={styles.taskSelect}
                      value={selectedTask.priority || 'medium'}
                      disabled={taskSaving || !canEditTasks}
                      onChange={(event) => handleUpdateSelectedTask({ priority: event.target.value })}
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </Select>
                    <span className={`${styles.priorityPill} ${styles[`priority_${selectedTask.priority || 'medium'}`] || ''}`.trim()}>
                      {priorityLabel(selectedTask.priority)}
                    </span>
                  </div>
                </label>

                <label className={styles.taskField}>
                  <span>Responsável</span>
                  <UserPicker
                    className={styles.userPickerDrawer}
                    variant="drawer"
                    users={Array.isArray(userDirectory) ? userDirectory : []}
                    value={selectedTask.assigneeUserId || ''}
                    disabled={taskSaving || !canEditTasks}
                    onChange={(userId) => handleUpdateSelectedTask({ assigneeUserId: userId })}
                  />
                </label>

                <label className={styles.taskField}>
                  <span>Prazo</span>
                  <div className={styles.taskDateField}>
                    <button
                      type="button"
                      className={styles.inlineDate}
                      disabled={taskSaving || !canEditTasks}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDuePicker(selectedTask);
                      }}
                    >
                      {formatDateInput(selectedTask.dueDate) || 'Sem prazo'}
                    </button>
                    {renderDuePicker(selectedTask)}
                  </div>
                </label>

                <section className={`${styles.taskSection} ${styles.collaborators}`}>
                  <div className={styles.taskSectionHeader}>
                    <h3>Colaboradores</h3>
                    <small>{taskCollaborators.length}</small>
                  </div>
                  {collaboratorsLoading ? (
                    <StateBlock variant="loading" compact title="Carregando colaboradores" />
                  ) : taskCollaborators.length === 0 ? (
                    <div className={styles.emptyInline}>Sem colaboradores.</div>
                  ) : (
                    <div className={styles.collaboratorList}>
                      {taskCollaborators.map((entry) => (
                        <article key={entry.userId} className={styles.collaboratorItem}>
                          <UserHoverCard user={{ id: entry.userId, name: entry.userName, email: entry.userEmail, role: entry.role }} placement="top">
                            <div className={styles.collaboratorAvatar}>{initials(entry.userName)}</div>
                          </UserHoverCard>
                          <div className={styles.collaboratorContent}>
                            <UserHoverCard user={{ id: entry.userId, name: entry.userName, email: entry.userEmail, role: entry.role }} placement="top">
                              <strong>{entry.userName}</strong>
                            </UserHoverCard>
                            <small>{entry.role || 'follower'}</small>
                          </div>
                          <button
                            type="button"
                            className={styles.inlineAction}
                            onClick={() => handleRemoveCollaborator(entry.userId)}
                            disabled={collaboratorSaving || !canEditTasks}
                          >
                            Remover
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  {canEditTasks ? (
                  <form className={styles.collaboratorForm} onSubmit={handleAddCollaborator}>
                    <UserPicker
                      className={styles.userPickerDrawer}
                      variant="drawer"
                      users={collaboratorOptions}
                      value={collaboratorUserId}
                      disabled={collaboratorSaving || collaboratorsLoading || collaboratorOptions.length === 0}
                      onChange={setCollaboratorUserId}
                      placeholder="Adicionar colaborador"
                    />
                    <button type="submit" disabled={collaboratorSaving || !collaboratorUserId}>
                      Adicionar
                    </button>
                  </form>
                  ) : null}
                </section>
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}




