import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

function profilePath(userId = '') {
  return userId ? `/perfil/${encodeURIComponent(userId)}` : '/perfil';
}

function safeRect(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null;

  const rect = element.getBoundingClientRect();

  if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
    return null;
  }

  return rect;
}

function getCardPosition(anchor, placement = 'bottom') {
  if (typeof window === 'undefined') return { top: 16, left: 16 };

  const rect = safeRect(anchor);

  if (!rect) {
    return {
      top: Math.max(16, Math.round(window.innerHeight / 2 - 95)),
      left: Math.max(16, Math.round(window.innerWidth / 2 - 180)),
    };
  }

  const cardWidth = 360;
  const cardHeight = 190;
  const gap = 10;
  const margin = 12;

  let top = placement === 'top'
    ? rect.top - cardHeight - gap
    : placement === 'right' || placement === 'left'
      ? rect.top
      : rect.bottom + gap;

  let left = placement === 'right'
    ? rect.right + gap
    : placement === 'left'
      ? rect.left - cardWidth - gap
      : rect.left;

  if (top + cardHeight > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - cardHeight - margin);
  if (top < margin) top = margin;
  if (left + cardWidth > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - cardWidth - margin);
  if (left < margin) left = margin;

  return {
    top: Math.round(top),
    left: Math.round(left),
  };
}

export default function UserHoverCard({
  user: rawUser,
  children,
  className = '',
  cardClassName = '',
  placement = 'bottom',
}) {
  const { user: currentUser } = useAuth();
  const id = useId();
  const anchorRef = useRef(null);
  const activeAnchorRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 16, left: 16 });

  const user = rawUser || {};
  const userId = user.id || user.userId || '';
  const name = user.name || user.userName || 'Sem usuário';
  const email = user.email || user.userEmail || user.username || '';
  const avatarUrl = getUserAvatar(user) || user.avatarUrl || '';
  const isOwnProfile = currentUser?.id && userId && currentUser.id === userId;

  function resolveAnchor(event) {
    const currentTarget = event?.currentTarget || null;
    const anchor = safeRect(currentTarget) ? currentTarget : anchorRef.current;
    activeAnchorRef.current = anchor;
    return anchor;
  }

  function show(event) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const anchor = resolveAnchor(event);
    setPosition(getCardPosition(anchor, placement));
    setOpen(true);
  }

  function scheduleClose() {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  function keepOpen() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }

  useEffect(() => {
    if (!open) return undefined;

    const update = () => setPosition(getCardPosition(activeAnchorRef.current || anchorRef.current, placement));

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, placement]);

  const card = open ? (
    <span
      id={id}
      className={`${styles.card} ${cardClassName}`.trim()}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      role="tooltip"
      onMouseEnter={keepOpen}
      onMouseLeave={scheduleClose}
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
          <Link to={profilePath(userId)} className={styles.action}>
            Ver perfil
          </Link>
        ) : null}
      </span>
    </span>
  ) : null;

  return (
    <span
      ref={anchorRef}
      className={`${styles.wrap} ${className}`.trim()}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={scheduleClose}
    >
      {children}
      {typeof document !== 'undefined' ? createPortal(card, document.body) : null}
    </span>
  );
}
