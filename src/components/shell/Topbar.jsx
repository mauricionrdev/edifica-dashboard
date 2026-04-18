// ================================================================
//  Topbar
//  Barra superior sticky. A estética principal vem de .tbar no base.css.
//  Mantém slots globais e concentra a área de conta para desafogar a sidebar.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
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

function avatarUrl(user) {
  return (
    user?.avatarUrl
    || user?.avatar
    || user?.photoUrl
    || user?.picture
    || user?.imageUrl
    || ''
  );
}

export default function Topbar({ banner = null, actions = null }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const menuRef = useRef(null);

  const avatarSrc = useMemo(() => avatarUrl(user), [user]);
  const canShowAvatar = Boolean(avatarSrc) && !avatarFailed;

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
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
      <div className="tbar-leading" />

      <div className="tbar-center">
        {banner}
      </div>

      <div className="tbar-actions">
        {actions}
        <div className={styles.accountCluster} ref={menuRef}>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Abrir menu do perfil"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.accountAvatar} aria-hidden="true">
              {canShowAvatar ? (
                <img
                  src={avatarSrc}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                initials(user?.name)
              )}
            </span>
          </button>
          <div className={styles.accountMeta}>
            <strong title={user?.name || ''}>{user?.name || 'Usuário'}</strong>
            <span>{roleLabel(user?.role)}</span>
          </div>
          {menuOpen && (
            <div className={styles.profileMenu} role="menu">
              <div className={styles.profileMenuHeader}>
                <strong>{user?.name || 'Usuario'}</strong>
                <span>{roleLabel(user?.role)}</span>
              </div>
              <button
                type="button"
                className={styles.logoutButton}
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                aria-label="Sair da conta"
                title="Sair"
                role="menuitem"
              >
                <LogOutIcon size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
