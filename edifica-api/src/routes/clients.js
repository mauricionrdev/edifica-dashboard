// ==============================================================
//  /api/clients
//  Regras:
//   - Cliente não cria onboarding automaticamente.
//   - Cliente não cria projeto automaticamente.
//   - Projeto de cliente nasce somente por ação manual em Detalhes do Cliente.
//   - Atualizar status=churn seta churn_date automaticamente.
//   - goal_status é campo derivado mas persistido; atualizado pela
//     rota de métricas. Esta rota nunca o sobrescreve diretamente.
// ==============================================================
import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import {
  uuid,
  parseJson,
  toDateString,
  fromClientDate,
  parseLocaleNumber,
  badRequest,
  notFound,
  forbidden,
} from '../utils/helpers.js';
import { filterRowsBySquadAccess, getAccessibleClientRow, isAdminUser } from '../utils/access.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../utils/permissions.js';

const router = Router();
router.use(requireAuth);

function canViewFeeSchedule(user) {
  return hasPermission(user, 'clients.fee_schedule.view') || hasPermission(user, 'clients.edit');
}

function canEditFeeSchedule(user) {
  return hasPermission(user, 'clients.fee_schedule.edit') || hasPermission(user, 'clients.edit');
}

function normalizeFeeSteps(value) {
  if (value == null || value === '') return [];
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((step) => ({
      id: String(step?.id || '').trim(),
      label: String(step?.label || '').trim(),
      amount: Number(step?.amount) || 0,
      startsAt: String(step?.startsAt || step?.startDate || '').trim(),
      endsAt: String(step?.endsAt || step?.endDate || '').trim(),
      note: String(step?.note || '').trim(),
    }))
    .filter((step) => step.label || step.amount || step.startsAt || step.endsAt || step.note)
    .slice(0, 60);
}

async function ensureClientFeeStepsSchema() {
  try {
    await query('ALTER TABLE clients ADD COLUMN fee_steps_json JSON NULL');
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

const RESPONSIBLE_ROLES = {
  gestor: new Set(['gestor', 'admin', 'ceo', 'suporte_tecnologia']),
  gdvName: new Set(['gdv', 'admin', 'ceo', 'suporte_tecnologia']),
};
let responsibleSchemaPromise = null;

async function ensureResponsibleSchema() {
  if (!responsibleSchemaPromise) {
    responsibleSchemaPromise = (async () => {
      const userCols = await query('SHOW COLUMNS FROM users');
      const userNames = new Set(userCols.map((column) => column.Field));
      if (!userNames.has('secondary_roles')) {
        await query('ALTER TABLE users ADD COLUMN secondary_roles JSON NULL AFTER role');
      }
      const clientCols = await query('SHOW COLUMNS FROM clients');
      const clientNames = new Set(clientCols.map((column) => column.Field));
      if (!clientNames.has('avatar_data_url')) {
        await query('ALTER TABLE clients ADD COLUMN avatar_data_url MEDIUMTEXT NULL AFTER name');
      }
    })().catch((err) => {
      responsibleSchemaPromise = null;
      throw err;
    });
  }
  return responsibleSchemaPromise;
}

// --------------------------------------------------------------
//  Serializers
// --------------------------------------------------------------
function serializeClient(row) {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_data_url || '',
    squadId: row.squad_id,
    squadName: row.squad_name ?? null, // vem do JOIN quando disponível
    gdvName: row.gdv_name || '',
    gestor: row.gestor || '',
    status: row.status,
    goalStatus: row.goal_status || '',
    fee: Number(row.fee) || 0,
    metaLucro: Number(row.meta_lucro) || 0,
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    churnDate: toDateString(row.churn_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pickUpdatableFields(body) {
  const allowed = [
    'name',
    'squadId',
    'gdvName',
    'gestor',
    'status',
    'avatarUrl',
    'fee',
    'metaLucro',
    'startDate',
    'endDate',
  ];
  const fields = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) fields[k] = body[k];
  }
  return fields;
}

async function validateResponsibleName(field, value) {
  const name = String(value || '').trim();
  if (!name) return '';

  const roles = RESPONSIBLE_ROLES[field];
  if (!roles) return name;
  await ensureResponsibleSchema();

  const rows = await query(
    `SELECT name, role, secondary_roles
       FROM users
      WHERE active = 1
        AND name = ?
      LIMIT 1`,
    [name]
  );

  const user = rows[0];
  const secondaryRoles = parseJson(user?.secondary_roles, []);
  const hasRole = user && (roles.has(user.role) || secondaryRoles.some((role) => roles.has(role)));

  if (!hasRole) {
    throw badRequest(
      field === 'gdvName'
        ? 'Selecione um GDV ativo cadastrado na lista de usuários.'
        : 'Selecione um gestor ativo cadastrado na lista de usuários.'
    );
  }

  return user.name;
}

async function normalizeResponsibleFields(fields) {
  const next = { ...fields };
  if (fields.gestor !== undefined) {
    next.gestor = await validateResponsibleName('gestor', fields.gestor);
  }
  if (fields.gdvName !== undefined) {
    next.gdvName = await validateResponsibleName('gdvName', fields.gdvName);
  }
  return next;
}

async function assertUniqueClientName(name, excludeId = null) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return;

  const params = [cleanName];
  let sql = `
    SELECT id
      FROM clients
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
  `;

  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }

  sql += ' LIMIT 1';

  const rows = await query(sql, params);
  if (rows.length > 0) {
    throw badRequest('Já existe um cliente com esse nome.');
  }
}

