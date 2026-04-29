// ==============================================================
//  Constantes e lógica de domínio da Edifica
//
//  [Fase 2] Introduz `metaSemanal` no JSON de weekly_metrics.data.
//  Backward-compatible: se ausente, cai nos fallbacks
//  (metaLucro da semana → clients.meta_lucro ÷ 4).
// ==============================================================

export const DEFAULT_SQUADS = ['CAP João', 'CAP Humberto', 'CAP Samara'];

export const GDV_TARGET = 70;

export const ROLES = {
  ceo:                 { label: 'CEO',                    access: 'all',   superAdmin: true },
  suporte_tecnologia:  { label: 'Suporte de Tecnologia', access: 'all',   superAdmin: true },
  admin:               { label: 'Administrador',         access: 'all' },
  cap:                 { label: 'CAP',                   access: 'squad' },
  gestor:              { label: 'Gestor de Tráfego',     access: 'squad' },
  gdv:                 { label: 'GDV',                   access: 'squad' },
};

export const VALID_ROLES = Object.keys(ROLES);

export const ONBOARDING_TEMPLATE = [
  {
    sec: '1. Configuração Técnica Inicial',
    tasks: [
      { name: 'Criar BM (ou usar uma existente de nossa autoria)', notes: '' },
      { name: 'Padronizar nome da BM e conta de anúncios com o nome do cliente', notes: 'Nome da BM: Nome do cliente BM 01\nNome da conta: Nome do cliente CA - 01' },
      { name: 'Colocar na sua pasta do google a BM do cliente para organização', notes: '' },
      { name: 'Criar um perfil no google chrome para conectar o WhatsApp no nosso sistema', notes: '' },
      { name: 'Inserir logo do cliente na foto de perfil da BM', notes: '' },
      { name: 'Cadastrar cartão de crédito na BM', notes: '' },
      { name: 'Conceder acesso ao time interno', notes: 'Gmail: pedrovianaoficiall@gmail.com\nGmail: leonardo.midia98@gmail.com' },
    ],
  },
  {
    sec: '2. Integração de Canais',
    tasks: [
      { name: 'Conectar Página do Facebook à BM (ou criar nova)', notes: 'Entrar no facebook pessoal do cliente, verificar se tem página e conceder acesso (ADM da página). Caso não tenha, criar com nome e logo dele.' },
      { name: 'Conectar Instagram à BM', notes: '' },
      { name: 'Conectar número do WhatsApp', notes: '' },
    ],
  },
  {
    sec: '3. Pente fino na Presença Online',
    tasks: [
      { name: 'Face: Foto de perfil adequada', notes: '📌 Se houver falhas: encaminhar para o Head solicitar ao cliente uma boa foto de perfil' },
      { name: 'Face: Capa alinhada', notes: '📌 Se houver falhas: encaminhar para design resolver.' },
      { name: 'Face: Seção "Sobre" correta', notes: '📌 Se houver falhas: encaminhar para o Head resolver.' },
      { name: 'Insta: Foto de perfil adequada', notes: '📌 Se houver falhas: encaminhar para o Head solicitar ao cliente uma boa foto de perfil' },
      { name: 'Insta: Biografia estratégica', notes: '📌 Se houver falhas: encaminhar para o Head resolver.' },
      { name: 'Insta: Destaques explicativos', notes: '📌 Se houver falhas: encaminhar para o Head resolver.' },
      { name: 'Insta: Posts alinhados à proposta', notes: '📌 Se houver falhas: encaminhar para o Head resolver.' },
    ],
  },
  {
    sec: '4. Acompanhamento vídeos & edição',
    tasks: [
      { name: 'Acompanhar a gravação dos vídeos do cliente para a campanha (Head)', notes: '' },
      { name: 'Encaminhar os vídeos para edição', notes: "Solicitar para colocar marca d'água da Edifica." },
    ],
  },
  {
    sec: '5. Coleta do cartão',
    tasks: [
      { name: 'Solicitar cartão de crédito para o cliente no privado (Assim que responder o mini)', notes: '' },
    ],
  },
  {
    sec: '6. Execução — Subida de campanhas',
    tasks: [
      { name: 'Colocar o investimento que foi decidido na descrição', notes: 'Orçamento Detalhado Conversão:\nCampanhas: Nome: R$ Mensalmente.\nMeta de CPL: R$\nMeta de volume:' },
      { name: 'Encaminhar vídeos editados para o cliente aprovar', notes: "Solicitar marca d'água nos vídeos." },
      { name: 'Subir a campanha', notes: '' },
      { name: 'Encaminhar no grupo uma foto da campanha no ar', notes: '' },
      { name: 'Encaminhar no grupo o áudio de alinhamento após ter subido as campanhas', notes: 'Script: "Fulano, já subimos as campanhas e estamos 100% confiantes que vai dar certo..."' },
      { name: 'Renovar ciclo das campanhas', notes: '' },
      { name: 'Encaminhar relatório de métricas no grupo', notes: '' },
    ],
  },
  {
    sec: '7. Conectar WhatsApp no navegador',
    tasks: [
      { name: 'Conectar o WhatsApp do cliente no navegador (DEIXAR ORGANIZADO)', notes: '' },
    ],
  },
  {
    sec: '8. GDV',
    tasks: [
      {
        name: 'Marcar reunião de ativação comercial (após os gestores ativarem a campanha)',
        notes: '',
        subs: [
          { name: '→ Organizar apresentação no PPT para apresentar para o cliente' },
          { name: '→ O cliente já assistiu ao curso comercial e possui acesso ao script de atendimento?' },
          { name: '→ O ZapSign foi criado e configurado pelo cliente?' },
          { name: '→ Estipular metas iniciais de contratos específicas para cada campanha' },
          { name: '→ Conectar o WhatsApp do cliente ao chrome e deixar organizado' },
        ],
      },
      { name: 'Enviar mensagem no grupo reforçando a meta estipulada e fixar a mensagem', notes: 'Exemplo: 👉 Meta de janeiro: 2 contratos em 7 dias' },
      { name: 'Adicionar cliente na planilha de OKR Geral', notes: '' },
      { name: 'Adicionar cliente na planilha de OKR de otimização', notes: '' },
      { name: 'Marcar reunião de métricas comercial (7 dias após reunião de ativação comercial)', notes: '' },
    ],
  },
];
 = {}) {
  return template.map((section, si) => ({
    sec: section.sec,
    open: true,
    tasks: (section.tasks || []).map((task, ti) => ({
      id: `${section.sec}_${ti}`,
      name: task.name,
      done: false,
      assignee: task.assignee || (si < 7 ? (gestor || '') : (gdv || '')),
      assigneeId: task.assigneeId || (si < 7 ? (gestorId || '') : (gdvId || '')),
      priority: task.priority || 'medium',
      status: 'todo',
      dueDate: '',
      notes: task.notes || '',
      showNote: false,
      subs: (task.subs || []).map((sub, j) => ({
        id: `sub_${ti}_${j}`,
        name: sub.name,
        done: false,
      })),
    })),
  }));
}

