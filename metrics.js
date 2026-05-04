// ==============================================================
//  /api/metrics
//  [Fase 2]:
//    - PUT valida e aceita `data.metaSemanal` (número >= 0)
//    - /summary faz JOIN com clients.meta_lucro para usar como
//      fallback em resolveWeekGoal()
//    - recalcGoalStatus passa clientMetaLucro para deriveWeekStatus
// ==============================================================
import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import {
  uuid,
  parseJson,
  parseLocaleNumber,
  badRequest,
  notFound,
} from '../utils/helpers.js';
import {
  PERIOD_KEY_RE,
  computeWeeklyMetrics,
  deriveWeekStatus,
  aggregateGoalStatus,
  monthPrefixFromDate,
  currentPeriodKey,
  previousPeriodKey,
  previousMonthPrefix,
  aggregateClientSummary,
  aggregatePortfolioSummary,
} from '../utils/domain.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getAccessibleClientRow, getAllowedSquads } from '../utils/access.js';

const router = Router();
router.use(requireAuth);
let metricPresenceInitPromise = null;
const PRESENCE_TTL_SECONDS = 18;

// Campos aceitos no payload `data` do PUT. Qualquer outra chave é
// silenciosamente ignorada (defesa contra injeção no JSON).
const ALLOWED_METRIC_FIELDS = new Set([
  'investimento',
  'cpl',
  'volume',
  'fechados',
  'metaLucro',    // legado
  'metaSemanal',  // NOVO Fase 2
  'metaEmpate',
  'metaVolume',
  'metaCpl',
  'weekStatus',   // 'vai' | 'nao' | ''
  'observacoes',  // até 2000 chars
]);

