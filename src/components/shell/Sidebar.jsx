import { isActiveClientStatus } from '../../utils/clientStatus.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { updateGdv } from '../../api/gdvs.js';
import { buildGdvPath, buildSquadPath, matchesEntityRouteSegment } from '../../utils/entityPaths.js';
import { updateSquad } from '../../api/squads.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getUserAvatar, subscribeAvatarChange } from '../../utils/avatarStorage.js';
import { isAdminUser, roleLabel } from '../../utils/roles.js';
import {
  canViewClients,
  canViewGdv,
  canViewMetrics,
  hasPermission,
  canManageGdvs,
  canManageSquads,
  canViewTeamArea,
} from '../../utils/permissions.js';
import {
  BriefcaseIcon,
  ChartColumnIcon,
  CalendarIcon,
  ClipboardListIcon,
  ChevronLeftIcon,
  CloseIcon,
  HomeIcon,
  LogOutIcon,
  SearchIcon,
  TrophyIcon,
  UsersIcon,
} from '../ui/Icons.jsx';
import { matchesSearch, normalizeSearch } from '../../utils/search.js';
import styles from './Sidebar.module.css';

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getSquadLogo(squad) {
  return (
    squad?.logoUrl
    || squad?.logo_url
    || squad?.avatarUrl
    || squad?.avatar_url
    || squad?.imageUrl
    || squad?.image_url
    || ''
  );
}

function Item({ to, icon, label, meta, onClick, collapsed = false }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `${styles.item} ${isActive ? styles.itemActive : ''} ${collapsed ? styles.itemCollapsed : ''}`.trim()
      }
      title={collapsed ? label : undefined}
    >
      <span className={styles.itemIcon}>{icon}</span>
      {!collapsed ? <span className={styles.itemLabel}>{label}</span> : null}
      {!collapsed && meta ? <span className={styles.itemMeta}>{meta}</span> : null}
    </NavLink>
  );
}

