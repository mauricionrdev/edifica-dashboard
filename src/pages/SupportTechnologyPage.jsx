import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import styles from './SupportTechnologyPage.module.css';

const FILE_TABS = [
  'SupportTechnologyPage.tsx',
  'supportTimeline.ts',
  'ticketQueue.service.ts',
  'workspace.theme.css',
  'support_schema.sql',
];

const CODE_LINES = [
  'import { motion } from "framer-motion";',
  'import { createSignal, bindQueue } from "@edifica/realtime";',
  '',
  'type TicketPriority = "baixa" | "media" | "alta" | "critica";',
  'type WorkspaceMode = "dracula" | "focus" | "review";',
  '',
  'const theme = createWorkspaceTheme({',
  '  mode: "dracula",',
  '  background: "#282a36",',
  '  sidebar: "#191a21",',
  '  editor: "#1f2030",',
  '  accent: "#bd93f9",',
  '});',
  '',
  'export function buildSupportWorkspace(context) {',
  '  const queue = bindQueue(context.clientId);',
  '  const permissions = resolvePermissions(context.user);',
  '  const timeline = createTicketTimeline(queue);',
  '',
  '  return composeWorkspace({',
  '    title: "Suporte de tecnologia",',
  '    theme,',
  '    permissions,',
  '    timeline,',
  '    state: "under-construction",',
  '  });',
  '}',
  '',
  'async function hydrateDemandBoard(session) {',
  '  const tickets = await api.support.listTickets({',
  '    accountId: session.accountId,',
  '    includeClient: true,',
  '    includeAssignee: true,',
  '    status: ["new", "reviewing", "blocked"],',
  '  });',
  '',
  '  return tickets.map((ticket) => ({',
  '    id: ticket.id,',
  '    label: ticket.title,',
  '    priority: normalizePriority(ticket.priority),',
  '    pulse: ticket.priority === "critica",',
  '  }));',
  '}',
  '',
  'const pipeline = createPipeline("support-technology", [',
  '  stage("capture", validateInput),',
  '  stage("triage", classifyDemand),',
  '  stage("routing", assignOwner),',
  '  stage("handoff", notifyResponsible),',
  ']);',
  '',
  'function classifyDemand(demand) {',
  '  if (demand.tags.includes("whatsapp-offline")) return "infra";',
  '  if (demand.tags.includes("agent-error")) return "ia";',
  '  if (demand.tags.includes("dashboard")) return "frontend";',
  '  return "operacional";',
  '}',
  '',
  'const statusMap = {',
  '  new: { icon: "spark", color: "purple" },',
  '  reviewing: { icon: "scan", color: "cyan" },',
  '  blocked: { icon: "alert", color: "orange" },',
  '  done: { icon: "check", color: "green" },',
  '};',
  '',
  'CREATE TABLE support_tickets (',
  '  id CHAR(36) PRIMARY KEY,',
  '  client_id CHAR(36) NOT NULL,',
  '  assignee_user_id CHAR(36) NULL,',
  '  title VARCHAR(180) NOT NULL,',
  '  priority ENUM("baixa", "media", "alta", "critica"),',
  '  status ENUM("new", "reviewing", "blocked", "done"),',
  '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
  ');',
  '',
  '.workspace[data-theme="dracula"] {',
  '  --editor-bg: #282a36;',
  '  --panel-bg: #21222c;',
  '  --line-number: #6272a4;',
  '  --comment: #6272a4;',
  '  --purple: #bd93f9;',
  '  --pink: #ff79c6;',
  '  --cyan: #8be9fd;',
  '  --yellow: #f1fa8c;',
  '}',
  '',
  'watchRealtime("support:ticket.created", (event) => {',
  '  timeline.push(event.ticket);',
  '  metrics.increment("support.created");',
  '  refreshWorkspace({ silent: true });',
  '});',
  '',
  'async function publishDraftVersion(workspace) {',
  '  await builder.compile(workspace);',
  '  await preview.render("support-technology");',
  '  await quality.checkVisualRegression();',
  '  return deploy.queue("frontend-preview");',
  '}',
  '',
  'const shortcuts = registerCommandPalette({',
  '  "ticket.create": () => openDemandComposer(),',
  '  "ticket.search": () => focusTicketSearch(),',
  '  "client.inspect": () => openClientDiagnostics(),',
  '  "build.preview": () => publishDraftVersion(workspace),',
  '});',
  '',
  'logger.info("support workspace compiled", {',
  '  theme: "dracula",',
  '  visibleActions: false,',
  '  animation: "progressive-code-generation",',
  '});',
];

const SECONDARY_LINES = [
  'queue.observe("client.offline")',
  'agent.healthcheck("openai-limit")',
  'socket.emit("ticket:update")',
  'layout.mount("support-workspace")',
  'theme.apply("dracula")',
  'composer.disableExternalActions()',
  'metrics.track("build.frame")',
  'access.guard("suporte_tecnologia")',
  'diagnostics.scan("whatsapp")',
  'preview.write("workspace-state")',
  'cache.invalidate("tickets:list")',
  'router.prefetch("/suporte/tecnologia")',
  'timeline.reconcile("local-draft")',
  'builder.paint("editor-grid")',
  'terminal.stream("npm run build")',
  'diff.apply("visual-refinement")',
  'module.create("DemandQueue")',
  'module.create("ClientTrace")',
  'module.create("AgentStatus")',
  'module.create("ReleasePanel")',
];

