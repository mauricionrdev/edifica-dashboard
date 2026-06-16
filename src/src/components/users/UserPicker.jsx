import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getUserAvatar } from '../../utils/avatarStorage.js';
import UserHoverCard from './UserHoverCard.jsx';
import styles from './UserPicker.module.css';

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

export default function UserPicker({
  users = [],
  value = '',
  disabled = false,
  onChange,
  placeholder = 'Sem responsável',
  searchPlaceholder = 'Buscar usuário...',
  className = '',
  showRole = false,
  variant = 'default',
  hideEmptyAvatar = false,
  disableHover = false,
  portal = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const closeTimer = useRef(null);
  const triggerRef = useRef(null);
  const [portalStyle, setPortalStyle] = useState(null);
  const safeUsers = Array.isArray(users) ? users.filter((entry) => entry?.id && entry?.active !== false) : [];

  const selected = useMemo(
    () => safeUsers.find((entry) => entry.id === value) || null,
    [safeUsers, value]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return safeUsers;

    return safeUsers.filter((entry) => {
      const name = String(entry.name || '').toLowerCase();
      const email = String(entry.email || entry.username || '').toLowerCase();
      const role = String(entry.role || '').toLowerCase();
      return name.includes(term) || email.includes(term) || role.includes(term);
    });
  }, [safeUsers, search]);

  const selectedAvatar = getUserAvatar(selected) || selected?.avatarUrl || '';

  function scheduleClose() {
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setSearch('');
    }, 120);
  }

  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function choose(userId) {
    onChange?.(userId);
    setOpen(false);
    setSearch('');
  }

  useEffect(() => {
    if (!open || !portal || !triggerRef.current) return undefined;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, Math.max(rect.width, 260), window.innerWidth - 32);
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
      const estimatedHeight = 312;
      const opensUp = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
      const top = opensUp
        ? Math.max(16, rect.top - estimatedHeight - 6)
        : Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - 16);
      setPortalStyle({ left, top: Math.max(16, top), width });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, portal, value, search]);

  const selectedContent = selected ? (
    <>
      <span className={styles.avatar}>
        {selectedAvatar ? <img src={selectedAvatar} alt="" /> : initials(selected.name)}
      </span>
      <span className={styles.triggerText}>{selected.name}</span>
    </>
  ) : null;

  const popover = open ? (
    <span
      className={`${styles.popover} ${portal ? styles.popoverPortal : ''}`.trim()}
      role="dialog"
      aria-label="Selecionar usuário"
      style={portal ? portalStyle || undefined : undefined}
      onMouseDown={cancelClose}
      onFocus={cancelClose}
    >
      <span className={styles.searchWrap}>
        <input
          value={search}
          autoFocus
          placeholder={searchPlaceholder}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              setSearch('');
            }
          }}
        />
      </span>

      <span className={styles.list}>
        <button
          type="button"
          className={`${styles.option} ${!value ? styles.optionActive : ''}`.trim()}
          onClick={() => choose('')}
        >
          <span className={styles.avatar}>NA</span>
          <span className={styles.optionMain}>
            <strong>{placeholder}</strong>
            <small>Deixar sem usuário definido</small>
          </span>
        </button>

        {filtered.map((entry) => {
          const avatar = getUserAvatar(entry) || entry.avatarUrl || '';
          return (
            <button
              key={entry.id}
              type="button"
              className={`${styles.option} ${entry.id === value ? styles.optionActive : ''}`.trim()}
              onClick={() => choose(entry.id)}
            >
              <span className={styles.avatar}>
                {avatar ? <img src={avatar} alt="" /> : initials(entry.name)}
              </span>
              <span className={styles.optionMain}>
                <strong>{entry.name}</strong>
                <small>{entry.email || entry.username || (showRole ? entry.role || '' : '')}</small>
              </span>
            </button>
          );
        })}
      </span>
    </span>
  ) : null;

  return (
    <span
      className={`${styles.root} ${className}`.trim()}
      data-variant={variant}
      data-open={open ? 'true' : 'false'}
      onBlur={scheduleClose}
      onFocus={cancelClose}
      onMouseDown={cancelClose}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {selected ? (
          disableHover ? (
            <span className={styles.selectedUser}>{selectedContent}</span>
          ) : (
            <UserHoverCard user={selected} placement="bottom" className={styles.selectedUser}>
              {selectedContent}
            </UserHoverCard>
          )
        ) : hideEmptyAvatar ? (
          <span className={styles.triggerText}>{placeholder}</span>
        ) : (
          <>
            <span className={styles.avatar}>NA</span>
            <span className={styles.triggerText}>{placeholder}</span>
          </>
        )}
      </button>

      {portal && open && typeof document !== 'undefined' ? createPortal(popover, document.body) : popover}
    </span>
  );
}
