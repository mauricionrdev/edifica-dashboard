import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getTemplate, resetTemplate, saveTemplate } from '../api/template.js';
import { listUserDirectory } from '../api/users.js';
import { ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { hasPermission } from '../utils/permissions.js';
import { useAutoSave } from '../hooks/useAutoSave.js';
import { ChevronDownIcon, CloseIcon, PlusIcon, RotateCcwIcon } from '../components/ui/Icons.jsx';
import Select from '../components/ui/Select.jsx';
import UserPicker from '../components/users/UserPicker.jsx';
import UserHoverCard from '../components/users/UserHoverCard.jsx';
import StateBlock from '../components/ui/StateBlock.jsx';
import styles from './ModeloOficialPage.module.css';

function normalizeTemplate(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((section) => ({
    sec: String(section?.sec || ''),
    open: section?.open !== false,
    tasks: (section?.tasks || []).map((task) => ({
      name: String(task?.name || ''),
      assignee: String(task?.assignee || ''),
      assigneeId: String(task?.assigneeId || ''),
      notes: String(task?.notes || ''),
      dueOffsetDays: Number.isFinite(Number(task?.dueOffsetDays)) ? Number(task.dueOffsetDays) : '',
      showNote: Boolean(task?.showNote),
      subs: (task?.subs || []).map((sub) => ({ name: String(sub?.name || '') })),
    })),
  }));
}

function sectionsForApi(sections) {
  return sections.map((section) => ({
    sec: section.sec,
    tasks: section.tasks.map((task) => ({
      name: task.name,
      assignee: task.assignee || '',
      assigneeId: task.assigneeId || '',
      notes: task.notes || '',
      dueOffsetDays: task.dueOffsetDays === '' || task.dueOffsetDays === null || task.dueOffsetDays === undefined
        ? ''
        : Number(task.dueOffsetDays),
      ...(task.subs?.length ? { subs: task.subs.map((sub) => ({ name: sub.name })) } : {}),
    })),
  }));
}

function initials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NA';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function dueOffsetLabel(value) {
  if (value === '' || value === null || value === undefined) return 'Sem prazo';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Sem prazo';
  if (number === 0) return 'D+0';
  return `D+${number}`;
}

function normalizeDueOffsetInput(value) {
  const clean = String(value || '').replace(/[^0-9]/g, '');
  if (!clean) return '';
  return Math.max(0, Math.min(365, Number(clean)));
}

function SaveStatusPill({ status }) {
  if (!status || status === 'idle') return null;
  const labels = {
    pending: 'Pendente',
    saving: 'Salvando',
    saved: 'Salvo',
    error: 'Erro',
  };
  return (
    <span className={`${styles.saveStatus} ${styles[`saveStatus_${status}`] || ''}`.trim()}>
      <span aria-hidden="true" />
      {labels[status]}
    </span>
  );
}

