import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  BellDot,
  Bug,
  ChevronsLeftRightEllipsis,
  Code2,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  Folders,
  GitBranch,
  LayoutDashboard,
  Package,
  PanelBottom,
  Search,
  Settings,
  TerminalSquare,
  CircleDot,
  Columns3,
  FileText,
} from 'lucide-react';
import styles from './SupportTechnologyPage.module.css';

const MENUS = ['Arquivo', 'Editar', 'Seleção', 'Exibir', 'Acessar', 'Executar'];

const FILES = [
  {
    id: 'support-page',
    label: 'SupportTechnologyPage.jsx',
    path: 'src/pages',
    icon: FileCode2,
    lines: [
      "import { useEffect, useMemo, useState } from 'react';",
      "import { useAuth } from '../context/AuthContext.jsx';",
      "import { useOutletContext } from 'react-router-dom';",
      "import styles from './SupportTechnologyPage.module.css';",
      '',
      'const workspace = criarWorkspaceTecnologia({',
      "  tema: 'Bearded Theme Vivid Black',",
      "  nome: 'Suporte de tecnologia',",
      "  produto: 'Edifica Central',",
      '  modo: "workspace flutuante",',
      '});',
      '',
      'export default function SupportTechnologyPage() {',
      '  const { user } = useAuth();',
      '  const { setPanelHeader } = useOutletContext();',
      '',
      '  useEffect(() => {',
      "    setPanelHeader?.({ title: 'Suporte de tecnologia' });",
      '  }, [setPanelHeader]);',
      '',
      '  const status = useMemo(() => ({',
      "    etapa: 'renderizando workspace',",
      "    artefato: 'simulador vscode',",
      '  }), []);',
      '',
      '  return montarInterface({ user, workspace, status });',
      '}',
    ],
  },
  {
    id: 'support-style',
    label: 'SupportTechnologyPage.module.css',
    path: 'src/pages',
    icon: FileCode2,
    lines: [
      '.workspace {',
      '  position: relative;',
      '  min-height: 540px;',
      '  overflow: hidden;',
      '  background: #05060a;',
      '  border: 1px solid rgba(255,255,255,0.06);',
      '  border-radius: 22px;',
      '}',
      '',
      '.studio {',
      '  width: min(1320px, calc(100% - 56px));',
      '  aspect-ratio: 16 / 9;',
      '  background: #0b0c11;',
      '  box-shadow: 0 24px 64px rgba(0,0,0,0.42);',
      '}',
      '',
      '.codeLineActive {',
      '  color: #f8f8f2;',
      '  animation: caretBlink 0.9s step-end infinite;',
      '}',
      '',
      '.miniMapBar {',
      '  animation: minimapPulse 5.2s ease-in-out infinite;',
      '}',
    ],
  },
  {
    id: 'profile-page',
    label: 'ProfilePage.jsx',
    path: 'src/pages',
    icon: FileCode2,
    lines: [
      "import DemandModal from '../components/tasks/DemandModal.jsx';",
      "import UserHoverCard from '../components/users/UserHoverCard.jsx';",
      '',
      'function montarResumoInterno(usuario, tarefas) {',
      '  return {',
      '    usuario,',
      '    tarefasAbertas: tarefas.filter((item) => !item.done),',
      '    tarefasConcluidas: tarefas.filter((item) => item.done),',
      '  };',
      '}',
      '',
      'const painelInterno = criarPainel({',
      "  titulo: 'Área interna',",
      "  secaoPrincipal: 'Minhas tarefas',",
      '});',
      '',
      'export function renderizarAreaInterna() {',
      '  return painelInterno;',
      '}',
    ],
  },
  {
    id: 'support-api',
    label: 'support.js',
    path: 'edifica-api/src/routes',
    icon: FileJson2,
    lines: [
      "router.post('/tasks', async (req, res) => {",
      '  const payload = validarPayloadSuporte(req.body);',
      '  const task = await createSupportTask({',
      '    title: payload.title,',
      '    priority: payload.priority,',
      '    clientId: payload.clientId,',
      '    assigneeUserId: payload.assigneeUserId,',
      '  });',
      '',
      '  io.emit("support:task-created", { id: task.id });',
      '  return res.json({ ok: true, task });',
      '});',
      '',
      'router.get("/status", async (_req, res) => {',
      '  const snapshot = await buildSupportSnapshot();',
      '  return res.json(snapshot);',
      '});',
    ],
  },
  {
    id: 'avatar-utils',
    label: 'avatarStorage.js',
    path: 'src/utils',
    icon: FileJson2,
    lines: [
      'export function getUserAvatar(user) {',
      "  return user?.avatarUrl || '';",
      '}',
      '',
      'export function saveUserAvatar(user, dataUrl) {',
      '  if (!dataUrl) return false;',
      "  emitChange({ type: 'user', id: user?.id || '', dataUrl });",
      '  return true;',
      '}',
      '',
      'export function removeUserAvatar(user) {',
      "  emitChange({ type: 'user', id: user?.id || '', dataUrl: '' });",
      '  return true;',
      '}',
    ],
  },
  {
    id: 'edifica-crm',
    label: 'EdificaCRM.workspace.ts',
    path: 'src/crm/preview',
    icon: FileSpreadsheet,
    lines: [
      '/* easter egg reservado */',
      'const crmWorkspace = prepararModulo({',
      "  nome: 'Edifica CRM',",
      "  status: 'em ideacao',",
      "  foco: ['pipeline', 'whatsapp', 'automacoes', 'crm'],",
      '});',
      '',
      'export function montarEdificaCRM() {',
      '  return crmWorkspace;',
      '}',
      '',
      'registrarRoadmap("Edifica CRM", {',
      '  prioridade: "alta",',
      '  visivelApenasComoEasterEgg: true,',
      '});',
    ],
  },
];

