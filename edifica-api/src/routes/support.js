import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest, uuid } from '../utils/helpers.js';
import { hasPermission } from '../utils/permissions.js';
import { createTaskRecord, serializeTask } from '../utils/projectTasks.js';

const router = Router();
router.use(requireAuth);

let supportSchemaPromise = null;
async function ensureSupportSchema() {
  if (!supportSchemaPromise) {
    supportSchemaPromise = query(`
      CREATE TABLE IF NOT EXISTS support_daily_rows (
        id VARCHAR(36) PRIMARY KEY,
        position INT NOT NULL DEFAULT 0,
        client_name VARCHAR(255) NOT NULL DEFAULT '',
        implementation_status VARCHAR(120) NOT NULL DEFAULT '',
        niche VARCHAR(120) NOT NULL DEFAULT '',
        prompt_status VARCHAR(80) NOT NULL DEFAULT '',
        connection_status VARCHAR(80) NOT NULL DEFAULT '',
        access_status VARCHAR(80) NOT NULL DEFAULT '',
        activity_status VARCHAR(80) NOT NULL DEFAULT '',
        api_key VARCHAR(255) NOT NULL DEFAULT '',
        notes TEXT NULL,
        updated_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_support_daily_position (position),
        CONSTRAINT fk_support_daily_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      supportSchemaPromise = null;
      throw err;
    });
  }
  return supportSchemaPromise;
}

function clean(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function serializeSupportRow(row = {}) {
  return {
    id: row.id,
    position: Number(row.position || 0),
    clientName: row.client_name || '',
    implementationStatus: row.implementation_status || '',
    niche: row.niche || '',
    promptStatus: row.prompt_status || '',
    connectionStatus: row.connection_status || '',
    accessStatus: row.access_status || '',
    activityStatus: row.activity_status || '',
    apiKey: row.api_key || '',
    notes: row.notes || '',
    updatedByName: row.updated_by_name || '',
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function normalizeSupportPayload(body = {}) {
  return {
    clientName: clean(body.clientName, 240),
    implementationStatus: clean(body.implementationStatus, 120),
    niche: clean(body.niche, 120),
    promptStatus: clean(body.promptStatus, 80),
    connectionStatus: clean(body.connectionStatus, 80),
    accessStatus: clean(body.accessStatus, 80),
    activityStatus: clean(body.activityStatus, 80),
    apiKey: clean(body.apiKey, 255),
    notes: clean(body.notes, 2000),
  };
}

async function resolveDefaultSupportAssignee() {
  const rows = await query(
    `SELECT id
       FROM users
      WHERE COALESCE(active, 1) = 1
        AND role IN ('suporte_tecnologia', 'ceo', 'admin')
      ORDER BY FIELD(role, 'suporte_tecnologia', 'ceo', 'admin'), name ASC
      LIMIT 1`
  );
  return rows[0]?.id || '';
}

router.get('/daily-program', requirePermission('support.view'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const rows = await query(
      `SELECT sdr.*, u.name AS updated_by_name
         FROM support_daily_rows sdr
         LEFT JOIN users u ON u.id = sdr.updated_by_user_id
        ORDER BY sdr.position ASC, sdr.created_at ASC
        LIMIT 300`
    );
    res.json({ rows: rows.map(serializeSupportRow) });
  } catch (err) {
    next(err);
  }
});

router.post('/daily-program', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const payload = normalizeSupportPayload(req.body);
    const positionRows = await query('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM support_daily_rows');
    const id = uuid();
    await query(
      `INSERT INTO support_daily_rows (
        id, position, client_name, implementation_status, niche, prompt_status,
        connection_status, access_status, activity_status, api_key, notes, updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        Number(positionRows[0]?.next_position || 1),
        payload.clientName,
        payload.implementationStatus,
        payload.niche,
        payload.promptStatus,
        payload.connectionStatus,
        payload.accessStatus,
        payload.activityStatus,
        payload.apiKey,
        payload.notes,
        req.user.id,
      ]
    );
    const rows = await query(
      `SELECT sdr.*, u.name AS updated_by_name
         FROM support_daily_rows sdr
         LEFT JOIN users u ON u.id = sdr.updated_by_user_id
        WHERE sdr.id = ?
        LIMIT 1`,
      [id]
    );
    res.status(201).json({ row: serializeSupportRow(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/daily-program/:id', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const id = clean(req.params.id, 36);
    const payload = normalizeSupportPayload(req.body);
    const fields = {
      client_name: payload.clientName,
      implementation_status: payload.implementationStatus,
      niche: payload.niche,
      prompt_status: payload.promptStatus,
      connection_status: payload.connectionStatus,
      access_status: payload.accessStatus,
      activity_status: payload.activityStatus,
      api_key: payload.apiKey,
      notes: payload.notes,
    };
    const updates = [];
    const params = [];
    for (const [column, value] of Object.entries(fields)) {
      if (req.body?.[column] !== undefined) continue;
      const camel = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      if (req.body?.[camel] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (req.body?.position !== undefined) {
      updates.push('position = ?');
      params.push(Math.max(0, Number(req.body.position) || 0));
    }
    if (!updates.length) throw badRequest('Nenhum campo para atualizar.');
    updates.push('updated_by_user_id = ?');
    params.push(req.user.id, id);
    await query(`UPDATE support_daily_rows SET ${updates.join(', ')} WHERE id = ?`, params);
    const rows = await query(
      `SELECT sdr.*, u.name AS updated_by_name
         FROM support_daily_rows sdr
         LEFT JOIN users u ON u.id = sdr.updated_by_user_id
        WHERE sdr.id = ?
        LIMIT 1`,
      [id]
    );
    res.json({ row: serializeSupportRow(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/daily-program/:id', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    await query('DELETE FROM support_daily_rows WHERE id = ?', [clean(req.params.id, 36)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/tasks', requirePermission('support.view'), async (req, res, next) => {
  try {
    const canViewAll = hasPermission(req.user, 'support.board.edit') || hasPermission(req.user, 'tasks.view.all');
    const params = [req.user.id, req.user.id];
    let where = "t.source = 'support_request'";
    if (!canViewAll) {
      where += ` AND (
        t.created_by_user_id = ?
        OR t.assignee_user_id = ?
        OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = ?)
      )`;
      params.push(req.user.id, req.user.id, req.user.id);
    }
    const rows = await query(
      `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
              au.name AS assignee_name, cu.name AS created_by_name,
              CASE
                WHEN t.assignee_user_id = ? THEN 'responsible'
                WHEN tc_profile.user_id IS NOT NULL THEN 'collaborator'
                ELSE ''
              END AS profile_relation
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_sections ps ON ps.id = t.section_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users au ON au.id = t.assignee_user_id
         LEFT JOIN users cu ON cu.id = t.created_by_user_id
         LEFT JOIN task_collaborators tc_profile ON tc_profile.task_id = t.id AND tc_profile.user_id = ?
        WHERE ${where}
        ORDER BY t.status = 'done', COALESCE(t.due_date, '9999-12-31') ASC, t.created_at DESC
        LIMIT 200`,
      params
    );
    res.json({ tasks: rows.map(serializeTask) });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks', requirePermission('support.create'), async (req, res, next) => {
  try {
    const title = clean(req.body?.title, 180);
    if (!title) throw badRequest('Informe o título da demanda.');
    const assigneeUserId = clean(req.body?.assigneeUserId, 36) || await resolveDefaultSupportAssignee();
    const taskId = await createTaskRecord(
      {
        title,
        description: req.body?.description,
        status: 'todo',
        priority: req.body?.priority,
        clientId: req.body?.clientId,
        assigneeUserId,
        dueDate: req.body?.dueDate,
        source: 'support_request',
        metadata: { supportCategory: clean(req.body?.category, 80) || 'Suporte de tecnologia' },
      },
      req.user
    );
    const rows = await query(
      `SELECT t.*, p.name AS project_name, ps.name AS section_name, c.name AS client_name,
              au.name AS assignee_name, cu.name AS created_by_name,
              CASE
                WHEN t.assignee_user_id = ? THEN 'responsible'
                WHEN tc_profile.user_id IS NOT NULL THEN 'collaborator'
                ELSE ''
              END AS profile_relation
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_sections ps ON ps.id = t.section_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users au ON au.id = t.assignee_user_id
         LEFT JOIN users cu ON cu.id = t.created_by_user_id
         LEFT JOIN task_collaborators tc_profile ON tc_profile.task_id = t.id AND tc_profile.user_id = ?
        WHERE t.id = ?
        LIMIT 1`,
      [req.user.id, req.user.id, taskId]
    );
    res.status(201).json({ task: serializeTask(rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
