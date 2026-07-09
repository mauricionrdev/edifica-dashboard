import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createAnalysis,
  createAnalysisAttachment,
  deleteAnalysis,
  deleteAnalysisAttachment,
  listAnalyses,
  updateAnalysis,
} from '../../api/analyses.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import DateField from '../ui/DateField.jsx';
import { TrashIcon } from '../ui/Icons.jsx';
import styles from './AnalysisTab.module.css';

const DEBOUNCE_MS = 500;

const ANALYSIS_META = {
  icp: {
    title: 'Análise ICP',
    className: styles.icp,
    loadingTitle: 'Carregando Análise ICP',
    loadingDescription: 'Buscando o histórico estratégico de aderência e perfil deste cliente.',
    emptyTitle: 'Nenhum registro de Análise ICP',
    emptyDescription: 'Ainda não existe histórico desta etapa para este cliente.',
    placeholder: 'Registre aderência ao ICP, perfil, riscos, oportunidades e próximos ajustes…',
    deleteEyebrow: 'Remover registro',
    deleteTitle: 'Análise ICP',
    deleteDescription: 'O registro selecionado será removido da etapa de Análise ICP e não poderá ser recuperado.',
    createLabel: '+ Novo registro',
  },
  gdvanalise: {
    title: 'Análise GDV',
    className: styles.gdv,
    loadingTitle: 'Carregando Análise GDV',
    loadingDescription: 'Buscando o histórico estratégico comercial deste cliente.',
    emptyTitle: 'Nenhum registro de Análise GDV',
    emptyDescription: 'Ainda não existe histórico desta etapa para este cliente.',
    placeholder: 'Registre leitura comercial, momento do cliente, gargalos, tração e próximos movimentos…',
    deleteEyebrow: 'Remover registro',
    deleteTitle: 'Análise GDV',
    deleteDescription: 'O registro selecionado será removido da etapa de Análise GDV e não poderá ser recuperado.',
    createLabel: '+ Novo registro',
  },
  route_summary: {
    title: 'Resumo de Rotas',
    className: styles.routes,
    loadingTitle: 'Carregando Resumo de Rotas',
    loadingDescription: 'Buscando o histórico consolidado de rotas e direcionamentos deste cliente.',
    emptyTitle: 'Nenhum registro de Resumo de Rotas',
    emptyDescription: 'Ainda não existe histórico desta etapa para este cliente.',
    placeholder: 'Registre a síntese das rotas sugeridas, encaminhamentos, decisões e próximos passos…',
    deleteEyebrow: 'Remover registro',
    deleteTitle: 'Resumo de Rotas',
    deleteDescription: 'O registro selecionado será removido da etapa de Resumo de Rotas e não poderá ser recuperado.',
    createLabel: '+ Novo registro',
  },
};

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateBR(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}


function expandedTextRows(value) {
  const text = String(value || '');
  const lines = text.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 92)), 0);
  return Math.min(26, Math.max(8, lines || 8));
}

function analysisAuthor(entry) {
  return (
    entry?.updatedByName
    || entry?.createdByName
    || entry?.authorName
    || entry?.createdBy
    || entry?.updatedBy
    || 'Sem autor registrado'
  );
}


const ACTION_PLAN_MARKER = '[EDIFICA_ICP_ACTION_PLAN_V1]';

function makeLocalId(prefix = 'item') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeActionPlan(raw = {}) {
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  return {
    objective: String(raw.objective || '').slice(0, 5000),
    deadline: String(raw.deadline || '').slice(0, 10),
    actions: actions.map((action) => ({
      id: String(action?.id || makeLocalId('acao')),
      text: String(action?.text || '').slice(0, 1200),
      done: Boolean(action?.done),
    })),
  };
}

function createEmptyActionPlan() {
  return normalizeActionPlan({
    objective: '',
    deadline: '',
    actions: [],
  });
}

function parseActionPlan(value) {
  const text = String(value || '').trim();
  if (!text.startsWith(ACTION_PLAN_MARKER)) return null;
  try {
    return normalizeActionPlan(JSON.parse(text.slice(ACTION_PLAN_MARKER.length).trim() || '{}'));
  } catch {
    return null;
  }
}

function serializeActionPlan(plan) {
  return `${ACTION_PLAN_MARKER}\n${JSON.stringify(normalizeActionPlan(plan))}`;
}