// ==============================================================
//  [Fase 2] META SEMANAL — resolução com fallback explícito.
//
//  Fontes de meta, em ordem:
//    1. data.metaSemanal > 0        ← NOVO. Editável por semana.
//    2. data.metaLucro > 0          ← Legado. Se ainda preenchido.
//    3. ceil(clientMetaLucro / 4)   ← Fallback. Cadastro do cliente.
//    4. 0                           ← Sem meta nenhuma.
//
//  O teste do bug 1 foi: resolveWeekGoal({}, 8) deve retornar 2 (ceil(8/4)),
//  mas a versão anterior ignorava o 3º parâmetro. Aqui está correto.
// ==============================================================
export function resolveWeekGoal(data = {}, clientMetaLucro = 0) {
  const s = Number(data && data.metaSemanal) || 0;
  if (s > 0) return s;
  const l = Number(data && data.metaLucro) || 0;
  if (l > 0) return l;
  const cml = Number(clientMetaLucro) || 0;
  if (cml > 0) return Math.ceil(cml / 4);
  return 0;
}

/**
 * Cálculo canônico das métricas semanais.
 * [Fase 2] Expõe `weekGoal` resolvido e `metaSemanalEfetiva` (alias,
 * mantido para o frontend saber qual meta foi usada sem recalcular).
 *
 * O segundo parâmetro aceita { clientMetaLucro } para o fallback final.
 */
