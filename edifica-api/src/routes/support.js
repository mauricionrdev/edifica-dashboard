import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest, uuid } from '../utils/helpers.js';
import { hasPermission } from '../utils/permissions.js';
import { addTaskCollaborators, createTaskRecord, serializeTask } from '../utils/projectTasks.js';

const router = Router();
router.use(requireAuth);

const DEFAULT_DAILY_COLUMNS = [
  { key: 'clientName', label: 'Cliente / Escritório', width: 340, position: 1, system: true },
  { key: 'implementationStatus', label: 'Implementação', width: 230, position: 2, system: true },
  { key: 'niche', label: 'Nicho / Campanha', width: 210, position: 3, system: true },
  { key: 'promptStatus', label: 'Prompt', width: 170, position: 4, system: true },
  { key: 'connectionStatus', label: 'Conexão', width: 190, position: 5, system: true },
  { key: 'accessStatus', label: 'Acessos', width: 160, position: 6, system: true },
  { key: 'activityStatus', label: 'Status', width: 130, position: 7, system: true },
  { key: 'apiKey', label: 'API Key', width: 290, position: 8, system: true },
  { key: 'notes', label: 'Observações', width: 280, position: 9, system: true },
];

const SYSTEM_COLUMN_KEYS = new Set(DEFAULT_DAILY_COLUMNS.map((column) => column.key));

