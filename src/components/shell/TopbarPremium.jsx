import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleLabel } from '../../utils/roles.js';
import { LogOutIcon } from '../ui/Icons.jsx';
import styles from './Topbar.module.css';

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function breadcrumbFor(pathname) {
  if (pathname === '/') return ['Home', 'Dashboard'];
  if (pathname.startsWith('/clientes')) return ['Home', 'Clientes'];
  if (pathname.startsWith('/preencher-semana')) return ['Home', 'Preencher Semana'];
  if (pathname.startsWith('/gdv')) return ['Home', 'Analises'];
  if (pathname.startsWith('/squads')) return ['Home', 'Squads'];
  if (pathname.startsWith('/equipe')) return ['Home', 'Equipe & Acessos'];
  if (pathname.startsWith('/modelo-oficial')) return ['Home', 'Modelo Oficial'];
  return ['Home'];
}

export default function TopbarPremium({ banner = null, actions = null }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  const crumbs = useMemo(
    () => breadcrumbFor(location.pathname),
    [location.pathname]
  );

  useEffect(() => {
    function handlePointerDown(event) {
      if (
        accountMenuRef.current
        && !accountMenuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="tbar">
      <div className="tbar-leading">
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            return (
              <span key={`${crumb}-${index}`} className={styles.crumbWrap}>
                {index > 0 && <span className={styles.crumbSep}>/</span>}
                <span
                  className={current ? styles.crumbCurrent : styles.crumb}
                  aria-current={current ? 'page' : undefined}
                >
                  {crumb}
                </span>
              </span>
            );
          })}
        </nav>
      </div>

      <div className="tbar-center">
        {banner}
      </div>

      <div className="tbar-actions">
        {actions}
        <div className={styles.accountMenu} ref={accountMenuRef}>
          <button
            type="button"
            className={styles.accountCluster}
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className={styles.accountAvatar} aria-hidden="true">
              {initials(user?.name)}
            </div>
            <div className={styles.accountMeta}>
              <strong title={user?.name || ''}>{user?.name || 'Usuario'}</strong>
              <span>{roleLabel(user?.role)}</span>
            </div>
          </button>

          {menuOpen && (
            <div className={styles.dropdown} role="menu">
              <div className={styles.dropdownHeader}>
                <strong>{user?.name || 'Usuario'}</strong>
                <span>{roleLabel(user?.role)}</span>
              </div>
              <button
                type="button"
                className={styles.dropdownItem}
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                role="menuitem"
              >
                <LogOutIcon size={15} />
                <span>Sair da conta</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
