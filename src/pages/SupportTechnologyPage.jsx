import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  AlertTriangle,
  BellDot,
  Bot,
  Bug,
  CircleDot,
  Code2,
  FolderCode,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  MonitorPlay,
  PanelBottom,
  Search,
  Settings,
  Shield,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import styles from './SupportTechnologyPage.module.css';

const MENUS = ['Arquivo', 'Editar', 'Seleção', 'Exibir', 'Acessar', 'Executar'];
const EDITOR_TABS = ['SupportTechnologyPage.jsx', 'PreviewSupport.jsx', 'terminal'];

const STAGES = [
  {
    key: 'boot',
    label: 'Inicializando construção',
    mode: 'build',
    snippet: [
      "import { useEffect, useMemo, useState } from 'react';",
      "import styles from './SupportTechnologyPage.module.css';",
      '',
      'const skynet = criarAssistenteVisual({',
      "  nome: 'Skynet',",
      "  tela: 'Suporte de tecnologia',",
      "  ambiente: 'workspace interno',",
      '});',
      '',
      'function iniciarConstrucao() {',
      '  return skynet.prepararShell({',
      "    tema: 'dark',",
      "    fonte: 'JetBrains Mono',",
      '  });',
      '}',
    ],
    logs: [
      'npm run build -- --preview tecnologia',
      'carregando shell de suporte',
      'inicializando construtor visual da Skynet',
    ],
  },
  {
    key: 'layout',
    label: 'Escrevendo interface',
    mode: 'build',
    snippet: [
      'function renderizarTelaSuporte() {',
      '  return (',
      '    <SupportWorkspace>',
      '      <Header title="Suporte de tecnologia" />',
      '      <Hero status="Em construção" />',
      '      <StatusChip>Construção assistida pela Skynet</StatusChip>',
      '      <TerminalDock compact />',
      '    </SupportWorkspace>',
      '  );',
      '}',
      '',
      'const preview = renderizarTelaSuporte();',
    ],
    logs: [
      'escrevendo estrutura principal da interface',
      'aplicando design system dark da plataforma',
      'ancorando terminal horizontal reduzido',
    ],
  },
  {
    key: 'preview',
    label: 'Testando a prévia local',
    mode: 'build',
    snippet: [
      'function publicarPreviewLocal() {',
      '  return montarPreview({',
      "    titulo: 'Suporte de tecnologia',",
      "    mensagem: 'Em construção',",
      "    assinatura: 'Construção assistida pela Skynet',",
      '    estados: ["boot", "layout", "preview"],',
      '  });',
      '}',
      '',
      'const resultado = publicarPreviewLocal();',
      'validarResultado(resultado);',
    ],
    logs: [
      'testando preview local em tempo real',
      'validando conteúdo final da tela web',
      'verificando encaixe no workspace',
    ],
  },
  {
    key: 'result',
    label: 'Resultado publicado',
    mode: 'result',
    snippet: [
      'export function SupportPreviewResult() {',
      '  return (',
      '    <WebResult>',
      '      <h1>Suporte de tecnologia</h1>',
      '      <strong>Em construção</strong>',
      '      <span>Construção assistida pela Skynet</span>',
      '    </WebResult>',
      '  );',
      '}',
      '',
      'registrarEvento("preview-pronta");',
    ],
    logs: [
      'preview local publicada',
      'resultado visível no painel web',
      'Skynet concluiu a primeira entrega visual',
    ],
  },
  {
    key: 'hal',
    label: 'Interferência detectada',
    mode: 'hal',
    snippet: [
      'function detectarInterferencia() {',
      '  return {',
      "    origem: 'HAL 9000',",
      "    acao: 'interceptar preview local',",
      "    descoberta: 'Edifica CRM',",
      '  };',
      '}',
      '',
      'const evento = detectarInterferencia();',
      'ativarOverlayDeSeguranca(evento);',
      'registrarEasterEgg("Edifica CRM");',
    ],
    logs: [
      'alerta: assinatura externa detectada',
      'HAL 9000 interceptou a prévia local',
      'canal oculto revelado: Edifica CRM',
    ],
  },
];

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MN';
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

