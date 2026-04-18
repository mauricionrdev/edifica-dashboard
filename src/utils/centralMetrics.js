// ================================================================
//  Central metrics
//  Deriva as métricas do dashboard a partir da lista de clientes.
//  Fiel a getCentralMetrics() do protótipo, mas parametrizado por
//  período (year/month0) para suportar o seletor de mês.
//
//  Entrada: clients é o array retornado por GET /api/clients.
//  Campos relevantes por cliente: { status, fee, startDate, churnDate }.
// ================================================================

import { monthKey } from './format.js';

function parseClientDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthBounds(year, month0) {
  return {
    start: new Date(year, month0, 1, 0, 0, 0, 0),
    end: new Date(year, month0 + 1, 0, 23, 59, 59, 999),
  };
}

function startedOnOrBefore(client, date) {
  const start = parseClientDate(client.startDate);
  if (!start) return client.status !== 'churn';
  return Boolean(start && start <= date);
}

function churnedOnOrBefore(client, date) {
  const churn = parseClientDate(client.churnDate);
  return Boolean(churn && churn <= date);
}

function activeAt(client, date) {
  return startedOnOrBefore(client, date) && !churnedOnOrBefore(client, date);
}

function dateInMonth(value, year, month0) {
  const date = parseClientDate(value);
  return Boolean(
    date && date.getFullYear() === year && date.getMonth() === month0
  );
}

function periodWeekKey(year, month0, week) {
  return `${monthKey(year, month0)}-S${week}`;
}

function metricNumbers(metric) {
  const computed = metric?.computed || {};
  const data = metric?.data || {};
  return {
    closed: Number(computed.fec ?? data.fechados) || 0,
    leads: Number(computed.vol ?? data.volume) || 0,
    weeklyGoal: Number(computed.mLuc ?? data.metaLucro) || 0,
    projected: Number(computed.contratosPrevistos) || 0,
  };
}

function metricsForMonth(metrics = [], year, month0) {
  const prefix = monthKey(year, month0);
  return (Array.isArray(metrics) ? metrics : []).filter((metric) =>
    String(metric.periodKey || '').startsWith(`${prefix}-S`)
  );
}

function activeClientsAtEnd(clients, year, month0) {
  const { end } = monthBounds(year, month0);
  return (Array.isArray(clients) ? clients : []).filter((client) =>
    activeAt(client, end)
  );
}

function monthlyGoalForClient(client, monthMetrics) {
  const contractGoal = Number(client?.metaLucro) || 0;
  if (contractGoal > 0) return contractGoal;
  return monthMetrics.reduce(
    (sum, metric) => sum + metricNumbers(metric).weeklyGoal,
    0
  );
}

