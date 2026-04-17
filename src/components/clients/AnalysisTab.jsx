// ================================================================
//  AnalysisTab (ICP / GDV)
//  Props:
//    clientId, type: 'icp' | 'gdvanalise'
//
//  Fluxo:
//    - Carrega lista (GET /clients/:id/analyses/:type), ordenada DESC
//      por entry_date.
//    - "Nova análise" cria com data = hoje, texto vazio, e foca a
//      textarea recém-criada.
//    - Edição do text → PUT debounced (500ms).
//    - Edição de data → PUT imediato.
//    - Remover → DELETE com confirmação via toast (direto — aba já
//      tem botão explícito "✕ Remover").
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAnalysis,
  deleteAnalysis,
  listAnalyses,
  updateAnalysis,
} from '../../api/analyses.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import tabStyles from './ClientTabs.module.css';
import styles from './AnalysisTab.module.css';

const DEBOUNCE_MS = 500;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AnalysisTab({ clientId, type }) {
  const { showToast } = useToast();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [savingIds, setSavingIds] = useState(new Set());

  const timersRef = useRef(new Map()); // entryId -> timeout
  const fetchIdRef = useRef(0);

  const title = type === 'icp' ? 'Análise ICP' : 'Análise GDV';
  const titleClass = type === 'icp' ? styles.icp : styles.gdv;
  const accentBg = type === 'icp' ? '#60a5fa' : '#2dd4bf';
  const accentFg = type === 'icp' ? '#fff' : '#111';

  // --- fetch ---
  useEffect(() => {
    if (!clientId) return;
    const my = ++fetchIdRef.current;
    setLoading(true);
    listAnalyses(clientId, type)
      .then((res) => {
        if (fetchIdRef.current !== my) return;
        setEntries(Array.isArray(res?.analyses) ? res.analyses : []);
      })
      .catch((err) => {
        if (fetchIdRef.current !== my) return;
        const msg =
          err instanceof ApiError ? err.message : 'Erro ao carregar análises.';
        showToast(msg, { variant: 'error' });
      })
      .finally(() => {
        if (fetchIdRef.current === my) setLoading(false);
      });

    // cleanup timers ao trocar clientId/type
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, [clientId, type, showToast]);

  // --- ações ---

  const markPending = (id, flag) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (flag) next.add(id);
      else next.delete(id);
      return next;
    });

  const markSaving = (id, flag) =>
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (flag) next.add(id);
      else next.delete(id);
      return next;
    });

  async function handleCreate() {
    if (creating || !clientId) return;
    setCreating(true);
    try {
      const res = await createAnalysis(clientId, type, {
        date: todayISO(),
        text: '',
      });
      const entry = res?.analysis;
      if (entry) {
        setEntries((prev) => [entry, ...prev]);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Erro ao criar análise.';
      showToast(msg, { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  async function commitPatch(id, patch) {
    markSaving(id, true);
    markPending(id, false);
    try {
      const res = await updateAnalysis(clientId, type, id, patch);
      const fresh = res?.analysis;
      if (fresh) {
        setEntries((prev) => prev.map((e) => (e.id === id ? fresh : e)));
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Erro ao salvar análise.';
      showToast(msg, { variant: 'error' });
    } finally {
      markSaving(id, false);
    }
  }

  function scheduleCommit(id, patch) {
    markPending(id, true);
    const timers = timersRef.current;
    if (timers.has(id)) clearTimeout(timers.get(id));
    const t = setTimeout(() => {
      timers.delete(id);
      commitPatch(id, patch);
    }, DEBOUNCE_MS);
    timers.set(id, t);
  }

  function onTextChange(id, value) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, text: value } : e)));
    scheduleCommit(id, { text: value });
  }

  function onDateChange(id, value) {
    // Commit imediato (data é campo estruturado)
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, date: value } : e)));
    commitPatch(id, { date: value });
  }

  async function handleDelete(id) {
    // Confirmação inline via window.confirm — simples, nativo do navegador
    const ok = window.confirm(
      'Remover esta análise? Esta ação não pode ser desfeita.'
    );
    if (!ok) return;

    // optimistic remove
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== id));
    try {
      await deleteAnalysis(clientId, type, id);
      showToast('Análise removida.');
    } catch (err) {
      setEntries(prev); // rollback
      const msg =
        err instanceof ApiError ? err.message : 'Erro ao remover análise.';
      showToast(msg, { variant: 'error' });
    }
  }

  // --- render ---

  if (loading) {
    return <div className={styles.loading}>Carregando análises…</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h3 className={`${styles.title} ${titleClass}`}>{title}</h3>
          <div className={styles.sub}>
            Registro de análises com data — mais recentes primeiro
          </div>
        </div>
        <button
          type="button"
          className={styles.addBtn}
          style={{ background: accentBg, color: accentFg }}
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? 'Criando…' : '+ Nova análise'}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>
          Nenhuma análise registrada ainda.
          <br />
          Clique em <b>+ Nova análise</b> para adicionar a primeira entrada.
        </div>
      ) : (
        entries.map((entry) => {
          const isPending = pendingIds.has(entry.id);
          const isSaving = savingIds.has(entry.id);
          return (
            <div key={entry.id} className={styles.entry}>
              <div className={styles.entryHdr}>
                <span className={styles.dateLabel}>Data</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  style={{ color: accentBg }}
                  value={entry.date || ''}
                  onChange={(e) => onDateChange(entry.id, e.target.value)}
                />
                <button
                  type="button"
                  className={styles.delBtn}
                  onClick={() => handleDelete(entry.id)}
                >
                  ✕ Remover
                </button>
              </div>
              <textarea
                className={styles.textarea}
                value={entry.text || ''}
                placeholder="Descreva a análise, observações, resultados…"
                onChange={(e) => onTextChange(entry.id, e.target.value)}
              />
              {(isPending || isSaving) && (
                <div
                  className={`${styles.savingHint} ${
                    isPending && !isSaving ? styles.pending : ''
                  }`.trim()}
                >
                  {isSaving ? 'Salvando…' : 'Alterações pendentes…'}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
