import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import DateField from '../components/ui/DateField.jsx';
import Select from '../components/ui/Select.jsx';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../components/ui/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { createTaskAttachment } from '../api/projects.js';
import {
  createSupportDailyRow,
  createSupportTask,
  deleteSupportDailyRow,
  listSupportDailyRows,
  listSupportTasks,
  updateSupportDailyRow,
} from '../api/support.js';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { hasPermission } from '../utils/permissions.js';
import pageStyles from './SupportTechnologyPage.module.css';
import modalStyles from './ProfilePage.module.css';

const DAILY_COLUMNS = [
  { key: 'clientName', label: 'Cliente / Escritório', type: 'text', width: 340 },
  { key: 'implementationStatus', label: 'Implementação', type: 'select', width: 230, options: ['Implementado com sucesso.', 'Em implementação', 'Pendente', 'Ajustar'] },
  { key: 'niche', label: 'Nicho / Campanha', type: 'text', width: 210 },
  { key: 'promptStatus', label: 'Prompt', type: 'select', width: 170, options: ['Prompt OK', 'Sem/Prompt', 'Revisar', 'Pendente'] },
  { key: 'connectionStatus', label: 'Conexão', type: 'select', width: 190, options: ['Conectado', 'Desconectado', 'Desconectado (GDV)', 'Pendente'] },
  { key: 'accessStatus', label: 'Acessos', type: 'select', width: 160, options: ['Acesso OK', 'Acessos OK', 'Sem/Acesso', 'Pendente'] },
  { key: 'activityStatus', label: 'Status', type: 'select', width: 130, options: ['Ativo', 'INATIVO', 'Pausado'] },
  { key: 'apiKey', label: 'API Key', type: 'text', width: 290 },
  { key: 'notes', label: 'Observações', type: 'text', width: 280 },
];

const PRIORITIES = [
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
  { value: 'low', label: 'Baixa' },
];

const SUPPORT_ROLES = new Set(['suporte_tecnologia']);
const FALLBACK_SUPPORT_ROLES = new Set(['ceo', 'admin']);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function statusTone(value = '') {
  const normalized = String(value).toLowerCase();
  if (normalized.includes('desconect') || normalized.includes('sem/') || normalized.includes('inativo')) return 'danger';
  if (normalized.includes('pendente') || normalized.includes('revisar') || normalized.includes('ajustar')) return 'warning';
  if (normalized.includes('ok') || normalized.includes('conectado') || normalized.includes('ativo') || normalized.includes('sucesso')) return 'success';
  return 'neutral';
}

function normalizeRow(row = {}) {
  const base = DAILY_COLUMNS.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {});
  return {
    id: row?.id || '',
    position: Number(row?.position || 0),
    ...base,
  };
}