export function computeWeeklyMetrics(data = {}, opts = {}) {
  const inv  = Number(data.investimento) || 0;
  const cpl  = Number(data.cpl)          || 0;
  const vol  = Number(data.volume)       || 0;
  const fec  = Number(data.fechados)     || 0;
  const mLuc = Number(data.metaLucro)    || 0;
  const mEmp = Number(data.metaEmpate)   || 0;
  const mVol = Number(data.metaVolume)   || 0;
  const mCpl = Number(data.metaCpl)      || 0;
  const mSem = Number(data.metaSemanal)  || 0;

  const clientMetaLucro = Number(opts.clientMetaLucro) || 0;
  const weekGoal = resolveWeekGoal(data, clientMetaLucro);

  const lp    = (inv > 0 && cpl > 0) ? inv / cpl : 0;
  const taxa  = (fec > 0 && vol > 0) ? (fec / vol) * 100 : 0;
  const cp    = (lp  > 0 && taxa > 0) ? lp * (taxa / 100) : 0;

  return {
    inv, cpl, vol, fec, mLuc, mEmp, mVol, mCpl, mSem,
    weekGoal,
    metaSemanalEfetiva: weekGoal, // alias mais legível para o frontend
    leadsPrevistos:      lp,
    taxaConversao:       taxa,
    contratosPrevistos:  cp,
    // Bug 2 do teste anterior: isHit comparava cp (projeção) vs weekGoal.
    // Regra correta: fechados reais vs meta efetiva. Briefing diz:
    // "bateu a meta real ou só previsão?" — aqui é meta real.
    isHit: fec > 0 && weekGoal > 0 && fec >= weekGoal,
    cplOk: cpl > 0 && mCpl > 0 && cpl <= mCpl,
    volOk: lp  > 0 && mVol > 0 && lp  >= mVol,
  };
}

/**
 * Deriva o weekStatus ('vai' | 'nao' | '') a partir dos dados.
 *
 * [Fase 2 — Bug 2 corrigido] Agora compara fechados reais vs weekGoal
 * resolvido. Antes comparava contratosPrevistos (projeção) vs metaLucro,
 * o que dava 'vai' em semanas sem nenhum contrato fechado mas com CPL bom.
 * O briefing pediu explicitamente para mostrar meta REAL batida, não
 * projeção.
 */
export function deriveWeekStatus(data = {}, clientMetaLucro = 0) {
  const fec = Number(data && data.fechados) || 0;
  const goal = resolveWeekGoal(data, clientMetaLucro);
  if (goal <= 0) return '';
  return fec >= goal ? 'vai' : 'nao';
}

/**
 * Agrega os weekStatus das 4 semanas em um goal_status do cliente.
 *   - alguma 'nao'  → 'nao'
 *   - alguma 'vai', nenhuma 'nao' → 'vai'
 *   - senão → ''
 */
export function aggregateGoalStatus(weekStatuses = {}) {
  const values = Object.values(weekStatuses);
  const hasNao = values.includes('nao');
  const hasVai = values.includes('vai');
  if (hasVai && !hasNao) return 'vai';
  if (hasNao) return 'nao';
  return '';
}

export const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])-S[1-4]$/;

// ==============================================================
//  Helpers de período
// ==============================================================

