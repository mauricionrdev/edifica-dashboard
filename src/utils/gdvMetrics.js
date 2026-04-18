// ================================================================
//  GDV metrics helpers
//  Portados do `calcM`, `buildAgg`, `getPri`, `sortByPri`, `sqPct`
//  do frontend real (legacy.js), adaptados para trabalhar com os
//  dados que vêm do backend (GET /metrics/:id/:periodKey).
//
//  CONVENÇÕES:
//  - periodKey = 'YYYY-MM-Sw' (w = 1..4).
//  - metric.data contém os 8 inputs: investimento, cpl, volume, fechados,
//    metaLucro, metaEmpate, metaVolume, metaCpl.
//  - metric.computed contém agregados já calculados pelo backend:
//    leadsPrevistos, taxaConversao, contratosPrevistos, isHit, weekStatus.
//
//  Ainda assim, recomputamos localmente em algumas funções para ficar
//  desacoplado do shape exato do `computed` — o backend pode mudar
//  de nome de chave sem quebrar a tela.
// ================================================================

export const GDV_TARGET = 70; // % mínima de clientes batendo meta

/**
 * Cálculo unitário por cliente × semana, compatível com `calcM` do legado.
 *
 * Recebe o `metric` retornado pelo backend ({ data, computed }) e produz
 * um objeto com todos os derivados usados pela tela, mesmo que computed
 * esteja vazio (ex: período sem preenchimento).
 */
export function calcWeek(metric) {
  const data = metric?.data || {};

  const inv = Number(data.investimento) || 0;
  const cpl = Number(data.cpl) || 0;
  const vol = Number(data.volume) || 0;
  const fec = Number(data.fechados) || 0;
  const mLuc = Number(data.metaLucro) || 0;
  const mEmp = Number(data.metaEmpate) || 0;
  const mVol = Number(data.metaVolume) || 0;
  const mCpl = Number(data.metaCpl) || 0;

  const lp = inv > 0 && cpl > 0 ? inv / cpl : 0;
  const taxa = fec > 0 && vol > 0 ? (fec / vol) * 100 : 0;
  const cp = lp > 0 && taxa > 0 ? lp * (taxa / 100) : 0;

  return {
    // inputs
    inv,
    cpl,
    vol,
    fec,
    mLuc,
    mEmp,
    mVol,
    mCpl,
    // derivados
    lp, // leadsPrevistos
    taxa, // taxa de conversão (%)
    cp, // contratos previstos
    // flags
    isHit: cp > 0 && mLuc > 0 && cp >= mLuc,
    cplOk: cpl > 0 && mCpl > 0 && cpl <= mCpl,
    volOk: lp > 0 && mVol > 0 && lp >= mVol,
    // presença de dados (útil pra saber se o cliente já preencheu a semana)
    hasData:
      inv > 0 || cpl > 0 || vol > 0 || fec > 0 || mLuc > 0 || mEmp > 0,
  };
}

/**
 * Agregação da carteira (equivalente a `buildAgg` do legado).
 *
 * `clientMetrics` = array de { client, metric, calc } já individualizados
 * por semana. Retorna totais absolutos + taxas agregadas + hit count.
 */
export function aggregateCarteira(clientMetrics) {
  let tF = 0,
    tLp = 0,
    tVol = 0,
    tInv = 0,
    tCp = 0,
    tEmp = 0,
    tLuc = 0,
    tMV = 0,
    sMC = 0,
    cMC = 0,
    hit = 0,
    filled = 0;

  for (const row of clientMetrics) {
    const m = row.calc;
    tF += m.fec;
    tLp += m.lp;
    tVol += m.vol;
    tInv += m.inv;
    tCp += m.cp;
    tEmp += m.mEmp;
    tLuc += m.mLuc;
    if (m.mVol) tMV += m.mVol;
    if (m.mCpl) {
      sMC += m.mCpl;
      cMC += 1;
    }
    if (m.isHit) hit += 1;
    if (m.hasData) filled += 1;
  }

  const taxa = tVol > 0 && tF > 0 ? (tF / tVol) * 100 : 0;
  const cpl = tVol > 0 ? tInv / tVol : 0;

  return {
    tF,
    tLp,
    tVol,
    tInv,
    tCp,
    tEmp,
    tLuc,
    tMV,
    taxa,
    cpl,
    avgMC: cMC ? sMC / cMC : 0, // CPL-meta médio da carteira
    hit,
    total: clientMetrics.length,
    filled, // quantos preencheram a semana
  };
}

/**
 * Priorização por cliente (equivalente a `getPri` do legado).
 *
 * Retorna score (quanto maior → mais crítico), label e classe CSS.
 */
export function getPriority(calc) {
  if (!calc || !calc.mLuc) {
    return { score: 999, label: 'Sem dados', cls: 'pri-n' };
  }
  if (calc.cp >= calc.mLuc) {
    return { score: 0, label: 'Meta ok', cls: 'pri-l' };
  }
  const pct = (calc.mLuc - calc.cp) / calc.mLuc;
  if (pct > 0.5) return { score: pct, label: 'Prioridade Alta', cls: 'pri-h' };
  if (pct > 0.15)
    return { score: pct, label: 'Prioridade Média', cls: 'pri-m' };
  return { score: pct, label: 'Prioridade Baixa', cls: 'pri-l' };
}

/**
 * Ordena array de { client, metric, calc } por prioridade DESC.
 * Clientes em risco aparecem primeiro — exatamente o que o GDV quer ver.
 */
export function sortByPriority(rows) {
  return [...rows].sort(
    (a, b) => getPriority(b.calc).score - getPriority(a.calc).score
  );
}

/**
 * Percentual da carteira que deve bater meta.
 * Retorna null se não houver clientes.
 */
export function hitRate(rows) {
  if (!rows.length) return null;
  const h = rows.reduce((acc, r) => acc + (r.calc.isHit ? 1 : 0), 0);
  return { h, t: rows.length, pct: Math.round((h / rows.length) * 100) };
}

/**
 * Monta periodKey no formato 'YYYY-MM-Sw'.
 */
export function buildPeriodKey(year, month0, week) {
  const m = String(month0 + 1).padStart(2, '0');
  return `${year}-${m}-S${week}`;
}

/**
 * Dado um periodKey, retorna { year, month0, week } ou null se inválido.
 */
export function parsePeriodKey(key) {
  const re = /^(\d{4})-(\d{2})-S([1-4])$/;
  const m = re.exec(String(key || ''));
  if (!m) return null;
  return {
    year: Number(m[1]),
    month0: Number(m[2]) - 1,
    week: Number(m[3]),
  };
}

/**
 * Descobre a semana atual do mês (1..4) baseado no dia.
 *   dias 1–7   -> S1
 *   dias 8–14  -> S2
 *   dias 15–21 -> S3
 *   dias 22+   -> S4
 */
export function currentWeek(date = new Date()) {
  const day = date.getDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}
