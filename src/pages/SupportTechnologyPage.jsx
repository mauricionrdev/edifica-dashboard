import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import styles from './SupportTechnologyPage.module.css';

const FILE_TREE = [
  { type: 'root', label: 'EDIFICA-DASH' },
  { type: 'folder', label: '.githooks' },
  { type: 'folder', label: 'docs' },
  { type: 'folder', label: 'edifica-api' },
  { type: 'folder', label: 'public' },
  { type: 'folderOpen', label: 'src' },
  { type: 'folder', label: 'api', level: 1 },
  { type: 'folder', label: 'components', level: 1 },
  { type: 'folder', label: 'context', level: 1 },
  { type: 'folder', label: 'data', level: 1 },
  { type: 'folder', label: 'hooks', level: 1 },
  { type: 'folderOpen', label: 'pages', level: 1 },
  { type: 'fileReact', label: 'ProfilePage.jsx', level: 2, active: true },
  { type: 'fileReact', label: 'SupportTechnologyPage.jsx', level: 2 },
  { type: 'fileCss', label: 'SupportTechnologyPage.module.css', level: 2 },
  { type: 'folder', label: 'routes', level: 1 },
  { type: 'folder', label: 'styles', level: 1 },
  { type: 'folder', label: 'utils', level: 1 },
  { type: 'fileReact', label: 'App.jsx', level: 1 },
  { type: 'fileReact', label: 'main.jsx', level: 1 },
  { type: 'file', label: '.env.production.example' },
  { type: 'fileMd', label: 'README.md' },
  { type: 'fileVite', label: 'vite.config.js' },
];

const TABS = [
  'ProfilePage.jsx',
  'SupportTechnologyPage.jsx',
  'support.js',
  'TechnologyWorkspace.jsx',
  'theme.vivid-black.css',
];

const CODE_LINES = [
  'import { useMemo, useEffect, useState } from "react";',
  'import { createSupportSignal } from "../api/support.js";',
  'import { buildProfilePath } from "../utils/entityPaths.js";',
  '',
  'const workspace = criarWorkspace({',
  '  nome: "Suporte de tecnologia",',
  '  tema: "Bearded Theme Vivid Black",',
  '  estado: "em_construcao",',
  '  produto: "Edifica Central",',
  '});',
  '',
  'function construirPainelTecnologia(contexto) {',
  '  const usuario = contexto.usuarioAutenticado;',
  '  const permissoes = resolverPermissoes(usuario);',
  '  const fila = conectarFilaDeDemandas(contexto.clientesAtivos);',
  '',
  '  return montarInterface({',
  '    rota: "/suporte/tecnologia",',
  '    workspace,',
  '    permissoes,',
  '    fila,',
  '    modo: "preparacao",',
  '  });',
  '}',
  '',
  'const mapaDeModulos = new Map();',
  'mapaDeModulos.set("diagnostico", carregarDiagnostico());',
  'mapaDeModulos.set("integracoes", carregarIntegracoes());',
  'mapaDeModulos.set("monitoramento", carregarMonitoramento());',
  'mapaDeModulos.set("historico", carregarHistoricoTecnico());',
  '',
  'async function sincronizarAmbiente() {',
  '  await verificarConexaoWhatsapp();',
  '  await validarLimitesOpenAI();',
  '  await publicarEventosInternos();',
  '  return atualizarStatusDaOperacao();',
  '}',
  '',
  'function renderizarCabecalho() {',
  '  return {',
  '    titulo: "Suporte de tecnologia",',
  '    breadcrumbs: ["Workspace", "Ferramenta interna", "Suporte TI"],',
  '    acoesVisiveis: false,',
  '  };',
  '}',
  '',
  'const blocos = [',
  '  criarBloco("Conexões", monitorarConexoes),',
  '  criarBloco("Agentes", monitorarAgentes),',
  '  criarBloco("Alertas", monitorarAlertas),',
  '  criarBloco("Deploy", monitorarPublicacao),',
  '];',
  '',
  'for (const bloco of blocos) {',
  '  bloco.assinarEvento("mudanca", atualizarInterface);',
  '  bloco.assinarEvento("erro", registrarFalha);',
  '}',
  '',
  'const service = {',
  '  listarDemandas: () => api.get("/support/tasks"),',
  '  criarDemanda: (payload) => api.post("/support/tasks", payload),',
  '  atualizarStatus: (id, status) => api.patch(`/support/tasks/${id}`, { status }),',
  '};',
  '',
  'function prepararEstadoInicial() {',
  '  return {',
  '    carregando: false,',
  '    salvando: false,',
  '    selecionado: null,',
  '    painel: "construcao",',
  '  };',
  '}',
  '',
  'const eventos = criarCanalRealtime("support:technology");',
  'eventos.on("demand.created", anexarLinhaNaFila);',
  'eventos.on("client.offline", acionarAlertaVisual);',
  'eventos.on("agent.paused", sinalizarIntervencaoHumana);',
  '',
  'export function TechnologySupportPage() {',
  '  const estado = prepararEstadoInicial();',
  '  const cabecalho = renderizarCabecalho();',
  '  const ambiente = construirPainelTecnologia({ estado, cabecalho });',
  '',
  '  return renderizarWorkspace(ambiente);',
  '}',
  '',
  'CREATE TABLE support_technology_events (',
  '  id CHAR(36) PRIMARY KEY,',
  '  user_id CHAR(36) NOT NULL,',
  '  event_type VARCHAR(80) NOT NULL,',
  '  payload JSON NULL,',
  '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
  ');',
  '',
  '.technologyWorkspace {',
  '  --fundo: #000000;',
  '  --painel: #0d0d0f;',
  '  --editor: #09090b;',
  '  --linha-ativa: rgba(255, 255, 255, .035);',
  '  --texto: #d8d8d2;',
  '}',
  '',
  '.technologyWorkspace[data-theme="vivid-black"] {',
  '  color-scheme: dark;',
  '  background: var(--editor);',
  '  border-color: #1f1f24;',
  '}',
  '',
  'async function publicarPrevia() {',
  '  await executarBuildVisual();',
  '  await validarResponsividadeNotebook();',
  '  await revisarAcessibilidade();',
  '  return marcarTelaComoPreparada();',
  '}',
  '',
  'const comandos = registrarPaletaDeComandos({',
  '  "suporte.criarDemanda": abrirCompositor,',
  '  "suporte.validarCliente": abrirDiagnostico,',
  '  "suporte.monitorarAgente": abrirObservabilidade,',
  '  "suporte.publicarVersao": publicarPrevia,',
  '});',
  '',
  'logger.info("workspace de tecnologia em montagem", {',
  '  aplicacao: "Edifica Central",',
  '  tema: "vivid-black",',
  '  animacao: "codigo_continuo",',
  '});',
];

