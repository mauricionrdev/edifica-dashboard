import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import {
  createSupportDailyColumn,
  createSupportDailyRow,
  createSupportDailySheet,
  deleteSupportDailyColumn,
  deleteSupportDailyRow,
  listSupportDailyRows,
  updateSupportDailyColumn,
  updateSupportDailyRow,
  updateSupportDailySheet,
} from '../../api/support.js';
import styles from './WorkspaceSheets.module.css';
import { FILL_COLORS, TEXT_COLORS, cleanStyle, columnName, isCellInRange, normalizeText, selectionLabel } from './workspaceUtils.js';

const DEFAULT_STYLE = {};
const FONT_OPTIONS = [
  { id: '', label: 'Fonte padrão' },
  { id: 'inter', label: 'Inter' },
  { id: 'mono', label: 'Mono' },
];
const ALIGN_OPTIONS = [
  { id: 'left', label: 'Esquerda' },
  { id: 'center', label: 'Centro' },
  { id: 'right', label: 'Direita' },
];

function normalizeRows(rows = [], columns = []) {
  const keys = new Set(columns.map((column) => column.key));
  return rows.map((row, rowIndex) => {
    const stylesMap = row.__styles && typeof row.__styles === 'object' ? row.__styles : row.styles || {};
    const styles = {};
    Object.entries(stylesMap || {}).forEach(([key, style]) => {
      if (keys.has(key) && style && typeof style === 'object') {
        const cleaned = cleanStyle(style);
        if (Object.keys(cleaned).length) styles[key] = cleaned;
      }
    });
    const normalized = { ...row, position: Number(row.position || rowIndex + 1), __styles: styles };
    columns.forEach((column) => {
      if (normalized[column.key] === undefined || normalized[column.key] === null) normalized[column.key] = '';
    });
    return normalized;
  });
}

function styleForCell(style = {}) {
  return {
    fontWeight: style.bold ? 700 : 500,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
    textAlign: style.align || 'left',
    color: style.textColor || 'var(--text-primary)',
    background: style.fillColor || 'transparent',
    fontFamily: style.fontFamily === 'mono' ? 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)' : 'inherit',
  };
}

function getRange(selection) {
  if (!selection) return null;
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol),
  };
}

