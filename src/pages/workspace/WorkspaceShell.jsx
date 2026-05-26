import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import {
  HomeIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
} from '../../components/ui/Icons.jsx';
import { WORKSPACE_AREAS } from './workspaceNavigation.js';
import styles from '../WorkspacePage.module.css';

export default function WorkspaceShell({
  pageRef,
  compact = false,
  sidebarCollapsed = false,
  sidebarWidth,
  minSidebarWidth,
  activeTab,
  activeTabLabel,
  tabCounters = {},
  displayName,
  avatar,
  initials,
  tasksLoading = false,
  onTabChange,
  onRefresh,
  onOpenSettings,
  onPrimaryAction,
  primaryActionLabel,
  onStartResize,
  children,
}) {
  const sidebarStyle = {
    '--workspace-sidebar-width': sidebarCollapsed ? `${minSidebarWidth}px` : `${sidebarWidth}px`,
  };

  return (
    <main ref={pageRef} className={`${styles.page} ${compact ? styles.pageCompact : ''}`.trim()} style={sidebarStyle}>
      <aside className={`${styles.sidebar} ${compact ? styles.sidebarCompact : ''}`.trim()} aria-label="Meu espaço de trabalho">
        <div className={styles.sidebarHeader}>
          <span className={styles.brandMark}>edi</span>
          <div className={styles.sidebarTitle}>
            <strong>Workspace</strong>
            <span>pessoal</span>
          </div>
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => onStartResize?.('toggle')}
            aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            title={sidebarCollapsed ? 'Expandir' : 'Recolher'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className={styles.sideNav} aria-label="Navegação do espaço">
          {WORKSPACE_AREAS.map((area) => {
            const Icon = area.icon;
            const count = tabCounters[area.id];
            return (
              <button
                key={area.id}
                type="button"
                className={area.id === activeTab ? styles.sideActive : ''}
                onClick={() => onTabChange?.(area.id)}
                title={area.description}
              >
                <Icon size={15} />
                <span>{area.label}</span>
                {count ? <em>{count}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link to="/" className={styles.backButton}><HomeIcon size={15} /> <span>Voltar para a central</span></Link>
        </div>
        <button
          type="button"
          className={styles.sidebarResizeHandle}
          aria-label="Ajustar largura da sidebar"
          onPointerDown={(event) => {
            event.preventDefault();
            onStartResize?.('resize');
          }}
        />
      </aside>

      <section className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.avatar} title={displayName}>{avatar ? <img src={avatar} alt="" /> : initials}</span>
            <div>
              <span className={styles.eyebrow}>Meu espaço de trabalho</span>
              <h1>{displayName}</h1>
            </div>
          </div>

          <div className={styles.headerActions}>
            <Button size="sm" variant="secondary" onClick={onRefresh} disabled={tasksLoading}><RotateCcwIcon size={15} /> Atualizar</Button>
            <Button size="sm" variant="secondary" onClick={onOpenSettings}><SettingsIcon size={15} /> Configurações</Button>
            <Button size="sm" variant="primary" onClick={onPrimaryAction}><PlusIcon size={15} /> {primaryActionLabel || (activeTab === 'documents' ? 'Novo documento' : 'Nova planilha')}</Button>
          </div>
        </header>

        <div className={styles.topStrip}>
          <div className={styles.workspaceTitle}>
            <span>{activeTabLabel}</span>
            <strong>{activeTab === 'home' ? 'Central pessoal' : activeTabLabel}</strong>
          </div>
          <nav className={styles.tabRail} aria-label="Áreas do workspace">
            {WORKSPACE_AREAS.map((area) => {
              const count = tabCounters[area.id];
              return (
                <button
                  key={area.id}
                  type="button"
                  className={area.id === activeTab ? styles.tabActive : ''}
                  onClick={() => onTabChange?.(area.id)}
                  title={area.description}
                >
                  <span>{area.shortLabel || area.label}</span>
                  {count ? <em>{count}</em> : null}
                </button>
              );
            })}
          </nav>
        </div>

        {children}
      </section>
    </main>
  );
}