async function ensureMetricPresenceSchema() {
  if (!metricPresenceInitPromise) {
    metricPresenceInitPromise = query(`
      CREATE TABLE IF NOT EXISTS metric_edit_presence (
        client_id CHAR(36) NOT NULL,
        period_key VARCHAR(16) NOT NULL,
        field_key VARCHAR(64) NOT NULL,
        user_id CHAR(36) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (client_id, period_key, field_key, user_id),
        KEY idx_metric_presence_lookup (client_id, period_key, updated_at),
        CONSTRAINT fk_metric_presence_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        CONSTRAINT fk_metric_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      metricPresenceInitPromise = null;
      throw err;
    });
  }
  return metricPresenceInitPromise;
}

function sanitizeMetricData(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw badRequest('data deve ser um objeto');
  }
  const clean = {};
  for (const key of Object.keys(incoming)) {
    if (!ALLOWED_METRIC_FIELDS.has(key)) continue;
    const v = incoming[key];
    if (key === 'weekStatus') {
      if (v === 'vai' || v === 'nao' || v === '' || v === undefined) {
        clean[key] = v || '';
      } else {
        throw badRequest('weekStatus deve ser "vai", "nao" ou ""');
      }
    } else if (key === 'observacoes') {
      const s = v == null ? '' : String(v);
      if (s.length > 2000) throw badRequest('observacoes muito longas (max 2000)');
      clean[key] = s;
    } else {
      if (v === '' || v === null || v === undefined) continue;
      const n = parseLocaleNumber(v);
      if (Number.isNaN(n)) continue;
      if (n < 0) throw badRequest(`${key} não pode ser negativo`);
      clean[key] = n;
    }
  }
  return clean;
}


function parseClientDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthBoundsFromPrefix(prefix) {
  const [yearRaw, monthRaw] = String(prefix || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function startedOnOrBefore(row, date) {
  const source = row?.start_date || row?.created_at;
  const start = parseClientDate(source);
  if (!start) return row?.status === 'active';
  return start <= date;
}

function churnedOnOrBefore(row, date) {
  const churn = parseClientDate(row?.churn_date);
  return Boolean(churn && churn <= date);
}

function activeAt(row, date) {
  return row?.status === 'active' && startedOnOrBefore(row, date) && !churnedOnOrBefore(row, date);
}

function dateInMonth(value, monthPrefix) {
  const date = parseClientDate(value);
  if (!date) return false;
  const prefix = date.toISOString().slice(0, 7);
  return prefix === monthPrefix;
}

const CHURN_TARGET_RATE = 8;

function performanceScore({ mrr, metaIndex, churnRate, activeClients }) {
  const safeMrr = Math.max(0, Number(mrr) || 0);
  const safeMeta = Math.max(0, Number(metaIndex) || 0);
  const safeChurn = Math.max(0, Number(churnRate) || 0);
  const safeActive = Math.max(0, Number(activeClients) || 0);
  if (safeMrr <= 0 || safeActive <= 0 || safeMeta <= 0) return 0;
  return Math.round(safeMrr * (safeMeta / 100) * Math.max(0, 1 - safeChurn / 100));
}

function churnRankScore(churnRate) {
  const safeChurn = Math.max(0, Number(churnRate) || 0);
  if (safeChurn <= CHURN_TARGET_RATE) {
    return 100 + (safeChurn / CHURN_TARGET_RATE) * 100;
  }
  return Math.max(0, 100 - (safeChurn - CHURN_TARGET_RATE) * 12.5);
}

function compareRankingRows(a, b) {
  const aChurn = Math.max(0, Number(a.churnRate) || 0);
  const bChurn = Math.max(0, Number(b.churnRate) || 0);
  const aOnTarget = aChurn <= CHURN_TARGET_RATE;
  const bOnTarget = bChurn <= CHURN_TARGET_RATE;

  if (aOnTarget !== bOnTarget) return aOnTarget ? -1 : 1;
  if (aOnTarget && bOnTarget && bChurn !== aChurn) return bChurn - aChurn;
  if (!aOnTarget && !bOnTarget && aChurn !== bChurn) return aChurn - bChurn;

  const aHit = Number(a.hitRate) || 0;
  const bHit = Number(b.hitRate) || 0;
  if (bHit !== aHit) return bHit - aHit;

  const aMeta = Number(a.metaIndex) || 0;
  const bMeta = Number(b.metaIndex) || 0;
  if (bMeta !== aMeta) return bMeta - aMeta;

  const aMrr = Number(a.mrr) || 0;
  const bMrr = Number(b.mrr) || 0;
  if (bMrr !== aMrr) return bMrr - aMrr;

  return String(a.squad?.name || '').localeCompare(String(b.squad?.name || ''), 'pt-BR');
}

function serializeMetric(row, clientMetaLucro = 0) {
  const data = parseJson(row.data, {});
  const computed = computeWeeklyMetrics(data, { clientMetaLucro });
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

async function assertClientExists(clientId, user, allPermission = 'metrics.view.all') {
  const row = await getAccessibleClientRow(clientId, user, 'id, squad_id, meta_lucro', allPermission);
  return { clientMetaLucro: Number(row.meta_lucro) || 0 };
}

async function recalcGoalStatus(conn, clientId, periodKey) {
  const monthPrefix = periodKey.slice(0, 7);

  const [clientRows] = await conn.query(
    'SELECT meta_lucro FROM clients WHERE id = ? LIMIT 1',
    [clientId]
  );
  const clientMetaLucro = clientRows.length > 0
    ? Number(clientRows[0].meta_lucro) || 0
    : 0;

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
    const ws = d.weekStatus || deriveWeekStatus(d, clientMetaLucro);
    if (ws) weekStatuses[r.period_key] = ws;
  }

  const goalStatus = aggregateGoalStatus(weekStatuses);
  await conn.query('UPDATE clients SET goal_status = ? WHERE id = ?', [
    goalStatus,
    clientId,
  ]);
  return goalStatus;
}

router.get('/presence', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    await ensureMetricPresenceSchema();
    const periodKey = String(req.query?.periodKey || '').trim();
    const clientIds = String(req.query?.clientIds || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 200);

    if (!PERIOD_KEY_RE.test(periodKey)) throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    if (clientIds.length === 0) return res.json({ presence: [] });

    for (const clientId of clientIds) {
      await assertClientExists(clientId, req.user, 'metrics.view.all');
    }

    const placeholders = clientIds.map(() => '?').join(',');
    const rows = await query(
      `SELECT p.client_id, p.period_key, p.field_key, p.user_id, p.updated_at,
              u.name AS user_name
         FROM metric_edit_presence p
         JOIN users u ON u.id = p.user_id
        WHERE p.period_key = ?
          AND p.client_id IN (${placeholders})
          AND p.updated_at >= (UTC_TIMESTAMP() - INTERVAL ? SECOND)
        ORDER BY p.updated_at DESC`,
      [periodKey, ...clientIds, PRESENCE_TTL_SECONDS]
    );

    res.json({
      presence: rows.map((row) => ({
        clientId: row.client_id,
        periodKey: row.period_key,
        fieldKey: row.field_key,
        userId: row.user_id,
        userName: row.user_name || '',
        updatedAt: row.updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET /api/metrics/ranking
//  Ranking consolidado por squad, calculado no backend com o
//  mesmo escopo de dados da permissão ranking.view.own/all.
// --------------------------------------------------------------
router.get('/ranking', requirePermission('ranking.view'), async (req, res, next) => {
  try {
    const { date: dateParam, squadId } = req.query;
    let ref;
    if (dateParam) {
      ref = new Date(String(dateParam) + 'T00:00:00Z');
      if (Number.isNaN(ref.getTime())) throw badRequest('Parâmetro date inválido. Use YYYY-MM-DD.');
    } else {
      ref = new Date();
    }

    const weekKey = currentPeriodKey(ref);
    const monthPrefix = monthPrefixFromDate(ref);
    const prevWeekKey = previousPeriodKey(weekKey);
    const prevMonthPrefix = previousMonthPrefix(monthPrefix);
    const bounds = monthBoundsFromPrefix(monthPrefix);
    const referenceDateSql = monthPrefix + '-01';

    const squadScope = getAllowedSquads(req.user, 'ranking.view.all');
    const allowedSquads = Array.isArray(squadScope) ? squadScope : null;

    let squadSql = `SELECT s.id, s.name, s.owner_user_id, s.active, s.logo_data_url,
                           u.name AS owner_name, u.email AS owner_email, u.role AS owner_role
                      FROM squads s
                      LEFT JOIN users u ON u.id = s.owner_user_id
                     WHERE 1 = 1`;
    const squadParams = [];

    if (squadId) {
      squadSql += ' AND s.id = ?';
      squadParams.push(squadId);
    }
    if (allowedSquads) {
      if (allowedSquads.length === 0) return res.json({ weekKey, monthPrefix, rows: [] });
      squadSql += ` AND s.id IN (${allowedSquads.map(() => '?').join(',')})`;
      squadParams.push(...allowedSquads);
    }
    squadSql += ' ORDER BY s.name ASC';

    const squads = await query(squadSql, squadParams);
    if (squads.length === 0) return res.json({ weekKey, monthPrefix, rows: [] });

    const squadIds = squads.map((squad) => squad.id);
    const squadPlaceholders = squadIds.map(() => '?').join(',');

    const clients = await query(
      `SELECT c.id, c.name, c.squad_id, c.status, c.fee, c.meta_lucro,
              c.start_date, c.churn_date, c.created_at
         FROM clients c
        WHERE c.squad_id IN (${squadPlaceholders})
          AND COALESCE(c.start_date, DATE(c.created_at)) <= LAST_DAY(?)`,
      [...squadIds, referenceDateSql]
    );

    const clientIds = clients.map((client) => client.id);
    let metricRows = [];
    if (clientIds.length > 0) {
      const clientPlaceholders = clientIds.map(() => '?').join(',');
      metricRows = await query(
        `SELECT client_id, period_key, data
           FROM weekly_metrics
          WHERE client_id IN (${clientPlaceholders})
            AND (period_key LIKE ? OR period_key LIKE ?)
          ORDER BY client_id, period_key`,
        [...clientIds, monthPrefix + '-S%', prevMonthPrefix + '-S%']
      );
    }

    const metricsByClient = new Map();
    for (const row of metricRows) {
      if (!metricsByClient.has(row.client_id)) metricsByClient.set(row.client_id, []);
      metricsByClient.get(row.client_id).push({
        period_key: row.period_key,
        data: typeof row.data === 'object' ? row.data : JSON.parse(row.data || '{}'),
      });
    }

    const clientsBySquad = new Map();
    for (const client of clients) {
      if (!clientsBySquad.has(client.squad_id)) clientsBySquad.set(client.squad_id, []);
      clientsBySquad.get(client.squad_id).push(client);
    }

    const rows = squads.map((squad) => {
      const squadClients = clientsBySquad.get(squad.id) || [];
      const activeClients = squadClients.filter((client) => activeAt(client, bounds.end));
      const activeAtStart = squadClients.filter((client) => activeAt(client, bounds.start));
      const churnedInPeriod = squadClients.filter((client) => client.status === 'churn' && dateInMonth(client.churn_date, monthPrefix));
      const mrr = activeClients.reduce((sum, client) => sum + (Number(client.fee) || 0), 0);
      const churnRate = activeAtStart.length > 0 ? (churnedInPeriod.length / activeAtStart.length) * 100 : 0;

      const clientSummaries = activeClients.map((client) => {
        const summary = aggregateClientSummary(metricsByClient.get(client.id) || [], weekKey, monthPrefix, {
          prevWeekKey,
          prevMonthPrefix,
          clientMetaLucro: Number(client.meta_lucro) || 0,
        });
        return {
          clientId: client.id,
          name: client.name,
          squadId: client.squad_id,
          clientMetaLucro: Number(client.meta_lucro) || 0,
          ...summary,
          hit: summary.monthGoal > 0 && summary.monthClosed >= summary.monthGoal,
          hasGoal: summary.monthGoalSeen,
        };
      });

      const totals = aggregatePortfolioSummary(clientSummaries);
      const metaIndex = Number(totals.monthProgress) || 0;
      const hitRate = Number(totals.hitRateMonth) || 0;
      const legacyPerformanceScore = performanceScore({ mrr, metaIndex, churnRate, activeClients: activeClients.length });
      const rankingScore = churnRankScore(churnRate);

      return {
        squad: {
          id: squad.id,
          name: squad.name,
          ownerUserId: squad.owner_user_id || '',
          owner: squad.owner_user_id ? {
            id: squad.owner_user_id,
            name: squad.owner_name || '',
            email: squad.owner_email || '',
            role: squad.owner_role || '',
          } : null,
          active: Boolean(squad.active),
          logoUrl: squad.logo_data_url || '',
        },
        ownerName: squad.owner_name || 'Sem responsável',
        ownerRole: squad.owner_role || '',
        activeClients: activeClients.length,
        clientsWithGoal: Number(totals.clientsWithGoal) || 0,
        mrr,
        metaIndex,
        hitRate,
        churnTarget: CHURN_TARGET_RATE,
        churnOnTarget: churnRate <= CHURN_TARGET_RATE,
        rankingScore,
        performanceScore: legacyPerformanceScore,
        totals,
      };
    }).sort(compareRankingRows).map((row, index) => ({ ...row, position: index + 1 }));

    res.json({ weekKey, monthPrefix, churnTarget: CHURN_TARGET_RATE, rows });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET /api/metrics/summary
// --------------------------------------------------------------
router.get('/summary', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    const { date: dateParam, squadId, clientId: clientIdParam } = req.query;

    let ref;
    if (dateParam) {
      ref = new Date(`${dateParam}T00:00:00Z`);
      if (Number.isNaN(ref.getTime())) {
        throw badRequest('Parâmetro date inválido. Use YYYY-MM-DD.');
      }
    } else {
      ref = new Date();
    }

    const weekKey         = currentPeriodKey(ref);
    const monthPrefix     = monthPrefixFromDate(ref);
    const prevWeekKey     = previousPeriodKey(weekKey);
    const prevMonthPrefix = previousMonthPrefix(monthPrefix);
    const referenceDateSql = `${monthPrefix}-01`;

    const squadScope = getAllowedSquads(req.user, 'metrics.view.all');
    const allowedSquads = Array.isArray(squadScope) ? squadScope : null;

    // [Fase 2] Seleciona c.meta_lucro para usar no fallback
    let clientSql = `
      SELECT c.id, c.name, c.squad_id, c.gdv_name, c.gestor, c.meta_lucro,
             s.name AS squad_name
        FROM clients c
        LEFT JOIN squads s ON s.id = c.squad_id
       WHERE c.status = 'active'
         AND COALESCE(c.start_date, DATE(c.created_at)) <= LAST_DAY(?)
    `;
    const clientParams = [referenceDateSql];

    if (clientIdParam) {
      clientSql += ' AND c.id = ?';
      clientParams.push(clientIdParam);
    }
    if (squadId) {
      clientSql += ' AND c.squad_id = ?';
      clientParams.push(squadId);
    } else if (allowedSquads) {
      // Usuário sem squads visíveis: devolve resposta vazia em vez de
      // montar `IN ()`, que é SQL inválido.
      if (allowedSquads.length === 0) {
        return res.json({
          weekKey, prevWeekKey, monthPrefix, prevMonthPrefix,
          clients: [],
          totals: aggregatePortfolioSummary([]),
        });
      }
      clientSql += ` AND c.squad_id IN (${allowedSquads.map(() => '?').join(',')})`;
      clientParams.push(...allowedSquads);
    }

    clientSql += ' ORDER BY c.name ASC';

    const clients = await query(clientSql, clientParams);

    if (clients.length === 0) {
      return res.json({
        weekKey, prevWeekKey, monthPrefix, prevMonthPrefix,
        clients: [],
        totals: aggregatePortfolioSummary([]),
      });
    }

    const clientIds = clients.map((c) => c.id);
    const placeholders = clientIds.map(() => '?').join(',');

    const metricRows = await query(
      `SELECT client_id, period_key, data
         FROM weekly_metrics
        WHERE client_id IN (${placeholders})
          AND (period_key LIKE ? OR period_key LIKE ?)
        ORDER BY client_id, period_key`,
      [...clientIds, `${monthPrefix}-S%`, `${prevMonthPrefix}-S%`]
    );

    const metricsByClient = {};
    for (const row of metricRows) {
      const cid = row.client_id;
      if (!metricsByClient[cid]) metricsByClient[cid] = [];
      metricsByClient[cid].push({
        period_key: row.period_key,
        data: typeof row.data === 'object' ? row.data : JSON.parse(row.data || '{}'),
      });
    }

    const clientSummaries = clients.map((c) => {
      const rows = metricsByClient[c.id] || [];
      const clientMetaLucro = Number(c.meta_lucro) || 0;
      const summary = aggregateClientSummary(rows, weekKey, monthPrefix, {
        prevWeekKey,
        prevMonthPrefix,
        clientMetaLucro,
      });
      return {
        clientId:   c.id,
        name:       c.name,
        squadId:    c.squad_id   || null,
        squadName:  c.squad_name || null,
        gdvName:    c.gdv_name   || '',
        gestor:     c.gestor     || '',
        clientMetaLucro,
        ...summary,
        hit:     summary.monthGoal > 0 && summary.monthClosed >= summary.monthGoal,
        hasGoal: summary.monthGoalSeen,
      };
    });

    const totals = aggregatePortfolioSummary(clientSummaries);

    res.json({
      weekKey, prevWeekKey, monthPrefix, prevMonthPrefix,
      clients: clientSummaries, totals,
    });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------
//  GET /api/metrics/summary/history
// --------------------------------------------------------------
router.get('/summary/history', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    const {
      date: dateParam, squadId,
      clientId: clientIdParam, months: monthsParam,
    } = req.query;
    const months = Math.min(Math.max(Number(monthsParam) || 2, 1), 2);

    let ref;
    if (dateParam) {
      ref = new Date(`${dateParam}T00:00:00Z`);
      if (Number.isNaN(ref.getTime())) throw badRequest('Parâmetro date inválido.');
    } else { ref = new Date(); }

    const refYear  = ref.getUTCFullYear();
    const refMonth = ref.getUTCMonth();

    const squadScope = getAllowedSquads(req.user, 'metrics.view.all');
    const allowedSquads = Array.isArray(squadScope) ? squadScope : null;

    let clientSql = `
      SELECT id, meta_lucro, start_date, created_at
        FROM clients
       WHERE status = 'active'
    `;
    const clientParams = [];
    if (clientIdParam) { clientSql += ' AND id = ?'; clientParams.push(clientIdParam); }
    if (squadId) { clientSql += ' AND squad_id = ?'; clientParams.push(squadId); }
    else if (allowedSquads) {
      // Usuário sem squads visíveis: nada a retornar, sem montar `IN ()`.
      if (allowedSquads.length === 0) return res.json({ months: [] });
      clientSql += ` AND squad_id IN (${allowedSquads.map(() => '?').join(',')})`;
      clientParams.push(...allowedSquads);
    }

    const activeClients = await query(clientSql, clientParams);
    if (activeClients.length === 0) return res.json({ months: [] });
    const activeClientsById = new Map(activeClients.map((c) => [c.id, c]));

    const clientIds = activeClients.map((c) => c.id);
    const placeholders = clientIds.map(() => '?').join(',');

    const prefixes = [];
    const prevYearPrefixes = [];
    for (let i = months - 1; i >= 0; i--) {
      let y = refYear;
      let m = refMonth - i;
      while (m < 0) { m += 12; y--; }
      const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
      prefixes.push({ y, m, prefix });
      prevYearPrefixes.push(`${y - 1}-${String(m + 1).padStart(2, '0')}`);
    }

    const allPrefixes = [...prefixes.map((p) => p.prefix), ...prevYearPrefixes];
    const likeConditions = allPrefixes.map(() => 'period_key LIKE ?').join(' OR ');
    const likeParams = allPrefixes.map((p) => `${p}-S%`);

    const metricRows = await query(
      `SELECT client_id, period_key, data
         FROM weekly_metrics
        WHERE client_id IN (${placeholders})
          AND (${likeConditions})`,
      [...clientIds, ...likeParams]
    );

    function clientStartedOnOrBeforePrefix(client, prefix) {
      const source = client?.start_date || client?.created_at;
      if (!source) return true;
      const started = new Date(source);
      if (Number.isNaN(started.getTime())) return true;
      const clientPrefix = `${started.getUTCFullYear()}-${String(started.getUTCMonth() + 1).padStart(2, '0')}`;
      return clientPrefix <= prefix;
    }

    // Soma apenas metas preenchidas no histórico. O fallback do cadastro
    // (clients.meta_lucro) só entra no mês de referência, para não criar
    // metas artificiais em meses antigos sem preenchimento semanal.
    const sumByPrefix = {};
    const metaByClientPrefix = {};

    for (const row of metricRows) {
      const pk = String(row.period_key || '');
      const prefix = pk.slice(0, 7);
      const client = activeClientsById.get(row.client_id);
      if (!clientStartedOnOrBeforePrefix(client, prefix)) continue;
      if (!sumByPrefix[prefix]) sumByPrefix[prefix] = { fechados: 0, meta: 0, filled: 0 };
      const data = typeof row.data === 'object' ? row.data : JSON.parse(row.data || '{}');
      const fec  = Number(data.fechados) || 0;
      const mSem = Number(data.metaSemanal) || 0;
      const mLuc = Number(data.metaLucro)   || 0;

      sumByPrefix[prefix].fechados += fec;

      const g = mSem > 0 ? mSem : mLuc;
      if (g > 0) {
        sumByPrefix[prefix].meta += g;
        metaByClientPrefix[`${row.client_id}|${prefix}`] = true;
      }
      if (fec > 0 || g > 0) sumByPrefix[prefix].filled++;
    }

    const refPrefix = `${refYear}-${String(refMonth + 1).padStart(2, '0')}`;
    for (const c of activeClients) {
      const metaLucro = Number(c.meta_lucro) || 0;
      if (metaLucro <= 0) continue;
      if (!clientStartedOnOrBeforePrefix(c, refPrefix)) continue;
      const key = `${c.id}|${refPrefix}`;
      if (!metaByClientPrefix[key]) {
        if (!sumByPrefix[refPrefix]) sumByPrefix[refPrefix] = { fechados: 0, meta: 0, filled: 0 };
        sumByPrefix[refPrefix].meta += metaLucro;
      }
    }

    const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const nowY = ref.getUTCFullYear();
    const nowM = ref.getUTCMonth();

    const result = prefixes.map(({ y, m, prefix }, i) => {
      const curr = sumByPrefix[prefix]              || { fechados: 0, meta: 0, filled: 0 };
      const prev = sumByPrefix[prevYearPrefixes[i]] || { fechados: 0, meta: 0, filled: 0 };
      return {
        y, m, monthPrefix: prefix, label: MONTH_LABELS[m],
        fechados: curr.fechados, meta: curr.meta,
        anterior: prev.fechados, filled: curr.filled,
        isNow: y === nowY && m === nowM,
      };
    });

    res.json({ months: result });
  } catch (err) { next(err); }
});

router.get('/:clientId', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { clientMetaLucro } = await assertClientExists(clientId, req.user, 'metrics.view.all');

    const rows = await query(
      `SELECT id, client_id, period_key, data, created_at, updated_at
         FROM weekly_metrics
        WHERE client_id = ?
        ORDER BY period_key ASC`,
      [clientId]
    );
    res.json({ metrics: rows.map((r) => serializeMetric(r, clientMetaLucro)) });
  } catch (err) { next(err); }
});

router.get('/:clientId/:periodKey', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    const { clientId, periodKey } = req.params;
    if (!PERIOD_KEY_RE.test(periodKey)) {
      throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    }
    const { clientMetaLucro } = await assertClientExists(clientId, req.user, 'metrics.view.all');

    const rows = await query(
      `SELECT id, client_id, period_key, data, created_at, updated_at
         FROM weekly_metrics
        WHERE client_id = ? AND period_key = ?
        LIMIT 1`,
      [clientId, periodKey]
    );

    if (rows.length === 0) {
      return res.json({
        metric: {
          id: null, clientId, periodKey, data: {},
          computed: computeWeeklyMetrics({}, { clientMetaLucro }),
          createdAt: null, updatedAt: null,
        },
      });
    }
    res.json({ metric: serializeMetric(rows[0], clientMetaLucro) });
  } catch (err) { next(err); }
});

router.put('/:clientId/:periodKey', requirePermission('metrics.fill_week'), async (req, res, next) => {
  try {
    const { clientId, periodKey } = req.params;
    if (!PERIOD_KEY_RE.test(periodKey)) {
      throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    }
    const { clientMetaLucro } = await assertClientExists(clientId, req.user, 'metrics.fill_week.all');

    const incomingData = sanitizeMetricData((req.body && req.body.data) || {});

    const result = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        `SELECT id, data FROM weekly_metrics
          WHERE client_id = ? AND period_key = ? LIMIT 1`,
        [clientId, periodKey]
      );

      const prev = existing.length > 0 ? parseJson(existing[0].data, {}) : {};
      const merged = { ...prev, ...incomingData };

      if (merged.weekStatus === undefined || merged.weekStatus === null) {
        merged.weekStatus = deriveWeekStatus(merged, clientMetaLucro);
      }

      if (existing.length > 0) {
        await conn.query(
          `UPDATE weekly_metrics SET data = ? WHERE id = ?`,
          [JSON.stringify(merged), existing[0].id]
        );
      } else {
        await conn.query(
          `INSERT INTO weekly_metrics (id, client_id, period_key, data)
           VALUES (?, ?, ?, ?)`,
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
        metric: serializeMetric(fresh[0], clientMetaLucro),
        goalStatus,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

router.post('/presence', requirePermission('metrics.fill_week'), async (req, res, next) => {
  try {
    await ensureMetricPresenceSchema();
    const clientId = String(req.body?.clientId || '').trim();
    const periodKey = String(req.body?.periodKey || '').trim();
    const fieldKey = String(req.body?.fieldKey || '').trim();
    if (!clientId) throw badRequest('clientId obrigatório');
    if (!PERIOD_KEY_RE.test(periodKey)) throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    if (!ALLOWED_METRIC_FIELDS.has(fieldKey)) throw badRequest('fieldKey inválido');

    await assertClientExists(clientId, req.user, 'metrics.fill_week.all');

    await query(
      `INSERT INTO metric_edit_presence (client_id, period_key, field_key, user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [clientId, periodKey, fieldKey, req.user.id]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/presence', requirePermission('metrics.fill_week'), async (req, res, next) => {
  try {
    await ensureMetricPresenceSchema();
    const clientId = String(req.body?.clientId || '').trim();
    const periodKey = String(req.body?.periodKey || '').trim();
    const fieldKey = String(req.body?.fieldKey || '').trim();
    if (!clientId) throw badRequest('clientId obrigatório');
    if (!PERIOD_KEY_RE.test(periodKey)) throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    if (!ALLOWED_METRIC_FIELDS.has(fieldKey)) throw badRequest('fieldKey inválido');

    await query(
      `DELETE FROM metric_edit_presence
        WHERE client_id = ? AND period_key = ? AND field_key = ? AND user_id = ?`,
      [clientId, periodKey, fieldKey, req.user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
