import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import DateField from '../components/ui/DateField.jsx';
import Select from '../components/ui/Select.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../components/ui/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { createTaskAttachment } from '../api/projects.js';
import {
  createSupportDailyColumn,
  createSupportDailyRow,
  createSupportTask,
  deleteSupportDailyColumn,
  deleteSupportDailyRow,
  listSupportDailyRows,
  listSupportTasks,
  updateSupportDailyColumn,
  updateSupportDailyRow,
} from '../api/support.js';
import { getClientAvatar, getUserAvatar } from '../utils/avatarStorage.js';
import { hasPermission } from '../utils/permissions.js';
import pageStyles from './SupportTechnologyPage.module.css';
import styles from './ProfilePage.module.css';

const FALLBACK_DAILY_COLUMNS = [
  { key: 'clientName', label: 'Cliente / Escritório', width: 340, system: true },
  { key: 'implementationStatus', label: 'Implementação', width: 230, system: true },
  { key: 'niche', label: 'Nicho / Campanha', width: 210, system: true },
  { key: 'promptStatus', label: 'Prompt', width: 170, system: true },
  { key: 'connectionStatus', label: 'Conexão', width: 190, system: true },
  { key: 'accessStatus', label: 'Acessos', width: 160, system: true },
  { key: 'activityStatus', label: 'Status', width: 130, system: true },
  { key: 'apiKey', label: 'API Key', width: 290, system: true },
  { key: 'notes', label: 'Observações', width: 280, system: true },
];

const DEMAND_TYPES = [
  { value: 'support', label: 'Suporte' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'routine', label: 'Rotina' },
  { value: 'bug', label: 'Bug' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'access', label: 'Acesso' },
  { value: 'other', label: 'Outro' },
];

const DEMAND_PRIORITIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

const ROUTINE_RECURRENCES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'one_time', label: 'Pontual' },
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

function normalizeColumns(columns = []) {
  const source = Array.isArray(columns) && columns.length ? columns : FALLBACK_DAILY_COLUMNS;
  return source.map((column) => ({
    key: column.key,
    label: column.label || 'Coluna',
    width: Math.max(90, Math.min(640, Number(column.width || 180))),
    system: column.system !== false,
  }));
}

function normalizeRow(row = {}, columns = FALLBACK_DAILY_COLUMNS) {
  const base = columns.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {});
  return {
    id: row?.id || '',
    position: Number(row?.position || 0),
    ...base,
  };
}

function emptyDemandForm(userId = '') {
  return {
    type: 'support',
    title: '',
    description: '',
    assigneeUserId: userId,
    clientId: '',
    dueDate: todayIso(),
    priority: 'medium',
    officeName: '',
    objective: '',
    campaign: '',
    channels: '',
    attendants: '',
    greeting: '',
    location: '',
    notes: '',
    recurrence: 'daily',
    routineScope: '',
    routineChecklist: '',
    collaboratorUserIds: [],
    attachments: [],
  };
}

function demandTypeLabel(type) {
  return DEMAND_TYPES.find((item) => item.value === type)?.label || 'Demanda';
}

function recurrenceLabel(value) {
  return ROUTINE_RECURRENCES.find((item) => item.value === value)?.label || value || '';
}

