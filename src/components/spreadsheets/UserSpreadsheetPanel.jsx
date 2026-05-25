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

const TEXT_COLOR_OPTIONS = [
  { value: '', label: 'Texto' },
  { value: 'var(--text-primary)', label: 'Padrão' },
  { value: 'var(--accent)', label: 'Amarelo' },
  { value: 'var(--success-text)', label: 'Verde' },
  { value: 'var(--danger-text)', label: 'Vermelho' },
  { value: 'var(--warning-text)', label: 'Atenção' },
  { value: 'var(--info-text)', label: 'Azul' },
];

const FILL_COLOR_OPTIONS = [
  { value: '', label: 'Fundo' },
  { value: 'var(--accent-soft)', label: 'Amarelo suave' },
  { value: 'var(--success-soft)', label: 'Verde suave' },
  { value: 'var(--danger-soft)', label: 'Vermelho suave' },
  { value: 'var(--warning-soft)', label: 'Atenção suave' },
  { value: 'var(--info-soft)', label: 'Azul suave' },
];


const FONT_FAMILY_OPTIONS = [
  { value: '', label: 'Inter' },
  { value: 'var(--font-sans)', label: 'Sans' },
  { value: 'var(--font-mono)', label: 'Mono' },
];

const INLINE_TEXT_STYLE_KEYS = new Set(['bold', 'italic', 'underline', 'strikeThrough', 'color']);

const FORMULA_LIBRARY = [
  { name: 'SOMA', aliases: ['SUM'], signature: 'SOMA(A1:A5)', description: 'Soma os valores de um intervalo.' },
  { name: 'MEDIA', aliases: ['AVERAGE'], signature: 'MEDIA(A1:A5)', description: 'Calcula a média de um intervalo.' },
  { name: 'MIN', aliases: [], signature: 'MIN(A1:A5)', description: 'Retorna o menor valor.' },
  { name: 'MAX', aliases: [], signature: 'MAX(A1:A5)', description: 'Retorna o maior valor.' },
  { name: 'CONT.NUM', aliases: ['COUNT'], signature: 'CONT.NUM(A1:A5)', description: 'Conta células numéricas.' },
  { name: 'CONT.VALORES', aliases: ['COUNTA'], signature: 'CONT.VALORES(A1:A5)', description: 'Conta células preenchidas.' },
];

function normalizeFormulaName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

function getFormulaToken(value = '') {
  const formula = sanitizeCellValue(value);
  if (!formula.trim().startsWith('=')) return '';
  const withoutEquals = formula.slice(1);
  const match = withoutEquals.match(/([A-ZÁÉÍÓÚÇ.]+)$/i);
  return match ? match[1] : '';
}

function getFormulaSuggestions(value = '') {
  const token = normalizeFormulaName(getFormulaToken(value));
  if (!sanitizeCellValue(value).trim().startsWith('=')) return [];
  if (!token) return FORMULA_LIBRARY.slice(0, 6);
  return FORMULA_LIBRARY.filter((formula) => {
    const names = [formula.name, ...(formula.aliases || [])].map(normalizeFormulaName);
    return names.some((name) => name.startsWith(token));
  }).slice(0, 6);
}

function insertFormulaSuggestion(currentValue = '', formulaName = '') {
  const current = sanitizeCellValue(currentValue);
  const base = current.trim().startsWith('=') ? current : '=';
  const token = getFormulaToken(base);
  if (token) return `${base.slice(0, base.length - token.length)}${formulaName}(`;
  return `${base}${formulaName}(`;
}

function cellAddressFromPosition(rowIndex = -1, columnIndex = -1) {
  if (rowIndex < 0 || columnIndex < 0) return '';
  return `${columnName(columnIndex)}${rowIndex + 1}`;
}

function getCellAddress(cell, rows = [], columns = []) {
  if (!cell?.rowId || !cell?.key) return '';
  const rowIndex = rows.findIndex((row) => row.id === cell.rowId);
  const columnIndex = columns.findIndex((column) => column.key === cell.key);
  return cellAddressFromPosition(rowIndex, columnIndex);
}

function buildFormulaReference(startCell, endCell, rows = [], columns = []) {
  const startAddress = getCellAddress(startCell, rows, columns);
  const endAddress = getCellAddress(endCell || startCell, rows, columns);
  if (!startAddress || !endAddress) return '';
  return startAddress === endAddress ? startAddress : `${startAddress}:${endAddress}`;
}

