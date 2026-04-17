// ==============================================================
//  /api/metrics
//  period_key formato: 'YYYY-MM-Sw'  (ex: '2026-04-S2')
//
//  GET /api/metrics/:clientId                  todos os períodos
//  GET /api/metrics/:clientId/:periodKey       uma semana específica
//  PUT /api/metrics/:clientId/:periodKey       upsert + recalcula goal_status
// ==============================================================
import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import {
  uuid,
  parseJson,
  badRequest,
  notFound,
} from '../utils/helpers.js';
import {
  PERIOD_KEY_RE,
  computeWeeklyMetrics,
  deriveWeekStatus,
  aggregateGoalStatus,
} from '../utils/domain.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// --------------------------------------------------------------
//  Helpers
// --------------------------------------------------------------
function serializeMetric(row) {
  const data = parseJson(row.data, {});
  const computed = computeWeeklyMetrics(data);
  return {
    id: row.id,
    clientId: row.client_id,
    periodKey: row.period_key,
    data,
    computed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertClientExists(clientId) {
  const rows = await query('SELECT id FROM clients WHERE id = ? LIMIT 1', [clientId]);
  if (rows.length === 0) throw notFound('Cliente não encontrado');
}

/**
 * Recalcula o goal_status agregado do cliente a partir das 4 semanas
 * do mês do periodKey atualizado. Fiel ao autoGS do protótipo:
 *   - hasVai e !hasNao → 'vai'
 *   - hasNao          → 'nao'
 *   - senão           → ''
 */
async function recalcGoalStatus(conn, clientId, periodKey) {
  const monthPrefix = periodKey.slice(0, 7); // 'YYYY-MM'
  const [rows] = await conn.query(
    `SELECT period_key, data
       FROM weekly_metrics
      WHERE client_id = ?
        AND period_key LIKE ?`,
    [clientId, `${monthPrefix}-S%`]
  );

  const weekStatuses = {};
  for (const r of rows) {
    const d = parseJson(r.data, {});
    // Se weekStatus foi explicitamente setado pelo usuário, respeita.
    // Senão, deriva do cálculo.
    const ws = d.weekStatus || deriveWeekStatus(d);
    if (ws) weekStatuses[r.period_key] = ws;
  }

  const goalStatus = aggregateGoalStatus(weekStatuses);
  await conn.query('UPDATE clients SET goal_status = ? WHERE id = ?', [
    goalStatus,
    clientId,
  ]);
  return goalStatus;
}

// --------------------------------------------------------------
//  GET /api/metrics/:clientId
// --------------------------------------------------------------
router.get('/:clientId', async (req, res, next) => {
  try {
    const { clientId } = req.params;
    await assertClientExists(clientId);

    const rows = await query(
      `SELECT id, client_id, period_key, data, created_at, updated_at
         FROM weekly_metrics
        WHERE client_id = ?
        ORDER BY period_key ASC`,
      [clientId]
    );
    res.json({ metrics: rows.map(serializeMetric) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET /api/metrics/:clientId/:periodKey
// --------------------------------------------------------------
router.get('/:clientId/:periodKey', async (req, res, next) => {
  try {
    const { clientId, periodKey } = req.params;
    if (!PERIOD_KEY_RE.test(periodKey)) {
      throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    }
    await assertClientExists(clientId);

    const rows = await query(
      `SELECT id, client_id, period_key, data, created_at, updated_at
         FROM weekly_metrics
        WHERE client_id = ? AND period_key = ?
        LIMIT 1`,
      [clientId, periodKey]
    );

    if (rows.length === 0) {
      // Sem dados ainda: devolve um "esqueleto" para o frontend renderizar
      // a tela vazia sem precisar de tratamento especial.
      return res.json({
        metric: {
          id: null,
          clientId,
          periodKey,
          data: {},
          computed: computeWeeklyMetrics({}),
          createdAt: null,
          updatedAt: null,
        },
      });
    }
    res.json({ metric: serializeMetric(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  PUT /api/metrics/:clientId/:periodKey
// --------------------------------------------------------------
router.put('/:clientId/:periodKey', async (req, res, next) => {
  try {
    const { clientId, periodKey } = req.params;
    if (!PERIOD_KEY_RE.test(periodKey)) {
      throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    }
    await assertClientExists(clientId);

    const incomingData = (req.body && req.body.data) || {};
    if (typeof incomingData !== 'object' || Array.isArray(incomingData)) {
      throw badRequest('data deve ser um objeto');
    }

    const result = await withTransaction(async (conn) => {
      // Merge com o que já existe (upsert incremental).
      const [existing] = await conn.query(
        `SELECT id, data FROM weekly_metrics
          WHERE client_id = ? AND period_key = ? LIMIT 1`,
        [clientId, periodKey]
      );

      const prev = existing.length > 0 ? parseJson(existing[0].data, {}) : {};
      const merged = { ...prev, ...incomingData };

      // Se o cliente não informou weekStatus explícito, derivamos.
      if (merged.weekStatus === undefined) {
        merged.weekStatus = deriveWeekStatus(merged);
      }

      if (existing.length > 0) {
        await conn.query(
          `UPDATE weekly_metrics
              SET data = CAST(? AS JSON)
            WHERE id = ?`,
          [JSON.stringify(merged), existing[0].id]
        );
      } else {
        await conn.query(
          `INSERT INTO weekly_metrics (id, client_id, period_key, data)
           VALUES (?, ?, ?, CAST(? AS JSON))`,
          [uuid(), clientId, periodKey, JSON.stringify(merged)]
        );
      }

      const goalStatus = await recalcGoalStatus(conn, clientId, periodKey);

      const [fresh] = await conn.query(
        `SELECT id, client_id, period_key, data, created_at, updated_at
           FROM weekly_metrics
          WHERE client_id = ? AND period_key = ? LIMIT 1`,
        [clientId, periodKey]
      );

      return {
        metric: serializeMetric(fresh[0]),
        goalStatus,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
