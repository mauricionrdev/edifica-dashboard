import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from './Icons.jsx';
import styles from './Select.module.css';

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
  'aria-label': ariaLabel,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const buttonId = useId();
  const listboxId = useId();
  const [menuStyle, setMenuStyle] = useState(null);

  const options = useMemo(() => normalizeOptions(children), [children]);
  const selected = options.find((option) => option.value === String(value ?? ''));

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportHeight = window.innerHeight;
      const estimatedHeight = Math.min(Math.max(options.length, 1) * 39 + 12, 280);
      const spaceBelow = viewportHeight - rect.bottom - 12;
      const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

      const minWidth = Number(menuMinWidth) || 0;
      const menuWidth = Math.max(Math.round(rect.width), minWidth);

      setMenuStyle({
        left: Math.round(rect.left),
        width: menuWidth,
        top: openUp ? 'auto' : Math.round(rect.bottom + 6),
        bottom: openUp ? Math.max(8, Math.round(viewportHeight - rect.top + 6)) : 'auto',
        maxHeight: Math.min(estimatedHeight, viewportHeight - 16),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length, menuMinWidth]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      const clickedTrigger = rootRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const emitChange = (nextValue) => {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`${styles.wrap} ${className}`.trim()} {...props}>
      {label ? <span className={styles.label}>{label}</span> : null}

      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        className={`${styles.select} ${open ? styles.selectOpen : ''}`.trim()}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
      >
        <span className={styles.value}>{selected?.label || placeholder}</span>
        <ChevronDownIcon size={15} className={styles.chevron} />
      </button>

      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.menu}
              style={menuStyle}
              role="listbox"
              id={listboxId}
              aria-labelledby={buttonId}
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
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