function buildDemandDescription(form, clientName = '') {
  const lines = [`Tipo: ${demandTypeLabel(form.type)}`];
  if (clientName) lines.push(`Cliente: ${clientName}`);

  if (form.type === 'briefing') {
    const briefing = [
      ['Nome do escritório', form.officeName],
      ['Objetivo', form.objective],
      ['Nicho/campanha', form.campaign],
      ['Canais', form.channels],
      ['Atendentes', form.attendants],
      ['Saudação', form.greeting],
      ['Localização', form.location],
      ['Observações', form.notes],
    ].filter(([, value]) => cleanText(value)).map(([label, value]) => `${label}: ${cleanText(value)}`);
    if (briefing.length) lines.push('', 'Briefing', ...briefing);
  }

  if (form.type === 'routine') {
    const routine = [
      ['Recorrência', recurrenceLabel(form.recurrence)],
      ['Escopo', form.routineScope],
      ['Checklist', form.routineChecklist],
    ].filter(([, value]) => cleanText(value)).map(([label, value]) => `${label}: ${cleanText(value)}`);
    if (routine.length) lines.push('', 'Rotina', ...routine);
  }

  if (cleanText(form.description)) lines.push('', cleanText(form.description));
  return lines.join('\n');
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

function SupportCell({ row, column, editable, saving, onChange, onCommit }) {
  const value = row[column.key] || '';
  if (!editable) {
    return <span className={pageStyles.readonlyCell} data-tone={statusTone(value)} title={value}>{value || '—'}</span>;
  }
  return (
    <input
      className={pageStyles.sheetInput}
      data-tone={statusTone(value)}
      type="text"
      spellCheck={false}
      disabled={saving}
      value={value}
      onChange={(event) => onChange(row.id, column.key, event.target.value)}
      onBlur={() => onCommit(row.id, column.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

function HeaderCell({ column, editable, onLabelChange, onLabelCommit, onResizeStart, onDelete }) {
  return (
    <div className={pageStyles.headerCellInner}>
      {editable ? (
        <input
          value={column.label}
          onChange={(event) => onLabelChange(column.key, event.target.value)}
          onBlur={() => onLabelCommit(column.key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
          aria-label={`Nome da coluna ${column.label}`}
        />
      ) : (
        <span>{column.label}</span>
      )}
      {editable && !column.system ? (
        <button type="button" onClick={() => onDelete(column.key)} aria-label={`Remover coluna ${column.label}`}>
          <CloseIcon size={11} />
        </button>
      ) : null}
      {editable ? (
        <span
          className={pageStyles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(event) => onResizeStart(event, column.key)}
        />
      ) : null}
    </div>
  );
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clients = [], userDirectory = [], setPanelHeader } = useOutletContext();
  const [columns, setColumns] = useState(FALLBACK_DAILY_COLUMNS);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [demandForm, setDemandForm] = useState(() => emptyDemandForm(''));
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchPosition, setClientSearchPosition] = useState(null);
  const attachmentInputRef = useRef(null);
  const clientSearchRef = useRef(null);
  const clientSearchPanelRef = useRef(null);
  const resizeRef = useRef(null);

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

  const selectedClient = useMemo(() => clients.find((client) => String(client.id) === String(demandForm.clientId)) || null, [clients, demandForm.clientId]);
  const selectedCollaborators = useMemo(() => {
    const ids = new Set(demandForm.collaboratorUserIds || []);
    return activeUsers.filter((item) => ids.has(item.id));
  }, [activeUsers, demandForm.collaboratorUserIds]);

  const collaboratorOptions = useMemo(() => {
    const selected = new Set([demandForm.assigneeUserId, ...(demandForm.collaboratorUserIds || [])].filter(Boolean));
    return activeUsers.filter((item) => !selected.has(item.id));
  }, [activeUsers, demandForm.assigneeUserId, demandForm.collaboratorUserIds]);

  const filteredClients = useMemo(() => {
    const term = cleanText(clientQuery).toLowerCase();
    const source = Array.isArray(clients) ? clients : [];
    if (!term) return source.slice(0, 12);
    return source.filter((client) => String(client.name || '').toLowerCase().includes(term)).slice(0, 12);
  }, [clients, clientQuery]);

  const defaultAssigneeId = useMemo(() => {
    const currentAsSupport = supportUsers.find((item) => item.id === user?.id);
    return currentAsSupport?.id || supportUsers[0]?.id || user?.id || '';
  }, [supportUsers, user?.id]);

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    if (!defaultAssigneeId) return;
    setDemandForm((current) => current.assigneeUserId ? current : { ...current, assigneeUserId: defaultAssigneeId });
  }, [defaultAssigneeId]);

  const refreshRows = useCallback(async () => {
    setRowsLoading(true);
    try {
      const data = await listSupportDailyRows();
      const nextColumns = normalizeColumns(data?.columns);
      setColumns(nextColumns);
      setRows((Array.isArray(data?.rows) ? data.rows : []).map((row) => normalizeRow(row, nextColumns)));
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
    const riskRows = rows.filter((row) => columns.some((column) => statusTone(row[column.key]) === 'danger'));
    return {
      rows: rows.length,
      openTasks: openTasks.length,
      risks: riskRows.length,
      implemented: rows.filter((row) => statusTone(row.implementationStatus) === 'success').length,
    };
  }, [columns, rows, tasks]);

  function openDemandModal() {
    setDemandForm(emptyDemandForm(defaultAssigneeId));
    setClientQuery('');
    setClientSearchOpen(false);
    setDemandModalOpen(true);
  }

  function closeDemandModal() {
    if (!creatingTask) {
      setDemandModalOpen(false);
      setClientSearchOpen(false);
      setClientSearchPosition(null);
    }
  }

  const openClientSearch = useCallback(() => {
    const rect = clientSearchRef.current?.getBoundingClientRect();
    if (!rect) return;
    setClientSearchPosition({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(320, window.innerHeight - rect.bottom - 16),
    });
    setClientSearchOpen(true);
  }, []);

  useLayoutEffect(() => {
    if (!clientSearchOpen) return undefined;
    const reposition = () => openClientSearch();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [clientSearchOpen, openClientSearch]);

  useEffect(() => {
    if (!clientSearchOpen) return undefined;
    function handlePointerDown(event) {
      if (clientSearchRef.current?.contains(event.target) || clientSearchPanelRef.current?.contains(event.target)) return;
      setClientSearchOpen(false);
      setClientSearchPosition(null);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [clientSearchOpen]);

  async function addDemandAttachments(files) {
    const selected = uniqueFiles(files).filter(Boolean);
    if (!selected.length) return;
    try {
      const parsed = await Promise.all(selected.map(readAttachmentFile));
      setDemandForm((current) => {
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
    setDemandForm((current) => ({ ...current, attachments: (current.attachments || []).filter((item) => item.id !== id) }));
  }

  const handleCreateTask = async (event) => {
    event.preventDefault();
    const title = cleanText(demandForm.title);
    if (!title) {
      showToast('Informe o título da demanda.', { variant: 'warning' });
      return;
    }
    setCreatingTask(true);
    try {
      const description = buildDemandDescription(demandForm, selectedClient?.name || '');
      const data = await createSupportTask({
        title,
        type: demandForm.type,
        priority: demandForm.priority,
        clientId: demandForm.clientId,
        assigneeUserId: demandForm.assigneeUserId || defaultAssigneeId,
        collaboratorUserIds: demandForm.collaboratorUserIds,
        dueDate: demandForm.dueDate,
        description,
      });
      const taskId = data?.task?.id;
      if (taskId && demandForm.attachments?.length) {
        await Promise.allSettled(demandForm.attachments.map((item) => createTaskAttachment(taskId, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })));
      }
      setDemandForm(emptyDemandForm(defaultAssigneeId));
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
      const data = await createSupportDailyRow({});
      setRows((current) => [...current, normalizeRow(data?.row, columns)]);
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
        setRows((current) => current.map((entry) => (entry.id === id ? normalizeRow(data.row, columns) : entry)));
      }
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a célula.', { variant: 'error' });
      refreshRows().catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  const handleAddColumn = async () => {
    setCreatingColumn(true);
    try {
      const data = await createSupportDailyColumn({ label: 'Nova coluna', width: 180 });
      if (data?.column) {
        setColumns((current) => [...current, data.column]);
        setRows((current) => current.map((row) => ({ ...row, [data.column.key]: '' })));
      }
    } catch (err) {
      showToast(err?.message || 'Não foi possível adicionar coluna.', { variant: 'error' });
    } finally {
      setCreatingColumn(false);
    }
  };

  const handleColumnLabelChange = (key, label) => {
    setColumns((current) => current.map((column) => (column.key === key ? { ...column, label } : column)));
  };

  const handleColumnLabelCommit = async (key) => {
    const column = columns.find((entry) => entry.key === key);
    if (!column) return;
    setSavingColumn(key);
    try {
      const data = await updateSupportDailyColumn(key, { label: column.label || 'Coluna' });
      if (data?.columns) setColumns(normalizeColumns(data.columns));
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a coluna.', { variant: 'error' });
      refreshRows().catch(() => {});
    } finally {
      setSavingColumn('');
    }
  };

  const handleDeleteColumn = async (key) => {
    const column = columns.find((entry) => entry.key === key);
    if (!column || column.system) return;
    try {
      await deleteSupportDailyColumn(key);
      setColumns((current) => current.filter((entry) => entry.key !== key));
      setRows((current) => current.map((row) => {
        const next = { ...row };
        delete next[key];
        return next;
      }));
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a coluna.', { variant: 'error' });
    }
  };

  const handleResizeStart = (event, key) => {
    event.preventDefault();
    const column = columns.find((entry) => entry.key === key);
    if (!column) return;
    resizeRef.current = { key, startX: event.clientX, startWidth: column.width };
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    function handleMove(event) {
      const state = resizeRef.current;
      if (!state) return;
      const width = Math.max(90, Math.min(640, state.startWidth + event.clientX - state.startX));
      setColumns((current) => current.map((column) => (column.key === state.key ? { ...column, width } : column)));
    }
    async function handleUp() {
      const state = resizeRef.current;
      if (!state) return;
      resizeRef.current = null;
      document.body.style.cursor = '';
      const column = columns.find((entry) => entry.key === state.key);
      if (!column) return;
      try {
        await updateSupportDailyColumn(column.key, { width: column.width });
      } catch {
        refreshRows().catch(() => {});
      }
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };
  }, [columns, refreshRows]);

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
            <div className={pageStyles.sheetActions}>
              <Button type="button" size="sm" onClick={handleAddColumn} disabled={creatingColumn}>
                <PlusIcon size={14} /> Nova coluna
              </Button>
              <Button type="button" size="sm" onClick={handleAddRow} disabled={creatingRow}>
                <PlusIcon size={14} /> Nova linha
              </Button>
            </div>
          ) : null}
        </header>

        <div className={pageStyles.sheetScroller}>
          <table className={pageStyles.sheetTable}>
            <colgroup>
              <col style={{ width: 46 }} />
              {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              {canEditBoard ? <col style={{ width: 58 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {columns.map((column) => (
                  <th key={column.key} data-saving={savingColumn === column.key || undefined}>
                    <HeaderCell
                      column={column}
                      editable={canEditBoard}
                      onLabelChange={handleColumnLabelChange}
                      onLabelCommit={handleColumnLabelCommit}
                      onResizeStart={handleResizeStart}
                      onDelete={handleDeleteColumn}
                    />
                  </th>
                ))}
                {canEditBoard ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={columns.length + (canEditBoard ? 2 : 1)} className={pageStyles.sheetEmpty}>Carregando</td></tr>
              ) : null}
              {!rowsLoading && rows.length === 0 ? (
                <tr><td colSpan={columns.length + (canEditBoard ? 2 : 1)} className={pageStyles.sheetEmpty}>Sem registros.</td></tr>
              ) : null}
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className={pageStyles.rowIndex}>{index + 1}</td>
                  {columns.map((column) => (
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
          {savingCell || savingColumn ? <span><SaveIcon size={13} /> Salvando</span> : null}
        </footer>
      </section>

      {demandModalOpen ? (
        <div className={styles.settingsOverlay} onClick={(event) => event.stopPropagation()}>
          <form
            className={`${styles.settingsModal} ${styles.demandModal} ${styles[`demandModal_${demandForm.type}`] || ''}`.trim()}
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
            <header className={styles.settingsHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>{demandTypeLabel(demandForm.type)}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeDemandModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.settingsContent}>
              <div className={styles.demandFormGrid}>
                <label className={`${styles.labeledField} ${styles.fieldCompact}`}>
                  <span>Tipo</span>
                  <Select value={demandForm.type} onChange={(event) => setDemandForm((prev) => ({ ...prev, type: event.target.value }))} aria-label="Tipo" className={styles.formSelect}>
                    {DEMAND_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </label>
                <label className={`${styles.labeledField} ${styles.fieldCompact}`}>
                  <span>Prioridade</span>
                  <Select value={demandForm.priority} onChange={(event) => setDemandForm((prev) => ({ ...prev, priority: event.target.value }))} aria-label="Prioridade" className={styles.formSelect}>
                    {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </label>
                <label className={`${styles.labeledField} ${styles.fieldWide}`}>
                  <span>Título</span>
                  <input value={demandForm.title} onChange={(event) => setDemandForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título" />
                </label>
                <label className={styles.labeledField}>
                  <span>Para quem é esta tarefa?</span>
                  <Select
                    type="user"
                    value={demandForm.assigneeUserId}
                    onChange={(event) => setDemandForm((prev) => ({
                      ...prev,
                      assigneeUserId: event.target.value,
                      collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== event.target.value),
                    }))}
                    aria-label="Responsável"
                    className={styles.formSelect}
                  >
                    {(supportUsers.length ? supportUsers : activeUsers).map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                <label className={styles.labeledField}>
                  <span>Cliente</span>
                  <div
                    className={styles.clientSearchField}
                    data-has-avatar={selectedClient ? 'true' : undefined}
                    ref={clientSearchRef}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {selectedClient ? (
                      <Avatar
                        src={getClientAvatar(selectedClient) || selectedClient.avatarUrl || undefined}
                        name={selectedClient.name}
                        size="xs"
                        className={styles.clientSearchAvatar}
                      />
                    ) : null}
                    <input
                      value={clientSearchOpen ? clientQuery : selectedClient?.name || clientQuery}
                      onFocus={() => {
                        if (selectedClient) setClientQuery(selectedClient.name || '');
                        openClientSearch();
                      }}
                      onMouseDown={() => {
                        if (!clientSearchOpen) openClientSearch();
                      }}
                      onChange={(event) => {
                        setClientQuery(event.target.value);
                        if (demandForm.clientId) setDemandForm((prev) => ({ ...prev, clientId: '' }));
                        openClientSearch();
                      }}
                      placeholder="Cliente"
                      aria-label="Cliente"
                    />
                    {(selectedClient || clientQuery) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDemandForm((prev) => ({ ...prev, clientId: '' }));
                          setClientQuery('');
                          setClientSearchOpen(false);
                          setClientSearchPosition(null);
                        }}
                        aria-label="Limpar cliente"
                      >
                        <CloseIcon size={13} />
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className={styles.labeledField}>
                  <span>Prazo</span>
                  <DateField value={demandForm.dueDate} onChange={(value) => setDemandForm((prev) => ({ ...prev, dueDate: value }))} placeholder="Prazo" ariaLabel="Prazo" className={styles.dateField} />
                </label>
                <label className={`${styles.labeledField} ${styles.fieldWide}`}>
                  <span>Colaboradores adicionais</span>
                  <Select
                    type="user"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setDemandForm((prev) => ({
                        ...prev,
                        collaboratorUserIds: [...new Set([...(prev.collaboratorUserIds || []), value])],
                      }));
                    }}
                    aria-label="Colaboradores"
                    className={styles.formSelect}
                  >
                    <option value="">Adicionar colaborador</option>
                    {collaboratorOptions.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                {selectedCollaborators.length ? (
                  <div className={`${styles.selectedCollaborators} ${styles.fieldWide}`}>
                    {selectedCollaborators.map((item) => (
                      <span key={item.id}>
                        {item.name}
                        <button
                          type="button"
                          onClick={() => setDemandForm((prev) => ({ ...prev, collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== item.id) }))}
                          aria-label={`Remover ${item.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {demandForm.type === 'briefing' ? (
                <div className={styles.briefingGrid}>
                  <input value={demandForm.officeName} onChange={(event) => setDemandForm((prev) => ({ ...prev, officeName: event.target.value }))} placeholder="Escritório" />
                  <input value={demandForm.objective} onChange={(event) => setDemandForm((prev) => ({ ...prev, objective: event.target.value }))} placeholder="Objetivo" />
                  <input value={demandForm.campaign} onChange={(event) => setDemandForm((prev) => ({ ...prev, campaign: event.target.value }))} placeholder="Nicho/campanha" />
                  <input value={demandForm.channels} onChange={(event) => setDemandForm((prev) => ({ ...prev, channels: event.target.value }))} placeholder="Canais" />
                  <input value={demandForm.attendants} onChange={(event) => setDemandForm((prev) => ({ ...prev, attendants: event.target.value }))} placeholder="Atendentes" />
                  <input value={demandForm.greeting} onChange={(event) => setDemandForm((prev) => ({ ...prev, greeting: event.target.value }))} placeholder="Saudação" />
                  <input value={demandForm.location} onChange={(event) => setDemandForm((prev) => ({ ...prev, location: event.target.value }))} placeholder="Localização" />
                  <textarea className={styles.fieldWide} value={demandForm.notes} onChange={(event) => setDemandForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Observações" />
                </div>
              ) : null}

              {demandForm.type === 'routine' ? (
                <div className={styles.routineFormGrid}>
                  <Select value={demandForm.recurrence} onChange={(event) => setDemandForm((prev) => ({ ...prev, recurrence: event.target.value }))} aria-label="Recorrência" className={`${styles.formSelect} ${styles.fieldThird}`}>
                    {ROUTINE_RECURRENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                  <input value={demandForm.routineScope} onChange={(event) => setDemandForm((prev) => ({ ...prev, routineScope: event.target.value }))} placeholder="Escopo" />
                  <textarea className={styles.fieldWide} value={demandForm.routineChecklist} onChange={(event) => setDemandForm((prev) => ({ ...prev, routineChecklist: event.target.value }))} placeholder="Checklist" />
                </div>
              ) : null}

              <textarea value={demandForm.description} onPaste={(event) => {
                const files = filesFromClipboard(event);
                if (!files.length) return;
                event.preventDefault();
                addDemandAttachments(files);
              }} onChange={(event) => setDemandForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição" className={styles.demandTextarea} />

              <div className={styles.attachmentComposer}>
                <div>
                  <span>Anexos</span>
                  <strong>{(demandForm.attachments || []).length}</strong>
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
                {(demandForm.attachments || []).length ? (
                  <div className={styles.attachmentPreviewGrid}>
                    {demandForm.attachments.map((item) => (
                      <figure key={item.id} className={styles.attachmentPreviewItem}>
                        {item.mimeType === 'application/pdf' ? (
                          <span className={styles.attachmentPdfPreview}>PDF</span>
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

            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeDemandModal}>Cancelar</button>
              <button type="submit" disabled={creatingTask || !canCreateDemand}>{creatingTask ? 'Criando' : 'Criar demanda'}</button>
            </footer>
          </form>
          {clientSearchOpen && clientSearchPosition ? createPortal(
            <div
              ref={clientSearchPanelRef}
              className={`${styles.clientSearchResults} ${styles.clientSearchFloating}`}
              style={{
                top: clientSearchPosition.top,
                left: clientSearchPosition.left,
                width: clientSearchPosition.width,
                maxHeight: clientSearchPosition.maxHeight,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {filteredClients.length ? filteredClients.map((client) => {
                const clientAvatar = getClientAvatar(client) || client.avatarUrl || '';
                return (
                  <button
                    key={client.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setDemandForm((prev) => ({ ...prev, clientId: client.id }));
                      setClientQuery(client.name || '');
                      setClientSearchOpen(false);
                      setClientSearchPosition(null);
                    }}
                  >
                    <Avatar
                      src={clientAvatar || undefined}
                      name={client.name}
                      size="xs"
                      className={styles.clientSearchOptionAvatar}
                    />
                    <div className={styles.clientSearchOptionText}>
                      <strong>{client.name}</strong>
                      {client.squadName || client.managerName || client.gdvName ? (
                        <span>{[client.squadName, client.managerName, client.gdvName].filter(Boolean).join(' · ')}</span>
                      ) : null}
                    </div>
                  </button>
                );
              }) : (
                <span className={styles.clientSearchEmpty}>Sem cliente</span>
              )}
            </div>,
            document.body,
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