function getActionCompletion(actions = []) {
  const validActions = (Array.isArray(actions) ? actions : []).filter((action) => String(action?.text || '').trim());
  return {
    done: validActions.filter((action) => action.done).length,
    total: validActions.length,
  };
}

function actionPlanPreviewText(plan) {
  const normalized = normalizeActionPlan(plan);
  const { done, total } = getActionCompletion(normalized.actions);
  const objective = normalized.objective.trim() || 'Plano de ação sem objetivo preenchido';
  const deadline = normalized.deadline ? ` · Prazo ${formatDateBR(normalized.deadline)}` : '';
  const actionSummary = total ? `${done}/${total} ações concluídas` : 'Nenhuma ação definida';
  return `${objective}\n${actionSummary}${deadline}`;
}

function actionPlanNumber(index, total) {
  return `Plano #${Math.max(1, total - index)}`;
}

function isPreviewableAttachment(item) {
  const mime = String(item?.mimeType || '');
  return mime.startsWith('image/') || mime === 'application/pdf';
}

function attachmentKind(item) {
  const mime = String(item?.mimeType || '');
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size || 0,
      dataUrl: String(reader.result || ''),
    });
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function attachmentSignature(item) {
  return [
    item?.fileName || item?.name || '',
    item?.mimeType || item?.type || '',
    item?.sizeBytes || item?.size || 0,
  ].join('::');
}

