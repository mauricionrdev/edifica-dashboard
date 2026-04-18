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

function isActive(c) {
  return c.status !== 'churn';
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
  const active = all.filter(isActive);
  const churned = all.filter((c) => c.status === 'churn');

  const mrr = active.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  const prefix = monthKey(year, month0);

  const newInPeriod = active.filter(
    (c) => c.startDate && String(c.startDate).startsWith(prefix)
  );
  const revenueNew = newInPeriod.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  const churnedInPeriod = churned.filter(
    (c) => c.churnDate && String(c.churnDate).startsWith(prefix)
  );
  const revLost = churnedInPeriod.reduce(
    (s, c) => s + (Number(c.fee) || 0),
    0
  );

  const churnRate =
    all.length > 0 ? (churned.length / all.length) * 100 : 0;

  return {
    active: active.length,
    total: all.length,
    churned: churned.length,
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
    const prefix = monthKey(y, m);
    const added = all.filter(
      (c) =>
        isActive(c) &&
        c.startDate &&
        String(c.startDate).startsWith(prefix)
    );
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

    const prefix = monthKey(y, m);
    const signed = all.filter(
      (c) =>
        isActive(c) &&
        c.startDate &&
        String(c.startDate).startsWith(prefix)
    );

    rows.push({
      y,
      m,
      cnt: signed.length,
      contractGoal: signed.reduce(
        (sum, client) => sum + (Number(client.metaLucro) || 0),
        0
      ),
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
    const ideal = row.contractGoal > 0 ? row.contractGoal : derivedIdeal;
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
    if (client.status === 'churn') return;
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
