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
const FORMAT_OPTIONS = [
  { id: '', label: 'Automático' },
  { id: 'text', label: 'Texto' },
  { id: 'number', label: 'Número' },
  { id: 'currency', label: 'Moeda' },
  { id: 'percent', label: 'Percentual' },
];
const ZOOM_OPTIONS = [75, 90, 100, 110, 125, 150];

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

function cellRefToIndex(ref = '') {
  const match = String(ref).toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const col = match[1].split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const row = Number(match[2]) - 1;
  if (!Number.isInteger(row) || row < 0 || col < 0) return null;
  return { row, col };
}

function parseNumber(value) {
  const text = String(value ?? '').replace(/\s/g, '').replace(/R\$/g, '').replace(/%/g, '').replace(/\./g, '').replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function formatDisplayValue(value, style = {}, rows = [], columns = []) {
  const raw = String(value ?? '');
  const formula = raw.startsWith('=') ? evaluateFormula(raw, rows, columns) : null;
  if (formula?.ok) return formula.value;
  if (formula && !formula.ok) return '#ERRO';
  const numeric = parseNumber(raw);
  if (style.numberFormat === 'currency' && raw !== '') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric);
  if (style.numberFormat === 'percent' && raw !== '') return `${String(raw).includes('%') ? raw.replace(/%$/, '') : numeric}%`;
  if (style.numberFormat === 'number' && raw !== '') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(numeric);
  return raw;
}

function evaluateFormula(value, rows = [], columns = []) {
  const expression = String(value || '').trim();
  if (!expression.startsWith('=')) return null;
  const body = expression.slice(1).trim().toUpperCase();
  if (!body) return { ok: false, value: '#ERRO' };
  function cellValue(ref) {
    const index = cellRefToIndex(ref);
    const column = columns[index?.col];
    const row = rows[index?.row];
    if (!index || !column || !row) return 0;
    return parseNumber(row[column.key]);
  }
  function rangeValues(start, end) {
    const from = cellRefToIndex(start);
    const to = cellRefToIndex(end);
    if (!from || !to) return [];
    const values = [];
    for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r += 1) {
      for (let c = Math.min(from.col, to.col); c <= Math.max(from.col, to.col); c += 1) values.push(cellValue(`${columnName(c)}${r + 1}`));
    }
    return values;
  }
  const fn = body.match(/^(SOMA|SUM|MEDIA|AVERAGE|MIN|MAX|CONT\.NUM|COUNT)\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (fn) {
    const values = rangeValues(fn[2], fn[3]);
    if (!values.length) return { ok: false, value: '#ERRO' };
    if (['SOMA', 'SUM'].includes(fn[1])) return { ok: true, value: String(values.reduce((acc, item) => acc + item, 0)) };
    if (['MEDIA', 'AVERAGE'].includes(fn[1])) return { ok: true, value: String(values.reduce((acc, item) => acc + item, 0) / values.length) };
    if (fn[1] === 'MIN') return { ok: true, value: String(Math.min(...values)) };
    if (fn[1] === 'MAX') return { ok: true, value: String(Math.max(...values)) };
    return { ok: true, value: String(values.filter((item) => Number.isFinite(item)).length) };
  }
  const binary = body.match(/^([A-Z]+\d+)\s*([+\-*/])\s*([A-Z]+\d+)$/);
  if (binary) {
    const left = cellValue(binary[1]);
    const right = cellValue(binary[3]);
    if (binary[2] === '+') return { ok: true, value: String(left + right) };
    if (binary[2] === '-') return { ok: true, value: String(left - right) };
    if (binary[2] === '*') return { ok: true, value: String(left * right) };
    if (binary[2] === '/') return { ok: right === 0 ? false : true, value: right === 0 ? '#DIV/0!' : String(left / right) };
  }
  const single = body.match(/^([A-Z]+\d+)$/);
  if (single) return { ok: true, value: String(cellValue(single[1])) };
  return { ok: false, value: '#ERRO' };
}

