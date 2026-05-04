import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest, forbidden, parseJson, uuid } from '../utils/helpers.js';
import { getAccessibleClientRow, getAllowedSquads, isAdminUser } from '../utils/access.js';
import { notifyUsers } from '../utils/notifications.js';
import { hasPermission } from '../utils/permissions.js';
import {
  addProjectMembers,
  addTaskCollaborators,
  assertProjectAccess,
  assertTaskAccess,
  createTaskRecord,
  filterProjectRowsByAccess,
  logTaskEvent,
  serializeProject,
  serializeTask,
} from '../utils/projectTasks.js';

const router = Router();
router.use(requireAuth);

function clean(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  const status = clean(value);
  return ['todo', 'in_progress', 'done', 'canceled'].includes(status) ? status : 'todo';
}

function normalizePriority(value) {
  const priority = clean(value);
  return ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
}

function normalizeTemplateStatus(task = {}) {
  if (task?.done === true) return 'done';
  const status = clean(task?.status);
  return ['todo', 'in_progress', 'done', 'canceled'].includes(status) ? status : 'todo';
}


async function resolveUserIdByName(name, db = null) {
  const label = clean(name);
  if (!label) return '';
  const exec = db ? db.query.bind(db) : query;
  const result = await exec(
    `SELECT id
       FROM users
      WHERE active = 1
        AND LOWER(TRIM(name)) = LOWER(TRIM(?))
      LIMIT 1`,
    [label]
  );
  const rows = Array.isArray(result?.[0]) ? result[0] : result;
  return rows?.[0]?.id || '';
}

async function createClientProjectRecord({ client, mode, name, actorUser, db }) {
  const projectId = uuid();
  const projectName = clean(name) || `Projeto - ${client.name}`;
  const source = mode === 'template' ? 'client_template' : 'client_manual';

  await db.query(
    `INSERT INTO projects (id, name, type, client_id, squad_id, owner_user_id, created_by_user_id, source, source_id)
     VALUES (?, ?, 'client', ?, ?, ?, ?, ?, ?)`,
    [projectId, projectName, client.id, client.squad_id || null, actorUser?.id || null, actorUser?.id || null, source, client.id]
  );

  await addProjectMembers(projectId, [actorUser?.id].filter(Boolean), 'owner', db);

  const templateAssigneeUserIds = new Set();

  if (mode === 'template') {
    const [templateRows] = await db.query('SELECT sections FROM onboarding_template WHERE id = 1 LIMIT 1');
    const sections = parseJson(templateRows?.[0]?.sections, []);

    for (const [sectionIndex, section] of (Array.isArray(sections) ? sections : []).entries()) {
      const sectionId = uuid();
      const sectionName = clean(section?.sec || section?.name || section?.title) || `Seção ${sectionIndex + 1}`;
      await db.query(
        `INSERT INTO project_sections (id, project_id, name, position, source, source_id)
         VALUES (?, ?, ?, ?, 'modelo_oficial', ?)`,
        [sectionId, projectId, sectionName, sectionIndex, String(sectionIndex)]
      );

      for (const [taskIndex, task] of (section?.tasks || []).entries()) {
        const assigneeUserId = clean(task?.assigneeId) || await resolveUserIdByName(task?.assignee, db);

        if (assigneeUserId) templateAssigneeUserIds.add(assigneeUserId);

        const taskId = await createTaskRecord(
          {
            projectId,
            sectionId,
            clientId: client.id,
            title: task?.title || task?.name,
            description: task?.description || task?.notes,
            status: normalizeTemplateStatus(task),
            priority: normalizePriority(task?.priority),
            assigneeUserId,
            dueDate: task?.dueDate || '',
            position: taskIndex,
            source: 'modelo_oficial',
            sourceId: `${sectionIndex}:${taskIndex}`,
            metadata: { templateTaskId: task?.id || null, templateAssignee: task?.assignee || '' },
            notifyAssignee: false,
          },
          actorUser,
          db
        );

        for (const [subIndex, sub] of (task?.subs || task?.subtasks || []).entries()) {
          const subAssigneeUserId = clean(sub?.assigneeId) || await resolveUserIdByName(sub?.assignee, db) || assigneeUserId;

          if (subAssigneeUserId) templateAssigneeUserIds.add(subAssigneeUserId);

          await createTaskRecord(
            {
              projectId,
              sectionId,
              clientId: client.id,
              parentTaskId: taskId,
              title: sub?.title || sub?.name,
              status: normalizeTemplateStatus(sub),
              assigneeUserId: subAssigneeUserId,
              dueDate: sub?.dueDate || '',
              position: subIndex,
              source: 'modelo_oficial_subtask',
              sourceId: `${sectionIndex}:${taskIndex}:${subIndex}`,
              notifyAssignee: false,
            },
            actorUser,
            db
          );
        }
      }
    }

    const memberIds = [...templateAssigneeUserIds].filter((id) => id && id !== actorUser?.id);

    if (memberIds.length > 0) {
      await addProjectMembers(projectId, memberIds, 'member', db);
    }
  }

  await logTaskEvent(
    {
      projectId,
      actorUserId: actorUser?.id || null,
      eventType: mode === 'template' ? 'project.created_from_template' : 'project.created_blank',
      summary: mode === 'template' ? 'Projeto criado a partir do Modelo Oficial' : 'Projeto criado do zero',
      metadata: { clientId: client.id },
    },
    db
  );
  return projectId;
}

