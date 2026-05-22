import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import DemandModal from '../components/tasks/DemandModal.jsx';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon } from '../components/ui/Icons.jsx';
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

const SHEET_TEXT_COLORS = [
  { value: '#f8fafc', label: 'Branco' },
  { value: '#cbd5e1', label: 'Cinza claro' },
  { value: '#94a3b8', label: 'Cinza' },
  { value: '#64748b', label: 'Cinza escuro' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#84cc16', label: 'Lima' },
  { value: '#facc15', label: 'Amarelo' },
  { value: '#fb923c', label: 'Laranja' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#fb7185', label: 'Rosa' },
  { value: '#c084fc', label: 'Roxo' },
  { value: '#818cf8', label: 'Índigo' },
  { value: '#60a5fa', label: 'Azul' },
  { value: '#22d3ee', label: 'Ciano' },
  { value: '#2dd4bf', label: 'Turquesa' },
  { value: '#e2e8f0', label: 'Neutro' },
];

const SHEET_FILL_COLORS = [
  { value: 'transparent', label: 'Sem fundo' },
  { value: '#0f172a', label: 'Slate' },
  { value: '#111827', label: 'Grafite' },
  { value: '#1f2937', label: 'Cinza' },
  { value: '#11261a', label: 'Verde escuro' },
  { value: '#1f2a10', label: 'Lima escuro' },
  { value: '#2a2106', label: 'Amarelo escuro' },
  { value: '#2b1709', label: 'Laranja escuro' },
  { value: '#34191d', label: 'Vermelho escuro' },
  { value: '#321827', label: 'Rosa escuro' },
  { value: '#251634', label: 'Roxo escuro' },
  { value: '#1b1d38', label: 'Índigo escuro' },
  { value: '#111f35', label: 'Azul escuro' },
  { value: '#0d2a33', label: 'Ciano escuro' },
  { value: '#0d2b27', label: 'Turquesa escuro' },
  { value: '#020617', label: 'Preto' },
];

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
    width: Math.max(5, Number(column.width || 180)),
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

function preserveSelectionRange() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  return selection.getRangeAt(0).cloneRange();
}

function restoreSelectionRange(range) {
  if (!range) return false;
  const selection = window.getSelection?.();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function normalizeStyle(style = {}) {
  const next = { ...style };
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined || next[key] === null || next[key] === '') delete next[key];
  });
  return next;
}