export function buildMarketingDashboardData(
  clients,
  metricsByClient,
  year,
  month0,
  selectedWeek = 1
) {
  const active = activeClientsAtEnd(clients, year, month0);
  const safeWeek = Math.min(Math.max(Number(selectedWeek) || 1, 1), 4);
  const weekKey = periodWeekKey(year, month0, safeWeek);

  const clientRows = active.map((client) => {
    const metrics = metricsByClient?.[client.id] || [];
    const monthMetrics = metricsForMonth(metrics, year, month0);
    const monthClosed = monthMetrics.reduce(
      (sum, metric) => sum + metricNumbers(metric).closed,
      0
    );
    const monthLeads = monthMetrics.reduce(
      (sum, metric) => sum + metricNumbers(metric).leads,
      0
    );
    const weekMetric = metrics.find((metric) => metric.periodKey === weekKey);
    const weekNumbers = metricNumbers(weekMetric);
    const monthlyGoal = monthlyGoalForClient(client, monthMetrics);
    const fallbackWeeklyGoal = monthlyGoal > 0 ? Math.ceil(monthlyGoal / 4) : 0;
    const weeklyGoal = weekNumbers.weeklyGoal || fallbackWeeklyGoal;
    const progress =
      monthlyGoal > 0 ? Math.min((monthClosed / monthlyGoal) * 100, 999) : 0;

    return {
      clientId: client.id,
      name: client.name || 'Cliente sem nome',
      squadName: client.squadName || client.squad || '',
      monthClosed,
      monthGoal: monthlyGoal,
      monthLeads,
      weekClosed: weekNumbers.closed,
      weekGoal: weeklyGoal,
      weekLeads: weekNumbers.leads,
      projected: weekNumbers.projected,
      progress,
      hit: monthlyGoal > 0 && monthClosed >= monthlyGoal,
      hasGoal: monthlyGoal > 0,
    };
  });

  const weekBreakdown = [1, 2, 3, 4].map((week) => {
    const key = periodWeekKey(year, month0, week);
    return active.reduce(
      (acc, client) => {
        const metrics = metricsByClient?.[client.id] || [];
        const monthMetrics = metricsForMonth(metrics, year, month0);
        const metric = metrics.find((item) => item.periodKey === key);
        const numbers = metricNumbers(metric);
        const monthlyGoal = monthlyGoalForClient(client, monthMetrics);
        acc.contracts += numbers.closed;
        acc.leads += numbers.leads;
        acc.ideal +=
          numbers.weeklyGoal ||
          (monthlyGoal > 0 ? Math.ceil(monthlyGoal / 4) : 0);
        return acc;
      },
      {
        label: `S${week}`,
        contracts: 0,
        leads: 0,
        ideal: 0,
        stretch: 0,
      }
    );
  }).map((row) => ({
    ...row,
    stretch: Math.max(row.ideal * 1.25, row.contracts),
  }));

  const totals = clientRows.reduce(
    (acc, row) => {
      acc.monthClosed += row.monthClosed;
      acc.monthGoal += row.monthGoal;
      acc.monthLeads += row.monthLeads;
      acc.weekClosed += row.weekClosed;
      acc.weekGoal += row.weekGoal;
      acc.weekLeads += row.weekLeads;
      acc.hitClients += row.hit ? 1 : 0;
      acc.clientsWithGoal += row.hasGoal ? 1 : 0;
      return acc;
    },
    {
      monthClosed: 0,
      monthGoal: 0,
      monthLeads: 0,
      weekClosed: 0,
      weekGoal: 0,
      weekLeads: 0,
      hitClients: 0,
      clientsWithGoal: 0,
    }
  );

  return {
    rows: clientRows,
    weekBreakdown,
    totals: {
      ...totals,
      monthProgress:
        totals.monthGoal > 0 ? (totals.monthClosed / totals.monthGoal) * 100 : 0,
      weekProgress:
        totals.weekGoal > 0 ? (totals.weekClosed / totals.weekGoal) * 100 : 0,
      conversion:
        totals.monthLeads > 0 ? (totals.monthClosed / totals.monthLeads) * 100 : 0,
      hitRate:
        totals.clientsWithGoal > 0
          ? (totals.hitClients / totals.clientsWithGoal) * 100
          : 0,
    },
  };
}

export function buildWeeklyGoalReport(marketingData) {
  return marketingData?.weekBreakdown || [];
}

export function buildClientGoalReport(marketingData, limit = 6) {
  return [...(marketingData?.rows || [])]
    .sort((a, b) => b.monthGoal - a.monthGoal || b.monthClosed - a.monthClosed)
    .slice(0, limit)
    .map((row) => ({
      label:
        row.name.length > 10
          ? `${row.name.slice(0, 9).trim()}…`
          : row.name,
      fullLabel: row.name,
      contracts: row.monthClosed,
      ideal: row.monthGoal,
      stretch: Math.max(row.monthGoal * 1.25, row.monthClosed),
    }));
}

/**
 * Métricas de um período específico.
 * Para "período corrente", passe ano/mês atuais.
 *
 * Regras (iguais ao protótipo):
 *  - active/total: estado atual (não depende do período).
 *  - mrr: soma de fee dos ativos (estado atual).
 *  - revenueNew/newCnt: clientes ativos cuja startDate cai no período.
 *  - revLost/churnedPeriodCnt: clientes churn cuja churnDate cai no período.
 *  - churnRate: churned / total (estado global).
 */
export function computeCentralMetrics(clients, year, month0) {
  const all = Array.isArray(clients) ? clients : [];
  const { start, end } = monthBounds(year, month0);
  const signedToDate = all.filter((client) => startedOnOrBefore(client, end));
  const active = signedToDate.filter((client) => activeAt(client, end));
  const activeAtStart = all.filter((client) => activeAt(client, start));

  const mrr = active.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  const newInPeriod = all.filter((c) => dateInMonth(c.startDate, year, month0));
  const revenueNew = newInPeriod.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  const churnedInPeriod = all.filter(
    (c) => c.status === 'churn' && dateInMonth(c.churnDate, year, month0)
  );
  const revLost = churnedInPeriod.reduce(
    (s, c) => s + (Number(c.fee) || 0),
    0
  );

  const churnRate =
    activeAtStart.length > 0
      ? (churnedInPeriod.length / activeAtStart.length) * 100
      : 0;

  return {
    active: active.length,
    total: signedToDate.length,
    churned: all.filter((c) => c.status === 'churn').length,
    mrr,
    revenueNew,
    newCnt: newInPeriod.length,
    revLost,
    churnedPeriodCnt: churnedInPeriod.length,
    churnRate,
  };
}