export default function ModeloOficialPage() {
  const { setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const { showToast } = useToast();
  const admin = hasPermission(user, 'projects.edit');

  const [sections, setSections] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addDraft, setAddDraft] = useState({});
  const [sectionDraft, setSectionDraft] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState(null);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState(null);
  const [draggedTaskRef, setDraggedTaskRef] = useState(null);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const my = ++fetchIdRef.current;
    setLoading(true);
    getTemplate()
      .then((res) => {
        if (fetchIdRef.current !== my) return;
        setSections(normalizeTemplate(res?.template?.sections));
        setHydrated(true);
      })
      .catch((err) => {
        if (fetchIdRef.current !== my) return;
        setError(err instanceof ApiError ? err : new Error('Erro ao carregar modelo'));
      })
      .finally(() => {
        if (fetchIdRef.current === my) setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    listUserDirectory()
      .then((res) => {
        if (!cancelled) setDirectoryUsers(Array.isArray(res?.users) ? res.users : []);
      })
      .catch(() => {
        if (!cancelled) setDirectoryUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleError = useCallback(
    (err) => {
      const msg = err instanceof ApiError ? err.message : 'Falha ao salvar modelo.';
      showToast(msg, { variant: 'error' });
    },
    [showToast]
  );

  const saver = useCallback((value) => saveTemplate(sectionsForApi(value)), []);
  const { status } = useAutoSave(sections, saver, {
    delay: 700,
    skip: !hydrated || !admin,
    onError: handleError,
  });

  function handleReset() {
    if (!admin) return;
    setResetConfirmOpen(true);
  }

  async function confirmResetTemplate() {
    if (!admin) return;

    setResetting(true);

    try {
      const res = await resetTemplate();
      setSections(normalizeTemplate(res?.template?.sections));
      setResetConfirmOpen(false);
      showToast('Modelo restaurado.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao restaurar modelo.';
      showToast(msg, { variant: 'error' });
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    const title = (
      <>
        <strong>Modelo Oficial</strong>
        <span>·</span>
        <span>Modelo de projeto</span>
      </>
    );
    const actions = admin ? (
      <>
        <SaveStatusPill status={status} />
        <button
          type="button"
          className={`${styles.headerButton} ${styles.headerButtonSubtle}`.trim()}
          onClick={handleReset}
          disabled={resetting}
          title="Restaurar modelo padrão"
        >
          <RotateCcwIcon size={13} />
          <span>{resetting ? 'Restaurando' : 'Restaurar'}</span>
        </button>
      </>
    ) : null;
    setPanelHeader({ title, actions });
  }, [status, admin, resetting, setPanelHeader]);

  const totalTasks = useMemo(
    () => sections.reduce((sum, section) => sum + section.tasks.length, 0),
    [sections]
  );
  const assigneeById = useMemo(
    () => new Map(directoryUsers.map((item) => [item.id, item])),
    [directoryUsers]
  );

  const renameSection = (si, name) =>
    setSections((prev) => prev.map((section, i) => (i === si ? { ...section, sec: name } : section)));

  const toggleSection = (si) =>
    setSections((prev) => prev.map((section, i) => (i === si ? { ...section, open: !section.open } : section)));

  const requestRemoveSection = (si) => {
    if (!admin) return;

    const section = sections[si];

    if (!section) return;

    setSectionDeleteTarget({
      index: si,
      name: section.sec,
      taskCount: section.tasks?.length || 0,
    });
  };

  const confirmRemoveSection = () => {
    if (!admin || sectionDeleteTarget?.index === undefined) return;

    setSections((prev) => prev.filter((_, i) => i !== sectionDeleteTarget.index));
    setSectionDeleteTarget(null);
  };

  const moveSection = (fromIndex, toIndex) => {
    if (!admin || fromIndex === toIndex || toIndex < 0 || toIndex >= sections.length) return;

    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const moveTask = (fromSectionIndex, fromTaskIndex, toSectionIndex, toTaskIndex) => {
    if (!admin) return;

    setSections((prev) => {
      const next = prev.map((section) => ({ ...section, tasks: [...section.tasks] }));
      const sourceSection = next[fromSectionIndex];
      const targetSection = next[toSectionIndex];

      if (!sourceSection || !targetSection) return prev;

      const [moved] = sourceSection.tasks.splice(fromTaskIndex, 1);

      if (!moved) return prev;

      const safeTargetIndex = Math.max(0, Math.min(toTaskIndex, targetSection.tasks.length));
      targetSection.tasks.splice(safeTargetIndex, 0, moved);

      return next;
    });
  };

  const renameTask = (si, ti, name) =>
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si
          ? section
          : {
              ...section,
              tasks: section.tasks.map((task, j) => (j === ti ? { ...task, name } : task)),
            }
      )
    );

  const removeTask = (si, ti) => {
    if (!admin) return;
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si ? section : { ...section, tasks: section.tasks.filter((_, j) => j !== ti) }
      )
    );
  };

  const setTaskAssignee = (si, ti, assigneeId) => {
    const option = directoryUsers.find((item) => item.id === assigneeId);
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si
          ? section
          : {
              ...section,
              tasks: section.tasks.map((task, j) =>
                j !== ti ? task : { ...task, assigneeId, assignee: option?.name || '' }
              ),
            }
      )
    );
  };

  const setTaskDueOffset = (si, ti, dueOffsetDays) =>
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si
          ? section
          : {
              ...section,
              tasks: section.tasks.map((task, j) =>
                j !== ti ? task : { ...task, dueOffsetDays: normalizeDueOffsetInput(dueOffsetDays) }
              ),
            }
      )
    );

  const toggleTaskNote = (si, ti) =>
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si
          ? section
          : {
              ...section,
              tasks: section.tasks.map((task, j) =>
                j !== ti ? task : { ...task, showNote: !task.showNote }
              ),
            }
      )
    );

  const setTaskNotes = (si, ti, notes) =>
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si
          ? section
          : {
              ...section,
              tasks: section.tasks.map((task, j) => (j === ti ? { ...task, notes } : task)),
            }
      )
    );

  const addTaskToSection = (si) => {
    if (!admin) return;
    const name = String(addDraft[si] || '').trim();
    if (!name) return;
    setSections((prev) =>
      prev.map((section, i) =>
        i !== si ? section : { ...section, tasks: [...section.tasks, { name, notes: '', dueOffsetDays: '', subs: [] }] }
      )
    );
    setAddDraft((draft) => ({ ...draft, [si]: '' }));
  };

  const addSection = () => {
    if (!admin) return;
    const name = sectionDraft.trim();
    if (!name) return;
    setSections((prev) => [...prev, { sec: name, open: true, tasks: [] }]);
    setSectionDraft('');
  };

  function renderAvatar(userEntry, fallbackName) {
    const avatarUrl = getUserAvatar(userEntry) || userEntry?.avatarUrl || '';
    return avatarUrl ? <img src={avatarUrl} alt="" /> : initials(userEntry?.name || fallbackName);
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <StateBlock variant="loading" title="Carregando modelo" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="error"
          title="Erro ao carregar modelo"
          description={error.message || 'Não foi possível carregar o modelo oficial.'}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.board}>
        <header className={styles.boardHeader}>
          <div>
            <h1>Modelo Oficial</h1>
            <p>{sections.length} seções · {totalTasks} tarefas base</p>
          </div>
          {admin ? (
            <div className={styles.boardActions}>
              <input
                type="text"
                className={styles.sectionInput}
                placeholder="Nova seção"
                value={sectionDraft}
                onChange={(event) => setSectionDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSection();
                  }
                }}
              />
              <button type="button" className={styles.addButton} onClick={addSection} disabled={!sectionDraft.trim()}>
                <PlusIcon size={13} />
                Adicionar seção
              </button>
            </div>
          ) : null}
        </header>

        <div className={styles.tableHeader}>
          <span>Tarefa</span>
          <span>Responsável</span>
          <span>Prazo</span>
          <span>Nota</span>
          <span />
        </div>

        <div className={styles.sectionList}>
          {sections.map((section, si) => (
            <section
              key={si}
              className={styles.section}
              draggable={admin}
              onDragStart={() => setDraggedSectionIndex(si)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();

                if (draggedTaskRef) return;

                if (draggedSectionIndex !== null && draggedSectionIndex !== si) {
                  moveSection(draggedSectionIndex, si);
                }

                setDraggedSectionIndex(null);
              }}
              onDragEnd={() => setDraggedSectionIndex(null)}
            >
              <button type="button" className={styles.sectionRow} onClick={() => toggleSection(si)}>
                <ChevronDownIcon
                  size={14}
                  className={`${styles.sectionChevron} ${section.open ? '' : styles.sectionChevronClosed}`.trim()}
                />
                <span className={styles.sectionIndex}>{si + 1}</span>
                <input
                  className={styles.sectionTitle}
                  value={section.sec}
                  disabled={!admin}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => renameSection(si, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <span className={styles.sectionCount}>{section.tasks.length}</span>
                {admin ? (
                  <span
                    className={styles.removeSection}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestRemoveSection(si);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Remover seção"
                  >
                    <CloseIcon size={12} />
                  </span>
                ) : null}
              </button>

              {section.open ? (
                <div className={styles.tasks}>
                  {section.tasks.map((task, ti) => {
                    const assignee = assigneeById.get(task.assigneeId);
                    return (
                      <article
                        key={ti}
                        className={styles.taskRow}
                        draggable={admin}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDraggedTaskRef({ sectionIndex: si, taskIndex: ti });
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          if (!draggedTaskRef) return;

                          moveTask(draggedTaskRef.sectionIndex, draggedTaskRef.taskIndex, si, ti);
                          setDraggedTaskRef(null);
                        }}
                        onDragEnd={() => setDraggedTaskRef(null)}
                      >
                        <span className={styles.taskCheck} aria-hidden="true" />
                        <div className={styles.taskMain}>
                          <input
                            className={styles.taskName}
                            value={task.name}
                            disabled={!admin}
                            onChange={(event) => renameTask(si, ti, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                            }}
                          />
                          {task.showNote ? (
                            <textarea
                              className={styles.noteArea}
                              rows={3}
                              value={task.notes || ''}
                              disabled={!admin}
                              placeholder="Nota da tarefa"
                              onChange={(event) => setTaskNotes(si, ti, event.target.value)}
                            />
                          ) : null}
                        </div>

                        <div className={styles.assigneeCell}>
                          {assignee ? (
                            <UserHoverCard user={assignee} placement="top">
                              <span className={styles.avatar} aria-hidden="true">
                                {renderAvatar(assignee, task.assignee)}
                              </span>
                            </UserHoverCard>
                          ) : (
                            <span className={styles.avatar} aria-hidden="true">NA</span>
                          )}
                          <UserPicker
                            className={styles.assigneeSelect}
                            users={directoryUsers}
                            value={task.assigneeId || ''}
                            disabled={!admin}
                            onChange={(userId) => setTaskAssignee(si, ti, userId)}
                            placeholder="Sem responsável"
                          />
                        </div>

                        <div className={styles.dueOffsetCell}>
                          <span className={styles.dueOffsetBadge}>{dueOffsetLabel(task.dueOffsetDays)}</span>
                          <input
                            className={styles.dueOffsetInput}
                            value={task.dueOffsetDays}
                            disabled={!admin}
                            inputMode="numeric"
                            placeholder="D+"
                            onChange={(event) => setTaskDueOffset(si, ti, event.target.value)}
                            aria-label="Prazo relativo em dias"
                          />
                        </div>

                        <button
                          type="button"
                          className={`${styles.noteButton} ${task.notes ? styles.noteButtonActive : ''}`.trim()}
                          disabled={!admin}
                          onClick={() => toggleTaskNote(si, ti)}
                        >
                          {task.notes ? 'Notas' : 'Adicionar'}
                        </button>

                        {admin ? (
                          <button
                            type="button"
                            className={styles.removeTask}
                            onClick={() => removeTask(si, ti)}
                            aria-label="Remover tarefa"
                          >
                            <CloseIcon size={12} />
                          </button>
                        ) : <span />}
                      </article>
                    );
                  })}

                  {admin ? (
                    <form
                      className={styles.addTaskRow}
                      onSubmit={(event) => {
                        event.preventDefault();
                        addTaskToSection(si);
                      }}
                    >
                      <span />
                      <input
                        type="text"
                        placeholder="Adicionar tarefa..."
                        value={addDraft[si] || ''}
                        onChange={(event) => setAddDraft((draft) => ({ ...draft, [si]: event.target.value }))}
                      />
                      <button type="submit" disabled={!String(addDraft[si] || '').trim()}>
                        Adicionar
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      {sectionDeleteTarget ? (
        <div className={styles.confirmOverlay} onClick={() => setSectionDeleteTarget(null)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar remoção da seção do modelo"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.confirmHeader}>
              <h2>Remover seção</h2>
              <button type="button" onClick={() => setSectionDeleteTarget(null)} aria-label="Fechar">
                ×
              </button>
            </header>
            <div className={styles.confirmBody}>
              <p>
                Você está prestes a remover <strong>{sectionDeleteTarget.name}</strong> do Modelo Oficial.
              </p>
              {sectionDeleteTarget.taskCount > 0 ? (
                <p>
                  Esta seção possui <strong>{sectionDeleteTarget.taskCount} tarefa(s)</strong>. Novos projetos criados a partir do modelo não receberão mais essa estrutura.
                </p>
              ) : (
                <p>Esta seção está vazia e será removida do modelo.</p>
              )}
            </div>
            <footer className={styles.confirmFooter}>
              <button type="button" className={styles.confirmCancel} onClick={() => setSectionDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className={styles.confirmDelete} onClick={confirmRemoveSection}>
                Remover seção
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {resetConfirmOpen ? (
        <div className={styles.confirmOverlay} onClick={() => !resetting && setResetConfirmOpen(false)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar restauração do modelo"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.confirmHeader}>
              <h2>Restaurar modelo</h2>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                disabled={resetting}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>
            <div className={styles.confirmBody}>
              <p>Essa ação vai substituir o Modelo Oficial atual pelo padrão do sistema.</p>
              <p>Projetos já criados não serão alterados.</p>
            </div>
            <footer className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setResetConfirmOpen(false)}
                disabled={resetting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
                onClick={confirmResetTemplate}
                disabled={resetting}
              >
                {resetting ? 'Restaurando...' : 'Restaurar modelo'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
