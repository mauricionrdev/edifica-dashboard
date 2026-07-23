import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import RequirePermissionRoute from '../routes/RequirePermissionRoute.jsx';
import { hasPermission } from '../utils/permissions.js';
import NewDashboardPage from './pages/NewDashboardPage.jsx';
import './styles/foundation.css';
import styles from './NewFrontend.module.css';

const NAV_GROUPS = [
  {
    label: 'Visão geral',
    items: [
      { label: 'Dashboard', to: '/new/dashboard', icon: LayoutDashboard, permission: 'central.view', current: true },
    ],
  },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ED';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function NewFrontend() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)');
    const sync = (event) => {
      if (!event.matches) setMobileOpen(false);
    };
    sync(media);
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  const visibleGroups = useMemo(
    () => NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(user, item.permission)),
    })).filter((group) => group.items.length > 0),
    [user]
  );

  const userAvatar = user?.avatarUrl || user?.avatar_url || '';
  const shellClassName = [
    styles.shell,
    collapsed ? styles.shellCollapsed : '',
    mobileOpen ? styles.shellMobileOpen : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClassName} data-edifica-new data-theme="dark">
      <button
        type="button"
        className={`${styles.mobileOverlay} ${mobileOpen ? styles.mobileOverlayVisible : ''}`.trim()}
        aria-label="Fechar navegação"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={styles.sidebar} aria-label="Navegação principal">
        <div className={styles.brandRow}>
          <Link to="/new/dashboard" className={styles.brand} aria-label="Edifica Central">
            <img
              className={styles.brandExpanded}
              src="/brand/logotipo.svg"
              alt="Edifica"
            />
            <img
              className={styles.brandCompact}
              src="/favicon.png"
              alt=""
              aria-hidden="true"
            />
          </Link>
          <button
            type="button"
            className={styles.mobileClose}
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className={styles.navigation}>
          {visibleGroups.map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <span className={styles.navGroupLabel}>{group.label}</span>
              <div className={styles.navList}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  if (item.current) {
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`.trim()}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  }
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={styles.navItem}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.profile} title={collapsed ? user?.name : undefined}>
            <span className={styles.profileMark} data-color={user?.avatarColor || 'amber'}>
              {userAvatar ? <img src={userAvatar} alt="" /> : initials(user?.name)}
            </span>
            <span className={styles.profileText}>
              <strong>{user?.name || 'Usuário'}</strong>
              <small>{user?.email || ''}</small>
            </span>
          </div>
          <button
            type="button"
            className={styles.logoutButton}
            aria-label="Sair"
            title="Sair"
            onClick={logout}
          >
            <LogOut size={17} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarStart}>
            <button
              type="button"
              className={styles.mobileMenu}
              aria-label="Abrir navegação"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} />
            </button>
            <button
              type="button"
              className={styles.collapseButton}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
              onClick={() => setCollapsed((current) => !current)}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <span className={styles.topbarTitle}>Dashboard</span>
          </div>

          <div className={styles.topbarEnd}>
            <Link to="/" className={styles.currentVersionLink}>
              Versão atual
            </Link>
            <div className={styles.topbarProfile} aria-label="Usuário atual">
              <span className={styles.topbarProfileMark}>
                {userAvatar ? <img src={userAvatar} alt="" /> : initials(user?.name)}
              </span>
              <span>{String(user?.name || 'Usuário').split(' ')[0]}</span>
            </div>
          </div>
        </header>

        <main className={styles.viewport}>
          <Routes>
            <Route index element={<Navigate to="/new/dashboard" replace />} />
            <Route
              path="dashboard"
              element={(
                <RequirePermissionRoute permission="central.view">
                  <NewDashboardPage />
                </RequirePermissionRoute>
              )}
            />
            <Route path="*" element={<Navigate to="/new/dashboard" replace />} />
          </Routes>
        </main>
      </section>
    </div>
  );
}
