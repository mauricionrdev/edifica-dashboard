import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import { CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../ui/Icons.jsx';
import {
  createSupportDailyColumn,
  createSupportDailyRow,
  createSupportDailySheet,
  deleteSupportDailyColumn,
  deleteSupportDailyRow,
  deleteSupportDailySheet,
  listSupportDailyRows,
  updateSupportDailyColumn,
  updateSupportDailyRow,
  updateSupportDailySheet,
} from '../../api/support.js';
import SpreadsheetGrid from './SpreadsheetGrid.jsx';
import styles from './UserSpreadsheetPanel.module.css';

const DEFAULT_COLUMN_WIDTH = 168;
const MIN_COLUMN_WIDTH = 5;
const MAX_COLUMN_WIDTH = 900;
const MAX_IMPORT_COLUMNS = 60;
const MAX_IMPORT_ROWS = 200;


function decodeEntities(value = '') {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = '') {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function sanitizeCellValue(value = '') {
  return stripHtml(value).slice(0, 4000);
}

function normalizeColumns(columns = []) {
  return columns.map((column, index) => ({
    ...column,
    key: column.key,
    label: sanitizeCellValue(column.label || columnName(index)).slice(0, 80) || columnName(index),
    width: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Number(column.width || DEFAULT_COLUMN_WIDTH))),
    position: Number(column.position || index + 1),
  }));
}

function normalizeRows(rows = [], columns = []) {
  return rows.map((row, index) => {
    const next = { ...row, position: Number(row.position || index + 1), __styles: {} };
    columns.forEach((column) => {
      next[column.key] = sanitizeCellValue(next[column.key] || '');
    });
    return next;
  });
}

function parseClipboardTable(text = '') {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const source = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (!source) return [];
  return source
    .split('\n')
    .map((line) => line.split('\t').map((cell) => sanitizeCellValue(cell)))
    .filter((line, index, lines) => line.some(Boolean) || index < lines.length - 1);
}

function detectDelimitedSeparator(text = '') {
  const sample = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .find((line) => line.trim()) || '';
  const candidates = ['\t', ';', ','].map((separator) => ({ separator, count: sample.split(separator).length - 1 }));
  const best = candidates.sort((a, b) => b.count - a.count)[0];
  return best?.count > 0 ? best.separator : '\t';
}

function parseDelimitedText(text = '') {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const source = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (!source.trim()) return [];
  const separator = detectDelimitedSeparator(source);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === separator) {
      row.push(sanitizeCellValue(cell));
      cell = '';
      continue;
    }
    if (!quoted && char === '\n') {
      row.push(sanitizeCellValue(cell));
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  row.push(sanitizeCellValue(cell));
  rows.push(row);
  return rows.filter((line, index, list) => line.some(Boolean) || index < list.length - 1);
}

function escapeCsvCell(value = '') {
  const text = sanitizeCellValue(value).replace(/\r?\n/g, ' ');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeSheetToCsv(rows = [], columns = []) {
  const header = columns.map((column) => escapeCsvCell(column.label || 'Coluna')).join(';');
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(row?.[column.key] || '')).join(';'));
  return [header, ...body].join('\n');
}

function downloadTextFile(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value = 'planilha') {
  return String(value || 'planilha')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'planilha';
}

function columnName(index) {
  let value = Number(index || 0);
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function activeCellText(activeCell, rows) {
  if (!activeCell?.rowId || !activeCell?.key) return '';
  const row = rows.find((entry) => entry.id === activeCell.rowId);
  return sanitizeCellValue(row?.[activeCell.key] || '');
}


function getCellCoordinates(rows = [], columns = [], rowId, key) {
  return {
    rowIndex: rows.findIndex((row) => row.id === rowId),
    columnIndex: columns.findIndex((column) => column.key === key),
  };
}

function normalizeSelectionRange(anchor, focus, rows = [], columns = []) {
  if (!anchor?.rowId || !anchor?.key || !focus?.rowId || !focus?.key) return null;
  const start = getCellCoordinates(rows, columns, anchor.rowId, anchor.key);
  const end = getCellCoordinates(rows, columns, focus.rowId, focus.key);
  if (start.rowIndex < 0 || start.columnIndex < 0 || end.rowIndex < 0 || end.columnIndex < 0) return null;
  return {
    startRow: Math.min(start.rowIndex, end.rowIndex),
    endRow: Math.max(start.rowIndex, end.rowIndex),
    startColumn: Math.min(start.columnIndex, end.columnIndex),
    endColumn: Math.max(start.columnIndex, end.columnIndex),
  };
}

function getCellStyle(row, key) {
  return row?.__styles?.[key] || {};
}

function buildSelectedCells(rows = [], columns = [], bounds) {
  if (!bounds) return [];
  const cells = [];
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex += 1) {
      const column = columns[columnIndex];
      if (!column) continue;
      cells.push({ row, column, rowIndex, columnIndex, id: `${row.id}:${column.key}` });
    }
  }
  return cells;
}

