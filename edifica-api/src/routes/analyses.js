// ==============================================================
//  /api/clients/:clientId/analyses/:type
//  type: 'icp' | 'gdvanalise'
//
//  GET    lista entradas, mais recentes primeiro
//  POST   cria uma entrada (data + text)
//  PUT    atualiza entrada existente (/:analysisId)
//  DELETE remove entrada (/:analysisId)
// ==============================================================
import { Router } from 'express';
import { query } from '../db/pool.js';
import {
  uuid,
  toDateString,
  fromClientDate,
  badRequest,
  notFound,
} from '../utils/helpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getAccessibleClientRow } from '../utils/access.js';

const VALID_TYPES = new Set(['icp', 'gdvanalise']);

const router = Router({ mergeParams: true });
router.use(requireAuth);

let analysisAuthorSchemaPromise = null;

async function ensureAnalysisAuthorSchema() {
  if (!analysisAuthorSchemaPromise) {
    analysisAuthorSchemaPromise = (async () => {
      const cols = await query('SHOW COLUMNS FROM analyses');
      const names = new Set(cols.map((column) => column.Field));

      if (!names.has('created_by_user_id')) {
        await query('ALTER TABLE analyses ADD COLUMN created_by_user_id VARCHAR(64) NULL AFTER text');
      }

      if (!names.has('updated_by_user_id')) {
        await query('ALTER TABLE analyses ADD COLUMN updated_by_user_id VARCHAR(64) NULL AFTER created_by_user_id');
      }
    })().catch((err) => {
      analysisAuthorSchemaPromise = null;
      throw err;
    });
  }

  return analysisAuthorSchemaPromise;
}

function serializeAnalysis(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    date: toDateString(row.entry_date),
    text: row.text || '',
    createdByUserId: row.created_by_user_id || '',
    createdByName: row.created_by_name || '',
    updatedByUserId: row.updated_by_user_id || '',
    updatedByName: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertClientExists(clientId, user) {
  await getAccessibleClientRow(clientId, user, 'id, squad_id');
}

function validateType(type) {
  if (!VALID_TYPES.has(type)) throw badRequest('type inválido. Use icp ou gdvanalise');
}

const ANALYSIS_SELECT = `
  SELECT a.id,
         a.client_id,
         a.type,
         a.entry_date,
         a.text,
         a.created_by_user_id,
         created_user.name AS created_by_name,
         a.updated_by_user_id,
         updated_user.name AS updated_by_name,
         a.created_at,
         a.updated_at
    FROM analyses a
    LEFT JOIN users created_user ON created_user.id = a.created_by_user_id
    LEFT JOIN users updated_user ON updated_user.id = a.updated_by_user_id
`;

// --------------------------------------------------------------
//  GET /api/clients/:clientId/analyses/:type
// --------------------------------------------------------------
router.get('/:clientId/analyses/:type', requirePermission('clients.view'), async (req, res, next) => {
  try {
    await ensureAnalysisAuthorSchema();
    const { clientId, type } = req.params;
    validateType(type);
    await assertClientExists(clientId, req.user);

    const rows = await query(
      `${ANALYSIS_SELECT}
        WHERE a.client_id = ? AND a.type = ?
        ORDER BY a.entry_date DESC, a.created_at DESC`,
      [clientId, type]
    );
    res.json({ analyses: rows.map(serializeAnalysis) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  POST /api/clients/:clientId/analyses/:type
// --------------------------------------------------------------
router.post('/:clientId/analyses/:type', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureAnalysisAuthorSchema();
    const { clientId, type } = req.params;
    validateType(type);
    await assertClientExists(clientId, req.user);

    const body = req.body || {};
    const entryDate =
      fromClientDate(body.date) || toDateString(new Date());
    const text = String(body.text || '');
    const actorId = req.user?.id || null;

    const id = uuid();
    await query(
      `INSERT INTO analyses (id, client_id, type, entry_date, text, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, clientId, type, entryDate, text, actorId, actorId]
    );

    const rows = await query(`${ANALYSIS_SELECT} WHERE a.id = ?`, [id]);
    res.status(201).json({ analysis: serializeAnalysis(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  PUT /api/clients/:clientId/analyses/:type/:analysisId
// --------------------------------------------------------------
router.put('/:clientId/analyses/:type/:analysisId', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureAnalysisAuthorSchema();
    const { clientId, type, analysisId } = req.params;
    validateType(type);

    const existing = await query(
      `SELECT id FROM analyses
        WHERE id = ? AND client_id = ? AND type = ? LIMIT 1`,
      [analysisId, clientId, type]
    );
    if (existing.length === 0) throw notFound('Análise não encontrada');

    const body = req.body || {};
    const updates = [];
    const params = [];

    if (body.date !== undefined) {
      const d = fromClientDate(body.date);
      if (!d) throw badRequest('Data inválida (esperado YYYY-MM-DD)');
      updates.push('entry_date = ?');
      params.push(d);
    }
    if (body.text !== undefined) {
      updates.push('text = ?');
      params.push(String(body.text || ''));
    }
    if (updates.length === 0) {
      return res.json({ ok: true });
    }

    updates.push('updated_by_user_id = ?');
    params.push(req.user?.id || null);

    params.push(analysisId);
    await query(`UPDATE analyses SET ${updates.join(', ')} WHERE id = ?`, params);

    const rows = await query(`${ANALYSIS_SELECT} WHERE a.id = ?`, [analysisId]);
    res.json({ analysis: serializeAnalysis(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  DELETE /api/clients/:clientId/analyses/:type/:analysisId
// --------------------------------------------------------------
router.delete('/:clientId/analyses/:type/:analysisId', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureAnalysisAuthorSchema();
    const { clientId, type, analysisId } = req.params;
    validateType(type);

    const result = await query(
      `DELETE FROM analyses WHERE id = ? AND client_id = ? AND type = ?`,
      [analysisId, clientId, type]
    );
    if (result.affectedRows === 0) throw notFound('Análise não encontrada');

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