function compareCellValues(a, b) {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  const leftNumber = Number(left.replace(',', '.'));
  const rightNumber = Number(right.replace(',', '.'));
  if (left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function buildClipboardText(values = []) {
  return values.map((line) => line.join('\t')).join('\n');
}

function parseClipboardText(text = '') {
  return String(text || '').replace(/\r/g, '').split('\n').filter((line, index, list) => line !== '' || index < list.length - 1).map((line) => line.split('\t'));
}

function ConfirmDialog({ state, onCancel, onConfirm }) {
  if (!state) return null;
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={state.title}>
        <span>Confirmar ação</span>
        <h2>{state.title}</h2>
        <p>{state.description}</p>
        <div className={styles.dialogActions}>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="button" size="sm" variant="danger" onClick={onConfirm}>{state.confirmLabel || 'Confirmar'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceSheets() {
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [selection, setSelection] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [filterPanel, setFilterPanel] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [clipboard, setClipboard] = useState(null);
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [dragAnchor, setDragAnchor] = useState(null);
  const [resizing, setResizing] = useState(null);
  const gridRef = useRef(null);

  const activeCell = useMemo(() => {
    if (!selection) return null;
    return { rowIndex: selection.endRow, colIndex: selection.endCol, row: rows[selection.endRow], column: columns[selection.endCol] };
  }, [selection, rows, columns]);

  const activeStyle = activeCell?.row?.__styles?.[activeCell?.column?.key] || DEFAULT_STYLE;
  const activeColumn = activeCell?.column || columns[selection?.endCol || 0];

  const visibleRows = useMemo(() => {
    const term = normalizeText(query);
    const filters = Object.entries(columnFilters).filter(([, value]) => normalizeText(value));
    return rows
      .map((row, index) => ({ row, originalIndex: index }))
      .filter(({ row }) => {
        const matchesSearch = !term || columns.some((column) => normalizeText(row[column.key]).includes(term));
        if (!matchesSearch) return false;
        return filters.every(([key, value]) => normalizeText(row[key]).includes(normalizeText(value)));
      });
  }, [rows, columns, query, columnFilters]);

  const selectionStats = useMemo(() => {
    const entries = selectedEntries();
    const filled = entries.filter(({ row, column }) => String(row?.[column?.key] ?? '').trim()).length;
    return { total: entries.length, filled };
  }, [selection, rows, columns]);

  const loadSheet = useCallback(async (sheetId = activeSheetId) => {
    setLoading(true);
    try {
      const response = await listSupportDailyRows(sheetId ? sheetId : undefined);
      const nextColumns = Array.isArray(response?.columns) ? response.columns : [];
      const nextRows = normalizeRows(response?.rows || [], nextColumns);
      setSheets(Array.isArray(response?.sheets) ? response.sheets : []);
      setActiveSheetId(response?.activeSheetId || sheetId || response?.sheets?.[0]?.id || '');
      setColumns(nextColumns);
      setRows(nextRows);
      setColumnFilters({});
      setFilterPanel(null);
      setSelection(nextRows.length && nextColumns.length ? { startRow: 0, endRow: 0, startCol: 0, endCol: 0 } : null);
    } finally {
      setLoading(false);
    }
  }, [activeSheetId]);

  useEffect(() => { loadSheet(''); }, []);

  useEffect(() => {
    function stopDrag() { setDragAnchor(null); }
    window.addEventListener('mouseup', stopDrag);
    return () => window.removeEventListener('mouseup', stopDrag);
  }, []);

  useEffect(() => {
    if (!resizing) return undefined;
    function handleMove(event) {
      const width = Math.max(72, resizing.startWidth + event.clientX - resizing.startX);
      setColumns((current) => current.map((column) => (column.key === resizing.key ? { ...column, width } : column)));
    }
    async function handleUp(event) {
      const width = Math.max(72, resizing.startWidth + event.clientX - resizing.startX);
      setResizing(null);
      await updateSupportDailyColumn(resizing.key, { width });
      setStatus('Largura da coluna salva');
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizing]);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
      if (!gridRef.current?.contains(document.activeElement) && !gridRef.current?.contains(target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !isField) {
        event.preventDefault();
        selectAll();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && !isField) {
        event.preventDefault();
        copySelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x' && !isField) {
        event.preventDefault();
        cutSelection();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isField) {
        event.preventDefault();
        clearSelectionContent();
      }
      if (event.key === 'Enter' && !isField && activeCell) {
        event.preventDefault();
        startEdit(activeCell.rowIndex, activeCell.colIndex);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, rows, columns, activeCell, clipboard]);

  async function saveRow(rowIndex, patch) {
    const row = rows[rowIndex];
    if (!row?.id) return null;
    const response = await updateSupportDailyRow(row.id, patch);
    if (response?.row) {
      setRows((current) => current.map((item, index) => (index === rowIndex ? normalizeRows([response.row], columns)[0] : item)));
      return response.row;
    }
    return null;
  }

  async function persistCell(rowIndex, colIndex, value) {
    const column = columns[colIndex];
    if (!column) return;
    setRows((current) => current.map((row, index) => (index === rowIndex ? { ...row, [column.key]: value } : row)));
    await saveRow(rowIndex, { [column.key]: value });
    setStatus('Célula salva');
  }

  function selectedEntries() {
    const range = getRange(selection);
    if (!range) return [];
    const entries = [];
    for (let r = range.startRow; r <= range.endRow; r += 1) {
      for (let c = range.startCol; c <= range.endCol; c += 1) entries.push({ rowIndex: r, colIndex: c, row: rows[r], column: columns[c] });
    }
    return entries.filter((entry) => entry.row && entry.column);
  }

  function startEdit(rowIndex, colIndex) {
    const row = rows[rowIndex];
    const column = columns[colIndex];
    if (!row || !column) return;
    setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex });
    setEditing({ rowIndex, colIndex });
    setDraft(String(row[column.key] || ''));
    setMenu(null);
  }

  async function commitEdit() {
    if (!editing) return;
    const { rowIndex, colIndex } = editing;
    setEditing(null);
    await persistCell(rowIndex, colIndex, draft);
  }

  function selectCell(rowIndex, colIndex, event) {
    setMenu(null);
    if (event?.shiftKey && selection) {
      setSelection((current) => ({ startRow: current.startRow, startCol: current.startCol, endRow: rowIndex, endCol: colIndex }));
      return;
    }
    setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex });
  }

  function selectAll() {
    if (!rows.length || !columns.length) return;
    setSelection({ startRow: 0, endRow: rows.length - 1, startCol: 0, endCol: columns.length - 1 });
    setStatus('Planilha selecionada');
  }

  function selectColumn(colIndex, extend = false) {
    if (!columns[colIndex]) return;
    if (extend && selection) setSelection((current) => ({ ...current, endCol: colIndex, endRow: Math.max(0, rows.length - 1) }));
    else setSelection({ startRow: 0, endRow: Math.max(0, rows.length - 1), startCol: colIndex, endCol: colIndex });
  }

  function selectRow(rowIndex, extend = false) {
    if (!rows[rowIndex]) return;
    if (extend && selection) setSelection((current) => ({ ...current, endRow: rowIndex, endCol: Math.max(0, columns.length - 1) }));
    else setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: Math.max(0, columns.length - 1) });
  }

  function beginDrag(rowIndex, colIndex, event) {
    if (event.button !== 0) return;
    const anchor = event.shiftKey && selection ? { row: selection.startRow, col: selection.startCol } : { row: rowIndex, col: colIndex };
    setDragAnchor(anchor);
    setSelection({ startRow: anchor.row, startCol: anchor.col, endRow: rowIndex, endCol: colIndex });
  }

  function updateDrag(rowIndex, colIndex) {
    if (!dragAnchor) return;
    setSelection({ startRow: dragAnchor.row, startCol: dragAnchor.col, endRow: rowIndex, endCol: colIndex });
  }

  async function applyStyle(patch) {
    const byRow = new Map();
    selectedEntries().forEach(({ rowIndex, column, row }) => {
      const current = row.__styles?.[column.key] || DEFAULT_STYLE;
      const next = cleanStyle({ ...current, ...patch });
      const rowStyles = byRow.get(rowIndex) || {};
      rowStyles[column.key] = next;
      byRow.set(rowIndex, rowStyles);
    });
    setRows((current) => current.map((row, index) => {
      if (!byRow.has(index)) return row;
      return { ...row, __styles: { ...(row.__styles || {}), ...byRow.get(index) } };
    }));
    await Promise.all([...byRow.entries()].map(([rowIndex, styles]) => saveRow(rowIndex, { styles })));
    setStatus('Formatação salva');
  }

  async function clearFormatting() {
    const byRow = new Map();
    selectedEntries().forEach(({ rowIndex, column }) => {
      const rowStyles = byRow.get(rowIndex) || {};
      rowStyles[column.key] = {};
      byRow.set(rowIndex, rowStyles);
    });
    setRows((current) => current.map((row, index) => {
      if (!byRow.has(index)) return row;
      const nextStyles = { ...(row.__styles || {}) };
      Object.keys(byRow.get(index)).forEach((key) => { delete nextStyles[key]; });
      return { ...row, __styles: nextStyles };
    }));
    await Promise.all([...byRow.entries()].map(([rowIndex, styles]) => saveRow(rowIndex, { styles })));
    setStatus('Formatação limpa');
  }

  async function clearSelectionContent() {
    const byRow = new Map();
    selectedEntries().forEach(({ rowIndex, column }) => {
      const patch = byRow.get(rowIndex) || {};
      patch[column.key] = '';
      byRow.set(rowIndex, patch);
    });
    setRows((current) => current.map((row, index) => (byRow.has(index) ? { ...row, ...byRow.get(index) } : row)));
    await Promise.all([...byRow.entries()].map(([rowIndex, patch]) => saveRow(rowIndex, patch)));
    setStatus('Conteúdo limpo');
  }

  function copySelection(mode = 'all') {
    const range = getRange(selection);
    if (!range) return;
    const values = [];
    const styleMatrix = [];
    for (let r = range.startRow; r <= range.endRow; r += 1) {
      const valueLine = [];
      const styleLine = [];
      for (let c = range.startCol; c <= range.endCol; c += 1) {
        const column = columns[c];
        const row = rows[r];
        valueLine.push(String(row?.[column?.key] ?? ''));
        styleLine.push(cleanStyle(row?.__styles?.[column?.key] || {}));
      }
      values.push(valueLine);
      styleMatrix.push(styleLine);
    }
    const text = buildClipboardText(values);
    setClipboard({ values, styles: styleMatrix, mode: mode === 'cut' ? 'cut' : 'copy' });
    navigator.clipboard?.writeText(text).catch(() => {});
    setStatus(mode === 'cut' ? 'Recorte preparado' : 'Seleção copiada');
  }

  async function pasteValues(values, stylesMatrix = [], mode = 'all') {
    if (!selection || !values.length) return;
    const byRow = new Map();
    values.forEach((line, rowOffset) => {
      line.forEach((value, colOffset) => {
        const rowIndex = selection.startRow + rowOffset;
        const colIndex = selection.startCol + colOffset;
        const column = columns[colIndex];
        if (!rows[rowIndex] || !column) return;
        const patch = byRow.get(rowIndex) || {};
        if (mode !== 'format') patch[column.key] = value;
        if (mode !== 'values') patch.styles = { ...(patch.styles || {}), [column.key]: cleanStyle(stylesMatrix?.[rowOffset]?.[colOffset] || {}) };
        byRow.set(rowIndex, patch);
      });
    });
    setRows((current) => current.map((row, rowIndex) => {
      const patch = byRow.get(rowIndex);
      if (!patch) return row;
      const { styles: stylePatch, ...valuePatch } = patch;
      const nextStyles = { ...(row.__styles || {}) };
      Object.entries(stylePatch || {}).forEach(([key, style]) => {
        const cleaned = cleanStyle(style);
        if (Object.keys(cleaned).length) nextStyles[key] = cleaned;
        else delete nextStyles[key];
      });
      return { ...row, ...valuePatch, __styles: nextStyles };
    }));
    await Promise.all([...byRow.entries()].map(([rowIndex, patch]) => saveRow(rowIndex, patch)));
    setStatus(mode === 'format' ? 'Formatação colada' : mode === 'values' ? 'Valores colados' : 'Colagem concluída');
  }

  async function pasteSelection(mode = 'all') {
    if (!selection) return;
    if (clipboard) {
      await pasteValues(clipboard.values, clipboard.styles, mode);
      return;
    }
    const text = await navigator.clipboard?.readText().catch(() => '');
    const values = parseClipboardText(text || '');
    await pasteValues(values, [], 'values');
  }

  async function cutSelection() {
    copySelection('cut');
    await clearSelectionContent();
    await clearFormatting();
  }

  async function handleGridPaste(event) {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    await pasteValues(parseClipboardText(text), [], 'values');
  }

  async function addRow(after = true) {
    const response = await createSupportDailyRow({ sheetId: activeSheetId });
    if (response?.row) {
      const newRow = normalizeRows([response.row], columns)[0];
      const insertAt = selection ? (after ? getRange(selection).endRow + 1 : getRange(selection).startRow) : rows.length;
      const next = [...rows];
      next.splice(insertAt, 0, newRow);
      setRows(next);
      await Promise.all(next.map((row, index) => updateSupportDailyRow(row.id, { position: index + 1 })));
      setSelection({ startRow: insertAt, endRow: insertAt, startCol: 0, endCol: 0 });
      setStatus('Linha inserida');
    }
  }

  async function duplicateRow() {
    const range = getRange(selection);
    if (!range) return;
    const source = rows[range.startRow];
    const response = await createSupportDailyRow({ sheetId: activeSheetId });
    if (!response?.row) return;
    const values = {};
    columns.forEach((column) => { values[column.key] = source[column.key] || ''; });
    values.styles = source.__styles || {};
    const saved = await updateSupportDailyRow(response.row.id, values);
    const newRow = normalizeRows([saved?.row || { ...response.row, ...values }], columns)[0];
    const next = [...rows];
    next.splice(range.endRow + 1, 0, newRow);
    setRows(next);
    await Promise.all(next.map((row, index) => updateSupportDailyRow(row.id, { position: index + 1 })));
    setStatus('Linha duplicada');
  }

  async function addColumn(after = true) {
    const label = columnName(columns.length);
    const response = await createSupportDailyColumn({ sheetId: activeSheetId, label, width: 160 });
    if (response?.column) {
      const range = getRange(selection);
      const insertAt = range ? (after ? range.endCol + 1 : range.startCol) : columns.length;
      const next = [...columns];
      next.splice(insertAt, 0, response.column);
      setColumns(next);
      await Promise.all(next.map((column, index) => updateSupportDailyColumn(column.key, { position: index + 1 })));
      setSelection({ startRow: 0, endRow: 0, startCol: insertAt, endCol: insertAt });
      setStatus('Coluna inserida');
    }
  }

  async function duplicateColumn() {
    const range = getRange(selection);
    if (!range) return;
    const source = columns[range.startCol];
    const response = await createSupportDailyColumn({ sheetId: activeSheetId, label: `${source.label || columnName(range.startCol)} cópia`, width: source.width || 160 });
    if (!response?.column) return;
    const nextColumns = [...columns];
    nextColumns.splice(range.endCol + 1, 0, response.column);
    setColumns(nextColumns);
    await Promise.all(nextColumns.map((column, index) => updateSupportDailyColumn(column.key, { position: index + 1 })));
    const updates = rows.map((row, rowIndex) => {
      const style = row.__styles?.[source.key] || {};
      return saveRow(rowIndex, { [response.column.key]: row[source.key] || '', styles: { [response.column.key]: style } });
    });
    await Promise.all(updates);
    setStatus('Coluna duplicada');
  }

  function askDelete(kind) {
    if (!selection) return;
    const range = getRange(selection);
    setConfirm({
      kind,
      title: kind === 'row' ? 'Excluir linha selecionada?' : 'Excluir coluna selecionada?',
      description: kind === 'row' ? `A linha ${range.startRow + 1} será removida da planilha.` : `A coluna ${columnName(range.startCol)} será removida da planilha.`,
      confirmLabel: 'Excluir',
    });
  }

  async function confirmDelete() {
    if (!confirm || !selection) return;
    const range = getRange(selection);
    if (confirm.kind === 'row') {
      const target = rows[range.startRow];
      await deleteSupportDailyRow(target.id);
      setRows((current) => current.filter((_, index) => index !== range.startRow));
      setSelection(null);
    }
    if (confirm.kind === 'column') {
      const target = columns[range.startCol];
      await deleteSupportDailyColumn(target.key);
      setColumns((current) => current.filter((_, index) => index !== range.startCol));
      setSelection(null);
    }
    setConfirm(null);
  }

  async function sortByColumn(direction = 'asc') {
    const column = activeColumn;
    if (!column) return;
    const next = [...rows].sort((a, b) => compareCellValues(a[column.key], b[column.key]) * (direction === 'desc' ? -1 : 1));
    setRows(next);
    await Promise.all(next.map((row, index) => updateSupportDailyRow(row.id, { position: index + 1 })));
    setStatus(direction === 'desc' ? 'Ordenado Z → A' : 'Ordenado A → Z');
  }

  async function resizeColumnToContent(colIndex = selection?.endCol || 0) {
    const column = columns[colIndex];
    if (!column) return;
    const longest = Math.max(String(column.label || '').length, ...rows.map((row) => String(row[column.key] || '').length));
    const width = Math.min(420, Math.max(96, longest * 8 + 36));
    setColumns((current) => current.map((item, index) => (index === colIndex ? { ...item, width } : item)));
    await updateSupportDailyColumn(column.key, { width });
    setStatus('Largura ajustada');
  }

  async function createSheet() {
    const response = await createSupportDailySheet({ name: 'Nova planilha', columnCount: 8, rowCount: 24 });
    if (response?.sheet?.id) await loadSheet(response.sheet.id);
  }

  async function renameSheet(sheetId, name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const response = await updateSupportDailySheet(sheetId, { name: cleanName });
    if (response?.sheets) setSheets(response.sheets);
  }

  function openMenu(event, context, rowIndex = selection?.endRow || 0, colIndex = selection?.endCol || 0) {
    event.preventDefault();
    const width = 300;
    const height = 470;
    const x = Math.min(event.clientX, window.innerWidth - width - 16);
    const y = Math.min(event.clientY, window.innerHeight - height - 16);
    if (context === 'row') selectRow(rowIndex, event.shiftKey);
    if (context === 'column') selectColumn(colIndex, event.shiftKey);
    if (context === 'cell' && !isCellInRange(rowIndex, colIndex, selection)) setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex });
    setMenu({ x: Math.max(16, x), y: Math.max(16, y), context });
  }

  function openFilterForColumn(columnKey = activeColumn?.key) {
    if (!columnKey) return;
    const column = columns.find((item) => item.key === columnKey);
    setFilterPanel({ columnKey, label: column?.label || columnName(columns.findIndex((item) => item.key === columnKey)) });
    setMenu(null);
  }

  function clearColumnFilter(columnKey) {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      return next;
    });
  }

  const activeFilterCount = Object.values(columnFilters).filter((value) => normalizeText(value)).length;

  return (
    <section className={styles.sheetApp} ref={gridRef} tabIndex={-1}>
      <div className={styles.sheetTabs}>
        {sheets.filter((sheet) => !sheet.isArchived).map((sheet) => (
          <input
            key={sheet.id}
            className={sheet.id === activeSheetId ? styles.activeSheetTab : styles.sheetTab}
            value={sheet.name || 'Planilha'}
            onFocus={() => sheet.id !== activeSheetId && loadSheet(sheet.id)}
            onChange={(event) => setSheets((current) => current.map((item) => (item.id === sheet.id ? { ...item, name: event.target.value } : item)))}
            onBlur={(event) => renameSheet(sheet.id, event.target.value)}
          />
        ))}
        <Button type="button" size="sm" onClick={createSheet}>Nova planilha</Button>
      </div>

      <div className={styles.toolbar}>
        <input className={styles.searchBox} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na planilha" />
        <button type="button" onClick={() => openFilterForColumn()}>Filtro</button>
        <span className={styles.divider} />
        <button type="button" onClick={() => copySelection()}>Copiar</button>
        <button type="button" onClick={cutSelection}>Recortar</button>
        <button type="button" disabled={!clipboard} onClick={() => pasteSelection('all')}>Colar</button>
        <span className={styles.divider} />
        <button type="button" data-active={activeStyle.bold} onClick={() => applyStyle({ bold: !activeStyle.bold })}>B</button>
        <button type="button" data-active={activeStyle.italic} onClick={() => applyStyle({ italic: !activeStyle.italic })}>I</button>
        <button type="button" data-active={activeStyle.underline} onClick={() => applyStyle({ underline: !activeStyle.underline })}>U</button>
        <button type="button" data-active={activeStyle.strike} onClick={() => applyStyle({ strike: !activeStyle.strike })}>S</button>
        <select value={activeStyle.textColor || 'var(--text-primary)'} onChange={(event) => applyStyle({ textColor: event.target.value })} aria-label="Cor do texto">
          {TEXT_COLORS.map((color) => <option key={color.id} value={color.value}>{color.label}</option>)}
        </select>
        <select value={activeStyle.fillColor || 'transparent'} onChange={(event) => applyStyle({ fillColor: event.target.value })} aria-label="Preenchimento">
          {FILL_COLORS.map((color) => <option key={color.id} value={color.value}>{color.label}</option>)}
        </select>
        <select value={activeStyle.fontFamily || ''} onChange={(event) => applyStyle({ fontFamily: event.target.value })} aria-label="Fonte">
          {FONT_OPTIONS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
        </select>
        <select value={activeStyle.align || 'left'} onChange={(event) => applyStyle({ align: event.target.value })} aria-label="Alinhamento">
          {ALIGN_OPTIONS.map((align) => <option key={align.id} value={align.id}>{align.label}</option>)}
        </select>
        <button type="button" onClick={clearFormatting}>Limpar formato</button>
        <span className={styles.divider} />
        <button type="button" onClick={() => addRow(true)}>+ Linha</button>
        <button type="button" onClick={() => addColumn(true)}>+ Coluna</button>
      </div>

      {(activeFilterCount > 0 || filterPanel) && (
        <div className={styles.filterBar}>
          {Object.entries(columnFilters).filter(([, value]) => normalizeText(value)).map(([key, value]) => {
            const index = columns.findIndex((column) => column.key === key);
            return (
              <button key={key} type="button" onClick={() => openFilterForColumn(key)}>
                {columns[index]?.label || columnName(index)} contém “{value}”
                <span onClick={(event) => { event.stopPropagation(); clearColumnFilter(key); }}>×</span>
              </button>
            );
          })}
          {activeFilterCount > 0 && <button type="button" onClick={() => setColumnFilters({})}>Limpar filtros</button>}
        </div>
      )}

      {filterPanel && (
        <div className={styles.filterPanel}>
          <span>Filtro · {filterPanel.label}</span>
          <input
            autoFocus
            value={columnFilters[filterPanel.columnKey] || ''}
            onChange={(event) => setColumnFilters((current) => ({ ...current, [filterPanel.columnKey]: event.target.value }))}
            placeholder="Digite o valor para filtrar"
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => clearColumnFilter(filterPanel.columnKey)}>Limpar</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setFilterPanel(null)}>Fechar</Button>
        </div>
      )}

      <div className={styles.formulaBar}>
        <span>{selectionLabel(selection, columns)}</span>
        <input
          value={activeCell ? String(activeCell.row?.[activeCell.column?.key] || '') : ''}
          onChange={(event) => activeCell && setRows((current) => current.map((row, index) => (index === activeCell.rowIndex ? { ...row, [activeCell.column.key]: event.target.value } : row)))}
          onBlur={(event) => activeCell && persistCell(activeCell.rowIndex, activeCell.colIndex, event.target.value)}
          placeholder="fx"
        />
      </div>

      <div className={styles.gridFrame} onPaste={handleGridPaste} onContextMenu={(event) => openMenu(event, 'cell')}>
        {loading ? <div className={styles.loading}>Carregando planilha...</div> : (
          <table className={styles.sheetGrid}>
            <thead>
              <tr>
                <th className={styles.corner}><button type="button" onClick={selectAll}>•</button></th>
                {columns.map((column, colIndex) => (
                  <th key={column.key} style={{ minWidth: column.width || 160, width: column.width || 160 }} onContextMenu={(event) => openMenu(event, 'column', 0, colIndex)}>
                    <button type="button" onClick={(event) => selectColumn(colIndex, event.shiftKey)}>{column.label || columnName(colIndex)}</button>
                    <span
                      className={styles.resizeHandle}
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setResizing({ key: column.key, startX: event.clientX, startWidth: column.width || 160 });
                      }}
                      onDoubleClick={(event) => { event.preventDefault(); resizeColumnToContent(colIndex); }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ row, originalIndex }) => (
                <tr key={row.id}>
                  <th className={styles.rowHeader} onContextMenu={(event) => openMenu(event, 'row', originalIndex, 0)}>
                    <button type="button" onClick={(event) => selectRow(originalIndex, event.shiftKey)}>{originalIndex + 1}</button>
                  </th>
                  {columns.map((column, colIndex) => {
                    const selected = isCellInRange(originalIndex, colIndex, selection);
                    const isEditing = editing?.rowIndex === originalIndex && editing?.colIndex === colIndex;
                    const style = row.__styles?.[column.key] || DEFAULT_STYLE;
                    return (
                      <td
                        key={column.key}
                        data-selected={selected || undefined}
                        style={{ minWidth: column.width || 160, width: column.width || 160, ...styleForCell(style) }}
                        onMouseDown={(event) => beginDrag(originalIndex, colIndex, event)}
                        onMouseEnter={() => updateDrag(originalIndex, colIndex)}
                        onClick={(event) => selectCell(originalIndex, colIndex, event)}
                        onDoubleClick={() => startEdit(originalIndex, colIndex)}
                        onContextMenu={(event) => openMenu(event, 'cell', originalIndex, colIndex)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitEdit();
                              if (event.key === 'Escape') setEditing(null);
                            }}
                          />
                        ) : <span>{row[column.key]}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className={styles.statusBar}>
        <span>{selectionLabel(selection, columns)}</span>
        <span>{selectionStats.total} selecionadas · {selectionStats.filled} preenchidas</span>
        <span>{visibleRows.length} de {rows.length} linhas</span>
        <span>{status}</span>
      </footer>

      {menu && (
        <div className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
          <strong>{menu.context === 'row' ? 'Linha' : menu.context === 'column' ? 'Coluna' : 'Célula'}</strong>
          <button type="button" onClick={() => { copySelection(); setMenu(null); }}>Copiar <kbd>Ctrl C</kbd></button>
          <button type="button" onClick={() => { cutSelection(); setMenu(null); }}>Recortar <kbd>Ctrl X</kbd></button>
          <button type="button" disabled={!clipboard} onClick={() => { pasteSelection('all'); setMenu(null); }}>Colar <kbd>Ctrl V</kbd></button>
          <button type="button" disabled={!clipboard} onClick={() => { pasteSelection('values'); setMenu(null); }}>Colar somente valores</button>
          <button type="button" disabled={!clipboard} onClick={() => { pasteSelection('format'); setMenu(null); }}>Colar somente formatação</button>
          <span />
          {menu.context !== 'column' && <button type="button" onClick={() => { addRow(false); setMenu(null); }}>Inserir linha acima</button>}
          {menu.context !== 'column' && <button type="button" onClick={() => { addRow(true); setMenu(null); }}>Inserir linha abaixo</button>}
          {menu.context === 'row' && <button type="button" onClick={() => { duplicateRow(); setMenu(null); }}>Duplicar linha</button>}
          {menu.context !== 'row' && <button type="button" onClick={() => { addColumn(false); setMenu(null); }}>Inserir coluna à esquerda</button>}
          {menu.context !== 'row' && <button type="button" onClick={() => { addColumn(true); setMenu(null); }}>Inserir coluna à direita</button>}
          {menu.context === 'column' && <button type="button" onClick={() => { duplicateColumn(); setMenu(null); }}>Duplicar coluna</button>}
          {menu.context !== 'column' && <button type="button" onClick={() => { askDelete('row'); setMenu(null); }}>Excluir linha</button>}
          {menu.context !== 'row' && <button type="button" onClick={() => { askDelete('column'); setMenu(null); }}>Excluir coluna</button>}
          <span />
          {menu.context !== 'row' && <button type="button" onClick={() => { sortByColumn('asc'); setMenu(null); }}>Ordenar A → Z</button>}
          {menu.context !== 'row' && <button type="button" onClick={() => { sortByColumn('desc'); setMenu(null); }}>Ordenar Z → A</button>}
          {menu.context !== 'row' && <button type="button" onClick={() => openFilterForColumn(activeColumn?.key)}>Filtrar esta coluna...</button>}
          {menu.context !== 'row' && <button type="button" onClick={() => { resizeColumnToContent(); setMenu(null); }}>Ajustar largura</button>}
          <span />
          <button type="button" onClick={() => { clearSelectionContent(); setMenu(null); }}>Limpar conteúdo <kbd>Del</kbd></button>
          <button type="button" onClick={() => { clearFormatting(); setMenu(null); }}>Limpar formatação</button>
        </div>
      )}

      <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} onConfirm={confirmDelete} />
    </section>
  );
}
