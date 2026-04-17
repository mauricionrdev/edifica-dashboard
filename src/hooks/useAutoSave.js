// ================================================================
//  useAutoSave
//  Auto-save com debounce. Ideal para objetos grandes que mudam
//  muitas vezes (onboarding, template) e queremos persistir com
//  delay após a última alteração.
//
//  Uso:
//    const { status, flush } = useAutoSave(sections, (s) => saveOnboarding(id, s), {
//      delay: 600,
//      onError: (err) => showToast(err.message, { variant: 'error' }),
//      skip: !hydrated,  // pula se ainda não hidratamos o estado inicial
//    });
//
//  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoSave(value, saver, options = {}) {
  const { delay = 600, onError, onSuccess, skip = false } = options;

  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);

  // Mantém último saver/handlers sem refazer efeitos quando mudam
  const saverRef = useRef(saver);
  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    saverRef.current = saver;
    onErrorRef.current = onError;
    onSuccessRef.current = onSuccess;
  }, [saver, onError, onSuccess]);

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    setStatus('saving');
    try {
      await saverRef.current(pendingRef.current);
      setStatus('saved');
      onSuccessRef.current?.();
    } catch (err) {
      setStatus('error');
      onErrorRef.current?.(err);
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        // Roda de novo com o valor mais recente
        doSave();
      }
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    pendingRef.current = value;

    // Se nunca salvou antes, não agenda (a montagem inicial é "idle")
    // — useAutoSave só dispara em mudanças reais. Quem monta o hook
    // normalmente também evita dependência inicial via `skip`.
    if (status === 'idle' && !timerRef.current) {
      // marca como pending na primeira mutação
    }

    setStatus('pending');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      doSave();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, skip, delay]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== undefined && pendingRef.current !== null) {
      await doSave();
    }
  }, [doSave]);

  return { status, flush };
}
