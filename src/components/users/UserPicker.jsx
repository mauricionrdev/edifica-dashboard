import { useMemo, useRef, useState } from 'react';
import { getUserAvatar } from '../../utils/avatarStorage.js';
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
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const closeTimer = useRef(null);

  const selected = useMemo(
    () => users.find((entry) => entry.id === value) || null,
    [users, value]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return users;

    return users.filter((entry) => {
      const name = String(entry.name || '').toLowerCase();
      const email = String(entry.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [users, search]);

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
        <span className={styles.avatar}>
          {selected ? (
            selectedAvatar ? <img src={selectedAvatar} alt="" /> : initials(selected.name)
          ) : (
            'NA'
          )}
        </span>
        <span className={styles.triggerText}>{selected?.name || placeholder}</span>
      </button>

      {open ? (
        <span className={styles.popover} role="dialog" aria-label="Selecionar responsável">
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
                <strong>Sem responsável</strong>
                <small>Remover responsável da tarefa</small>
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
                    {entry.email ? <small>{entry.email}</small> : null}
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
