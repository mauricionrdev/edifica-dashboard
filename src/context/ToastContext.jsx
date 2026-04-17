// ================================================================
//  ToastProvider
//  Sistema mínimo de mensagens toast. Fila com autodismiss (3.5s),
//  posicionado no canto inferior direito da viewport. Renderiza
//  via portal no <body>.
//
//  Uso:
//    const { showToast } = useToast();
//    showToast('Cliente criado');              // success (default)
//    showToast('Erro de rede', { variant: 'error' });
// ================================================================

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
    (message, { variant = 'success', duration = 3500 } = {}) => {
      const id = ++idSeq;
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  // Limpa timers ao desmontar
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
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                onClick={() => dismiss(t.id)}
                style={{
                  pointerEvents: 'auto',
                  padding: '10px 14px',
                  minWidth: 240,
                  maxWidth: 360,
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    t.variant === 'error'
                      ? '#fecaca'
                      : t.variant === 'warn'
                      ? '#fde68a'
                      : '#d1fae5',
                  background:
                    t.variant === 'error'
                      ? 'rgba(239,68,68,.14)'
                      : t.variant === 'warn'
                      ? 'rgba(245,195,0,.14)'
                      : 'rgba(34,197,94,.14)',
                  border:
                    t.variant === 'error'
                      ? '1px solid rgba(239,68,68,.28)'
                      : t.variant === 'warn'
                      ? '1px solid rgba(245,195,0,.28)'
                      : '1px solid rgba(34,197,94,.28)',
                  boxShadow: '0 12px 32px rgba(0,0,0,.4)',
                  cursor: 'pointer',
                  backdropFilter: 'blur(6px)',
                  animation: 'edifica-toast-in .18s ease-out',
                }}
              >
                {t.message}
              </div>
            ))}
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
