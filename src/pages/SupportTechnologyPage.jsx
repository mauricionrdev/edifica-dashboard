import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import DemandModal from '../components/tasks/DemandModal.jsx';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../components/ui/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { createTaskAttachment } from '../api/projects.js';
import {
  createSupportDailyColumn,
  createSupportDailyRow,
  createSupportDailySheet,
  createSupportTask,
  deleteSupportDailyColumn,
  deleteSupportDailyRow,
  deleteSupportDailySheet,
  listSupportDailyRows,
  listSupportTasks,
  updateSupportDailyColumn,
  updateSupportDailyRow,
  updateSupportDailySheet,
} from '../api/support.js';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { hasPermission } from '../utils/permissions.js';
import { roleLabel } from '../utils/roles.js';
import styles from './SupportTechnologyPage.module.css';

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

const SHEET_TEXT_COLORS = ['#f8fafc', '#22c55e', '#facc15', '#60a5fa', '#c084fc', '#fb7185', '#f97316', '#94a3b8'];
const SHEET_FILL_COLORS = ['transparent', '#0f172a', '#11261a', '#2a2106', '#111f35', '#251634', '#34191d', '#1f2937'];

const MASTER_SUPPORT_EMAIL = 'mauricionredifica@gmail.com';
const MASTER_SUPPORT_NAME = 'mauricio nunes';
const SUPPORT_ROLES = new Set(['suporte_tecnologia']);
const FALLBACK_SUPPORT_ROLES = new Set(['ceo', 'admin']);

function cleanText(value) {
  return String(value ?? '').trim();
}

function plainText(value = '') {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
}

function cellHtml(value = '') {
  return String(value ?? '');
}

function statusTone(value = '') {
  const normalized = plainText(value).toLowerCase();
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
    width: Math.max(72, Math.min(900, Number(column.width || 180))),
    system: column.system !== false,
  }));
}

function normalizeRow(row = {}, columns = FALLBACK_DAILY_COLUMNS) {
  const base = columns.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {});
  return {
    id: row?.id || '',
    position: Number(row?.position || 0),
    ...base,
    __styles: row?.__styles && typeof row.__styles === 'object' ? row.__styles : {},
  };
}

function cellStyle(row, key) {
  return row?.__styles?.[key] || {};
}

function normalizeStyle(style = {}) {
  const next = { ...style };
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined || next[key] === null || next[key] === '') delete next[key];
  });
  return next;
}

