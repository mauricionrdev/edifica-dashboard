import { query } from '../db/pool.js';
import { badRequest, forbidden, notFound, parseJson, uuid } from './helpers.js';
import { filterRowsBySquadAccess, getAllowedSquads, isAdminUser } from './access.js';
import { notifyUsers } from './notifications.js';
import { ONBOARDING_TEMPLATE, instantiateOnboarding } from './domain.js';

async function exec(db, sql, params = []) {
  if (db?.query) {
    const [rows] = await db.query(sql, params);
    return rows;
  }
  return query(sql, params);
}

function clean(value) {
  return String(value || '').trim();
}

function normalizeTaskStatus(value, done = false) {
  const status = clean(value);
  if (['todo', 'in_progress', 'done', 'canceled'].includes(status)) return status;
  return done ? 'done' : 'todo';
}

function normalizePriority(value) {
  const priority = clean(value);
  return ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
}

function normalizeDate(value) {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function serializeProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type || 'manual',
    status: row.status || 'active',
    clientId: row.client_id || '',
    clientName: row.client_name || '',
    squadId: row.squad_id || '',
    squadName: row.squad_name || '',
    ownerUserId: row.owner_user_id || '',
    ownerName: row.owner_name || '',
    createdByUserId: row.created_by_user_id || '',
    taskCount: Number(row.task_count || 0),
    doneCount: Number(row.done_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function serializeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id || '',
    projectName: row.project_name || '',
    sectionId: row.section_id || '',
    sectionName: row.section_name || '',
    clientId: row.client_id || '',
    clientName: row.client_name || '',
    parentTaskId: row.parent_task_id || '',
    title: row.title,
    description: row.description || '',
    status: row.status || 'todo',
    priority: row.priority || 'medium',
    assigneeUserId: row.assignee_user_id || '',
    assigneeName: row.assignee_name || '',
    createdByUserId: row.created_by_user_id || '',
    createdByName: row.created_by_name || '',
    completedByUserId: row.completed_by_user_id || '',
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : '',
    completedAt: row.completed_at,
    position: Number(row.position || 0),
    metadata: parseJson(row.metadata_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function resolveUserIdByLabel(label, db = null) {
  const value = clean(label);
  if (!value) return '';
  const rows = await exec(
    db,
    `SELECT id
       FROM users
      WHERE active = 1
        AND (LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?))
      LIMIT 1`,
    [value, value]
  );
  return rows?.[0]?.id || '';
}

export async function assertProjectAccess(projectId, user, permission = 'projects.view') {
  const rows = await query(
    `SELECT p.*, c.name AS client_name, c.squad_id AS client_squad_id
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = ?
      LIMIT 1`,
    [projectId]
  );
  const project = rows[0];
  if (!project) throw notFound('Projeto não encontrado');
  if (isAdminUser(user)) return project;

  const allowedSquads = getAllowedSquads(user);
  const projectSquad = project.squad_id || project.client_squad_id;
  if (projectSquad && allowedSquads.includes(projectSquad)) return project;

  const members = await query(
    'SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, user.id]
  );
  if (members.length > 0) return project;
  throw forbidden('Sem acesso a este projeto');
}

export async function assertTaskAccess(taskId, user, permission = 'tasks.view') {
  const rows = await query(
    `SELECT t.*, p.squad_id AS project_squad_id, c.squad_id AS client_squad_id
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN clients c ON c.id = t.client_id
      WHERE t.id = ?
      LIMIT 1`,
    [taskId]
  );
  const task = rows[0];
  if (!task) throw notFound('Tarefa não encontrada');
  if (isAdminUser(user)) return task;
  if (task.assignee_user_id === user.id || task.created_by_user_id === user.id) return task;

  const collaborators = await query(
    'SELECT user_id FROM task_collaborators WHERE task_id = ? AND user_id = ? LIMIT 1',
    [taskId, user.id]
  );
  if (collaborators.length > 0) return task;

  const allowedSquads = getAllowedSquads(user);
  const squadId = task.project_squad_id || task.client_squad_id;
  if (squadId && allowedSquads.includes(squadId)) return task;
  throw forbidden('Sem acesso a esta tarefa');
}

export async function addTaskCollaborators(taskId, userIds = [], role = 'follower', db = null) {
  const cleanIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  for (const userId of cleanIds) {
    await exec(
      db,
      `INSERT INTO task_collaborators (task_id, user_id, role)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [taskId, userId, role]
    );
  }
}

export async function addProjectMembers(projectId, userIds = [], role = 'member', db = null) {
  const cleanIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  for (const userId of cleanIds) {
    await exec(
      db,
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role = IF(role = 'owner', role, VALUES(role))`,
      [projectId, userId, role]
    );
  }
}

export async function logTaskEvent({ taskId = null, projectId = null, actorUserId = null, eventType, summary, metadata = null }, db = null) {
  if (!eventType || !summary) return;
  await exec(
    db,
    `INSERT INTO task_events (id, task_id, project_id, actor_user_id, event_type, summary, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), taskId, projectId, actorUserId, eventType, summary, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function createTaskRecord(input, actorUser = null, db = null) {
  const title = clean(input.title);
  if (!title) throw badRequest('Título da tarefa é obrigatório');
  const id = uuid();
  const projectId = clean(input.projectId) || null;
  const sectionId = clean(input.sectionId) || null;
  const clientId = clean(input.clientId) || null;
  const assigneeUserId = clean(input.assigneeUserId) || null;
  const status = normalizeTaskStatus(input.status, input.done);
  const completedAt = status === 'done' ? new Date() : null;
  const createdByUserId = clean(input.createdByUserId) || actorUser?.id || null;

  await exec(
    db,
    `INSERT INTO tasks (
      id, project_id, section_id, client_id, parent_task_id, title, description, status, priority,
      assignee_user_id, created_by_user_id, completed_by_user_id, due_date, completed_at,
      position, source, source_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      projectId,
      sectionId,
      clientId,
      clean(input.parentTaskId) || null,
      title,
      clean(input.description) || null,
      status,
      normalizePriority(input.priority),
      assigneeUserId,
      createdByUserId,
      status === 'done' ? (clean(input.completedByUserId) || actorUser?.id || null) : null,
      normalizeDate(input.dueDate),
      completedAt,
      Number(input.position) || 0,
      clean(input.source) || null,
      clean(input.sourceId) || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );

  await addTaskCollaborators(id, [createdByUserId].filter(Boolean), 'creator', db);
  await addTaskCollaborators(id, [assigneeUserId].filter(Boolean), 'follower', db);
  await logTaskEvent(
    {
      taskId: id,
      projectId,
      actorUserId: actorUser?.id || createdByUserId,
      eventType: 'task.created',
      summary: `Tarefa criada: ${title}`,
    },
    db
  );

  if (input.notifyAssignee !== false && assigneeUserId && assigneeUserId !== actorUser?.id) {
    await notifyUsers({
      ids: [assigneeUserId],
      type: 'task.assigned',
      level: 'info',
      title: 'Nova tarefa atribuída',
      body: title,
      entityType: 'task',
      entityId: id,
      entityLabel: title,
      actionUrl: projectId ? `/projetos?id=${projectId}` : '/perfil',
      metadata: { projectId, clientId },
    });
  }

  return id;
}

export async function syncClientProjectFromOnboarding(clientId, { actorUser = null, db = null, force = false } = {}) {
  const rows = await exec(
    db,
    `SELECT c.id, c.name, c.squad_id, c.gestor, c.gdv_name, o.sections
       FROM clients c
       LEFT JOIN onboardings o ON o.client_id = c.id
      WHERE c.id = ?
      LIMIT 1`,
    [clientId]
  );
  const client = rows[0];
  if (!client) throw notFound('Cliente não encontrado');

  let onboardingSections = parseJson(client.sections, []);
  if (!Array.isArray(onboardingSections) || onboardingSections.length === 0) {
    const templateRows = await exec(db, 'SELECT sections FROM onboarding_template WHERE id = 1 LIMIT 1');
    const baseSections = templateRows.length > 0
      ? parseJson(templateRows[0].sections, ONBOARDING_TEMPLATE)
      : ONBOARDING_TEMPLATE;
    const gestorId = await resolveUserIdByLabel(client.gestor, db);
    const gdvId = await resolveUserIdByLabel(client.gdv_name, db);
    onboardingSections = instantiateOnboarding(baseSections, {
      gestor: client.gestor || '',
      gestorId,
      gdv: client.gdv_name || '',
      gdvId,
    });
    await exec(
      db,
      `INSERT INTO onboardings (client_id, sections)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE sections = VALUES(sections)`,
      [client.id, JSON.stringify(onboardingSections)]
    );
  }

  let projectRows = await exec(db, 'SELECT id FROM projects WHERE client_id = ? LIMIT 1', [clientId]);
  let projectId = projectRows?.[0]?.id || '';
  if (!projectId) {
    projectId = uuid();
    await exec(
      db,
      `INSERT INTO projects (id, name, type, client_id, squad_id, created_by_user_id, source, source_id)
       VALUES (?, ?, 'client', ?, ?, ?, 'client_onboarding', ?)`,
      [projectId, client.name, client.id, client.squad_id || null, actorUser?.id || null, client.id]
    );
  }

  await exec(
    db,
    `UPDATE projects
        SET name = ?,
            squad_id = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [client.name, client.squad_id || null, projectId]
  );

  const memberIds = new Set();
  for (const section of Array.isArray(onboardingSections) ? onboardingSections : []) {
    for (const task of section?.tasks || []) {
      const assigneeId = clean(task?.assigneeId) || await resolveUserIdByLabel(task?.assignee, db);
      if (assigneeId) memberIds.add(assigneeId);
    }
  }

  if (memberIds.size > 0) {
    await addProjectMembers(projectId, [...memberIds], 'member', db);
  }

  const existingTasks = await exec(db, 'SELECT COUNT(*) AS total FROM tasks WHERE project_id = ?', [projectId]);
  if (!force && Number(existingTasks?.[0]?.total || 0) > 0) {
    return projectId;
  }

  const sections = onboardingSections;
  for (const [sectionIndex, section] of (Array.isArray(sections) ? sections : []).entries()) {
    const sectionId = uuid();
    await exec(
      db,
      `INSERT INTO project_sections (id, project_id, name, position, source, source_id)
       VALUES (?, ?, ?, ?, 'onboarding', ?)`,
      [sectionId, projectId, clean(section?.sec) || `Seção ${sectionIndex + 1}`, sectionIndex, String(sectionIndex)]
    );

    for (const [taskIndex, task] of (section?.tasks || []).entries()) {
      const assigneeId = clean(task?.assigneeId) || await resolveUserIdByLabel(task?.assignee, db);
      if (assigneeId) memberIds.add(assigneeId);
      const taskId = await createTaskRecord(
        {
          projectId,
          sectionId,
          clientId,
          title: task?.name,
          description: task?.notes,
          status: normalizeTaskStatus(task?.status, task?.done),
          priority: task?.priority,
          assigneeUserId: assigneeId,
          dueDate: task?.dueDate,
          completedByUserId: task?.completedBy,
          position: taskIndex,
          source: 'onboarding',
          sourceId: `${sectionIndex}:${taskIndex}`,
          metadata: { legacyTaskId: task?.id || null, legacyAssignee: task?.assignee || '', subs: task?.subs || [] },
          notifyAssignee: false,
        },
        actorUser,
        db
      );

      for (const [subIndex, sub] of (task?.subs || []).entries()) {
        await createTaskRecord(
          {
            projectId,
            sectionId,
            clientId,
            parentTaskId: taskId,
            title: sub?.name,
            status: sub?.done ? 'done' : 'todo',
            assigneeUserId: assigneeId,
            position: subIndex,
            source: 'onboarding_subtask',
            sourceId: `${sectionIndex}:${taskIndex}:${subIndex}`,
            notifyAssignee: false,
          },
          actorUser,
          db
        );
      }
    }
  }

  await addProjectMembers(projectId, [...memberIds], 'member', db);
  await logTaskEvent(
    {
      projectId,
      actorUserId: actorUser?.id || null,
      eventType: 'project.synced_from_onboarding',
      summary: 'Projeto criado a partir do onboarding do cliente',
      metadata: { clientId },
    },
    db
  );
  return projectId;
}

export function filterProjectRowsByAccess(user, rows = []) {
  if (isAdminUser(user)) return rows;
  return filterRowsBySquadAccess(user, rows);
}
