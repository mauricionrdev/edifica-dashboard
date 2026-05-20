import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  const [menuMeta, setMenuMeta] = useState({ placement: 'down', maxHeight: 260 });
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
      const margin = 12;
      const gap = 6;
      const preferredHeight = Math.min(Math.max(options.length, 1) * 36 + 12, 300);
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - margin - gap);
      const spaceAbove = Math.max(0, rect.top - margin - gap);
      const placement = spaceBelow < Math.min(preferredHeight, 170) && spaceAbove > spaceBelow ? 'up' : 'down';
      const available = placement === 'up' ? spaceAbove : spaceBelow;

      setMenuMeta({
        placement,
        maxHeight: Math.max(112, Math.min(preferredHeight, available || preferredHeight)),
      });
    };

    updatePlacement();

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleResize = () => updatePlacement();

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, options.length]);

  const emitChange = (nextValue) => {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    });
    setOpen(false);
  };

  const menuStyle = {
    maxHeight: menuMeta.maxHeight,
    minWidth: menuMinWidth ? Number(menuMinWidth) : undefined,
  };

  return (
    <div ref={rootRef} className={`${styles.wrap} ${className} ${open ? styles.wrapOpen : ''}`.trim()} {...props}>
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
        <span className={styles.value}>{selected?.label || placeholder}</span>
        <ChevronDownIcon size={15} className={styles.chevron} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className={`${styles.menu} ${menuMeta.placement === 'up' ? styles.menuUp : styles.menuDown}`.trim()}
          style={menuStyle}
          role="listbox"
          id={listboxId}
          aria-labelledby={buttonId}
          onPointerDown={(event) => event.stopPropagation()}
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
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
