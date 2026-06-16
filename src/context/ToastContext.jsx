import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

let idSeq = 0;

function normalizeOptions(opts) {
  if (typeof opts === 'string') return { variant: opts };
  return opts || {};
}

function paletteFor(variant) {
  if (variant === 'error') {
    return {
      color: '#fecaca',
      background: '#2a1518',
      border: '1px solid rgba(239,68,68,.28)',
      accent: '#f87171',
      label: 'Erro',
    };
  }
  if (variant === 'warn' || variant === 'warning' || variant === 'info') {
    return {
      color: '#fde68a',
      background: '#2d2715',
      border: '1px solid rgba(245,195,0,.28)',
      accent: '#f5c300',
      label: variant === 'info' ? 'Aviso' : 'Atenção',
    };
  }
  return {
    color: '#d1fae5',
    background: '#14261d',
    border: '1px solid rgba(34,197,94,.26)',
    accent: '#22c55e',
    label: 'Sucesso',
  };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message, options = {}) => {
      const { variant = 'success', duration = 3500, title } = normalizeOptions(options);
      const id = ++idSeq;
      setToasts((prev) => [...prev, { id, message, variant, title }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: 'fixed',
              right: 20,
              bottom: 20,
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              pointerEvents: 'none',
            }}
          >
            {toasts.map((t) => {
              const palette = paletteFor(t.variant);
              return (
                <div
                  key={t.id}
                  role="status"
                  onClick={() => dismiss(t.id)}
                  style={{
                    pointerEvents: 'auto',
                    padding: '12px 14px 12px 12px',
                    minWidth: 250,
                    maxWidth: 380,
                    borderRadius: 16,
                    color: palette.color,
                    background: palette.background,
                    border: palette.border,
                    boxShadow: '0 18px 38px rgba(0,0,0,.38)',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                    animation: 'edifica-toast-in .18s ease-out',
                    display: 'grid',
                    gridTemplateColumns: '10px 1fr',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: palette.accent,
                      marginTop: 5,
                      boxShadow: `0 0 0 4px ${palette.accent}22`,
                    }}
                  />
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 12, letterSpacing: '.02em' }}>
                        {t.title || palette.label}
                      </strong>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{t.message}</div>
                  </div>
                </div>
              );
            })}
            <style>{`
              @keyframes edifica-toast-in {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
