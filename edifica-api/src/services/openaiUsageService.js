import { query } from '../db/pool.js';
import { badRequest, uuid } from '../utils/helpers.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CACHE_MINUTES = Number(process.env.OPENAI_USAGE_CACHE_MINUTES || 30);

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function addMonths(date, months = 1) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function toMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function toPercent(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(1)) : 0;
}


function readAmount(result = {}) {
  const value = result.amount?.value ?? result.amount ?? result.value ?? result.cost ?? 0;
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sumCostsFromBuckets(buckets = []) {
  let total = 0;
  for (const bucket of buckets) {
    for (const result of bucket.results || []) {
      total += readAmount(result);
    }
  }
  return toMoney(total);
}

function safeName(name = '') {
  return String(name || '').replace(/^Projeto\s*-\s*/i, '').trim() || String(name || '').trim();
}

function createCacheKey(start, end) {
  return `openai-usage:${toDateOnly(start)}:${toDateOnly(end)}`;
}

function apiKey() {
  const key = process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_ADMIN_KEY || '';
  if (!key) {
    throw badRequest('OPENAI_ADMIN_KEY não configurada no backend.');
  }
  return key;
}

async function openaiGet(path, params = {}) {
  const url = new URL(`${OPENAI_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${text || response.statusText}`);
  }

  return response.json();
}

async function fetchAllPages(path, params = {}) {
  const data = [];
  let page = undefined;
  let after = undefined;

  for (let guard = 0; guard < 80; guard += 1) {
    const payload = await openaiGet(path, {
      ...params,
      ...(page ? { page } : {}),
      ...(after ? { after } : {}),
    });

    if (Array.isArray(payload.data)) data.push(...payload.data);

    page = payload.next_page || undefined;
    after = payload.last_id || payload.after || undefined;

    if (!payload.has_more && !page) break;
    if (!page && !after) break;
  }

  return data;
}