function parseNumericValue(value = '') {
  const text = sanitizeCellValue(value).replace(/\./g, '').replace(',', '.');
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function formatStatusNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

function parsePlainNumber(value = '') {
  const text = sanitizeCellValue(value)
    .replace(/\s/g, '')
    .replace(/%$/, '')
    .replace(/R\$|US\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseCellRef(ref = '') {
  const match = String(ref).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const letters = match[1];
  let columnIndex = 0;
  for (let index = 0; index < letters.length; index += 1) {
    columnIndex = columnIndex * 26 + (letters.charCodeAt(index) - 64);
  }
  const rowIndex = Number(match[2]) - 1;
  return { rowIndex, columnIndex: columnIndex - 1 };
}


function cellRefFromCoordinates(rowIndex = 0, columnIndex = 0) {
  return `${columnName(columnIndex)}${rowIndex + 1}`;
}

function getFormulaReferences(rawFormula = '', rows = [], columns = []) {
  const formula = sanitizeCellValue(rawFormula).trim();
  if (!formula.startsWith('=')) return [];
  const refs = new Map();
  const rangePattern = /([A-Z]+\d+)\s*:\s*([A-Z]+\d+)/gi;
  formula.replace(rangePattern, (match) => {
    expandCellRange(match, rows, columns).forEach(({ rowIndex, columnIndex }) => {
      const row = rows[rowIndex];
      const column = columns[columnIndex];
      if (row && column) refs.set(`${row.id}:${column.key}`, true);
    });
    return match;
  });
  formula.replace(/\b([A-Z]+\d+)\b/gi, (match) => {
    const coords = parseCellRef(match);
    const row = rows[coords?.rowIndex];
    const column = columns[coords?.columnIndex];
    if (row && column) refs.set(`${row.id}:${column.key}`, true);
    return match;
  });
  return [...refs.keys()];
}

function adjustFormulaReferences(rawFormula = '', rowOffset = 0, columnOffset = 0) {
  const formula = sanitizeCellValue(rawFormula);
  if (!formula.startsWith('=')) return formula;
  return formula.replace(/\b([A-Z]+)(\d+)\b/gi, (match) => {
    const coords = parseCellRef(match);
    if (!coords) return match;
    const nextRow = Math.max(0, coords.rowIndex + rowOffset);
    const nextColumn = Math.max(0, coords.columnIndex + columnOffset);
    return cellRefFromCoordinates(nextRow, nextColumn);
  });
}

function buildSequenceValue(sourceValues = [], targetOffset = 0, axis = 'row') {
  const values = sourceValues.map((value) => sanitizeCellValue(value));
  if (!values.length) return '';
  const numbers = values.map(parsePlainNumber);
  if (numbers.every((value) => value !== null)) {
    if (numbers.length === 1) return String(numbers[0]);
    const step = numbers[numbers.length - 1] - numbers[numbers.length - 2];
    return String(numbers[numbers.length - 1] + step * Math.max(1, targetOffset));
  }
  const lastFormula = [...values].reverse().find((value) => value.startsWith('='));
  if (lastFormula) return adjustFormulaReferences(lastFormula, axis === 'row' ? targetOffset : 0, axis === 'column' ? targetOffset : 0);
  return values[positiveModulo(values.length - 1 + targetOffset, values.length)] || values[0] || '';
}

function compareSheetValues(a = '', b = '') {
  const aNumber = parsePlainNumber(a);
  const bNumber = parsePlainNumber(b);
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  return sanitizeCellValue(a).localeCompare(sanitizeCellValue(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function expandCellRange(range = '', rows = [], columns = []) {
  const [startRef, endRef] = String(range).split(':').map((item) => parseCellRef(item));
  if (!startRef || !endRef) return [];
  const startRow = Math.max(0, Math.min(startRef.rowIndex, endRef.rowIndex));
  const endRow = Math.min(rows.length - 1, Math.max(startRef.rowIndex, endRef.rowIndex));
  const startColumn = Math.max(0, Math.min(startRef.columnIndex, endRef.columnIndex));
  const endColumn = Math.min(columns.length - 1, Math.max(startRef.columnIndex, endRef.columnIndex));
  const refs = [];
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
      refs.push({ rowIndex, columnIndex });
    }
  }
  return refs;
}

function formatCellDisplayValue(value = '', style = {}) {
  const raw = sanitizeCellValue(value);
  const number = parsePlainNumber(raw);
  if (number === null || !style?.numberFormat || style.numberFormat === 'text') return raw;
  if (style.numberFormat === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number);
  if (style.numberFormat === 'currency') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
  if (style.numberFormat === 'percent') return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(number);
  return raw;
}

function evaluateFormula(rawFormula = '', rows = [], columns = [], stack = new Set()) {
  const formula = sanitizeCellValue(rawFormula).trim();
  if (!formula.startsWith('=')) return { value: formula, ok: true };
  const expression = formula.slice(1).trim();
  if (!expression) return { value: '', ok: true };

  const resolveCell = (ref) => {
    const coords = parseCellRef(ref);
    if (!coords) return 0;
    const row = rows[coords.rowIndex];
    const column = columns[coords.columnIndex];
    if (!row || !column) return 0;
    const key = `${row.id}:${column.key}`;
    if (stack.has(key)) throw new Error('Formula circular');
    const raw = sanitizeCellValue(row?.[column.key] || '');
    if (raw.startsWith('=')) {
      const nested = evaluateFormula(raw, rows, columns, new Set([...stack, key]));
      if (!nested.ok) throw new Error('Formula invalida');
      return parsePlainNumber(nested.value) ?? 0;
    }
    return parsePlainNumber(raw) ?? 0;
  };

  const functionMatch = expression.match(/^([A-ZÁÉÍÓÚÇ.]+)\((.*)\)$/i);
  if (functionMatch) {
    const name = functionMatch[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const args = functionMatch[2].split(';').flatMap((chunk) => chunk.split(',')).map((item) => item.trim()).filter(Boolean);
    const values = args.flatMap((arg) => {
      if (arg.includes(':')) return expandCellRange(arg, rows, columns).map(({ rowIndex, columnIndex }) => {
        const row = rows[rowIndex];
        const column = columns[columnIndex];
        return row && column ? resolveCell(`${columnName(columnIndex)}${rowIndex + 1}`) : 0;
      });
      const ref = parseCellRef(arg);
      if (ref) return [resolveCell(arg)];
      return [parsePlainNumber(arg) ?? 0];
    });
    if (['SUM', 'SOMA'].includes(name)) return { value: String(values.reduce((total, value) => total + value, 0)), ok: true };
    if (['AVERAGE', 'MEDIA'].includes(name)) return { value: values.length ? String(values.reduce((total, value) => total + value, 0) / values.length) : '0', ok: true };
    if (name === 'MIN') return { value: values.length ? String(Math.min(...values)) : '0', ok: true };
    if (name === 'MAX') return { value: values.length ? String(Math.max(...values)) : '0', ok: true };
    if (['COUNT', 'CONT.NUM'].includes(name)) return { value: String(values.filter((value) => Number.isFinite(value)).length), ok: true };
    if (['COUNTA', 'CONT.VALORES'].includes(name)) return { value: String(values.filter((value) => String(value ?? '') !== '').length), ok: true };
  }

  try {
    const safeExpression = expression.replace(/([A-Z]+\d+)/gi, (ref) => String(resolveCell(ref)));
    if (!/^[0-9+\-*/().,\s]+$/.test(safeExpression)) return { value: '#ERRO', ok: false };
    const normalized = safeExpression.replace(/,/g, '.');
    const result = Function(`"use strict"; return (${normalized});`)();
    if (!Number.isFinite(result)) return { value: '#ERRO', ok: false };
    return { value: String(result), ok: true };
  } catch {
    return { value: '#ERRO', ok: false };
  }
}

function positiveModulo(value, divisor) {
  if (!divisor) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function buildSelectionSummary(cells = []) {
  if (!cells.length) return 'Nenhuma célula selecionada';
  const values = cells.map(({ row, column }) => sanitizeCellValue(row?.[column.key] || ''));
  const filled = values.filter(Boolean).length;
  const numbers = values.map(parseNumericValue).filter((value) => value !== null);
  const parts = [`${cells.length} célula${cells.length === 1 ? '' : 's'}`];
  if (filled) parts.push(`${filled} preenchida${filled === 1 ? '' : 's'}`);
  if (numbers.length) {
    const sum = numbers.reduce((total, value) => total + value, 0);
    parts.push(`Soma ${formatStatusNumber(sum)}`);
    if (numbers.length > 1) parts.push(`Média ${formatStatusNumber(sum / numbers.length)}`);
  }
  return parts.join(' · ');
}

function reorderByIndex(items = [], sourceIndex, targetIndex) {
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(Math.min(targetIndex, next.length), 0, item);
  return next.map((entry, index) => ({ ...entry, position: index + 1 }));
}

function cloneRowValues(row = {}, columns = []) {
  return columns.reduce((patch, column) => {
    patch[column.key] = sanitizeCellValue(row?.[column.key] || '');
    return patch;
  }, {});
}

function serializeCellsToTsv(rows = [], columns = [], bounds) {
  if (!bounds) return '';
  const lines = [];
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    const line = [];
    for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex += 1) {
      const column = columns[columnIndex];
      line.push(sanitizeCellValue(row?.[column?.key] || ''));
    }
    lines.push(line.join('\t'));
  }
  return lines.join('\n');
}

function mergeCellStyle(currentStyle = {}, patch = {}) {
  const next = { ...currentStyle, ...patch };
  Object.keys(next).forEach((key) => {
    if (next[key] === false || next[key] === '' || next[key] === null || next[key] === undefined) delete next[key];
  });
  return next;
}

function sameStyleValue(cells = [], key, expectedValue) {
  return cells.length > 0 && cells.every(({ row, column }) => getCellStyle(row, column.key)?.[key] === expectedValue);
}

function ConfirmDeleteDialog({ confirmation, busy, onCancel, onConfirm }) {
  if (!confirmation) return null;
  return (
    <div className={styles.confirmOverlay} role="presentation" onMouseDown={onCancel}>
      <section
        className={styles.confirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spreadsheet-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.confirmHeader}>
          <span><TrashIcon size={15} /></span>
          <div>
            <strong id="spreadsheet-confirm-title">{confirmation.title}</strong>
            <p>{confirmation.message}</p>
          </div>
        </header>
        <footer className={styles.confirmFooter}>
          <Button size="sm" variant="secondary" onClick={onCancel} disabled={Boolean(busy)}>Cancelar</Button>
          <Button size="sm" variant="danger" onClick={onConfirm} disabled={Boolean(busy)}>
            <TrashIcon size={14} /> {busy ? 'Excluindo' : confirmation.confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}


function SheetContextMenu({
  menu,
  canEdit,
  onClose,
  onCopy,
  onFillSelection,
  onClearSelection,
  onInsertRowAbove,
  onInsertRowBelow,
  onDuplicateRow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onDuplicateColumn,
  onDeleteRow,
  onDeleteColumn,
  onBold,
  onItalic,
  onUnderline,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onClearFormatting,
  onSortColumnAscending,
  onSortColumnDescending,
  onSetTypeText,
  onSetTypeNumber,
  onSetTypeCurrency,
  onSetTypePercent,
}) {
  if (!menu) return null;
  const isRow = menu.scope === 'row';
  const isColumn = menu.scope === 'column';
  return (
    <div className={styles.contextBackdrop} role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <section
        className={styles.contextMenu}
        role="menu"
        aria-label="Ações da planilha"
        style={{ left: menu.x, top: menu.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={onCopy}>Copiar seleção</button>
        <button type="button" role="menuitem" onClick={onFillSelection} disabled={!canEdit}>Preencher seleção</button>
        <button type="button" role="menuitem" onClick={onClearSelection} disabled={!canEdit}>Limpar conteúdo</button>
        <span aria-hidden="true" />
        <button type="button" role="menuitem" onClick={onBold} disabled={!canEdit}>Negrito</button>
        <button type="button" role="menuitem" onClick={onItalic} disabled={!canEdit}>Itálico</button>
        <button type="button" role="menuitem" onClick={onUnderline} disabled={!canEdit}>Sublinhado</button>
        <button type="button" role="menuitem" onClick={onAlignLeft} disabled={!canEdit}>Alinhar à esquerda</button>
        <button type="button" role="menuitem" onClick={onAlignCenter} disabled={!canEdit}>Centralizar</button>
        <button type="button" role="menuitem" onClick={onAlignRight} disabled={!canEdit}>Alinhar à direita</button>
        <button type="button" role="menuitem" onClick={onClearFormatting} disabled={!canEdit}>Limpar formatação</button>
        {isColumn ? (
          <>
            <span aria-hidden="true" />
            <button type="button" role="menuitem" onClick={onSortColumnAscending} disabled={!canEdit}>Ordenar A → Z</button>
            <button type="button" role="menuitem" onClick={onSortColumnDescending} disabled={!canEdit}>Ordenar Z → A</button>
            <button type="button" role="menuitem" onClick={onSetTypeText} disabled={!canEdit}>Tipo: texto</button>
            <button type="button" role="menuitem" onClick={onSetTypeNumber} disabled={!canEdit}>Tipo: número</button>
            <button type="button" role="menuitem" onClick={onSetTypeCurrency} disabled={!canEdit}>Tipo: moeda</button>
            <button type="button" role="menuitem" onClick={onSetTypePercent} disabled={!canEdit}>Tipo: percentual</button>
          </>
        ) : null}
        <span aria-hidden="true" />
        <button type="button" role="menuitem" onClick={onInsertRowAbove} disabled={!canEdit}>Inserir linha acima</button>
        <button type="button" role="menuitem" onClick={onInsertRowBelow} disabled={!canEdit}>Inserir linha abaixo</button>
        <button type="button" role="menuitem" onClick={onDuplicateRow} disabled={!canEdit || isColumn}>Duplicar linha</button>
        <button type="button" role="menuitem" onClick={onInsertColumnLeft} disabled={!canEdit}>Inserir coluna à esquerda</button>
        <button type="button" role="menuitem" onClick={onInsertColumnRight} disabled={!canEdit}>Inserir coluna à direita</button>
        <button type="button" role="menuitem" onClick={onDuplicateColumn} disabled={!canEdit || isRow}>Duplicar coluna</button>
        <span aria-hidden="true" />
        <button type="button" role="menuitem" data-danger="true" onClick={onDeleteRow} disabled={!canEdit || isColumn}>Excluir linha</button>
        <button type="button" role="menuitem" data-danger="true" onClick={onDeleteColumn} disabled={!canEdit || isRow}>Excluir coluna</button>
      </section>
    </div>
  );
}

export default function UserSpreadsheetPanel({ ownerUserId, canEdit = true, showToast }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [activeCell, setActiveCell] = useState(null);
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [selectionFocus, setSelectionFocus] = useState(null);
  const [formulaValue, setFormulaValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [resizeState, setResizeState] = useState(null);
  const [scrollState, setScrollState] = useState({});
  const [syncState, setSyncState] = useState({ status: 'idle', detail: 'Pronto' });
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterColumnKey, setFilterColumnKey] = useState('all');
  const [filterQuery, setFilterQuery] = useState('');
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const draftRef = useRef(new Map());

  const viewRows = useMemo(() => {
    const query = sanitizeCellValue(filterQuery).toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const keys = filterColumnKey === 'all' ? columns.map((column) => column.key) : [filterColumnKey];
      return keys.some((key) => sanitizeCellValue(row?.[key] || '').toLowerCase().includes(query));
    });
  }, [columns, filterColumnKey, filterQuery, rows]);

  const searchMatches = useMemo(() => {
    const query = sanitizeCellValue(searchQuery).toLowerCase();
    if (!query) return [];
    const matches = [];
    viewRows.forEach((row) => {
      columns.forEach((column) => {
        if (sanitizeCellValue(row?.[column.key] || '').toLowerCase().includes(query)) {
          matches.push({ rowId: row.id, key: column.key });
        }
      });
    });
    return matches;
  }, [columns, searchQuery, viewRows]);

  const selectionBounds = useMemo(() => normalizeSelectionRange(selectionAnchor || activeCell, selectionFocus || activeCell, viewRows, columns), [activeCell, columns, viewRows, selectionAnchor, selectionFocus]);
  const selectedCells = useMemo(() => buildSelectedCells(viewRows, columns, selectionBounds), [columns, viewRows, selectionBounds]);
  const selectedCellIds = useMemo(() => new Set(selectedCells.map((cell) => cell.id)), [selectedCells]);
  const selectedCount = selectedCells.length || (activeCell ? 1 : 0);
  const selectedSummary = useMemo(() => buildSelectionSummary(selectedCells), [selectedCells]);
  const selectedHasBold = useMemo(() => sameStyleValue(selectedCells, 'bold', true), [selectedCells]);
  const selectedHasItalic = useMemo(() => sameStyleValue(selectedCells, 'italic', true), [selectedCells]);
  const selectedHasUnderline = useMemo(() => sameStyleValue(selectedCells, 'underline', true), [selectedCells]);
  const selectedAlign = useMemo(() => {
    if (!selectedCells.length) return '';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.textAlign || '';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.textAlign || '') === first) ? first : '';
  }, [selectedCells]);
  const selectedNumberFormat = useMemo(() => {
    if (!selectedCells.length) return 'text';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.numberFormat || 'text';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.numberFormat || 'text') === first) ? first : 'mixed';
  }, [selectedCells]);

  const displayValueMap = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      columns.forEach((column) => {
        const raw = sanitizeCellValue(row?.[column.key] || '');
        const style = getCellStyle(row, column.key);
        const result = raw.startsWith('=') ? evaluateFormula(raw, rows, columns, new Set([`${row.id}:${column.key}`])) : { value: raw, ok: true };
        map.set(`${row.id}:${column.key}`, {
          value: formatCellDisplayValue(result.value, style),
          raw,
          isFormula: raw.startsWith('='),
          hasFormulaError: raw.startsWith('=') && !result.ok,
        });
      });
    });
    return map;
  }, [columns, rows]);

  const formulaCount = useMemo(() => {
    let count = 0;
    rows.forEach((row) => {
      columns.forEach((column) => {
        if (sanitizeCellValue(row?.[column.key] || '').startsWith('=')) count += 1;
      });
    });
    return count;
  }, [columns, rows]);

  const formulaReferenceIds = useMemo(() => getFormulaReferences(formulaValue, rows, columns), [columns, formulaValue, rows]);

  const activeSheet = useMemo(() => sheets.find((sheet) => sheet.id === activeSheetId) || null, [activeSheetId, sheets]);
  const activeColumn = useMemo(() => columns.find((column) => column.key === activeCell?.key) || null, [activeCell?.key, columns]);
  const activeRow = useMemo(() => rows.find((row) => row.id === activeCell?.rowId) || null, [activeCell?.rowId, rows]);
  const activeRowIndex = useMemo(() => rows.findIndex((row) => row.id === activeCell?.rowId), [activeCell?.rowId, rows]);
  const activeColumnIndex = useMemo(() => columns.findIndex((column) => column.key === activeCell?.key), [activeCell?.key, columns]);
  const canMutateSheet = canEdit && activeSheetId && !busy;

  const markSync = useCallback((status, detail) => {
    setSyncState({ status, detail });
  }, []);

  const notifyError = useCallback((error, fallback) => {
    const message = error?.message || fallback;
    markSync('error', message);
    showToast?.(message, { variant: 'error' });
  }, [markSync, showToast]);


  const requestDeleteConfirmation = useCallback((confirmation) => {
    setDeleteConfirmation(confirmation);
  }, []);

  const closeDeleteConfirmation = useCallback(() => {
    if (busy) return;
    setDeleteConfirmation(null);
  }, [busy]);

  const confirmDeleteAction = useCallback(() => {
    const action = deleteConfirmation?.action;
    if (!action) return;
    setDeleteConfirmation(null);
    action();
  }, [deleteConfirmation]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const loadSheet = useCallback(async (sheetId) => {
    if (!ownerUserId) return;
    setLoading(true);
    try {
      const data = await listSupportDailyRows(sheetId, { ownerUserId });
      const nextColumns = normalizeColumns(data.columns || []);
      const nextRows = normalizeRows(data.rows || [], nextColumns);
      setSheets(data.sheets || []);
      setActiveSheetId(data.activeSheetId || data.sheets?.[0]?.id || '');
      setColumns(nextColumns);
      setRows(nextRows);
      setActiveCell(null);
      setSelectionAnchor(null);
      setSelectionFocus(null);
      setFormulaValue('');
      setContextMenu(null);
      setSearchQuery('');
      setFilterQuery('');
      setFilterColumnKey('all');
      markSync('saved', 'Planilha carregada');
    } catch (error) {
      notifyError(error, 'Não foi possível carregar as planilhas.');
    } finally {
      setLoading(false);
    }
  }, [markSync, notifyError, ownerUserId]);

  useEffect(() => {
    loadSheet(activeSheetId).catch(() => {});
  }, [ownerUserId]);

  useEffect(() => {
    setFormulaValue(activeCellText(activeCell, rows));
  }, [activeCell, rows]);

  const selectCell = useCallback((rowId, key, _element, extendSelection = false) => {
    const nextCell = { rowId, key };
    setActiveCell(nextCell);
    setSelectionFocus(nextCell);
    setSelectionAnchor((current) => (extendSelection && current ? current : nextCell));
  }, []);

  const selectRow = useCallback((rowId) => {
    const firstColumn = columns[0];
    if (!firstColumn) return;
    const nextCell = { rowId, key: firstColumn.key };
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus({ rowId, key: columns[columns.length - 1]?.key || firstColumn.key });
  }, [columns]);

  const selectColumn = useCallback((key) => {
    if (!viewRows.length) return;
    const firstRow = viewRows[0];
    const lastRow = viewRows[viewRows.length - 1];
    const nextCell = { rowId: firstRow.id, key };
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus({ rowId: lastRow.id, key });
  }, [viewRows]);

  const navigateCell = useCallback((rowId, key, rowDelta = 0, columnDelta = 0, extendSelection = false) => {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const columnIndex = columns.findIndex((column) => column.key === key);
    if (rowIndex < 0 || columnIndex < 0) return;
    const nextRow = rows[Math.max(0, Math.min(rows.length - 1, rowIndex + rowDelta))];
    const nextColumn = columns[Math.max(0, Math.min(columns.length - 1, columnIndex + columnDelta))];
    if (nextRow && nextColumn) {
      const nextCell = { rowId: nextRow.id, key: nextColumn.key };
      setActiveCell(nextCell);
      setSelectionFocus(nextCell);
      setSelectionAnchor((current) => (extendSelection && current ? current : nextCell));
    }
  }, [columns, rows]);

  const jumpCell = useCallback((rowId, key, options = {}) => {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const columnIndex = columns.findIndex((column) => column.key === key);
    if (rowIndex < 0 || columnIndex < 0) return;
    const targetRowIndex = options.axis === 'both' ? (options.edge === 'start' ? 0 : rows.length - 1) : rowIndex;
    const targetColumnIndex = options.edge === 'start' ? 0 : columns.length - 1;
    const targetRow = rows[targetRowIndex];
    const targetColumn = columns[targetColumnIndex];
    if (!targetRow || !targetColumn) return;
    const nextCell = { rowId: targetRow.id, key: targetColumn.key };
    setActiveCell(nextCell);
    setSelectionFocus(nextCell);
    setSelectionAnchor((current) => (options.extendSelection && current ? current : nextCell));
  }, [columns, rows]);

  const setCellDraft = useCallback((rowId, key, value) => {
    const cleanValue = sanitizeCellValue(value);
    draftRef.current.set(`${rowId}:${key}`, cleanValue);
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [key]: cleanValue } : row)));
  }, []);

  const applyStyleToSelection = useCallback(async (patchFactory) => {
    if (!canEdit || !selectedCells.length) return;
    const updatesByRow = new Map();
    const nextRows = rows.map((row) => {
      const targetCells = selectedCells.filter((cell) => cell.row.id === row.id);
      if (!targetCells.length) return row;
      const nextStyles = { ...(row.__styles || {}) };
      targetCells.forEach(({ column }) => {
        const currentStyle = nextStyles[column.key] || {};
        const patch = typeof patchFactory === 'function' ? patchFactory(currentStyle, column.key, row) : patchFactory;
        nextStyles[column.key] = mergeCellStyle(currentStyle, patch);
      });
      updatesByRow.set(row.id, Object.fromEntries(targetCells.map(({ column }) => [column.key, nextStyles[column.key]])));
      return { ...row, __styles: nextStyles };
    });

    setRows(nextRows);
    markSync('saving', 'Salvando formatação');
    setBusy('format');
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, styles]) => updateSupportDailyRow(rowId, { styles })));
      markSync('saved', 'Formatação salva');
    } catch (error) {
      notifyError(error, 'Não foi possível salvar a formatação.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canEdit, loadSheet, markSync, notifyError, rows, selectedCells]);

  const toggleStyle = useCallback((styleKey) => {
    const enabled = !sameStyleValue(selectedCells, styleKey, true);
    applyStyleToSelection({ [styleKey]: enabled }).catch(() => {});
  }, [applyStyleToSelection, selectedCells]);

  const setTextAlign = useCallback((textAlign) => {
    const nextAlign = selectedAlign === textAlign ? '' : textAlign;
    applyStyleToSelection({ textAlign: nextAlign }).catch(() => {});
  }, [applyStyleToSelection, selectedAlign]);

  const setNumberFormat = useCallback((numberFormat) => {
    applyStyleToSelection({ numberFormat }).catch(() => {});
  }, [applyStyleToSelection]);

  const clearSelectionFormatting = useCallback(() => {
    applyStyleToSelection({ bold: false, italic: false, underline: false, textAlign: '' }).catch(() => {});
  }, [applyStyleToSelection]);

  const applyValueToSelection = useCallback(async () => {
    if (!canEdit || !selectedCells.length || !activeCell?.rowId || !activeCell?.key) return;
    const sourceValue = sanitizeCellValue(formulaValue || activeCellText(activeCell, rows));
    const updatesByRow = new Map();
    const optimistic = rows.map((row) => {
      const targetCells = selectedCells.filter((cell) => cell.row.id === row.id);
      if (!targetCells.length) return row;
      const next = { ...row };
      const patch = {};
      targetCells.forEach(({ column }) => {
        next[column.key] = sourceValue;
        patch[column.key] = sourceValue;
      });
      updatesByRow.set(row.id, patch);
      return next;
    });

    setRows(optimistic);
    markSync('saving', 'Preenchendo seleção');
    setBusy('fill-selection');
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', 'Seleção preenchida');
    } catch (error) {
      notifyError(error, 'Não foi possível preencher a seleção.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeCell, activeSheetId, canEdit, formulaValue, loadSheet, markSync, notifyError, rows, selectedCells]);

  const autoFillSelection = useCallback(async (targetCell) => {
    if (!canEdit || !selectionBounds || !targetCell?.rowId || !targetCell?.key) return;
    const targetRowIndex = viewRows.findIndex((row) => row.id === targetCell.rowId);
    const targetColumnIndex = columns.findIndex((column) => column.key === targetCell.key);
    if (targetRowIndex < 0 || targetColumnIndex < 0) return;

    const fillBounds = {
      startRow: Math.min(selectionBounds.startRow, targetRowIndex),
      endRow: Math.max(selectionBounds.endRow, targetRowIndex),
      startColumn: Math.min(selectionBounds.startColumn, targetColumnIndex),
      endColumn: Math.max(selectionBounds.endColumn, targetColumnIndex),
    };

    const sourceRowCount = selectionBounds.endRow - selectionBounds.startRow + 1;
    const sourceColumnCount = selectionBounds.endColumn - selectionBounds.startColumn + 1;
    const updatesByRow = new Map();
    const optimistic = rows.map((row) => {
      const visibleRowIndex = viewRows.findIndex((entry) => entry.id === row.id);
      if (visibleRowIndex < fillBounds.startRow || visibleRowIndex > fillBounds.endRow) return row;
      const next = { ...row, __styles: { ...(row.__styles || {}) } };
      const patch = {};
      const stylePatch = {};

      for (let columnIndex = fillBounds.startColumn; columnIndex <= fillBounds.endColumn; columnIndex += 1) {
        const column = columns[columnIndex];
        if (!column) continue;
        const insideSource = visibleRowIndex >= selectionBounds.startRow && visibleRowIndex <= selectionBounds.endRow && columnIndex >= selectionBounds.startColumn && columnIndex <= selectionBounds.endColumn;
        if (insideSource) continue;

        const sourceRowIndex = selectionBounds.startRow + positiveModulo(visibleRowIndex - selectionBounds.startRow, sourceRowCount);
        const sourceColumnIndex = selectionBounds.startColumn + positiveModulo(columnIndex - selectionBounds.startColumn, sourceColumnCount);
        const sourceRow = viewRows[sourceRowIndex];
        const sourceColumn = columns[sourceColumnIndex];
        if (!sourceRow || !sourceColumn) continue;

        const fillingRight = targetColumnIndex > selectionBounds.endColumn;
        const fillingLeft = targetColumnIndex < selectionBounds.startColumn;
        const fillingDown = targetRowIndex > selectionBounds.endRow;
        const fillingUp = targetRowIndex < selectionBounds.startRow;
        const extendingRows = fillingDown || fillingUp;
        const extendingColumns = fillingRight || fillingLeft;
        const sourceValues = extendingColumns
          ? Array.from({ length: sourceColumnCount }, (_, offset) => sanitizeCellValue(sourceRow?.[columns[selectionBounds.startColumn + offset]?.key] || ''))
          : Array.from({ length: sourceRowCount }, (_, offset) => sanitizeCellValue(viewRows[selectionBounds.startRow + offset]?.[sourceColumn.key] || ''));
        const directionalValues = fillingLeft || fillingUp ? [...sourceValues].reverse() : sourceValues;
        const sequenceOffset = extendingColumns
          ? (fillingLeft ? selectionBounds.startColumn - columnIndex : columnIndex - selectionBounds.endColumn)
          : (fillingUp ? selectionBounds.startRow - visibleRowIndex : visibleRowIndex - selectionBounds.endRow);
        const value = (extendingRows || extendingColumns)
          ? buildSequenceValue(directionalValues, Math.max(1, sequenceOffset), extendingColumns ? 'column' : 'row')
          : sanitizeCellValue(sourceRow?.[sourceColumn.key] || '');
        next[column.key] = value;
        patch[column.key] = value;

        const sourceStyle = getCellStyle(sourceRow, sourceColumn.key);
        if (Object.keys(sourceStyle).length) {
          next.__styles[column.key] = { ...sourceStyle };
          stylePatch[column.key] = { ...sourceStyle };
        }
      }

      if (Object.keys(patch).length || Object.keys(stylePatch).length) {
        updatesByRow.set(row.id, Object.keys(stylePatch).length ? { ...patch, styles: stylePatch } : patch);
        return next;
      }
      return row;
    });

    if (!updatesByRow.size) return;
    setRows(optimistic);
    setSelectionAnchor({ rowId: viewRows[fillBounds.startRow]?.id, key: columns[fillBounds.startColumn]?.key });
    setSelectionFocus({ rowId: viewRows[fillBounds.endRow]?.id, key: columns[fillBounds.endColumn]?.key });
    markSync('saving', 'Aplicando preenchimento');
    setBusy('autofill');
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', 'Preenchimento aplicado');
    } catch (error) {
      notifyError(error, 'Não foi possível aplicar o preenchimento.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canEdit, columns, loadSheet, markSync, notifyError, rows, selectionBounds, viewRows]);

  const commitCell = useCallback(async (rowId, key) => {
    if (!rowId || !key || !canEdit) return;
    const draftKey = `${rowId}:${key}`;
    const currentRow = rows.find((row) => row.id === rowId);
    const value = draftRef.current.has(draftKey) ? draftRef.current.get(draftKey) : sanitizeCellValue(currentRow?.[key] || '');
    draftRef.current.delete(draftKey);
    setSavingCell(draftKey);
    markSync('saving', 'Salvando célula');
    try {
      const response = await updateSupportDailyRow(rowId, { [key]: value });
      if (response?.row) {
        setRows((current) => normalizeRows(current.map((row) => (row.id === rowId ? { ...row, ...response.row } : row)), columns));
      }
      markSync('saved', 'Célula salva');
    } catch (error) {
      notifyError(error, 'Não foi possível salvar a célula.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
  }, [activeSheetId, canEdit, columns, loadSheet, markSync, notifyError, rows]);

  const commitFormula = useCallback(() => {
    if (!activeCell?.rowId || !activeCell?.key) return;
    setCellDraft(activeCell.rowId, activeCell.key, formulaValue);
    commitCell(activeCell.rowId, activeCell.key).catch(() => {});
  }, [activeCell, commitCell, formulaValue, setCellDraft]);

  const addSheet = useCallback(async () => {
    if (!ownerUserId || !canEdit) return;
    setBusy('sheet');
    markSync('saving', 'Criando planilha');
    try {
      const response = await createSupportDailySheet({ ownerUserId, name: 'Nova planilha', columnCount: 8, rowCount: 24, columnWidth: DEFAULT_COLUMN_WIDTH });
      const nextColumns = normalizeColumns(response.columns || []);
      setSheets(response.sheets || (response.sheet ? [response.sheet] : []));
      setActiveSheetId(response.sheet?.id || response.activeSheetId || '');
      setColumns(nextColumns);
      setRows(normalizeRows(response.rows || [], nextColumns));
      markSync('saved', 'Planilha criada');
    } catch (error) {
      notifyError(error, 'Não foi possível criar a planilha.');
    } finally {
      setBusy('');
    }
  }, [canEdit, markSync, notifyError, ownerUserId]);

  const renameSheet = useCallback(async (sheetId, name) => {
    const title = sanitizeCellValue(name) || 'Planilha sem título';
    setSheets((current) => current.map((sheet) => (sheet.id === sheetId ? { ...sheet, name: title } : sheet)));
    try {
      await updateSupportDailySheet(sheetId, { ownerUserId, name: title });
      markSync('saved', 'Nome salvo');
    } catch (error) {
      notifyError(error, 'Não foi possível renomear a planilha.');
      loadSheet(activeSheetId).catch(() => {});
    }
  }, [activeSheetId, loadSheet, markSync, notifyError, ownerUserId]);

  const performDeleteSheet = useCallback(async (sheetId) => {
    setBusy('delete-sheet');
    try {
      await deleteSupportDailySheet(sheetId, { ownerUserId });
      const nextId = sheets.find((item) => item.id !== sheetId)?.id || '';
      await loadSheet(nextId);
      markSync('saved', 'Planilha excluída');
    } catch (error) {
      notifyError(error, 'Não foi possível excluir a planilha.');
    } finally {
      setBusy('');
    }
  }, [loadSheet, markSync, notifyError, ownerUserId, sheets]);

  const deleteSheet = useCallback((sheetId) => {
    const sheet = sheets.find((item) => item.id === sheetId);
    if (!sheet) return;
    requestDeleteConfirmation({
      title: 'Excluir planilha',
      message: `A planilha "${sheet.name}" será removida definitivamente.`,
      confirmLabel: 'Excluir planilha',
      action: () => { performDeleteSheet(sheetId).catch(() => {}); },
    });
  }, [performDeleteSheet, requestDeleteConfirmation, sheets]);

  const addRow = useCallback(async () => {
    if (!canMutateSheet) return null;
    setBusy('row');
    try {
      const response = await createSupportDailyRow({ ownerUserId, sheetId: activeSheetId });
      const nextRow = normalizeRows([response.row], columns)[0];
      setRows((current) => [...current, nextRow]);
      setActiveCell({ rowId: nextRow.id, key: columns[0]?.key || '' });
      markSync('saved', 'Linha criada');
      return nextRow;
    } catch (error) {
      notifyError(error, 'Não foi possível criar a linha.');
      return null;
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canMutateSheet, columns, markSync, notifyError, ownerUserId]);

  const createRowSilently = useCallback(async () => {
    const response = await createSupportDailyRow({ ownerUserId, sheetId: activeSheetId });
    return normalizeRows([response.row], columns)[0];
  }, [activeSheetId, columns, ownerUserId]);

  const performDeleteRow = useCallback(async (row) => {
    setBusy('delete-row');
    try {
      await deleteSupportDailyRow(row.id, { ownerUserId, sheetId: activeSheetId });
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setActiveCell(null);
      setSelectionAnchor(null);
      setSelectionFocus(null);
      markSync('saved', 'Linha excluída');
    } catch (error) {
      notifyError(error, 'Não foi possível excluir a linha.');
    } finally {
      setBusy('');
    }
  }, [activeSheetId, markSync, notifyError, ownerUserId]);

  const deleteRow = useCallback(() => {
    if (!activeRow) return;
    const row = activeRow;
    requestDeleteConfirmation({
      title: 'Excluir linha',
      message: `A linha ${activeRowIndex + 1} será removida definitivamente da planilha ativa.`,
      confirmLabel: 'Excluir linha',
      action: () => { performDeleteRow(row).catch(() => {}); },
    });
  }, [activeRow, activeRowIndex, performDeleteRow, requestDeleteConfirmation]);

  const addColumn = useCallback(async () => {
    if (!canMutateSheet) return null;
    setBusy('column');
    try {
      const label = columnName(columns.length);
      const response = await createSupportDailyColumn({ ownerUserId, sheetId: activeSheetId, label, width: DEFAULT_COLUMN_WIDTH });
      const nextColumns = normalizeColumns(response.columns || (response.column ? [...columns, response.column] : columns));
      setColumns(nextColumns);
      setRows((current) => normalizeRows(current, nextColumns));
      markSync('saved', 'Coluna criada');
      return nextColumns[nextColumns.length - 1] || null;
    } catch (error) {
      notifyError(error, 'Não foi possível criar a coluna.');
      return null;
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canMutateSheet, columns, markSync, notifyError, ownerUserId]);

  const createColumnSilently = useCallback(async (index) => {
    const label = columnName(index);
    const response = await createSupportDailyColumn({ ownerUserId, sheetId: activeSheetId, label, width: DEFAULT_COLUMN_WIDTH });
    return normalizeColumns(response.columns || [response.column]).at(-1) || response.column;
  }, [activeSheetId, ownerUserId]);

  const performDeleteColumn = useCallback(async (columnToDelete) => {
    setBusy('delete-column');
    try {
      await deleteSupportDailyColumn(columnToDelete.key, { ownerUserId, sheetId: activeSheetId });
      const nextColumns = columns.filter((column) => column.key !== columnToDelete.key);
      setColumns(nextColumns);
      setRows((current) => current.map((row) => {
        const next = { ...row };
        delete next[columnToDelete.key];
        return next;
      }));
      setActiveCell(null);
      setSelectionAnchor(null);
      setSelectionFocus(null);
      markSync('saved', 'Coluna excluída');
    } catch (error) {
      notifyError(error, 'Não foi possível excluir a coluna.');
    } finally {
      setBusy('');
    }
  }, [activeSheetId, columns, markSync, notifyError, ownerUserId]);

  const deleteColumn = useCallback(() => {
    if (!activeColumn) return;
    const columnToDelete = activeColumn;
    requestDeleteConfirmation({
      title: 'Excluir coluna',
      message: `A coluna "${columnToDelete.label}" será removida definitivamente da planilha ativa.`,
      confirmLabel: 'Excluir coluna',
      action: () => { performDeleteColumn(columnToDelete).catch(() => {}); },
    });
  }, [activeColumn, performDeleteColumn, requestDeleteConfirmation]);

  const persistRowOrder = useCallback(async (nextRows) => {
    const ordered = nextRows.map((row, index) => ({ ...row, position: index + 1 }));
    setRows(normalizeRows(ordered, columns));
    await Promise.all(ordered.map((row) => updateSupportDailyRow(row.id, { position: row.position })));
    return ordered;
  }, [columns]);

  const persistColumnOrder = useCallback(async (nextColumns) => {
    const ordered = normalizeColumns(nextColumns.map((column, index) => ({ ...column, position: index + 1 })));
    setColumns(ordered);
    setRows((current) => normalizeRows(current, ordered));
    await Promise.all(ordered.map((column) => updateSupportDailyColumn(column.key, { position: column.position })));
    return ordered;
  }, []);

  const insertRowAtActive = useCallback(async (placement = 'below') => {
    if (!canMutateSheet) return;
    const referenceIndex = activeRow ? rows.findIndex((row) => row.id === activeRow.id) : rows.length - 1;
    const targetIndex = placement === 'above' ? Math.max(0, referenceIndex) : Math.max(0, referenceIndex + 1);
    setBusy(`insert-row-${placement}`);
    markSync('saving', 'Inserindo linha');
    try {
      const response = await createSupportDailyRow({ ownerUserId, sheetId: activeSheetId });
      const created = normalizeRows([response.row], columns)[0];
      const withoutCreated = rows.filter((row) => row.id !== created.id);
      const ordered = reorderByIndex([...withoutCreated, created], withoutCreated.length, Math.min(targetIndex, withoutCreated.length));
      await persistRowOrder(ordered);
      const nextCell = { rowId: created.id, key: columns[0]?.key || '' };
      setActiveCell(nextCell);
      setSelectionAnchor(nextCell);
      setSelectionFocus(nextCell);
      markSync('saved', placement === 'above' ? 'Linha inserida acima' : 'Linha inserida abaixo');
    } catch (error) {
      notifyError(error, 'Não foi possível inserir a linha.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeRow, activeSheetId, canMutateSheet, columns, loadSheet, markSync, notifyError, ownerUserId, persistRowOrder, rows]);

  const duplicateActiveRow = useCallback(async () => {
    if (!canMutateSheet || !activeRow) return;
    const referenceIndex = rows.findIndex((row) => row.id === activeRow.id);
    setBusy('duplicate-row');
    markSync('saving', 'Duplicando linha');
    try {
      const response = await createSupportDailyRow({ ownerUserId, sheetId: activeSheetId });
      const created = normalizeRows([response.row], columns)[0];
      const valuePatch = cloneRowValues(activeRow, columns);
      const stylePatch = activeRow.__styles && Object.keys(activeRow.__styles).length ? { styles: activeRow.__styles } : {};
      await updateSupportDailyRow(created.id, { ...valuePatch, ...stylePatch });
      const hydrated = { ...created, ...valuePatch, __styles: { ...(activeRow.__styles || {}) } };
      const withoutCreated = rows.filter((row) => row.id !== created.id);
      const ordered = reorderByIndex([...withoutCreated, hydrated], withoutCreated.length, Math.min(referenceIndex + 1, withoutCreated.length));
      await persistRowOrder(ordered);
      const nextCell = { rowId: hydrated.id, key: activeCell?.key || columns[0]?.key || '' };
      setActiveCell(nextCell);
      setSelectionAnchor(nextCell);
      setSelectionFocus(nextCell);
      markSync('saved', 'Linha duplicada');
    } catch (error) {
      notifyError(error, 'Não foi possível duplicar a linha.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeCell?.key, activeRow, activeSheetId, canMutateSheet, columns, loadSheet, markSync, notifyError, ownerUserId, persistRowOrder, rows]);

  const insertColumnAtActive = useCallback(async (placement = 'right') => {
    if (!canMutateSheet) return;
    const referenceIndex = activeColumn ? columns.findIndex((column) => column.key === activeColumn.key) : columns.length - 1;
    const targetIndex = placement === 'left' ? Math.max(0, referenceIndex) : Math.max(0, referenceIndex + 1);
    setBusy(`insert-column-${placement}`);
    markSync('saving', 'Inserindo coluna');
    try {
      const label = columnName(columns.length);
      const response = await createSupportDailyColumn({ ownerUserId, sheetId: activeSheetId, label, width: DEFAULT_COLUMN_WIDTH });
      const created = normalizeColumns(response.columns || [response.column]).find((column) => !columns.some((item) => item.key === column.key)) || normalizeColumns([response.column]).at(0);
      if (!created) throw new Error('Coluna criada não retornou da API.');
      const withoutCreated = columns.filter((column) => column.key !== created.key);
      const ordered = reorderByIndex([...withoutCreated, created], withoutCreated.length, Math.min(targetIndex, withoutCreated.length));
      await persistColumnOrder(ordered);
      const nextCell = { rowId: activeCell?.rowId || rows[0]?.id || '', key: created.key };
      setActiveCell(nextCell);
      setSelectionAnchor(nextCell);
      setSelectionFocus(nextCell);
      markSync('saved', placement === 'left' ? 'Coluna inserida à esquerda' : 'Coluna inserida à direita');
    } catch (error) {
      notifyError(error, 'Não foi possível inserir a coluna.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeCell?.rowId, activeColumn, activeSheetId, canMutateSheet, columns, loadSheet, markSync, notifyError, ownerUserId, persistColumnOrder, rows]);

  const duplicateActiveColumn = useCallback(async () => {
    if (!canMutateSheet || !activeColumn) return;
    const referenceIndex = columns.findIndex((column) => column.key === activeColumn.key);
    setBusy('duplicate-column');
    markSync('saving', 'Duplicando coluna');
    try {
      const response = await createSupportDailyColumn({ ownerUserId, sheetId: activeSheetId, label: `${activeColumn.label || 'Coluna'} cópia`, width: activeColumn.width || DEFAULT_COLUMN_WIDTH });
      const created = normalizeColumns(response.columns || [response.column]).find((column) => !columns.some((item) => item.key === column.key)) || normalizeColumns([response.column]).at(0);
      if (!created) throw new Error('Coluna criada não retornou da API.');
      const rowUpdates = rows.map((row) => {
        const value = sanitizeCellValue(row?.[activeColumn.key] || '');
        const sourceStyle = getCellStyle(row, activeColumn.key);
        const patch = Object.keys(sourceStyle).length ? { [created.key]: value, styles: { [created.key]: sourceStyle } } : { [created.key]: value };
        return updateSupportDailyRow(row.id, patch);
      });
      await Promise.all(rowUpdates);
      const withoutCreated = columns.filter((column) => column.key !== created.key);
      const ordered = reorderByIndex([...withoutCreated, created], withoutCreated.length, Math.min(referenceIndex + 1, withoutCreated.length));
      await persistColumnOrder(ordered);
      setRows((current) => normalizeRows(current.map((row) => ({
        ...row,
        [created.key]: sanitizeCellValue(row?.[activeColumn.key] || ''),
        __styles: getCellStyle(row, activeColumn.key) && Object.keys(getCellStyle(row, activeColumn.key)).length
          ? { ...(row.__styles || {}), [created.key]: { ...getCellStyle(row, activeColumn.key) } }
          : row.__styles,
      })), ordered));
      const nextCell = { rowId: activeCell?.rowId || rows[0]?.id || '', key: created.key };
      setActiveCell(nextCell);
      setSelectionAnchor(nextCell);
      setSelectionFocus(nextCell);
      markSync('saved', 'Coluna duplicada');
    } catch (error) {
      notifyError(error, 'Não foi possível duplicar a coluna.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeCell?.rowId, activeColumn, activeSheetId, canMutateSheet, columns, loadSheet, markSync, notifyError, ownerUserId, persistColumnOrder, rows]);

  const clearSelectionValues = useCallback(async () => {
    if (!canEdit || !selectedCells.length) return;
    const updatesByRow = new Map();
    const optimistic = rows.map((row) => {
      const targetCells = selectedCells.filter((cell) => cell.row.id === row.id);
      if (!targetCells.length) return row;
      const next = { ...row };
      const patch = {};
      targetCells.forEach(({ column }) => {
        next[column.key] = '';
        patch[column.key] = '';
      });
      updatesByRow.set(row.id, patch);
      return next;
    });
    setRows(optimistic);
    markSync('saving', 'Limpando conteúdo');
    setBusy('clear-values');
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', 'Conteúdo limpo');
    } catch (error) {
      notifyError(error, 'Não foi possível limpar o conteúdo.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canEdit, loadSheet, markSync, notifyError, rows, selectedCells]);


  const sortActiveColumn = useCallback(async (direction = 'asc') => {
    if (!canMutateSheet || !activeColumn) return;
    setBusy(`sort-column-${direction}`);
    markSync('saving', 'Ordenando coluna');
    try {
      const sorted = [...rows].sort((a, b) => {
        const result = compareSheetValues(a?.[activeColumn.key] || '', b?.[activeColumn.key] || '');
        return direction === 'asc' ? result : -result;
      });
      await persistRowOrder(sorted);
      const firstRow = sorted[0];
      if (firstRow) {
        const nextCell = { rowId: firstRow.id, key: activeColumn.key };
        setActiveCell(nextCell);
        setSelectionAnchor(nextCell);
        setSelectionFocus({ rowId: sorted[sorted.length - 1]?.id || firstRow.id, key: activeColumn.key });
      }
      markSync('saved', direction === 'asc' ? 'Coluna ordenada A-Z' : 'Coluna ordenada Z-A');
    } catch (error) {
      notifyError(error, 'Não foi possível ordenar a coluna.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeColumn, activeSheetId, canMutateSheet, loadSheet, markSync, notifyError, persistRowOrder, rows]);

  const changeColumnLabel = useCallback((key, label) => {
    setColumns((current) => current.map((column) => (column.key === key ? { ...column, label: sanitizeCellValue(label).slice(0, 80) } : column)));
  }, []);

  const commitColumnLabel = useCallback(async (key) => {
    const column = columns.find((item) => item.key === key);
    if (!column) return;
    setSavingColumn(key);
    try {
      await updateSupportDailyColumn(key, { label: column.label || 'Coluna' });
      markSync('saved', 'Coluna salva');
    } catch (error) {
      notifyError(error, 'Não foi possível salvar a coluna.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setSavingColumn('');
    }
  }, [activeSheetId, columns, loadSheet, markSync, notifyError]);

  const startResize = useCallback((event, key) => {
    if (!canEdit) return;
    const column = columns.find((item) => item.key === key);
    if (!column) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(column.width || DEFAULT_COLUMN_WIDTH);
    const columnIndex = columns.findIndex((item) => item.key === key);
    const left = 52 + columns.slice(0, columnIndex).reduce((sum, item) => sum + Math.max(MIN_COLUMN_WIDTH, Number(item.width || DEFAULT_COLUMN_WIDTH)), 0) + startWidth;
    setResizeState({ key, label: column.label, width: startWidth, left });

    const onMove = (moveEvent) => {
      const width = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX));
      setColumns((current) => current.map((item) => (item.key === key ? { ...item, width } : item)));
      setResizeState((current) => current ? { ...current, width, left: left + width - startWidth } : current);
    };

    const onUp = async (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const width = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + upEvent.clientX - startX));
      setResizeState(null);
      setSavingColumn(key);
      try {
        await updateSupportDailyColumn(key, { width });
        markSync('saved', 'Largura salva');
      } catch (error) {
        notifyError(error, 'Não foi possível redimensionar a coluna.');
        loadSheet(activeSheetId).catch(() => {});
      } finally {
        setSavingColumn('');
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, [activeSheetId, canEdit, columns, loadSheet, markSync, notifyError]);

  const ensureGridSize = useCallback(async (requiredRowCount, requiredColumnCount) => {
    let nextRows = rows;
    let nextColumns = columns;

    if (requiredColumnCount > nextColumns.length) {
      const amount = Math.min(MAX_IMPORT_COLUMNS, requiredColumnCount) - nextColumns.length;
      const createdColumns = [];
      for (let index = 0; index < amount; index += 1) {
        const created = await createColumnSilently(nextColumns.length + index);
        if (created) createdColumns.push(created);
      }
      const fresh = await listSupportDailyRows(activeSheetId, { ownerUserId });
      nextColumns = normalizeColumns(fresh.columns || [...nextColumns, ...createdColumns]);
      nextRows = normalizeRows(fresh.rows || nextRows, nextColumns);
      setColumns(nextColumns);
      setRows(nextRows);
    }

    if (requiredRowCount > nextRows.length) {
      const amount = Math.min(MAX_IMPORT_ROWS, requiredRowCount) - nextRows.length;
      const createdRows = [];
      for (let index = 0; index < amount; index += 1) {
        const created = await createRowSilently();
        if (created) createdRows.push(created);
      }
      nextRows = normalizeRows([...nextRows, ...createdRows], nextColumns);
      setRows(nextRows);
    }

    return { nextRows, nextColumns };
  }, [activeSheetId, columns, createColumnSilently, createRowSilently, ownerUserId, rows]);

  const pasteTable = useCallback(async (startRowId, startKey, text) => {
    if (!canEdit || !activeSheetId) return;
    const table = parseClipboardTable(text).slice(0, MAX_IMPORT_ROWS);
    if (!table.length) return;
    const startRowIndex = rows.findIndex((row) => row.id === startRowId);
    const startColumnIndex = columns.findIndex((column) => column.key === startKey);
    if (startRowIndex < 0 || startColumnIndex < 0) return;

    setBusy('paste');
    markSync('saving', 'Colando dados');
    try {
      const requiredRows = startRowIndex + table.length;
      const requiredColumns = startColumnIndex + Math.max(...table.map((line) => line.length));
      const { nextRows, nextColumns } = await ensureGridSize(requiredRows, requiredColumns);
      const rowPatches = new Map();
      const optimistic = nextRows.map((row, rowIndex) => {
        const sourceRow = table[rowIndex - startRowIndex];
        if (!sourceRow) return row;
        const next = { ...row };
        sourceRow.forEach((cell, offset) => {
          const column = nextColumns[startColumnIndex + offset];
          if (!column) return;
          next[column.key] = cell;
          const patch = rowPatches.get(row.id) || {};
          patch[column.key] = cell;
          rowPatches.set(row.id, patch);
        });
        return next;
      });
      setRows(normalizeRows(optimistic, nextColumns));
      await Promise.all([...rowPatches.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', 'Dados colados');
    } catch (error) {
      notifyError(error, 'Não foi possível colar os dados.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canEdit, columns, ensureGridSize, loadSheet, markSync, notifyError, rows]);

  const exportCsv = useCallback(() => {
    if (!activeSheet) return;
    const filename = `${safeFileName(activeSheet.name)}.csv`;
    downloadTextFile(filename, serializeSheetToCsv(rows, columns));
    markSync('saved', 'CSV exportado');
  }, [activeSheet, columns, markSync, rows]);

  const importDelimitedFile = useCallback(async (file) => {
    if (!file || !ownerUserId || !canEdit) return;
    setBusy('import');
    markSync('saving', 'Importando arquivo');
    try {
      const text = await file.text();
      const matrix = parseDelimitedText(text).slice(0, MAX_IMPORT_ROWS + 1);
      if (!matrix.length) throw new Error('Arquivo sem dados válidos.');
      const header = matrix[0].slice(0, MAX_IMPORT_COLUMNS).map((cell, index) => sanitizeCellValue(cell) || columnName(index));
      const body = matrix.slice(1).map((line) => line.slice(0, MAX_IMPORT_COLUMNS));
      const columnCount = Math.max(1, header.length, ...body.map((line) => line.length));
      const rowCount = Math.max(1, body.length || matrix.length);
      const response = await createSupportDailySheet({
        ownerUserId,
        name: sanitizeCellValue(file.name.replace(/\.[^.]+$/, '')) || 'Planilha importada',
        columnCount,
        rowCount,
        columnWidth: DEFAULT_COLUMN_WIDTH,
      });
      const nextColumns = normalizeColumns(response.columns || []);
      const nextRows = normalizeRows(response.rows || [], nextColumns);
      await Promise.all(nextColumns.map((column, index) => updateSupportDailyColumn(column.key, { label: header[index] || columnName(index) })));
      const rowPatches = new Map();
      nextRows.forEach((row, rowIndex) => {
        const sourceRow = body[rowIndex] || (body.length ? [] : matrix[rowIndex] || []);
        const patch = {};
        sourceRow.forEach((cell, offset) => {
          const column = nextColumns[offset];
          if (column) patch[column.key] = sanitizeCellValue(cell);
        });
        if (Object.keys(patch).length) rowPatches.set(row.id, patch);
      });
      await Promise.all([...rowPatches.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      await loadSheet(response.sheet?.id || '');
      markSync('saved', 'Arquivo importado');
    } catch (error) {
      notifyError(error, 'Não foi possível importar o arquivo.');
    } finally {
      setBusy('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [canEdit, loadSheet, markSync, notifyError, ownerUserId]);

  const openContextMenu = useCallback((event, rowId, key) => {
    event.preventDefault();
    const nextCell = { rowId, key };
    setActiveCell(nextCell);
    setSelectionAnchor((current) => current || nextCell);
    setSelectionFocus((current) => current || nextCell);
    setContextMenu({ x: event.clientX, y: event.clientY, scope: 'cell' });
  }, []);

  const openRowContextMenu = useCallback((event, rowId) => {
    event.preventDefault();
    selectRow(rowId);
    setContextMenu({ x: event.clientX, y: event.clientY, scope: 'row' });
  }, [selectRow]);

  const openColumnContextMenu = useCallback((event, key) => {
    event.preventDefault();
    selectColumn(key);
    setContextMenu({ x: event.clientX, y: event.clientY, scope: 'column' });
  }, [selectColumn]);

  const copySelection = useCallback(async () => {
    const text = serializeCellsToTsv(viewRows, columns, selectionBounds) || activeCellText(activeCell, rows);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      markSync('saved', selectedCount > 1 ? 'Intervalo copiado' : 'Célula copiada');
    } catch (error) {
      notifyError(error, 'Não foi possível copiar a seleção.');
    }
  }, [activeCell, columns, markSync, notifyError, rows, selectedCount, selectionBounds, viewRows]);

  const goToSearchMatch = useCallback((direction = 1) => {
    if (!searchMatches.length) return;
    const currentIndex = searchMatches.findIndex((match) => match.rowId === activeCell?.rowId && match.key === activeCell?.key);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + searchMatches.length) % searchMatches.length;
    const nextCell = searchMatches[nextIndex];
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus(nextCell);
  }, [activeCell?.key, activeCell?.rowId, searchMatches]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === 'Escape') {
        setContextMenu(null);
        return;
      }
      if (isTyping || !activeCell) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if ((event.key === 'Delete' || event.key === 'Backspace') && canEdit) {
        event.preventDefault();
        clearSelectionValues().catch(() => {});
        return;
      }
      if (modifier && key === 'a') {
        event.preventDefault();
        const firstRow = viewRows[0];
        const lastRow = viewRows[viewRows.length - 1];
        const firstColumn = columns[0];
        const lastColumn = columns[columns.length - 1];
        if (firstRow && lastRow && firstColumn && lastColumn) {
          const nextCell = { rowId: firstRow.id, key: firstColumn.key };
          setActiveCell(nextCell);
          setSelectionAnchor(nextCell);
          setSelectionFocus({ rowId: lastRow.id, key: lastColumn.key });
        }
        return;
      }
      if (modifier && key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus({ preventScroll: true });
        searchInputRef.current?.select();
        return;
      }
      if (modifier && key === 'enter' && canEdit) {
        event.preventDefault();
        applyValueToSelection().catch(() => {});
        return;
      }
      if (!modifier) return;
      if (key === 'c') {
        event.preventDefault();
        copySelection().catch(() => {});
      }
      if (key === 'b' && canEdit) {
        event.preventDefault();
        toggleStyle('bold');
      }
      if (key === 'i' && canEdit) {
        event.preventDefault();
        toggleStyle('italic');
      }
      if (key === 'u' && canEdit) {
        event.preventDefault();
        toggleStyle('underline');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCell, applyValueToSelection, canEdit, clearSelectionValues, columns, copySelection, toggleStyle, viewRows]);

  return (
    <section className={styles.panel} data-loading={loading || undefined}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.kicker}>Planilhas</span>
          <strong>{activeSheet?.name || 'Sem planilha ativa'}</strong>
        </div>
        <div className={styles.headerActions}>
          <Button size="sm" variant="secondary" onClick={addSheet} disabled={!canEdit || !!busy}><PlusIcon size={14} /> Nova</Button>
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!canEdit || !!busy}>Importar</Button>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!activeSheet || !!busy}>Exportar</Button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        onChange={(event) => importDelimitedFile(event.target.files?.[0]).catch(() => {})}
      />

      <div className={styles.tabsBar}>
        <div className={styles.tabsScroller} aria-label="Planilhas">
          {sheets.map((sheet, index) => (
            <div key={sheet.id} className={styles.sheetTab} data-active={sheet.id === activeSheetId || undefined}>
              <button type="button" onClick={() => loadSheet(sheet.id).catch(() => {})} title={sheet.name}>
                <em>{index + 1}</em>
                <span>{sheet.name}</span>
              </button>
              {sheet.id === activeSheetId && canEdit ? (
                <input
                  value={sheet.name}
                  aria-label="Nome da planilha"
                  onChange={(event) => setSheets((current) => current.map((item) => (item.id === sheet.id ? { ...item, name: event.target.value } : item)))}
                  onBlur={(event) => renameSheet(sheet.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                  }}
                />
              ) : null}
              {canEdit ? (
                <button type="button" className={styles.deleteSheet} aria-label="Excluir planilha" onClick={() => deleteSheet(sheet.id)}>
                  <CloseIcon size={12} />
                </button>
              ) : null}
            </div>
          ))}
          {!sheets.length && !loading ? <span className={styles.emptyTabs}>Nenhuma planilha</span> : null}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <Button size="xs" variant="ghost" onClick={addRow} disabled={!canMutateSheet}><PlusIcon size={13} /> Linha</Button>
          <Button size="xs" variant="ghost" onClick={addColumn} disabled={!canMutateSheet}><PlusIcon size={13} /> Coluna</Button>
          <Button size="xs" variant="ghost" onClick={copySelection} disabled={!activeCell}>Copiar</Button>
          <Button size="xs" variant="ghost" onClick={applyValueToSelection} disabled={!selectedCount || !canEdit || !!busy}>Preencher</Button>
        </div>
        <div className={styles.formatGroup} aria-label="Formatação da seleção">
          <button type="button" data-active={selectedHasBold || undefined} onClick={() => toggleStyle('bold')} disabled={!selectedCount || !canEdit || !!busy}>B</button>
          <button type="button" data-active={selectedHasItalic || undefined} onClick={() => toggleStyle('italic')} disabled={!selectedCount || !canEdit || !!busy}><em>I</em></button>
          <button type="button" data-active={selectedHasUnderline || undefined} onClick={() => toggleStyle('underline')} disabled={!selectedCount || !canEdit || !!busy}><u>U</u></button>
          <span aria-hidden="true" />
          <button type="button" data-active={selectedAlign === 'left' || undefined} onClick={() => setTextAlign('left')} disabled={!selectedCount || !canEdit || !!busy}>E</button>
          <button type="button" data-active={selectedAlign === 'center' || undefined} onClick={() => setTextAlign('center')} disabled={!selectedCount || !canEdit || !!busy}>C</button>
          <button type="button" data-active={selectedAlign === 'right' || undefined} onClick={() => setTextAlign('right')} disabled={!selectedCount || !canEdit || !!busy}>D</button>
          <button type="button" onClick={clearSelectionFormatting} disabled={!selectedCount || !canEdit || !!busy}>Limpar</button>
        </div>
        <label className={styles.typeGroup}>
          <span>Tipo</span>
          <select
            value={selectedNumberFormat === 'mixed' ? 'text' : selectedNumberFormat}
            aria-label="Tipo da seleção"
            disabled={!selectedCount || !canEdit || !!busy}
            onChange={(event) => setNumberFormat(event.target.value)}
          >
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="currency">Moeda</option>
            <option value="percent">Percentual</option>
          </select>
        </label>
        <div className={styles.findGroup}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            aria-label="Buscar na planilha"
            placeholder="Buscar"
            onChange={(event) => setSearchQuery(sanitizeCellValue(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                goToSearchMatch(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <button type="button" onClick={() => goToSearchMatch(-1)} disabled={!searchMatches.length}>↑</button>
          <button type="button" onClick={() => goToSearchMatch(1)} disabled={!searchMatches.length}>↓</button>
          <span>{searchQuery ? `${searchMatches.length}` : '0'}</span>
        </div>
        <div className={styles.toolbarGroup}>
          <Button size="xs" variant="ghost" onClick={deleteRow} disabled={!activeRow || !canEdit || !!busy}><TrashIcon size={13} /> Linha</Button>
          <Button size="xs" variant="ghost" onClick={deleteColumn} disabled={!activeColumn || !canEdit || !!busy}><TrashIcon size={13} /> Coluna</Button>
        </div>
      </div>

      <div className={styles.filterBar}>
        <span>Filtro</span>
        <select value={filterColumnKey} onChange={(event) => setFilterColumnKey(event.target.value)} aria-label="Coluna do filtro">
          <option value="all">Todas as colunas</option>
          {columns.map((column, index) => <option key={column.key} value={column.key}>{column.label || columnName(index)}</option>)}
        </select>
        <input
          value={filterQuery}
          aria-label="Texto do filtro"
          placeholder="Filtrar linhas"
          onChange={(event) => setFilterQuery(sanitizeCellValue(event.target.value))}
        />
        {filterQuery ? <button type="button" onClick={() => setFilterQuery('')}>Limpar</button> : null}
        <strong>{filterQuery ? `${viewRows.length}/${rows.length}` : `${rows.length}`}</strong>
      </div>

      <div className={styles.controlBar}>
        <div className={styles.nameBox}>{activeColumn && activeRowIndex >= 0 ? `${columnName(activeColumnIndex)}${activeRowIndex + 1}` : '—'}</div>
        <div className={styles.formulaBar}>
          <span>fx</span>
          {formulaValue.trim().startsWith('=') ? <em className={styles.formulaBadge}>Fórmula</em> : null}
          <input
            value={formulaValue}
            disabled={!activeCell || !canEdit}
            aria-label="Conteúdo da célula ativa"
            placeholder="Selecione uma célula"
            onChange={(event) => setFormulaValue(sanitizeCellValue(event.target.value))}
            onBlur={commitFormula}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setFormulaValue(activeCellText(activeCell, rows));
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>

      <div
        className={styles.sheetFrame}
        data-scrolled-x={scrollState.x || undefined}
        data-scrolled-y={scrollState.y || undefined}
      >
        {loading ? <div className={styles.loadingState}>Carregando planilha</div> : null}
        {!loading && activeSheetId ? (
          <SpreadsheetGrid
            columns={columns}
            rows={viewRows}
            rowsLoading={loading}
            activeCell={activeCell}
            selectedCellIds={selectedCellIds}
            selectionBounds={selectionBounds}
            selectedCount={selectedCount}
            displayValueMap={displayValueMap}
            formulaReferenceIds={formulaReferenceIds}
            savingCell={savingCell}
            savingColumn={savingColumn}
            resizeState={resizeState}
            canEdit={canEdit}
            creatingRow={busy === 'row'}
            creatingColumn={busy === 'column'}
            activeSheetId={activeSheetId}
            onAddRow={addRow}
            onAddColumn={addColumn}
            onSelectCell={selectCell}
            onSelectRow={selectRow}
            onSelectColumn={selectColumn}
            onCellChange={setCellDraft}
            onCellCommit={commitCell}
            onNavigateCell={navigateCell}
            onJumpCell={jumpCell}
            onContextMenu={openContextMenu}
            onRowContextMenu={openRowContextMenu}
            onColumnContextMenu={openColumnContextMenu}
            onPasteTable={pasteTable}
            onColumnLabelChange={changeColumnLabel}
            onColumnLabelCommit={commitColumnLabel}
            onResizeStart={startResize}
            onScrollStateChange={setScrollState}
            onAutoFillSelection={autoFillSelection}
          />
        ) : null}
        {!loading && !activeSheetId ? (
          <div className={styles.noSheetState}>
            <strong>Sem planilha ativa</strong>
            <Button size="sm" onClick={addSheet} disabled={!canEdit || !!busy}><PlusIcon size={14} /> Criar planilha</Button>
          </div>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span data-status={syncState.status}><SaveIcon size={13} /> {syncState.detail}</span>
        <span>{selectedSummary} · {filterQuery ? `${viewRows.length}/${rows.length}` : rows.length} linha{rows.length === 1 ? '' : 's'} · {columns.length} coluna{columns.length === 1 ? '' : 's'}{formulaCount ? ` · ${formulaCount} fórmula${formulaCount === 1 ? '' : 's'}` : ''}</span>
      </footer>

      <SheetContextMenu
        menu={contextMenu}
        canEdit={canEdit && !busy}
        onClose={closeContextMenu}
        onCopy={() => { closeContextMenu(); copySelection().catch(() => {}); }}
        onFillSelection={() => { closeContextMenu(); applyValueToSelection().catch(() => {}); }}
        onClearSelection={() => { closeContextMenu(); clearSelectionValues().catch(() => {}); }}
        onInsertRowAbove={() => { closeContextMenu(); insertRowAtActive('above').catch(() => {}); }}
        onInsertRowBelow={() => { closeContextMenu(); insertRowAtActive('below').catch(() => {}); }}
        onDuplicateRow={() => { closeContextMenu(); duplicateActiveRow().catch(() => {}); }}
        onInsertColumnLeft={() => { closeContextMenu(); insertColumnAtActive('left').catch(() => {}); }}
        onInsertColumnRight={() => { closeContextMenu(); insertColumnAtActive('right').catch(() => {}); }}
        onDuplicateColumn={() => { closeContextMenu(); duplicateActiveColumn().catch(() => {}); }}
        onDeleteRow={() => { closeContextMenu(); deleteRow(); }}
        onDeleteColumn={() => { closeContextMenu(); deleteColumn(); }}
        onBold={() => { closeContextMenu(); toggleStyle('bold'); }}
        onItalic={() => { closeContextMenu(); toggleStyle('italic'); }}
        onUnderline={() => { closeContextMenu(); toggleStyle('underline'); }}
        onAlignLeft={() => { closeContextMenu(); setTextAlign('left'); }}
        onAlignCenter={() => { closeContextMenu(); setTextAlign('center'); }}
        onAlignRight={() => { closeContextMenu(); setTextAlign('right'); }}
        onClearFormatting={() => { closeContextMenu(); clearSelectionFormatting(); }}
        onSortColumnAscending={() => { closeContextMenu(); sortActiveColumn('asc').catch(() => {}); }}
        onSortColumnDescending={() => { closeContextMenu(); sortActiveColumn('desc').catch(() => {}); }}
        onSetTypeText={() => { closeContextMenu(); setNumberFormat('text'); }}
        onSetTypeNumber={() => { closeContextMenu(); setNumberFormat('number'); }}
        onSetTypeCurrency={() => { closeContextMenu(); setNumberFormat('currency'); }}
        onSetTypePercent={() => { closeContextMenu(); setNumberFormat('percent'); }}
      />

      <ConfirmDeleteDialog
        confirmation={deleteConfirmation}
        busy={busy}
        onCancel={closeDeleteConfirmation}
        onConfirm={confirmDeleteAction}
      />
    </section>
  );
}
