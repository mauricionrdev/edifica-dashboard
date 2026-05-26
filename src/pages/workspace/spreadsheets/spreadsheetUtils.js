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
