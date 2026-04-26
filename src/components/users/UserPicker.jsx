import { useMemo, useRef, useState } from 'react';
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
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const closeTimer = useRef(null);
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
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {selected ? (
          <UserHoverCard user={selected} placement="bottom" className={styles.selectedUser}>
            <span className={styles.avatar}>
              {selectedAvatar ? <img src={selectedAvatar} alt="" /> : initials(selected.name)}
            </span>
            <span className={styles.triggerText}>{selected.name}</span>
          </UserHoverCard>
        ) : (
          <>
            <span className={styles.avatar}>NA</span>
            <span className={styles.triggerText}>{placeholder}</span>
          </>
        )}
      </button>

      {open ? (
        <span className={styles.popover} role="dialog" aria-label="Selecionar usuário">
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
      ) : null}
    </span>
  );
}
