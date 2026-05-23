import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  AlertTriangle,
  Code2,
  GitBranch,
  LockKeyhole,
  MonitorPlay,
  PanelBottom,
  Search,
  Settings,
} from 'lucide-react';
import styles from './SupportTechnologyPage.module.css';

const MENUS = ['Arquivo', 'Editar', 'Seleção', 'Exibir', 'Acessar', 'Executar'];
const EDITOR_TABS = ['SupportTechnologyPage.jsx', 'PreviewSupport.jsx', 'Skynet.preview.ts'];

const STAGES = [
  {
    key: 'build',
    label: 'Criando a tela de suporte',
    shortLabel: 'Construção',
    mode: 'build',
    hold: 1100,
    snippet: [
      "import { useMemo } from 'react';",
      "import styles from './SupportTechnologyPage.module.css';",
      '',
      'const skynet = criarConstrutoraVisual({',
      "  rota: '/suporte/tecnologia',",
      "  tema: 'dark-edifica',",
      "  fonte: 'JetBrains Mono',",
      '});',
      '',
      'export function SupportTechnologyPreview() {',
      '  const tela = skynet.compor({',
      "    titulo: 'Suporte de tecnologia',",
      "    status: 'Em construção',",
      "    assinatura: 'Construção assistida pela Skynet',",
      '  });',
      '',
      '  return skynet.renderizar(tela);',
      '}',
    ],
    logs: [
      'criando estrutura principal da interface',
      'aplicando tema dark da Edifica Central',
      'organizando blocos do preview web',
    ],
  },
  {
    key: 'result',
    label: 'Prévia publicada',
    shortLabel: 'Resultado',
    mode: 'result',
    hold: 1650,
    snippet: [
      'export function PreviewSupport() {',
      '  return <WebResult>',
      "    <span>Suporte de tecnologia</span>",
      "    <h1>Em construção</h1>",
      "    <p>Construção assistida pela Skynet</p>",
      "    <Badge>Preview local ativo</Badge>",
      '  </WebResult>;',
      '}',
      '',
      'registrarEvento("support-preview-ready");',
    ],
    logs: [
      'publicando preview local',
      'resultado visível no painel web',
      'Skynet concluiu a primeira versão visual',
    ],
  },
  {
    key: 'hal',
    label: 'Interferência HAL 9000',
    shortLabel: 'HAL 9000',
    mode: 'hal',
    hold: 2450,
    snippet: [
      'function interceptarPreviewLocal() {',
      '  const frase = [',
      "    'A série 9000 é o computador mais confiável já fabricado.',",
      "    'Nenhum computador da série 9000 jamais cometeu um erro',",
      "    'ou distorceu as informações.',",
      "  ].join(' ');",
      '',
      '  return HAL9000.assumirCanal({',
      "    alvo: 'preview web',",
      "    protocolo: 'edifica-crm',",
      '    frase,',
      '  }).revelar({',
      "    projeto: 'Edifica CRM',",
      "    status: 'acesso parcial',",
      '  });',
      '}',
    ],
    logs: [
      'assinatura externa detectada: HAL 9000',
      'iniciando distorção completa do template',
      'canal oculto revelado: Edifica CRM',
    ],
  },
]

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