async function runWithDeadlockRetry(fn, attempts = 3) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isDeadlock = err?.code === 'ER_LOCK_DEADLOCK' || err?.errno === 1213;
      if (!isDeadlock || index === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * (index + 1)));
    }
  }
  throw lastError;
}

async function getTaskRecipients(taskId, actorUserId = '') {
  const rows = await query(
    `SELECT assignee_user_id, created_by_user_id
       FROM tasks
      WHERE id = ?
      LIMIT 1`,
    [taskId]
  );
  const task = rows[0] || {};
  const collaborators = await query(
    'SELECT user_id FROM task_collaborators WHERE task_id = ?',
    [taskId]
  );
  return [
    task.assignee_user_id,
    task.created_by_user_id,
    ...collaborators.map((row) => row.user_id),
  ].filter((id, index, list) => id && id !== actorUserId && list.indexOf(id) === index);
}

async function loadProjectDetails(projectId) {
  const sections = await query(
    `SELECT id, name, position
       FROM project_sections
      WHERE project_id = ?
      ORDER BY position ASC, created_at ASC`,
    [projectId]
  );
  const tasks = await query(
    `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
            au.name AS assignee_name, cu.name AS created_by_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_sections ps ON ps.id = t.section_id
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users au ON au.id = t.assignee_user_id
       LEFT JOIN users cu ON cu.id = t.created_by_user_id
      WHERE t.project_id = ?
      ORDER BY COALESCE(ps.position, 9999), t.parent_task_id IS NOT NULL, t.position ASC, t.created_at ASC`,
    [projectId]
  );

  const tasksBySection = new Map();
  for (const task of tasks.map(serializeTask)) {
    const key = task.sectionId || '__none__';
    if (!tasksBySection.has(key)) tasksBySection.set(key, []);
    tasksBySection.get(key).push(task);
  }

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    position: Number(section.position || 0),
    tasks: tasksBySection.get(section.id) || [],
  }));
}

async function getProjectSection(projectId, sectionId) {
  const rows = await query(
    `SELECT id, project_id, name, position
       FROM project_sections
      WHERE project_id = ? AND id = ?
      LIMIT 1`,
    [projectId, sectionId]
  );
  return rows[0] || null;
}

async function loadProjectMembers(projectId) {
  const rows = await query(
    `SELECT pm.project_id, pm.user_id, pm.role, pm.created_at, u.name AS user_name, u.email AS user_email
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY
        CASE pm.role
          WHEN 'owner' THEN 0
          WHEN 'member' THEN 1
          ELSE 2
        END,
        u.name ASC`,
    [projectId]
  );

  return rows.map((row) => ({
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    userName: row.user_name,
    userEmail: row.user_email,
    createdAt: row.created_at,
  }));
}

async function loadProjectEvents(projectId) {
  const rows = await query(
    `SELECT te.*, u.name AS actor_name
       FROM task_events te
       LEFT JOIN users u ON u.id = te.actor_user_id
      WHERE te.project_id = ?
      ORDER BY te.created_at DESC
      LIMIT 40`,
    [projectId]
  );

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id || '',
    projectId: row.project_id || '',
    actorUserId: row.actor_user_id || '',
    actorName: row.actor_name || '',
    type: row.event_type,
    summary: row.summary,
    metadata: parseJson(row.metadata_json, null),
    createdAt: row.created_at,
  }));
}