const TERMINAL_FEED = [
  'npm run build -- --preview tecnologia',
  'sincronizando árvore do projeto Edifica Central',
  'carregando tema Bearded Theme Vivid Black',
  'ajustando proporção flutuante do workspace',
  'validando ícones no padrão do editor',
  'indexando src/pages/SupportTechnologyPage.jsx',
  'indexando edifica-api/src/routes/support.js',
  'renderizando código em tempo real',
  'otimizando visual para notebook',
  'pré-aquecendo módulo reservado: Edifica CRM',
  'aplicando avatar arredondado ao launcher',
  'compilação visual em andamento',
];

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MN';
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

function tokenizeLine(line) {
  if (!line) return [{ type: 'plain', text: ' ' }];
  const regex = /(\/\/.*$|\/\*.*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|from|export|default|const|let|var|function|return|if|else|await|async|new|true|false|null)\b|\b\d+\b)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'plain', text: line.slice(lastIndex, match.index) });
    const value = match[0];
    let type = 'plain';
    if (value.startsWith('//') || value.startsWith('/*')) type = 'comment';
    else if (["'", '"', '`'].includes(value[0])) type = 'string';
    else if (/^\d+$/.test(value)) type = 'number';
    else type = 'keyword';
    parts.push({ type, text: value });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) parts.push({ type: 'plain', text: line.slice(lastIndex) });
  return parts;
}

