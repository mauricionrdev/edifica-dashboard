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

  async function handleReset() {
    if (!admin) return;
    if (!window.confirm('Restaurar o modelo padrão? Todas as personalizações serão perdidas.')) return;
    setResetting(true);
    try {
      const res = await resetTemplate();
      setSections(normalizeTemplate(res?.template?.sections));
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

  const removeSection = (si) => {
    if (!admin) return;
    if (!window.confirm('Remover esta seção do modelo? Novos projetos não vão mais receber estas tarefas.')) return;
    setSections((prev) => prev.filter((_, i) => i !== si));
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
        i !== si ? section : { ...section, tasks: [...section.tasks, { name, notes: '', subs: [] }] }
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
          <span>Nota</span>
          <span />
        </div>

        <div className={styles.sectionList}>
          {sections.map((section, si) => (
            <section key={si} className={styles.section}>
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
                      removeSection(si);
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
                      <article key={ti} className={styles.taskRow}>
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
                          <span className={styles.avatar} aria-hidden="true">
                            {renderAvatar(assignee, task.assignee)}
                          </span>
                          <Select
                            className={styles.assigneeSelect}
                            value={task.assigneeId || ''}
                            disabled={!admin}
                            onChange={(event) => setTaskAssignee(si, ti, event.target.value)}
                            aria-label="Responsável padrão"
                          >
                            <option value="">Sem responsável</option>
                            {directoryUsers.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </Select>
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
    </div>
  );
}
