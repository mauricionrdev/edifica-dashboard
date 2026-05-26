export function normalizeRows(rows = [], columns = []) {
  return rows.map((row, rowIndex) => {
    const next = { ...row, position: Number(row.position || rowIndex + 1) };
    columns.forEach((column) => {
      if (next[column.key] === undefined || next[column.key] === null) next[column.key] = '';
    });
    return next;
  });
}

export function cleanCellValue(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function columnWidth(column) {
  const width = Math.max(96, Math.min(420, Number(column?.width || 168)));
  return { minWidth: width, width };
}

export function cellRef(rowIndex, columnIndex) {
  let index = Number(columnIndex || 0);
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (index % 26)) + letters;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return `${letters}${Number(rowIndex || 0) + 1}`;
}

export function parseClipboardMatrix(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t').map(cleanCellValue));
}

export function nextCellPosition({ rowIndex, colIndex }, key, rowCount, columnCount) {
  if (key === 'ArrowUp') return { rowIndex: Math.max(0, rowIndex - 1), colIndex };
  if (key === 'ArrowDown') return { rowIndex: Math.min(rowCount - 1, rowIndex + 1), colIndex };
  if (key === 'ArrowLeft') return { rowIndex, colIndex: Math.max(0, colIndex - 1) };
  if (key === 'ArrowRight' || key === 'Tab') return { rowIndex, colIndex: Math.min(columnCount - 1, colIndex + 1) };
  return { rowIndex, colIndex };
}


export function normalizeRange(anchor, target) {
  if (!anchor || !target) return null;
  return {
    startRow: Math.min(anchor.rowIndex, target.rowIndex),
    endRow: Math.max(anchor.rowIndex, target.rowIndex),
    startCol: Math.min(anchor.colIndex, target.colIndex),
    endCol: Math.max(anchor.colIndex, target.colIndex),
  };
}

export function isCellInRange(range, rowIndex, colIndex) {
  if (!range) return false;
  return rowIndex >= range.startRow && rowIndex <= range.endRow && colIndex >= range.startCol && colIndex <= range.endCol;
}

export function rangeLabel(range) {
  if (!range) return '';
  const start = cellRef(range.startRow, range.startCol);
  const end = cellRef(range.endRow, range.endCol);
  return start === end ? start : `${start}:${end}`;
}

export function rangeSize(range) {
  if (!range) return 0;
  return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
}

export function buildRangeTsv(rows = [], columns = [], range) {
  if (!range) return '';
  const lines = [];
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex] || {};
    const values = [];
    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const column = columns[colIndex];
      values.push(cleanCellValue(row[column?.key] ?? ''));
    }
    lines.push(values.join('\t'));
  }
  return lines.join('\n');
}