const TERMINAL_LINES = [
  'edifica-support booting workspace renderer',
  'loading vscode-like shell with dracula tokens',
  'hiding external action buttons',
  'creating fake ticket queue service',
  'writing support timeline hooks',
  'generating css variables for dark editor',
  'compiling simulated schema blocks',
  'rendering progressive source files',
  'mounting terminal stream without green palette',
  'checking animation density',
  'building non-repetitive code sequence',
  'workspace preview ready',
];

function getLineType(line) {
  if (!line) return 'blank';
  if (line.startsWith('import') || line.startsWith('export') || line.startsWith('type ') || line.startsWith('const ') || line.startsWith('async') || line.startsWith('function')) return 'keyword';
  if (line.includes('CREATE TABLE') || line.includes('PRIMARY KEY') || line.includes('TIMESTAMP') || line.includes('VARCHAR') || line.includes('ENUM')) return 'sql';
  if (line.trim().startsWith('--') || line.trim().startsWith('//')) return 'comment';
  if (line.trim().startsWith('.') || line.includes('--')) return 'css';
  if (line.includes('"') || line.includes('\'')) return 'string';
  if (line.includes('return') || line.includes('await') || line.includes('if ')) return 'logic';
  return 'plain';
}

export default function SupportTechnologyPage() {
  const { setPanelHeader } = useOutletContext();

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const codeRows = [...CODE_LINES, ...CODE_LINES.slice(0, 34)];
  const terminalRows = [...TERMINAL_LINES, ...TERMINAL_LINES];
  const secondaryRows = [...SECONDARY_LINES, ...SECONDARY_LINES, ...SECONDARY_LINES.slice(0, 12)];

  return (
    <div className={styles.page}>
      <section className={styles.workspace} data-theme="dracula" aria-label="Workspace de suporte de tecnologia em construção">
        <div className={styles.vscodeShell}>
          <aside className={styles.activityBar} aria-hidden="true">
            <span className={styles.activityActive}>⌘</span>
            <span>⌕</span>
            <span>⑂</span>
            <span>◫</span>
            <span>⚙</span>
          </aside>

          <aside className={styles.fileExplorer} aria-hidden="true">
            <span className={styles.explorerTitle}>EDIFICA-PLATFORM</span>
            <div className={styles.folderTree}>
              <strong>src</strong>
              <span>pages</span>
              <em>SupportTechnologyPage.tsx</em>
              <span>services</span>
              <em>ticketQueue.service.ts</em>
              <span>styles</span>
              <em>workspace.theme.css</em>
              <span>database</span>
              <em>support_schema.sql</em>
            </div>
          </aside>

          <main className={styles.editorArea}>
            <header className={styles.titleBar}>
              <div className={styles.windowDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className={styles.windowTitle}>Suporte de tecnologia — workspace em construção</span>
            </header>

            <nav className={styles.tabs} aria-hidden="true">
              {FILE_TABS.map((tab, index) => (
                <span key={tab} className={index === 0 ? styles.tabActive : undefined}>{tab}</span>
              ))}
            </nav>

            <div className={styles.editorCanvas}>
              <div className={styles.backgroundCode} aria-hidden="true">
                {secondaryRows.map((line, index) => (
                  <span key={`${line}-${index}`}>{line}</span>
                ))}
              </div>

              <div className={styles.mainCodeTrack}>
                {codeRows.map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className={`${styles.codeLine} ${styles[`line_${getLineType(line)}`]}`}
                    style={{
                      '--line-delay': `${(index % 24) * 0.14}s`,
                      '--line-steps': Math.max(16, Math.min(72, line.length)),
                    }}
                  >
                    <span className={styles.lineNumber}>{String(index + 1).padStart(3, '0')}</span>
                    <span className={styles.liveCode}>{line || ' '}</span>
                  </div>
                ))}
              </div>

              <aside className={styles.minimap} aria-hidden="true">
                {codeRows.slice(0, 80).map((line, index) => (
                  <span key={`map-${index}`} style={{ width: `${28 + (line.length % 58)}%` }} />
                ))}
              </aside>
            </div>

            <footer className={styles.statusBar} aria-hidden="true">
              <span>Dracula</span>
              <span>TypeScript JSX</span>
              <span>UTF-8</span>
              <strong>gerando código...</strong>
            </footer>
          </main>

          <aside className={styles.terminalPanel} aria-label="Terminal de construção">
            <header>TERMINAL</header>
            <div className={styles.terminalViewport}>
              <div className={styles.terminalTrack}>
                {terminalRows.map((line, index) => (
                  <span key={`${line}-${index}`}>λ {line}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