const EXTRA_CODE_LINES = [
  'const clientes = await buscarClientesAtivos();',
  'const conexoes = await verificarConexoesWhatsApp(clientes);',
  'const agentes = await listarAgentesPorCliente(clientes);',
  'const alertas = normalizarAlertas(conexoes, agentes);',
  'renderizarBadgeDeRisco(alerta.nivel);',
  'registrarHistoricoTecnico({ clienteId, motivo });',
  'enfileirarDiagnostico("whatsapp", prioridadeAlta);',
  'cache.invalidate("technology-support");',
  'socket.emit("support:refresh", payloadSeguro);',
  'diff.apply("remove-card-wrapper");',
  'workspace.paint("vivid-black");',
  'editor.write("SupportTechnologyPage.jsx");',
  'theme.sync("Bearded Theme Vivid Black");',
  'layout.fitToNotebookViewport();',
  'access.require("suporte_tecnologia");',
  'toast.silent("prévia recompilada");',
  'pipeline.stage("triagem", classificarDemanda);',
  'pipeline.stage("roteamento", definirResponsavel);',
  'pipeline.stage("resolucao", acompanharEntrega);',
  'metrics.increment("support.preview.frame");',
  'hook.useTechnologyWorkspaceState();',
  'hook.useSupportRealtimeChannel();',
  'service.createSupportTask(payload);',
  'repository.commit("refine technology workspace");',
  'observer.watch("agent-status-change");',
  'observer.watch("whatsapp-disconnected");',
  'observer.watch("openai-limit-warning");',
  'screen.lockVerticalOverflow(false);',
  'screen.hideExternalDemandButton();',
  'avatar.tooltip("Em construção !");',
];

const TERMINAL_LINES = [
  'npm run build -- --preview tecnologia',
  'carregando tema Bearded Theme Vivid Black',
  'removendo card extra do workspace',
  'montando árvore da Edifica Central',
  'sincronizando arquivos ProfilePage.jsx e SupportTechnologyPage.jsx',
  'gerando módulos de suporte técnico',
  'validando layout para notebook',
  'criando animação contínua de código',
  'ocultando ações externas da tela',
  'aplicando avatar no lugar do logotipo',
  'preparando tooltip: Em construção !',
  'compilação visual concluída',
];

const SYMBOLS = {
  root: '▾',
  folder: '›',
  folderOpen: '▾',
  fileReact: '⚛',
  fileCss: '#',
  fileMd: 'M↓',
  fileVite: '▼',
  file: '□',
};

