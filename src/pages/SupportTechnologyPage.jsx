import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Avatar from '../components/ui/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
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
  { key: 'niche', label: 'Nicho / Campanha', width: 230, system: true },
  { key: 'promptStatus', label: 'Prompt', width: 170, system: true },
  { key: 'connectionStatus', label: 'Conexão', width: 190, system: true },
  { key: 'accessStatus', label: 'Acessos', width: 170, system: true },
  { key: 'activityStatus', label: 'Status', width: 150, system: true },
  { key: 'apiKey', label: 'API Key', width: 300, system: true },
  { key: 'notes', label: 'Observações', width: 320, system: true },
];

const BLANK_SHEET_COLUMN_WIDTH = 168;
const BLANK_SHEET_ROW_HEIGHT = 44;
const BLANK_SHEET_MIN_COLUMNS = 6;
const BLANK_SHEET_MIN_ROWS = 14;

const TEXT_COLORS = [
  '#ffffff', '#f8fafc', '#e5e7eb', '#cbd5e1', '#94a3b8', '#64748b',
  '#22c55e', '#86efac', '#84cc16', '#bef264', '#facc15', '#fde68a',
  '#fb923c', '#fdba74', '#ef4444', '#fca5a5', '#fb7185', '#f9a8d4',
  '#c084fc', '#ddd6fe', '#818cf8', '#a5b4fc', '#60a5fa', '#93c5fd',
  '#22d3ee', '#67e8f9', '#2dd4bf', '#5eead4', '#d6d3d1', '#a8a29e',
];

const FILL_COLORS = [
  'transparent', '#020617', '#08090a', '#0f172a', '#111827', '#1f2937',
  '#052e16', '#064e3b', '#16310d', '#365314', '#422006', '#713f12',
  '#431407', '#7c2d12', '#450a0a', '#7f1d1d', '#4a044e', '#831843',
  '#2e1065', '#4c1d95', '#1e1b4b', '#312e81', '#172554', '#1e3a8a',
  '#083344', '#155e75', '#042f2e', '#115e59', '#292524', '#44403c',
];

const FORMAT_GROUPS = [
  {
    title: 'Estrutura',
    commands: [
      ['insertUnorderedList', 'Lista com marcadores'],
      ['insertOrderedList', 'Lista numerada'],
      ['indent', 'Aumentar recuo'],
      ['outdent', 'Diminuir recuo'],
    ],
  },
  {
    title: 'Edição',
    commands: [
      ['undo', 'Desfazer'],
      ['redo', 'Refazer'],
      ['removeFormat', 'Limpar formatação'],
    ],
  },
];

const MASTER_SUPPORT_EMAIL = 'mauricionredifica@gmail.com';
const MASTER_SUPPORT_NAME = 'mauricio nunes';
const SUPPORT_ROLES = new Set(['suporte_tecnologia']);
const FALLBACK_SUPPORT_ROLES = new Set(['ceo', 'admin']);

function cleanText(value) {
  return String(value ?? '').trim();
}

function stripHtml(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeColumns(columns = []) {
  const source = Array.isArray(columns) ? columns : FALLBACK_DAILY_COLUMNS;
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

function toneFromContent(value = '') {
  const text = stripHtml(value).toLowerCase();
  if (text.includes('desconect') || text.includes('erro') || text.includes('inativo')) return 'danger';
  if (text.includes('pendente') || text.includes('revisar') || text.includes('ajustar')) return 'warning';
  if (text.includes('ok') || text.includes('conectado') || text.includes('ativo') || text.includes('implementado')) return 'success';
  return 'neutral';
}

function saveSelectionInside(element) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !element) return null;
  const range = selection.getRangeAt(0);
  const owner = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!owner || !element.contains(owner)) return null;
  return range.cloneRange();
}

function restoreSelection(element, range) {
  if (!element) return;
  element.focus({ preventScroll: true });
  const selection = window.getSelection?.();
  if (!selection) return;
  selection.removeAllRanges();
  if (range) {
    selection.addRange(range);
    return;
  }
  const nextRange = document.createRange();
  nextRange.selectNodeContents(element);
  nextRange.collapse(false);
  selection.addRange(nextRange);
}

function preventToolbarBlur(event) {
  event.preventDefault();
}

function EditorButton({ disabled, title, active, children, onCommand }) {
  return (
    <button
      type="button"
      className={styles.editorButton}
      data-active={active || undefined}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseDown={preventToolbarBlur}
      onClick={onCommand}
    >
      {children}
    </button>
  );
}