function SheetCell({ row, column, editable, saving, selected, onSelect, onChange, onCommit, onContextMenu }) {
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
        onContextMenu={(event) => onContextMenu?.(event, row.id, column.key)}
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
      onFocus={() => onSelect(row.id, column.key, ref.current, preserveSelectionRange())}
      onMouseDown={() => onSelect(row.id, column.key, ref.current, preserveSelectionRange())}
      onMouseUp={() => onSelect(row.id, column.key, ref.current, preserveSelectionRange())}
      onKeyUp={() => onSelect(row.id, column.key, ref.current, preserveSelectionRange())}
      onContextMenu={(event) => onContextMenu?.(event, row.id, column.key)}
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

function HeaderCell({ column, editable, onLabelChange, onLabelCommit, onResizeStart, onContextMenu }) {
  return (
    <div className={styles.headerCellInner} onContextMenu={(event) => onContextMenu?.(event, column.key)}>
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

function ColorPopover({ label, disabled, colors, onSelect, title }) {
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
        aria-label={title || label}
        aria-expanded={open}
        title={title || label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open ? (
        <div className={styles.colorMenu} role="menu" aria-label={title || label}>
          <div className={styles.colorMenuHeader}>{title || label}</div>
          <div className={styles.colorGrid}>
            {colors.map((color) => (
              <button
                key={color.value}
                type="button"
                className={styles.colorSwatch}
                style={color.value === 'transparent' ? undefined : { '--swatch-color': color.value }}
                data-empty={color.value === 'transparent' || undefined}
                aria-label={color.label}
                title={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(color.value);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MoreFormatMenu({ disabled, onCommand }) {
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

  const run = (command, value = null) => {
    onCommand(command, value);
    setOpen(false);
  };

  return (
    <div className={styles.moreFormat} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className={styles.moreFormatTrigger}
        aria-label="Todas as opções de formatação"
        aria-expanded={open}
        title="Todas as opções"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        Todos
      </button>
      {open ? (
        <div className={styles.moreFormatMenu} role="menu" aria-label="Todas as opções de formatação">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('insertUnorderedList')}>Lista com marcadores</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('insertOrderedList')}>Lista numerada</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('outdent')}>Diminuir recuo</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('indent')}>Aumentar recuo</button>
          <span className={styles.moreFormatDivider} />
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('undo')}>Desfazer edição</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('redo')}>Refazer edição</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run('removeFormat')}>Limpar formatação</button>
        </div>
      ) : null}
    </div>
  );
}

function SheetContextMenu({ menu, canEdit, onClose, onDeleteRow, onDeleteColumn }) {
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => onClose();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menu, onClose]);

  if (!menu || !canEdit) return null;

  return (
    <div
      className={styles.contextMenu}
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label="Ações da planilha"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.columnKey ? (
        <button type="button" className={styles.contextDanger} onClick={() => onDeleteColumn(menu.columnKey)}>
          Excluir coluna
        </button>
      ) : null}
      {menu.rowId ? (
        <button type="button" className={styles.contextDanger} onClick={() => onDeleteRow(menu.rowId)}>
          Excluir linha
        </button>
      ) : null}
      {!menu.rowId && !menu.columnKey ? <span>Sem ações disponíveis</span> : null}
    </div>
  );
}

