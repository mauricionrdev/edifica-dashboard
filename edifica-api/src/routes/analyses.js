// ==============================================================
//  /api/clients/:clientId/analyses/:type
//  type: 'icp' | 'gdvanalise' | 'route_summary'
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

const VALID_TYPES = new Set(['icp', 'gdvanalise', 'route_summary']);

const router = Router({ mergeParams: true });
router.use(requireAuth);

let analysisAuthorSchemaPromise = null;

function serializeAnalysisAttachment(row) {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    fileName: row.file_name || 'anexo',
    mimeType: row.mime_type || '',
    sizeBytes: Number(row.size_bytes) || 0,
    dataUrl: row.data_url || '',
    createdByUserId: row.created_by_user_id || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
  };
}

function validateAttachmentPayload(body = {}) {
  const fileName = String(body.fileName || 'anexo').trim().slice(0, 180) || 'anexo';
  const mimeType = String(body.mimeType || '').trim().slice(0, 120);
  const dataUrl = String(body.dataUrl || '');
  const sizeBytes = Math.max(0, Number(body.sizeBytes) || 0);

  if (!mimeType || (!mimeType.startsWith('image/') && mimeType !== 'application/pdf')) {
    throw badRequest('Anexo inválido. Use imagem ou PDF.');
  }

  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
    throw badRequest('Arquivo inválido.');
  }

  if (sizeBytes > 8 * 1024 * 1024 || dataUrl.length > 12 * 1024 * 1024) {
    throw badRequest('Arquivo muito grande. Limite de 8MB.');
  }

  return { fileName, mimeType, dataUrl, sizeBytes };
}

async function ensureAnalysisAuthorSchema() {
  if (!analysisAuthorSchemaPromise) {
    analysisAuthorSchemaPromise = (async () => {
      const cols = await query('SHOW COLUMNS FROM analyses');
      const names = new Set(cols.map((column) => column.Field));
      const typeColumn = cols.find((column) => column.Field === 'type');
      if (typeColumn && !String(typeColumn.Type || '').includes('route_summary')) {
        await query("ALTER TABLE analyses MODIFY COLUMN type ENUM('icp','gdvanalise','route_summary') NOT NULL");
      }

      if (!names.has('created_by_user_id')) {
        await query('ALTER TABLE analyses ADD COLUMN created_by_user_id VARCHAR(64) NULL AFTER text');
      }

      if (!names.has('updated_by_user_id')) {
        await query('ALTER TABLE analyses ADD COLUMN updated_by_user_id VARCHAR(64) NULL AFTER created_by_user_id');
      }

      await query(`
        CREATE TABLE IF NOT EXISTS analysis_attachments (
          id VARCHAR(64) PRIMARY KEY,
          analysis_id VARCHAR(64) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(120) NOT NULL,
          size_bytes INT NOT NULL DEFAULT 0,
          data_url LONGTEXT NOT NULL,
          created_by_user_id VARCHAR(64) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_analysis_attachments_analysis (analysis_id),
          CONSTRAINT fk_analysis_attachments_analysis FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE,
          CONSTRAINT fk_analysis_attachments_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      analysisAuthorSchemaPromise = null;
      throw err;
    });
  }

  return analysisAuthorSchemaPromise;
}

function serializeAnalysis(row, attachments = []) {
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
    attachments,
  };
}

async function assertClientExists(clientId, user) {
  await getAccessibleClientRow(clientId, user, 'id, squad_id', 'clients.view.all');
}

function validateType(type) {
  if (!VALID_TYPES.has(type)) throw badRequest('type inválido. Use icp, gdvanalise ou route_summary');
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


async function loadAttachmentsForAnalyses(analysisIds = []) {
  if (!analysisIds.length) return new Map();
  const placeholders = analysisIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT aa.id,
            aa.analysis_id,
            aa.file_name,
            aa.mime_type,
            aa.size_bytes,
            aa.data_url,
            aa.created_by_user_id,
            u.name AS created_by_name,
            aa.created_at
       FROM analysis_attachments aa
       LEFT JOIN users u ON u.id = aa.created_by_user_id
      WHERE aa.analysis_id IN (${placeholders})
      ORDER BY aa.created_at ASC`,
    analysisIds
  );
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.analysis_id)) grouped.set(row.analysis_id, []);
    grouped.get(row.analysis_id).push(serializeAnalysisAttachment(row));
  });
  return grouped;
}

async function assertAnalysisBelongsToClient(analysisId, clientId, type) {
  const rows = await query(
    `SELECT id FROM analyses WHERE id = ? AND client_id = ? AND type = ? LIMIT 1`,
    [analysisId, clientId, type]
  );
  if (rows.length === 0) throw notFound('Análise não encontrada');
}

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
    const groupedAttachments = await loadAttachmentsForAnalyses(rows.map((row) => row.id));
    res.json({ analyses: rows.map((row) => serializeAnalysis(row, groupedAttachments.get(row.id) || [])) });
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
    res.status(201).json({ analysis: serializeAnalysis(rows[0], []) });
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
    const groupedAttachments = await loadAttachmentsForAnalyses([analysisId]);
    res.json({ analysis: serializeAnalysis(rows[0], groupedAttachments.get(analysisId) || []) });
  } catch (err) {
    next(err);
  }
});


// --------------------------------------------------------------
//  POST /api/clients/:clientId/analyses/:type/:analysisId/attachments
// --------------------------------------------------------------
router.post('/:clientId/analyses/:type/:analysisId/attachments', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureAnalysisAuthorSchema();
    const { clientId, type, analysisId } = req.params;
    validateType(type);
    await assertClientExists(clientId, req.user);
    await assertAnalysisBelongsToClient(analysisId, clientId, type);

    const payload = validateAttachmentPayload(req.body || {});
    const id = uuid();
    await query(
      `INSERT INTO analysis_attachments (id, analysis_id, file_name, mime_type, size_bytes, data_url, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, analysisId, payload.fileName, payload.mimeType, payload.sizeBytes, payload.dataUrl, req.user?.id || null]
    );

    const rows = await query(
      `SELECT aa.id,
              aa.analysis_id,
              aa.file_name,
              aa.mime_type,
              aa.size_bytes,
              aa.data_url,
              aa.created_by_user_id,
              u.name AS created_by_name,
              aa.created_at
         FROM analysis_attachments aa
         LEFT JOIN users u ON u.id = aa.created_by_user_id
        WHERE aa.id = ?`,
      [id]
    );
    res.status(201).json({ attachment: serializeAnalysisAttachment(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  DELETE /api/clients/:clientId/analyses/:type/:analysisId/attachments/:attachmentId
// --------------------------------------------------------------
router.delete('/:clientId/analyses/:type/:analysisId/attachments/:attachmentId', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureAnalysisAuthorSchema();
    const { clientId, type, analysisId, attachmentId } = req.params;
    validateType(type);
    await assertAnalysisBelongsToClient(analysisId, clientId, type);

    const result = await query(
      `DELETE FROM analysis_attachments WHERE id = ? AND analysis_id = ?`,
      [attachmentId, analysisId]
    );
    if (result.affectedRows === 0) throw notFound('Anexo não encontrado');

    res.json({ ok: true });
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
