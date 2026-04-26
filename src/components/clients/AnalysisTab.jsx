import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAnalysis,
  deleteAnalysis,
  listAnalyses,
  updateAnalysis,
} from '../../api/analyses.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import StateBlock from '../ui/StateBlock.jsx';
import styles from './AnalysisTab.module.css';

const DEBOUNCE_MS = 500;

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AnalysisTab({ clientId, type, canEdit = false }) {
  const { showToast } = useToast();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [savingIds, setSavingIds] = useState(new Set());

  const timersRef = useRef(new Map());
  const fetchIdRef = useRef(0);

  const title = type === 'icp' ? 'Análise ICP' : 'Análise GDV';
  const titleClass = type === 'icp' ? styles.icp : styles.gdv;

  useEffect(() => {
    if (!clientId) return;
    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    listAnalyses(clientId, type)
      .then((response) => {
        if (fetchIdRef.current !== fetchId) return;
        setEntries(Array.isArray(response?.analyses) ? response.analyses : []);
      })
      .catch((error) => {
        if (fetchIdRef.current !== fetchId) return;
        const message =
          error instanceof ApiError ? error.message : 'Erro ao carregar análises.';
        showToast(message, { variant: 'error' });
      })
      .finally(() => {
        if (fetchIdRef.current === fetchId) setLoading(false);
      });

    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, [clientId, type, showToast]);

  const markPending = (id, enabled) =>
    setPendingIds((previous) => {
      const next = new Set(previous);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });

  const markSaving = (id, enabled) =>
    setSavingIds((previous) => {
      const next = new Set(previous);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });

  async function handleCreate() {
    if (creating || !clientId) return;
    setCreating(true);
    try {
      const response = await createAnalysis(clientId, type, {
        date: todayISO(),
        text: '',
      });
      const entry = response?.analysis;
      if (entry) {
        setEntries((previous) => [entry, ...previous]);
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Erro ao criar análise.';
      showToast(message, { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  async function commitPatch(id, patch) {
    markSaving(id, true);
    markPending(id, false);
    try {
      const response = await updateAnalysis(clientId, type, id, patch);
      const fresh = response?.analysis;
      if (fresh) {
        setEntries((previous) => previous.map((entry) => (entry.id === id ? fresh : entry)));
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Erro ao salvar análise.';
      showToast(message, { variant: 'error' });
    } finally {
      markSaving(id, false);
    }
  }

  function scheduleCommit(id, patch) {
    markPending(id, true);
    const timers = timersRef.current;
    if (timers.has(id)) clearTimeout(timers.get(id));
    const timer = setTimeout(() => {
      timers.delete(id);
      commitPatch(id, patch);
    }, DEBOUNCE_MS);
    timers.set(id, timer);
  }

  function onTextChange(id, value) {
    setEntries((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, text: value } : entry))
    );
    scheduleCommit(id, { text: value });
  }

  function onDateChange(id, value) {
    setEntries((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, date: value } : entry))
    );
    commitPatch(id, { date: value });
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(
      'Remover esta análise? Esta ação não pode ser desfeita.'
    );
    if (!confirmed) return;

    const previous = entries;
    setEntries((list) => list.filter((entry) => entry.id !== id));
    try {
      await deleteAnalysis(clientId, type, id);
      showToast('Análise removida.');
    } catch (error) {
      setEntries(previous);
      const message =
        error instanceof ApiError ? error.message : 'Erro ao remover análise.';
      showToast(message, { variant: 'error' });
    }
  }

  if (loading) {
    return (
      <StateBlock
        variant="loading"
        compact
        title="Carregando análises"
        description="Buscando o histórico estratégico desta aba."
      />
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={`${styles.heroBadge} ${titleClass}`.trim()}>{title}</span>
          <div className={styles.heroMeta}>
            <div className={styles.heroMetric}>
              <strong>{entries.length}</strong>
              <span>registros</span>
            </div>
            <div className={styles.heroMetric}>
              <strong>{entries[0]?.date || '—'}</strong>
              <span>última data</span>
            </div>
            <div className={styles.heroMetric}>
              <strong>
                {entries.filter((entry) => String(entry.text || '').trim()).length}
              </strong>
              <span>com conteúdo</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.header}>
        <div>
          <h3 className={`${styles.title} ${titleClass}`}>{title}</h3>
          <div className={styles.sub}>
            Registro cronológico com data, contexto e leitura estratégica
          </div>
        </div>
        <button
          type="button"
          className={styles.addBtn}
          onClick={handleCreate}
          disabled={creating || !canEdit}
        >
          {creating ? 'Criando…' : '+ Nova análise'}
        </button>
      </div>

      {entries.length === 0 ? (
        <StateBlock
          variant="empty"
          compact
          title="Nenhuma análise registrada"
          description="Clique em + Nova análise para adicionar a primeira entrada estratégica."
        />
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
                  value={entry.date || ''}
                  disabled={!canEdit}
                  onChange={(event) => onDateChange(entry.id, event.target.value)}
                />
                <button
                  type="button"
                  className={styles.delBtn}
                  onClick={() => handleDelete(entry.id)}
                  disabled={!canEdit}
                >
                  Remover
                </button>
              </div>
              <textarea
                className={styles.textarea}
                value={entry.text || ''}
                disabled={!canEdit}
                placeholder="Descreva a análise, observações, resultados…"
                onChange={(event) => onTextChange(entry.id, event.target.value)}
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