// --------------------------------------------------------------
//  GET /api/clients
// --------------------------------------------------------------
router.get('/', requirePermission('clients.view'), async (req, res, next) => {
  try {
    await ensureResponsibleSchema();
    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        ORDER BY c.created_at DESC, c.name ASC`
    );
    const visible = filterRowsBySquadAccess(req.user, rows, 'clients.view.all');
    res.json({ clients: visible.map(serializeClient) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET /api/clients/:id
// --------------------------------------------------------------
router.get('/:id', requirePermission('clients.view'), async (req, res, next) => {
  try {
    await ensureResponsibleSchema();
    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        WHERE c.id = ?
        LIMIT 1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row) throw notFound('Cliente não encontrado');

    const accessible = filterRowsBySquadAccess(req.user, [row], 'clients.view.all');
    if (accessible.length === 0) throw forbidden('Sem acesso a este cliente');

    res.json({ client: serializeClient(row) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  POST /api/clients
//  Cria cliente sem onboarding/projeto automático.
// --------------------------------------------------------------
router.post('/', requirePermission('clients.create'), async (req, res, next) => {
  try {
    await ensureResponsibleSchema();
    const fields = await normalizeResponsibleFields(pickUpdatableFields(req.body || {}));
    const name = String(fields.name || '').trim();
    if (!name) throw badRequest('Informe o nome do cliente');
    await assertUniqueClientName(name);

    const id = uuid();
    const status = fields.status === 'churn' ? 'churn' : 'active';
    const churnDate = status === 'churn' ? toDateString(new Date()) : null;

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO clients (
           id, name, avatar_data_url, squad_id, gdv_name, gestor, status, goal_status,
           fee, meta_lucro, start_date, end_date, churn_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          String(fields.avatarUrl || '').trim() || null,
          fields.squadId || null,
          String(fields.gdvName || ''),
          String(fields.gestor || ''),
          status,
          '',
          parseLocaleNumber(fields.fee, 0),
          parseLocaleNumber(fields.metaLucro, 0),
          fromClientDate(fields.startDate),
          fromClientDate(fields.endDate),
          churnDate,
        ]
      );
    });

    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        WHERE c.id = ? LIMIT 1`,
      [id]
    );
    res.status(201).json({ client: serializeClient(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET/PUT /api/clients/:id/fee-steps
// --------------------------------------------------------------
router.get('/:id/fee-steps', requirePermission('clients.fee_schedule.view'), async (req, res, next) => {
  try {
    if (!canViewFeeSchedule(req.user)) throw forbidden('Sem permissão para ver evolução contratual');
    await ensureClientFeeStepsSchema();
    const current = await getAccessibleClientRow(req.params.id, req.user, 'id, fee_steps_json', 'clients.fee_schedule.view.all');
    res.json({ feeSteps: normalizeFeeSteps(current.fee_steps_json) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/fee-steps', requirePermission('clients.fee_schedule.edit'), async (req, res, next) => {
  try {
    if (!canEditFeeSchedule(req.user)) throw forbidden('Sem permissão para editar evolução contratual');
    await ensureClientFeeStepsSchema();
    await getAccessibleClientRow(req.params.id, req.user, 'id, squad_id', 'clients.fee_schedule.edit.all');
    const feeSteps = normalizeFeeSteps(req.body?.feeSteps);
    await query('UPDATE clients SET fee_steps_json = ? WHERE id = ?', [JSON.stringify(feeSteps), req.params.id]);
    res.json({ feeSteps });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  PUT /api/clients/:id
// --------------------------------------------------------------
router.put('/:id', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureResponsibleSchema();
    const { id } = req.params;
    const current = await getAccessibleClientRow(id, req.user, '*', 'clients.edit.all');

    const fields = await normalizeResponsibleFields(pickUpdatableFields(req.body || {}));
    if ((fields.fee !== undefined || fields.metaLucro !== undefined) && !canEditFeeSchedule(req.user)) {
      throw forbidden('Sem permissão para editar valores contratuais');
    }
    const updates = [];
    const params = [];

    if (fields.name !== undefined) {
      const v = String(fields.name).trim();
      if (!v) throw badRequest('Nome não pode ser vazio');
      updates.push('name = ?');
      params.push(v);
    }
    if (fields.name !== undefined) {
      await assertUniqueClientName(String(fields.name || '').trim(), id);
    }
    if (fields.avatarUrl !== undefined) {
      const cleanAvatar = String(fields.avatarUrl || '').trim();
      if (cleanAvatar && !cleanAvatar.startsWith('data:image/')) {
        throw badRequest('Imagem do cliente inválida');
      }
      updates.push('avatar_data_url = ?');
      params.push(cleanAvatar || null);
    }
    if (fields.squadId !== undefined) {
      updates.push('squad_id = ?');
      params.push(fields.squadId || null);
    }
    if (fields.gdvName !== undefined) {
      updates.push('gdv_name = ?');
      params.push(String(fields.gdvName || ''));
    }
    if (fields.gestor !== undefined) {
      updates.push('gestor = ?');
      params.push(String(fields.gestor || ''));
    }
    if (fields.status !== undefined) {
      const nextStatus = fields.status === 'churn' ? 'churn' : 'active';
      updates.push('status = ?');
      params.push(nextStatus);

      // Transição active -> churn marca churn_date; churn -> active limpa.
      if (nextStatus === 'churn' && current.status !== 'churn') {
        updates.push('churn_date = ?');
        params.push(toDateString(new Date()));
      } else if (nextStatus === 'active' && current.status === 'churn') {
        updates.push('churn_date = ?');
        params.push(null);
      }
    }
    if (fields.fee !== undefined) {
      updates.push('fee = ?');
      params.push(parseLocaleNumber(fields.fee, 0));
    }
    if (fields.metaLucro !== undefined) {
      updates.push('meta_lucro = ?');
      params.push(parseLocaleNumber(fields.metaLucro, 0));
    }
    if (fields.startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(fromClientDate(fields.startDate));
    }
    if (fields.endDate !== undefined) {
      updates.push('end_date = ?');
      params.push(fromClientDate(fields.endDate));
    }

    if (updates.length > 0) {
      params.push(id);
      await query(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        WHERE c.id = ? LIMIT 1`,
      [id]
    );
    res.json({ client: serializeClient(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  DELETE /api/clients/:id   (admin only)
// --------------------------------------------------------------
router.delete('/:id', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT id FROM clients WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) throw notFound('Cliente não encontrado');

    // FK ON DELETE CASCADE cuida de onboardings, weekly_metrics e analyses.
    await query('DELETE FROM clients WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