function SheetCell({ row, column, editable, saving, selected, onSelect, onChange, onCommit }) {
  const ref = useRef(null);
  const value = cellHtml(row[column.key] || '');
  const style = cellStyle(row, column.key);
  const plainValue = plainText(value);

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  if (!editable) {
    return (
      <span
        className={styles.readonlyCell}
        data-tone={statusTone(value)}
        style={style}
        title={plainValue}
        dangerouslySetInnerHTML={{ __html: value || '—' }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={`${styles.sheetInput} ${selected ? styles.sheetInputSelected : ''}`.trim()}
      data-tone={statusTone(value)}
      data-saving={saving || undefined}
      data-sheet-cell={`${row.id}:${column.key}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      tabIndex={0}
      onFocus={() => onSelect(row.id, column.key, ref.current)}
      onMouseDown={() => onSelect(row.id, column.key, ref.current)}
      onMouseUp={() => onSelect(row.id, column.key, ref.current)}
      onKeyUp={() => onSelect(row.id, column.key, ref.current)}
      onInput={(event) => onChange(row.id, column.key, event.currentTarget.innerHTML)}
      onBlur={() => onCommit(row.id, column.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

function HeaderCell({ column, editable, onLabelChange, onLabelCommit, onResizeStart, onDelete }) {
  return (
    <div className={styles.headerCellInner}>
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
      {editable ? (
        <button type="button" onClick={() => onDelete(column.key)} aria-label={`Remover coluna ${column.label}`}>
          <CloseIcon size={11} />
        </button>
      ) : null}
      {editable ? (
        <span
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(event) => onResizeStart(event, column.key)}
        />
      ) : null}
    </div>
  );
}

function ColorPopover({ label, disabled, colors, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (ref.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.colorPicker} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className={styles.colorTrigger}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open ? (
        <div className={styles.colorMenu}>
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className={styles.colorSwatch}
              style={color === 'transparent' ? undefined : { '--swatch-color': color }}
              data-empty={color === 'transparent' || undefined}
              aria-label={`${label} ${color}`}
              onClick={() => {
                onSelect(color);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SheetToolbar({ disabled, onCommand }) {
  const preventBlur = (event) => event.preventDefault();

  return (
    <div className={styles.sheetToolbar} aria-label="Formatação" onMouseDown={preventBlur}>
      <button type="button" disabled={disabled} onClick={() => onCommand('bold')}>B</button>
      <button type="button" disabled={disabled} onClick={() => onCommand('italic')}>I</button>
      <button type="button" disabled={disabled} onClick={() => onCommand('underline')}>U</button>
      <button type="button" disabled={disabled} onClick={() => onCommand('strikeThrough')}>S</button>
      <span className={styles.toolbarDivider} />
      <button type="button" disabled={disabled} onClick={() => onCommand('justifyLeft')}>←</button>
      <button type="button" disabled={disabled} onClick={() => onCommand('justifyCenter')}>↔</button>
      <button type="button" disabled={disabled} onClick={() => onCommand('justifyRight')}>→</button>
      <span className={styles.toolbarDivider} />
      <ColorPopover label="A" disabled={disabled} colors={SHEET_TEXT_COLORS} onSelect={(color) => onCommand('foreColor', color)} />
      <ColorPopover label="▣" disabled={disabled} colors={SHEET_FILL_COLORS} onSelect={(color) => onCommand('hiliteColor', color)} />
      <button type="button" disabled={disabled} onClick={() => onCommand('removeFormat')}>Limpar</button>
    </div>
  );
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clients = [], userDirectory = [], setPanelHeader } = useOutletContext();
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [columns, setColumns] = useState(FALLBACK_DAILY_COLUMNS);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const resizeRef = useRef(null);

  const activeUsers = useMemo(() => (Array.isArray(userDirectory) ? userDirectory : []).filter((item) => item?.id && item?.active !== false), [userDirectory]);

  const supportMaster = useMemo(() => activeUsers.find((item) => (
    String(item.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
    || String(item.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
  )) || null, [activeUsers]);

  const supportUsers = useMemo(() => {
    if (supportMaster) return [supportMaster];
    const direct = activeUsers.filter((item) => SUPPORT_ROLES.has(item.role));
    if (direct.length) return direct;
    const fallback = activeUsers.filter((item) => FALLBACK_SUPPORT_ROLES.has(item.role));
    return fallback.length ? fallback : activeUsers;
  }, [activeUsers, supportMaster]);

  const defaultAssigneeId = supportMaster?.id || supportUsers[0]?.id || user?.id || '';
  const canEditBoard = hasPermission(user, 'support.board.edit');
  const canCreateDemand = hasPermission(user, 'support.view');

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const refreshRows = useCallback(async (sheetId = activeSheetId) => {
    setRowsLoading(true);
    try {
      const data = await listSupportDailyRows(sheetId || undefined);
      const nextColumns = normalizeColumns(data?.columns);
      setSheets(Array.isArray(data?.sheets) ? data.sheets : []);
      setActiveSheetId(data?.activeSheetId || sheetId || data?.sheets?.[0]?.id || '');
      setColumns(nextColumns);
      setRows((Array.isArray(data?.rows) ? data.rows : []).map((row) => normalizeRow(row, nextColumns)));
    } finally {
      setRowsLoading(false);
    }
  }, [activeSheetId]);

  const refreshTasks = useCallback(async () => {
    const data = await listSupportTasks();
    setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
  }, []);

  useEffect(() => {
    refreshRows().catch(() => showToast('Não foi possível carregar a programação diária.', { variant: 'error' }));
    refreshTasks().catch(() => showToast('Não foi possível carregar as demandas de suporte.', { variant: 'error' }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps



  const handleCreateTask = async (form) => {
    const title = cleanText(form.title);
    if (!title) {
      showToast('Informe o título da demanda.', { variant: 'warning' });
      return;
    }
    setCreatingTask(true);
    try {
      const data = await createSupportTask({
        title,
        type: form.type,
        priority: form.priority,
        clientId: form.clientId,
        assigneeUserId: form.assigneeUserId || defaultAssigneeId,
        collaboratorUserIds: form.collaboratorUserIds,
        dueDate: form.dueDate,
        description: form.description,
      });
      const taskId = data?.task?.id;
      if (taskId && form.attachments?.length) {
        await Promise.allSettled(form.attachments.map((item) => createTaskAttachment(taskId, { fileName: item.fileName, mimeType: item.mimeType, sizeBytes: item.sizeBytes, dataUrl: item.dataUrl })));
      }
      setDemandModalOpen(false);
      await refreshTasks();
      showToast('Demanda criada.');
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a demanda.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  };

  const handleAddSheet = async () => {
    setCreatingSheet(true);
    try {
      const data = await createSupportDailySheet({ name: `Planilha ${sheets.length + 1}` });
      setSheets(Array.isArray(data?.sheets) ? data.sheets : []);
      const nextId = data?.sheet?.id;
      if (nextId) await refreshRows(nextId);
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar planilha.', { variant: 'error' });
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleSheetNameCommit = async (sheetId, name) => {
    try {
      const data = await updateSupportDailySheet(sheetId, { name: cleanText(name) || 'Planilha' });
      if (Array.isArray(data?.sheets)) setSheets(data.sheets);
    } catch (err) {
      showToast(err?.message || 'Não foi possível renomear a planilha.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    }
  };

  const handleDeleteSheet = async (sheetId) => {
    if (!sheetId || sheets.length <= 1) return;
    try {
      const data = await deleteSupportDailySheet(sheetId);
      const nextSheets = Array.isArray(data?.sheets) ? data.sheets : sheets.filter((sheet) => sheet.id !== sheetId);
      setSheets(nextSheets);
      await refreshRows(nextSheets[0]?.id || '');
    } catch (err) {
      showToast(err?.message || 'Não foi possível excluir a planilha.', { variant: 'error' });
    }
  };

  const handleAddRow = async () => {
    setCreatingRow(true);
    try {
      const data = await createSupportDailyRow({ sheetId: activeSheetId });
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
      if (data?.row) setRows((current) => current.map((entry) => (entry.id === id ? normalizeRow(data.row, columns) : entry)));
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a célula.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  const handleApplyFormat = async (command, value = null) => {
    if (!selectedCell || !canEditBoard) return;
    const { rowId, key, element } = selectedCell;
    const target = element || document.querySelector(`[data-sheet-cell="${rowId}:${key}"]`);
    if (!target) return;
    target.focus();
    document.execCommand(command, false, value);
    const nextHtml = target.innerHTML;
    setRows((current) => current.map((entry) => (entry.id === rowId ? { ...entry, [key]: nextHtml } : entry)));
    setSavingCell(`${rowId}:${key}`);
    try {
      await updateSupportDailyRow(rowId, { [key]: nextHtml });
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a formatação.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  const handleAddColumn = async () => {
    setCreatingColumn(true);
    try {
      const data = await createSupportDailyColumn({ sheetId: activeSheetId, label: 'Nova coluna', width: 180 });
      if (data?.columns) setColumns(normalizeColumns(data.columns));
      else if (data?.column) setColumns((current) => [...current, data.column]);
      if (data?.column) setRows((current) => current.map((row) => ({ ...row, [data.column.key]: '' })));
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
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingColumn('');
    }
  };

  const handleDeleteColumn = async (key) => {
    if (!key) return;
    try {
      await deleteSupportDailyColumn(key);
      setColumns((current) => current.filter((entry) => entry.key !== key));
      setRows((current) => current.map((row) => {
        const next = { ...row, __styles: { ...(row.__styles || {}) } };
        delete next[key];
        delete next.__styles[key];
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
      const width = Math.max(72, Math.min(900, state.startWidth + event.clientX - state.startX));
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
        refreshRows(activeSheetId).catch(() => {});
      }
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };
  }, [activeSheetId, columns, refreshRows]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIdentity}>
          <Avatar src={getUserAvatar(supportMaster) || supportMaster?.avatarUrl || undefined} name={supportMaster?.name || 'Mauricio Nunes'} size="lg" className={styles.supportAvatar} fallbackColor={supportMaster?.avatarColor} />
          <div className={styles.heroTitle}>
            <span className={styles.eyebrow}>Operação de suporte</span>
            <div className={styles.heroNameRow}>
              <h1>{supportMaster?.name || 'Mauricio Nunes'}</h1>
              <span className={styles.roleBadgeBlackHole}>{roleLabel(supportMaster?.role || 'suporte_tecnologia')}</span>
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          {canCreateDemand ? (
            <Button type="button" size="sm" onClick={() => setDemandModalOpen(true)}>
              <PlusIcon size={14} /> Nova demanda
            </Button>
          ) : null}
          <span className={styles.heroIcon} aria-hidden="true"><BotIcon size={18} /></span>
        </div>
      </section>

      <section className={styles.sheetPanel}>
        <header className={styles.sheetHeader}>
          <h2><CalendarIcon size={15} /> Programação diária</h2>
          {canEditBoard ? (
            <div className={styles.sheetActions}>
              <SheetToolbar disabled={!selectedCell} onCommand={handleApplyFormat} />
              <Button type="button" size="sm" onClick={handleAddSheet} disabled={creatingSheet}><PlusIcon size={14} /> Nova planilha</Button>
              <Button type="button" size="sm" onClick={handleAddColumn} disabled={creatingColumn}><PlusIcon size={14} /> Nova coluna</Button>
              <Button type="button" size="sm" onClick={handleAddRow} disabled={creatingRow}><PlusIcon size={14} /> Nova linha</Button>
            </div>
          ) : null}
        </header>

        <div className={styles.sheetTopbar}>
          <div className={styles.sheetTabs}>
            {sheets.map((sheet) => (
              <div key={sheet.id} className={`${styles.sheetTab} ${sheet.id === activeSheetId ? styles.sheetTabActive : ''}`.trim()}>
                <input
                  value={sheet.name}
                  disabled={!canEditBoard}
                  onFocus={() => {
                    if (sheet.id !== activeSheetId) refreshRows(sheet.id).catch(() => {});
                  }}
                  onChange={(event) => setSheets((current) => current.map((item) => (item.id === sheet.id ? { ...item, name: event.target.value } : item)))}
                  onBlur={(event) => canEditBoard && handleSheetNameCommit(sheet.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                {canEditBoard && sheets.length > 1 ? <button type="button" onClick={() => handleDeleteSheet(sheet.id)}><CloseIcon size={10} /></button> : null}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sheetScroller}>
          <table className={styles.sheetTable}>
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
                    <HeaderCell column={column} editable={canEditBoard} onLabelChange={handleColumnLabelChange} onLabelCommit={handleColumnLabelCommit} onResizeStart={handleResizeStart} onDelete={handleDeleteColumn} />
                  </th>
                ))}
                {canEditBoard ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? <tr><td colSpan={columns.length + (canEditBoard ? 2 : 1)} className={styles.sheetEmpty}>Carregando</td></tr> : null}
              {!rowsLoading && rows.length === 0 ? <tr><td colSpan={columns.length + (canEditBoard ? 2 : 1)} className={styles.sheetEmpty}>Sem registros.</td></tr> : null}
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className={styles.rowIndex}>{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.key} data-column={column.key}>
                      <SheetCell
                        row={row}
                        column={column}
                        editable={canEditBoard}
                        saving={savingCell === `${row.id}:${column.key}`}
                        selected={selectedCell?.rowId === row.id && selectedCell?.key === column.key}
                        onSelect={(rowId, key, element) => setSelectedCell({ rowId, key, element })}
                        onChange={handleCellChange}
                        onCommit={handleCellCommit}
                      />
                    </td>
                  ))}
                  {canEditBoard ? <td className={styles.actionCell}><button type="button" onClick={() => handleDeleteRow(row.id)} title="Remover linha"><TrashIcon size={13} /></button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className={styles.sheetFooter}>
          <span>{rows.length} registros</span>
          {savingCell || savingColumn ? <span><SaveIcon size={13} /> Salvando</span> : null}
        </footer>
      </section>

      <DemandModal
        open={demandModalOpen}
        title="Nova demanda"
        defaultType="support"
        defaultAssigneeUserId={defaultAssigneeId}
        assigneeUsers={supportUsers}
        users={activeUsers}
        clients={clients}
        creating={creatingTask}
        onClose={() => !creatingTask && setDemandModalOpen(false)}
        onSubmit={handleCreateTask}
        onError={(message) => showToast(message, { variant: 'warning' })}
      />
    </div>
  );
}
