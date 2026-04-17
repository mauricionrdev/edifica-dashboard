// ================================================================
//  Topbar
//  Barra superior sticky. A estética principal vem de .tbar no base.css.
//  Mantém slots globais e concentra a área de conta para desafogar a sidebar.
// ================================================================

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

export default function Topbar({ banner = null, actions = null }) {
  const { user, logout } = useAuth();

  return (
    <header className="tbar">
      <div className="tbar-leading" />

      <div className="tbar-center">
        {banner}
      </div>

      <div className="tbar-actions">
        {actions}
        <div className={styles.accountCluster}>
          <div className={styles.accountAvatar} aria-hidden="true">
            {initials(user?.name)}
          </div>
          <div className={styles.accountMeta}>
            <strong title={user?.name || ''}>{user?.name || 'Usuário'}</strong>
            <span>{roleLabel(user?.role)}</span>
          </div>
          <button
            type="button"
            className={styles.logoutButton}
            onClick={() => logout()}
            aria-label="Sair da conta"
            title="Sair"
          >
            <LogOutIcon size={14} />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