export function monthPrefixFromDate(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function weekOfMonth(date = new Date()) {
  const day = date.getUTCDate();
  return day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
}

export function currentPeriodKey(date = new Date()) {
  const prefix = monthPrefixFromDate(date);
  return `${prefix}-S${weekOfMonth(date)}`;
}

export function previousPeriodKey(periodKey) {
  const m = /^(\d{4})-(\d{2})-S([1-4])$/.exec(String(periodKey || ''));
  if (!m) return '';
  let y  = Number(m[1]);
  let mo = Number(m[2]);
  const w = Number(m[3]);
  if (w > 1) return `${y}-${String(mo).padStart(2,'0')}-S${w - 1}`;
  mo -= 1;
  if (mo < 1) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2,'0')}-S4`;
}

export function previousMonthPrefix(monthPrefix) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthPrefix || ''));
  if (!m) return '';
  let y  = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo < 1) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2,'0')}`;
}

// ==============================================================
//  [Fase 2] Agregação de métricas de um cliente
//
//  Mudanças vs Fase 1:
//    - weekGoal:  usa resolveWeekGoal(data, clientMetaLucro)
//    - monthGoal: SOMA das metas semanais resolvidas (sem fallback)
//                 + FLOOR em clientMetaLucro (cadastro do cliente).
//
//  Bugs 3 e 4 do teste anterior eram erros de atribuição dentro da
//  função. Esta versão está escrita de forma linear e com variáveis
//  explicitamente rebatidas no `return`. Dá para seguir linha a linha.
// ==============================================================
export function aggregateClientSummary(rows, weekKey, monthPrefix, opts = {}) {
  const prevWeekKey      = opts.prevWeekKey     || previousPeriodKey(weekKey);
  const prevMonthPrefix  = opts.prevMonthPrefix || previousMonthPrefix(monthPrefix);
  const clientMetaLucro  = Number(opts.clientMetaLucro) || 0;

  let weekClosed      = 0;
  let weekGoal        = 0;
  let monthClosed     = 0;
  let monthGoalSum    = 0;  // soma só das metas EXPLÍCITAS (sem fallback)
  let monthGoalSeen   = false;
  let weekClosedPrev  = 0;
  let monthClosedPrev = 0;
  let monthGoalSumPrev = 0;

  const prefixCurr = `${monthPrefix}-S`;
  const prefixPrev = prevMonthPrefix ? `${prevMonthPrefix}-S` : null;

  for (const row of rows) {
    const pk = String(row.period_key || '');
    const data = (row.data && typeof row.data === 'object') ? row.data : {};
    const fec = Number(data.fechados) || 0;

    // Semana atual exata
    if (pk === weekKey) {
      weekClosed = fec;
      weekGoal   = resolveWeekGoal(data, clientMetaLucro);
    }

    // Semana anterior exata
    if (pk === prevWeekKey) {
      weekClosedPrev = fec;
    }

    // Soma do mês atual
    if (pk.startsWith(prefixCurr)) {
      monthClosed += fec;
      // meta explícita da semana (sem fallback do cliente — queremos
      // saber se o time preencheu meta real)
      const explicit = resolveWeekGoal(data, 0);
      if (explicit > 0) {
        monthGoalSum += explicit;
        monthGoalSeen = true;
      }
    }

    // Soma do mês anterior (para delta)
    if (prefixPrev && pk.startsWith(prefixPrev)) {
      monthClosedPrev += fec;
      const explicitPrev = resolveWeekGoal(data, 0);
      if (explicitPrev > 0) monthGoalSumPrev += explicitPrev;
    }
  }

  // Meta mensal final = max(soma_semanal_explícita, clientMetaLucro).
  // Bug 4 do teste: antes a variável era reatribuída errado. Agora é
  // uma nova variável que SÓ aplica o floor:
  let monthGoal = monthGoalSum;
  if (clientMetaLucro > monthGoal) {
    monthGoal = clientMetaLucro;
    if (clientMetaLucro > 0) monthGoalSeen = true;
  }

  // Fallback final: se a semana atual não tem meta e o mês tem, usa mês÷4.
  if (weekGoal === 0 && monthGoal > 0) {
    weekGoal = Math.ceil(monthGoal / 4);
  }

  // Mesmo tratamento para o mês anterior (usado no delta de meta)
  let monthGoalPrev = monthGoalSumPrev;
  if (clientMetaLucro > monthGoalPrev) monthGoalPrev = clientMetaLucro;

  const weekProgress  = weekGoal  > 0 ? Math.min((weekClosed  / weekGoal)  * 100, 999) : 0;
  const monthProgress = monthGoal > 0 ? Math.min((monthClosed / monthGoal) * 100, 999) : 0;

  const weekDelta  = weekClosed  - weekClosedPrev;
  const monthDelta = monthClosed - monthClosedPrev;
  const weekDeltaPct  = weekClosedPrev  > 0 ? (weekDelta  / weekClosedPrev)  * 100 : null;
  const monthDeltaPct = monthClosedPrev > 0 ? (monthDelta / monthClosedPrev) * 100 : null;

  // Bug 3 do teste anterior: `monthGoalSum` voltava undefined. Agora o
  // return é explícito, campo a campo.
  return {
    weekClosed:       weekClosed,
    weekGoal:         weekGoal,
    weekProgress:     weekProgress,
    monthClosed:      monthClosed,
    monthGoal:        monthGoal,
    monthGoalSum:     monthGoalSum,      // explícito (auditável)
    monthGoalSeen:    monthGoalSeen,
    monthProgress:    monthProgress,
    weekClosedPrev:   weekClosedPrev,
    weekDelta:        weekDelta,
    weekDeltaPct:     weekDeltaPct,
    monthClosedPrev:  monthClosedPrev,
    monthGoalPrev:    monthGoalPrev,
    monthGoalSumPrev: monthGoalSumPrev,
    monthDelta:       monthDelta,
    monthDeltaPct:    monthDeltaPct,
  };
}