let supportSchemaPromise = null;
async function ensureSupportSchema() {
  if (!supportSchemaPromise) {
    supportSchemaPromise = (async () => {
      await query(`
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
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS support_daily_columns (
          id VARCHAR(36) PRIMARY KEY,
          column_key VARCHAR(80) NOT NULL UNIQUE,
          label VARCHAR(120) NOT NULL,
          width INT NOT NULL DEFAULT 180,
          position INT NOT NULL DEFAULT 0,
          is_system TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_support_daily_columns_position (position)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS support_daily_cell_values (
          row_id VARCHAR(36) NOT NULL,
          column_key VARCHAR(80) NOT NULL,
          value TEXT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (row_id, column_key),
          CONSTRAINT fk_support_daily_cell_row FOREIGN KEY (row_id) REFERENCES support_daily_rows(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      for (const column of DEFAULT_DAILY_COLUMNS) {
        await query(
          `INSERT INTO support_daily_columns (id, column_key, label, width, position, is_system)
           VALUES (?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE position = VALUES(position), is_system = 1`,
          [uuid(), column.key, column.label, column.width, column.position]
        );
      }
    })().catch((err) => {
      supportSchemaPromise = null;
      throw err;
    });
  }
  return supportSchemaPromise;
}

async function listDailyColumns() {
  await ensureSupportSchema();
  const rows = await query(
    `SELECT column_key, label, width, position, is_system
       FROM support_daily_columns
      ORDER BY position ASC, created_at ASC`
  );
  return rows.map((row) => ({
    key: row.column_key,
    label: row.label,
    width: Math.max(90, Math.min(640, Number(row.width || 180))),
    position: Number(row.position || 0),
    system: Boolean(row.is_system),
  }));
}

function supportColumnKey(label = '') {
  const base = String(label || 'Coluna')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42) || 'coluna';
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function serializeSupportRow(row = {}, customValues = {}) {
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
    ...customValues,
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

async function getSerializedDailyRow(id) {
  const rows = await query(
    `SELECT sdr.*, u.name AS updated_by_name
       FROM support_daily_rows sdr
       LEFT JOIN users u ON u.id = sdr.updated_by_user_id
      WHERE sdr.id = ?
      LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const values = await query('SELECT column_key, value FROM support_daily_cell_values WHERE row_id = ?', [id]);
  const custom = {};
  values.forEach((row) => { custom[row.column_key] = row.value || ''; });
  return serializeSupportRow(rows[0], custom);
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
    const columns = await listDailyColumns();
    const rows = await query(
      `SELECT sdr.*, u.name AS updated_by_name
         FROM support_daily_rows sdr
         LEFT JOIN users u ON u.id = sdr.updated_by_user_id
        ORDER BY sdr.position ASC, sdr.created_at ASC
        LIMIT 300`
    );
    const rowIds = rows.map((row) => row.id).filter(Boolean);
    const valuesByRow = new Map();
    if (rowIds.length) {
      const placeholders = rowIds.map(() => '?').join(', ');
      const values = await query(
        `SELECT row_id, column_key, value
           FROM support_daily_cell_values
          WHERE row_id IN (${placeholders})`,
        rowIds
      );
      values.forEach((valueRow) => {
        const current = valuesByRow.get(valueRow.row_id) || {};
        current[valueRow.column_key] = valueRow.value || '';
        valuesByRow.set(valueRow.row_id, current);
      });
    }
    res.json({ columns, rows: rows.map((row) => serializeSupportRow(row, valuesByRow.get(row.id) || {})) });
  } catch (err) {
    next(err);
  }
});

router.post('/daily-program/columns', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const label = clean(req.body?.label || 'Nova coluna', 80) || 'Nova coluna';
    const width = Math.max(90, Math.min(640, Number(req.body?.width || 180)));
    const positionRows = await query('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM support_daily_columns');
    const column = {
      key: supportColumnKey(label),
      label,
      width,
      position: Number(positionRows[0]?.next_position || 1),
      system: false,
    };
    await query(
      `INSERT INTO support_daily_columns (id, column_key, label, width, position, is_system)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [uuid(), column.key, column.label, column.width, column.position]
    );
    res.status(201).json({ column });
  } catch (err) {
    next(err);
  }
});

router.patch('/daily-program/columns/:key', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const key = clean(req.params.key, 80);
    const updates = [];
    const params = [];
    if (req.body?.label !== undefined) {
      updates.push('label = ?');
      params.push(clean(req.body.label, 80) || 'Coluna');
    }
    if (req.body?.width !== undefined) {
      updates.push('width = ?');
      params.push(Math.max(90, Math.min(640, Number(req.body.width || 180))));
    }
    if (req.body?.position !== undefined) {
      updates.push('position = ?');
      params.push(Math.max(0, Number(req.body.position) || 0));
    }
    if (!updates.length) throw badRequest('Nenhum campo para atualizar.');
    params.push(key);
    await query(`UPDATE support_daily_columns SET ${updates.join(', ')} WHERE column_key = ?`, params);
    const columns = await listDailyColumns();
    res.json({ column: columns.find((column) => column.key === key) || null, columns });
  } catch (err) {
    next(err);
  }
});

router.delete('/daily-program/columns/:key', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const key = clean(req.params.key, 80);
    if (SYSTEM_COLUMN_KEYS.has(key)) throw badRequest('Coluna fixa não pode ser removida.');
    await query('DELETE FROM support_daily_cell_values WHERE column_key = ?', [key]);
    await query('DELETE FROM support_daily_columns WHERE column_key = ? AND is_system = 0', [key]);
    res.json({ ok: true });
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
    res.status(201).json({ row: await getSerializedDailyRow(id) });
  } catch (err) {
    next(err);
  }
});

router.patch('/daily-program/:id', requirePermission('support.board.edit'), async (req, res, next) => {
  try {
    await ensureSupportSchema();
    const id = clean(req.params.id, 36);
    const columns = await listDailyColumns();
    const columnKeys = new Set(columns.map((column) => column.key));
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
      const camel = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      if (req.body?.[camel] !== undefined || req.body?.[column] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (req.body?.position !== undefined) {
      updates.push('position = ?');
      params.push(Math.max(0, Number(req.body.position) || 0));
    }
    if (updates.length) {
      updates.push('updated_by_user_id = ?');
      params.push(req.user.id, id);
      await query(`UPDATE support_daily_rows SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const customUpdates = Object.entries(req.body || {}).filter(([key]) => columnKeys.has(key) && !SYSTEM_COLUMN_KEYS.has(key));
    for (const [key, value] of customUpdates) {
      await query(
        `INSERT INTO support_daily_cell_values (row_id, column_key, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [id, key, clean(value, 4000)]
      );
    }
    if (!updates.length && !customUpdates.length) throw badRequest('Nenhum campo para atualizar.');
    res.json({ row: await getSerializedDailyRow(id) });
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

router.post('/tasks', requirePermission('support.view'), async (req, res, next) => {
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
    const collaboratorUserIds = Array.isArray(req.body?.collaboratorUserIds)
      ? req.body.collaboratorUserIds.map((id) => clean(id, 36)).filter(Boolean)
      : [];
    await addTaskCollaborators(taskId, collaboratorUserIds, 'follower');
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
