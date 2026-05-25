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

function confirmDestructiveAction(message) {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

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

export default function UserSpreadsheetPanel({ ownerUserId, canEdit = true, showToast }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [activeCell, setActiveCell] = useState(null);
  const [formulaValue, setFormulaValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [resizeState, setResizeState] = useState(null);
  const [scrollState, setScrollState] = useState({});
  const [syncState, setSyncState] = useState({ status: 'idle', detail: 'Pronto' });
  const fileInputRef = useRef(null);
  const draftRef = useRef(new Map());

  const selectedCellIds = useMemo(() => {
    if (!activeCell?.rowId || !activeCell?.key) return new Set();
    return new Set([`${activeCell.rowId}:${activeCell.key}`]);
  }, [activeCell]);

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
      setFormulaValue('');
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

  const selectCell = useCallback((rowId, key) => {
    setActiveCell({ rowId, key });
  }, []);

  const selectRow = useCallback((rowId) => {
    const firstColumn = columns[0];
    if (!firstColumn) return;
    setActiveCell({ rowId, key: firstColumn.key });
  }, [columns]);

  const navigateCell = useCallback((rowId, key, rowDelta = 0, columnDelta = 0) => {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const columnIndex = columns.findIndex((column) => column.key === key);
    if (rowIndex < 0 || columnIndex < 0) return;
    const nextRow = rows[Math.max(0, Math.min(rows.length - 1, rowIndex + rowDelta))];
    const nextColumn = columns[Math.max(0, Math.min(columns.length - 1, columnIndex + columnDelta))];
    if (nextRow && nextColumn) setActiveCell({ rowId: nextRow.id, key: nextColumn.key });
  }, [columns, rows]);

  const setCellDraft = useCallback((rowId, key, value) => {
    const cleanValue = sanitizeCellValue(value);
    draftRef.current.set(`${rowId}:${key}`, cleanValue);
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [key]: cleanValue } : row)));
  }, []);

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

  const deleteSheet = useCallback(async (sheetId) => {
    const sheet = sheets.find((item) => item.id === sheetId);
    if (!sheet || !confirmDestructiveAction(`Excluir a planilha "${sheet.name}"? Esta ação não pode ser desfeita.`)) return;
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

  const deleteRow = useCallback(async () => {
    if (!activeRow || !confirmDestructiveAction(`Excluir a linha ${activeRowIndex + 1}? Esta ação não pode ser desfeita.`)) return;
    setBusy('delete-row');
    try {
      await deleteSupportDailyRow(activeRow.id, { ownerUserId, sheetId: activeSheetId });
      setRows((current) => current.filter((row) => row.id !== activeRow.id));
      setActiveCell(null);
      markSync('saved', 'Linha excluída');
    } catch (error) {
      notifyError(error, 'Não foi possível excluir a linha.');
    } finally {
      setBusy('');
    }
  }, [activeRow, activeRowIndex, activeSheetId, markSync, notifyError, ownerUserId]);

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

  const deleteColumn = useCallback(async () => {
    if (!activeColumn || !confirmDestructiveAction(`Excluir a coluna "${activeColumn.label}"? Esta ação não pode ser desfeita.`)) return;
    setBusy('delete-column');
    try {
      await deleteSupportDailyColumn(activeColumn.key, { ownerUserId, sheetId: activeSheetId });
      const nextColumns = columns.filter((column) => column.key !== activeColumn.key);
      setColumns(nextColumns);
      setRows((current) => current.map((row) => {
        const next = { ...row };
        delete next[activeColumn.key];
        return next;
      }));
      setActiveCell(null);
      markSync('saved', 'Coluna excluída');
    } catch (error) {
      notifyError(error, 'Não foi possível excluir a coluna.');
    } finally {
      setBusy('');
    }
  }, [activeColumn, activeSheetId, columns, markSync, notifyError, ownerUserId]);

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

  const copyActiveCell = useCallback(async () => {
    if (!activeCell?.rowId || !activeCell?.key) return;
    const text = activeCellText(activeCell, rows);
    try {
      await navigator.clipboard.writeText(text);
      markSync('saved', 'Célula copiada');
    } catch (error) {
      notifyError(error, 'Não foi possível copiar a célula.');
    }
  }, [activeCell, markSync, notifyError, rows]);

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
    setActiveCell({ rowId, key });
  }, []);

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
          <Button size="xs" variant="ghost" onClick={copyActiveCell} disabled={!activeCell}>Copiar</Button>
        </div>
        <div className={styles.toolbarGroup}>
          <Button size="xs" variant="ghost" onClick={deleteRow} disabled={!activeRow || !canEdit || !!busy}><TrashIcon size={13} /> Linha</Button>
          <Button size="xs" variant="ghost" onClick={deleteColumn} disabled={!activeColumn || !canEdit || !!busy}><TrashIcon size={13} /> Coluna</Button>
        </div>
      </div>

      <div className={styles.controlBar}>
        <div className={styles.nameBox}>{activeColumn && activeRowIndex >= 0 ? `${columnName(activeColumnIndex)}${activeRowIndex + 1}` : '—'}</div>
        <div className={styles.formulaBar}>
          <span>fx</span>
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
            rows={rows}
            rowsLoading={loading}
            activeCell={activeCell}
            selectedCellIds={selectedCellIds}
            selectionBounds={null}
            selectedCount={activeCell ? 1 : 0}
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
            onCellChange={setCellDraft}
            onCellCommit={commitCell}
            onNavigateCell={navigateCell}
            onContextMenu={openContextMenu}
            onPasteTable={pasteTable}
            onColumnLabelChange={changeColumnLabel}
            onColumnLabelCommit={commitColumnLabel}
            onResizeStart={startResize}
            onScrollStateChange={setScrollState}
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
        <span>{rows.length} linha{rows.length === 1 ? '' : 's'} · {columns.length} coluna{columns.length === 1 ? '' : 's'}</span>
      </footer>
    </section>
  );
}
