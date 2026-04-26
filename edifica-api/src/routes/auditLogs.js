import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest } from '../utils/helpers.js';
import { ensureAuditTable, serializeAuditLog } from '../utils/audit.js';

const router = Router();
router.use(requireAuth, requirePermission('audit.view'));

router.get('/', async (req, res, next) => {
  try {
    await ensureAuditTable();
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
    const action = String(req.query.action || 'all').trim();
    const entityType = String(req.query.entityType || 'all').trim();
    const params = [];
    const where = [];

    if (action !== 'all') {
      where.push('action = ?');
      params.push(action);
    }
    if (entityType !== 'all') {
      where.push('entity_type = ?');
      params.push(entityType);
    }

    const sql = `SELECT * FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ?`;
    params.push(limit);
    const rows = await query(sql, params);
    res.json({ logs: rows.map(serializeAuditLog) });
  } catch (err) {
    next(err);
  }
});

router.get('/filters', async (req, res, next) => {
  try {
    await ensureAuditTable();
    const [actions, entityTypes] = await Promise.all([
      query('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC'),
      query('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type ASC'),
    ]);
    res.json({
      actions: actions.map((row) => row.action).filter(Boolean),
      entityTypes: entityTypes.map((row) => row.entity_type).filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
