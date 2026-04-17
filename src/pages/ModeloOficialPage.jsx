// ================================================================
//  ModeloOficialPage (/modelo-oficial)
//  Editor do template singleton de onboarding.
//  - GET   /template          (qualquer autenticado lê)
//  - PUT   /template          (admin salva)
//  - POST  /template/reset    (admin restaura padrão)
//
//  Estrutura visual reaproveita OnboardingTab.module.css: cada section
//  tem tarefas editáveis (sem checkbox/dono/data - é só um template).
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  getTemplate,
  resetTemplate,
  saveTemplate,
} from '../api/template.js';
import { ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { isAdminUser } from '../utils/roles.js';
import { useAutoSave } from '../hooks/useAutoSave.js';
import { CloseIcon, PlusIcon, RotateCcwIcon, SaveIcon } from '../components/ui/Icons.jsx';
import obStyles from '../components/clients/OnboardingTab.module.css';
import tabStyles from '../components/clients/ClientTabs.module.css';
import styles from './ModeloOficialPage.module.css';

// Template usa a mesma estrutura de sections do onboarding, mas
// sem as flags de instância (done, assignee, dueDate etc.). Aceitamos
// os dois formatos e normalizamos em memória.
function normalizeTemplate(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((section) => ({
    sec: String(section?.sec || ''),
    open: section?.open !== false,
    tasks: (section?.tasks || []).map((task) => ({
      name: String(task?.name || ''),
      notes: String(task?.notes || ''),
      subs: (task?.subs || []).map((s) => ({
        name: String(s?.name || ''),
      })),
    })),
  }));
}

function sectionsForApi(sections) {
  // Remove `open` (flag puramente de UI) antes de enviar
  return sections.map((sec) => ({
    sec: sec.sec,
    tasks: sec.tasks.map((t) => ({
      name: t.name,
      notes: t.notes || '',
      ...(t.subs && t.subs.length ? { subs: t.subs.map((s) => ({ name: s.name })) } : {}),
    })),
  }));
}

function SaveStatusPill({ status }) {
  if (!status || status === 'idle') return null;
  const labels = {
    pending: 'Alterações pendentes',
    saving: 'Salvando…',
    saved: 'Salvo',
    error: 'Erro ao salvar',
  };
  const cls = tabStyles[status] || '';
  return (
    <div className={`${tabStyles.saveStatus} ${cls}`.trim()} style={{ marginLeft: 0 }}>
      <span className={tabStyles.saveDot} />
      <span>{labels[status]}</span>
    </div>
  );
}

export default function ModeloOficialPage() {
  const { setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const { showToast } = useToast();

  const admin = isAdminUser(user);

  const [sections, setSections] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addDraft, setAddDraft] = useState({}); // { [si]: 'texto' }
  const [sectionDraft, setSectionDraft] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchIdRef = useRef(0);

  // --- fetch inicial ---
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
        setError(err instanceof ApiError ? err : new Error('Erro ao carregar template'));
      })
      .finally(() => {
        if (fetchIdRef.current === my) setLoading(false);
      });
  }, []);

  // --- auto-save (admin apenas) ---
  const handleError = useCallback(
    (err) => {
      const msg =
        err instanceof ApiError ? err.message : 'Falha ao salvar modelo.';
      showToast(msg, { variant: 'error' });
    },
    [showToast]
  );

  const saver = useCallback(
    (value) => saveTemplate(sectionsForApi(value)),
    []
  );

  const { status } = useAutoSave(sections, saver, {
    delay: 700,
    skip: !hydrated || !admin,
    onError: handleError,
  });

  // --- panelHeader ---
  useEffect(() => {
    const title = (
      <>
        <strong>Modelo Oficial</strong>
        <span>·</span>
        <span>Template de Onboarding</span>
      </>
    );

    const actions = admin ? (
      <>
        <SaveStatusPill status={status} />
        <button
          type="button"
          className={`${styles.headerBtn} ${styles.danger}`.trim()}
          onClick={handleReset}
          disabled={resetting}
          title="Restaurar template padrão"
        >
          <RotateCcwIcon size={13} />
          <span>{resetting ? 'Restaurando…' : 'Restaurar padrão'}</span>
        </button>
      </>
    ) : null;

    setPanelHeader({ title, actions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, admin, resetting, setPanelHeader]);

  // --- mutations ---
  const renameSection = (si, name) =>
    setSections((prev) =>
      prev.map((s, i) => (i === si ? { ...s, sec: name } : s))
    );

  const toggleSection = (si) =>
    setSections((prev) =>
      prev.map((s, i) => (i === si ? { ...s, open: !s.open } : s))
    );

  const removeSection = (si) => {
    if (!window.confirm('Remover esta seção do template? Novos clientes não vão mais receber estas tarefas.')) return;
    setSections((prev) => prev.filter((_, i) => i !== si));
  };

  const renameTask = (si, ti, name) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si
          ? s
          : {
              ...s,
              tasks: s.tasks.map((t, j) => (j === ti ? { ...t, name } : t)),
            }
      )
    );

  const removeTask = (si, ti) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si
          ? s
          : { ...s, tasks: s.tasks.filter((_, j) => j !== ti) }
      )
    );

  const addTaskToSection = (si) => {
    const name = String(addDraft[si] || '').trim();
    if (!name) return;
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si
          ? s
          : {
              ...s,
              tasks: [
                ...s.tasks,
                { name, notes: '', subs: [] },
              ],
            }
      )
    );
    setAddDraft((d) => ({ ...d, [si]: '' }));
  };

  const addSection = () => {
    const name = sectionDraft.trim();
    if (!name) return;
    setSections((prev) => [
      ...prev,
      { sec: name, open: true, tasks: [] },
    ]);
    setSectionDraft('');
  };

  async function handleReset() {
    if (!admin) return;
    if (!window.confirm('Restaurar o template padrão? Todas as personalizações serão perdidas.')) return;
    setResetting(true);
    try {
      const res = await resetTemplate();
      setSections(normalizeTemplate(res?.template?.sections));
      showToast('Template restaurado.');
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Falha ao restaurar template.';
      showToast(msg, { variant: 'error' });
    } finally {
      setResetting(false);
    }
  }

  // --- render ---

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>Carregando template…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          {error.message || 'Erro ao carregar template'}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.info}>
        <b>Modelo Oficial</b> · Este template é aplicado automaticamente a{' '}
        <b>novos clientes</b>. Clientes existentes não são afetados.{' '}
        {admin ? (
          <span>As alterações aqui são salvas automaticamente.</span>
        ) : (
          <span>Apenas administradores podem editar.</span>
        )}
      </div>

      {sections.map((section, si) => (
        <div key={si} className={obStyles.section}>
          <div className={obStyles.sectionHdr} onClick={() => toggleSection(si)}>
            <div className={obStyles.secNum}>{si + 1}</div>
            <input
              className={obStyles.secTitle}
              value={section.sec}
              disabled={!admin}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => renameSection(si, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: '#8f8f8f',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {section.tasks.length} tarefa{section.tasks.length === 1 ? '' : 's'}
            </span>
            {admin && (
              <button
                type="button"
                className={obStyles.taskRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSection(si);
                }}
                title="Remover seção"
                aria-label="Remover seção"
              >
                <CloseIcon size={12} />
              </button>
            )}
            <span
              className={obStyles.secArrow}
              style={{
                transform: `rotate(${section.open ? 0 : -90}deg)`,
              }}
            >
              ▼
            </span>
          </div>

          {section.open && (
            <div className={obStyles.secBody}>
              {section.tasks.map((task, ti) => (
                <div
                  key={ti}
                  className={obStyles.task}
                  style={{ gridTemplateColumns: '22px 1fr auto' }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: '1px dashed #3a3a3a',
                      marginLeft: 2,
                    }}
                  />
                  <input
                    className={obStyles.taskName}
                    value={task.name}
                    disabled={!admin}
                    onChange={(e) => renameTask(si, ti, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                  {admin && (
                    <button
                      type="button"
                      className={obStyles.taskRemove}
                      onClick={() => removeTask(si, ti)}
                      title="Remover tarefa"
                      aria-label="Remover tarefa"
                    >
                      <CloseIcon size={12} />
                    </button>
                  )}
                </div>
              ))}

              {admin && (
                <div className={obStyles.addRow}>
                  <input
                    type="text"
                    className={obStyles.addInput}
                    placeholder="+ Nova tarefa nesta seção…"
                    value={addDraft[si] || ''}
                    onChange={(e) =>
                      setAddDraft((d) => ({ ...d, [si]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTaskToSection(si);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={obStyles.addBtn}
                    onClick={() => addTaskToSection(si)}
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {admin && (
        <div className={styles.addSection}>
          <input
            type="text"
            className={styles.addSectionInput}
            placeholder="+ Nova seção do template…"
            value={sectionDraft}
            onChange={(e) => setSectionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSection();
              }
            }}
          />
          <button
            type="button"
            className={styles.addSectionBtn}
            onClick={addSection}
          >
            <PlusIcon size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
            Adicionar seção
          </button>
        </div>
      )}
    </div>
  );
}
