import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

function nextEnabledIndex(options, start, direction) {
  if (!options.length) return -1;
  let index = start;
  for (let count = 0; count < options.length; count += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export default function Select({
  value,
  options = [],
  onChange,
  ariaLabel,
  disabled = false,
  className = '',
}) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selectedIndex = useMemo(
    () => options.findIndex((option) => String(option.value) === String(value)),
    [options, value]
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const selectedOption = options[selectedIndex] || options.find((option) => !option.disabled) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= 0) setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  function choose(option) {
    if (!option || option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const start = open ? activeIndex : selectedIndex;
      const next = nextEnabledIndex(options, start < 0 ? 0 : start, direction);
      if (next >= 0) setActiveIndex(next);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(options[activeIndex]);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.triggerLabel}>{selectedOption?.label || 'Selecionar'}</span>
        <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {open ? (
        <div className={styles.menu}>
          <div id={listId} role="listbox" aria-label={ariaLabel} className={styles.list}>
            {options.map((option, index) => {
              const selected = String(option.value) === String(value);
              const active = activeIndex === index;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={`${styles.option} ${active ? styles.optionActive : ''}`.trim()}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  <span className={`${styles.check} ${selected ? styles.checkSelected : ''}`.trim()}>
                    {selected ? <Check size={11} strokeWidth={2.4} aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