function visibleSnippet(lines, lineIndex, charIndex) {
  return lines.map((line, index) => {
    if (index < lineIndex) return line;
    if (index === lineIndex) return line.slice(0, charIndex);
    return '';
  });
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { setPanelHeader } = useOutletContext();
  const [fileIndex, setFileIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [phase, setPhase] = useState('typing');
  const [logIndex, setLogIndex] = useState(6);
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Mauricio Nunes';

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const activeFile = FILES[fileIndex % FILES.length];

  useEffect(() => {
    const lines = activeFile.lines;
    let timer;
    if (phase === 'typing') {
      timer = window.setTimeout(() => {
        const current = lines[lineIndex] ?? '';
        if (charIndex < current.length) {
          setCharIndex((value) => value + 1);
          return;
        }
        if (lineIndex < lines.length - 1) {
          setLineIndex((value) => value + 1);
          setCharIndex(0);
          return;
        }
        setPhase('pause');
      }, lineIndex === lines.length - 1 && charIndex === (lines[lineIndex] || '').length ? 420 : 12 + ((charIndex + lineIndex) % 4) * 8);
    } else {
      timer = window.setTimeout(() => {
        setFileIndex((value) => (value + 1) % FILES.length);
        setLineIndex(0);
        setCharIndex(0);
        setPhase('typing');
      }, 520);
    }
    return () => window.clearTimeout(timer);
  }, [activeFile, charIndex, lineIndex, phase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLogIndex((value) => (value >= TERMINAL_FEED.length ? 6 : value + 1));
    }, 420);
    return () => window.clearInterval(timer);
  }, []);

  const visibleLines = useMemo(
    () => visibleSnippet(activeFile.lines, lineIndex, charIndex),
    [activeFile.lines, charIndex, lineIndex],
  );

  const logLines = useMemo(() => {
    const seeded = [];
    for (let index = 0; index < Math.min(logIndex, TERMINAL_FEED.length); index += 1) seeded.push(TERMINAL_FEED[index]);
    const base = seeded.slice(-10);
    return base;
  }, [logIndex]);

  const explorerGroups = useMemo(() => ([
    { name: '.github', depth: 0 },
    { name: 'docs', depth: 0 },
    { name: 'edifica-api', depth: 0 },
    { name: 'public', depth: 0 },
    { name: 'src', depth: 0, open: true },
    { name: 'api', depth: 1 },
    { name: 'components', depth: 1 },
    { name: 'context', depth: 1 },
    { name: 'hooks', depth: 1 },
    { name: 'pages', depth: 1, open: true },
    ...FILES.map((item) => ({ name: item.label, depth: 2, fileId: item.id })),
    { name: 'routes', depth: 1 },
    { name: 'styles', depth: 1 },
    { name: 'utils', depth: 1 },
    { name: 'crm', depth: 1, open: true },
    { name: 'EdificaCRM.workspace.ts', depth: 2, fileId: 'edifica-crm', easter: true },
    { name: 'App.jsx', depth: 1 },
    { name: 'vite.config.js', depth: 0 },
  ]), []);

  const visibleMinimap = useMemo(() => {
    const bars = [];
    const total = Math.max(visibleLines.length, 18);
    for (let index = 0; index < total; index += 1) {
      const source = visibleLines[index] || activeFile.lines[index] || '';
      const width = 26 + ((source.length * 7 + index * 13) % 62);
      bars.push({ id: `${activeFile.id}-${index}`, width, hue: index % 5 });
    }
    return bars;
  }, [activeFile.id, activeFile.lines, visibleLines]);

  return (
    <div className={styles.page}>
      <section className={styles.workspace} aria-label="Área em construção">
        <div className={styles.floatingStudio}>
          <header className={styles.ideTitlebar}>
            <div className={styles.launcherWrap}>
              <button type="button" className={styles.launcher} aria-label="Em construção">
                <span className={styles.avatarBadge}>
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials(displayName)}</span>}
                </span>
                <span className={styles.tooltip}>Em construção !</span>
              </button>
              <nav className={styles.menuBar} aria-label="Menu do editor">
                {MENUS.map((item) => <span key={item}>{item}</span>)}
              </nav>
            </div>
            <div className={styles.titleCenter} aria-hidden="true">edifica-central</div>
            <div className={styles.windowControls} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </header>

          <div className={styles.ideBody}>
            <aside className={styles.activityBar}>
              <Code2 size={18} />
              <Search size={18} />
              <GitBranch size={18} />
              <Bug size={18} />
              <Package size={18} />
              <Columns3 size={18} />
              <PanelBottom size={18} />
              <Settings size={18} />
            </aside>

            <aside className={styles.explorer}>
              <div className={styles.sidebarHeader}>
                <span>Explorador</span>
                <ChevronsLeftRightEllipsis size={14} />
              </div>
              <div className={styles.projectName}>EDIFICA-DASH</div>
              <div className={styles.explorerMeta}>
                <span><CircleDot size={10} /> main</span>
                <span><BellDot size={10} /> 3 alertas</span>
              </div>
              <div className={styles.tree}>
                {explorerGroups.map((item, index) => {
                  const isFolder = !item.fileId && !item.name.includes('.');
                  const Icon = isFolder ? Folders : item.fileId === 'support-api' ? FileJson2 : item.fileId?.includes('crm') ? FileSpreadsheet : FileCode2;
                  const active = item.fileId === activeFile.id;
                  return (
                    <div
                      key={`${item.name}-${index}`}
                      className={`${styles.treeItem} ${active ? styles.treeItemActive : ''} ${item.easter ? styles.treeItemEaster : ''}`.trim()}
                      style={{ '--depth': item.depth }}
                    >
                      <Icon size={14} />
                      <span>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            </aside>

            <section className={styles.editorZone}>
              <div className={styles.tabs}>
                {FILES.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeFile.id;
                  return (
                    <button key={item.id} type="button" className={`${styles.tab} ${active ? styles.tabActive : ''}`.trim()} onClick={() => { setFileIndex(FILES.findIndex((entry) => entry.id === item.id)); setLineIndex(0); setCharIndex(0); setPhase('typing'); }}>
                      <Icon size={13} />
                      <span>{item.label}</span>
                      <FileText size={11} className={styles.tabClose} />
                    </button>
                  );
                })}
              </div>

              <div className={styles.editorCanvas}>
                <div className={styles.codePane}>
                  <div className={styles.breadcrumbs}>{activeFile.path} / {activeFile.label}</div>
                  <ol className={styles.codeList}>
                    {visibleLines.map((line, index) => {
                      const display = line || ' ';
                      const isActiveLine = index === lineIndex && phase === 'typing';
                      return (
                        <li key={`${activeFile.id}-${index + 1}`} className={styles.codeRow}>
                          <span className={styles.lineNumber}>{String(index + 1).padStart(3, '0')}</span>
                          <span className={`${styles.codeText} ${isActiveLine ? styles.codeTextActive : ''}`.trim()}>
                            {tokenizeLine(display).map((part, partIndex) => (
                              <span key={`${activeFile.id}-${index}-${partIndex}`} className={styles[`token_${part.type}`] || styles.token_plain}>{part.text}</span>
                            ))}
                            {isActiveLine ? <span className={styles.caret} aria-hidden="true" /> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <aside className={styles.minimap} aria-hidden="true">
                  {visibleMinimap.map((bar) => (
                    <span key={bar.id} className={`${styles.minimapBar} ${styles[`minimapTone${bar.hue}`]}`.trim()} style={{ '--width': `${bar.width}%` }} />
                  ))}
                </aside>
              </div>
            </section>

            <aside className={styles.terminalPanel}>
              <div className={styles.terminalHeader}><TerminalSquare size={14} /> <span>Terminal</span></div>
              <div className={styles.terminalBody}>
                {logLines.map((entry, index) => (
                  <div key={`${entry}-${index}`} className={styles.terminalLine}>
                    <span className={styles.terminalPrompt}>›</span>
                    <span>{entry}</span>
                  </div>
                ))}
                <div className={styles.terminalLine}>
                  <span className={styles.terminalPrompt}>›</span>
                  <span className={styles.terminalTyping}>digitando próxima etapa</span>
                </div>
              </div>
              <div className={styles.statusBar}>
                <span><LayoutDashboard size={12} /> main*</span>
                <span><BellDot size={12} /> Edifica Central</span>
                <span><Code2 size={12} /> JavaScript JSX</span>
                <span>UTF-8</span>
                <span>LF</span>
                <span>Ln 18, Col 12</span>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