export async function ensureOpenAIUsageTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS openai_project_aliases (
      id VARCHAR(80) NOT NULL,
      openai_project_id VARCHAR(100) NOT NULL,
      openai_project_name VARCHAR(220) NOT NULL,
      display_name VARCHAR(220) NULL,
      project_type ENUM('project','legacy','internal') NOT NULL DEFAULT 'project',
      active TINYINT(1) NOT NULL DEFAULT 1,
      source ENUM('openai','manual','csv') NOT NULL DEFAULT 'openai',
      last_seen_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_openai_project_aliases_project_id (openai_project_id),
      KEY idx_openai_project_aliases_active (active),
      KEY idx_openai_project_aliases_type (project_type),
      KEY idx_openai_project_aliases_name (display_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS openai_usage_snapshots (
      id VARCHAR(80) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      cache_key VARCHAR(180) NOT NULL,
      payload_json JSON NOT NULL,
      source ENUM('openai','fallback') NOT NULL DEFAULT 'openai',
      forced TINYINT(1) NOT NULL DEFAULT 0,
      refreshed_by_user_id VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_openai_usage_snapshots_cache_key (cache_key),
      KEY idx_openai_usage_snapshots_period (period_start, period_end),
      KEY idx_openai_usage_snapshots_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function readJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeProject(project = {}) {
  const id = project.id || project.project_id || '';
  const name = project.name || project.openai_project_name || id;
  return {
    id,
    name,
    status: project.status || (project.archived_at ? 'archived' : 'active'),
    archivedAt: project.archived_at || project.archivedAt || null,
  };
}

async function listOpenAIProjects() {
  const raw = await fetchAllPages('/organization/projects', {
    limit: 100,
    include_archived: true,
  });

  return raw.map(normalizeProject).filter((item) => item.id);
}

async function listAliases() {
  await ensureOpenAIUsageTables();
  const rows = await query(
    `SELECT *
       FROM openai_project_aliases
      ORDER BY COALESCE(display_name, openai_project_name), openai_project_name`
  );
  return rows.map((row) => ({
    id: row.id,
    projectId: row.openai_project_id,
    projectName: row.openai_project_name,
    displayName: row.display_name || '',
    projectType: row.project_type || 'project',
    active: Boolean(row.active),
    source: row.source || 'openai',
    lastSeenAt: row.last_seen_at,
  }));
}

async function upsertProjectAliases(projects = []) {
  if (!projects.length) return;

  await ensureOpenAIUsageTables();

  for (const project of projects) {
    const projectType = String(project.name || '').toLowerCase() === 'default project' ? 'legacy' : 'project';
    await query(
      `INSERT INTO openai_project_aliases (
         id, openai_project_id, openai_project_name, display_name, project_type, active, source, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'openai', UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         openai_project_name = VALUES(openai_project_name),
         project_type = IF(project_type = 'legacy' OR VALUES(project_type) = 'legacy', 'legacy', project_type),
         active = IF(VALUES(active) = 0, active, active),
         last_seen_at = UTC_TIMESTAMP(),
         updated_at = UTC_TIMESTAMP()`,
      [
        project.id,
        project.id,
        project.name,
        safeName(project.name),
        projectType,
        project.status === 'archived' ? 0 : 1,
      ]
    );
  }
}

async function fetchCostsTotal(start, end) {
  const buckets = await fetchAllPages('/organization/costs', {
    start_time: toUnix(start),
    end_time: toUnix(end),
    bucket_width: '1d',
    limit: 180,
  });

  return {
    total: sumCostsFromBuckets(buckets),
    bucketCount: buckets.length,
  };
}

async function fetchCostsByProject(start, end) {
  const buckets = await fetchAllPages('/organization/costs', {
    start_time: toUnix(start),
    end_time: toUnix(end),
    bucket_width: '1d',
    group_by: ['project_id'],
    limit: 180,
  });

  const byProject = new Map();

  for (const bucket of buckets) {
    for (const result of bucket.results || []) {
      const projectId = result.project_id || 'unknown';
      const value = readAmount(result);
      if (!Number.isFinite(value)) continue;
      byProject.set(projectId, toMoney((byProject.get(projectId)?.spend || 0) + value));
    }
  }

  return {
    byProject,
    groupedTotal: toMoney(Array.from(byProject.values()).reduce((sum, value) => sum + Number(value || 0), 0)),
    bucketCount: buckets.length,
  };
}

async function fetchCostsByProjectLineItem(start, end) {
  const buckets = await fetchAllPages('/organization/costs', {
    start_time: toUnix(start),
    end_time: toUnix(end),
    bucket_width: '1d',
    group_by: ['project_id', 'line_item'],
    limit: 180,
  });

  const byProject = new Map();
  const lineItems = [];

  for (const bucket of buckets) {
    for (const result of bucket.results || []) {
      const projectId = result.project_id || 'unknown';
      const lineItem = result.line_item || 'unclassified';
      const value = readAmount(result);
      if (!Number.isFinite(value)) continue;

      byProject.set(projectId, toMoney((byProject.get(projectId)?.spend || 0) + value));
      lineItems.push({
        projectId,
        lineItem,
        spend: toMoney(value),
      });
    }
  }

  return {
    byProject,
    lineItems,
    groupedTotal: toMoney(Array.from(byProject.values()).reduce((sum, value) => sum + Number(value || 0), 0)),
    bucketCount: buckets.length,
  };
}

async function fetchUsageByProject(start, end) {
  const buckets = await fetchAllPages('/organization/usage/completions', {
    start_time: toUnix(start),
    end_time: toUnix(end),
    bucket_width: '1d',
    group_by: ['project_id'],
    limit: 31,
  });

  const byProject = new Map();

  for (const bucket of buckets) {
    for (const result of bucket.results || []) {
      const projectId = result.project_id || 'unknown';
      const current = byProject.get(projectId) || {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requests: 0,
      };

      const inputTokens = Number(result.input_tokens || 0);
      const outputTokens = Number(result.output_tokens || 0);
      const requests = Number(result.num_model_requests || 0);

      current.inputTokens += Number.isFinite(inputTokens) ? inputTokens : 0;
      current.outputTokens += Number.isFinite(outputTokens) ? outputTokens : 0;
      current.totalTokens += (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0);
      current.requests += Number.isFinite(requests) ? requests : 0;

      byProject.set(projectId, current);
    }
  }

  return byProject;
}

async function latestSnapshot(cacheKey, ttlMinutes = DEFAULT_CACHE_MINUTES) {
  await ensureOpenAIUsageTables();

  const rows = await query(
    `SELECT payload_json, created_at
       FROM openai_usage_snapshots
      WHERE cache_key = ?
        AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
      ORDER BY created_at DESC
      LIMIT 1`,
    [cacheKey, Math.max(1, Number(ttlMinutes) || DEFAULT_CACHE_MINUTES)]
  );

  const row = rows[0];
  if (!row) return null;

  const payload = readJson(row.payload_json, null);
  if (!payload) return null;

  return {
    ...payload,
    cached: true,
    lastUpdatedAt: row.created_at,
  };
}

async function saveSnapshot({ cacheKey, start, end, payload, forced = false, userId = null }) {
  await ensureOpenAIUsageTables();

  await query(
    `INSERT INTO openai_usage_snapshots (
       id, period_start, period_end, cache_key, payload_json, source, forced, refreshed_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 'openai', ?, ?)
     ON DUPLICATE KEY UPDATE
       payload_json = VALUES(payload_json),
       source = VALUES(source),
       forced = VALUES(forced),
       refreshed_by_user_id = VALUES(refreshed_by_user_id),
       created_at = UTC_TIMESTAMP()`,
    [
      uuid(),
      toDateOnly(start),
      toDateOnly(end),
      cacheKey,
      JSON.stringify(payload),
      forced ? 1 : 0,
      userId,
    ]
  );
}

function buildReport({ start, end, projects, aliases, costsByProject, usageByProject, costSummary = {}, lineItemSummary = {} }) {
  const aliasByProject = new Map(aliases.map((item) => [item.projectId, item]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const allProjectIds = new Set([
    ...projects.map((project) => project.id),
    ...Array.from(costsByProject.keys()),
    ...Array.from(usageByProject.keys()),
    ...aliases.map((item) => item.projectId),
  ]);

  const entries = Array.from(allProjectIds)
    .filter(Boolean)
    .map((projectId) => {
      const project = projectById.get(projectId) || {};
      const alias = aliasByProject.get(projectId) || {};
      const projectName = project.name || alias.projectName || projectId;
      const displayName = alias.displayName || safeName(projectName) || projectId;
      const spend = toMoney(costsByProject.get(projectId) || 0);
      const usage = usageByProject.get(projectId) || {};
      const isLegacy = alias.projectType === 'legacy' || String(projectName).toLowerCase() === 'default project';

      return {
        projectId,
        projectName,
        name: displayName,
        client: displayName,
        type: isLegacy ? 'legacy' : (alias.projectType || 'project'),
        status: project.status || (alias.active === false ? 'inactive' : 'active'),
        isLegacy,
        spend,
        inputTokens: Number(usage.inputTokens || 0),
        outputTokens: Number(usage.outputTokens || 0),
        totalTokens: Number(usage.totalTokens || 0),
        requests: Number(usage.requests || 0),
      };
    });

  const legacyProject = entries.find((entry) => entry.isLegacy) || null;
  const projectEntries = entries.filter((entry) => !entry.isLegacy);
  const rows = projectEntries
    .filter((entry) => entry.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  const zeroSpendProjects = projectEntries
    .filter((entry) => entry.spend <= 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const groupedProjectSpend = toMoney(entries.reduce((sum, item) => sum + item.spend, 0));
  const totalSpend = costSummary.total != null ? toMoney(costSummary.total) : groupedProjectSpend;
  const activeProjectSpend = toMoney(rows.reduce((sum, item) => sum + item.spend, 0));
  const unclassifiedSpend = toMoney(Math.max(0, totalSpend - groupedProjectSpend));
  const totalTokens = rows.reduce((sum, item) => sum + item.totalTokens, 0);
  const totalRequests = rows.reduce((sum, item) => sum + item.requests, 0);

  const ranked = rows.map((row) => ({
    ...row,
    shareOfActive: activeProjectSpend ? toPercent((row.spend / activeProjectSpend) * 100) : 0,
    shareOfTotal: totalSpend ? toPercent((row.spend / totalSpend) * 100) : 0,
  }));

  const topThreeSpend = toMoney(ranked.slice(0, 3).reduce((sum, row) => sum + row.spend, 0));

  return {
    title: 'Relatório de Uso por API Key',
    organization: process.env.OPENAI_ORG_NAME || 'Edifica',
    source: 'OpenAI Admin API',
    period: {
      start: toDateOnly(start),
      end: toDateOnly(end),
      label: `${toDateOnly(start)} até ${toDateOnly(end)}`,
    },
    totalSpend,
    activeProjectSpend,
    activeClientSpend: activeProjectSpend,
    groupedProjectSpend,
    unclassifiedSpend,
    totalTokens,
    totalRequests,
    totalProjects: projectEntries.length,
    activeProjects: projectEntries.length,
    projectsWithSpend: ranked.length,
    activeClientsWithSpend: ranked.length,
    zeroSpendCount: zeroSpendProjects.length,
    zeroSpendProjects: zeroSpendProjects.map((project) => project.name),
    zeroSpendProjectDetails: zeroSpendProjects,
    legacyProject: legacyProject
      ? {
          ...legacyProject,
          percentOfTotal: totalSpend ? toPercent((legacyProject.spend / totalSpend) * 100) : 0,
          note: 'Projeto legado separado dos projetos atuais',
        }
      : null,
    rows: ranked,
    observations: {
      topProject: ranked[0] || null,
      bottomProject: ranked[ranked.length - 1] || null,
      topThreeSpend,
      topThreeShare: activeProjectSpend ? toPercent((topThreeSpend / activeProjectSpend) * 100) : 0,
    },
    reconciliation: {
      costsTotalFromOpenAI: totalSpend,
      costsGroupedByProject: costSummary.groupedTotal ?? groupedProjectSpend,
      costsGroupedByProjectLineItem: lineItemSummary.groupedTotal ?? null,
      difference: toMoney(totalSpend - (costSummary.groupedTotal ?? groupedProjectSpend)),
      unclassifiedSpend,
      projectCostBucketCount: costSummary.bucketCount ?? null,
      lineItemBucketCount: lineItemSummary.bucketCount ?? null,
    },
    lastUpdatedAt: new Date().toISOString(),
    cached: false,
  };
}

export async function syncOpenAIProjects() {
  const projects = await listOpenAIProjects();
  await upsertProjectAliases(projects);
  return listAliases();
}

export async function getOpenAIProjects() {
  const projects = await listOpenAIProjects();
  await upsertProjectAliases(projects);
  return listAliases();
}

export async function getOpenAIUsageReport({ start: startValue, end: endValue, force = false, userId = null } = {}) {
  const defaultStart = startOfCurrentMonth();
  const start = parseDate(startValue, defaultStart);
  const end = parseDate(endValue, addMonths(start, 1));

  if (end <= start) {
    throw badRequest('Período inválido para relatório OpenAI.');
  }

  const cacheKey = createCacheKey(start, end);
  if (!force) {
    const cached = await latestSnapshot(cacheKey);
    if (cached) return cached;
  }

  const projects = await listOpenAIProjects();
  await upsertProjectAliases(projects);
  const aliases = await listAliases();

  const [totalCostSummary, projectCostSummary, lineItemSummary, usageByProject] = await Promise.all([
    fetchCostsTotal(start, end),
    fetchCostsByProject(start, end),
    fetchCostsByProjectLineItem(start, end).catch(() => ({ byProject: new Map(), lineItems: [], groupedTotal: null, bucketCount: null })),
    fetchUsageByProject(start, end).catch(() => new Map()),
  ]);

  const costsByProject = projectCostSummary.byProject;

  const report = buildReport({
    start,
    end,
    projects,
    aliases,
    costsByProject,
    usageByProject,
    costSummary: { ...totalCostSummary, groupedTotal: projectCostSummary.groupedTotal, bucketCount: projectCostSummary.bucketCount },
    lineItemSummary,
  });

  await saveSnapshot({ cacheKey, start, end, payload: report, forced: force, userId });

  return report;
}

export async function getOpenAIUsageDebug({ start: startValue, end: endValue } = {}) {
  const defaultStart = startOfCurrentMonth();
  const start = parseDate(startValue, defaultStart);
  const end = parseDate(endValue, addMonths(start, 1));

  if (end <= start) {
    throw badRequest('Período inválido para diagnóstico OpenAI.');
  }

  const projects = await listOpenAIProjects();
  await upsertProjectAliases(projects);

  const [totalCostSummary, projectCostSummary, lineItemSummary] = await Promise.all([
    fetchCostsTotal(start, end),
    fetchCostsByProject(start, end),
    fetchCostsByProjectLineItem(start, end),
  ]);

  const byProjectRows = Array.from(projectCostSummary.byProject.entries())
    .map(([projectId, spend]) => {
      const project = projects.find((item) => item.id === projectId);
      return {
        projectId,
        projectName: project?.name || projectId,
        name: safeName(project?.name || projectId),
        spend,
      };
    })
    .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));

  return {
    period: {
      start: toDateOnly(start),
      end: toDateOnly(end),
    },
    projectsCount: projects.length,
    costsTotalFromOpenAI: totalCostSummary.total,
    costsGroupedByProject: projectCostSummary.groupedTotal,
    costsGroupedByProjectLineItem: lineItemSummary.groupedTotal,
    differenceTotalVsProject: toMoney(totalCostSummary.total - projectCostSummary.groupedTotal),
    differenceProjectVsLineItem: lineItemSummary.groupedTotal == null ? null : toMoney(projectCostSummary.groupedTotal - lineItemSummary.groupedTotal),
    byProjectRows,
    lineItems: lineItemSummary.lineItems,
    bucketCounts: {
      total: totalCostSummary.bucketCount,
      project: projectCostSummary.bucketCount,
      projectLineItem: lineItemSummary.bucketCount,
    },
  };
}