function defaultRowPayload() {
  return {
    implementationStatus: 'Implementado com sucesso.',
    promptStatus: 'Prompt OK',
    connectionStatus: 'Conectado',
    accessStatus: 'Acesso OK',
    activityStatus: 'Ativo',
  };
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

function filesFromClipboard(event) {
  return Array.from(event?.clipboardData?.items || [])
    .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
    .filter(Boolean);
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

function formatAttachmentKind(item) {
  if (item?.mimeType === 'application/pdf') return 'PDF';
  if (item?.mimeType?.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function userAvatarProps(user) {
  return {
    'data-avatar': getUserAvatar(user) || user?.avatarUrl || '',
    'data-name': user?.name || '',
  };
}

function SupportCell({ row, column, editable, saving, onChange, onCommit }) {
  const value = row[column.key] || '';

  if (!editable) {
    return <span className={pageStyles.readonlyCell} data-tone={statusTone(value)} title={value}>{value || '—'}</span>;
  }

  const commonProps = {
    disabled: saving,
    value,
    onChange: (event) => onChange(row.id, column.key, event.target.value),
    onBlur: () => onCommit(row.id, column.key),
    onKeyDown: (event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') event.currentTarget.blur();
    },
  };

  if (column.type === 'select') {
    return (
      <select className={pageStyles.sheetSelect} data-tone={statusTone(value)} {...commonProps}>
        <option value="">—</option>
        {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  return <input className={pageStyles.sheetInput} type="text" spellCheck={false} {...commonProps} />;
}

function FormField({ label, className = '', children }) {
  return (
    <div className={`${modalStyles.labeledField} ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </div>
  );
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

  const activeUsers = useMemo(() => (
    Array.isArray(userDirectory) ? userDirectory : []
  ).filter((item) => item?.id && item?.active !== false), [userDirectory]);

  const supportUsers = useMemo(() => {
    const direct = activeUsers.filter((item) => SUPPORT_ROLES.has(item.role));
    if (direct.length) return direct;
    const fallback = activeUsers.filter((item) => FALLBACK_SUPPORT_ROLES.has(item.role));
    return fallback.length ? fallback : activeUsers;
  }, [activeUsers]);

  const canEditBoard = hasPermission(user, 'support.board.edit');
  const canCreateDemand = hasPermission(user, 'support.view');

  const selectedCollaborators = useMemo(() => {
    const ids = new Set(draft.collaboratorUserIds || []);
    return activeUsers.filter((item) => ids.has(item.id));
  }, [activeUsers, draft.collaboratorUserIds]);

  const collaboratorOptions = useMemo(() => {
    const selected = new Set([draft.assigneeUserId, ...(draft.collaboratorUserIds || [])].filter(Boolean));
    return activeUsers.filter((item) => !selected.has(item.id));
  }, [activeUsers, draft.assigneeUserId, draft.collaboratorUserIds]);

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const defaultAssigneeId = useMemo(() => {
    const currentAsSupport = supportUsers.find((item) => item.id === user?.id);
    return currentAsSupport?.id || supportUsers[0]?.id || user?.id || '';
  }, [supportUsers, user?.id]);

  useEffect(() => {
    if (!defaultAssigneeId) return;
    setDraft((current) => current.assigneeUserId ? current : { ...current, assigneeUserId: defaultAssigneeId });
  }, [defaultAssigneeId]);

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
    refreshRows().catch(() => showToast('Não foi possível carregar a programação diária.', { variant: 'error' }));
    refreshTasks().catch(() => showToast('Não foi possível carregar as demandas de suporte.', { variant: 'error' }));
  }, [refreshRows, refreshTasks, showToast]);

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
    setDraft(emptyDemandDraft(defaultAssigneeId));
    setDemandModalOpen(true);
  }

  function closeDemandModal() {
    if (!creatingTask) setDemandModalOpen(false);
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
      showToast(err?.message || 'Não foi possível anexar o arquivo.', { variant: 'error' });
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
    const title = cleanText(draft.title);
    if (!title) {
      showToast('Informe o título da demanda.', { variant: 'warning' });
      return;
    }
    setCreatingTask(true);
    try {
      const data = await createSupportTask({
        title,
        priority: draft.priority,
        clientId: draft.clientId,
        assigneeUserId: draft.assigneeUserId || defaultAssigneeId,
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
      setDraft(emptyDemandDraft(defaultAssigneeId));
      setDemandModalOpen(false);
      await refreshTasks();
      showToast('Demanda criada.');
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a demanda.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  };

  const handleAddRow = async () => {
    setCreatingRow(true);
    try {
      const data = await createSupportDailyRow(defaultRowPayload());
      setRows((current) => [...current, normalizeRow(data?.row)]);
    } catch (err) {
      showToast(err?.message || 'Não foi possível adicionar linha.', { variant: 'error' });
    } finally {
      setCreatingRow(false);
    }
  };

  const handleDeleteRow = async (id) => {
    if (!id) return;
    try {
      await deleteSupportDailyRow(id);
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a linha.', { variant: 'error' });
    }
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
      showToast(err?.message || 'Não foi possível salvar a célula.', { variant: 'error' });
      refreshRows().catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  return (
    <div className={pageStyles.page}>
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroTitle}>
          <span className={pageStyles.eyebrow}>Operação de suporte</span>
          <h1>Suporte de tecnologia</h1>
        </div>
        <div className={pageStyles.heroActions}>
          {canCreateDemand ? (
            <Button type="button" size="sm" onClick={openDemandModal}>
              <PlusIcon size={14} /> Nova demanda
            </Button>
          ) : null}
          <span className={pageStyles.heroIcon} aria-hidden="true"><BotIcon size={18} /></span>
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
          <h2><CalendarIcon size={15} /> Programação diária</h2>
          {canEditBoard ? (
            <Button type="button" size="sm" onClick={handleAddRow} disabled={creatingRow}>
              <PlusIcon size={14} /> Nova linha
            </Button>
          ) : null}
        </header>

        <div className={pageStyles.sheetScroller}>
          <table className={pageStyles.sheetTable}>
            <colgroup>
              <col style={{ width: 46 }} />
              {DAILY_COLUMNS.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              {canEditBoard ? <col style={{ width: 58 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {DAILY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                {canEditBoard ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={DAILY_COLUMNS.length + (canEditBoard ? 2 : 1)} className={pageStyles.sheetEmpty}>Carregando</td></tr>
              ) : null}
              {!rowsLoading && rows.length === 0 ? (
                <tr><td colSpan={DAILY_COLUMNS.length + (canEditBoard ? 2 : 1)} className={pageStyles.sheetEmpty}>Sem registros.</td></tr>
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
                      <button type="button" onClick={() => handleDeleteRow(row.id)} title="Remover linha"><TrashIcon size={13} /></button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className={pageStyles.sheetFooter}>
          <span>{rows.length} registros</span>
          {savingCell ? <span><SaveIcon size={13} /> Salvando</span> : null}
        </footer>
      </section>

      {demandModalOpen ? (
        <div className={modalStyles.settingsOverlay} onClick={closeDemandModal}>
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
                <FormField label="Tipo" className={modalStyles.fieldThird}>
                  <input value="Suporte" readOnly disabled />
                </FormField>
                <FormField label="Prioridade" className={modalStyles.fieldThird}>
                  <Select
                    value={draft.priority}
                    onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}
                    aria-label="Prioridade"
                    className={modalStyles.formSelect}
                  >
                    {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Título" className={modalStyles.fieldHalf}>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Título"
                  />
                </FormField>
                <FormField label="Para quem é esta tarefa?" className={modalStyles.fieldHalf}>
                  <Select
                    type="user"
                    value={draft.assigneeUserId}
                    onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}
                    aria-label="Responsável"
                    className={modalStyles.formSelect}
                  >
                    {supportUsers.map((item) => <option key={item.id} value={item.id} {...userAvatarProps(item)}>{item.name}</option>)}
                  </Select>
                </FormField>
                <FormField label="Cliente" className={modalStyles.fieldHalf}>
                  <Select
                    type="client"
                    value={draft.clientId}
                    onChange={(event) => setDraft((current) => ({ ...current, clientId: event.target.value }))}
                    aria-label="Cliente"
                    className={modalStyles.formSelect}
                  >
                    <option value="">Sem cliente</option>
                    {clients.map((client) => <option key={client.id} value={client.id} data-avatar={client.avatarUrl || ''} data-name={client.name}>{client.name}</option>)}
                  </Select>
                </FormField>
                <FormField label="Prazo" className={modalStyles.fieldHalf}>
                  <DateField
                    value={draft.dueDate}
                    onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))}
                    placeholder="Prazo"
                    ariaLabel="Prazo"
                    className={modalStyles.dateField}
                  />
                </FormField>
                <FormField label="Colaboradores adicionais" className={modalStyles.fieldWide}>
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
                    {collaboratorOptions.map((item) => <option key={item.id} value={item.id} {...userAvatarProps(item)}>{item.name}</option>)}
                  </Select>
                </FormField>
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

              <textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Descrição"
                className={modalStyles.demandTextarea}
              />

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
