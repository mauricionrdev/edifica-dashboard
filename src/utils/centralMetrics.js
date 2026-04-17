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
