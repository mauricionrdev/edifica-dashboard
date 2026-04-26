import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons.jsx';
import styles from './DateField.module.css';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toISO(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISO(value) {
  if (!value) return null;
  const clean = String(value).slice(0, 10);
  const [year, month, day] = clean.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatBR(value) {
  const date = parseISO(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function computePosition(anchor) {
  if (!anchor || typeof window === 'undefined') return { top: 0, left: 0 };
  const rect = anchor.getBoundingClientRect();
  const width = 252;
  const gap = 6;
  const margin = 10;

  let left = rect.left;
  let top = rect.bottom + gap;

  if (left + width + margin > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - width - margin);
  }

  if (top + 324 > window.innerHeight && rect.top > 324) {
    top = Math.max(margin, rect.top - 324 - gap);
  }

  return {
    top: Math.round(top),
    left: Math.round(Math.max(margin, left)),
  };
}

export default function DateField({
  id,
  value = '',
  onChange,
  disabled = false,
  placeholder = 'dd/mm/aaaa',
  ariaLabel,
  className = '',
}) {
  const selectedDate = useMemo(() => parseISO(value), [value]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selectedDate || today);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (selectedDate) setCursor(selectedDate);
  }, [selectedDate]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      setPosition(computePosition(rootRef.current));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const days = useMemo(() => monthMatrix(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const label = `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`;
  const display = formatBR(value);

  function changeMonth(delta) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function commit(date) {
    onChange?.(toISO(date));
    setOpen(false);
  }

  function clearValue() {
    onChange?.('');
    setOpen(false);
  }

  const popover = open ? (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-label="Selecionar data"
    >
      <div className={styles.popoverHeader}>
        <strong>{label}</strong>
        <div className={styles.monthActions}>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
            <ChevronLeftIcon size={15} />
          </button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês">
            <ChevronRightIcon size={15} />
          </button>
        </div>
      </div>

      <div className={styles.weekdays}>
        {WEEKDAYS.map((weekday, index) => (
          <span key={`${weekday}-${index}`}>{weekday}</span>
        ))}
      </div>

      <div className={styles.days}>
        {days.map((day) => {
          const iso = toISO(day);
          const isOutside = day.getMonth() !== cursor.getMonth();
          const isSelected = value === iso;
          const isToday = toISO(today) === iso;

          return (
            <button
              key={iso}
              type="button"
              className={[
                styles.day,
                isOutside ? styles.dayOutside : '',
                isSelected ? styles.daySelected : '',
                isToday ? styles.dayToday : '',
              ].filter(Boolean).join(' ')}
              onClick={() => commit(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" onClick={clearValue}>Limpar</button>
        <button type="button" onClick={() => commit(today)}>Hoje</button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`${styles.root} ${className}`.trim()}>
      <button
        id={id}
        type="button"
        className={styles.trigger}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={display ? styles.value : styles.placeholder}>
          {display || placeholder}
        </span>
        <CalendarIcon size={14} />
      </button>

      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
