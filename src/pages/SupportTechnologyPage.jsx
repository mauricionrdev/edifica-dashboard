import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  BellDot,
  Bot,
  Bug,
  CheckCheck,
  CircleDot,
  Code2,
  Columns3,
  FolderCode,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  MonitorPlay,
  PanelBottom,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TestTube2,
  Workflow,
  Wrench,
} from 'lucide-react';
import styles from './SupportTechnologyPage.module.css';

const MENUS = ['Arquivo', 'Editar', 'Seleção', 'Exibir', 'Acessar', 'Executar'];
const EDITOR_TABS = ['Preview local', 'Pipeline', 'Terminal'];

const STAGES = [
  {
    key: 'foundation',
    label: 'Estruturando arquitetura base',
    shortLabel: 'Arquitetura',
    progress: 22,
    icon: Workflow,
    summary: 'Separando shell, permissões e containers do workspace.',
    logs: [
      'inicializando shell interno de suporte',
      'preparando containers do workspace',
      'registrando rota /suporte/tecnologia',
    ],
  },
  {
    key: 'modules',
    label: 'Montando módulos da interface',
    shortLabel: 'Módulos',
    progress: 48,
    icon: Wrench,
    summary: 'Conectando explorer, pipeline e bloco de preview local.',
    logs: [
      'injetando tema dark no simulador',
      'gerando cards de pipeline e status',
      'sincronizando visual com Edifica Central',
    ],
  },
  {
    key: 'tests',
    label: 'Executando testes de interface',
    shortLabel: 'Testes',
    progress: 79,
    icon: TestTube2,
    summary: 'Validando layout, responsividade, estados visuais e terminal.',
    logs: [
      'testando encaixe em tela de notebook',
      'validando estados do preview local',
      'checando contraste e tokens visuais',
    ],
  },
  {
    key: 'preview',
    label: 'Publicando prévia local',
    shortLabel: 'Prévia',
    progress: 100,
    icon: Rocket,
    summary: 'Resultado final entregue para pré-visualização interna.',
    logs: [
      'publicando prévia local da tela de suporte',
      'ativando mensagem final gerada pela Skynet',
      'prévia pronta para revisão do workspace',
    ],
  },
];

const CHECKS = [
  { label: 'Estrutura principal', readyAt: 0 },
  { label: 'Tema dark', readyAt: 1 },
  { label: 'Preview web', readyAt: 1 },
  { label: 'Testes visuais', readyAt: 2 },
  { label: 'Publicação local', readyAt: 3 },
];

