// ==============================================================
//  Constantes de domínio - fiéis ao HTML de referência
// ==============================================================

export const DEFAULT_SQUADS = ['CAP João', 'CAP Humberto', 'CAP Samara'];

export const GDV_TARGET = 70; // % mínimo de clientes com GDV batendo meta

export const ROLES = {
  admin:  { label: 'Administrador',     access: 'all'   },
  cap:    { label: 'CAP',               access: 'squad' },
  gestor: { label: 'Gestor de Tráfego', access: 'squad' },
  gdv:    { label: 'GDV',               access: 'squad' },
};

export const VALID_ROLES = Object.keys(ROLES);

/**
 * Template oficial de onboarding - estrutura base usada tanto na
 * primeira execução quanto para reset. É replicado exatamente do
 * protótipo original.
 */
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

/**
 * Dado o template (formato simples) e opcionalmente responsáveis
 * (gestor para seções 0..6, GDV para seção 7), devolve a estrutura
 * "hidratada" usada na tabela onboardings.sections.
 */
export function instantiateOnboarding(template, { gestor = '', gdv = '' } = {}) {
  return template.map((section, si) => ({
    sec: section.sec,
    open: true,
    tasks: (section.tasks || []).map((task, ti) => ({
      id: `${section.sec}_${ti}`,
      name: task.name,
      done: false,
      assignee: si < 7 ? (gestor || '') : (gdv || ''),
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

/**
 * Cálculo canônico das métricas semanais.
 * Espelha a função calcM do HTML original.
 */
export function computeWeeklyMetrics(data = {}) {
  const inv  = Number(data.investimento) || 0;
  const cpl  = Number(data.cpl)           || 0;
  const vol  = Number(data.volume)        || 0;
  const fec  = Number(data.fechados)      || 0;
  const mLuc = Number(data.metaLucro)     || 0;
  const mEmp = Number(data.metaEmpate)    || 0;
  const mVol = Number(data.metaVolume)    || 0;
  const mCpl = Number(data.metaCpl)       || 0;

  const lp    = (inv > 0 && cpl > 0) ? inv / cpl : 0;
  const taxa  = (fec > 0 && vol > 0) ? (fec / vol) * 100 : 0;
  const cp    = (lp  > 0 && taxa > 0) ? lp * (taxa / 100) : 0;

  return {
    inv, cpl, vol, fec, mLuc, mEmp, mVol, mCpl,
    leadsPrevistos:      lp,
    taxaConversao:       taxa,
    contratosPrevistos:  cp,
    isHit:  cp  > 0 && mLuc > 0 && cp  >= mLuc,
    cplOk:  cpl > 0 && mCpl > 0 && cpl <= mCpl,
    volOk:  lp  > 0 && mVol > 0 && lp  >= mVol,
  };
}

/**
 * Deriva o weekStatus ('vai' | 'nao' | '') a partir dos dados
 * informados para a semana.
 */
export function deriveWeekStatus(data = {}) {
  const { contratosPrevistos: cp, mLuc } = computeWeeklyMetrics(data);
  if (!mLuc || cp <= 0) return '';
  return cp >= mLuc ? 'vai' : 'nao';
}

/**
 * Dado o mapa de weekStatuses das 4 semanas { 1: 'vai', 2: 'nao', ... },
 * calcula o goal_status agregado do cliente.
 * Regra (replicada do legado autoGS):
 *   - se alguma semana está 'nao', resultado = 'nao'
 *   - senão, se alguma está 'vai', resultado = 'vai'
 *   - senão, ''
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
