import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import { HomeIcon, PlusIcon, RotateCcwIcon, SettingsIcon } from '../../components/ui/Icons.jsx';
import { WORKSPACE_AREAS } from './workspaceNavigation.js';
import styles from './WorkspaceShell.module.css';

export default function WorkspaceShell({
  pageRef,
  activeArea,
  activeAreaId,
  avatar,
  displayName,
  initials,
  loading,
  minSidebarWidth,
  primaryActionLabel,
  sidebarCollapsed,
  sidebarWidth,
  tabCounters,
  onOpenSettings,
  onPrimaryAction,
  onRefresh,
  onStartResize,
  onTabChange,
  children,
}) {
  const sidebarStyle = {
    '--workspace-sidebar-width': sidebarCollapsed ? `${minSidebarWidth}px` : `${sidebarWidth}px`,
  };

  return (
    <main ref={pageRef} className={styles.page} style={sidebarStyle}>
      <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`.trim()} aria-label="Meu espaço de trabalho">
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

        <nav className={styles.sideNav} aria-label="Navegação do workspace">
          {WORKSPACE_AREAS.map((area) => {
            const Icon = area.icon;
            const count = tabCounters?.[area.id] || 0;
            return (
              <button
                key={area.id}
                type="button"
                className={area.id === activeAreaId ? styles.sideActive : ''}
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
          <Link to="/" className={styles.backButton}>
            <HomeIcon size={15} />
            <span>Voltar para a central</span>
          </Link>
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
            <span className={styles.avatar} title={displayName}>
              {avatar ? <img src={avatar} alt="" /> : initials}
            </span>
            <div>
              <span className="workspace-eyebrow">Meu espaço de trabalho</span>
              <h1>{displayName}</h1>
            </div>
          </div>

          <div className={styles.headerActions}>
            <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>
              <RotateCcwIcon size={15} /> Atualizar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onOpenSettings}>
              <SettingsIcon size={15} /> Configurações
            </Button>
            <Button type="button" size="sm" variant="primary" onClick={onPrimaryAction}>
              <PlusIcon size={15} /> {primaryActionLabel}
            </Button>
          </div>
        </header>

        <div className={styles.topStrip}>
          <div className={styles.workspaceTitle}>
            <span>{activeArea?.label}</span>
            <strong>{activeAreaId === 'home' ? 'Central pessoal' : activeArea?.label}</strong>
          </div>
          <nav className={styles.tabRail} aria-label="Áreas do workspace">
            {WORKSPACE_AREAS.map((area) => {
              const count = tabCounters?.[area.id] || 0;
              return (
                <button
                  key={area.id}
                  type="button"
                  className={area.id === activeAreaId ? styles.tabActive : ''}
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

        <div className={styles.content}>{children}</div>
      </section>
    </main>
  );
}