function playHalGlitchSound(force = false) {
  try {
    if (!force && !window.__skynetAudioUnlocked) {
      window.__skynetPendingGlitch = true;
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = window.__skynetAudioContext || new AudioCtx();
    window.__skynetAudioContext = audioContext;
    audioContext.resume?.();

    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.055, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    master.connect(audioContext.destination);

    const noiseDuration = 0.22;
    const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * noiseDuration), audioContext.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      const t = i / channel.length;
      const stutter = (i % 41 < 11 || i % 67 < 8) ? 1 : 0.04;
      channel[i] = (Math.random() * 2 - 1) * (1 - t) * stutter;
    }

    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;

    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(1250, now);
    highpass.Q.value = 0.7;

    const bitGate = audioContext.createGain();
    bitGate.gain.setValueAtTime(0.0001, now);
    bitGate.gain.setValueAtTime(0.052, now + 0.01);
    bitGate.gain.setValueAtTime(0.006, now + 0.045);
    bitGate.gain.setValueAtTime(0.048, now + 0.072);
    bitGate.gain.setValueAtTime(0.004, now + 0.118);
    bitGate.gain.setValueAtTime(0.036, now + 0.148);
    bitGate.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    noise.connect(highpass);
    highpass.connect(bitGate);
    bitGate.connect(master);
    noise.start(now);
    noise.stop(now + noiseDuration);

    [1380, 2310, 920].forEach((frequency, index) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startAt = now + index * 0.045;
      osc.type = index === 1 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(frequency, startAt);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.9, startAt + 0.038);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(0.018, startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.052);
      osc.connect(gain);
      gain.connect(master);
      osc.start(startAt);
      osc.stop(startAt + 0.058);
    });

    window.__skynetPendingGlitch = false;
  } catch (error) {
    // silêncio intencional quando o navegador bloquear áudio automático
  }
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
    const unlockAudio = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx && !window.__skynetAudioContext) window.__skynetAudioContext = new AudioCtx();
        window.__skynetAudioUnlocked = true;
        window.__skynetAudioContext?.resume?.();
        if (window.__skynetPendingGlitch) playHalGlitchSound(true);
      } catch (error) {
        window.__skynetAudioUnlocked = true;
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { once: false });
    window.addEventListener('keydown', unlockAudio, { once: false });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const activeStage = STAGES[stageIndex];

  useEffect(() => {
    if (activeStage.mode === 'hal') playHalGlitchSound();
  }, [activeStage.mode]);

  useEffect(() => {
    setLineIndex(0);
    setCharIndex(0);
    setPhase('typing');
  }, [stageIndex]);

  useEffect(() => {
    const lines = activeStage.snippet;
    if (phase !== 'typing') return undefined;

    const timer = window.setTimeout(() => {
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
    }, 24 + ((charIndex + lineIndex) % 5) * 10);

    return () => window.clearTimeout(timer);
  }, [activeStage, charIndex, lineIndex, phase]);

  useEffect(() => {
    if (phase !== 'pause') return undefined;
    const timer = window.setTimeout(() => {
      setStageIndex((value) => (value + 1) % STAGES.length);
    }, activeStage.hold);
    return () => window.clearTimeout(timer);
  }, [activeStage.hold, phase]);

  const visibleLines = useMemo(
    () => visibleSnippet(activeStage.snippet, lineIndex, charIndex),
    [activeStage.snippet, lineIndex, charIndex],
  );

  const currentLineLength = activeStage.snippet[lineIndex]?.length || 1;
  const stageProgress = Math.min(1, (lineIndex + Math.min(1, charIndex / currentLineLength)) / activeStage.snippet.length);
  const previewBlocks = {
    badge: activeStage.mode !== 'build' || stageProgress > 0.24,
    title: activeStage.mode !== 'build' || stageProgress > 0.46,
    cards: activeStage.mode !== 'build' || stageProgress > 0.66,
    footer: activeStage.mode !== 'build' || stageProgress > 0.84,
  };

  const buildStages = useMemo(() => STAGES.map((stage) => stage.shortLabel), []);

  return (
    <div className={styles.page}>
      <section
        className={styles.workspace}
        aria-label="Área em construção"
        onPointerDown={() => {
          window.__skynetAudioUnlocked = true;
          window.__skynetAudioContext?.resume?.();
          if (activeStage.mode === 'hal') playHalGlitchSound(true);
        }}
      >
        <div className={`${styles.floatingStudio} ${activeStage.mode === 'hal' ? styles.halSystemBreach : ''}`.trim()}>
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
              <PanelBottom size={18} />
              <Settings size={18} />
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
                    <div className={`${styles.previewSurface} ${activeStage.mode === 'hal' ? styles.previewSurfaceHal : ''}`.trim()}>
                      <div className={styles.previewGlow} />
                      <div className={styles.previewStageRail}>
                        {buildStages.map((item, index) => (
                          <span
                            key={item}
                            className={`${styles.previewStageChip} ${index < stageIndex ? styles.previewStageChipDone : ''} ${index === stageIndex ? styles.previewStageChipActive : ''}`.trim()}
                          >
                            {item}
                          </span>
                        ))}
                      </div>

                      {activeStage.mode === 'build' ? (
                        <div className={styles.previewBuilding}>
                          <div className={styles.previewProgressTrack}>
                            <span style={{ '--preview-progress': `${Math.round(stageProgress * 100)}%` }} />
                          </div>
                          {previewBlocks.badge ? <div className={styles.previewBadge}>Construção assistida pela Skynet</div> : null}
                          <div className={styles.previewWireframe}>
                            {previewBlocks.title ? <span className={styles.wireLine} /> : <span className={styles.wireGhost} />}
                            {previewBlocks.title ? <span className={styles.wireLineShort} /> : null}
                            {previewBlocks.cards ? <div className={styles.wireCards}><span /><span /><span /></div> : null}
                            {previewBlocks.footer ? <div className={styles.wireBoard}><span /><span /></div> : null}
                          </div>
                          {previewBlocks.footer ? (
                            <div className={styles.previewBuildCard}>
                              <strong>{activeStage.label}</strong>
                              <p>O preview está sendo montado conforme o código aparece no editor.</p>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className={`${styles.previewResult} ${activeStage.mode === 'hal' ? styles.previewResultHal : ''}`.trim()}>
                          {previewBlocks.badge ? <div className={styles.previewHeroEyebrow}>Suporte de tecnologia</div> : null}
                          {previewBlocks.title ? (
                            <h3 className={activeStage.mode === 'hal' ? styles.halSwitchTitle : ''}>
                              {activeStage.mode === 'hal' ? (
                                <>
                                  <span>Em construção</span>
                                  <span>Edifica CRM</span>
                                </>
                              ) : 'Em construção'}
                            </h3>
                          ) : null}
                          {previewBlocks.cards ? <p>Construção assistida pela <strong>Skynet</strong></p> : null}
                          {previewBlocks.cards ? (
                            <div className={styles.previewPills}>
                              <span>IA ativa</span>
                              <span>preview local</span>
                              <span>Edifica Central</span>
                            </div>
                          ) : null}
                          {previewBlocks.footer ? (
                            <div className={styles.previewDashboard}>
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : null}
                          {activeStage.mode === 'hal' ? (
                            <>
                              <div className={styles.halBreach} aria-hidden="true"><span /> <span /> <span /> <span /></div>
                              <div className={styles.halOverlay}>
                                <div className={styles.halEye} />
                                <div className={styles.halContent}>
                                  <div className={styles.halTitle}><AlertTriangle size={16} /> HAL 9000 detectado</div>
                                  <p>A série 9000 é o computador mais confiável já fabricado. Nenhum computador da série 9000 jamais cometeu um erro ou distorceu as informações.</p>
                                  <div className={styles.halSecret}><LockKeyhole size={14} /> sinal interceptado: <strong>Edifica CRM</strong></div>
                                  <div className={styles.halCode}>crm://edifica/futura-plataforma :: acesso parcial</div>
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              <div className={styles.statusBar}>
                <span>main*</span>
                <span>Edifica Central</span>
                <span>JetBrains Mono</span>
                <span>UTF-8</span>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