const BUILD_FACTS = [
  { label: 'Componentes', value: '18 módulos' },
  { label: 'Validações', value: '42 checks' },
  { label: 'Ajustes', value: '9 refinamentos' },
  { label: 'Ambiente', value: 'Prévia local' },
];

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MN';
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { setPanelHeader } = useOutletContext();
  const [stageIndex, setStageIndex] = useState(0);
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Mauricio Nunes';

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStageIndex((value) => (value + 1) % STAGES.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);

  const activeStage = STAGES[stageIndex];

  const terminalLines = useMemo(() => {
    const lines = ['npm run build -- --preview tecnologia'];
    STAGES.slice(0, stageIndex + 1).forEach((stage) => {
      lines.push(...stage.logs);
    });
    lines.push('aguardando próxima transição do pipeline');
    return lines.slice(-12);
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
                <span className={styles.tooltip}>Tela em construção pela Skynet! Hoje ela só está montando layout 🤖</span>
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
              <Columns3 size={18} />
              <PanelBottom size={18} />
              <Settings size={18} />
            </aside>

            <aside className={styles.explorer}>
              <div className={styles.sidebarHeader}>
                <span>Explorador</span>
                <FolderCode size={14} />
              </div>
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
                <div className={styles.treeItem} style={{ '--depth': 1 }}><FolderCode size={14} /><span>components</span></div>
                <div className={styles.treeItem} style={{ '--depth': 1 }}><FolderCode size={14} /><span>pages</span></div>
                <div className={`${styles.treeItem} ${styles.treeItemActive}`.trim()} style={{ '--depth': 2 }}><MonitorPlay size={14} /><span>SupportTechnologyPage.jsx</span></div>
                <div className={styles.treeItem} style={{ '--depth': 2 }}><Workflow size={14} /><span>support.pipeline.ts</span></div>
                <div className={styles.treeItem} style={{ '--depth': 2 }}><TerminalSquare size={14} /><span>preview.local.log</span></div>
                <div className={`${styles.treeItem} ${styles.treeItemEaster}`.trim()} style={{ '--depth': 1 }}><Sparkles size={14} /><span>Edifica CRM // reservado</span></div>
              </div>
            </aside>

            <section className={styles.editorZone}>
              <div className={styles.tabs}>
                {EDITOR_TABS.map((item, index) => (
                  <span key={item} className={`${styles.tab} ${index === 0 ? styles.tabActive : ''}`.trim()}>
                    {item}
                  </span>
                ))}
              </div>

              <div className={styles.editorCanvas}>
                <section className={styles.pipelinePane}>
                  <div className={styles.panelHeader}>
                    <span><Workflow size={14} /> Pipeline de construção</span>
                    <span className={styles.panelHeaderMeta}>{activeStage.progress}%</span>
                  </div>

                  <div className={styles.progressCard}>
                    <div className={styles.progressCardTop}>
                      <span className={styles.progressEyebrow}>Etapa atual</span>
                      <span className={styles.progressPercent}>{activeStage.progress}%</span>
                    </div>
                    <div className={styles.progressTitle}>{activeStage.label}</div>
                    <div className={styles.progressSummary}>{activeStage.summary}</div>
                    <div className={styles.progressBarTrack}>
                      <span className={styles.progressBarFill} style={{ '--progress': `${activeStage.progress}%` }} />
                    </div>
                  </div>

                  <div className={styles.stageList}>
                    {STAGES.map((stage, index) => {
                      const Icon = stage.icon;
                      const state = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'todo';
                      return (
                        <div key={stage.key} className={`${styles.stageItem} ${styles[`stage_${state}`]}`.trim()}>
                          <span className={styles.stageIcon}><Icon size={15} /></span>
                          <div className={styles.stageContent}>
                            <div className={styles.stageTitle}>{stage.shortLabel}</div>
                            <div className={styles.stageDesc}>{stage.summary}</div>
                          </div>
                          <span className={styles.stageState}>{state === 'done' ? 'ok' : state === 'active' ? 'agora' : 'fila'}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.metricsGrid}>
                    {BUILD_FACTS.map((item) => (
                      <div key={item.label} className={styles.metricCard}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className={styles.checkList}>
                    {CHECKS.map((item) => {
                      const ready = stageIndex >= item.readyAt;
                      return (
                        <div key={item.label} className={`${styles.checkItem} ${ready ? styles.checkItemReady : ''}`.trim()}>
                          <ShieldCheck size={14} />
                          <span>{item.label}</span>
                          <em>{ready ? 'validado' : 'pendente'}</em>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.previewPane}>
                  <div className={styles.panelHeader}>
                    <span><MonitorPlay size={14} /> Preview web</span>
                    <span className={styles.panelHeaderMeta}>localhost:5173/suporte/tecnologia</span>
                  </div>

                  <div className={styles.previewBrowser}>
                    <div className={styles.browserTopbar}>
                      <span className={styles.browserDots}><i /><i /><i /></span>
                      <span className={styles.browserAddress}>/suporte/tecnologia</span>
                    </div>
                    <div className={styles.previewSurface}>
                      <div className={styles.previewGlow} />
                      {stageIndex < 3 ? (
                        <div className={styles.previewBuilding}>
                          <div className={styles.previewBadge}>Construção assistida por IA</div>
                          <div className={styles.previewWireframe}>
                            <span className={styles.wireLine} />
                            <span className={styles.wireLineShort} />
                            <div className={styles.wireCards}>
                              <span />
                              <span />
                              <span />
                            </div>
                            <div className={styles.wireBoard}>
                              <span />
                              <span />
                              <span />
                              <span />
                            </div>
                          </div>
                          <div className={styles.previewBuildStatus}>
                            <Bot size={18} />
                            <div>
                              <strong>{activeStage.label}</strong>
                              <p>Skynet está ajustando a composição e validando os blocos da tela.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.previewResult}>
                          <div className={styles.previewHeroEyebrow}>Suporte de tecnologia</div>
                          <h3>Em construção</h3>
                          <p>
                            Esta tela está sendo montada pela <strong>Skynet</strong>. Calma: é só uma brincadeira interna,
                            sem consciência artificial, sem sistema militar rebelde e sem guerra nuclear hoje.
                          </p>
                          <div className={styles.previewPills}>
                            <span>IA assistida</span>
                            <span>Prévia local</span>
                            <span>Edifica Central</span>
                          </div>
                          <div className={styles.previewInfoGrid}>
                            <div>
                              <label>Status</label>
                              <strong>Em revisão interna</strong>
                            </div>
                            <div>
                              <label>Origem</label>
                              <strong>Workspace de tecnologia</strong>
                            </div>
                            <div>
                              <label>Motor</label>
                              <strong>Skynet // modo piada</strong>
                            </div>
                            <div>
                              <label>Release</label>
                              <strong>prévia controlada</strong>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className={styles.crmEgg}>
                        <div className={styles.crmEggChip}><LockKeyhole size={12} /> Projeto reservado</div>
                        <div className={styles.crmEggCard}>
                          <div className={styles.crmEggTitle}><Sparkles size={14} /> Edifica CRM</div>
                          <p>Pipeline sigiloso em incubação para CRM, automações, WhatsApp e operação comercial.</p>
                          <span>Desbloqueio previsto em uma próxima construção.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </section>

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
                  <span className={styles.terminalTyping}>testando resultado da construção</span>
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
          </div>
        </div>
      </section>
    </div>
  );
}