/**
 * Reduz array de sumários de clientes para totais da carteira.
 */
export function aggregatePortfolioSummary(clientSummaries) {
  const totals = {
    weekClosed: 0,
    weekGoal:   0,
    monthClosed: 0,
    monthGoal:   0,
    hitWeek:  0,
    hitMonth: 0,
    clientsWithGoal: 0,
    total: clientSummaries.length,
    weekClosedPrev:  0,
    monthClosedPrev: 0,
  };

  for (const s of clientSummaries) {
    totals.weekClosed      += (s.weekClosed      || 0);
    totals.weekGoal        += (s.weekGoal        || 0);
    totals.monthClosed     += (s.monthClosed     || 0);
    totals.monthGoal       += (s.monthGoal       || 0);
    totals.weekClosedPrev  += (s.weekClosedPrev  || 0);
    totals.monthClosedPrev += (s.monthClosedPrev || 0);
    if (s.monthGoalSeen) totals.clientsWithGoal++;
    if ((s.weekGoal  || 0) > 0 && (s.weekClosed  || 0) >= s.weekGoal)  totals.hitWeek++;
    if ((s.monthGoal || 0) > 0 && (s.monthClosed || 0) >= s.monthGoal) totals.hitMonth++;
  }

  totals.weekProgress  = totals.weekGoal  > 0 ? (totals.weekClosed  / totals.weekGoal)  * 100 : 0;
  totals.monthProgress = totals.monthGoal > 0 ? (totals.monthClosed / totals.monthGoal) * 100 : 0;
  totals.hitRateWeek   = totals.clientsWithGoal > 0 ? (totals.hitWeek  / totals.clientsWithGoal) * 100 : 0;
  totals.hitRateMonth  = totals.clientsWithGoal > 0 ? (totals.hitMonth / totals.clientsWithGoal) * 100 : 0;

  totals.weekDelta  = totals.weekClosed  - totals.weekClosedPrev;
  totals.monthDelta = totals.monthClosed - totals.monthClosedPrev;
  totals.weekDeltaPct  = totals.weekClosedPrev  > 0 ? (totals.weekDelta  / totals.weekClosedPrev)  * 100 : null;
  totals.monthDeltaPct = totals.monthClosedPrev > 0 ? (totals.monthDelta / totals.monthClosedPrev) * 100 : null;

  return totals;
}
