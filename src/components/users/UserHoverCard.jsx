import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { getUserAvatar } from '../../utils/avatarStorage.js';
import styles from './UserHoverCard.module.css';

function initials(value = '') {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'NA';

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function localTimeLabel() {
  return `${new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())} horário local`;
}

function userProfilePath(userId = '') {
  return userId ? `/perfil/${encodeURIComponent(userId)}` : '/perfil';
}

export default function UserHoverCard({
  user: userEntry,
  children,
  className = '',
  cardClassName = '',
  placement = 'bottom',
}) {
  const { user: currentUser } = useAuth();
  const user = userEntry || {};
  const name = user.name || user.userName || 'Sem usuário';
  const email = user.email || user.userEmail || '';
  const avatarUrl = getUserAvatar(user) || user.avatarUrl || '';
  const userId = user.id || user.userId || '';
  const isOwnProfile = currentUser?.id && userId && currentUser.id === userId;

  return (
    <span className={`${styles.wrap} ${className}`.trim()}>
      {children}
      <span
        className={`${styles.card} ${styles[`placement_${placement}`] || styles.placement_bottom} ${cardClassName}`.trim()}
        role="tooltip"
      >
        <span className={styles.header}>
          <span className={styles.avatar}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}
          </span>
          <span className={styles.identity}>
            <strong>{name}</strong>
            {email ? <small>{email}</small> : null}
            <small>{localTimeLabel()}</small>
          </span>
        </span>

        <span className={styles.actions}>
          {isOwnProfile ? (
            <Link to="/perfil" className={styles.action}>
              Editar perfil
            </Link>
          ) : null}
          {userId ? (
            <Link to={userProfilePath(userId)} className={styles.action}>
              Ver perfil
            </Link>
          ) : null}
        </span>
      </span>
    </span>
  );
}
