import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellIcon, ChecklistIcon, MenuIcon, MoonIcon, PanelLeftIcon, RotateCcwIcon, SunIcon } from '../ui/Icons.jsx';
import Button from '../ui/Button.jsx';
import LoadingIcon from '../ui/LoadingIcon.jsx';
import { getUserAvatar } from '../../utils/avatarStorage.js';
import styles from './Topbar.module.css';

function routeLabel(pathname) {
  if (pathname.startsWith('/ranking-squads')) return 'Ranking';
  if (pathname.startsWith('/clientes')) return 'Clientes';
  if (pathname.startsWith('/preencher-semana')) return 'Semana';
  if (pathname.startsWith('/gdv')) return 'GDV';
  if (pathname.startsWith('/equipe')) return 'Equipe';
  if (pathname.startsWith('/perfil')) return 'Perfil';
  if (pathname.startsWith('/modelo-oficial')) return 'Modelo Oficial';
  if (pathname.startsWith('/squads')) return 'Squad';
  if (pathname.startsWith('/projetos')) return 'Projetos';
  return 'Dashboard';
}

function levelLabel(level) {
  if (level === 'success') return 'Sucesso';
  if (level === 'warning') return 'Atenção';
  if (level === 'danger') return 'Crítica';
  return 'Atualização';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function Topbar({
  onOpenSidebar,
  onToggleSidebarCollapse,
  onToggleTheme,
  sidebarCollapsed = false,
  theme = 'dark',
  title,
  notifications = [],
  notificationsLoading = false,
  notificationsOpen = false,
  unreadCount = 0,
  userDirectory = [],
  onToggleNotifications,
  onCloseNotifications,
  onRefreshNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const nextThemeLabel = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
  const current = routeLabel(location.pathname);
  const unreadItems = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications]
  );
  const visibleUsers = useMemo(
    () =>
      (Array.isArray(userDirectory) ? userDirectory : [])
        .filter((entry) => entry?.id && entry?.name && entry.active !== false)
        .slice(0, 5),
    [userDirectory]
  );

  function formatRelative(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
    if (Math.abs(diffMin) < 60) return formatter.format(diffMin, 'minute');
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) return formatter.format(diffHour, 'hour');
    const diffDay = Math.round(diffHour / 24);
    return formatter.format(diffDay, 'day');
  }

  useEffect(() => {
    if (!notificationsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onCloseNotifications?.();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseNotifications?.();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen, onCloseNotifications]);

  useEffect(() => {
    onCloseNotifications?.();
  }, [location.pathname, onCloseNotifications]);

  return (
    <header className={styles.topbar}>
      <div className={styles.rail}>
        <button type="button" className={styles.menuButton} onClick={onOpenSidebar} aria-label="Abrir navegação">
          <MenuIcon size={16} />
        </button>

        {sidebarCollapsed ? (
          <button
            type="button"
            className={styles.collapseButton}
            onClick={onToggleSidebarCollapse}
            aria-label="Abrir sidebar"
            title="Abrir sidebar"
          >
            <PanelLeftIcon size={16} />
          </button>
        ) : null}

        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <span>Workspace</span>
          <span className={styles.separator}>/</span>
          <span>Ferramenta interna</span>
          <span className={styles.separator}>/</span>
          <strong>{current || title}</strong>
        </nav>

        <div className={styles.actions}>
          {false && visibleUsers.length > 0 ? (
            <div className={styles.userStack} aria-label="Usuários cadastrados">
              {visibleUsers.map((entry) => {
                const avatarUrl = getUserAvatar(entry);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.userAvatar}
                    onClick={() => navigate(`/perfil/${entry.id}`)}
                    aria-label={`Abrir perfil de ${entry.name}`}
                    title={entry.name}
                  >
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(entry.name)}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className={styles.notificationsWrap} ref={panelRef}>
            <button
              type="button"
              className={`${styles.notificationButton} ${notificationsOpen ? styles.notificationButtonActive : ''}`.trim()}
              onClick={onToggleNotifications}
              aria-label="Abrir notificações"
              aria-expanded={notificationsOpen ? 'true' : 'false'}
              aria-haspopup="dialog"
            >
              <BellIcon size={16} />
              {unreadCount > 0 ? (
                <span className={styles.notificationBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className={styles.notificationsPanel} role="dialog" aria-label="Caixa de entrada">
                <div className={styles.notificationsHead}>
                  <div>
                    <strong>Caixa de entrada</strong>
                    <small>{unreadItems} não lida(s)</small>
                  </div>
                  <div className={styles.notificationsHeadActions}>
                    <button
                      type="button"
                      className={styles.notificationsActionIcon}
                      onClick={onRefreshNotifications}
                      disabled={notificationsLoading}
                      aria-label="Atualizar notificações"
                      title="Atualizar notificações"
                    >
                      <RotateCcwIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.notificationsActionIcon}
                      onClick={onMarkAllNotificationsRead}
                      disabled={notificationsLoading || unreadItems === 0}
                      aria-label="Marcar todas como lidas"
                      title="Marcar todas como lidas"
                    >
                      <ChecklistIcon size={14} />
                    </button>
                  </div>
                </div>

                <div className={styles.notificationsList}>
                  {notificationsLoading && notifications.length === 0 ? (
                    <div className={styles.notificationsEmpty}><LoadingIcon size="sm" label="Carregando notificações" /><span>Carregando notificações</span></div>
                  ) : notifications.length === 0 ? (
                    <div className={styles.notificationsEmpty}>Nenhuma notificação</div>
                  ) : (
                    notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.notificationItem} ${item.readAt ? '' : styles.notificationItemUnread}`.trim()}
                        onClick={async () => {
                          if (!item.readAt) {
                            await onMarkNotificationRead?.(item.id);
                          }
                          if (item.actionUrl) {
                            onCloseNotifications?.();
                            navigate(item.actionUrl);
                          }
                        }}
                      >
                        <div className={styles.notificationMeta}>
                          <span
                            className={`${styles.notificationLevel} ${
                              styles[`notificationLevel${item.level || 'info'}`] || ''
                            }`.trim()}
                          >
                            {levelLabel(item.level)}
                          </span>
                          <strong>{item.title}</strong>
                          <time>{formatRelative(item.createdAt)}</time>
                        </div>
                        <div className={styles.notificationMessage}>
                          {item.body ? <p>{item.body}</p> : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className={styles.themeButton}
            onClick={onToggleTheme}
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
          >
            {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
          </Button>
        </div>
      </div>
    </header>
  );
}