function SheetToolbar({ disabled, onCommand }) {
  const preventBlur = (event) => event.preventDefault();

  return (
    <div className={styles.sheetToolbar} aria-label="Formatação" onMouseDown={preventBlur}>
      <button type="button" disabled={disabled} title="Negrito" aria-label="Negrito" onClick={() => onCommand('bold')}><strong>B</strong></button>
      <button type="button" disabled={disabled} title="Itálico" aria-label="Itálico" onClick={() => onCommand('italic')}><em>I</em></button>
      <button type="button" disabled={disabled} title="Sublinhado" aria-label="Sublinhado" onClick={() => onCommand('underline')}><span className={styles.underlineIcon}>U</span></button>
      <button type="button" disabled={disabled} title="Riscado" aria-label="Riscado" onClick={() => onCommand('strikeThrough')}><span className={styles.strikeIcon}>S</span></button>
      <span className={styles.toolbarDivider} />
      <button type="button" disabled={disabled} title="Alinhar à esquerda" aria-label="Alinhar à esquerda" onClick={() => onCommand('justifyLeft')}>Esq</button>
      <button type="button" disabled={disabled} title="Centralizar" aria-label="Centralizar" onClick={() => onCommand('justifyCenter')}>Centro</button>
      <button type="button" disabled={disabled} title="Alinhar à direita" aria-label="Alinhar à direita" onClick={() => onCommand('justifyRight')}>Dir</button>
      <span className={styles.toolbarDivider} />
      <ColorPopover label="Texto" title="Cor do texto" disabled={disabled} colors={SHEET_TEXT_COLORS} onSelect={(color) => onCommand('foreColor', color)} />
      <ColorPopover label="Fundo" title="Cor de fundo" disabled={disabled} colors={SHEET_FILL_COLORS} onSelect={(color) => onCommand('hiliteColor', color)} />
      <span className={styles.toolbarDivider} />
      <MoreFormatMenu disabled={disabled} onCommand={onCommand} />
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
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const selectionRangeRef = useRef(null);
  const resizeRef = useRef(null);
  const sheetScrollerRef = useRef(null);

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

  const sheetMinWidth = useMemo(() => {
    const dataColumnsWidth = columns.reduce((total, column) => total + Math.max(5, Number(column.width || 5)), 0);
    return dataColumnsWidth + 46;
  }, [columns]);

  const handleSheetWheel = useCallback((event) => {
    const scroller = sheetScrollerRef.current;
    if (!scroller) return;

    const verticalIntent = Math.abs(event.deltaY) > Math.abs(event.deltaX);
    if (event.shiftKey && event.deltaY) {
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
      return;
    }

    if (verticalIntent) {
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
    }
  }, []);

  const handleSelectCell = useCallback((rowId, key, element, range = null) => {
    if (range) selectionRangeRef.current = range;
    else if (element?.contains(document.activeElement)) selectionRangeRef.current = preserveSelectionRange();
    setSelectedCell({ rowId, key, element });
  }, []);

  const handleOpenContextMenu = useCallback((event, rowId = null, columnKey = null) => {
    if (!canEditBoard) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ rowId, columnKey, x: event.clientX, y: event.clientY });
  }, [canEditBoard]);

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);


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

  useEffect(() => {
    refreshRows().catch(() => showToast('Não foi possível carregar a programação diária.', { variant: 'error' }));
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
      await refreshRows(activeSheetId);
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
    handleCloseContextMenu();
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

    target.focus({ preventScroll: true });
    restoreSelectionRange(selectionRangeRef.current);

    let commandValue = value;
    if (command === 'hiliteColor' && value === 'transparent') commandValue = null;

    const didRun = document.execCommand(command, false, commandValue);
    if (command === 'hiliteColor' && !didRun) document.execCommand('backColor', false, commandValue);
    if (command === 'removeFormat') target.querySelectorAll('span,font,b,strong,i,em,u,s,strike').forEach((node) => node.removeAttribute('style'));

    selectionRangeRef.current = preserveSelectionRange();
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
    handleCloseContextMenu();
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
      const width = Math.max(5, state.startWidth + event.clientX - state.startX);
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
                {canEditBoard && sheets.length > 1 ? (
                  <button type="button" className={styles.softDeleteButton} onClick={() => handleDeleteSheet(sheet.id)} aria-label={`Remover ${sheet.name}`} title="Remover planilha">
                    <CloseIcon size={10} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div
          ref={sheetScrollerRef}
          className={styles.sheetScroller}
          style={{ '--sheet-min-width': `${sheetMinWidth}px` }}
          onWheel={handleSheetWheel}
        >
          <table className={styles.sheetTable}>
            <colgroup>
              <col style={{ width: 46 }} />
              {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
                          </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {columns.map((column) => (
                  <th key={column.key} data-saving={savingColumn === column.key || undefined}>
                    <HeaderCell column={column} editable={canEditBoard} onLabelChange={handleColumnLabelChange} onLabelCommit={handleColumnLabelCommit} onResizeStart={handleResizeStart} onContextMenu={handleOpenContextMenu} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? <tr><td colSpan={columns.length + 1} className={styles.sheetEmpty}>Carregando</td></tr> : null}
              {!rowsLoading && rows.length === 0 ? <tr><td colSpan={columns.length + 1} className={styles.sheetEmpty}>Sem registros.</td></tr> : null}
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className={styles.rowIndex} onContextMenu={(event) => handleOpenContextMenu(event, row.id, null)}>{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.key} data-column={column.key}>
                      <SheetCell
                        row={row}
                        column={column}
                        editable={canEditBoard}
                        saving={savingCell === `${row.id}:${column.key}`}
                        selected={selectedCell?.rowId === row.id && selectedCell?.key === column.key}
                        onSelect={handleSelectCell}
                        onChange={handleCellChange}
                        onCommit={handleCellCommit}
                        onContextMenu={handleOpenContextMenu}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SheetContextMenu
          menu={contextMenu}
          canEdit={canEditBoard}
          onClose={handleCloseContextMenu}
          onDeleteRow={handleDeleteRow}
          onDeleteColumn={handleDeleteColumn}
        />

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