export default function Sidebar({
  clients = [],
  squads = [],
  gdvs = [],
  userDirectory = [],
  refreshSquads,
  refreshGdvs,
  refreshClients,
  refreshUserDirectory,
  isOpen = false,
  collapsed = false,
  onClose,
  onNavigate,
  onToggleCollapse,
}) {
  const searchVisible = false;
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(() => getUserAvatar(user));
  const [editingSquadId, setEditingSquadId] = useState(null);
  const [editingSquadName, setEditingSquadName] = useState('');
  const [renamingSquadId, setRenamingSquadId] = useState(null);
  const [editingGdvName, setEditingGdvName] = useState('');
  const [editingGdvKey, setEditingGdvKey] = useState('');
  const [renamingGdvKey, setRenamingGdvKey] = useState('');
  const searchRef = useRef(null);
  const admin = isAdminUser(user);
  const canManageSidebarSquads = canManageSquads(user);
  const canManageSidebarGdvs = canManageGdvs(user);
  const canViewTeam = canViewTeamArea(user);

  const normalizedQuery = normalizeSearch(query);
  const activeGdvId = useMemo(() => {
    const match = location.pathname.match(/^\/gdvs\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }, [location.pathname]);

  const activeSquadId = useMemo(() => {
    const match = location.pathname.match(/^\/squads\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }, [location.pathname]);


  const activeCount = clients.filter((client) => isActiveClientStatus(client.status)).length;
  const totalCount = clients.length;
  const userSquadIds = Array.isArray(user?.squads) ? user.squads : [];
  const visibleSquads = admin ? squads : squads.filter((squad) => userSquadIds.includes(squad.id));

  const visibleGdvs = useMemo(() => {
    const userList = Array.isArray(userDirectory) ? userDirectory : [];
    const gdvList = Array.isArray(gdvs) ? gdvs : [];

    return gdvList
      .map((gdv) => {
        const owner = gdv.owner || userList.find((entry) => entry.id === gdv.ownerUserId) || null;
        return {
          key: gdv.id,
          id: gdv.id,
          name: gdv.name,
          gdvName: gdv.name,
          owner,
          ownerId: gdv.ownerUserId,
          active: gdv.active,
          clientsCount: gdv.clientsCount || 0,
        };
      })
      .filter((entry) => entry.owner && entry.active)
      .filter((entry) => admin || entry.ownerId === user?.id)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [admin, gdvs, user?.id, userDirectory]);

  const primaryItems = useMemo(
    () => [
      hasPermission(user, 'central.view')
        ? {
            to: '/',
            icon: <HomeIcon size={16} />,
            label: 'Dashboard',
            meta: activeCount ? String(activeCount) : null,
          }
        : null,
      canViewClients(user)
        ? {
            to: '/clientes',
            icon: <BriefcaseIcon size={16} />,
            label: 'Clientes',
            meta: totalCount ? String(totalCount) : null,
          }
        : null,
      hasPermission(user, 'projects.view')
        ? {
            to: '/projetos',
            icon: <ClipboardListIcon size={16} />,
            label: 'Projetos',
          }
        : null,
      canViewMetrics(user)
        ? {
            to: '/preencher-semana',
            icon: <CalendarIcon size={16} />,
            label: 'Preencher Semana',
          }
        : null,
    ].filter(Boolean),
    [activeCount, totalCount, user]
  );

  const adminItems = useMemo(
    () => [
      {
        to: '/equipe',
        icon: <UsersIcon size={16} />,
        label: 'Equipe',
      },
    ].filter(Boolean),
    []
  );

  const filteredPrimary = primaryItems.filter((item) => matchesSearch(item.label, normalizedQuery));
  const filteredGdvs = visibleGdvs.filter((entry) => (
    matchesSearch(entry.name, normalizedQuery)
    || matchesSearch(entry.gdvName, normalizedQuery)
    || matchesSearch('GDVs', normalizedQuery)
  ));
  const filteredAdmin = adminItems.filter((item) => matchesSearch(item.label, normalizedQuery));
  const filteredSquads = visibleSquads.filter((squad) => matchesSearch(squad.name, normalizedQuery));

  const handleNavigate = () => {
    onNavigate?.();
    onClose?.();
  };

  const startSquadRename = (event, squad) => {
    if (!canManageSidebarSquads || !squad?.id || collapsed) return;
    event.preventDefault();
    event.stopPropagation();
    setEditingSquadId(squad.id);
    setEditingSquadName(squad.name || '');
  };

  const cancelSquadRename = () => {
    setEditingSquadId(null);
    setEditingSquadName('');
  };

  const commitSquadRename = async (squad) => {
    if (!canManageSidebarSquads || !squad?.id || renamingSquadId) return;
    const nextName = editingSquadName.trim();
    if (!nextName || nextName === squad.name) {
      cancelSquadRename();
      return;
    }

    setRenamingSquadId(squad.id);
    try {
      await updateSquad(squad.id, { name: nextName });
      await refreshSquads?.();
      showToast(`"${nextName}" atualizado.`, { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível renomear o squad.', { variant: 'error' });
    } finally {
      setRenamingSquadId(null);
      cancelSquadRename();
    }
  };

  const startGdvRename = (event, entry) => {
    if (!canManageSidebarGdvs || !entry?.owner?.id || collapsed) return;
    event.preventDefault();
    event.stopPropagation();
    setEditingGdvKey(entry.key);
    setEditingGdvName(entry.name || '');
  };

  const cancelGdvRename = () => {
    setEditingGdvKey('');
    setEditingGdvName('');
  };

  const commitGdvRename = async (entry) => {
    if (!canManageSidebarGdvs || !entry?.id || renamingGdvKey) return;
    const nextName = editingGdvName.trim();
    const currentName = String(entry.name || '').trim();
    if (!nextName || nextName === currentName) {
      cancelGdvRename();
      return;
    }

    setRenamingGdvKey(entry.key);
    try {
      await updateGdv(entry.id, { name: nextName, ownerUserId: entry.ownerId });
      await Promise.all([refreshGdvs?.(), refreshClients?.(), refreshUserDirectory?.()]);
      showToast(`"${nextName}" atualizado.`, { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível renomear o GDV.', { variant: 'error' });
    } finally {
      setRenamingGdvKey('');
      cancelGdvRename();
    }
  };

  useEffect(() => {
    if (!searchVisible) return undefined;
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !collapsed) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed, searchVisible]);

  useEffect(() => {
    setAvatarUrl(getUserAvatar(user));
    return subscribeAvatarChange(() => setAvatarUrl(getUserAvatar(user)));
  }, [user]);

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''} ${collapsed ? styles.collapsed : ''}`.trim()}>
      <div className={styles.header}>
        <Link to="/" className={styles.brand} onClick={handleNavigate} title="Ir para o dashboard">
          <img className={styles.brandLogo} src="/brand/logo.png" alt="Edifica" />
        </Link>

        <button
          type="button"
          className={styles.collapseButton}
          onClick={() => onToggleCollapse?.()}
          aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          <ChevronLeftIcon size={16} className={collapsed ? styles.collapseIconClosed : ''} />
        </button>

        <button type="button" className={styles.closeButton} onClick={() => onClose?.()} aria-label="Fechar navegação">
          <CloseIcon size={16} />
        </button>
      </div>

      {!collapsed && searchVisible ? (
        <div className={styles.search}>
          <label className={styles.searchBox}>
            <SearchIcon size={15} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar tarefas, clientes..."
              aria-label="Buscar na navegação"
            />
            <kbd>Ctrl K</kbd>
          </label>
        </div>
      ) : null}

      <nav className={`${styles.nav} sb-nav`} aria-label="Navegação principal">
        <section className={styles.group}>
          {filteredPrimary.map((item) => (
            <Item key={item.to} {...item} onClick={handleNavigate} collapsed={collapsed} />
          ))}
        </section>

        {canViewGdv(user) && filteredGdvs.length > 0 ? (
          <section className={styles.group}>
            <div className={styles.groupLabel}>
              <span>GDVs</span>
            </div>
            {filteredGdvs.map((entry) => (
              <NavLink
                key={entry.key}
                to={buildGdvPath(entry)}
                onClick={handleNavigate}
                onDoubleClick={(event) => startGdvRename(event, entry)}
                className={({ isActive }) =>
                  `${styles.item} ${(isActive || matchesEntityRouteSegment(activeGdvId, entry)) ? styles.itemActive : ''} ${collapsed ? styles.itemCollapsed : ''}`.trim()
                }
                title={collapsed ? entry.name : undefined}
              >
                <span className={styles.itemIcon}>
                  <ChartColumnIcon size={16} />
                </span>
                {editingGdvKey === entry.key ? (
                  <input
                    className={styles.renameInput}
                    value={editingGdvName}
                    disabled={renamingGdvKey === entry.key}
                    autoFocus
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onChange={(event) => setEditingGdvName(event.target.value)}
                    onBlur={() => commitGdvRename(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelGdvRename();
                      }
                    }}
                  />
                ) : !collapsed ? (
                  <span className={styles.itemLabel} title={canManageSidebarGdvs ? 'Clique duas vezes para renomear' : entry.name}>
                    {entry.name}
                  </span>
                ) : null}
                {!collapsed ? <span className={styles.itemMeta}>{entry.clientsCount || ''}</span> : null}
              </NavLink>
            ))}
          </section>
        ) : null}

        {hasPermission(user, 'ranking.view') && matchesSearch('Ranking', normalizedQuery) ? (
          <section className={styles.group}>
            <Item
              to="/ranking-squads"
              icon={<TrophyIcon size={16} />}
              label="Ranking"
              onClick={handleNavigate}
              collapsed={collapsed}
            />
          </section>
        ) : null}

        {hasPermission(user, 'squads.view') ? (
          <section className={styles.group}>
            <div className={styles.groupLabel}>
              <span>Squads</span>
            </div>
            {filteredSquads.length > 0 ? (
              filteredSquads.map((squad, index) => (
                <NavLink
                  key={squad.id}
                  to={buildSquadPath(squad)}
                  onClick={handleNavigate}
                  onDoubleClick={(event) => startSquadRename(event, squad)}
                  className={({ isActive }) =>
                    `${styles.item} ${isActive ? styles.itemActive : ''} ${collapsed ? styles.itemCollapsed : ''}`.trim()
                  }
                  title={collapsed ? squad.name : undefined}
                >
                  <span className={styles.squadLogo} data-tone={index % 5} aria-hidden="true">
                    {getSquadLogo(squad) ? <img src={getSquadLogo(squad)} alt="" /> : initials(squad.name)}
                  </span>
                  {editingSquadId === squad.id ? (
                    <input
                      className={styles.renameInput}
                      value={editingSquadName}
                      disabled={renamingSquadId === squad.id}
                      autoFocus
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onChange={(event) => setEditingSquadName(event.target.value)}
                      onBlur={() => commitSquadRename(squad)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelSquadRename();
                        }
                      }}
                    />
                  ) : !collapsed ? (
                    <span className={styles.itemLabel} title={canManageSidebarSquads ? 'Clique duas vezes para renomear' : squad.name}>
                      {squad.name}
                    </span>
                  ) : null}
                  {!collapsed ? (
                    <span className={styles.itemMeta}>
                      {clients.filter((client) => (client.squadId || client.squad_id) === squad.id).length || ''}
                    </span>
                  ) : null}
                </NavLink>
              ))
            ) : (
              <p className={styles.empty}>{normalizedQuery ? 'Nenhum projeto encontrado.' : 'Nenhum squad visível.'}</p>
            )}
          </section>
        ) : null}

        {canViewTeam ? (
          <section className={styles.group}>
            <div className={styles.groupLabel}>
              <span>Admin</span>
            </div>
            {filteredAdmin.map((item) => (
              <Item key={item.to} {...item} onClick={handleNavigate} collapsed={collapsed} />
            ))}
          </section>
        ) : null}
      </nav>

      <div className={styles.footer}>
        <Link to="/perfil" className={styles.profileCard} onClick={handleNavigate} title={collapsed ? user?.name || 'Usuário' : undefined}>
          <span className={styles.avatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(user?.name)}</span>
          {!collapsed ? (
            <span className={styles.profileText}>
              <strong>{user?.name || 'Usuário'}</strong>
              <span>{roleLabel(user?.role)}</span>
            </span>
          ) : null}
        </Link>

        <button type="button" className={styles.logoutButton} onClick={() => logout()} aria-label="Sair">
          <LogOutIcon size={15} />
        </button>
      </div>
    </aside>
  );
}
