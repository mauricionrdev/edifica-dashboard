import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { filterRowsBySquadAccess, getAccessibleClientRow } from '../utils/access.js';
import { uuid, fromClientDate, toDateString, badRequest, notFound } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth);

const VALID_STATUSES = new Set(['scheduled', 'completed']);

let schemaPromise = null;
async function ensureRouteMeetingSchema() {
  if (!schemaPromise) {
    schemaPromise = query(`
      CREATE TABLE IF NOT EXISTS route_meetings (
        id VARCHAR(36) PRIMARY KEY,
        client_id VARCHAR(36) NOT NULL,
        meeting_date DATE NOT NULL,
        cap_user_id VARCHAR(36) NULL,
        cap_name VARCHAR(160) NULL,
        status ENUM('scheduled','completed') NOT NULL DEFAULT 'scheduled',
        notes TEXT NULL,
        created_by_user_id VARCHAR(36) NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_route_meetings_client_date (client_id, meeting_date),
        INDEX idx_route_meetings_status_date (status, meeting_date),
        INDEX idx_route_meetings_cap_date (cap_name, meeting_date),
        CONSTRAINT fk_route_meetings_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        CONSTRAINT fk_route_meetings_cap_user FOREIGN KEY (cap_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_route_meetings_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

function normalizeStatus(value) {
  const raw = String(value || '').trim();
  return VALID_STATUSES.has(raw) ? raw : 'scheduled';
}

function normalizePayload(body = {}) {
  const clientId = String(body.clientId || body.client_id || '').trim();
  const meetingDate = fromClientDate(String(body.meetingDate || body.meeting_date || '').slice(0, 10));
  const capUserId = String(body.capUserId || body.cap_user_id || '').trim() || null;
  const capName = String(body.capName || body.cap_name || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  const status = normalizeStatus(body.status);
  const notes = String(body.notes || '').trim().slice(0, 2000);

  if (!clientId) throw badRequest('Selecione o cliente da rota.');
  if (!meetingDate) throw badRequest('Informe uma data válida para a rota.');

  return {
    clientId,
    meetingDate,
    capUserId,
    capName,
    status,
    notes,
  };
}

function serialize(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name || '',
    clientAvatarUrl: row.client_avatar_url || '',
    squadId: row.squad_id || '',
    squadName: row.squad_name || '',
    gdvName: row.gdv_name || '',
    gestor: row.gestor || '',
    meetingDate: toDateString(row.meeting_date),
    capUserId: row.cap_user_id || '',
    capName: row.cap_name || row.cap_user_name || '',
    status: row.status || 'scheduled',
    notes: row.notes || '',
    createdByUserId: row.created_by_user_id || '',
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRouteRows({ clientId = '', squadId = '', status = '', from = '', to = '' } = {}) {
  await ensureRouteMeetingSchema();

  const where = [];
  const params = [];

  if (clientId) {
    where.push('rm.client_id = ?');
    params.push(clientId);
  }

  if (squadId) {
    where.push('c.squad_id = ?');
    params.push(squadId);
  }

  if (VALID_STATUSES.has(status)) {
    where.push('rm.status = ?');
    params.push(status);
  }

  const fromDate = fromClientDate(String(from || '').slice(0, 10));
  if (fromDate) {
    where.push('rm.meeting_date >= ?');
    params.push(fromDate);
  }

  const toDate = fromClientDate(String(to || '').slice(0, 10));
  if (toDate) {
    where.push('rm.meeting_date <= ?');
    params.push(toDate);
  }

  const sql = `
    SELECT rm.*,
           c.name AS client_name,
           c.avatar_data_url AS client_avatar_url,
           c.squad_id,
           c.gdv_name,
           c.gestor,
           s.name AS squad_name,
           cap.name AS cap_user_name
      FROM route_meetings rm
      JOIN clients c ON c.id = rm.client_id
      LEFT JOIN squads s ON s.id = c.squad_id
      LEFT JOIN users cap ON cap.id = rm.cap_user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY rm.meeting_date ASC, c.name ASC
  `;

  return query(sql, params);
}

router.get('/', requirePermission('clients.view'), async (req, res, next) => {
  try {
    const rows = await getRouteRows({
      clientId: String(req.query?.clientId || '').trim(),
      squadId: String(req.query?.squadId || '').trim(),
      status: String(req.query?.status || '').trim(),
      from: String(req.query?.from || '').trim(),
      to: String(req.query?.to || '').trim(),
    });
    const visible = filterRowsBySquadAccess(req.user, rows, 'clients.view.all');
    res.json({ meetings: visible.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureRouteMeetingSchema();
    const payload = normalizePayload(req.body || {});
    await getAccessibleClientRow(payload.clientId, req.user, 'id, squad_id', 'clients.edit.all');

    const id = uuid();
    await query(
      `INSERT INTO route_meetings (id, client_id, meeting_date, cap_user_id, cap_name, status, notes, created_by_user_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${payload.status === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
      [
        id,
        payload.clientId,
        payload.meetingDate,
        payload.capUserId,
        payload.capName || null,
        payload.status,
        payload.notes || null,
        req.user?.id || null,
      ]
    );

    const rows = await getRouteRows({ clientId: payload.clientId });
    const created = rows.find((row) => row.id === id);
    res.status(201).json({ meeting: serialize(created) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureRouteMeetingSchema();
    const currentRows = await getRouteRows({});
    const current = currentRows.find((row) => String(row.id) === String(req.params.id));
    if (!current) throw notFound('Rota não encontrada.');
    await getAccessibleClientRow(current.client_id, req.user, 'id, squad_id', 'clients.edit.all');

    const nextMeetingDate = req.body?.meetingDate !== undefined
      ? fromClientDate(String(req.body.meetingDate || '').slice(0, 10))
      : toDateString(current.meeting_date);
    if (!nextMeetingDate) throw badRequest('Informe uma data válida para a rota.');

    const nextStatus = req.body?.status !== undefined ? normalizeStatus(req.body.status) : current.status;
    const nextCapUserId = req.body?.capUserId !== undefined
      ? String(req.body.capUserId || '').trim() || null
      : current.cap_user_id || null;
    const nextCapName = req.body?.capName !== undefined
      ? String(req.body.capName || '').trim().replace(/\s+/g, ' ').slice(0, 160) || null
      : current.cap_name || null;
    const nextNotes = req.body?.notes !== undefined
      ? String(req.body.notes || '').trim().slice(0, 2000) || null
      : current.notes || null;

    await query(
      `UPDATE route_meetings
          SET meeting_date = ?,
              cap_user_id = ?,
              cap_name = ?,
              status = ?,
              notes = ?,
              completed_at = CASE
                WHEN ? = 'completed' AND completed_at IS NULL THEN CURRENT_TIMESTAMP
                WHEN ? <> 'completed' THEN NULL
                ELSE completed_at
              END
        WHERE id = ?`,
      [nextMeetingDate, nextCapUserId, nextCapName, nextStatus, nextNotes, nextStatus, nextStatus, req.params.id]
    );

    const rows = await getRouteRows({ clientId: current.client_id });
    const updated = rows.find((row) => String(row.id) === String(req.params.id));
    res.json({ meeting: serialize(updated) });
  } catch (err) {
    next(err);
  }
});


router.delete('/:id', requirePermission('clients.edit'), async (req, res, next) => {
  try {
    await ensureRouteMeetingSchema();
    const currentRows = await getRouteRows({});
    const current = currentRows.find((row) => String(row.id) === String(req.params.id));
    if (!current) throw notFound('Rota não encontrada.');
    await getAccessibleClientRow(current.client_id, req.user, 'id, squad_id', 'clients.edit.all');

    await query('DELETE FROM route_meetings WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
