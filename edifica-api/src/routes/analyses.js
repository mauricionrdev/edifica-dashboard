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
import { requireAuth } from '../middleware/auth.js';

const VALID_TYPES = new Set(['icp', 'gdvanalise']);

const router = Router({ mergeParams: true });
router.use(requireAuth);

function serializeAnalysis(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    date: toDateString(row.entry_date),
    text: row.text || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertClientExists(clientId) {
  const rows = await query('SELECT id FROM clients WHERE id = ? LIMIT 1', [clientId]);
  if (rows.length === 0) throw notFound('Cliente não encontrado');
}

function validateType(type) {
  if (!VALID_TYPES.has(type)) throw badRequest('type inválido. Use icp ou gdvanalise');
}

// --------------------------------------------------------------
//  GET /api/clients/:clientId/analyses/:type
// --------------------------------------------------------------
router.get('/:clientId/analyses/:type', async (req, res, next) => {
  try {
    const { clientId, type } = req.params;
    validateType(type);
    await assertClientExists(clientId);

    const rows = await query(
      `SELECT id, client_id, type, entry_date, text, created_at, updated_at
         FROM analyses
        WHERE client_id = ? AND type = ?
        ORDER BY entry_date DESC, created_at DESC`,
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
router.post('/:clientId/analyses/:type', async (req, res, next) => {
  try {
    const { clientId, type } = req.params;
    validateType(type);
    await assertClientExists(clientId);

    const body = req.body || {};
    const entryDate =
      fromClientDate(body.date) || toDateString(new Date());
    const text = String(body.text || '');

    const id = uuid();
    await query(
      `INSERT INTO analyses (id, client_id, type, entry_date, text)
       VALUES (?, ?, ?, ?, ?)`,
      [id, clientId, type, entryDate, text]
    );

    const rows = await query(
      `SELECT id, client_id, type, entry_date, text, created_at, updated_at
         FROM analyses WHERE id = ?`,
      [id]
    );
    res.status(201).json({ analysis: serializeAnalysis(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  PUT /api/clients/:clientId/analyses/:type/:analysisId
// --------------------------------------------------------------
router.put('/:clientId/analyses/:type/:analysisId', async (req, res, next) => {
  try {
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

    params.push(analysisId);
    await query(`UPDATE analyses SET ${updates.join(', ')} WHERE id = ?`, params);

    const rows = await query(
      `SELECT id, client_id, type, entry_date, text, created_at, updated_at
         FROM analyses WHERE id = ?`,
      [analysisId]
    );
    res.json({ analysis: serializeAnalysis(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  DELETE /api/clients/:clientId/analyses/:type/:analysisId
// --------------------------------------------------------------
router.delete('/:clientId/analyses/:type/:analysisId', async (req, res, next) => {
  try {
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