function replaceFormulaTailWithReference(currentValue = '', reference = '') {
  const value = sanitizeCellValue(currentValue);
  if (!reference) return value;
  const base = value.trim().startsWith('=') ? value : '=';
  const trailingReference = /([A-Z]+\d+(?:\s*:\s*[A-Z]+\d+)?)\s*$/i;
  if (trailingReference.test(base)) return base.replace(trailingReference, reference);
  if (/([=(+\-*/,;:]|\s)$/.test(base) || base.endsWith('=')) return `${base}${reference}`;
  return `${base}${reference}`;
}

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


function validateFormulaStructure(rawFormula = '', rows = [], columns = []) {
  const formula = sanitizeCellValue(rawFormula).trim();
  if (!formula.startsWith('=')) return { ok: true, message: '' };
  const expression = formula.slice(1).trim();
  if (!expression) return { ok: false, message: 'Fórmula incompleta' };

  let parenBalance = 0;
  for (const char of expression) {
    if (char === '(') parenBalance += 1;
    if (char === ')') parenBalance -= 1;
    if (parenBalance < 0) return { ok: false, message: 'Parênteses inválidos' };
  }
  if (parenBalance !== 0) return { ok: false, message: 'Feche os parênteses da fórmula' };

  const ranges = [...formula.matchAll(/([A-Z]+\d+)\s*:\s*([A-Z]+\d+)/gi)];
  for (const range of ranges) {
    const start = parseCellRef(range[1]);
    const end = parseCellRef(range[2]);
    if (!start || !end) return { ok: false, message: 'Intervalo inválido' };
    if (start.rowIndex >= rows.length || end.rowIndex >= rows.length || start.columnIndex >= columns.length || end.columnIndex >= columns.length) {
      return { ok: false, message: `Intervalo fora da planilha: ${range[0].toUpperCase()}` };
    }
  }

  const withoutRanges = formula.replace(/([A-Z]+\d+)\s*:\s*([A-Z]+\d+)/gi, '');
  const refs = [...withoutRanges.matchAll(/([A-Z]+\d+)/gi)];
  for (const ref of refs) {
    const coords = parseCellRef(ref[1]);
    if (!coords || coords.rowIndex >= rows.length || coords.columnIndex >= columns.length) {
      return { ok: false, message: `Referência fora da planilha: ${ref[1].toUpperCase()}` };
    }
  }

  const functionMatch = expression.match(/^([A-ZÁÉÍÓÚÇ.]+)\(/i);
  if (functionMatch) {
    const requested = normalizeFormulaName(functionMatch[1]);
    const supported = FORMULA_LIBRARY.some((formulaItem) => [formulaItem.name, ...(formulaItem.aliases || [])].map(normalizeFormulaName).includes(requested));
    if (!supported) return { ok: false, message: `Função não suportada: ${functionMatch[1].toUpperCase()}` };
  }

  return { ok: true, message: '' };
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

function validateCellValue(value = '', style = {}, formulaResult = null, formulaValidation = null) {
  const raw = sanitizeCellValue(value);
  if (!raw) return { ok: true, message: '' };
  if (raw.startsWith('=')) {
    if (formulaValidation && !formulaValidation.ok) return { ok: false, message: formulaValidation.message || 'Fórmula inválida' };
    if (formulaResult && !formulaResult.ok) return { ok: false, message: 'Fórmula inválida' };
    return { ok: true, message: '' };
  }
  const format = style?.numberFormat || 'text';
  if (format === 'text') return { ok: true, message: '' };
  const number = parsePlainNumber(raw);
  if (number === null) {
    const labels = { number: 'número', currency: 'moeda', percent: 'percentual' };
    return { ok: false, message: `Valor incompatível com ${labels[format] || 'tipo numérico'}` };
  }
  return { ok: true, message: '' };
}

function normalizeValueForType(value = '', style = {}) {
  const raw = sanitizeCellValue(value);
  if (!raw || raw.startsWith('=') || !style?.numberFormat || style.numberFormat === 'text') return raw;
  const number = parsePlainNumber(raw);
  if (number === null) return raw;
  if (style.numberFormat === 'percent' && /%\s*$/.test(raw)) return String(number / 100);
  return String(number);
}

function transformTextValue(value = '', mode = 'uppercase') {
  const raw = sanitizeCellValue(value);
  if (!raw || raw.startsWith('=')) return raw;
  if (mode === 'trim') return raw.replace(/\s+/g, ' ').trim();
  if (mode === 'lowercase') return raw.toLocaleLowerCase('pt-BR');
  if (mode === 'titlecase') {
    return raw
      .toLocaleLowerCase('pt-BR')
      .replace(/(^|[\s/\-])([\p{L}\p{N}])/gu, (match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);
  }
  return raw.toLocaleUpperCase('pt-BR');
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTextValue(value = '', query = '', replacement = '', matchCase = false) {
  const raw = sanitizeCellValue(value);
  const needle = sanitizeCellValue(query);
  if (!raw || !needle) return raw;
  const flags = matchCase ? 'g' : 'gi';
  return raw.replace(new RegExp(escapeRegExp(needle), flags), sanitizeCellValue(replacement));
}

function calculateBestColumnWidth(column, rows = []) {
  const labelLength = sanitizeCellValue(column?.label || '').length;
  const valueLength = rows.reduce((max, row) => Math.max(max, sanitizeCellValue(row?.[column.key] || '').length), labelLength);
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.max(92, valueLength * 8 + 36)));
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
    if (key === 'richText' && Array.isArray(next[key]) && !next[key].length) delete next[key];
  });
  return next;
}

function normalizeRichTextRuns(runs = [], textLength = 0) {
  return (Array.isArray(runs) ? runs : [])
    .map((run) => ({
      ...run,
      start: Math.max(0, Math.min(textLength, Number(run.start || 0))),
      end: Math.max(0, Math.min(textLength, Number(run.end || 0))),
    }))
    .filter((run) => run.end > run.start);
}

function isInlinePatch(patch = {}) {
  const keys = Object.keys(patch || {}).filter((key) => patch[key] !== false && patch[key] !== '' && patch[key] !== null && patch[key] !== undefined);
  return keys.length > 0 && keys.every((key) => INLINE_TEXT_STYLE_KEYS.has(key));
}

function mergeRichTextRun(currentStyle = {}, selection = {}, patch = {}) {
  const value = sanitizeCellValue(selection.value || '');
  const start = Math.max(0, Math.min(value.length, Number(selection.start || 0)));
  const end = Math.max(0, Math.min(value.length, Number(selection.end || 0)));
  if (end <= start) return currentStyle;

  const patchEntries = Object.entries(patch || {}).filter(([key]) => INLINE_TEXT_STYLE_KEYS.has(key));
  if (!patchEntries.length) return currentStyle;

  const previousRuns = normalizeRichTextRuns(currentStyle.richText, value.length);
  const boundaries = new Set([0, value.length, start, end]);
  previousRuns.forEach((run) => {
    boundaries.add(run.start);
    boundaries.add(run.end);
  });

  const points = [...boundaries].sort((a, b) => a - b);
  const nextRuns = [];
  points.slice(0, -1).forEach((point, index) => {
    const nextPoint = points[index + 1];
    if (nextPoint <= point) return;
    const baseStyle = previousRuns.reduce((acc, run) => {
      if (run.start < nextPoint && run.end > point) return { ...acc, ...run };
      return acc;
    }, {});

    if (point >= start && nextPoint <= end) {
      patchEntries.forEach(([key, value]) => {
        if (value === false || value === '' || value === null || value === undefined) delete baseStyle[key];
        else baseStyle[key] = value;
      });
    }

    const clean = Object.fromEntries(Object.entries(baseStyle).filter(([key, value]) => (
      INLINE_TEXT_STYLE_KEYS.has(key) && value !== false && value !== '' && value !== null && value !== undefined
    )));
    if (Object.keys(clean).length) nextRuns.push({ start: point, end: nextPoint, ...clean });
  });

  const mergedRuns = [];
  nextRuns.forEach((run) => {
    const last = mergedRuns[mergedRuns.length - 1];
    const sameStyle = last && last.end === run.start && INLINE_TEXT_STYLE_KEYS.size && [...INLINE_TEXT_STYLE_KEYS].every((key) => (last[key] || '') === (run[key] || ''));
    if (sameStyle) last.end = run.end;
    else mergedRuns.push(run);
  });

  return mergeCellStyle(currentStyle, { richText: mergedRuns });
}

function getInlineSelectionStyle(cellStyle = {}, selection = {}) {
  const value = sanitizeCellValue(selection.value || '');
  const start = Math.max(0, Math.min(value.length, Number(selection.start || 0)));
  const end = Math.max(0, Math.min(value.length, Number(selection.end || 0)));
  if (end <= start) return {};
  const runs = normalizeRichTextRuns(cellStyle.richText, value.length).filter((run) => run.start < end && run.end > start);
  return runs.reduce((acc, run) => ({ ...acc, ...run }), {});
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
  onCut,
  onPaste,
  onSelectAll,
  onSelectUsedRange,
  onSelectRow,
  onSelectColumn,
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
  onStrikeThrough,
  onTextColor,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onClearFormatting,
  onUppercase,
  onLowercase,
  onTitlecase,
  onTrimSpaces,
  onFindCellValue,
  onUseCellValueAsReplaceQuery,
  onFitColumnWidth,
  onSortColumnAscending,
  onSortColumnDescending,
  onFilterColumnBySelection,
  onClearColumnFilter,
  onSetTypeText,
  onSetTypeNumber,
  onSetTypeCurrency,
  onSetTypePercent,
  onNormalizeSelection,
  onWrapText,
  onClipText,
  onFontSmall,
  onFontNormal,
  onFontLarge,
  onVerticalTop,
  onVerticalMiddle,
  onVerticalBottom,
}) {
  if (!menu) return null;
  const isRow = menu.scope === 'row';
  const isColumn = menu.scope === 'column';
  const typeLabel = isRow ? 'Linha' : isColumn ? 'Coluna' : 'Célula';

  const Item = ({ icon, label, shortcut, onClick, disabled, danger }) => (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} data-danger={danger || undefined}>
      <span className={styles.contextIcon} aria-hidden="true">{icon}</span>
      <span className={styles.contextLabel}>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
  const Divider = () => <span className={styles.contextDivider} aria-hidden="true" />;

  return (
    <div className={styles.contextBackdrop} role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <section
        className={styles.contextMenu}
        role="menu"
        aria-label="Ações da planilha"
        style={{ left: menu.x, top: menu.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.contextMenuHeader}>
          <strong>{typeLabel}</strong>
          <span>{menu.label || 'Ações rápidas'}</span>
        </header>

        <Item icon="✂" label="Recortar" shortcut="Ctrl X" onClick={onCut} disabled={!canEdit} />
        <Item icon="⧉" label="Copiar" shortcut="Ctrl C" onClick={onCopy} />
        <Item icon="▣" label="Colar" shortcut="Ctrl V" onClick={onPaste} disabled={!canEdit} />
        <Divider />

        {!isColumn ? <Item icon="＋" label="Inserir linha acima" onClick={onInsertRowAbove} disabled={!canEdit} /> : null}
        {!isColumn ? <Item icon="＋" label="Inserir linha abaixo" onClick={onInsertRowBelow} disabled={!canEdit} /> : null}
        {!isRow ? <Item icon="＋" label="Inserir coluna à esquerda" onClick={onInsertColumnLeft} disabled={!canEdit} /> : null}
        {!isRow ? <Item icon="＋" label="Inserir coluna à direita" onClick={onInsertColumnRight} disabled={!canEdit} /> : null}
        {isRow ? <Item icon="⧉" label="Duplicar linha" onClick={onDuplicateRow} disabled={!canEdit} /> : null}
        {isColumn ? <Item icon="⧉" label="Duplicar coluna" onClick={onDuplicateColumn} disabled={!canEdit} /> : null}
        <Divider />

        {!isColumn ? <Item icon="🗑" label="Excluir linha" onClick={onDeleteRow} disabled={!canEdit || isColumn} danger /> : null}
        {!isRow ? <Item icon="🗑" label="Excluir coluna" onClick={onDeleteColumn} disabled={!canEdit || isRow} danger /> : null}
        <Item icon="⌫" label="Limpar conteúdo" shortcut="Del" onClick={onClearSelection} disabled={!canEdit} />
        <Divider />

        <Item icon="▦" label="Selecionar tudo" shortcut="Ctrl A" onClick={onSelectAll} />
        <Item icon="▣" label="Selecionar área preenchida" onClick={onSelectUsedRange} />
        {!isColumn ? <Item icon="↔" label="Selecionar linha" onClick={onSelectRow} disabled={isColumn} /> : null}
        {!isRow ? <Item icon="↕" label="Selecionar coluna" onClick={onSelectColumn} disabled={isRow} /> : null}
        <Divider />

        <Item icon="B" label="Negrito" shortcut="Ctrl B" onClick={onBold} disabled={!canEdit} />
        <Item icon="I" label="Itálico" shortcut="Ctrl I" onClick={onItalic} disabled={!canEdit} />
        <Item icon="U" label="Sublinhado" shortcut="Ctrl U" onClick={onUnderline} disabled={!canEdit} />
        <Item icon="S" label="Tachado" onClick={onStrikeThrough} disabled={!canEdit} />
        <div className={styles.contextPalette} role="group" aria-label="Cor do texto">
          <span>Cor do texto</span>
          {TEXT_COLOR_OPTIONS.slice(1).map((option) => (
            <button
              key={option.label}
              type="button"
              title={option.label}
              aria-label={`Cor do texto: ${option.label}`}
              style={{ '--swatch': option.value }}
              onClick={() => onTextColor(option.value)}
              disabled={!canEdit}
            />
          ))}
        </div>
        <Divider />

        <Item icon="≡" label="Alinhar à esquerda" onClick={onAlignLeft} disabled={!canEdit} />
        <Item icon="≣" label="Centralizar" onClick={onAlignCenter} disabled={!canEdit} />
        <Item icon="≡" label="Alinhar à direita" onClick={onAlignRight} disabled={!canEdit} />
        <Item icon="↵" label="Quebrar texto" onClick={onWrapText} disabled={!canEdit} />
        <Item icon="▸" label="Cortar texto" onClick={onClipText} disabled={!canEdit} />
        <Divider />

        <Item icon="A" label="Texto em MAIÚSCULAS" onClick={onUppercase} disabled={!canEdit} />
        <Item icon="a" label="Texto em minúsculas" onClick={onLowercase} disabled={!canEdit} />
        <Item icon="Aa" label="Texto Capitalizado" onClick={onTitlecase} disabled={!canEdit} />
        <Item icon="␠" label="Remover espaços extras" onClick={onTrimSpaces} disabled={!canEdit} />
        <Item icon="⌁" label="Normalizar pelo tipo" onClick={onNormalizeSelection} disabled={!canEdit} />
        <Divider />

        {isColumn ? <Item icon="⇅" label="Ordenar A → Z" onClick={onSortColumnAscending} disabled={!canEdit} /> : null}
        {isColumn ? <Item icon="⇵" label="Ordenar Z → A" onClick={onSortColumnDescending} disabled={!canEdit} /> : null}
        {isColumn ? <Item icon="⌕" label="Filtrar por valor da célula" onClick={onFilterColumnBySelection} /> : null}
        {isColumn ? <Item icon="×" label="Limpar filtro da coluna" onClick={onClearColumnFilter} /> : null}
        {isColumn ? <Item icon="↔" label="Ajustar largura ao conteúdo" onClick={onFitColumnWidth} disabled={!canEdit} /> : null}
        {isColumn ? <Divider /> : null}

        {isColumn ? <Item icon="T" label="Tipo: texto" onClick={onSetTypeText} disabled={!canEdit} /> : null}
        {isColumn ? <Item icon="123" label="Tipo: número" onClick={onSetTypeNumber} disabled={!canEdit} /> : null}
        {isColumn ? <Item icon="R$" label="Tipo: moeda" onClick={onSetTypeCurrency} disabled={!canEdit} /> : null}
        {isColumn ? <Item icon="%" label="Tipo: percentual" onClick={onSetTypePercent} disabled={!canEdit} /> : null}
        {isColumn ? <Divider /> : null}

        <Item icon="⌕" label="Localizar este valor" onClick={onFindCellValue} />
        <Item icon="↔" label="Usar no substituir" onClick={onUseCellValueAsReplaceQuery} />
        <Item icon="✕" label="Limpar formatação" onClick={onClearFormatting} disabled={!canEdit} />
        <Item icon="−" label="Fonte pequena" onClick={onFontSmall} disabled={!canEdit} />
        <Item icon="10" label="Fonte normal" onClick={onFontNormal} disabled={!canEdit} />
        <Item icon="+" label="Fonte grande" onClick={onFontLarge} disabled={!canEdit} />
        <Item icon="⇡" label="Alinhar no topo" onClick={onVerticalTop} disabled={!canEdit} />
        <Item icon="↕" label="Alinhar ao meio" onClick={onVerticalMiddle} disabled={!canEdit} />
        <Item icon="⇣" label="Alinhar abaixo" onClick={onVerticalBottom} disabled={!canEdit} />
        <Item icon="↵" label="Preencher seleção" shortcut="Ctrl Enter" onClick={onFillSelection} disabled={!canEdit} />
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
  const [formulaInputFocused, setFormulaInputFocused] = useState(false);
  const [formulaSuggestionIndex, setFormulaSuggestionIndex] = useState(0);
  const [formulaRangeAnchor, setFormulaRangeAnchor] = useState(null);
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
  const [columnFilters, setColumnFilters] = useState({});
  const [replaceQuery, setReplaceQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [replaceScope, setReplaceScope] = useState('selection');
  const [replaceMatchCase, setReplaceMatchCase] = useState(false);
  const [replaceBarOpen, setReplaceBarOpen] = useState(false);
  const [activeTextSelection, setActiveTextSelection] = useState(null);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const formulaInputRef = useRef(null);
  const draftRef = useRef(new Map());
  const formulaReferenceBaseRef = useRef('');

  const viewRows = useMemo(() => {
    const query = sanitizeCellValue(filterQuery).toLowerCase();
    const activeColumnFilters = Object.entries(columnFilters)
      .map(([key, value]) => [key, sanitizeCellValue(value).toLowerCase()])
      .filter(([, value]) => value);

    return rows.filter((row) => {
      const globalMatch = !query || (filterColumnKey === 'all'
        ? columns.some((column) => sanitizeCellValue(row?.[column.key] || '').toLowerCase().includes(query))
        : sanitizeCellValue(row?.[filterColumnKey] || '').toLowerCase().includes(query));

      if (!globalMatch) return false;
      return activeColumnFilters.every(([key, value]) => sanitizeCellValue(row?.[key] || '').toLowerCase().includes(value));
    });
  }, [columnFilters, columns, filterColumnKey, filterQuery, rows]);

  const activeColumnFilterCount = useMemo(() => Object.values(columnFilters).filter((value) => sanitizeCellValue(value)).length, [columnFilters]);

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

  const selectedWrapMode = useMemo(() => {
    if (!selectedCells.length) return '';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.wrapText || '';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.wrapText || '') === first) ? first : 'mixed';
  }, [selectedCells]);

  const selectedFontSize = useMemo(() => {
    if (!selectedCells.length) return 'normal';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.fontSize || 'normal';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.fontSize || 'normal') === first) ? first : 'mixed';
  }, [selectedCells]);

  const selectedVerticalAlign = useMemo(() => {
    if (!selectedCells.length) return 'middle';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.verticalAlign || 'middle';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.verticalAlign || 'middle') === first) ? first : 'mixed';
  }, [selectedCells]);

  const selectedTextColor = useMemo(() => {
    if (!selectedCells.length) return '';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.color || '';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.color || '') === first) ? first : 'mixed';
  }, [selectedCells]);

  const selectedFillColor = useMemo(() => {
    if (!selectedCells.length) return '';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.backgroundColor || '';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.backgroundColor || '') === first) ? first : 'mixed';
  }, [selectedCells]);

  const selectedFontFamily = useMemo(() => {
    if (!selectedCells.length) return '';
    const first = getCellStyle(selectedCells[0].row, selectedCells[0].column.key)?.fontFamily || '';
    return selectedCells.every(({ row, column }) => (getCellStyle(row, column.key)?.fontFamily || '') === first) ? first : 'mixed';
  }, [selectedCells]);

  const hasActiveTextRange = !!activeTextSelection
    && activeTextSelection.rowId === activeCell?.rowId
    && activeTextSelection.key === activeCell?.key
    && Number(activeTextSelection.end || 0) > Number(activeTextSelection.start || 0);

  const inlineSelectionStyle = useMemo(() => {
    if (!hasActiveTextRange) return {};
    const row = rows.find((entry) => entry.id === activeTextSelection.rowId);
    if (!row) return {};
    return getInlineSelectionStyle(getCellStyle(row, activeTextSelection.key), activeTextSelection);
  }, [activeTextSelection, hasActiveTextRange, rows]);

  const displayValueMap = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      columns.forEach((column) => {
        const raw = sanitizeCellValue(row?.[column.key] || '');
        const style = getCellStyle(row, column.key);
        const result = raw.startsWith('=') ? evaluateFormula(raw, rows, columns, new Set([`${row.id}:${column.key}`])) : { value: raw, ok: true };
        const formulaValidation = raw.startsWith('=') ? validateFormulaStructure(raw, rows, columns) : { ok: true, message: '' };
        const validation = validateCellValue(raw, style, result, formulaValidation);
        map.set(`${row.id}:${column.key}`, {
          value: formatCellDisplayValue(result.value, style),
          raw,
          isFormula: raw.startsWith('='),
          hasFormulaError: raw.startsWith('=') && !result.ok,
          hasValidationError: !validation.ok,
          validationMessage: validation.message,
        });
      });
    });
    return map;
  }, [columns, rows]);

  const validationIssueCount = useMemo(() => {
    let count = 0;
    displayValueMap.forEach((meta) => {
      if (meta?.hasValidationError) count += 1;
    });
    return count;
  }, [displayValueMap]);

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
  const formulaAssist = useMemo(() => {
    const value = sanitizeCellValue(formulaValue);
    if (!value.trim().startsWith('=')) return { visible: false, suggestions: [], validation: { ok: true, message: '' } };
    return {
      visible: true,
      suggestions: getFormulaSuggestions(value),
      validation: validateFormulaStructure(value, rows, columns),
    };
  }, [columns, formulaValue, rows]);
  const formulaSelectionMode = canEdit && formulaInputFocused && !!activeCell && sanitizeCellValue(formulaValue).trim().startsWith('=');
  const formulaReferenceIdsWithSelection = useMemo(() => {
    const ids = new Set(formulaReferenceIds);
    if (formulaSelectionMode && selectionBounds) {
      buildSelectedCells(viewRows, columns, selectionBounds).forEach((cell) => ids.add(cell.id));
    }
    return Array.from(ids);
  }, [columns, formulaReferenceIds, formulaSelectionMode, selectionBounds, viewRows]);

  useEffect(() => {
    setFormulaSuggestionIndex(0);
  }, [formulaAssist.suggestions.length, formulaValue]);

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

  const applyColumnFilterFromBar = useCallback(() => {
    const value = sanitizeCellValue(filterQuery);
    if (!value || filterColumnKey === 'all') return;
    setColumnFilters((current) => ({ ...current, [filterColumnKey]: value }));
    markSync('saved', 'Filtro aplicado');
  }, [filterColumnKey, filterQuery, markSync]);

  const clearColumnFilter = useCallback((key) => {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const clearAllColumnFilters = useCallback(() => {
    setColumnFilters({});
    setFilterQuery('');
  }, []);

  const filterActiveColumnBySelection = useCallback(() => {
    if (!activeCell?.key) return;
    const row = rows.find((entry) => entry.id === activeCell.rowId);
    const value = sanitizeCellValue(row?.[activeCell.key] || '');
    if (!value) return;
    setColumnFilters((current) => ({ ...current, [activeCell.key]: value }));
    markSync('saved', 'Filtro aplicado');
  }, [activeCell?.key, activeCell?.rowId, markSync, rows]);

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
      setFormulaInputFocused(false);
      setFormulaRangeAnchor(null);
      formulaReferenceBaseRef.current = '';
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
    if (formulaInputFocused) return;
    setFormulaValue(activeCellText(activeCell, rows));
    setFormulaRangeAnchor(null);
    formulaReferenceBaseRef.current = '';
  }, [activeCell, formulaInputFocused, rows]);

  const selectCell = useCallback((rowId, key, _element, extendSelection = false) => {
    const nextCell = { rowId, key };
    if (formulaSelectionMode) {
      const anchor = extendSelection && formulaRangeAnchor ? formulaRangeAnchor : nextCell;
      if (!extendSelection || !formulaRangeAnchor) {
        formulaReferenceBaseRef.current = sanitizeCellValue(formulaValue);
        setFormulaRangeAnchor(nextCell);
      }
      setSelectionAnchor(anchor);
      setSelectionFocus(nextCell);
      const reference = buildFormulaReference(anchor, nextCell, rows, columns);
      const base = formulaReferenceBaseRef.current || formulaValue;
      setFormulaValue(replaceFormulaTailWithReference(base, reference));
      requestAnimationFrame(() => formulaInputRef.current?.focus({ preventScroll: true }));
      return;
    }
    setActiveCell(nextCell);
    setSelectionFocus(nextCell);
    setSelectionAnchor((current) => (extendSelection && current ? current : nextCell));
    setFormulaRangeAnchor(null);
    formulaReferenceBaseRef.current = '';
  }, [columns, formulaRangeAnchor, formulaSelectionMode, formulaValue, rows]);

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


  const applyInlineStyleToActiveTextSelection = useCallback(async (patch) => {
    if (!canEdit || !activeTextSelection?.rowId || !activeTextSelection?.key) return false;
    const start = Number(activeTextSelection.start || 0);
    const end = Number(activeTextSelection.end || 0);
    if (end <= start || !isInlinePatch(patch)) return false;
    const row = rows.find((entry) => entry.id === activeTextSelection.rowId);
    if (!row) return false;
    const currentStyle = getCellStyle(row, activeTextSelection.key);
    const nextStyle = mergeRichTextRun(currentStyle, activeTextSelection, patch);
    setCellDraft(activeTextSelection.rowId, activeTextSelection.key, activeTextSelection.value);
    setRows((current) => current.map((entry) => (entry.id === activeTextSelection.rowId
      ? {
          ...entry,
          [activeTextSelection.key]: sanitizeCellValue(activeTextSelection.value),
          __styles: { ...(entry.__styles || {}), [activeTextSelection.key]: nextStyle },
        }
      : entry)));
    markSync('saving', 'Salvando trecho formatado');
    setBusy('format');
    try {
      await updateSupportDailyRow(activeTextSelection.rowId, {
        [activeTextSelection.key]: sanitizeCellValue(activeTextSelection.value),
        styles: { [activeTextSelection.key]: nextStyle },
      });
      markSync('saved', 'Trecho formatado');
      return true;
    } catch (error) {
      notifyError(error, 'Não foi possível salvar a formatação do trecho.');
      loadSheet(activeSheetId).catch(() => {});
      return false;
    } finally {
      setBusy('');
    }
  }, [activeSheetId, activeTextSelection, canEdit, loadSheet, markSync, notifyError, rows, setCellDraft]);

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
    if (hasActiveTextRange && INLINE_TEXT_STYLE_KEYS.has(styleKey)) {
      const enabled = inlineSelectionStyle?.[styleKey] !== true;
      applyInlineStyleToActiveTextSelection({ [styleKey]: enabled }).catch(() => {});
      return;
    }
    const enabled = !sameStyleValue(selectedCells, styleKey, true);
    applyStyleToSelection({ [styleKey]: enabled }).catch(() => {});
  }, [applyInlineStyleToActiveTextSelection, applyStyleToSelection, hasActiveTextRange, inlineSelectionStyle, selectedCells]);

  const setTextAlign = useCallback((textAlign) => {
    const nextAlign = selectedAlign === textAlign ? '' : textAlign;
    applyStyleToSelection({ textAlign: nextAlign }).catch(() => {});
  }, [applyStyleToSelection, selectedAlign]);

  const setNumberFormat = useCallback((numberFormat) => {
    applyStyleToSelection({ numberFormat }).catch(() => {});
  }, [applyStyleToSelection]);

  const setWrapMode = useCallback((wrapText) => {
    applyStyleToSelection({ wrapText }).catch(() => {});
  }, [applyStyleToSelection]);

  const setFontSize = useCallback((fontSize) => {
    applyStyleToSelection({ fontSize }).catch(() => {});
  }, [applyStyleToSelection]);

  const setFontFamily = useCallback((fontFamily) => {
    applyStyleToSelection({ fontFamily }).catch(() => {});
  }, [applyStyleToSelection]);

  const setVerticalAlign = useCallback((verticalAlign) => {
    applyStyleToSelection({ verticalAlign }).catch(() => {});
  }, [applyStyleToSelection]);

  const setTextColor = useCallback((color) => {
    if (hasActiveTextRange) {
      applyInlineStyleToActiveTextSelection({ color }).catch(() => {});
      return;
    }
    applyStyleToSelection({ color }).catch(() => {});
  }, [applyInlineStyleToActiveTextSelection, applyStyleToSelection, hasActiveTextRange]);

  const setFillColor = useCallback((backgroundColor) => {
    applyStyleToSelection({ backgroundColor }).catch(() => {});
  }, [applyStyleToSelection]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus({ preventScroll: true });
  }, []);

  const insertFormulaTemplate = useCallback((name = 'SOMA') => {
    if (!activeCell || !canEdit) return;
    const next = `=${name}()`;
    setFormulaValue(next);
    window.requestAnimationFrame(() => {
      const input = formulaInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const caret = Math.max(1, next.length - 1);
      input.setSelectionRange(caret, caret);
    });
  }, [activeCell, canEdit]);

  const clearSelectionAndFilters = useCallback(() => {
    setFilterQuery('');
    setColumnFilters({});
    setSearchQuery('');
  }, []);

  const clearSelectionFormatting = useCallback(() => {
    applyStyleToSelection({ bold: false, italic: false, underline: false, strikeThrough: false, textAlign: '', wrapText: '', fontSize: '', verticalAlign: '', color: '', backgroundColor: '', fontFamily: '', richText: [] }).catch(() => {});
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
    setFormulaRangeAnchor(null);
    formulaReferenceBaseRef.current = '';
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




  const selectAllCells = useCallback(() => {
    const firstRow = viewRows[0];
    const lastRow = viewRows[viewRows.length - 1];
    const firstColumn = columns[0];
    const lastColumn = columns[columns.length - 1];
    if (!firstRow || !lastRow || !firstColumn || !lastColumn) return;
    const nextCell = { rowId: firstRow.id, key: firstColumn.key };
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus({ rowId: lastRow.id, key: lastColumn.key });
  }, [columns, viewRows]);


  const selectUsedRange = useCallback(() => {
    if (!viewRows.length || !columns.length) return;
    let startRow = -1;
    let endRow = -1;
    let startColumn = -1;
    let endColumn = -1;
    viewRows.forEach((row, rowIndex) => {
      columns.forEach((column, columnIndex) => {
        if (!sanitizeCellValue(row?.[column.key] || '')) return;
        startRow = startRow < 0 ? rowIndex : Math.min(startRow, rowIndex);
        endRow = Math.max(endRow, rowIndex);
        startColumn = startColumn < 0 ? columnIndex : Math.min(startColumn, columnIndex);
        endColumn = Math.max(endColumn, columnIndex);
      });
    });
    if (startRow < 0 || startColumn < 0) {
      selectAllCells();
      return;
    }
    const firstRow = viewRows[startRow];
    const lastRow = viewRows[endRow];
    const firstColumn = columns[startColumn];
    const lastColumn = columns[endColumn];
    const nextCell = { rowId: firstRow.id, key: firstColumn.key };
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus({ rowId: lastRow.id, key: lastColumn.key });
  }, [columns, selectAllCells, viewRows]);

  const selectRowRange = useCallback((anchorRowId, focusRowId) => {
    if (!columns.length || !anchorRowId || !focusRowId) return;
    const firstColumn = columns[0];
    const lastColumn = columns[columns.length - 1];
    const nextCell = { rowId: anchorRowId, key: firstColumn.key };
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus({ rowId: focusRowId, key: lastColumn.key });
  }, [columns]);

  const selectColumnRange = useCallback((anchorKey, focusKey) => {
    if (!viewRows.length || !anchorKey || !focusKey) return;
    const firstRow = viewRows[0];
    const lastRow = viewRows[viewRows.length - 1];
    const nextCell = { rowId: firstRow.id, key: anchorKey };
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus({ rowId: lastRow.id, key: focusKey });
  }, [viewRows]);

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

  const cutSelection = useCallback(async () => {
    if (!canEdit || !selectedCells.length) return;
    await copySelection();
    await clearSelectionValues();
  }, [canEdit, clearSelectionValues, copySelection, selectedCells.length]);

  const transformSelectionText = useCallback(async (mode) => {
    if (!canEdit || !selectedCells.length) return;
    const updatesByRow = new Map();
    const optimistic = rows.map((row) => {
      const targetCells = selectedCells.filter((cell) => cell.row.id === row.id);
      if (!targetCells.length) return row;
      const next = { ...row };
      const patch = {};
      targetCells.forEach(({ column }) => {
        const nextValue = transformTextValue(row?.[column.key] || '', mode);
        next[column.key] = nextValue;
        patch[column.key] = nextValue;
      });
      updatesByRow.set(row.id, patch);
      return next;
    });
    setRows(optimistic);
    markSync('saving', 'Atualizando texto');
    setBusy(`text-${mode}`);
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', 'Texto atualizado');
    } catch (error) {
      notifyError(error, 'Não foi possível atualizar o texto.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canEdit, loadSheet, markSync, notifyError, rows, selectedCells]);

  const findReplaceMatch = useCallback(() => {
    const query = sanitizeCellValue(replaceQuery);
    if (!query) return;
    const normalizedQuery = replaceMatchCase ? query : query.toLocaleLowerCase('pt-BR');
    const cells = [];
    viewRows.forEach((row) => {
      columns.forEach((column) => {
        const raw = sanitizeCellValue(row?.[column.key] || '');
        const haystack = replaceMatchCase ? raw : raw.toLocaleLowerCase('pt-BR');
        if (haystack.includes(normalizedQuery)) cells.push({ rowId: row.id, key: column.key });
      });
    });
    if (!cells.length) {
      markSync('saved', 'Nenhum resultado encontrado');
      return;
    }
    const currentIndex = cells.findIndex((cell) => cell.rowId === activeCell?.rowId && cell.key === activeCell?.key);
    const nextCell = cells[(currentIndex + 1 + cells.length) % cells.length];
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus(nextCell);
    markSync('saved', `${cells.length} ocorrência${cells.length === 1 ? '' : 's'} encontrada${cells.length === 1 ? '' : 's'}`);
  }, [activeCell?.key, activeCell?.rowId, columns, markSync, replaceMatchCase, replaceQuery, viewRows]);

  const replaceTextInScope = useCallback(async () => {
    if (!canEdit) return;
    const query = sanitizeCellValue(replaceQuery);
    if (!query) return;
    const replacement = sanitizeCellValue(replaceValue);
    const selectionIds = new Set(selectedCells.map((cell) => cell.id));
    const useSelection = replaceScope === 'selection' && selectedCells.length > 1;
    const updatesByRow = new Map();
    let changedCount = 0;

    const optimistic = rows.map((row) => {
      let changed = false;
      const next = { ...row };
      const patch = {};
      columns.forEach((column) => {
        const cellId = `${row.id}:${column.key}`;
        if (useSelection && !selectionIds.has(cellId)) return;
        const currentValue = sanitizeCellValue(row?.[column.key] || '');
        const nextValue = replaceTextValue(currentValue, query, replacement, replaceMatchCase);
        if (nextValue === currentValue) return;
        changed = true;
        changedCount += 1;
        next[column.key] = nextValue;
        patch[column.key] = nextValue;
      });
      if (changed) updatesByRow.set(row.id, patch);
      return changed ? next : row;
    });

    if (!updatesByRow.size) {
      markSync('saved', 'Nada para substituir');
      return;
    }

    setRows(optimistic);
    markSync('saving', 'Substituindo valores');
    setBusy('replace-text');
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', `${changedCount} célula${changedCount === 1 ? '' : 's'} atualizada${changedCount === 1 ? '' : 's'}`);
    } catch (error) {
      notifyError(error, 'Não foi possível substituir os valores.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setBusy('');
    }
  }, [activeSheetId, canEdit, columns, loadSheet, markSync, notifyError, replaceMatchCase, replaceQuery, replaceScope, replaceValue, rows, selectedCells]);

  const useActiveCellValueAsSearch = useCallback(() => {
    const value = activeCellText(activeCell, rows);
    if (!value) return;
    setSearchQuery(value);
    setFilterQuery('');
    requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
  }, [activeCell, rows]);

  const useActiveCellValueAsReplaceQuery = useCallback(() => {
    const value = activeCellText(activeCell, rows);
    if (!value) return;
    setReplaceQuery(value);
    setReplaceBarOpen(true);
    requestAnimationFrame(() => replaceInputRef.current?.focus({ preventScroll: true }));
  }, [activeCell, rows]);

  const fitActiveColumnWidth = useCallback(async () => {
    if (!canEdit || !activeColumn) return;
    const width = calculateBestColumnWidth(activeColumn, rows);
    setColumns((current) => current.map((column) => (column.key === activeColumn.key ? { ...column, width } : column)));
    setSavingColumn(activeColumn.key);
    try {
      await updateSupportDailyColumn(activeColumn.key, { width });
      markSync('saved', 'Largura ajustada');
    } catch (error) {
      notifyError(error, 'Não foi possível ajustar a largura da coluna.');
      loadSheet(activeSheetId).catch(() => {});
    } finally {
      setSavingColumn('');
    }
  }, [activeColumn, activeSheetId, canEdit, loadSheet, markSync, notifyError, rows]);

  const normalizeSelectionValues = useCallback(async () => {
    if (!canEdit || !selectedCells.length) return;
    const updatesByRow = new Map();
    const optimistic = rows.map((row) => {
      const targetCells = selectedCells.filter((cell) => cell.row.id === row.id);
      if (!targetCells.length) return row;
      const next = { ...row };
      const patch = {};
      targetCells.forEach(({ column }) => {
        const style = getCellStyle(row, column.key);
        const currentValue = sanitizeCellValue(row?.[column.key] || '');
        const nextValue = normalizeValueForType(currentValue, style);
        next[column.key] = nextValue;
        patch[column.key] = nextValue;
      });
      updatesByRow.set(row.id, patch);
      return next;
    });
    if (!updatesByRow.size) return;
    setRows(optimistic);
    markSync('saving', 'Normalizando seleção');
    setBusy('normalize-values');
    try {
      await Promise.all([...updatesByRow.entries()].map(([rowId, patch]) => updateSupportDailyRow(rowId, patch)));
      markSync('saved', 'Seleção normalizada');
    } catch (error) {
      notifyError(error, 'Não foi possível normalizar a seleção.');
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

  const pasteClipboardAtActive = useCallback(async () => {
    if (!canEdit || !activeCell?.rowId || !activeCell?.key || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      await pasteTable(activeCell.rowId, activeCell.key, text);
    } catch (error) {
      notifyError(error, 'Não foi possível ler a área de transferência.');
    }
  }, [activeCell?.key, activeCell?.rowId, canEdit, notifyError, pasteTable]);

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
    const clickedInsideSelection = selectedCellIds.has(`${rowId}:${key}`);
    setActiveCell(nextCell);
    if (!clickedInsideSelection) {
      setSelectionAnchor(nextCell);
      setSelectionFocus(nextCell);
    }
    setContextMenu({ x: event.clientX, y: event.clientY, scope: 'cell', label: getCellAddress(nextCell, viewRows, columns) });
  }, [columns, selectedCellIds, viewRows]);

  const openRowContextMenu = useCallback((event, rowId) => {
    event.preventDefault();
    selectRow(rowId);
    const rowIndex = viewRows.findIndex((row) => row.id === rowId);
    setContextMenu({ x: event.clientX, y: event.clientY, scope: 'row', label: rowIndex >= 0 ? `Linha ${rowIndex + 1}` : 'Linha' });
  }, [selectRow, viewRows]);

  const openColumnContextMenu = useCallback((event, key) => {
    event.preventDefault();
    selectColumn(key);
    const columnIndex = columns.findIndex((column) => column.key === key);
    setContextMenu({ x: event.clientX, y: event.clientY, scope: 'column', label: columnIndex >= 0 ? `Coluna ${columns[columnIndex]?.label || columnName(columnIndex)}` : 'Coluna' });
  }, [columns, selectColumn]);

  const goToSearchMatch = useCallback((direction = 1) => {
    if (!searchMatches.length) return;
    const currentIndex = searchMatches.findIndex((match) => match.rowId === activeCell?.rowId && match.key === activeCell?.key);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + searchMatches.length) % searchMatches.length;
    const nextCell = searchMatches[nextIndex];
    setActiveCell(nextCell);
    setSelectionAnchor(nextCell);
    setSelectionFocus(nextCell);
  }, [activeCell?.key, activeCell?.rowId, searchMatches]);

  const applyFormulaSuggestion = useCallback((formulaName) => {
    setFormulaValue((current) => insertFormulaSuggestion(current, formulaName));
    requestAnimationFrame(() => formulaInputRef.current?.focus({ preventScroll: true }));
  }, []);

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
      if (modifier && key === 'h') {
        event.preventDefault();
        setReplaceBarOpen(true);
        requestAnimationFrame(() => replaceInputRef.current?.focus({ preventScroll: true }));
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
      if (key === 'x' && canEdit) {
        event.preventDefault();
        cutSelection().catch(() => {});
      }
      if (key === 'v' && canEdit) {
        event.preventDefault();
        pasteClipboardAtActive().catch(() => {});
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
  }, [activeCell, applyValueToSelection, canEdit, clearSelectionValues, columns, copySelection, cutSelection, pasteClipboardAtActive, toggleStyle, viewRows]);

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

      <div className={styles.sheetsToolbar} aria-label="Barra de ferramentas da planilha">
        <button type="button" onClick={focusSearch} disabled={!activeSheetId} aria-label="Pesquisar">⌕</button>
        <button type="button" onClick={copySelection} disabled={!activeCell} aria-label="Copiar">Copiar</button>
        <button type="button" onClick={cutSelection} disabled={!activeCell || !canEdit || !!busy} aria-label="Recortar">Recortar</button>
        <button type="button" onClick={pasteClipboardAtActive} disabled={!activeCell || !canEdit || !!busy} aria-label="Colar">Colar</button>
        <span aria-hidden="true" />
        <select
          value={selectedNumberFormat === 'mixed' ? 'text' : selectedNumberFormat}
          aria-label="Formato da seleção"
          disabled={!selectedCount || !canEdit || !!busy}
          onChange={(event) => setNumberFormat(event.target.value)}
        >
          <option value="text">123</option>
          <option value="number">Número</option>
          <option value="currency">R$ Moeda</option>
          <option value="percent">% Percentual</option>
        </select>
        <span aria-hidden="true" />
        <select
          value={selectedFontFamily === 'mixed' ? '' : selectedFontFamily}
          aria-label="Fonte"
          disabled={!selectedCount || !canEdit || !!busy}
          onChange={(event) => setFontFamily(event.target.value)}
        >
          {FONT_FAMILY_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" onClick={() => setFontSize('small')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Diminuir fonte">−</button>
        <select
          value={selectedFontSize === 'mixed' ? '' : selectedFontSize}
          aria-label="Tamanho da fonte"
          disabled={!selectedCount || !canEdit || !!busy}
          onChange={(event) => setFontSize(event.target.value)}
        >
          <option value="small">9</option>
          <option value="">10</option>
          <option value="large">12</option>
        </select>
        <button type="button" onClick={() => setFontSize('large')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Aumentar fonte">+</button>
        <span aria-hidden="true" />
        <button type="button" data-active={selectedHasBold || undefined} onClick={() => toggleStyle('bold')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Negrito"><strong>B</strong></button>
        <button type="button" data-active={selectedHasItalic || undefined} onClick={() => toggleStyle('italic')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Itálico"><em>I</em></button>
        <button type="button" onClick={() => applyStyleToSelection((style) => ({ strikeThrough: !style.strikeThrough }))} disabled={!selectedCount || !canEdit || !!busy} aria-label="Tachado"><s>S</s></button>
        <button type="button" data-active={selectedHasUnderline || undefined} onClick={() => toggleStyle('underline')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Sublinhado"><u>U</u></button>
        <select
          value={selectedTextColor === 'mixed' ? '' : selectedTextColor}
          aria-label="Cor do texto"
          disabled={!selectedCount || !canEdit || !!busy}
          onChange={(event) => setTextColor(event.target.value)}
        >
          {TEXT_COLOR_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
        </select>
        <select
          value={selectedFillColor === 'mixed' ? '' : selectedFillColor}
          aria-label="Cor de preenchimento"
          disabled={!selectedCount || !canEdit || !!busy}
          onChange={(event) => setFillColor(event.target.value)}
        >
          {FILL_COLOR_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
        </select>
        <span aria-hidden="true" />
        <button type="button" data-active={selectedAlign === 'left' || undefined} onClick={() => setTextAlign('left')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Alinhar à esquerda">≡</button>
        <button type="button" data-active={selectedAlign === 'center' || undefined} onClick={() => setTextAlign('center')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Centralizar">≣</button>
        <button type="button" data-active={selectedAlign === 'right' || undefined} onClick={() => setTextAlign('right')} disabled={!selectedCount || !canEdit || !!busy} aria-label="Alinhar à direita">≡</button>
        <select
          value={selectedWrapMode === 'mixed' ? '' : selectedWrapMode}
          aria-label="Ajuste de texto"
          disabled={!selectedCount || !canEdit || !!busy}
          onChange={(event) => setWrapMode(event.target.value)}
        >
          <option value="">Transbordar</option>
          <option value="wrap">Quebrar</option>
          <option value="clip">Cortar</option>
        </select>
        <span aria-hidden="true" />
        <button type="button" onClick={clearSelectionFormatting} disabled={!selectedCount || !canEdit || !!busy} aria-label="Limpar formatação">Limpar</button>
        <button type="button" onClick={normalizeSelectionValues} disabled={!selectedCount || !canEdit || !!busy} aria-label="Normalizar">Normalizar</button>
        <button type="button" onClick={focusSearch} disabled={!activeSheetId} aria-label="Buscar na planilha">Buscar</button>
        <button type="button" onClick={() => { setReplaceBarOpen((current) => !current); requestAnimationFrame(() => replaceInputRef.current?.focus({ preventScroll: true })); }} disabled={!activeSheetId} aria-label="Localizar e substituir">Substituir</button>
        <button type="button" onClick={() => insertFormulaTemplate('SOMA')} disabled={!activeCell || !canEdit || !!busy} aria-label="Inserir soma">Σ</button>
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
        {filterColumnKey !== 'all' && filterQuery ? <button type="button" onClick={applyColumnFilterFromBar}>Fixar</button> : null}
        {filterQuery ? <button type="button" onClick={() => setFilterQuery('')}>Limpar</button> : null}
        {activeColumnFilterCount ? <button type="button" onClick={clearAllColumnFilters}>Limpar filtros</button> : null}
        <strong>{filterQuery || activeColumnFilterCount ? `${viewRows.length}/${rows.length}` : `${rows.length}`}</strong>
        {Object.entries(columnFilters).map(([key, value]) => {
          const column = columns.find((item) => item.key === key);
          if (!sanitizeCellValue(value)) return null;
          return (
            <button key={key} type="button" className={styles.filterChip} onClick={() => clearColumnFilter(key)} title="Remover filtro">
              {column?.label || key}: {value} ×
            </button>
          );
        })}
      </div>

      {replaceBarOpen ? (
        <div className={styles.replaceBar} aria-label="Localizar e substituir">
          <span>Substituir</span>
          <input
            ref={replaceInputRef}
            value={replaceQuery}
            aria-label="Localizar"
            placeholder="Localizar"
            onChange={(event) => setReplaceQuery(sanitizeCellValue(event.target.value))}
          />
          <input
            value={replaceValue}
            aria-label="Substituir por"
            placeholder="Substituir por"
            onChange={(event) => setReplaceValue(sanitizeCellValue(event.target.value))}
          />
          <select
            value={replaceScope}
            aria-label="Escopo da substituição"
            onChange={(event) => setReplaceScope(event.target.value)}
          >
            <option value="selection">Seleção</option>
            <option value="sheet">Planilha inteira</option>
          </select>
          <label>
            <input type="checkbox" checked={replaceMatchCase} onChange={(event) => setReplaceMatchCase(event.target.checked)} />
            Diferenciar maiúsculas
          </label>
          <button type="button" onClick={findReplaceMatch} disabled={!replaceQuery}>Encontrar</button>
          <button type="button" onClick={() => replaceTextInScope().catch(() => {})} disabled={!replaceQuery || !canEdit || !!busy}>Substituir</button>
          <button type="button" onClick={() => setReplaceBarOpen(false)} aria-label="Fechar localizar e substituir">×</button>
        </div>
      ) : null}

      <div className={styles.controlBar}>
        <div className={styles.nameBox}>{activeColumn && activeRowIndex >= 0 ? `${columnName(activeColumnIndex)}${activeRowIndex + 1}` : '—'}</div>
        <div className={styles.formulaBar} data-invalid={formulaAssist.visible && !formulaAssist.validation.ok || undefined}>
          <span>fx</span>
          {formulaValue.trim().startsWith('=') ? <em className={styles.formulaBadge}>Fórmula</em> : null}
          <input
            ref={formulaInputRef}
            value={formulaValue}
            disabled={!activeCell || !canEdit}
            aria-label="Conteúdo da célula ativa"
            placeholder="Selecione uma célula"
            onFocus={() => setFormulaInputFocused(true)}
            onChange={(event) => {
              setFormulaValue(sanitizeCellValue(event.target.value));
              setFormulaRangeAnchor(null);
              formulaReferenceBaseRef.current = '';
            }}
            onBlur={() => {
              commitFormula();
              window.setTimeout(() => setFormulaInputFocused(false), 120);
            }}
            onKeyDown={(event) => {
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && formulaAssist.suggestions.length) {
                event.preventDefault();
                setFormulaSuggestionIndex((current) => {
                  const direction = event.key === 'ArrowDown' ? 1 : -1;
                  return (current + direction + formulaAssist.suggestions.length) % formulaAssist.suggestions.length;
                });
                return;
              }
              if ((event.key === 'Tab' || event.key === 'Enter') && formulaAssist.suggestions.length) {
                const suggestion = formulaAssist.suggestions[formulaSuggestionIndex] || formulaAssist.suggestions[0];
                if (suggestion) {
                  event.preventDefault();
                  applyFormulaSuggestion(suggestion.name);
                  return;
                }
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setFormulaValue(activeCellText(activeCell, rows));
                setFormulaRangeAnchor(null);
                formulaReferenceBaseRef.current = '';
                event.currentTarget.blur();
              }
            }}
          />
          {formulaAssist.visible && activeCell && canEdit ? (
            <div className={styles.formulaAssist}>
              {!formulaAssist.validation.ok ? <strong>{formulaAssist.validation.message}</strong> : null}
              {formulaAssist.suggestions.length ? (
                <div className={styles.formulaSuggestions}>
                  {formulaAssist.suggestions.map((formula, index) => (
                    <button
                      key={formula.name}
                      type="button"
                      data-active={index === formulaSuggestionIndex || undefined}
                      onMouseEnter={() => setFormulaSuggestionIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyFormulaSuggestion(formula.name)}
                    >
                      <span>{formula.signature}</span>
                      <em>{formula.description}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {formulaSelectionMode ? <small className={styles.formulaHint}>Clique ou arraste no grid para inserir referência</small> : null}
        </div>
      </div>

      <div className={styles.sheetWorkspace}>
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
            formulaReferenceIds={formulaReferenceIdsWithSelection}
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
            onSelectRowRange={selectRowRange}
            onSelectColumnRange={selectColumnRange}
            onCellChange={setCellDraft}
            onCellCommit={commitCell}
            onFormulaDraftChange={setFormulaValue}
            onEditorSelectionChange={setActiveTextSelection}
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

      </div>

      <footer className={styles.footer}>
        <span data-status={syncState.status}><SaveIcon size={13} /> {syncState.detail}</span>
        <span>{selectedSummary} · {filterQuery ? `${viewRows.length}/${rows.length}` : rows.length} linha{rows.length === 1 ? '' : 's'} · {columns.length} coluna{columns.length === 1 ? '' : 's'}{formulaCount ? ` · ${formulaCount} fórmula${formulaCount === 1 ? '' : 's'}` : ''}{validationIssueCount ? ` · ${validationIssueCount} ajuste${validationIssueCount === 1 ? '' : 's'} de tipo` : ''}{activeColumnFilterCount ? ` · ${activeColumnFilterCount} filtro${activeColumnFilterCount === 1 ? '' : 's'}` : ''}</span>
      </footer>

      <SheetContextMenu
        menu={contextMenu}
        canEdit={canEdit && !busy}
        onClose={closeContextMenu}
        onCopy={() => { closeContextMenu(); copySelection().catch(() => {}); }}
        onCut={() => { closeContextMenu(); cutSelection().catch(() => {}); }}
        onPaste={() => { closeContextMenu(); pasteClipboardAtActive().catch(() => {}); }}
        onSelectAll={() => { closeContextMenu(); selectAllCells(); }}
        onSelectUsedRange={() => { closeContextMenu(); selectUsedRange(); }}
        onSelectRow={() => { closeContextMenu(); activeCell?.rowId && selectRow(activeCell.rowId); }}
        onSelectColumn={() => { closeContextMenu(); activeCell?.key && selectColumn(activeCell.key); }}
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
        onStrikeThrough={() => { closeContextMenu(); applyStyleToSelection((style) => ({ strikeThrough: !style.strikeThrough })); }}
        onAlignLeft={() => { closeContextMenu(); setTextAlign('left'); }}
        onAlignCenter={() => { closeContextMenu(); setTextAlign('center'); }}
        onAlignRight={() => { closeContextMenu(); setTextAlign('right'); }}
        onClearFormatting={() => { closeContextMenu(); clearSelectionFormatting(); }}
        onUppercase={() => { closeContextMenu(); transformSelectionText('uppercase').catch(() => {}); }}
        onLowercase={() => { closeContextMenu(); transformSelectionText('lowercase').catch(() => {}); }}
        onTitlecase={() => { closeContextMenu(); transformSelectionText('titlecase').catch(() => {}); }}
        onTrimSpaces={() => { closeContextMenu(); transformSelectionText('trim').catch(() => {}); }}
        onFindCellValue={() => { closeContextMenu(); useActiveCellValueAsSearch(); }}
        onUseCellValueAsReplaceQuery={() => { closeContextMenu(); useActiveCellValueAsReplaceQuery(); }}
        onFitColumnWidth={() => { closeContextMenu(); fitActiveColumnWidth().catch(() => {}); }}
        onSortColumnAscending={() => { closeContextMenu(); sortActiveColumn('asc').catch(() => {}); }}
        onSortColumnDescending={() => { closeContextMenu(); sortActiveColumn('desc').catch(() => {}); }}
        onFilterColumnBySelection={() => { closeContextMenu(); filterActiveColumnBySelection(); }}
        onClearColumnFilter={() => { closeContextMenu(); if (activeCell?.key) clearColumnFilter(activeCell.key); }}
        onSetTypeText={() => { closeContextMenu(); setNumberFormat('text'); }}
        onSetTypeNumber={() => { closeContextMenu(); setNumberFormat('number'); }}
        onSetTypeCurrency={() => { closeContextMenu(); setNumberFormat('currency'); }}
        onSetTypePercent={() => { closeContextMenu(); setNumberFormat('percent'); }}
        onNormalizeSelection={() => { closeContextMenu(); normalizeSelectionValues().catch(() => {}); }}
        onWrapText={() => { closeContextMenu(); setWrapMode('wrap'); }}
        onClipText={() => { closeContextMenu(); setWrapMode('clip'); }}
        onFontSmall={() => { closeContextMenu(); setFontSize('small'); }}
        onFontNormal={() => { closeContextMenu(); setFontSize(''); }}
        onFontLarge={() => { closeContextMenu(); setFontSize('large'); }}
        onVerticalTop={() => { closeContextMenu(); setVerticalAlign('top'); }}
        onVerticalMiddle={() => { closeContextMenu(); setVerticalAlign(''); }}
        onVerticalBottom={() => { closeContextMenu(); setVerticalAlign('bottom'); }}
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
