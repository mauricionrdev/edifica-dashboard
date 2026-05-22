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
  weekOfMonth,
} from '../utils/domain.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getAccessibleClientRow, getAllowedSquads } from '../utils/access.js';

const router = Router();
router.use(requireAuth);
let metricPresenceInitPromise = null;
const PRESENCE_TTL_SECONDS = 18;
const METRIC_PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])-S[1-4](?:__campaign:[A-Za-z0-9_-]{8,80})?$/;
const METRIC_CAMPAIGN_NAME_MAX_LENGTH = 80;
let metricCampaignsInitPromise = null;

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

async function ensureMetricCampaignsSchema() {
  if (!metricCampaignsInitPromise) {
    metricCampaignsInitPromise = (async () => {
      await query('ALTER TABLE weekly_metrics MODIFY COLUMN period_key VARCHAR(96) NOT NULL');
      await query(`
        CREATE TABLE IF NOT EXISTS metric_campaigns (
          id CHAR(36) NOT NULL,
          client_id CHAR(36) NOT NULL,
          base_period_key VARCHAR(16) NOT NULL,
          metric_period_key VARCHAR(96) NOT NULL,
          name VARCHAR(120) NOT NULL,
          created_by CHAR(36) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_metric_campaign_metric_period (client_id, metric_period_key),
          KEY idx_metric_campaign_client_period (client_id, base_period_key),
          KEY idx_metric_campaign_created_by (created_by),
          CONSTRAINT fk_metric_campaign_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          CONSTRAINT fk_metric_campaign_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      metricCampaignsInitPromise = null;
      throw err;
    });
  }
  return metricCampaignsInitPromise;
}

function isMetricPeriodKey(value) {
  return METRIC_PERIOD_KEY_RE.test(String(value || ''));
}

function isCampaignMetricPeriodKey(value) {
  return String(value || '').includes('__campaign:');
}

function normalizeCampaignName(value, fallback = 'Campanha') {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  const name = clean || fallback;
  return name.slice(0, METRIC_CAMPAIGN_NAME_MAX_LENGTH);
}

function serializeCampaign(row = {}) {
  return {
    id: row.id,
    clientId: row.client_id,
    periodKey: row.base_period_key,
    metricPeriodKey: row.metric_period_key,
    name: row.name || 'Campanha',
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
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
      if (v === null) {
        clean[key] = null;
        continue;
      }
      if (v === '' || v === undefined) continue;
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
  if (!startedOnOrBefore(row, date)) return false;

  const status = String(row?.status || '').trim().toLowerCase();
  const churn = parseClientDate(row?.churn_date);

  if (churn) return churn > date;
  return status === 'active';
}

function dateInMonth(value, monthPrefix) {
  const date = parseClientDate(value);
  if (!date) return false;
  const prefix = date.toISOString().slice(0, 7);
  return prefix === monthPrefix;
}


function metricNumber(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseLocaleNumber(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricData(row) {
  if (!row?.data) return {};
  if (typeof row.data === 'object') return row.data;
  try { return JSON.parse(row.data || '{}'); } catch { return {}; }
}

function normalizedClientStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isActiveClientStatus(client) {
  return normalizedClientStatus(client?.status) === 'active';
}

function rankingWeeklyGoal(data = {}) {
  // Ranking de Meta Lucro: usa somente a meta informada no preenchimento semanal.
  // Não usa meta_lucro do cadastro, progresso mensal, projeção, weekStatus ou status legado.
  const metaSemanal = metricNumber(data?.metaSemanal);
  if (metaSemanal > 0) return metaSemanal;

  // Compatibilidade para registros que ainda foram salvos pelo campo antigo da própria semana.
  // Continua sem usar clients.meta_lucro.
  const metaLucroLegacy = metricNumber(data?.metaLucro);
  return metaLucroLegacy > 0 ? metaLucroLegacy : 0;
}

function rankingMaxWeekForMonth(monthPrefix = '', now = new Date()) {
  const currentPrefix = monthPrefixFromDate(now);
  if (!/^\d{4}-\d{2}$/.test(String(monthPrefix))) return 0;
  if (monthPrefix < currentPrefix) return 4;
  if (monthPrefix > currentPrefix) return 0;
  return weekOfMonth(now);
}

function rankingMetricWeek(periodKey = '', monthPrefix = '') {
  const match = new RegExp(`^${monthPrefix}-S([1-4])$`).exec(String(periodKey || ''));
  return match ? Number(match[1]) : 0;
}

function clientHitRankingGoalInMonth(clientMetrics = [], monthPrefix = '', maxWeek = 4) {
  return clientMetrics.some((row) => {
    const week = rankingMetricWeek(row?.period_key, monthPrefix);
    if (!week || week > maxWeek) return false;

    const data = metricData(row);
    const goal = rankingWeeklyGoal(data);
    const closed = metricNumber(data?.fechados);

    return goal > 0 && closed > 0 && closed >= goal;
  });
}

function monthEndFromPrefix(prefix) {
  const bounds = monthBoundsFromPrefix(prefix);
  return bounds?.end || null;
}

function activeAtMonthEnd(row, prefix) {
  const end = monthEndFromPrefix(prefix);
  return end ? activeAt(row, end) : false;
}

const DEFAULT_RANKING_GOAL_PERCENT = 80;
const DEFAULT_CHURN_TARGET_RATE = 8;
const RANKING_SETTINGS_KEY = 'global';
// Chaves por squad usam o formato `squad:<uuid>`; UUID tem 36 caracteres.
// O tamanho antigo (VARCHAR(32)) truncava a chave e fazia a calculadora voltar para 80/8.
const RANKING_SETTINGS_KEY_MAX_LENGTH = 96;
let rankingSettingsInitPromise = null;

function clampPercent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

async function getRankingSettingsColumns() {
  const columns = await query('SHOW COLUMNS FROM ranking_settings');
  return columns.map((column) => ({
    name: column.Field,
    type: String(column.Type || '').toLowerCase(),
    nullable: String(column.Null || '').toUpperCase() === 'YES',
    extra: String(column.Extra || '').toLowerCase(),
  }));
}

function hasRankingSettingsColumn(columns, name) {
  return columns.some((column) => column.name === name);
}

function rankingSettingsKeyNeedsResize(columns) {
  const column = columns.find((item) => item.name === 'setting_key');
  if (!column) return false;
  const match = column.type.match(/varchar\((\d+)\)/i);
  const size = match ? Number(match[1]) : 0;
  return size > 0 && size < RANKING_SETTINGS_KEY_MAX_LENGTH;
}

function isRankingSettingsAutoIncrement(columns, name) {
  return columns.some((column) => column.name === name && column.extra.includes('auto_increment'));
}

async function ensureRankingSettingsSchema() {
  if (!rankingSettingsInitPromise) {
    rankingSettingsInitPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS ranking_settings (
          setting_key VARCHAR(96) NOT NULL PRIMARY KEY,
          goal_percent DECIMAL(5,2) NOT NULL DEFAULT 80.00,
          churn_target DECIMAL(5,2) NOT NULL DEFAULT 8.00,
          updated_by CHAR(36) NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_ranking_settings_updated_by (updated_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      let columns = await getRankingSettingsColumns();

      if (!hasRankingSettingsColumn(columns, 'setting_key')) {
        await query('ALTER TABLE ranking_settings ADD COLUMN setting_key VARCHAR(96) NULL FIRST');
        columns = await getRankingSettingsColumns();
      }
      if (!hasRankingSettingsColumn(columns, 'goal_percent')) {
        await query('ALTER TABLE ranking_settings ADD COLUMN goal_percent DECIMAL(5,2) NOT NULL DEFAULT 80.00');
        columns = await getRankingSettingsColumns();
      }
      if (!hasRankingSettingsColumn(columns, 'churn_target')) {
        await query('ALTER TABLE ranking_settings ADD COLUMN churn_target DECIMAL(5,2) NOT NULL DEFAULT 8.00');
        columns = await getRankingSettingsColumns();
      }
      if (!hasRankingSettingsColumn(columns, 'updated_by')) {
        await query('ALTER TABLE ranking_settings ADD COLUMN updated_by CHAR(36) NULL');
        columns = await getRankingSettingsColumns();
      }
      if (!hasRankingSettingsColumn(columns, 'updated_at')) {
        await query('ALTER TABLE ranking_settings ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        columns = await getRankingSettingsColumns();
      }

      await query(
        `UPDATE ranking_settings
            SET setting_key = ?
          WHERE setting_key IS NULL OR setting_key = ''`,
        [RANKING_SETTINGS_KEY]
      );

      columns = await getRankingSettingsColumns();
      if (rankingSettingsKeyNeedsResize(columns)) {
        await query(`ALTER TABLE ranking_settings MODIFY COLUMN setting_key VARCHAR(${RANKING_SETTINGS_KEY_MAX_LENGTH}) NOT NULL`);
        columns = await getRankingSettingsColumns();
      }

      const existing = await query(
        `SELECT COUNT(*) AS total
           FROM ranking_settings
          WHERE setting_key = ?`,
        [RANKING_SETTINGS_KEY]
      );

      if ((Number(existing?.[0]?.total) || 0) === 0) {
        const hasId = hasRankingSettingsColumn(columns, 'id');
        const idAutoIncrement = isRankingSettingsAutoIncrement(columns, 'id');
        if (hasId && !idAutoIncrement) {
          await query(
            `INSERT INTO ranking_settings (id, setting_key, goal_percent, churn_target)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               setting_key = VALUES(setting_key),
               goal_percent = VALUES(goal_percent),
               churn_target = VALUES(churn_target)`,
            [1, RANKING_SETTINGS_KEY, DEFAULT_RANKING_GOAL_PERCENT, DEFAULT_CHURN_TARGET_RATE]
          );
        } else {
          await query(
            `INSERT INTO ranking_settings (setting_key, goal_percent, churn_target)
             VALUES (?, ?, ?)`,
            [RANKING_SETTINGS_KEY, DEFAULT_RANKING_GOAL_PERCENT, DEFAULT_CHURN_TARGET_RATE]
          );
        }
      }
    })().catch((err) => {
      rankingSettingsInitPromise = null;
      throw err;
    });
  }
  return rankingSettingsInitPromise;
}

function serializeRankingSettings(row = {}) {
  return {
    settingKey: row.setting_key || RANKING_SETTINGS_KEY,
    goalPercent: clampPercent(row.goal_percent, DEFAULT_RANKING_GOAL_PERCENT),
    churnTarget: clampPercent(row.churn_target, DEFAULT_CHURN_TARGET_RATE),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

async function getRankingSettings(settingKey = RANKING_SETTINGS_KEY) {
  await ensureRankingSettingsSchema();
  const rows = await query(
    `SELECT setting_key, goal_percent, churn_target, updated_by, updated_at
       FROM ranking_settings
      WHERE setting_key = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [settingKey]
  );
  return serializeRankingSettings(rows[0]);
}

function squadRankingSettingKey(squadId) {
  return `squad:${String(squadId || '').trim()}`;
}

async function getRankingSettingsMap(squadIds = []) {
  await ensureRankingSettingsSchema();
  const keys = [RANKING_SETTINGS_KEY, ...squadIds.map(squadRankingSettingKey)];
  const placeholders = keys.map(() => '?').join(',');
  const rows = await query(
    `SELECT setting_key, goal_percent, churn_target, updated_by, updated_at
       FROM ranking_settings
      WHERE setting_key IN (${placeholders})`,
    keys
  );
  const map = new Map(rows.map((row) => [row.setting_key, serializeRankingSettings(row)]));
  const global = map.get(RANKING_SETTINGS_KEY) || serializeRankingSettings();
  return { global, map };
}

function metaTargetRankScore(progress, goalPercent) {
  const safeProgress = Math.max(0, Number(progress) || 0);
  const safeGoal = Math.max(1, Number(goalPercent) || DEFAULT_RANKING_GOAL_PERCENT);
  return Math.min(200, (safeProgress / safeGoal) * 100);
}

function performanceScore({ mrr, metaIndex, churnRate, activeClients }) {
  const safeMrr = Math.max(0, Number(mrr) || 0);
  const safeMeta = Math.max(0, Number(metaIndex) || 0);
  const safeChurn = Math.max(0, Number(churnRate) || 0);
  const safeActive = Math.max(0, Number(activeClients) || 0);
  if (safeMrr <= 0 || safeActive <= 0 || safeMeta <= 0) return 0;
  return Math.round(safeMrr * (safeMeta / 100) * Math.max(0, 1 - safeChurn / 100));
}

function churnRankScore(churnRate, churnTarget = DEFAULT_CHURN_TARGET_RATE) {
  const safeChurn = Math.max(0, Number(churnRate) || 0);
  const safeTarget = Math.max(1, Number(churnTarget) || DEFAULT_CHURN_TARGET_RATE);
  if (safeChurn <= safeTarget) {
    return 100 + ((safeTarget - safeChurn) / safeTarget) * 100;
  }
  return Math.max(0, 100 - (safeChurn - safeTarget) * 12.5);
}

function goalDistance(progress, goalPercent) {
  const safeProgress = Math.max(0, Number(progress) || 0);
  const safeGoal = Math.max(1, Number(goalPercent) || DEFAULT_RANKING_GOAL_PERCENT);
  return Math.abs(safeGoal - safeProgress);
}

function compareRankingRows(a, b) {
  const aProgress = Math.max(0, Number(a.metaActiveProgress) || Number(a.metaIndex) || 0);
  const bProgress = Math.max(0, Number(b.metaActiveProgress) || Number(b.metaIndex) || 0);
  const aGoal = Math.max(1, Number(a.goalPercent) || DEFAULT_RANKING_GOAL_PERCENT);
  const bGoal = Math.max(1, Number(b.goalPercent) || DEFAULT_RANKING_GOAL_PERCENT);
  const aReached = aProgress >= aGoal;
  const bReached = bProgress >= bGoal;
  const aChurn = Math.max(0, Number(a.churnRate) || 0);
  const bChurn = Math.max(0, Number(b.churnRate) || 0);
  const aDistance = goalDistance(aProgress, aGoal);
  const bDistance = goalDistance(bProgress, bGoal);

  // Prioridade do Leonardo: Meta Ativos é o score real principal.
  // A meta configurada define o alvo mínimo esperado; ultrapassar o alvo nunca penaliza.
  if (aReached !== bReached) return aReached ? -1 : 1;
  if (bProgress !== aProgress) return bProgress - aProgress;
  if (aChurn !== bChurn) return aChurn - bChurn;

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
//  GET/PUT /api/metrics/ranking/settings
//  Configuração persistida usada pelo cálculo do ranking.
// --------------------------------------------------------------
router.get('/ranking/settings', requirePermission('ranking.view'), async (req, res, next) => {
  try {
    const settings = await getRankingSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

async function upsertRankingSetting(settingKey, goalPercent, churnTarget, userId) {
  const result = await query(
    `UPDATE ranking_settings
        SET goal_percent = ?,
            churn_target = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE setting_key = ?`,
    [goalPercent, churnTarget, userId || null, settingKey]
  );

  if ((Number(result?.affectedRows) || 0) === 0) {
    await query(
      `INSERT INTO ranking_settings (setting_key, goal_percent, churn_target, updated_by)
       VALUES (?, ?, ?, ?)`,
      [settingKey, goalPercent, churnTarget, userId || null]
    );
  }
}

router.put('/ranking/settings', requirePermission('ranking.view.all'), async (req, res, next) => {
  try {
    await ensureRankingSettingsSchema();
    const squadSettings = Array.isArray(req.body?.squadSettings) ? req.body.squadSettings : null;

    if (squadSettings) {
      for (const item of squadSettings) {
        const squadId = String(item?.squadId || '').trim();
        if (!squadId) continue;
        const goalPercent = clampPercent(item?.goalPercent, DEFAULT_RANKING_GOAL_PERCENT);
        const churnTarget = clampPercent(item?.churnTarget, DEFAULT_CHURN_TARGET_RATE);
        if (goalPercent <= 0) throw badRequest('Meta lucro deve ser maior que zero');
        await upsertRankingSetting(squadRankingSettingKey(squadId), goalPercent, churnTarget, req.user?.id);
      }
      return res.json({ settings: await getRankingSettings() });
    }

    const goalPercent = clampPercent(req.body?.goalPercent, DEFAULT_RANKING_GOAL_PERCENT);
    const churnTarget = clampPercent(req.body?.churnTarget, DEFAULT_CHURN_TARGET_RATE);

    if (goalPercent <= 0) throw badRequest('Meta lucro deve ser maior que zero');

    await upsertRankingSetting(RANKING_SETTINGS_KEY, goalPercent, churnTarget, req.user?.id);

    const settings = await getRankingSettings();
    res.json({ settings });
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
    if (req.emptyWorkspaceView) {
      const ref = req.query?.date ? new Date(String(req.query.date) + 'T00:00:00Z') : new Date();
      return res.json({ weekKey: currentPeriodKey(ref), monthPrefix: monthPrefixFromDate(ref), rows: [] });
    }
    const { date: dateParam, squadId } = req.query;
    const globalRankingSettings = await getRankingSettings();
    const goalPercent = globalRankingSettings.goalPercent;
    const churnTarget = globalRankingSettings.churnTarget;
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
    const rankingMaxWeek = rankingMaxWeekForMonth(monthPrefix);
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
    const { global: rankingSettings, map: rankingSettingsMap } = await getRankingSettingsMap(squadIds);
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
      const squadSettings = rankingSettingsMap.get(squadRankingSettingKey(squad.id)) || rankingSettings;
      const squadGoalPercent = squadSettings.goalPercent;
      const squadChurnTarget = squadSettings.churnTarget;
      const squadClients = clientsBySquad.get(squad.id) || [];
      const portfolioClients = squadClients;
      const activeClients = squadClients.filter(isActiveClientStatus);
      const churnedInPeriod = squadClients.filter((client) => normalizedClientStatus(client.status) === 'churn' && dateInMonth(client.churn_date, monthPrefix));
      const mrr = activeClients.reduce((sum, client) => sum + (Number(client.fee) || 0), 0);
      const churnRate = portfolioClients.length > 0 ? (churnedInPeriod.length / portfolioClients.length) * 100 : 0;

      const clientSummaries = activeClients.map((client) => {
        const clientMetricRows = metricsByClient.get(client.id) || [];
        const hit = clientHitRankingGoalInMonth(clientMetricRows, monthPrefix, rankingMaxWeek);
        const summary = aggregateClientSummary(clientMetricRows, weekKey, monthPrefix, {
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
          hit,
          hasGoal: hit,
        };
      });

      const totals = aggregatePortfolioSummary(clientSummaries);
      const rankingGoalClients = clientSummaries.filter((client) => client.hit).length;
      const rankingGoalBaseClients = activeClients.length;
      const metaIndex = rankingGoalBaseClients > 0 ? (rankingGoalClients / rankingGoalBaseClients) * 100 : 0;
      const metaActiveProgress = metaIndex;
      const metaActiveTargetProgress = squadGoalPercent > 0 ? (metaActiveProgress / squadGoalPercent) * 100 : metaActiveProgress;
      const metaActiveDistance = goalDistance(metaActiveProgress, squadGoalPercent);
      const hitRate = metaActiveProgress;
      const legacyPerformanceScore = performanceScore({ mrr, metaIndex, churnRate, activeClients: activeClients.length });
      const rankingScore = metaTargetRankScore(metaActiveProgress, squadGoalPercent);

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
        clientsWithGoal: rankingGoalClients,
        rankingGoalClients,
        rankingGoalBaseClients,
        mrr,
        metaIndex,
        hitRate,
        metaActiveProgress,
        metaActiveClosed: rankingGoalClients,
        metaActiveGoal: rankingGoalBaseClients,
        goalPercent: squadGoalPercent,
        churnRate,
        churnedClients: churnedInPeriod.length,
        churnBaseClients: portfolioClients.length,
        churnTarget: squadChurnTarget,
        goalOnTarget: metaActiveProgress >= squadGoalPercent,
        churnOnTarget: churnRate <= squadChurnTarget,
        metaActiveTargetProgress,
        metaActiveDistance,
        rankingScore,
        performanceScore: legacyPerformanceScore,
        totals,
      };
    }).sort(compareRankingRows).map((row, index) => ({ ...row, position: index + 1 }));

    res.json({ weekKey, monthPrefix, settings: rankingSettings, goalPercent: rankingSettings.goalPercent, churnTarget: rankingSettings.churnTarget, rows });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET /api/metrics/summary
// --------------------------------------------------------------
router.get('/summary', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    if (req.emptyWorkspaceView) {
      const ref = req.query?.date ? new Date(`${req.query.date}T00:00:00Z`) : new Date();
      const weekKey = currentPeriodKey(ref);
      const monthPrefix = monthPrefixFromDate(ref);
      return res.json({ weekKey, prevWeekKey: previousPeriodKey(weekKey), monthPrefix, prevMonthPrefix: previousMonthPrefix(monthPrefix), clients: [], totals: aggregatePortfolioSummary([]) });
    }
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
             c.status, c.start_date, c.churn_date, c.created_at,
             s.name AS squad_name
        FROM clients c
        LEFT JOIN squads s ON s.id = c.squad_id
       WHERE c.status IN ('active', 'churn')
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

    const allClients = await query(clientSql, clientParams);
    const summaryBounds = monthBoundsFromPrefix(monthPrefix);
    const clients = allClients.filter((client) => summaryBounds && activeAt(client, summaryBounds.end));

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
      SELECT id, meta_lucro, status, start_date, churn_date, created_at
        FROM clients
       WHERE status IN ('active', 'churn')
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

    const potentialClients = await query(clientSql, clientParams);
    if (potentialClients.length === 0) return res.json({ months: [] });
    const activeClientsById = new Map(potentialClients.map((c) => [c.id, c]));

    const clientIds = potentialClients.map((c) => c.id);
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
      if (!clientStartedOnOrBeforePrefix(client, prefix) || !activeAtMonthEnd(client, prefix)) continue;
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
    for (const c of potentialClients) {
      const metaLucro = Number(c.meta_lucro) || 0;
      if (metaLucro <= 0) continue;
      if (!clientStartedOnOrBeforePrefix(c, refPrefix) || !activeAtMonthEnd(c, refPrefix)) continue;
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


router.get('/campaigns', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    if (req.emptyWorkspaceView) return res.json({ campaignsByClient: {}, campaigns: [] });
    await ensureMetricCampaignsSchema();
    const periodKey = String(req.query?.periodKey || '').trim();
    const clientIds = String(req.query?.clientIds || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 200);

    if (!PERIOD_KEY_RE.test(periodKey)) throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');
    if (clientIds.length === 0) return res.json({ campaignsByClient: {}, campaigns: [] });

    for (const clientId of clientIds) {
      await assertClientExists(clientId, req.user, 'metrics.view.all');
    }

    const placeholders = clientIds.map(() => '?').join(',');
    const rows = await query(
      `SELECT id, client_id, base_period_key, metric_period_key, name, created_by, created_at, updated_at
         FROM metric_campaigns
        WHERE base_period_key = ?
          AND client_id IN (${placeholders})
        ORDER BY created_at ASC, name ASC`,
      [periodKey, ...clientIds]
    );

    const campaigns = rows.map(serializeCampaign);
    const campaignsByClient = {};
    for (const clientId of clientIds) campaignsByClient[clientId] = [];
    for (const campaign of campaigns) {
      if (!campaignsByClient[campaign.clientId]) campaignsByClient[campaign.clientId] = [];
      campaignsByClient[campaign.clientId].push(campaign);
    }

    res.json({ campaignsByClient, campaigns });
  } catch (err) { next(err); }
});

router.post('/campaigns', requirePermission('metrics.fill_week'), async (req, res, next) => {
  try {
    await ensureMetricCampaignsSchema();
    const clientId = String(req.body?.clientId || '').trim();
    const periodKey = String(req.body?.periodKey || '').trim();
    if (!clientId) throw badRequest('clientId obrigatório');
    if (!PERIOD_KEY_RE.test(periodKey)) throw badRequest('periodKey inválido. Esperado YYYY-MM-Sw');

    const { clientMetaLucro } = await assertClientExists(clientId, req.user, 'metrics.fill_week.all');

    const existing = await query(
      `SELECT COUNT(*) AS total
         FROM metric_campaigns
        WHERE client_id = ? AND base_period_key = ?`,
      [clientId, periodKey]
    );
    const fallbackName = `Campanha ${(Number(existing?.[0]?.total) || 0) + 2}`;
    const name = normalizeCampaignName(req.body?.name, fallbackName);

    const result = await withTransaction(async (conn) => {
      const campaignId = uuid();
      const metricId = uuid();
      const metricPeriodKey = `${periodKey}__campaign:${campaignId}`;

      await conn.query(
        `INSERT INTO weekly_metrics (id, client_id, period_key, data)
         VALUES (?, ?, ?, ?)`,
        [metricId, clientId, metricPeriodKey, JSON.stringify({})]
      );

      await conn.query(
        `INSERT INTO metric_campaigns (id, client_id, base_period_key, metric_period_key, name, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [campaignId, clientId, periodKey, metricPeriodKey, name, req.user.id]
      );

      const [rows] = await conn.query(
        `SELECT id, client_id, base_period_key, metric_period_key, name, created_by, created_at, updated_at
           FROM metric_campaigns
          WHERE id = ? LIMIT 1`,
        [campaignId]
      );

      return {
        campaign: serializeCampaign(rows[0]),
        metric: {
          id: metricId,
          clientId,
          periodKey: metricPeriodKey,
          data: {},
          computed: computeWeeklyMetrics({}, { clientMetaLucro }),
          createdAt: null,
          updatedAt: null,
        },
      };
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.delete('/campaigns/:campaignId', requirePermission('metrics.fill_week'), async (req, res, next) => {
  try {
    await ensureMetricCampaignsSchema();
    const campaignId = String(req.params?.campaignId || '').trim();
    if (!campaignId) throw badRequest('campaignId obrigatório');

    const rows = await query(
      `SELECT id, client_id, metric_period_key
         FROM metric_campaigns
        WHERE id = ? LIMIT 1`,
      [campaignId]
    );
    if (rows.length === 0) throw notFound('Campanha não encontrada');

    await assertClientExists(rows[0].client_id, req.user, 'metrics.fill_week.all');

    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM metric_campaigns WHERE id = ?', [campaignId]);
      await conn.query(
        'DELETE FROM weekly_metrics WHERE client_id = ? AND period_key = ?',
        [rows[0].client_id, rows[0].metric_period_key]
      );
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:clientId', requirePermission('metrics.view'), async (req, res, next) => {
  try {
    if (req.emptyWorkspaceView) return res.json({ metrics: [] });
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
    if (req.emptyWorkspaceView) return res.json({ metric: null });
    const { clientId, periodKey } = req.params;
    if (!isMetricPeriodKey(periodKey)) {
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
    if (!isMetricPeriodKey(periodKey)) {
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

      for (const [key, value] of Object.entries(incomingData)) {
        if (value === null) delete merged[key];
      }

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

      const goalStatus = isCampaignMetricPeriodKey(periodKey) ? null : await recalcGoalStatus(conn, clientId, periodKey);

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