function formulaReferences(value = '') {
  const refs = new Set();
  String(value || '').toUpperCase().replace(/([A-Z]+\d+):([A-Z]+\d+)/g, (_, start, end) => {
    const from = cellRefToIndex(start);
    const to = cellRefToIndex(end);
    if (from && to) {
      for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r += 1) {
        for (let c = Math.min(from.col, to.col); c <= Math.max(from.col, to.col); c += 1) refs.add(`${r}:${c}`);
      }
    }
    return '';
  }).replace(/\b([A-Z]+\d+)\b/g, (_, ref) => {
    const index = cellRefToIndex(ref);
    if (index) refs.add(`${index.row}:${index.col}`);
    return '';
  });
  return refs;
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
  const [zoom, setZoom] = useState(100);
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
  const activeRawValue = activeCell ? String(activeCell.row?.[activeCell.column?.key] || '') : '';
  const activeFormulaRefs = useMemo(() => formulaReferences(editing ? draft : activeRawValue), [editing, draft, activeRawValue]);

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
    const numbers = entries.map(({ row, column }) => parseNumber(row?.[column?.key])).filter((value) => Number.isFinite(value) && value !== 0);
    const formulas = rows.reduce((acc, row) => acc + columns.filter((column) => String(row?.[column.key] || '').startsWith('=')).length, 0);
    const sum = numbers.reduce((acc, value) => acc + value, 0);
    const average = numbers.length ? sum / numbers.length : 0;
    return { total: entries.length, filled, formulas, sum, average, numbers: numbers.length };
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
    if (!menu) return undefined;
    function closeMenu() { setMenu(null); }
    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [menu]);

  function moveSelection(deltaRow, deltaCol, extend = false) {
    if (!rows.length || !columns.length) return;
    const baseRow = selection?.endRow ?? 0;
    const baseCol = selection?.endCol ?? 0;
    const nextRow = Math.max(0, Math.min(rows.length - 1, baseRow + deltaRow));
    const nextCol = Math.max(0, Math.min(columns.length - 1, baseCol + deltaCol));
    if (extend && selection) setSelection((current) => ({ ...current, endRow: nextRow, endCol: nextCol }));
    else setSelection({ startRow: nextRow, endRow: nextRow, startCol: nextCol, endCol: nextCol });
  }

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b' && !isField) {
        event.preventDefault();
        applyStyle({ bold: !activeStyle.bold });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i' && !isField) {
        event.preventDefault();
        applyStyle({ italic: !activeStyle.italic });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'u' && !isField) {
        event.preventDefault();
        applyStyle({ underline: !activeStyle.underline });
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isField) {
        event.preventDefault();
        clearSelectionContent();
      }
      if (!isField && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        moveSelection(map[event.key][0], map[event.key][1], event.shiftKey);
      }
      if (event.key === 'Tab' && !isField) {
        event.preventDefault();
        moveSelection(0, event.shiftKey ? -1 : 1, false);
      }
      if (event.key === 'Enter' && !isField && activeCell) {
        event.preventDefault();
        if (event.shiftKey) moveSelection(-1, 0, false);
        else startEdit(activeCell.rowIndex, activeCell.colIndex);
      }
      if (!isField && activeCell && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setSelection({ startRow: activeCell.rowIndex, endRow: activeCell.rowIndex, startCol: activeCell.colIndex, endCol: activeCell.colIndex });
        setEditing({ rowIndex: activeCell.rowIndex, colIndex: activeCell.colIndex });
        setDraft(event.key);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, rows, columns, activeCell, clipboard, activeStyle]);

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

  async function sortByColumn(direction = 'asc', columnKey = activeColumn?.key) {
    const column = columns.find((item) => item.key === columnKey) || activeColumn;
    if (!column) return;
    const next = [...rows].sort((a, b) => compareCellValues(a[column.key], b[column.key]) * (direction === 'desc' ? -1 : 1));
    setRows(next);
    await Promise.all(next.map((row, index) => updateSupportDailyRow(row.id, { position: index + 1 })));
    setStatus(direction === 'desc' ? `Coluna ${column.label || column.key} ordenada Z → A` : `Coluna ${column.label || column.key} ordenada A → Z`);
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
    event.stopPropagation();
    const width = 320;
    const height = 520;
    const x = Math.min(event.clientX, window.innerWidth - width - 16);
    const y = Math.min(event.clientY, window.innerHeight - height - 16);
    if (context === 'row') selectRow(rowIndex, event.shiftKey);
    if (context === 'column') selectColumn(colIndex, event.shiftKey);
    if (context === 'cell' && !isCellInRange(rowIndex, colIndex, selection)) setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex });
    const column = columns[colIndex] || activeColumn;
    setMenu({
      x: Math.max(16, x),
      y: Math.max(16, y),
      context,
      rowIndex,
      colIndex,
      title: context === 'row' ? `Linha ${rowIndex + 1}` : context === 'column' ? `Coluna ${column?.label || columnName(colIndex)}` : `${columnName(colIndex)}${rowIndex + 1}`,
    });
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

  function filterColumnByValue(columnKey, value) {
    if (!columnKey) return;
    setColumnFilters((current) => ({ ...current, [columnKey]: String(value ?? '') }));
    setFilterPanel(null);
    setStatus('Filtro aplicado');
  }

  function columnKeyFromMenu() {
    const index = menu?.context === 'column' ? menu.colIndex : selection?.endCol || 0;
    return columns[index]?.key || activeColumn?.key;
  }

  function valueFromMenuCell() {
    const rowIndex = menu?.rowIndex ?? selection?.endRow ?? 0;
    const colIndex = menu?.colIndex ?? selection?.endCol ?? 0;
    const column = columns[colIndex];
    return String(rows[rowIndex]?.[column?.key] ?? '');
  }

  const activeFilterCount = Object.values(columnFilters).filter((value) => normalizeText(value)).length;

  const filterOptions = useMemo(() => {
    if (!filterPanel?.columnKey) return [];
    const counts = new Map();
    rows.forEach((row) => {
      const value = String(row?.[filterPanel.columnKey] ?? '').trim();
      const label = value || '(vazio)';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true, sensitivity: 'base' }))
      .slice(0, 80)
      .map(([value, count]) => ({ value: value === '(vazio)' ? '' : value, label: value, count }));
  }, [filterPanel, rows]);


  function runMenuAction(action) {
    setMenu(null);
    const result = action?.();
    if (result?.catch) result.catch(() => setStatus('Não foi possível executar a ação'));
  }

  function buildMenuSections() {
    if (!menu) return [];
    const isRow = menu.context === 'row';
    const isColumn = menu.context === 'column';
    const isCell = menu.context === 'cell';
    const sections = [];

    sections.push({
      id: 'clipboard',
      label: 'Área de transferência',
      items: [
        { icon: '⧉', label: 'Copiar', shortcut: 'Ctrl C', action: copySelection },
        { icon: '✂', label: 'Recortar', shortcut: 'Ctrl X', action: cutSelection },
        { icon: '▣', label: 'Colar', shortcut: 'Ctrl V', action: () => pasteSelection('all'), disabled: !clipboard },
        { kind: 'subhead', label: 'Colar especial' },
        { icon: 'T', label: 'Somente valores', action: () => pasteSelection('values'), disabled: !clipboard },
        { icon: '◐', label: 'Somente formatação', action: () => pasteSelection('format'), disabled: !clipboard },
      ],
    });

    sections.push({
      id: 'selection',
      label: 'Seleção',
      items: [
        { icon: '▦', label: 'Selecionar tudo', shortcut: 'Ctrl A', action: selectAll },
        !isColumn && { icon: '━', label: isRow ? 'Selecionar linha' : 'Selecionar linha da célula', action: () => selectRow(menu.rowIndex || selection?.endRow || 0) },
        !isRow && { icon: '┃', label: isColumn ? 'Selecionar coluna' : 'Selecionar coluna da célula', action: () => selectColumn(menu.colIndex || selection?.endCol || 0) },
        isCell && { icon: '✎', label: 'Editar célula', shortcut: 'Enter', action: () => startEdit(menu.rowIndex || 0, menu.colIndex || 0) },
      ].filter(Boolean),
    });

    if (!isColumn) {
      sections.push({
        id: 'rows',
        label: 'Linha',
        items: [
          { icon: '↥', label: 'Inserir linha acima', action: () => addRow(false) },
          { icon: '↧', label: 'Inserir linha abaixo', action: () => addRow(true) },
          { icon: '⧉', label: 'Duplicar linha', action: duplicateRow },
          { icon: '⌫', label: 'Excluir linha', tone: 'danger', action: () => askDelete('row') },
        ],
      });
    }

    if (!isRow) {
      sections.push({
        id: 'columns',
        label: 'Coluna',
        items: [
          { icon: '↤', label: 'Inserir coluna à esquerda', action: () => addColumn(false) },
          { icon: '↦', label: 'Inserir coluna à direita', action: () => addColumn(true) },
          { icon: '⧉', label: 'Duplicar coluna', action: duplicateColumn },
          { icon: '⇤', label: 'Ajustar largura ao conteúdo', action: () => resizeColumnToContent(menu.colIndex || selection?.endCol || 0) },
          { icon: '⌫', label: 'Excluir coluna', tone: 'danger', action: () => askDelete('column') },
        ],
      });
      sections.push({
        id: 'data',
        label: 'Dados da coluna',
        items: [
          { icon: 'A↓', label: 'Ordenar A → Z', action: () => sortByColumn('asc', columnKeyFromMenu()) },
          { icon: 'Z↓', label: 'Ordenar Z → A', action: () => sortByColumn('desc', columnKeyFromMenu()) },
          { icon: '⌕', label: 'Filtrar esta coluna...', action: () => openFilterForColumn(columnKeyFromMenu()) },
          isCell && { icon: '≡', label: 'Filtrar por valor selecionado', action: () => filterColumnByValue(columnKeyFromMenu(), valueFromMenuCell()) },
          columnFilters[columnKeyFromMenu()] && { icon: '×', label: 'Limpar filtro desta coluna', action: () => clearColumnFilter(columnKeyFromMenu()) },
          activeFilterCount > 0 && { icon: '×', label: 'Limpar todos os filtros', action: () => setColumnFilters({}) },
        ].filter(Boolean),
      });
    }

    sections.push({
      id: 'format',
      label: 'Edição e formato',
      items: [
        { icon: 'B', label: 'Negrito', shortcut: 'Ctrl B', active: !!activeStyle.bold, action: () => applyStyle({ bold: !activeStyle.bold }) },
        { icon: 'I', label: 'Itálico', shortcut: 'Ctrl I', active: !!activeStyle.italic, action: () => applyStyle({ italic: !activeStyle.italic }) },
        { icon: 'U', label: 'Sublinhado', shortcut: 'Ctrl U', active: !!activeStyle.underline, action: () => applyStyle({ underline: !activeStyle.underline }) },
        { icon: 'S', label: 'Tachado', active: !!activeStyle.strike, action: () => applyStyle({ strike: !activeStyle.strike }) },
        { kind: 'subhead', label: 'Formato da célula' },
        ...FORMAT_OPTIONS.map((format) => ({ icon: '123', label: format.label, active: (activeStyle.numberFormat || '') === format.id, action: () => applyStyle({ numberFormat: format.id }) })),
        { kind: 'subhead', label: 'Cor do texto' },
        ...TEXT_COLORS.map((color) => ({ icon: 'A', label: color.label, active: (activeStyle.textColor || 'var(--text-primary)') === color.value, action: () => applyStyle({ textColor: color.value }) })),
        { kind: 'subhead', label: 'Preenchimento' },
        ...FILL_COLORS.map((color) => ({ icon: '▰', label: color.label, active: (activeStyle.fillColor || 'transparent') === color.value, action: () => applyStyle({ fillColor: color.value }) })),
        { icon: '⌫', label: 'Limpar conteúdo', shortcut: 'Del', action: clearSelectionContent },
        { icon: '◇', label: 'Limpar formatação', action: clearFormatting },
      ],
    });

    return sections;
  }

  const menuSections = buildMenuSections();

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

      <div className={styles.toolbar} role="toolbar" aria-label="Ferramentas da planilha">
        <div className={styles.toolbarGroup} data-grow="true">
          <input className={styles.searchBox} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na planilha" />
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom da planilha">
            {ZOOM_OPTIONS.map((option) => <option key={option} value={option}>{option}%</option>)}
          </select>
          <button type="button" className={styles.toolButton} onClick={() => openFilterForColumn()}>Filtro</button>
        </div>

        <div className={styles.toolbarGroup} aria-label="Área de transferência">
          <button type="button" className={styles.iconButton} title="Copiar" onClick={() => copySelection()}>⧉</button>
          <button type="button" className={styles.iconButton} title="Recortar" onClick={cutSelection}>✂</button>
          <button type="button" className={styles.toolButton} disabled={!clipboard} onClick={() => pasteSelection('all')}>Colar</button>
        </div>

        <div className={styles.toolbarGroup} aria-label="Texto">
          <select value={activeStyle.fontFamily || ''} onChange={(event) => applyStyle({ fontFamily: event.target.value })} aria-label="Fonte">
            {FONT_OPTIONS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
          </select>
          <select value={activeStyle.numberFormat || ''} onChange={(event) => applyStyle({ numberFormat: event.target.value })} aria-label="Formato">
            {FORMAT_OPTIONS.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
          </select>
          <button type="button" className={styles.iconButton} data-active={activeStyle.bold} title="Negrito" onClick={() => applyStyle({ bold: !activeStyle.bold })}>B</button>
          <button type="button" className={styles.iconButton} data-active={activeStyle.italic} title="Itálico" onClick={() => applyStyle({ italic: !activeStyle.italic })}>I</button>
          <button type="button" className={styles.iconButton} data-active={activeStyle.underline} title="Sublinhado" onClick={() => applyStyle({ underline: !activeStyle.underline })}>U</button>
          <button type="button" className={styles.iconButton} data-active={activeStyle.strike} title="Tachado" onClick={() => applyStyle({ strike: !activeStyle.strike })}>S</button>
        </div>

        <div className={styles.toolbarGroup} aria-label="Cores e alinhamento">
          <label className={styles.swatchControl}>
            <span>A</span>
            <select value={activeStyle.textColor || 'var(--text-primary)'} onChange={(event) => applyStyle({ textColor: event.target.value })} aria-label="Cor do texto">
              {TEXT_COLORS.map((color) => <option key={color.id} value={color.value}>{color.label}</option>)}
            </select>
          </label>
          <label className={styles.swatchControl}>
            <span>▰</span>
            <select value={activeStyle.fillColor || 'transparent'} onChange={(event) => applyStyle({ fillColor: event.target.value })} aria-label="Preenchimento">
              {FILL_COLORS.map((color) => <option key={color.id} value={color.value}>{color.label}</option>)}
            </select>
          </label>
          <select value={activeStyle.align || 'left'} onChange={(event) => applyStyle({ align: event.target.value })} aria-label="Alinhamento">
            {ALIGN_OPTIONS.map((align) => <option key={align.id} value={align.id}>{align.label}</option>)}
          </select>
          <button type="button" className={styles.toolButton} onClick={clearFormatting}>Limpar formato</button>
        </div>

        <div className={styles.toolbarGroup} aria-label="Estrutura">
          <button type="button" className={styles.toolButton} onClick={() => addRow(true)}>+ Linha</button>
          <button type="button" className={styles.toolButton} onClick={() => addColumn(true)}>+ Coluna</button>
        </div>
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
          <div className={styles.filterHeader}>
            <div>
              <span>Filtro da coluna</span>
              <strong>{filterPanel.label}</strong>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setFilterPanel(null)}>Fechar</Button>
          </div>
          <div className={styles.filterControls}>
            <input
              autoFocus
              value={columnFilters[filterPanel.columnKey] || ''}
              onChange={(event) => setColumnFilters((current) => ({ ...current, [filterPanel.columnKey]: event.target.value }))}
              placeholder="Digite para filtrar esta coluna"
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => sortByColumn('asc')}>Ordenar A → Z</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => sortByColumn('desc')}>Ordenar Z → A</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => clearColumnFilter(filterPanel.columnKey)}>Limpar</Button>
          </div>
          <div className={styles.filterValues} aria-label="Valores encontrados na coluna">
            {filterOptions.length ? filterOptions.map((option) => (
              <button
                key={`${option.label}-${option.count}`}
                type="button"
                data-active={normalizeText(columnFilters[filterPanel.columnKey]) === normalizeText(option.value) || undefined}
                onClick={() => setColumnFilters((current) => ({ ...current, [filterPanel.columnKey]: option.value }))}
              >
                <span>{option.label}</span>
                <small>{option.count}</small>
              </button>
            )) : <span className={styles.emptyFilter}>Nenhum valor disponível</span>}
          </div>
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

      <div className={styles.gridFrame} style={{ '--sheet-zoom': zoom / 100 }} onPaste={handleGridPaste} onContextMenu={(event) => openMenu(event, 'cell')}>
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
                        data-formula={String(row[column.key] || '').startsWith('=') || undefined}
                        data-reference={activeFormulaRefs.has(`${originalIndex}:${colIndex}`) || undefined}
                        data-error={String(row[column.key] || '').startsWith('=') && !evaluateFormula(row[column.key], rows, columns)?.ok || undefined}
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
                        ) : <span>{formatDisplayValue(row[column.key], style, rows, columns)}</span>}
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
        {selectionStats.numbers > 0 && <span>Soma {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(selectionStats.sum)} · Média {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(selectionStats.average)}</span>}
        {selectionStats.formulas > 0 && <span>{selectionStats.formulas} fórmulas</span>}
        <span>{visibleRows.length} de {rows.length} linhas</span>
        <span>{status}</span>
      </footer>

      {menu && (
        <div
          className={styles.contextMenu}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label={`Menu contextual de ${menu.title}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <header className={styles.menuHeader}>
            <strong>{menu.context === 'row' ? 'Linha' : menu.context === 'column' ? 'Coluna' : 'Célula'}</strong>
            <span>{menu.title}</span>
          </header>
          {menuSections.map((section) => (
            <div className={styles.menuSection} key={section.id} role="group" aria-label={section.label}>
              <span className={styles.menuSectionLabel}>{section.label}</span>
              {section.items.map((item) => (
                item.kind === 'subhead' ? (
                  <span key={`${section.id}-${item.label}`} className={styles.menuSubhead}>{item.label}</span>
                ) : (
                  <button
                    key={`${section.id}-${item.label}`}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    data-active={item.active || undefined}
                    data-tone={item.tone || undefined}
                    onClick={() => !item.disabled && runMenuAction(item.action)}
                  >
                    <span className={styles.menuIcon} aria-hidden="true">{item.icon}</span>
                    <span className={styles.menuText}>{item.label}</span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                )
              ))}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} onConfirm={confirmDelete} />
    </section>
  );
}
