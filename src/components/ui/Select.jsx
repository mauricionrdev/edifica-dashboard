import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from './Icons.jsx';
import Avatar from './Avatar.jsx';
import styles from './Select.module.css';

function optionText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(optionText).join('');
  if (value?.props?.children) return optionText(value.props.children);
  return '';
}

function normalizeOptions(children) {
  return (Array.isArray(children) ? children : [children])
    .flatMap((child) => {
      if (!child) return [];
      if (Array.isArray(child)) return child;
      return [child];
    })
    .filter((child) => child?.props)
    .map((child) => ({
      value: String(child.props.value ?? ''),
      label: child.props.children,
      disabled: Boolean(child.props.disabled),
      avatar: child.props['data-avatar'] ?? null,
      avatarName: child.props['data-name'] ?? optionText(child.props.children),
    }));
}

export default function Select({
  label,
  className = '',
  children,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecionar',
  menuMinWidth = 0,
  type = 'default',
  portal = false,
  'aria-label': ariaLabel,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [menuMeta, setMenuMeta] = useState({ placement: 'down', maxHeight: 260, left: 0, top: 0, width: 0 });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const buttonId = useId();
  const listboxId = useId();

  const options = useMemo(() => normalizeOptions(children), [children]);
  const selected = options.find((option) => option.value === String(value ?? ''));

  useEffect(() => {
    if (!open) return undefined;

    const updatePlacement = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const margin = 12;
      const gap = 6;
      const preferredHeight = Math.min(Math.max(options.length, 1) * 36 + 12, 300);
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - margin - gap);
      const spaceAbove = Math.max(0, rect.top - margin - gap);
      const placement = spaceBelow < Math.min(preferredHeight, 170) && spaceAbove > spaceBelow ? 'up' : 'down';
      const available = placement === 'up' ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(112, Math.min(preferredHeight, available || preferredHeight));
      const width = Math.max(rect.width, menuMinWidth ? Number(menuMinWidth) : 0);
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
      const top = placement === 'up'
        ? Math.max(margin, rect.top - gap - maxHeight)
        : Math.min(rect.bottom + gap, viewportHeight - margin - Math.min(maxHeight, preferredHeight));

      setMenuMeta({
        placement,
        maxHeight,
        left,
        top,
        width,
      });
    };

    updatePlacement();

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleResize = () => updatePlacement();
    const handleScroll = () => updatePlacement();

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, options.length, menuMinWidth]);

  const emitChange = (nextValue) => {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    });
    setOpen(false);
  };

  const menuStyle = portal
    ? {
        position: 'fixed',
        left: menuMeta.left,
        top: menuMeta.top,
        right: 'auto',
        bottom: 'auto',
        width: menuMeta.width || undefined,
        maxHeight: menuMeta.maxHeight,
        minWidth: menuMinWidth ? Number(menuMinWidth) : undefined,
      }
    : {
        maxHeight: menuMeta.maxHeight,
        minWidth: menuMinWidth ? Number(menuMinWidth) : undefined,
      };

  const isIdentity = ['user', 'gdv', 'squad', 'client'].includes(type);
  const shouldShowAvatar = (option) => isIdentity && option && (option.value !== '' || option.avatar);

  const menuNode = open ? (
    <div
      ref={menuRef}
      className={`${styles.menu} ${portal ? styles.menuPortal : ''} ${menuMeta.placement === 'up' ? styles.menuUp : styles.menuDown}`.trim()}
      style={menuStyle}
      role="listbox"
      id={listboxId}
      aria-labelledby={buttonId}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {options.map((option) => {
        const active = option.value === String(value ?? '');
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            className={`${styles.option} ${active ? styles.optionActive : ''}`.trim()}
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => emitChange(option.value)}
            title={typeof option.label === 'string' ? option.label : undefined}
          >
            {shouldShowAvatar(option) ? (
              <Avatar
                src={option.avatar || undefined}
                name={option.avatarName}
                size="xs"
                className={styles.optionAvatar}
              />
            ) : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`${styles.wrap} ${className} ${open ? styles.wrapOpen : ''}`.trim()}
      data-type={type}
      {...props}
    >
      {label ? <span className={styles.label}>{label}</span> : null}

      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        className={`${styles.select} ${open ? styles.selectOpen : ''}`.trim()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
      >
        {shouldShowAvatar(selected) ? (
          <Avatar
            src={selected.avatar || undefined}
            name={selected.avatarName}
            size="xs"
            className={styles.optionAvatar}
          />
        ) : null}
        <span className={styles.value}>{selected?.label || placeholder}</span>
        <ChevronDownIcon size={15} className={styles.chevron} />
      </button>

      {portal && menuNode && typeof document !== 'undefined' ? createPortal(menuNode, document.body) : menuNode}
    </div>
  );
}
