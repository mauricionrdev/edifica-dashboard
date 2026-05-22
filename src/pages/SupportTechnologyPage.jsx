import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import DateField from '../components/ui/DateField.jsx';
import Select from '../components/ui/Select.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { createTaskAttachment } from '../api/projects.js';
import {
  createSupportDailyRow,
  createSupportTask,
  deleteSupportDailyRow,
  listSupportDailyRows,
  listSupportTasks,
  updateSupportDailyRow,
} from '../api/support.js';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../components/ui/Icons.jsx';
import pageStyles from './SupportTechnologyPage.module.css';
import modalStyles from './ProfilePage.module.css';

const DAILY_COLUMNS = [
  { key: 'clientName', label: 'Cliente / Escritório', type: 'text', min: 260 },
  { key: 'implementationStatus', label: 'Implementação', type: 'select', options: ['Implementado com sucesso.', 'Em implementação', 'Pendente', 'Ajustar'] },
  { key: 'niche', label: 'Nicho / Campanha', type: 'text' },
  { key: 'promptStatus', label: 'Prompt', type: 'select', options: ['Prompt OK', 'Sem/Prompt', 'Revisar', 'Pendente'] },
  { key: 'connectionStatus', label: 'Conexão', type: 'select', options: ['Conectado', 'Desconectado', 'Desconectado (GDV)', 'Pendente'] },
  { key: 'accessStatus', label: 'Acessos', type: 'select', options: ['Acesso OK', 'Acessos OK', 'Sem/Acesso', 'Pendente'] },
  { key: 'activityStatus', label: 'Status', type: 'select', options: ['Ativo', 'INATIVO', 'Pausado'] },
  { key: 'apiKey', label: 'API Key', type: 'text', min: 220 },
  { key: 'notes', label: 'Observações', type: 'text', min: 220 },
];

const PRIORITIES = [
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
  { value: 'low', label: 'Baixa' },
];

const SUPPORT_ROLES = new Set(['suporte_tecnologia', 'ceo', 'admin']);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(value = '') {
  const normalized = String(value).toLowerCase();
  if (normalized.includes('desconect') || normalized.includes('sem/') || normalized.includes('inativo')) return 'danger';
  if (normalized.includes('pendente') || normalized.includes('revisar') || normalized.includes('ajustar')) return 'warning';
  if (normalized.includes('ok') || normalized.includes('conectado') || normalized.includes('ativo') || normalized.includes('sucesso')) return 'success';
  return 'neutral';
}

function normalizeRow(row) {
  return DAILY_COLUMNS.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {
    id: row?.id || '',
    position: Number(row?.position || 0),
  });
}

function emptyDemandDraft(assigneeUserId = '') {
  return {
    title: '',
    priority: 'medium',
    clientId: '',
    assigneeUserId,
    dueDate: todayIso(),
    description: '',
    collaboratorUserIds: [],
    attachments: [],
  };
}

function fileSignature(file) {
  return [file?.name || '', file?.size || 0, file?.lastModified || 0].join(':');
}

function attachmentSignature(item) {
  return [item?.fileName || '', item?.sizeBytes || 0, item?.mimeType || ''].join(':');
}

function readAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Arquivo inválido.'));
      return;
    }
    if (!file.type?.startsWith('image/') && file.type !== 'application/pdf') {
      reject(new Error('Envie imagem ou PDF.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size || 0,
      dataUrl: reader.result,
    });
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function uniqueFiles(files = []) {
  const seen = new Set();
  return Array.from(files).filter((file) => {
    const key = fileSignature(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filesFromClipboard(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  return items.map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
}

function formatAttachmentKind(item) {
  if (item?.mimeType === 'application/pdf') return 'PDF';
  if (item?.mimeType?.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function SupportCell({ row, column, editable, saving, onChange, onCommit }) {
  const value = row[column.key] || '';
  const commonProps = {
    disabled: !editable || saving,
    value,
    onChange: (event) => onChange(row.id, column.key, event.target.value),
    onBlur: () => onCommit(row.id, column.key),
    onKeyDown: (event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') event.currentTarget.blur();
    },
  };

  if (!editable) {
    return <span className={pageStyles.readonlyCell} data-tone={statusTone(value)}>{value || '—'}</span>;
  }

  if (column.type === 'select') {
    return (
      <select className={pageStyles.sheetSelect} {...commonProps}>
        <option value="">—</option>
        {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  return <input className={pageStyles.sheetInput} type="text" {...commonProps} />;
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clients = [], userDirectory = [], setPanelHeader } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [savingCell, setSavingCell] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyDemandDraft(''));
  const attachmentInputRef = useRef(null);

  const canEditBoard = hasPermission(user, 'support.board.edit');
  const supportUsers = useMemo(() => {
    const activeUsers = (Array.isArray(userDirectory) ? userDirectory : []).filter((item) => item?.id && item?.active !== false);
    const preferred = activeUsers.filter((item) => SUPPORT_ROLES.has(item.role));
    return preferred.length ? preferred : activeUsers;
  }, [userDirectory]);

  const selectedCollaborators = useMemo(() => {
    const ids = new Set(draft.collaboratorUserIds || []);
    return (Array.isArray(userDirectory) ? userDirectory : []).filter((item) => ids.has(item.id));
  }, [draft.collaboratorUserIds, userDirectory]);

  const collaboratorOptions = useMemo(() => {
    const selected = new Set([draft.assigneeUserId, ...(draft.collaboratorUserIds || [])].filter(Boolean));
    return (Array.isArray(userDirectory) ? userDirectory : [])
      .filter((item) => item?.id && item?.active !== false && !selected.has(item.id));
  }, [draft.assigneeUserId, draft.collaboratorUserIds, userDirectory]);

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    if (!supportUsers.length) return;
    setDraft((current) => current.assigneeUserId ? current : { ...current, assigneeUserId: supportUsers[0].id });
  }, [supportUsers]);

  const refreshRows = useCallback(async () => {
    setRowsLoading(true);
    try {
      const data = await listSupportDailyRows();
      setRows((Array.isArray(data?.rows) ? data.rows : []).map(normalizeRow));
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    const data = await listSupportTasks();
    setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
  }, []);

  useEffect(() => {
    refreshRows().catch(() => showToast?.({ type: 'error', message: 'Não foi possível carregar a programação diária.' }));
    refreshTasks().catch(() => showToast?.({ type: 'error', message: 'Não foi possível carregar as demandas de suporte.' }));
  }, [refreshRows, refreshTasks, showToast]);

  useEffect(() => {
    if (!demandModalOpen) return undefined;
    function handlePaste(event) {
      const files = filesFromClipboard(event);
      if (!files.length) return;
      event.preventDefault();
      addDemandAttachments(files);
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [demandModalOpen]);

  const metrics = useMemo(() => {
    const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled');
    const riskRows = rows.filter((row) => ['connectionStatus', 'accessStatus', 'promptStatus'].some((key) => statusTone(row[key]) === 'danger'));
    return {
      rows: rows.length,
      openTasks: openTasks.length,
      risks: riskRows.length,
      implemented: rows.filter((row) => statusTone(row.implementationStatus) === 'success').length,
    };
  }, [rows, tasks]);

  function openDemandModal() {
    const assigneeUserId = supportUsers[0]?.id || user?.id || '';
    setDraft(emptyDemandDraft(assigneeUserId));
    setDemandModalOpen(true);
  }

  function closeDemandModal() {
    if (creatingTask) return;
    setDemandModalOpen(false);
  }

  async function addDemandAttachments(files) {
    const selected = uniqueFiles(files).filter(Boolean);
    if (!selected.length) return;
    try {
      const parsed = await Promise.all(selected.map(readAttachmentFile));
      setDraft((current) => {
        const existing = Array.isArray(current.attachments) ? current.attachments : [];
        const seen = new Set(existing.map(attachmentSignature));
        const next = parsed.filter((item) => {
          const key = attachmentSignature(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { ...current, attachments: [...existing, ...next].slice(0, 8) };
      });
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível anexar o arquivo.' });
    }
  }

  function handleDemandAttachmentFiles(event) {
    const files = Array.from(event.target.files || []);
    if (files.length) addDemandAttachments(files);
    if (event.target) event.target.value = '';
  }

  function handleRemoveAttachment(id) {
    setDraft((current) => ({ ...current, attachments: (current.attachments || []).filter((item) => item.id !== id) }));
  }

  const handleCreateTask = async (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      showToast?.({ type: 'warning', message: 'Informe o título da demanda.' });
      return;
    }
    setCreatingTask(true);
    try {
      const data = await createSupportTask({
        title,
        priority: draft.priority,
        clientId: draft.clientId,
        assigneeUserId: draft.assigneeUserId,
        collaboratorUserIds: draft.collaboratorUserIds,
        dueDate: draft.dueDate,
        description: draft.description,
      });
      const taskId = data?.task?.id;
      if (taskId && draft.attachments?.length) {
        await Promise.allSettled(draft.attachments.map((item) => createTaskAttachment(taskId, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })));
      }
      setDraft(emptyDemandDraft(supportUsers[0]?.id || user?.id || ''));
      setDemandModalOpen(false);
      await refreshTasks();
      showToast?.({ type: 'success', message: 'Demanda criada.' });
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível criar a demanda.' });
    } finally {
      setCreatingTask(false);
    }
  };

  const handleAddRow = async () => {
    setCreatingRow(true);
    try {
      const data = await createSupportDailyRow({
        implementationStatus: 'Implementado com sucesso.',
        promptStatus: 'Prompt OK',
        connectionStatus: 'Conectado',
        accessStatus: 'Acesso OK',
        activityStatus: 'Ativo',
      });
      setRows((current) => [...current, normalizeRow(data?.row)]);
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível adicionar linha.' });
    } finally {
      setCreatingRow(false);
    }
  };

  const handleDeleteRow = async (id) => {
    if (!id) return;
    await deleteSupportDailyRow(id);
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const handleCellChange = (id, key, value) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  const handleCellCommit = async (id, key) => {
    const row = rows.find((entry) => entry.id === id);
    if (!row) return;
    const savingKey = `${id}:${key}`;
    setSavingCell(savingKey);
    try {
      const data = await updateSupportDailyRow(id, { [key]: row[key] || '' });
      if (data?.row) {
        setRows((current) => current.map((entry) => (entry.id === id ? normalizeRow(data.row) : entry)));
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível salvar a célula.' });
      refreshRows().catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  return (
    <div className={pageStyles.page}>
      <section className={pageStyles.hero}>
        <div>
          <span className={pageStyles.eyebrow}>Operação de suporte</span>
          <h1>Suporte de tecnologia</h1>
        </div>
        <div className={pageStyles.heroActions}>
          <Button type="button" size="sm" onClick={openDemandModal}>
            <PlusIcon size={14} /> Nova demanda
          </Button>
          <div className={pageStyles.heroIcon}><BotIcon size={20} /></div>
        </div>
      </section>

      <section className={pageStyles.kpis}>
        <div><span>Clientes na programação</span><strong>{metrics.rows}</strong></div>
        <div><span>Demandas abertas</span><strong>{metrics.openTasks}</strong></div>
        <div><span>Pontos de atenção</span><strong>{metrics.risks}</strong></div>
        <div><span>Implementados</span><strong>{metrics.implemented}</strong></div>
      </section>

      <section className={pageStyles.sheetPanel}>
        <header className={pageStyles.sheetHeader}>
          <h2><CalendarIcon size={16} /> Programação diária</h2>
          {canEditBoard ? (
            <Button size="sm" onClick={handleAddRow} disabled={creatingRow}><PlusIcon size={14} /> Nova linha</Button>
          ) : (
            <span className={pageStyles.viewOnly}>Somente visualização</span>
          )}
        </header>
        <div className={pageStyles.sheetScroller}>
          <table className={pageStyles.sheetTable}>
            <colgroup>
              <col className={pageStyles.indexCol} />
              {DAILY_COLUMNS.map((column) => <col key={column.key} style={{ minWidth: column.min || 160 }} />)}
              {canEditBoard ? <col className={pageStyles.actionCol} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {DAILY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                {canEditBoard ? <th>Ação</th> : null}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={DAILY_COLUMNS.length + (canEditBoard ? 2 : 1)} className={pageStyles.sheetEmpty}>Carregando programação...</td></tr>
              ) : null}
              {!rowsLoading && rows.length === 0 ? (
                <tr><td colSpan={DAILY_COLUMNS.length + (canEditBoard ? 2 : 1)} className={pageStyles.sheetEmpty}>Nenhum cliente na programação diária.</td></tr>
              ) : null}
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className={pageStyles.rowIndex}>{index + 1}</td>
                  {DAILY_COLUMNS.map((column) => (
                    <td key={column.key} data-column={column.key}>
                      <SupportCell
                        row={row}
                        column={column}
                        editable={canEditBoard}
                        saving={savingCell === `${row.id}:${column.key}`}
                        onChange={handleCellChange}
                        onCommit={handleCellCommit}
                      />
                    </td>
                  ))}
                  {canEditBoard ? (
                    <td className={pageStyles.actionCell}>
                      <button type="button" onClick={() => handleDeleteRow(row.id)} title="Remover linha"><TrashIcon size={14} /></button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className={pageStyles.sheetFooter}>
          <span>{rows.length} registros</span>
          {savingCell ? <span><SaveIcon size={14} /> Salvando</span> : null}
        </footer>
      </section>

      {demandModalOpen ? (
        <div className={modalStyles.settingsOverlay} onClick={(event) => event.stopPropagation()}>
          <form
            className={`${modalStyles.settingsModal} ${modalStyles.demandModal}`}
            onSubmit={handleCreateTask}
            onPaste={(event) => {
              const files = filesFromClipboard(event);
              if (!files.length) return;
              event.preventDefault();
              addDemandAttachments(files);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Nova demanda"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={modalStyles.settingsHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>Suporte</span>
              </div>
              <button type="button" className={modalStyles.iconButton} onClick={closeDemandModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={modalStyles.settingsContent}>
              <div className={modalStyles.demandFormGrid}>
                <label className={`${modalStyles.labeledField} ${modalStyles.fieldCompact}`}>
                  <span>Tipo</span>
                  <Select value="support" disabled aria-label="Tipo" className={modalStyles.formSelect}>
                    <option value="support">Suporte</option>
                  </Select>
                </label>
                <label className={`${modalStyles.labeledField} ${modalStyles.fieldCompact}`}>
                  <span>Prioridade</span>
                  <Select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} aria-label="Prioridade" className={modalStyles.formSelect}>
                    {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                  </Select>
                </label>
                <label className={`${modalStyles.labeledField} ${modalStyles.fieldWide}`}>
                  <span>Título</span>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título" />
                </label>
                <label className={modalStyles.labeledField}>
                  <span>Para quem é esta tarefa?</span>
                  <Select
                    type="user"
                    value={draft.assigneeUserId}
                    onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}
                    aria-label="Responsável"
                    className={modalStyles.formSelect}
                  >
                    {supportUsers.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                <label className={modalStyles.labeledField}>
                  <span>Cliente</span>
                  <Select value={draft.clientId} onChange={(event) => setDraft((current) => ({ ...current, clientId: event.target.value }))} aria-label="Cliente" className={modalStyles.formSelect} type="client">
                    <option value="">Sem cliente</option>
                    {clients.map((client) => <option key={client.id} value={client.id} data-avatar={client.avatarUrl || ''} data-name={client.name}>{client.name}</option>)}
                  </Select>
                </label>
                <label className={modalStyles.labeledField}>
                  <span>Prazo</span>
                  <DateField value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} placeholder="Prazo" ariaLabel="Prazo" className={modalStyles.dateField} />
                </label>
                <label className={`${modalStyles.labeledField} ${modalStyles.fieldWide}`}>
                  <span>Colaboradores adicionais</span>
                  <Select
                    type="user"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setDraft((current) => ({ ...current, collaboratorUserIds: [...new Set([...(current.collaboratorUserIds || []), value])] }));
                    }}
                    aria-label="Colaboradores"
                    className={modalStyles.formSelect}
                  >
                    <option value="">Adicionar colaborador</option>
                    {collaboratorOptions.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                {selectedCollaborators.length ? (
                  <div className={`${modalStyles.selectedCollaborators} ${modalStyles.fieldWide}`}>
                    {selectedCollaborators.map((item) => (
                      <span key={item.id}>
                        {item.name}
                        <button
                          type="button"
                          onClick={() => setDraft((current) => ({ ...current, collaboratorUserIds: (current.collaboratorUserIds || []).filter((id) => id !== item.id) }))}
                          aria-label={`Remover ${item.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição" className={modalStyles.demandTextarea} />

              <div className={modalStyles.attachmentComposer}>
                <div>
                  <span>Anexos</span>
                  <strong>{(draft.attachments || []).length}</strong>
                </div>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={handleDemandAttachmentFiles}
                  hidden
                />
                <button type="button" onClick={() => attachmentInputRef.current?.click()}>Anexar imagem ou PDF</button>
                {(draft.attachments || []).length ? (
                  <div className={modalStyles.attachmentPreviewGrid}>
                    {draft.attachments.map((item) => (
                      <figure key={item.id} className={modalStyles.attachmentPreviewItem}>
                        {item.mimeType === 'application/pdf' ? (
                          <span className={modalStyles.attachmentPdfPreview}>PDF</span>
                        ) : (
                          <img src={item.dataUrl} alt={item.fileName || 'Anexo'} loading="lazy" decoding="async" />
                        )}
                        <figcaption>{item.fileName || formatAttachmentKind(item)}</figcaption>
                        <button type="button" onClick={() => handleRemoveAttachment(item.id)} aria-label={`Remover ${item.fileName || 'anexo'}`}>×</button>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <footer className={modalStyles.settingsFooter}>
              <button type="button" onClick={closeDemandModal}>Cancelar</button>
              <button type="submit" disabled={creatingTask || !draft.title.trim()}>{creatingTask ? 'Criando' : 'Criar demanda'}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