router.get('/', requirePermission('projects.view'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.*, COALESCE(p.squad_id, c.squad_id) AS squad_id,
              c.name AS client_name, s.name AS squad_name, u.name AS owner_name,
              COUNT(t.id) AS task_count,
              SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN squads s ON s.id = COALESCE(p.squad_id, c.squad_id)
         LEFT JOIN users u ON u.id = p.owner_user_id
         LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_task_id IS NULL
        WHERE p.status = 'active'
          AND COALESCE(p.source, '') <> 'client_onboarding'
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.name ASC`
    );
    res.json({ projects: filterProjectRowsByAccess(req.user, rows).map(serializeProject) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id([0-9a-fA-F-]{36})', requirePermission('projects.view'), async (req, res, next) => {
  try {
    await assertProjectAccess(req.params.id, req.user, 'projects.view');
    const rows = await query(
      `SELECT p.*, COALESCE(p.squad_id, c.squad_id) AS squad_id,
              c.name AS client_name, s.name AS squad_name, u.name AS owner_name,
              COUNT(t.id) AS task_count,
              SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN squads s ON s.id = COALESCE(p.squad_id, c.squad_id)
         LEFT JOIN users u ON u.id = p.owner_user_id
         LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_task_id IS NULL
        WHERE p.id = ?
        GROUP BY p.id
        LIMIT 1`,
      [req.params.id]
    );
    res.json({
      project: serializeProject(rows[0]),
      sections: await loadProjectDetails(req.params.id),
      members: await loadProjectMembers(req.params.id),
      events: await loadProjectEvents(req.params.id),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id([0-9a-fA-F-]{36})', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const members = await loadProjectMembers(req.params.id);

    await runWithDeadlockRetry(() => withTransaction(async (conn) => {
      const [taskRows] = await conn.query('SELECT id FROM tasks WHERE project_id = ?', [req.params.id]);
      const taskIds = taskRows.map((row) => row.id);
      if (taskIds.length > 0) {
        const placeholders = taskIds.map(() => '?').join(', ');
        await conn.query(`DELETE FROM task_collaborators WHERE task_id IN (${placeholders})`, taskIds);
        await conn.query(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`, taskIds);
        await conn.query(`DELETE FROM task_events WHERE project_id = ? OR task_id IN (${placeholders})`, [req.params.id, ...taskIds]);
        await conn.query('DELETE FROM tasks WHERE project_id = ? AND parent_task_id IS NOT NULL', [req.params.id]);
        await conn.query('DELETE FROM tasks WHERE project_id = ?', [req.params.id]);
      } else {
        await conn.query('DELETE FROM task_events WHERE project_id = ?', [req.params.id]);
      }
      await conn.query('DELETE FROM project_members WHERE project_id = ?', [req.params.id]);
      await conn.query('DELETE FROM project_sections WHERE project_id = ?', [req.params.id]);
      await conn.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    }));

    const recipientIds = members
      .map((entry) => entry.userId)
      .filter((id, index, list) => id && id !== req.user.id && list.indexOf(id) === index);
    if (recipientIds.length > 0) {
      await notifyUsers({
        ids: recipientIds,
        type: 'project.deleted',
        level: 'warning',
        title: 'Projeto removido',
        body: project.name,
        entityType: 'project',
        entityId: req.params.id,
        entityLabel: project.name,
        actionUrl: '/projetos',
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('projects.create'), async (req, res, next) => {
  try {
    const name = clean(req.body?.name);
    if (!name) throw badRequest('Nome do projeto é obrigatório');
    const id = uuid();
    await query(
      `INSERT INTO projects (id, name, description, type, squad_id, owner_user_id, created_by_user_id, source)
       VALUES (?, ?, ?, 'manual', ?, ?, ?, 'manual')`,
      [
        id,
        name,
        clean(req.body?.description) || null,
        clean(req.body?.squadId) || null,
        clean(req.body?.ownerUserId) || req.user.id,
        req.user.id,
      ]
    );
    await addProjectMembers(id, [req.user.id, clean(req.body?.ownerUserId)].filter(Boolean), 'owner');
    await logTaskEvent({
      projectId: id,
      actorUserId: req.user.id,
      eventType: 'project.created',
      summary: `Projeto criado: ${name}`,
    });
    const rows = await query('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
    res.status(201).json({ project: serializeProject(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/client/:clientId', requirePermission('projects.create'), async (req, res, next) => {
  try {
    const client = await getAccessibleClientRow(req.params.clientId, req.user, 'id, name, squad_id');
    const mode = clean(req.body?.mode) === 'blank' ? 'blank' : 'template';
    const name = clean(req.body?.name) || `Projeto - ${client.name}`;
    const existing = await query(
      `SELECT id
         FROM projects
        WHERE client_id = ?
          AND status = 'active'
          AND COALESCE(source, '') <> 'client_onboarding'
        ORDER BY created_at DESC
        LIMIT 1`,
      [client.id]
    );
    if (existing[0]?.id) {
      const rows = await query('SELECT * FROM projects WHERE id = ? LIMIT 1', [existing[0].id]);
      return res.json({ project: serializeProject(rows[0]), alreadyExists: true });
    }
    let projectId = '';
    await runWithDeadlockRetry(() => withTransaction(async (conn) => {
      await conn.query(
        `UPDATE projects
            SET client_id = NULL,
                status = CASE WHEN status = 'active' THEN 'archived' ELSE status END,
                updated_at = CURRENT_TIMESTAMP
          WHERE client_id = ?
            AND COALESCE(source, '') = 'client_onboarding'`,
        [client.id]
      );

      projectId = await createClientProjectRecord({ client, mode, name, actorUser: req.user, db: conn });
    }));
    const rows = await query('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
    return res.status(201).json({ project: serializeProject(rows[0]), mode });
  } catch (err) {
    next(err);
  }
});

router.post('/sync-client/:clientId', requirePermission('projects.create'), async (req, res) => {
  res.status(410).json({ error: 'Fluxo legado desativado. Crie o projeto manualmente pelo botão Criar projeto do cliente.' });
});

router.get('/client/:clientId', requirePermission('projects.view'), async (req, res, next) => {
  try {
    await getAccessibleClientRow(req.params.clientId, req.user, 'id, squad_id');
    const rows = await query(
      `SELECT p.*, COALESCE(p.squad_id, c.squad_id) AS squad_id,
              c.name AS client_name, s.name AS squad_name, u.name AS owner_name,
              COUNT(t.id) AS task_count,
              SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN squads s ON s.id = COALESCE(p.squad_id, c.squad_id)
         LEFT JOIN users u ON u.id = p.owner_user_id
         LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_task_id IS NULL
        WHERE p.client_id = ?
          AND p.status = 'active'
          AND COALESCE(p.source, '') <> 'client_onboarding'
        GROUP BY p.id
        LIMIT 1`,
      [req.params.clientId]
    );
    res.json({ project: serializeProject(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.get('/tasks/my/list', requirePermission('tasks.view'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
              au.name AS assignee_name, cu.name AS created_by_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_sections ps ON ps.id = t.section_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users au ON au.id = t.assignee_user_id
         LEFT JOIN users cu ON cu.id = t.created_by_user_id
        WHERE t.assignee_user_id = ?
        ORDER BY t.status = 'done', COALESCE(t.due_date, '9999-12-31') ASC, t.created_at DESC
        LIMIT 300`,
      [req.user.id]
    );
    res.json({ tasks: rows.map(serializeTask) });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:userId/projects', requirePermission('profile.view'), async (req, res, next) => {
  try {
    const targetUserId = clean(req.params.userId);
    if (!targetUserId) throw badRequest('Usuário inválido');

    const params = [targetUserId, targetUserId, targetUserId];
    let visibilityWhere = '';

    if (!isAdminUser(req.user) && !hasPermission(req.user, 'projects.view.all') && req.user.id !== targetUserId) {
      const allowedSquads = getAllowedSquads(req.user, 'projects.view.all');
      const squadPlaceholders = allowedSquads.map(() => '?').join(', ');
      const squadCondition = allowedSquads.length
        ? `COALESCE(p.squad_id, c.squad_id) IN (${squadPlaceholders})`
        : '0 = 1';

      params.push(...allowedSquads, req.user.id, req.user.id, req.user.id);
      visibilityWhere = `
        AND (
          ${squadCondition}
          OR p.created_by_user_id = ?
          OR p.owner_user_id = ?
          OR EXISTS (SELECT 1 FROM project_members pmv WHERE pmv.project_id = p.id AND pmv.user_id = ?)
        )`;
    }

    const rows = await query(
      `SELECT p.*,
              c.name AS client_name,
              s.name AS squad_name,
              ou.name AS owner_name,
              COUNT(DISTINCT t.id) AS task_count,
              COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) AS done_count
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN squads s ON s.id = p.squad_id
         LEFT JOIN users ou ON ou.id = p.owner_user_id
         LEFT JOIN tasks t ON t.project_id = p.id
        WHERE (
          p.owner_user_id = ?
          OR p.created_by_user_id = ?
          OR EXISTS (SELECT 1 FROM project_members pmt WHERE pmt.project_id = p.id AND pmt.user_id = ?)
        )
          ${visibilityWhere}
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.created_at DESC
        LIMIT 120`,
      params
    );

    res.json({ projects: rows.map(serializeProject) });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:userId/tasks', requirePermission('profile.view'), async (req, res, next) => {
  try {
    const targetUserId = clean(req.params.userId);
    if (!targetUserId) throw badRequest('Usuário inválido');

    const params = [targetUserId];
    let visibilityWhere = '';

    if (!isAdminUser(req.user) && !hasPermission(req.user, 'tasks.view.all') && req.user.id !== targetUserId) {
      const allowedSquads = getAllowedSquads(req.user, 'tasks.view.all');
      const squadPlaceholders = allowedSquads.map(() => '?').join(', ');
      const squadCondition = allowedSquads.length
        ? `COALESCE(p.squad_id, c.squad_id) IN (${squadPlaceholders})`
        : '0 = 1';

      params.push(...allowedSquads, req.user.id, req.user.id, req.user.id, req.user.id);
      visibilityWhere = `
        AND (
          ${squadCondition}
          OR p.created_by_user_id = ?
          OR t.created_by_user_id = ?
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
          OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = ?)
        )`;
    }

    const rows = await query(
      `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
              au.name AS assignee_name, cu.name AS created_by_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_sections ps ON ps.id = t.section_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users au ON au.id = t.assignee_user_id
         LEFT JOIN users cu ON cu.id = t.created_by_user_id
        WHERE t.assignee_user_id = ?
          ${visibilityWhere}
        ORDER BY t.status = 'done', COALESCE(t.due_date, '9999-12-31') ASC, t.created_at DESC
        LIMIT 200`,
      params
    );

    res.json({ tasks: rows.map(serializeTask) });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks', requirePermission('tasks.create'), async (req, res, next) => {
  try {
    const projectId = clean(req.body?.projectId);
    if (projectId) await assertProjectAccess(projectId, req.user, 'tasks.create');
    const taskId = await createTaskRecord(
      {
        projectId,
        sectionId: req.body?.sectionId,
        clientId: req.body?.clientId,
        parentTaskId: req.body?.parentTaskId,
        title: req.body?.title,
        description: req.body?.description,
        status: normalizeStatus(req.body?.status),
        priority: normalizePriority(req.body?.priority),
        assigneeUserId: req.body?.assigneeUserId,
        dueDate: req.body?.dueDate,
        source: projectId ? 'project_manual' : 'standalone',
      },
      req.user
    );
    const rows = await query(
      `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
              au.name AS assignee_name, cu.name AS created_by_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_sections ps ON ps.id = t.section_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users au ON au.id = t.assignee_user_id
         LEFT JOIN users cu ON cu.id = t.created_by_user_id
        WHERE t.id = ?`,
      [taskId]
    );
    res.status(201).json({ task: serializeTask(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id([0-9a-fA-F-]{36})/sections', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const name = clean(req.body?.name);
    if (!name) throw badRequest('Nome da seção é obrigatório');

    const positionRows = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM project_sections WHERE project_id = ?',
      [req.params.id]
    );
    const position = Number(positionRows[0]?.next_position || 0);
    const id = uuid();

    await runWithDeadlockRetry(() => withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO project_sections (id, project_id, name, position, source)
         VALUES (?, ?, ?, ?, 'manual')`,
        [id, req.params.id, name, position]
      );
      await logTaskEvent({
        projectId: req.params.id,
        actorUserId: req.user.id,
        eventType: 'project.section_created',
        summary: `Seção criada: ${name}`,
        metadata: { sectionId: id },
      }, conn);
    }));

    res.status(201).json({
      section: { id, name, position, tasks: [] },
      sections: await loadProjectDetails(req.params.id),
      project: serializeProject(project),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id([0-9a-fA-F-]{36})/sections/:sectionId([0-9a-fA-F-]{36})', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const section = await getProjectSection(req.params.id, req.params.sectionId);
    if (!section) throw badRequest('Seção não encontrada');

    const updates = [];
    const params = [];
    if (req.body?.name !== undefined) {
      const name = clean(req.body.name);
      if (!name) throw badRequest('Nome da seção é obrigatório');
      updates.push('name = ?');
      params.push(name);
    }
    if (req.body?.position !== undefined) {
      const position = Number(req.body.position);
      if (!Number.isFinite(position) || position < 0) throw badRequest('Posição inválida');
      updates.push('position = ?');
      params.push(Math.round(position));
    }

    if (updates.length > 0) {
      params.push(req.params.sectionId);
      await withTransaction(async (conn) => {
        await conn.query(
          `UPDATE project_sections
              SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = ?`,
          params
        );
        await logTaskEvent({
          projectId: req.params.id,
          actorUserId: req.user.id,
          eventType: 'project.section_updated',
          summary: `Seção atualizada: ${clean(req.body?.name) || section.name}`,
          metadata: { sectionId: req.params.sectionId },
        }, conn);
      });
    }

    res.json({
      sections: await loadProjectDetails(req.params.id),
      project: serializeProject(project),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id([0-9a-fA-F-]{36})/sections/:sectionId([0-9a-fA-F-]{36})', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const section = await getProjectSection(req.params.id, req.params.sectionId);
    if (!section) throw badRequest('Seção não encontrada');

    const deleteTasks = req.query?.deleteTasks === '1' || req.query?.deleteTasks === 'true';

    const taskRows = await query(
      'SELECT id FROM tasks WHERE project_id = ? AND section_id = ?',
      [req.params.id, req.params.sectionId]
    );

    const sectionTaskIds = taskRows.map((row) => row.id);

    if (sectionTaskIds.length > 0 && !deleteTasks) {
      throw badRequest('Esta seção possui tarefas. Confirme a exclusão das tarefas para remover a seção.');
    }

    await runWithDeadlockRetry(() => withTransaction(async (conn) => {
      if (sectionTaskIds.length > 0) {
        const childRows = await conn.query(
          `SELECT id
             FROM tasks
            WHERE project_id = ?
              AND parent_task_id IN (${sectionTaskIds.map(() => '?').join(', ')})`,
          [req.params.id, ...sectionTaskIds]
        );

        const childTaskIds = (Array.isArray(childRows?.[0]) ? childRows[0] : childRows).map((row) => row.id);
        const taskIdsToDelete = [...new Set([...childTaskIds, ...sectionTaskIds])];

        if (taskIdsToDelete.length > 0) {
          const placeholders = taskIdsToDelete.map(() => '?').join(', ');

          await conn.query(
            `DELETE FROM task_collaborators WHERE task_id IN (${placeholders})`,
            taskIdsToDelete
          );

          await conn.query(
            `DELETE FROM task_comments WHERE task_id IN (${placeholders})`,
            taskIdsToDelete
          );

          await conn.query(
            `DELETE FROM task_events WHERE task_id IN (${placeholders})`,
            taskIdsToDelete
          );

          if (childTaskIds.length > 0) {
            await conn.query(
              `DELETE FROM tasks WHERE id IN (${childTaskIds.map(() => '?').join(', ')})`,
              childTaskIds
            );
          }

          await conn.query(
            `DELETE FROM tasks WHERE id IN (${sectionTaskIds.map(() => '?').join(', ')})`,
            sectionTaskIds
          );
        }
      }

      await conn.query('DELETE FROM project_sections WHERE id = ? AND project_id = ?', [req.params.sectionId, req.params.id]);

      await logTaskEvent({
        projectId: req.params.id,
        actorUserId: req.user.id,
        eventType: 'project.section_deleted',
        summary: `Seção removida: ${section.name}`,
        metadata: { sectionId: req.params.sectionId, deletedTasks: sectionTaskIds.length },
      }, conn);
    }));

    res.json({
      sections: await loadProjectDetails(req.params.id),
      project: serializeProject(project),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id([0-9a-fA-F-]{36})/sections/order', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const sectionIds = Array.isArray(req.body?.sectionIds)
      ? req.body.sectionIds.map(clean).filter(Boolean)
      : [];
    if (sectionIds.length === 0) throw badRequest('Ordem de seções inválida');

    const placeholders = sectionIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT id FROM project_sections WHERE project_id = ? AND id IN (${placeholders})`,
      [req.params.id, ...sectionIds]
    );
    const validIds = new Set(rows.map((row) => row.id));
    if (validIds.size !== sectionIds.length) throw badRequest('A ordem contém seções inválidas');

    await runWithDeadlockRetry(() => withTransaction(async (conn) => {
      for (const [index, sectionId] of sectionIds.entries()) {
        await conn.query(
          'UPDATE project_sections SET position = ?, updated_at = NOW() WHERE id = ? AND project_id = ?',
          [index, sectionId, req.params.id]
        );
      }
      await logTaskEvent({
        projectId: req.params.id,
        actorUserId: req.user.id,
        eventType: 'project.sections_reordered',
        summary: 'Seções reordenadas',
        metadata: { sectionIds },
      }, conn);
    }));

    res.json({
      sections: await loadProjectDetails(req.params.id),
      project: serializeProject(project),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id([0-9a-fA-F-]{36})/tasks/order', requirePermission('tasks.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'tasks.edit');
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    if (groups.length === 0) throw badRequest('Ordem de tarefas inválida');

    const sectionIds = groups.map((group) => clean(group?.sectionId)).filter(Boolean);
    const taskIds = groups.flatMap((group) =>
      (Array.isArray(group?.taskIds) ? group.taskIds : []).map(clean).filter(Boolean)
    );
    if (sectionIds.length === 0 || taskIds.length === 0) throw badRequest('Ordem de tarefas inválida');

    const sectionPlaceholders = sectionIds.map(() => '?').join(', ');
    const sectionRows = await query(
      `SELECT id FROM project_sections WHERE project_id = ? AND id IN (${sectionPlaceholders})`,
      [req.params.id, ...sectionIds]
    );
    const validSectionIds = new Set(sectionRows.map((row) => row.id));
    if (validSectionIds.size !== new Set(sectionIds).size) throw badRequest('A ordem contém seções inválidas');

    const taskPlaceholders = taskIds.map(() => '?').join(', ');
    const taskRows = await query(
      `SELECT id FROM tasks WHERE project_id = ? AND parent_task_id IS NULL AND id IN (${taskPlaceholders})`,
      [req.params.id, ...taskIds]
    );
    const validTaskIds = new Set(taskRows.map((row) => row.id));
    if (validTaskIds.size !== new Set(taskIds).size) throw badRequest('A ordem contém tarefas inválidas');

    await runWithDeadlockRetry(() => withTransaction(async (conn) => {
      for (const group of groups) {
        const sectionId = clean(group?.sectionId);
        if (!validSectionIds.has(sectionId)) continue;
        const nextTaskIds = Array.isArray(group?.taskIds)
          ? group.taskIds.map(clean).filter((taskId) => validTaskIds.has(taskId))
          : [];
        for (const [index, taskId] of nextTaskIds.entries()) {
          await conn.query(
            'UPDATE tasks SET section_id = ?, position = ? WHERE id = ? AND project_id = ?',
            [sectionId, index, taskId, req.params.id]
          );
        }
      }
      await logTaskEvent({
        projectId: req.params.id,
        actorUserId: req.user.id,
        eventType: 'project.tasks_reordered',
        summary: 'Tarefas reordenadas',
        metadata: { groups },
      }, conn);
    }));

    res.json({
      sections: await loadProjectDetails(req.params.id),
      project: serializeProject(project),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/members', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const userId = clean(req.body?.userId);
    const role = ['owner', 'member', 'viewer'].includes(clean(req.body?.role)) ? clean(req.body?.role) : 'member';
    if (!userId) throw badRequest('Membro inválido');

    const users = await query('SELECT id, name FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!users[0]) throw badRequest('Usuário não encontrado');

    await withTransaction(async (conn) => {
      await addProjectMembers(req.params.id, [userId], role, conn);
      await logTaskEvent({
        projectId: req.params.id,
        actorUserId: req.user.id,
        eventType: 'project.member_added',
        summary: `Membro adicionado ao projeto: ${users[0].name}`,
        metadata: { userId, role },
      }, conn);
    });

    if (userId !== req.user.id) {
      await notifyUsers({
        ids: [userId],
        type: 'project.member_added',
        level: 'info',
        title: 'Você foi adicionado a um projeto',
        body: project.name,
        entityType: 'project',
        entityId: req.params.id,
        entityLabel: project.name,
        actionUrl: `/projetos?id=${req.params.id}`,
      });
    }

    res.status(201).json({ members: await loadProjectMembers(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', requirePermission('projects.edit'), async (req, res, next) => {
  try {
    const project = await assertProjectAccess(req.params.id, req.user, 'projects.edit');
    const userId = clean(req.params.userId);
    if (!userId) throw badRequest('Membro inválido');

    const existing = await query(
      `SELECT pm.user_id, pm.role, u.name AS user_name
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ? AND pm.user_id = ?
        LIMIT 1`,
      [req.params.id, userId]
    );
    if (!existing[0]) return res.json({ members: await loadProjectMembers(req.params.id) });
    if (existing[0].role === 'owner') throw badRequest('O proprietário do projeto não pode ser removido');

    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [req.params.id, userId]);
      await logTaskEvent({
        projectId: req.params.id,
        actorUserId: req.user.id,
        eventType: 'project.member_removed',
        summary: `Membro removido do projeto: ${existing[0].user_name}`,
        metadata: { userId },
      }, conn);
    });

    if (userId !== req.user.id) {
      await notifyUsers({
        ids: [userId],
        type: 'project.member_removed',
        level: 'warning',
        title: 'Você foi removido de um projeto',
        body: project.name,
        entityType: 'project',
        entityId: req.params.id,
        entityLabel: project.name,
        actionUrl: '/projetos',
      });
    }

    res.json({ members: await loadProjectMembers(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.patch('/tasks/:id', requireAnyPermission(['tasks.edit', 'tasks.complete.own', 'tasks.complete.any']), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.view');
    const updates = [];
    const params = [];
    const changingStatus = req.body?.status !== undefined || req.body?.done !== undefined;
    const editableFields = ['title', 'description', 'priority', 'sectionId', 'dueDate', 'assigneeUserId'];
    const changingEditableFields = editableFields.some((field) => req.body?.[field] !== undefined);
    const canEditTasks = hasPermission(req.user, 'tasks.edit');
    const canEditAllTasks = hasPermission(req.user, 'tasks.edit.all');
    let canEditThisTask = false;

    if (canEditTasks) {
      try {
        await assertTaskAccess(req.params.id, req.user, 'tasks.edit');
        canEditThisTask = true;
      } catch (err) {
        if (changingEditableFields) throw err;
      }
    }

    if (changingEditableFields) {
      if (!canEditThisTask) throw forbidden('Sem permissão para editar esta tarefa');
    }

    if (req.body?.title !== undefined) {
      const title = clean(req.body.title);
      if (!title) throw badRequest('Título da tarefa é obrigatório');
      updates.push('title = ?');
      params.push(title);
    }
    if (req.body?.description !== undefined) {
      updates.push('description = ?');
      params.push(clean(req.body.description) || null);
    }
    if (req.body?.priority !== undefined) {
      updates.push('priority = ?');
      params.push(normalizePriority(req.body.priority));
    }
    if (req.body?.sectionId !== undefined) {
      const sectionId = clean(req.body.sectionId);
      if (sectionId) {
        const section = await getProjectSection(task.project_id, sectionId);
        if (!section) throw badRequest('Seção não encontrada');
      }
      updates.push('section_id = ?');
      params.push(sectionId || null);
    }
    if (req.body?.dueDate !== undefined) {
      const dueDate = clean(req.body.dueDate);
      updates.push('due_date = ?');
      params.push(/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null);
    }
    if (req.body?.assigneeUserId !== undefined) {
      updates.push('assignee_user_id = ?');
      params.push(clean(req.body.assigneeUserId) || null);
    }
    if (changingStatus) {
      const nextStatus = req.body?.status ? normalizeStatus(req.body.status) : (req.body.done ? 'done' : 'todo');
      const ownTask = task.assignee_user_id === req.user.id || task.created_by_user_id === req.user.id;
      const canCompleteOwn = hasPermission(req.user, 'tasks.complete.own');
      const canCompleteAny = hasPermission(req.user, 'tasks.complete.any') || canEditAllTasks;
      if (!canCompleteAny && !canEditThisTask && (!ownTask || !canCompleteOwn)) {
        throw forbidden('Sem permissão para alterar o status desta tarefa');
      }
      updates.push('status = ?');
      params.push(nextStatus);
      updates.push('completed_at = ?');
      params.push(nextStatus === 'done' ? new Date() : null);
      updates.push('completed_by_user_id = ?');
      params.push(nextStatus === 'done' ? req.user.id : null);
    }

    if (updates.length === 0) return res.json({ ok: true });

    params.push(req.params.id);
    await query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);
    if (req.body?.assigneeUserId !== undefined) {
      await addTaskCollaborators(req.params.id, [clean(req.body.assigneeUserId)].filter(Boolean), 'follower');
    }
    await logTaskEvent({
      taskId: req.params.id,
      projectId: task.project_id,
      actorUserId: req.user.id,
      eventType: changingStatus ? 'task.status_changed' : 'task.updated',
      summary: changingStatus ? 'Status da tarefa atualizado' : 'Tarefa atualizada',
      metadata: req.body || {},
    });

    const recipients = await getTaskRecipients(req.params.id, req.user.id);
    if (recipients.length > 0) {
      await notifyUsers({
        ids: recipients,
        type: changingStatus ? 'task.status_changed' : 'task.updated',
        level: changingStatus && (req.body?.status === 'done' || req.body?.done) ? 'success' : 'info',
        title: changingStatus ? 'Tarefa atualizada' : 'Tarefa alterada',
        body: task.title,
        entityType: 'task',
        entityId: req.params.id,
        entityLabel: task.title,
        actionUrl: task.project_id ? `/projetos?id=${task.project_id}` : '/perfil',
      });
    }

    const rows = await query(
      `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
              au.name AS assignee_name, cu.name AS created_by_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_sections ps ON ps.id = t.section_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users au ON au.id = t.assignee_user_id
         LEFT JOIN users cu ON cu.id = t.created_by_user_id
        WHERE t.id = ?`,
      [req.params.id]
    );
    res.json({ task: serializeTask(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id', requirePermission('tasks.edit'), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.edit');
    const recipients = await getTaskRecipients(req.params.id, req.user.id);
    await withTransaction(async (conn) => {
      await logTaskEvent({
        projectId: task.project_id,
        actorUserId: req.user.id,
        eventType: 'task.deleted',
        summary: `Tarefa removida: ${task.title}`,
        metadata: { taskId: req.params.id },
      }, conn);
      await conn.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    });

    if (recipients.length > 0) {
      await notifyUsers({
        ids: recipients,
        type: 'task.deleted',
        level: 'warning',
        title: 'Tarefa removida',
        body: task.title,
        entityType: 'project',
        entityId: task.project_id,
        entityLabel: task.title,
        actionUrl: task.project_id ? `/projetos?id=${task.project_id}` : '/perfil',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/tasks/:id/comments', requirePermission('tasks.view'), async (req, res, next) => {
  try {
    await assertTaskAccess(req.params.id, req.user, 'tasks.view');
    const rows = await query(
      `SELECT tc.*, u.name AS user_name
         FROM task_comments tc
         JOIN users u ON u.id = tc.user_id
        WHERE tc.task_id = ?
        ORDER BY tc.created_at ASC`,
      [req.params.id]
    );
    res.json({
      comments: rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        userId: row.user_id,
        userName: row.user_name,
        body: row.body,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/tasks/:id/collaborators', requirePermission('tasks.view'), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.view');
    const rows = await query(
      `SELECT tc.task_id, tc.user_id, tc.role, tc.created_at, u.name AS user_name, u.email AS user_email
         FROM task_collaborators tc
         JOIN users u ON u.id = tc.user_id
        WHERE tc.task_id = ?
        ORDER BY
          CASE
            WHEN tc.user_id = ? THEN 0
            WHEN tc.user_id = ? THEN 1
            ELSE 2
          END,
          u.name ASC`,
      [req.params.id, task.assignee_user_id || '', task.created_by_user_id || '']
    );
    res.json({
      collaborators: rows.map((row) => ({
        taskId: row.task_id,
        userId: row.user_id,
        role: row.role,
        userName: row.user_name,
        userEmail: row.user_email,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks/:id/collaborators', requirePermission('tasks.edit'), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.edit');
    const userId = clean(req.body?.userId);
    const role = clean(req.body?.role) === 'creator' ? 'creator' : 'follower';
    if (!userId) throw badRequest('Colaborador inválido');

    const users = await query('SELECT id, name FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!users[0]) throw badRequest('Usuário não encontrado');

    await withTransaction(async (conn) => {
      await addTaskCollaborators(req.params.id, [userId], role, conn);
      await logTaskEvent({
        taskId: req.params.id,
        projectId: task.project_id,
        actorUserId: req.user.id,
        eventType: 'task.collaborator_added',
        summary: `Colaborador adicionado: ${users[0].name}`,
        metadata: { userId, role },
      }, conn);
    });

    if (userId !== req.user.id) {
      await notifyUsers({
        ids: [userId],
        type: 'task.collaborator_added',
        level: 'info',
        title: 'Você foi adicionado a uma tarefa',
        body: task.title,
        entityType: 'task',
        entityId: req.params.id,
        entityLabel: task.title,
        actionUrl: task.project_id ? `/projetos?id=${task.project_id}` : '/perfil',
      });
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id/collaborators/:userId', requirePermission('tasks.edit'), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.edit');
    const userId = clean(req.params.userId);
    if (!userId) throw badRequest('Colaborador inválido');

    const existing = await query(
      `SELECT tc.user_id, u.name AS user_name
         FROM task_collaborators tc
         JOIN users u ON u.id = tc.user_id
        WHERE tc.task_id = ? AND tc.user_id = ?
        LIMIT 1`,
      [req.params.id, userId]
    );
    if (!existing[0]) return res.json({ ok: true });

    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM task_collaborators WHERE task_id = ? AND user_id = ?', [req.params.id, userId]);
      await logTaskEvent({
        taskId: req.params.id,
        projectId: task.project_id,
        actorUserId: req.user.id,
        eventType: 'task.collaborator_removed',
        summary: `Colaborador removido: ${existing[0].user_name}`,
        metadata: { userId },
      }, conn);
    });

    if (userId !== req.user.id) {
      await notifyUsers({
        ids: [userId],
        type: 'task.collaborator_removed',
        level: 'warning',
        title: 'Você foi removido de uma tarefa',
        body: task.title,
        entityType: 'task',
        entityId: req.params.id,
        entityLabel: task.title,
        actionUrl: task.project_id ? `/projetos?id=${task.project_id}` : '/perfil',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks/:id/comments', requirePermission('tasks.comment'), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.comment');
    const body = clean(req.body?.body);
    if (!body) throw badRequest('Comentário não pode ser vazio');
    const id = uuid();
    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO task_comments (id, task_id, user_id, body)
         VALUES (?, ?, ?, ?)`,
        [id, req.params.id, req.user.id, body]
      );
      await addTaskCollaborators(req.params.id, [req.user.id], 'follower', conn);
      await logTaskEvent({
        taskId: req.params.id,
        projectId: task.project_id,
        actorUserId: req.user.id,
        eventType: 'task.commented',
        summary: 'Comentário adicionado',
      }, conn);
    });

    const recipients = await getTaskRecipients(req.params.id, req.user.id);
    await notifyUsers({
      ids: recipients,
      type: 'task.commented',
      level: 'info',
      title: 'Novo comentário em tarefa',
      body: task.title,
      entityType: 'task',
      entityId: req.params.id,
      entityLabel: task.title,
      actionUrl: task.project_id ? `/projetos?id=${task.project_id}` : '/perfil',
    });

    const rows = await query(
      `SELECT tc.*, u.name AS user_name
         FROM task_comments tc
         JOIN users u ON u.id = tc.user_id
        WHERE tc.id = ?
        LIMIT 1`,
      [id]
    );
    res.status(201).json({
      comment: {
        id: rows[0].id,
        taskId: rows[0].task_id,
        userId: rows[0].user_id,
        userName: rows[0].user_name,
        body: rows[0].body,
        createdAt: rows[0].created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id/comments/:commentId', requirePermission('tasks.comment'), async (req, res, next) => {
  try {
    const task = await assertTaskAccess(req.params.id, req.user, 'tasks.comment');
    const commentId = clean(req.params.commentId);
    if (!commentId) throw badRequest('Comentário inválido');

    const rows = await query(
      `SELECT id, task_id, user_id, body
         FROM task_comments
        WHERE id = ? AND task_id = ?
        LIMIT 1`,
      [commentId, req.params.id]
    );
    const comment = rows[0];
    if (!comment) return res.json({ ok: true });

    const canDelete =
      isAdminUser(req.user) ||
      hasPermission(req.user, 'tasks.comment.all') ||
      hasPermission(req.user, 'tasks.edit.all') ||
      comment.user_id === req.user?.id;

    if (!canDelete) throw forbidden('Sem permissão para excluir este comentário');

    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM task_comments WHERE id = ? AND task_id = ?', [commentId, req.params.id]);
      await logTaskEvent({
        taskId: req.params.id,
        projectId: task.project_id,
        actorUserId: req.user.id,
        eventType: 'task.comment_deleted',
        summary: 'Comentário excluído',
      }, conn);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