/**
 * Série dos últimos N meses (incluindo o mês informado como último).
 * Retorna: [{ y, m, label: 'Abr', cnt, mrr, isNow }]
 *   cnt = clientes ativos cuja startDate caiu no mês
 *   mrr = soma de fee desses clientes
 */
export function buildBarChartData(clients, year, month0, months = 6) {
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const all = Array.isArray(clients) ? clients : [];

  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    let y = year;
    let m = month0 - i;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    const added = all.filter((c) => dateInMonth(c.startDate, y, m));
    out.push({
      y,
      m,
      cnt: added.length,
      mrr: added.reduce((s, c) => s + (Number(c.fee) || 0), 0),
      isNow: y === nowY && m === nowM,
    });
  }
  return out;
}

/**
 * Série de contratos fechados por mês com metas derivadas do histórico real.
 * - contracts: quantidade de contratos iniciados no mês (startDate)
 * - ideal: média móvel do período visível, baseada nos contratos fechados
 * - stretch: melhor volume alcançado até o mês atual dentro da janela
 */
export function buildContractTrendData(clients, year, month0, months = 6) {
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const all = Array.isArray(clients) ? clients : [];

  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    let y = year;
    let m = month0 - i;
    while (m < 0) {
      m += 12;
      y -= 1;
    }

    const signed = all.filter((c) => dateInMonth(c.startDate, y, m));

    rows.push({
      y,
      m,
      cnt: signed.length,
      isNow: y === nowY && m === nowM,
    });
  }

  return rows.map((row, index) => {
    const slice = rows.slice(0, index + 1);
    const avgContracts =
      slice.reduce((acc, item) => acc + item.cnt, 0) / slice.length;
    const derivedIdeal = Math.max(
      row.cnt,
      Math.round(avgContracts * 1.6),
      row.cnt > 0 ? row.cnt + 8 : 0
    );
    const ideal = derivedIdeal;
    const stretch = Math.max(
      ideal,
      Math.round(ideal * 1.55),
      row.cnt > 0 ? row.cnt + 20 : 0
    );

    return {
      ...row,
      contracts: row.cnt,
      ideal,
      stretch,
    };
  });
}

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function weekdayIndexFromIso(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return -1;
  const weekday = date.getDay();
  if (weekday === 0) return -1;
  return weekday - 1;
}

export function buildWeeklyContractTrendData(clients, year, month0) {
  const all = Array.isArray(clients) ? clients : [];
  const prefix = monthKey(year, month0);

  const base = WEEKDAY_LABELS.map((label, index) => ({
    label,
    weekday: index,
    contracts: 0,
    ideal: 0,
    stretch: 0,
  }));

  all.forEach((client) => {
    if (!client.startDate || !String(client.startDate).startsWith(prefix)) return;
    const weekdayIndex = weekdayIndexFromIso(String(client.startDate).slice(0, 10));
    if (weekdayIndex < 0 || weekdayIndex > 5) return;
    const row = base[weekdayIndex];
    row.contracts += 1;
  });

  const bestDay = Math.max(...base.map((row) => row.contracts), 0);
  const totalContracts = base.reduce((sum, row) => sum + row.contracts, 0);
  const averageContracts = totalContracts / base.length;
  const dailyTarget = totalContracts > 0
    ? Math.max(6, Math.ceil(averageContracts * 4), bestDay * 2)
    : 0;

  return base.map((row) => {
    const ideal = dailyTarget > 0
      ? Math.max(
          Math.round(dailyTarget * 0.35),
          Math.round(dailyTarget * 0.55 + row.contracts * 4)
        )
      : 0;
    const stretch = dailyTarget > 0
      ? Math.max(
          Math.round(dailyTarget * 0.72),
          Math.round(ideal * 1.45 + row.contracts * 5)
        )
      : 0;

    return {
      ...row,
      ideal,
      stretch,
    };
  });
}

/**
 * Lista clientes ativos cujo endDate expira nos próximos `days` dias
 * contados de `today`. Ignora datas inválidas e clientes em churn.
 */
export function clientsEndingSoon(clients, days = 30, today = new Date()) {
  const all = Array.isArray(clients) ? clients : [];
  return all
    .map((c) => {
      if (!c.endDate || c.status === 'churn') return null;
      const end = new Date(c.endDate);
      if (Number.isNaN(end.getTime())) return null;
      const diff = Math.round((end - today) / (1000 * 60 * 60 * 24));
      if (diff < 0 || diff > days) return null;
      return { client: c, daysLeft: diff };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
