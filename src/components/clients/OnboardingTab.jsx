// ================================================================
//  OnboardingTab
//  - Carrega sections de GET /clients/:id/onboarding.
//  - Mutações são locais (setState) + auto-save com debounce de 600ms
//    via useAutoSave. O backend só tem PUT completo (substitui sections
//    inteiro), então toda mutação dispara o mesmo PUT.
//  - Status de save é exposto via callback onStatusChange para o Drawer
//    mostrar "Salvando…" / "Salvo" no header.
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOnboarding, saveOnboarding } from '../../api/onboarding.js';
import { ApiError } from '../../api/client.js';
import {
  addTask,
  computeProgress,
  isGDVSection,
  normalizeSections,
  removeTask,
  sectionProgress,
  updateSection,
  updateSub,
  updateTask,
} from '../../utils/onboardingHelpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useToast } from '../../context/ToastContext.jsx';
import { CloseIcon } from '../ui/Icons.jsx';
import tabStyles from './ClientTabs.module.css';
import styles from './OnboardingTab.module.css';

export default function OnboardingTab({ clientId, onStatusChange }) {
  const { showToast } = useToast();

  const [sections, setSections] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addDraft, setAddDraft] = useState({}); // { [si]: 'texto' }

  // Track de clientId para descartar fetchs antigos quando troca
  const fetchIdRef = useRef(0);

  // --- fetch inicial ---
  useEffect(() => {
    if (!clientId) return;
    const myFetchId = ++fetchIdRef.current;
    setLoading(true);
    setHydrated(false);
    setError(null);

    getOnboarding(clientId)
      .then((res) => {
        if (fetchIdRef.current !== myFetchId) return;
        const normalized = normalizeSections(res?.onboarding?.sections);
        setSections(normalized);
        setHydrated(true);
      })
      .catch((err) => {
        if (fetchIdRef.current !== myFetchId) return;
        setError(
          err instanceof ApiError
            ? err
            : new Error('Erro ao carregar onboarding')
        );
      })
      .finally(() => {
        if (fetchIdRef.current === myFetchId) setLoading(false);
      });
  }, [clientId]);

  // --- auto-save ---
  const handleError = useCallback(
    (err) => {
      const msg =
        err instanceof ApiError ? err.message : 'Falha ao salvar onboarding.';
      showToast(msg, { variant: 'error' });
    },
    [showToast]
  );

  const saver = useCallback(
    (value) => saveOnboarding(clientId, value),
    [clientId]
  );

  const { status } = useAutoSave(sections, saver, {
    delay: 600,
    skip: !hydrated,
    onError: handleError,
  });

  // Propaga status pra Drawer (Salvando… / Salvo)
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // --- mutations locais (imutáveis) ---
  const mutate = useCallback((updater) => {
    setSections((prev) => updater(prev));
  }, []);

  const toggleSection = (si) =>
    mutate((s) => updateSection(s, si, (sec) => ({ ...sec, open: !sec.open })));

  const renameSection = (si, name) =>
    mutate((s) => updateSection(s, si, { sec: name }));

  const toggleTaskDone = (si, ti) =>
    mutate((s) => updateTask(s, si, ti, (t) => ({ ...t, done: !t.done })));

  const renameTask = (si, ti, name) =>
    mutate((s) => updateTask(s, si, ti, { name }));

  const setAssignee = (si, ti, assignee) =>
    mutate((s) => updateTask(s, si, ti, { assignee }));

  const setDueDate = (si, ti, dueDate) =>
    mutate((s) => updateTask(s, si, ti, { dueDate }));

  const toggleNote = (si, ti) =>
    mutate((s) =>
      updateTask(s, si, ti, (t) => ({ ...t, showNote: !t.showNote }))
    );

  const setNotes = (si, ti, notes) =>
    mutate((s) => updateTask(s, si, ti, { notes }));

  const deleteTask = (si, ti) => mutate((s) => removeTask(s, si, ti));

  const toggleSubDone = (si, ti, subIdx) =>
    mutate((s) =>
      updateSub(s, si, ti, subIdx, (sub) => ({ ...sub, done: !sub.done }))
    );

  const renameSub = (si, ti, subIdx, name) =>
    mutate((s) => updateSub(s, si, ti, subIdx, { name }));

  const handleAddTaskCommit = (si) => {
    const text = String(addDraft[si] || '').trim();
    if (!text) return;
    mutate((s) => addTask(s, si, text));
    setAddDraft((d) => ({ ...d, [si]: '' }));
  };

  // Assignees sugeridos: gestor/GDV do cliente (virão de task.assignee
  // já preenchidos). Para o select, colhemos os valores únicos presentes.
  const suggestedAssignees = (() => {
    const set = new Set();
    for (const sec of sections) {
      for (const t of sec.tasks || []) {
        if (t.assignee) set.add(t.assignee);
      }
    }
    return [...set];
  })();

  // --- render ---
  if (loading) {
    return (
      <div className={tabStyles.loadingState}>Carregando onboarding…</div>
    );
  }
  if (error) {
    return (
      <div className={tabStyles.emptyState}>
        <div>{error.message || 'Erro ao carregar onboarding'}</div>
      </div>
    );
  }

  const progress = computeProgress(sections);
  const totalSections = sections.length;

  return (
    <div className={styles.panel}>
      {/* Cabeçalho de progresso */}
      <div className={styles.progressCard}>
        <div className={styles.progressMain}>
          <div className={styles.progressLabel}>
            Progresso Geral do Onboarding
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{
                width: `${progress.percent}%`,
                background: progress.percent === 100 ? '#22c55e' : '#f5c300',
              }}
            />
          </div>
        </div>
        <div
          className={styles.progressPercent}
          style={{ color: progress.percent === 100 ? '#22c55e' : '#f5c300' }}
        >
          {progress.percent}%
        </div>
        <div className={styles.progressMeta}>
          <strong>{progress.done}/{progress.total}</strong>
          tarefas
        </div>
      </div>

      {sections.length === 0 && (
        <div className={tabStyles.emptyState}>
          Onboarding vazio. Isso não deveria acontecer — verifique o Modelo
          Oficial.
        </div>
      )}

      {/* Seções */}
      {sections.map((section, si) => {
        const sp = sectionProgress(section);
        const pct = sp.total > 0 ? Math.round((sp.done / sp.total) * 100) : 0;
        const done = sp.total > 0 && sp.done === sp.total;
        const gdv = isGDVSection(section, si, totalSections);

        return (
          <div key={si} className={styles.section}>
            <div
              className={`${styles.sectionHdr} ${gdv ? styles.gdv : ''}`.trim()}
              onClick={() => toggleSection(si)}
            >
              <div
                className={`${styles.secNum} ${gdv ? styles.gdv : ''}`.trim()}
              >
                {si + 1}
              </div>

              <input
                className={styles.secTitle}
                value={section.sec}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => renameSection(si, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />

              <div className={styles.secProgBar}>
                <div
                  className={styles.secProgFill}
                  style={{
                    width: `${pct}%`,
                    background: done ? '#22c55e' : '#f5c300',
                  }}
                />
              </div>
              <span
                className={styles.secProgText}
                style={{ color: done ? '#7fc99b' : '#8f8f8f' }}
              >
                {sp.done}/{sp.total}
              </span>

              {done && <span className={styles.secDone}>✓ Concluído</span>}

              <span
                className={styles.secArrow}
                style={{
                  transform: `rotate(${section.open ? 0 : -90}deg)`,
                }}
              >
                ▼
              </span>
            </div>

            {section.open && (
              <div className={styles.secBody}>
                {section.tasks.map((task, ti) => (
                  <div
                    key={task.id || ti}
                    className={`${styles.task} ${task.done ? styles.done : ''}`.trim()}
                  >
                    <input
                      type="checkbox"
                      className={styles.cb}
                      checked={task.done}
                      onChange={() => toggleTaskDone(si, ti)}
                    />
                    <input
                      className={styles.taskName}
                      value={task.name}
                      onChange={(e) => renameTask(si, ti, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <select
                      className={`${styles.assignee} ${
                        task.assignee ? '' : styles.empty
                      }`.trim()}
                      value={task.assignee}
                      onChange={(e) => setAssignee(si, ti, e.target.value)}
                    >
                      <option value="">— Responsável</option>
                      {suggestedAssignees.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                      {task.assignee &&
                        !suggestedAssignees.includes(task.assignee) && (
                          <option value={task.assignee}>{task.assignee}</option>
                        )}
                    </select>
                    <input
                      type="date"
                      className={`${styles.dateInp} ${
                        task.dueDate ? '' : styles.empty
                      }`.trim()}
                      value={task.dueDate}
                      onChange={(e) => setDueDate(si, ti, e.target.value)}
                    />
                    <button
                      type="button"
                      className={`${styles.noteBtn} ${
                        task.notes ? styles.hasNote : ''
                      }`.trim()}
                      onClick={() => toggleNote(si, ti)}
                      title={task.notes ? 'Nota' : 'Adicionar nota'}
                      aria-label="Nota"
                    >
                      📝
                    </button>

                    {task.showNote && (
                      <textarea
                        className={styles.noteArea}
                        rows={2}
                        value={task.notes}
                        placeholder="Observações sobre esta tarefa…"
                        onChange={(e) => setNotes(si, ti, e.target.value)}
                      />
                    )}

                    {task.subs?.length > 0 && (
                      <div className={styles.subList}>
                        {task.subs.map((sub, sIdx) => (
                          <div key={sub.id || sIdx} className={styles.sub}>
                            <input
                              type="checkbox"
                              className={styles.subCb}
                              checked={sub.done}
                              onChange={() => toggleSubDone(si, ti, sIdx)}
                            />
                            <input
                              className={`${styles.subName} ${
                                sub.done ? styles.done : ''
                              }`.trim()}
                              value={sub.name}
                              onChange={(e) =>
                                renameSub(si, ti, sIdx, e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                            />
                            <span />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Remover (só se for tarefa customizada = id começa
                        com "<sec>_custom_"). Tarefas do template padrão
                        não podem ser deletadas daqui. */}
                    {String(task.id || '').includes('_custom_') && (
                      <button
                        type="button"
                        className={styles.taskRemove}
                        onClick={() => deleteTask(si, ti)}
                        title="Remover tarefa"
                        aria-label="Remover tarefa"
                        style={{ gridColumn: '5 / 6' }}
                      >
                        <CloseIcon size={12} />
                      </button>
                    )}
                  </div>
                ))}

                <div className={styles.addRow}>
                  <input
                    type="text"
                    className={styles.addInput}
                    placeholder="+ Adicionar tarefa personalizada…"
                    value={addDraft[si] || ''}
                    onChange={(e) =>
                      setAddDraft((d) => ({ ...d, [si]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTaskCommit(si);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => handleAddTaskCommit(si)}
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