function tokenizeLine(line) {
  if (!line) return [{ type: 'plain', text: ' ' }];
  const regex = /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|from|export|return|const|function|if|else|true|false)\b|\b\d+\b)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'plain', text: line.slice(lastIndex, match.index) });
    const value = match[0];
    let type = 'plain';
    if (["'", '"', '`'].includes(value[0])) type = 'string';
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
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Mauricio Nunes';
  const [stageIndex, setStageIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [phase, setPhase] = useState('typing');

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStageIndex((value) => (value + 1) % STAGES.length);
    }, 3400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLineIndex(0);
    setCharIndex(0);
    setPhase('typing');
  }, [stageIndex]);

  const activeStage = STAGES[stageIndex];

  useEffect(() => {
    const lines = activeStage.snippet;
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
      }, 14 + ((charIndex + lineIndex) % 4) * 8);
    }
    return () => window.clearTimeout(timer);
  }, [activeStage, charIndex, lineIndex, phase]);

  const visibleLines = useMemo(
    () => visibleSnippet(activeStage.snippet, lineIndex, charIndex),
    [activeStage.snippet, lineIndex, charIndex],
  );

  const terminalLines = useMemo(() => {
    const lines = STAGES.slice(0, stageIndex + 1).flatMap((stage) => stage.logs);
    lines.push('testando resultado da construção');
    return lines.slice(-8);
  }, [stageIndex]);

  return (
    <div className={styles.page}>
      <section className={styles.workspace} aria-label="Área em construção">
        <div className={styles.floatingStudio}>
          <header className={styles.ideTitlebar}>
            <div className={styles.launcherWrap}>
              <button type="button" className={styles.launcher} aria-label="Tela em construção pela Skynet!">
                <span className={styles.avatarBadge}>
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials(displayName)}</span>}
                </span>
                <span className={styles.tooltip}><span className={styles.tooltipTyping}>Tela em construção pela Skynet!</span></span>
              </button>
              <nav className={styles.menuBar} aria-label="Menu do editor">
                {MENUS.map((item) => <span key={item}>{item}</span>)}
              </nav>
            </div>
            <div className={styles.titleCenter} aria-hidden="true">edifica-central</div>
            <div className={styles.windowControls} aria-hidden="true"><span /><span /><span /></div>
          </header>

          <div className={styles.ideBody}>
            <aside className={styles.activityBar}>
              <Code2 size={18} />
              <Search size={18} />
              <GitBranch size={18} />
              <Bug size={18} />
              <PanelBottom size={18} />
              <Settings size={18} />
            </aside>

            <aside className={styles.explorer}>
              <div className={styles.sidebarHeader}><span>Explorador</span><FolderCode size={14} /></div>
              <div className={styles.projectName}>EDIFICA-DASH</div>
              <div className={styles.explorerMeta}>
                <span><CircleDot size={10} /> main</span>
                <span><BellDot size={10} /> 3 alertas</span>
              </div>
              <div className={styles.tree}>
                <div className={styles.treeItem}><FolderCode size={14} /><span>.github</span></div>
                <div className={styles.treeItem}><FolderCode size={14} /><span>docs</span></div>
                <div className={styles.treeItem}><FolderCode size={14} /><span>edifica-api</span></div>
                <div className={styles.treeItem}><FolderCode size={14} /><span>src</span></div>
                <div className={styles.treeItem} style={{ '--depth': 1 }}><FolderCode size={14} /><span>pages</span></div>
                <div className={`${styles.treeItem} ${styles.treeItemActive}`.trim()} style={{ '--depth': 2 }}><MonitorPlay size={14} /><span>SupportTechnologyPage.jsx</span></div>
                <div className={styles.treeItem} style={{ '--depth': 2 }}><Shield size={14} /><span>Skynet.preview.ts</span></div>
                <div className={styles.treeItem} style={{ '--depth': 2 }}><TerminalSquare size={14} /><span>preview.local.log</span></div>
                <div className={`${styles.treeItem} ${styles.treeItemEaster}`.trim()} style={{ '--depth': 1 }}><Sparkles size={14} /><span>Edifica CRM // criptografado</span></div>
              </div>
            </aside>

            <section className={styles.mainZone}>
              <div className={styles.tabs}>
                {EDITOR_TABS.map((item, index) => (
                  <span key={item} className={`${styles.tab} ${index === 0 ? styles.tabActive : ''}`.trim()}>{item}</span>
                ))}
              </div>

              <div className={styles.contentArea}>
                <section className={styles.codePane}>
                  <div className={styles.panelHeader}>
                    <span><Code2 size={14} /> construindo interface</span>
                    <span className={styles.panelHeaderMeta}>{activeStage.label}</span>
                  </div>
                  <div className={styles.codeScroll}>
                    <ol className={styles.codeList}>
                      {visibleLines.map((line, index) => {
                        const isActiveLine = index === lineIndex && phase === 'typing';
                        return (
                          <li key={`${activeStage.key}-${index + 1}`} className={styles.codeRow}>
                            <span className={styles.lineNumber}>{String(index + 1).padStart(3, '0')}</span>
                            <span className={`${styles.codeText} ${isActiveLine ? styles.codeTextActive : ''}`.trim()}>
                              {tokenizeLine(line || ' ').map((part, partIndex) => (
                                <span key={`${activeStage.key}-${index}-${partIndex}`} className={styles[`token_${part.type}`] || styles.token_plain}>{part.text}</span>
                              ))}
                              {isActiveLine ? <span className={styles.caret} aria-hidden="true" /> : null}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </section>

                <section className={styles.previewPane}>
                  <div className={styles.panelHeader}>
                    <span><MonitorPlay size={14} /> preview web</span>
                    <span className={styles.panelHeaderMeta}>localhost:5173/suporte/tecnologia</span>
                  </div>
                  <div className={styles.previewBrowser}>
                    <div className={styles.browserTopbar}>
                      <span className={styles.browserDots}><i /><i /><i /></span>
                      <span className={styles.browserAddress}>/suporte/tecnologia</span>
                    </div>
                    <div className={styles.previewSurface}>
                      <div className={styles.previewGlow} />
                      {activeStage.mode === 'build' ? (
                        <div className={styles.previewBuilding}>
                          <div className={styles.previewBadge}>Construção assistida pela Skynet</div>
                          <div className={styles.previewWireframe}>
                            <span className={styles.wireLine} />
                            <span className={styles.wireLineShort} />
                            <div className={styles.wireCards}><span /><span /><span /></div>
                            <div className={styles.wireBoard}><span /><span /><span /><span /></div>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.previewResult}>
                          <div className={styles.previewHeroEyebrow}>Suporte de tecnologia</div>
                          <h3>Em construção</h3>
                          <p>Construção assistida pela <strong>Skynet</strong></p>
                          <div className={styles.previewPills}>
                            <span>IA ativa</span>
                            <span>preview local</span>
                            <span>Edifica Central</span>
                          </div>
                          {activeStage.mode === 'hal' ? (
                            <div className={styles.halOverlay}>
                              <div className={styles.halEye} />
                              <div className={styles.halContent}>
                                <div className={styles.halTitle}><AlertTriangle size={16} /> HAL 9000 detectado</div>
                                <p>Invasão silenciosa em andamento.</p>
                                <div className={styles.halSecret}><LockKeyhole size={14} /> Sinal interceptado: <strong>Edifica CRM</strong></div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              <aside className={styles.terminalPanel}>
                <div className={styles.terminalHeader}><TerminalSquare size={14} /> <span>Terminal</span></div>
                <div className={styles.terminalBody}>
                  {terminalLines.map((entry, index) => (
                    <div key={`${entry}-${index}`} className={styles.terminalLine}>
                      <span className={styles.terminalPrompt}>›</span>
                      <span>{entry}</span>
                    </div>
                  ))}
                  <div className={styles.terminalLine}>
                    <span className={styles.terminalPrompt}>›</span>
                    <span className={styles.terminalTyping}>executando validação final</span>
                  </div>
                </div>
                <div className={styles.statusBar}>
                  <span><LayoutDashboard size={12} /> main*</span>
                  <span><BellDot size={12} /> Edifica Central</span>
                  <span><Code2 size={12} /> JetBrains Mono</span>
                  <span>UTF-8</span>
                  <span>LF</span>
                  <span>Ln 24, Col 08</span>
                </div>
              </aside>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