function uniqueFiles(files) {
  const seen = new Set();
  return Array.from(files || []).filter((file) => {
    const key = attachmentSignature(file);
    if (!file || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filesFromClipboard(event) {
  const clipboard = event?.clipboardData;
  const directFiles = Array.from(clipboard?.files || []);
  const itemFiles = Array.from(clipboard?.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter(Boolean);

  return uniqueFiles([...directFiles, ...itemFiles]);
}


export default function AnalysisTab({ clientId, type, canEdit = false }) {
  const { showToast } = useToast();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [savingIds, setSavingIds] = useState(new Set());
  const [uploadingIds, setUploadingIds] = useState(new Set());
  const [deletingAttachmentIds, setDeletingAttachmentIds] = useState(new Set());
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewZoomOrigin, setPreviewZoomOrigin] = useState('50% 50%');
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [attachmentDeleteTarget, setAttachmentDeleteTarget] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [actionPlanOpen, setActionPlanOpen] = useState(false);
  const [selectedActionPlanId, setSelectedActionPlanId] = useState('');

  const timersRef = useRef(new Map());
  const fetchIdRef = useRef(0);

  const meta = ANALYSIS_META[type] || ANALYSIS_META.icp;
  const isIcpAnalysis = type === 'icp';
  const requestKey = clientId ? `${clientId}:${type}` : '';
  const isStaleRender = Boolean(requestKey && loadedKey !== requestKey);
  const actionPlanEntries = isIcpAnalysis ? entries.filter((entry) => parseActionPlan(entry.text)) : [];
  const selectedActionPlanEntry = actionPlanEntries.find((entry) => entry.id === selectedActionPlanId) || actionPlanEntries[0] || null;
  const selectedActionPlan = selectedActionPlanEntry ? parseActionPlan(selectedActionPlanEntry.text) : null;

  useEffect(() => {
    setPreviewZoom(1);
    setPreviewZoomOrigin('50% 50%');
  }, [previewAttachment?.id]);

  // PDFs são exibidos via iframe. data: URLs grandes (PDFs com imagens/scans)
  // estouram o limite de tamanho de URL do navegador e renderizam em branco.
  // Convertemos para Blob URL, que não tem esse limite, e revogamos depois.
  useEffect(() => {
    if (previewAttachment?.mimeType !== 'application/pdf' || !previewAttachment?.dataUrl) {
      setPdfBlobUrl('');
      return undefined;
    }

    let url = '';
    try {
      const [meta, base64 = ''] = String(previewAttachment.dataUrl).split(',');
      const isBase64 = /;base64/i.test(meta);
      const binary = isBase64 ? atob(base64) : decodeURIComponent(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPdfBlobUrl(url);
    } catch {
      // Em caso de falha na decodificação, cai de volta para o dataUrl original.
      setPdfBlobUrl('');
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewAttachment?.id, previewAttachment?.mimeType, previewAttachment?.dataUrl]);

  useEffect(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    setExpandedEntry(null);
    setActionPlanOpen(false);
    setPreviewAttachment(null);
    setDeleteTarget(null);
    setAttachmentDeleteTarget(null);
    setSelectedActionPlanId('');

    if (!clientId) {
      setEntries([]);
      setLoadedKey('');
      setLoading(false);
      return undefined;
    }

    const fetchId = ++fetchIdRef.current;
    const nextKey = `${clientId}:${type}`;
    setLoading(true);
    setEntries([]);
    setLoadedKey('');

    listAnalyses(clientId, type)
      .then((response) => {
        if (fetchIdRef.current !== fetchId) return;
        setEntries(Array.isArray(response?.analyses) ? response.analyses : []);
        setLoadedKey(nextKey);
      })
      .catch((error) => {
        if (fetchIdRef.current !== fetchId) return;
        setEntries([]);
        setLoadedKey(nextKey);
        const message = error instanceof ApiError ? error.message : 'Erro ao carregar registros.';
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

  const markUploading = (id, enabled) =>
    setUploadingIds((previous) => {
      const next = new Set(previous);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });

  const markDeletingAttachment = (id, enabled) =>
    setDeletingAttachmentIds((previous) => {
      const next = new Set(previous);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });

  function updateEntryAttachments(entryId, updater) {
    setEntries((previous) => previous.map((entry) => {
      if (entry.id !== entryId) return entry;
      const current = Array.isArray(entry.attachments) ? entry.attachments : [];
      return { ...entry, attachments: updater(current) };
    }));
  }

  async function handleAttachmentFiles(entryId, files) {
    const selected = uniqueFiles(files).filter(Boolean);
    if (!entryId || selected.length === 0) return;

    const validFiles = selected.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (validFiles.length !== selected.length) {
      showToast('Use apenas imagens ou PDF.', { variant: 'error' });
    }
    if (validFiles.length === 0) return;

    markUploading(entryId, true);
    try {
      const parsed = await Promise.all(validFiles.slice(0, 6).map(readAttachmentFile));
      const uploaded = await Promise.all(parsed.map((item) => createAnalysisAttachment(clientId, type, entryId, item)));
      const attachments = uploaded.map((response) => response?.attachment).filter(Boolean);
      if (attachments.length) {
        updateEntryAttachments(entryId, (current) => [...current, ...attachments]);
      }
      showToast('Anexo adicionado.', { variant: 'success' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error?.message || 'Erro ao anexar arquivo.';
      showToast(message, { variant: 'error' });
    } finally {
      markUploading(entryId, false);
    }
  }

  function handleEntryPaste(entryId, event) {
    if (!canEdit || !entryId) return;
    const files = filesFromClipboard(event);
    if (files.length === 0) return;
    event.preventDefault();
    handleAttachmentFiles(entryId, files);
  }

  async function handleRemoveAttachment(entryId, attachment) {
    if (!entryId || !attachment?.id) return;
    setAttachmentDeleteTarget({ entryId, attachment });
  }

  async function confirmRemoveAttachment() {
    const target = attachmentDeleteTarget;
    const attachment = target?.attachment;
    const entryId = target?.entryId;
    if (!entryId || !attachment?.id) return;

    setAttachmentDeleteTarget(null);
    markDeletingAttachment(attachment.id, true);
    try {
      await deleteAnalysisAttachment(clientId, type, entryId, attachment.id);
      updateEntryAttachments(entryId, (current) => current.filter((item) => item.id !== attachment.id));
      if (previewAttachment?.id === attachment.id) setPreviewAttachment(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Erro ao remover anexo.';
      showToast(message, { variant: 'error' });
    } finally {
      markDeletingAttachment(attachment.id, false);
    }
  }

  async function handleCreate() {
    if (creating || !clientId) return;
    setCreating(true);
    try {
      const response = await createAnalysis(clientId, type, {
        date: todayISO(),
        text: '',
      });
      const entry = response?.analysis;
      if (entry) setEntries((previous) => [entry, ...previous]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Erro ao criar registro.';
      showToast(message, { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }


  function openActionPlans() {
    if (actionPlanEntries[0]?.id) setSelectedActionPlanId(actionPlanEntries[0].id);
    setActionPlanOpen(true);
  }

  async function handleCreateActionPlan() {
    if (creating || !clientId || !canEdit) return;
    setCreating(true);
    try {
      const response = await createAnalysis(clientId, type, {
        date: todayISO(),
        text: serializeActionPlan(createEmptyActionPlan()),
      });
      const entry = response?.analysis;
      if (entry) {
        setEntries((previous) => [entry, ...previous]);
        setSelectedActionPlanId(entry.id);
        setActionPlanOpen(true);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Erro ao criar plano de ação.';
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
      const message = error instanceof ApiError ? error.message : 'Erro ao salvar registro.';
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


  function updateActionPlan(entryId, updater) {
    const target = entries.find((entry) => entry.id === entryId);
    if (!target) return;
    const current = parseActionPlan(target.text) || createEmptyActionPlan();
    const next = normalizeActionPlan(typeof updater === 'function' ? updater(current) : updater);
    const text = serializeActionPlan(next);
    setEntries((previous) => previous.map((entry) => (entry.id === entryId ? { ...entry, text } : entry)));
    scheduleCommit(entryId, { text });
  }

  function updateSelectedActionPlan(updater) {
    if (!selectedActionPlanEntry?.id) return;
    updateActionPlan(selectedActionPlanEntry.id, updater);
  }

  function updateActionPlanDate(entryId, value) {
    setEntries((previous) => previous.map((entry) => (entry.id === entryId ? { ...entry, date: value } : entry)));
    commitPatch(entryId, { date: value });
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target?.id) return;

    const previous = entries;
    setDeleteTarget(null);
    setEntries((list) => list.filter((entry) => entry.id !== target.id));
    try {
      await deleteAnalysis(clientId, type, target.id);
      showToast('Registro removido.', { variant: 'success' });
    } catch (error) {
      setEntries(previous);
      const message = error instanceof ApiError ? error.message : 'Erro ao remover registro.';
      showToast(message, { variant: 'error' });
    }
  }

  if (loading || isStaleRender) {
    return (
      <div key={requestKey || 'analysis-loading'} className={`${styles.panel} ${meta.className}`.trim()}>
        <div className={styles.loadingShell} role="status" aria-live="polite">
          <div className={styles.analysisLoading}>
            <div className={styles.loadingHeader}>
              <span />
              <span />
            </div>
            <div className={styles.loadingRows}>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={requestKey || 'analysis-panel'} className={`${styles.panel} ${meta.className}`.trim()}>
      <div className={styles.header}>
        <div className={styles.headerActions}>
          {isIcpAnalysis ? (
            <button
              type="button"
              className={styles.actionPlanButton}
              onClick={openActionPlans}
            >
              <span>Planos de ação</span>
              <strong>{actionPlanEntries.length}</strong>
            </button>
          ) : null}

          <button
            type="button"
            className={styles.addBtn}
            onClick={handleCreate}
            disabled={creating || !canEdit}
          >
            {creating ? 'Criando…' : meta.createLabel}
          </button>
        </div>

        <div className={styles.headerMeta}>
          <div className={styles.heroMetric}>
            <strong>{entries.length}</strong>
            <span>registros</span>
          </div>
          <div className={styles.heroMetric}>
            <strong>{formatDateBR(entries[0]?.date)}</strong>
            <span>última data</span>
          </div>
          <div className={styles.heroMetric}>
            <strong>{entries.filter((entry) => String(entry.text || '').trim()).length}</strong>
            <span>preenchidos</span>
          </div>
        </div>
      </div>

      {entries.length > 0 ? (
        entries.map((entry) => {
          const isPending = pendingIds.has(entry.id);
          const isSaving = savingIds.has(entry.id);
          const entryActionPlan = isIcpAnalysis ? parseActionPlan(entry.text) : null;
          return (
            <div key={entry.id} className={styles.entry} onPasteCapture={(event) => handleEntryPaste(entry.id, event)}>
              <div className={styles.entryHdr}>
                <label className={styles.dateControl}>
                  <span>Data</span>
                  <DateField
                    value={entry.date || ''}
                    onChange={(value) => onDateChange(entry.id, value)}
                    disabled={!canEdit}
                    ariaLabel={`Data do registro de ${meta.title}`}
                    className={styles.dateField}
                  />
                </label>

                <span className={styles.entryAuthor}>{analysisAuthor(entry)}</span>

                <div className={styles.entryActions}>
                  {canEdit ? (
                    <label className={styles.attachButton}>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        disabled={uploadingIds.has(entry.id)}
                        onChange={(event) => {
                          handleAttachmentFiles(entry.id, event.target.files);
                          event.target.value = '';
                        }}
                      />
                      {uploadingIds.has(entry.id) ? 'Anexando…' : 'Anexar imagem ou PDF'}
                    </label>
                  ) : null}

                  <button
                    type="button"
                    className={styles.delBtn}
                    onClick={() => setDeleteTarget(entry)}
                    disabled={!canEdit}
                  >
                    Remover
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={`${styles.analysisPreview} ${entryActionPlan ? styles.analysisPreviewPlan : ''} ${String(entry.text || '').trim() ? '' : styles.analysisPreviewEmpty}`.trim()}
                onClick={() => {
                  if (entryActionPlan) {
                    setSelectedActionPlanId(entry.id);
                    setActionPlanOpen(true);
                    return;
                  }
                  setExpandedEntry(entry);
                }}
                onPaste={(event) => handleEntryPaste(entry.id, event)}
              >
                {entryActionPlan ? <em>Plano de ação</em> : null}
                <span>{entryActionPlan ? actionPlanPreviewText(entryActionPlan) : String(entry.text || '').trim() || 'Sem registro'}</span>
              </button>

              <div className={styles.attachmentsArea}>
                <div className={styles.attachmentsHead}>
                  <span>Anexos</span>
                  <div className={styles.attachmentsHeadActions}>
                    <strong>{(entry.attachments || []).length}</strong>
                  </div>
                </div>

                {(entry.attachments || []).length ? (
                  <div className={styles.attachmentsGrid}>
                    {(entry.attachments || []).map((attachment) => {
                      const isPdf = attachment.mimeType === 'application/pdf';
                      const isDeleting = deletingAttachmentIds.has(attachment.id);
                      return (
                        <article key={attachment.id} className={styles.attachmentCard}>
                          <button
                            type="button"
                            className={styles.attachmentPreview}
                            onClick={() => isPreviewableAttachment(attachment) && setPreviewAttachment({ ...attachment, entryId: entry.id })}
                            disabled={!isPreviewableAttachment(attachment)}
                            aria-label={`Visualizar ${attachment.fileName}`}
                          >
                            {isPdf ? (
                              <span className={styles.pdfMark}>PDF</span>
                            ) : (
                              <img src={attachment.dataUrl} alt="" />
                            )}
                          </button>
                          <div className={styles.attachmentInfo}>
                            <strong title={attachment.fileName}>{attachment.fileName}</strong>
                            <span>{attachmentKind(attachment)} · {formatBytes(attachment.sizeBytes)}</span>
                          </div>
                          <div className={styles.attachmentActions}>
                            <button type="button" onClick={() => setPreviewAttachment({ ...attachment, entryId: entry.id })}>
                              Visualizar
                            </button>
                            <a href={attachment.dataUrl} download={attachment.fileName || 'anexo'}>
                              Baixar
                            </a>
                            {canEdit ? (
                              <button
                                type="button"
                                className={styles.attachmentRemove}
                                onClick={() => handleRemoveAttachment(entry.id, attachment)}
                                disabled={isDeleting}
                                aria-label={isDeleting ? 'Removendo anexo' : 'Remover anexo'}
                                title={isDeleting ? 'Removendo…' : 'Remover'}
                              >
                                <TrashIcon size={13} aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.attachmentsEmpty}>Nenhum anexo</div>
                )}

              </div>

              {(isPending || isSaving) && (
                <div className={`${styles.savingHint} ${isPending && !isSaving ? styles.pending : ''}`.trim()}>
                  {isSaving ? 'Salvando…' : 'Alterações pendentes…'}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className={styles.analysisEmptyState}>
          <div>
            <strong>{meta.emptyTitle}</strong>
            <span>{meta.emptyDescription}</span>
          </div>
          {canEdit ? (
            <button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? 'Criando…' : meta.createLabel}
            </button>
          ) : null}
        </div>
      )}

      {actionPlanOpen && isIcpAnalysis && typeof document !== 'undefined' ? createPortal(
        <div className={styles.actionPlanOverlay} role="presentation" onClick={() => setActionPlanOpen(false)}>
          <section
            className={styles.actionPlanModal}
            role="dialog"
            aria-modal="true"
            aria-label="Planos de ação da Análise ICP"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.actionPlanHeader}>
              <div>
                <strong>Planos de ação</strong>
                <p>Objetivo, ações, prazo e evidências vinculados ao histórico deste cliente.</p>
              </div>
              <div className={styles.actionPlanHeaderActions}>
                {canEdit ? (
                  <button type="button" className={styles.actionPlanPrimary} onClick={handleCreateActionPlan} disabled={creating}>
                    {creating ? 'Criando…' : '+ Novo plano'}
                  </button>
                ) : null}
                <button type="button" className={styles.actionPlanClose} onClick={() => setActionPlanOpen(false)}>
                  Fechar
                </button>
              </div>
            </header>

            <div className={styles.actionPlanBody}>
              <aside className={styles.actionPlanHistory}>
                <div className={styles.actionPlanSectionTitle}>
                  <span>Histórico</span>
                  <strong>{actionPlanEntries.length}</strong>
                </div>
                {actionPlanEntries.length ? (
                  <div className={styles.actionPlanHistoryList}>
                    {actionPlanEntries.map((entry, index) => {
                      const plan = parseActionPlan(entry.text) || createEmptyActionPlan();
                      const { done, total: actionTotal } = getActionCompletion(plan.actions);
                      return (
                        <button
                          type="button"
                          key={entry.id}
                          className={`${styles.actionPlanHistoryItem} ${selectedActionPlanEntry?.id === entry.id ? styles.actionPlanHistoryItemActive : ''}`.trim()}
                          onClick={() => setSelectedActionPlanId(entry.id)}
                        >
                          <span>{actionPlanNumber(index, actionPlanEntries.length)}</span>
                          <strong>{formatDateBR(entry.date)}</strong>
                          <small>{actionTotal ? `${done}/${actionTotal} ações` : 'Nenhuma ação'} · {plan.deadline ? `prazo ${formatDateBR(plan.deadline)}` : 'sem prazo'}</small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.actionPlanEmpty}>
                    <strong>Nenhum plano registrado</strong>
                    <span>Crie um plano para acompanhar ações, datas e evidências da Análise ICP.</span>
                    {canEdit ? (
                      <button type="button" onClick={handleCreateActionPlan} disabled={creating}>
                        Criar primeiro plano
                      </button>
                    ) : null}
                  </div>
                )}
              </aside>

              <main className={styles.actionPlanWorkspace}>
                {selectedActionPlanEntry && selectedActionPlan ? (
                  <>
                    <div className={styles.actionPlanMetaRow}>
                      <label className={styles.actionPlanDateField}>
                        <span>Data do plano</span>
                        <DateField
                          value={selectedActionPlanEntry.date || ''}
                          onChange={(value) => updateActionPlanDate(selectedActionPlanEntry.id, value)}
                          disabled={!canEdit}
                          ariaLabel="Data do plano de ação"
                          className={styles.actionPlanDateInput}
                        />
                      </label>
                      <label className={styles.actionPlanDateField}>
                        <span>Prazo</span>
                        <DateField
                          value={selectedActionPlan.deadline || ''}
                          onChange={(value) => updateSelectedActionPlan((plan) => ({ ...plan, deadline: value }))}
                          disabled={!canEdit}
                          ariaLabel="Prazo do plano de ação"
                          className={styles.actionPlanDateInput}
                        />
                      </label>
                    </div>

                    <label className={styles.actionPlanObjective}>
                      <span>Objetivo</span>
                      <textarea
                        value={selectedActionPlan.objective || ''}
                        disabled={!canEdit}
                        placeholder="Ex.: Reduzir tempo de resposta."
                        rows={4}
                        onChange={(event) => updateSelectedActionPlan((plan) => ({ ...plan, objective: event.target.value }))}
                      />
                    </label>

                    <section className={styles.actionPlanActionsBlock}>
                      <div className={styles.actionPlanBlockHead}>
                        <div>
                          <span>Ações</span>
                          {(() => {
                            const { done, total } = getActionCompletion(selectedActionPlan.actions);
                            return <strong>{done}/{total}</strong>;
                          })()}
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => updateSelectedActionPlan((plan) => ({
                              ...plan,
                              actions: [...plan.actions, { id: makeLocalId('acao'), text: '', done: false }],
                            }))}
                          >
                            + Adicionar ação
                          </button>
                        ) : null}
                      </div>

                      {selectedActionPlan.actions.length ? (
                        <div className={styles.actionPlanActionList}>
                          {selectedActionPlan.actions.map((action) => (
                            <div
                              key={action.id}
                              className={`${styles.actionPlanActionRow} ${String(action.text || '').trim() ? '' : styles.actionPlanActionRowEmpty}`.trim()}
                            >
                              <label
                                className={styles.actionPlanCheck}
                                title={action.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                                aria-label={action.done ? 'Marcar ação como pendente' : 'Marcar ação como concluída'}
                              >
                                <input
                                  type="checkbox"
                                  checked={action.done}
                                  disabled={!canEdit}
                                  onChange={(event) => updateSelectedActionPlan((plan) => ({
                                    ...plan,
                                    actions: plan.actions.map((item) => (
                                      item.id === action.id ? { ...item, done: event.target.checked } : item
                                    )),
                                  }))}
                                />
                                <span aria-hidden="true" />
                              </label>
                              <input
                                type="text"
                                className={styles.actionPlanActionInput}
                                value={action.text}
                                disabled={!canEdit}
                                placeholder="Descrever ação"
                                onChange={(event) => updateSelectedActionPlan((plan) => ({
                                  ...plan,
                                  actions: plan.actions.map((item) => (
                                    item.id === action.id ? { ...item, text: event.target.value } : item
                                  )),
                                }))}
                              />
                              {canEdit ? (
                                <button
                                  type="button"
                                  className={styles.actionPlanRemoveAction}
                                  onClick={() => updateSelectedActionPlan((plan) => ({
                                    ...plan,
                                    actions: plan.actions.filter((item) => item.id !== action.id),
                                  }))}
                                >
                                  Remover
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.actionPlanActionsEmpty}>
                          <span className={styles.actionPlanActionsEmptyIcon} aria-hidden="true" />
                          <strong>Nenhuma ação definida</strong>
                          <span>Adicione uma ação para liberar o marcador redondo de conclusão.</span>
                        </div>
                      )}
                    </section>

                    <section className={styles.actionPlanEvidence}>
                      <div className={styles.actionPlanBlockHead}>
                        <div>
                          <span>Evidências</span>
                          <strong>{(selectedActionPlanEntry.attachments || []).length}</strong>
                        </div>
                        {canEdit ? (
                          <div className={styles.actionPlanEvidenceActions}>
                            <label>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                disabled={uploadingIds.has(selectedActionPlanEntry.id)}
                                onChange={(event) => {
                                  handleAttachmentFiles(selectedActionPlanEntry.id, event.target.files);
                                  event.target.value = '';
                                }}
                              />
                              {uploadingIds.has(selectedActionPlanEntry.id) ? 'Anexando…' : 'Anexar imagem ou PDF'}
                            </label>
                          </div>
                        ) : null}
                      </div>

                      {(selectedActionPlanEntry.attachments || []).length ? (
                        <div className={styles.actionPlanEvidenceGrid}>
                          {(selectedActionPlanEntry.attachments || []).map((attachment) => {
                            const isPdf = attachment.mimeType === 'application/pdf';
                            const isDeleting = deletingAttachmentIds.has(attachment.id);
                            return (
                              <article key={attachment.id} className={styles.actionPlanEvidenceCard}>
                                <button
                                  type="button"
                                  className={styles.actionPlanEvidenceThumb}
                                  onClick={() => isPreviewableAttachment(attachment) && setPreviewAttachment({ ...attachment, entryId: selectedActionPlanEntry.id })}
                                  disabled={!isPreviewableAttachment(attachment)}
                                  aria-label={`Visualizar ${attachment.fileName}`}
                                >
                                  {isPdf ? <span>PDF</span> : <img src={attachment.dataUrl} alt="" />}
                                </button>
                                <div className={styles.actionPlanEvidenceInfo}>
                                  <strong title={attachment.fileName}>{attachment.fileName}</strong>
                                  <small>{attachmentKind(attachment)} · {formatBytes(attachment.sizeBytes)}</small>
                                </div>
                                <div className={styles.actionPlanEvidenceControls}>
                                  <button
                                    type="button"
                                    className={styles.actionPlanEvidenceControl}
                                    onClick={() => isPreviewableAttachment(attachment) && setPreviewAttachment({ ...attachment, entryId: selectedActionPlanEntry.id })}
                                    disabled={!isPreviewableAttachment(attachment)}
                                  >
                                    Visualizar
                                  </button>
                                  <a
                                    className={styles.actionPlanEvidenceControl}
                                    href={attachment.dataUrl}
                                    download={attachment.fileName || 'anexo'}
                                  >
                                    Baixar
                                  </a>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      className={`${styles.actionPlanEvidenceControl} ${styles.actionPlanRemoveEvidence}`.trim()}
                                      onClick={() => handleRemoveAttachment(selectedActionPlanEntry.id, attachment)}
                                      disabled={isDeleting}
                                    >
                                      {isDeleting ? 'Removendo…' : 'Remover'}
                                    </button>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.actionPlanEvidenceEmpty}>Nenhuma evidência anexada.</div>
                      )}
                    </section>
                  </>
                ) : (
                  <div className={styles.actionPlanWorkspaceEmpty}>
                    <strong>Selecione ou crie um plano</strong>
                    <span>Os planos de ação ficam vinculados à Análise ICP e podem receber imagens ou PDFs.</span>
                  </div>
                )}
              </main>
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      {expandedEntry ? (
        <div className={styles.entryViewerOverlay} role="presentation" onClick={() => setExpandedEntry(null)}>
          <section
            className={styles.entryViewer}
            role="dialog"
            aria-modal="true"
            aria-label={`${meta.title} maximizada`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.entryViewerHeader}>
              <div>
                <strong>{meta.title}</strong>
                <span>{formatDateBR(expandedEntry.date)} · {analysisAuthor(expandedEntry)}</span>
              </div>
              <button type="button" onClick={() => setExpandedEntry(null)}>Fechar</button>
            </header>
            <textarea
              className={styles.entryViewerText}
              rows={expandedTextRows(expandedEntry.text)}
              value={expandedEntry.text || ''}
              disabled={!canEdit}
              placeholder="Sem registro"
              onChange={(event) => {
                const value = event.target.value;
                setExpandedEntry((current) => (current ? { ...current, text: value } : current));
                onTextChange(expandedEntry.id, value);
              }}
            />
          </section>
        </div>
      ) : null}

      {previewAttachment && typeof document !== 'undefined' ? createPortal(
        <div className={styles.viewerOverlay} role="presentation" onClick={() => setPreviewAttachment(null)}>
          <section
            className={styles.viewer}
            role="dialog"
            aria-modal="true"
            aria-label={`Visualização de ${previewAttachment.fileName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>{previewAttachment.fileName}</strong>
                <span>{attachmentKind(previewAttachment)} · {formatBytes(previewAttachment.sizeBytes)}</span>
              </div>
              <div>
                <a href={previewAttachment.dataUrl} download={previewAttachment.fileName || 'anexo'}>
                  Baixar
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAttachmentDeleteTarget({ entryId: previewAttachment.entryId, attachment: previewAttachment })}
                    title="Excluir anexo"
                  >
                    <TrashIcon size={14} />
                  </button>
                ) : null}
                <button type="button" onClick={() => setPreviewAttachment(null)}>Fechar</button>
              </div>
            </header>
            <div
              className={styles.viewerBody}
              onWheelCapture={(event) => {
                if (previewAttachment.mimeType === 'application/pdf') return;
                event.preventDefault();
                event.stopPropagation();

                const direction = event.deltaY > 0 ? -0.12 : 0.12;
                const nextZoom = Math.min(3, Math.max(1, Number((previewZoom + direction).toFixed(2))));

                if (nextZoom <= 1) {
                  setPreviewZoom(1);
                  setPreviewZoomOrigin('50% 50%');
                  return;
                }

                const rect = event.currentTarget.getBoundingClientRect();
                const originX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
                const originY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
                setPreviewZoomOrigin(`${originX.toFixed(2)}% ${originY.toFixed(2)}%`);
                setPreviewZoom(nextZoom);
              }}
            >
              {previewAttachment.mimeType === 'application/pdf' ? (
                <iframe title={previewAttachment.fileName} src={pdfBlobUrl || previewAttachment.dataUrl} />
              ) : (
                <img src={previewAttachment.dataUrl} alt="" style={{ transform: `scale(${previewZoom})`, transformOrigin: previewZoomOrigin }} />
              )}
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      {attachmentDeleteTarget ? (
        <div className={styles.confirmOverlay} role="presentation" onClick={() => setAttachmentDeleteTarget(null)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Remover anexo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmHead}>
              <span>Remover anexo</span>
              <strong>{attachmentDeleteTarget.attachment?.fileName || 'Anexo'}</strong>
            </div>
            <p>Este arquivo será removido deste registro.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setAttachmentDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className={styles.confirmDeleteBtn} onClick={confirmRemoveAttachment}>
                Remover
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className={styles.confirmOverlay} role="presentation" onClick={() => setDeleteTarget(null)}>
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-label={`Remover registro de ${meta.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmHead}>
              <span>{meta.deleteEyebrow}</span>
              <strong>{meta.deleteTitle}</strong>
            </div>
            <p>{meta.deleteDescription}</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className={styles.confirmDeleteBtn} onClick={confirmDelete}>
                Remover
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