function getLineType(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return 'blank';
  if (trimmed.startsWith('import') || trimmed.startsWith('export') || trimmed.startsWith('async') || trimmed.startsWith('function')) return 'keyword';
  if (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('for ')) return 'declaration';
  if (trimmed.startsWith('return') || trimmed.startsWith('await') || trimmed.startsWith('if ')) return 'logic';
  if (trimmed.startsWith('CREATE TABLE') || trimmed.includes('PRIMARY KEY') || trimmed.includes('TIMESTAMP') || trimmed.includes('VARCHAR') || trimmed.includes('JSON')) return 'sql';
  if (trimmed.startsWith('.') || trimmed.startsWith('--') || trimmed.includes('color-scheme') || trimmed.includes('background:')) return 'css';
  if (trimmed.includes('"') || trimmed.includes('\'')) return 'string';
  if (trimmed.includes('logger') || trimmed.includes('socket') || trimmed.includes('metrics')) return 'event';
  return 'plain';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MN';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function SupportTechnologyPage() {
  const { setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const avatarUrl = getUserAvatar(user);

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const codeRows = [...CODE_LINES, ...EXTRA_CODE_LINES, ...CODE_LINES.slice(0, 42), ...EXTRA_CODE_LINES.slice(0, 18)];
  const shadowRows = [...EXTRA_CODE_LINES, ...CODE_LINES.filter(Boolean).slice(0, 46), ...EXTRA_CODE_LINES];
  const terminalRows = [...TERMINAL_LINES, ...TERMINAL_LINES, ...TERMINAL_LINES.slice(0, 7)];

  return (
    <div className={styles.page}>
      <section className={styles.workspace} data-theme="vivid-black" aria-label="Workspace de suporte de tecnologia em construção">
        <header className={styles.appTopbar} aria-hidden="true">
          <div className={styles.menuCluster}>
            <span>Arquivo</span>
            <span>Editar</span>
            <span>Seleção</span>
            <span>Exibir</span>
            <span>Acessar</span>
            <span>Executar</span>
            <span>...</span>
          </div>
          <div className={styles.commandCenter}>edifica-dash</div>
          <div className={styles.windowControls}>
            <span />
            <span />
            <span />
          </div>
        </header>

        <div className={styles.vscodeShell}>
          <aside className={styles.activityBar} aria-hidden="true">
            <button className={styles.avatarLogo} type="button" aria-label="Em construção !">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials(user?.name)}</span>}
              <em>Em construção !</em>
            </button>
            <span className={styles.activityActive}>▣</span>
            <span>⌕</span>
            <span>⑂</span>
            <span>⚙</span>
            <span>◇</span>
          </aside>

          <aside className={styles.fileExplorer} aria-hidden="true">
            <header className={styles.explorerHeader}>
              <span>EXPLORADOR</span>
              <strong>...</strong>
            </header>
            <div className={styles.folderTree}>
              {FILE_TREE.map((item, index) => (
                <span
                  key={`${item.label}-${index}`}
                  className={`${styles.treeItem} ${item.active ? styles.treeActive : ''} ${styles[`tree_${item.type}`] || ''}`}
                  style={{ '--level': item.level || 0 }}
                >
                  <i>{SYMBOLS[item.type] || '□'}</i>
                  <b>{item.label}</b>
                </span>
              ))}
            </div>
            <footer className={styles.timelineLabel}>LINHA DO TEMPO</footer>
          </aside>

          <main className={styles.editorArea}>
            <nav className={styles.tabs} aria-hidden="true">
              {TABS.map((tab, index) => (
                <span key={tab} className={index === 0 ? styles.tabActive : undefined}>
                  <i>{tab.endsWith('.css') ? '#' : tab.endsWith('.js') ? 'JS' : '⚛'}</i>
                  {tab}
                  {index === 0 ? <b>×</b> : null}
                </span>
              ))}
            </nav>

            <div className={styles.editorCanvas}>
              <div className={styles.backgroundCode} aria-hidden="true">
                {shadowRows.map((line, index) => (
                  <span key={`${line}-${index}`}>{line}</span>
                ))}
              </div>

              <div className={styles.mainCodeTrack} aria-hidden="true">
                {codeRows.map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className={`${styles.codeLine} ${styles[`line_${getLineType(line)}`]}`}
                    style={{
                      '--line-delay': `${(index % 37) * 0.09}s`,
                      '--line-steps': Math.max(12, Math.min(82, line.length)),
                    }}
                  >
                    <span className={styles.lineNumber}>{String(index + 111).padStart(3, '0')}</span>
                    <span className={styles.liveCode}>{line || ' '}</span>
                  </div>
                ))}
              </div>

              <aside className={styles.minimap} aria-hidden="true">
                {codeRows.slice(0, 96).map((line, index) => (
                  <span key={`map-${index}`} style={{ width: `${18 + (line.length % 72)}%` }} />
                ))}
              </aside>
            </div>

            <footer className={styles.statusBar} aria-hidden="true">
              <span>main*</span>
              <span>JavaScript JSX</span>
              <span>UTF-8</span>
              <span>LF</span>
              <strong>Em construção</strong>
            </footer>
          </main>

          <aside className={styles.terminalPanel} aria-hidden="true">
            <header>TERMINAL</header>
            <div className={styles.terminalViewport}>
              <div className={styles.terminalTrack}>
                {terminalRows.map((line, index) => (
                  <span key={`${line}-${index}`}>› {line}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