function ColorMenu({ disabled, label, title, colors, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current?.contains(event.target)) return;
      setOpen(false);
    };
    const keyClose = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', keyClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', keyClose);
    };
  }, [open]);

  return (
    <div className={styles.colorMenuWrapper} ref={ref}>
      <button
        type="button"
        className={styles.editorButton}
        disabled={disabled}
        aria-expanded={open}
        aria-label={title}
        title={title}
        onMouseDown={preventToolbarBlur}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open ? (
        <div className={styles.colorMenu} role="menu" aria-label={title} onMouseDown={preventToolbarBlur}>
          <span className={styles.menuTitle}>{title}</span>
          <div className={styles.swatchGrid}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                style={color === 'transparent' ? undefined : { '--swatch': color }}
                data-empty={color === 'transparent' || undefined}
                aria-label={color === 'transparent' ? 'Sem fundo' : color}
                title={color === 'transparent' ? 'Sem fundo' : color}
                onMouseDown={preventToolbarBlur}
                onClick={() => {
                  onSelect(color);
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

function MoreMenu({ disabled, onCommand }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current?.contains(event.target)) return;
      setOpen(false);
    };
    const keyClose = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', keyClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', keyClose);
    };
  }, [open]);

  return (
    <div className={styles.moreMenuWrapper} ref={ref}>
      <button
        type="button"
        className={styles.editorButton}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Mais opções de edição"
        title="Mais opções"
        onMouseDown={preventToolbarBlur}
        onClick={() => setOpen((current) => !current)}
      >
        Todos
      </button>
      {open ? (
        <div className={styles.moreMenu} role="menu" aria-label="Mais opções de edição" onMouseDown={preventToolbarBlur}>
          {FORMAT_GROUPS.map((group) => (
            <div className={styles.moreMenuGroup} key={group.title}>
              <span className={styles.menuTitle}>{group.title}</span>
              {group.commands.map(([command, text]) => (
                <button
                  key={command}
                  type="button"
                  className={styles.menuItem}
                  onMouseDown={preventToolbarBlur}
                  onClick={() => {
                    onCommand(command);
                    setOpen(false);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditorToolbar({ disabled, onCommand }) {
  return (
    <div className={styles.editorToolbar} aria-label="Edição da célula ativa" onMouseDown={preventToolbarBlur}>
      <EditorButton disabled={disabled} title="Negrito" onCommand={() => onCommand('bold')}><strong>B</strong></EditorButton>
      <EditorButton disabled={disabled} title="Itálico" onCommand={() => onCommand('italic')}><em>I</em></EditorButton>
      <EditorButton disabled={disabled} title="Sublinhado" onCommand={() => onCommand('underline')}><span className={styles.underline}>U</span></EditorButton>
      <EditorButton disabled={disabled} title="Riscado" onCommand={() => onCommand('strikeThrough')}><span className={styles.strike}>S</span></EditorButton>
      <span className={styles.toolbarDivider} />
      <EditorButton disabled={disabled} title="Alinhar à esquerda" onCommand={() => onCommand('justifyLeft')}>Esq</EditorButton>
      <EditorButton disabled={disabled} title="Centralizar" onCommand={() => onCommand('justifyCenter')}>Centro</EditorButton>
      <EditorButton disabled={disabled} title="Alinhar à direita" onCommand={() => onCommand('justifyRight')}>Dir</EditorButton>
      <span className={styles.toolbarDivider} />
      <ColorMenu disabled={disabled} label="Texto" title="Cor do texto" colors={TEXT_COLORS} onSelect={(color) => onCommand('foreColor', color)} />
      <ColorMenu disabled={disabled} label="Fundo" title="Cor de fundo" colors={FILL_COLORS} onSelect={(color) => onCommand('hiliteColor', color)} />
      <span className={styles.toolbarDivider} />
      <MoreMenu disabled={disabled} onCommand={onCommand} />
    </div>
  );
}

function HeaderCell({ column, editable, onLabelChange, onLabelCommit, onResizeStart, onContextMenu }) {
  return (
    <div className={styles.headerCell} onContextMenu={(event) => onContextMenu(event, null, column.key)}>
      {editable ? (
        <input
          value={column.label}
          aria-label={`Nome da coluna ${column.label}`}
          onChange={(event) => onLabelChange(column.key, event.target.value)}
          onBlur={() => onLabelCommit(column.key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
          }}
        />
      ) : (
        <span>{column.label}</span>
      )}
      {editable ? (
        <button
          type="button"
          className={styles.resizeHandle}
          aria-label={`Redimensionar ${column.label}`}
          onMouseDown={(event) => onResizeStart(event, column.key)}
        />
      ) : null}
    </div>
  );
}

function SheetCell({ row, column, editable, selected, saving, onSelect, onChange, onCommit, onContextMenu }) {
  const ref = useRef(null);
  const value = String(row[column.key] || '');
  const style = row.__styles?.[column.key] || undefined;

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  if (!editable) {
    return (
      <div
        className={styles.readonlyCell}
        data-tone={toneFromContent(value)}
        style={style}
        title={stripHtml(value)}
        onContextMenu={(event) => onContextMenu(event, row.id, column.key)}
        dangerouslySetInnerHTML={{ __html: value || '—' }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={styles.sheetCell}
      data-selected={selected || undefined}
      data-saving={saving || undefined}
      data-tone={toneFromContent(value)}
      data-cell-id={`${row.id}:${column.key}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      tabIndex={0}
      onFocus={() => onSelect(row.id, column.key, ref.current)}
      onMouseUp={() => onSelect(row.id, column.key, ref.current)}
      onKeyUp={() => onSelect(row.id, column.key, ref.current)}
      onInput={(event) => onChange(row.id, column.key, event.currentTarget.innerHTML)}
      onBlur={() => onCommit(row.id, column.key)}
      onContextMenu={(event) => onContextMenu(event, row.id, column.key)}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
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

function SheetContextMenu({ menu, canEdit, onClose, onDeleteRow, onDeleteColumn }) {
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => onClose();
    const keyClose = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', keyClose);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', keyClose);
    };
  }, [menu, onClose]);

  if (!menu || !canEdit) return null;

  return (
    <div
      className={styles.contextMenu}
      role="menu"
      aria-label="Ações da planilha"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className={styles.menuTitle}>Ações</span>
      {menu.rowId ? (
        <button type="button" className={styles.dangerItem} onClick={() => onDeleteRow(menu.rowId)}>
          <TrashIcon size={14} /> Excluir linha
        </button>
      ) : null}
      {menu.columnKey ? (
        <button type="button" className={styles.dangerItem} onClick={() => onDeleteColumn(menu.columnKey)}>
          <TrashIcon size={14} /> Excluir coluna
        </button>
      ) : null}
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
  const [activeCell, setActiveCell] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const rangeRef = useRef(null);
  const resizeRef = useRef(null);
  const scrollerRef = useRef(null);

  const activeUsers = useMemo(() => (
    Array.isArray(userDirectory) ? userDirectory.filter((item) => item?.id && item?.active !== false) : []
  ), [userDirectory]);

  const supportMaster = useMemo(() => {
    const directoryMatch = activeUsers.find((item) => (
      String(item.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
      || String(item.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
    ));
    if (directoryMatch) return directoryMatch;
    const currentUserIsMaster = (
      String(user?.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
      || String(user?.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
    );
    return currentUserIsMaster ? user : null;
  }, [activeUsers, user]);

  const supportUsers = useMemo(() => {
    if (supportMaster?.id) return [supportMaster];
    const direct = activeUsers.filter((item) => SUPPORT_ROLES.has(item.role));
    if (direct.length) return direct;
    const fallback = activeUsers.filter((item) => FALLBACK_SUPPORT_ROLES.has(item.role));
    return fallback.length ? fallback : activeUsers;
  }, [activeUsers, supportMaster]);

  const defaultAssigneeId = supportMaster?.id || supportUsers[0]?.id || user?.id || '';
  const canEditBoard = hasPermission(user, 'support.board.edit');
  const canCreateDemand = hasPermission(user, 'support.view');

  const sheetMinWidth = useMemo(() => {
    const total = columns.reduce((sum, column) => sum + Math.max(5, Number(column.width || 5)), 0);
    return total + 54;
  }, [columns]);

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
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    refreshRows().catch(() => showToast('Não foi possível carregar a programação diária.', { variant: 'error' }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const syncSelection = () => {
      if (!activeCell?.element) return;
      const range = saveSelectionInside(activeCell.element);
      if (range) rangeRef.current = range;
    };
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [activeCell]);

  const selectCell = useCallback((rowId, key, element) => {
    const range = saveSelectionInside(element);
    if (range) rangeRef.current = range;
    setActiveCell({ rowId, key, element });
  }, []);

  const openContextMenu = useCallback((event, rowId = null, columnKey = null) => {
    if (!canEditBoard) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ rowId, columnKey, x: event.clientX, y: event.clientY });
  }, [canEditBoard]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleSheetWheel = useCallback((event) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    }
  }, []);

  const estimateBlankSheetSize = useCallback(() => {
    const workspaceWidth = Math.max(900, scrollerRef.current?.clientWidth || window.innerWidth - 360 || 1100);
    const workspaceHeight = Math.max(560, scrollerRef.current?.clientHeight || window.innerHeight - 360 || 620);
    const columnCount = Math.max(BLANK_SHEET_MIN_COLUMNS, Math.ceil((workspaceWidth - 54) / BLANK_SHEET_COLUMN_WIDTH));
    const rowCount = Math.max(BLANK_SHEET_MIN_ROWS, Math.ceil((workspaceHeight - 96) / BLANK_SHEET_ROW_HEIGHT));
    return { columnCount, rowCount, columnWidth: BLANK_SHEET_COLUMN_WIDTH };
  }, []);

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
        await Promise.allSettled(form.attachments.map((item) => createTaskAttachment(taskId, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })));
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
      const data = await createSupportDailySheet({ name: `Planilha ${sheets.length + 1}`, ...estimateBlankSheetSize() });
      setSheets(Array.isArray(data?.sheets) ? data.sheets : []);
      if (data?.sheet?.id) await refreshRows(data.sheet.id);
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
    closeContextMenu();
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
    const saveKey = `${id}:${key}`;
    setSavingCell(saveKey);
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
    if (!activeCell || !canEditBoard) return;
    const { rowId, key } = activeCell;
    const element = activeCell.element || document.querySelector(`[data-cell-id="${rowId}:${key}"]`);
    if (!element) return;

    restoreSelection(element, rangeRef.current);

    let commandValue = value;
    if (command === 'hiliteColor' && value === 'transparent') {
      document.execCommand('removeFormat', false, null);
    } else if (command === 'hiliteColor') {
      const ran = document.execCommand('hiliteColor', false, commandValue);
      if (!ran) document.execCommand('backColor', false, commandValue);
    } else {
      document.execCommand(command, false, commandValue);
    }

    rangeRef.current = saveSelectionInside(element);
    const nextHtml = element.innerHTML;
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
      const data = await createSupportDailyColumn({ sheetId: activeSheetId, label: 'Nova coluna', width: 200 });
      if (data?.columns) setColumns(normalizeColumns(data.columns));
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
    closeContextMenu();
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
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMove = (event) => {
      const state = resizeRef.current;
      if (!state) return;
      const width = Math.max(5, state.startWidth + event.clientX - state.startX);
      setColumns((current) => current.map((column) => (column.key === state.key ? { ...column, width } : column)));
    };
    const handleUp = async () => {
      const state = resizeRef.current;
      if (!state) return;
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const column = columns.find((entry) => entry.key === state.key);
      if (!column) return;
      try {
        await updateSupportDailyColumn(column.key, { width: column.width });
      } catch {
        refreshRows(activeSheetId).catch(() => {});
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [activeSheetId, columns, refreshRows]);

  return (
    <div className={styles.page}>
      <section className={styles.profileHero}>
        <div className={styles.heroIdentity}>
          <Avatar
            src={getUserAvatar(supportMaster) || supportMaster?.avatarUrl || undefined}
            name={supportMaster?.name || 'Mauricio Nunes'}
            size="lg"
            className={styles.avatar}
            fallbackColor={supportMaster?.avatarColor}
          />
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Tecnologia</span>
            <div className={styles.nameRow}>
              <h1>{supportMaster?.name || 'Mauricio Nunes'}</h1>
              <span className={styles.roleBadge}>{roleLabel(supportMaster?.role || 'suporte_tecnologia')}</span>
              <span className={styles.ownerBadge}>Responsável da tela</span>
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
        </div>

        <div className={styles.heroTags} aria-label="Planilhas da tecnologia">
          <span className={styles.tagLabel}>Planilhas</span>
          <div className={styles.sheetTabs}>
            {sheets.map((sheet) => (
              <div key={sheet.id} className={styles.sheetTab} data-active={sheet.id === activeSheetId || undefined}>
                <input
                  value={sheet.name}
                  disabled={!canEditBoard}
                  aria-label={`Nome da planilha ${sheet.name}`}
                  onFocus={() => {
                    if (sheet.id !== activeSheetId) refreshRows(sheet.id).catch(() => {});
                  }}
                  onChange={(event) => setSheets((current) => current.map((item) => (item.id === sheet.id ? { ...item, name: event.target.value } : item)))}
                  onBlur={(event) => canEditBoard && handleSheetNameCommit(sheet.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                  }}
                />
                {canEditBoard && sheets.length > 1 ? (
                  <button type="button" className={styles.deleteSheetButton} onClick={() => handleDeleteSheet(sheet.id)} aria-label={`Remover ${sheet.name}`} title="Remover planilha">
                    <CloseIcon size={11} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.workPanel}>
        <header className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.titleIcon}><CalendarIcon size={15} /></span>
            <div>
              <h2>Programação diária</h2>
              <p>Planilha operacional de implantação, acessos e status de suporte.</p>
            </div>
          </div>
          {canEditBoard ? (
            <div className={styles.panelActions}>
              <Button type="button" size="sm" onClick={handleAddSheet} disabled={creatingSheet}><PlusIcon size={14} /> Nova planilha</Button>
              <Button type="button" size="sm" onClick={handleAddColumn} disabled={creatingColumn}><PlusIcon size={14} /> Nova coluna</Button>
              <Button type="button" size="sm" onClick={handleAddRow} disabled={creatingRow}><PlusIcon size={14} /> Nova linha</Button>
            </div>
          ) : null}
        </header>

        {canEditBoard ? (
          <div className={styles.editorBar}>
            <EditorToolbar disabled={!activeCell} onCommand={handleApplyFormat} />
            <span className={styles.editorHint}>Selecione uma célula para editar texto. Clique direito para excluir linha ou coluna.</span>
          </div>
        ) : null}

        <div className={styles.sheetFrame}>
          <div
            ref={scrollerRef}
            className={styles.sheetScroller}
            style={{ '--sheet-min-width': `${sheetMinWidth}px` }}
            onWheel={handleSheetWheel}
          >
            <table className={styles.sheetTable}>
              <colgroup>
                <col style={{ width: 54 }} />
                {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.indexHeader}>#</th>
                  {columns.map((column) => (
                    <th key={column.key} data-saving={savingColumn === column.key || undefined}>
                      <HeaderCell
                        column={column}
                        editable={canEditBoard}
                        onLabelChange={handleColumnLabelChange}
                        onLabelCommit={handleColumnLabelCommit}
                        onResizeStart={handleResizeStart}
                        onContextMenu={openContextMenu}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr><td colSpan={columns.length + 1} className={styles.emptyState}>Carregando programação diária...</td></tr>
                ) : null}
                {!rowsLoading && rows.length === 0 ? (
                  <tr><td colSpan={columns.length + 1} className={styles.emptyState}>Nenhum registro criado nesta planilha.</td></tr>
                ) : null}
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <td className={styles.rowIndex} onContextMenu={(event) => openContextMenu(event, row.id, null)}>{index + 1}</td>
                    {columns.map((column) => (
                      <td key={column.key} data-column={column.key}>
                        <SheetCell
                          row={row}
                          column={column}
                          editable={canEditBoard}
                          selected={activeCell?.rowId === row.id && activeCell?.key === column.key}
                          saving={savingCell === `${row.id}:${column.key}`}
                          onSelect={selectCell}
                          onChange={handleCellChange}
                          onCommit={handleCellCommit}
                          onContextMenu={openContextMenu}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className={styles.panelFooter}>
          <span><SaveIcon size={13} /> Alterações salvas automaticamente.</span>
          <span>{rows.length} registro{rows.length === 1 ? '' : 's'} · {columns.length} coluna{columns.length === 1 ? '' : 's'}</span>
        </footer>
      </section>

      <SheetContextMenu
        menu={contextMenu}
        canEdit={canEditBoard}
        onClose={closeContextMenu}
        onDeleteRow={handleDeleteRow}
        onDeleteColumn={handleDeleteColumn}
      />

      {demandModalOpen ? (
        <DemandModal
          open={demandModalOpen}
          clients={clients}
          users={activeUsers}
          assigneeUsers={supportUsers}
          defaultAssigneeUserId={defaultAssigneeId}
          creating={creatingTask}
          onClose={() => setDemandModalOpen(false)}
          onSubmit={handleCreateTask}
        />
      ) : null}
    </div>
  );
}
