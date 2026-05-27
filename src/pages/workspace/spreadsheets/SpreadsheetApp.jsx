import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
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
} from '../../../api/support.js';
import WorkspaceEmptyState from '../WorkspaceEmptyState.jsx';
import styles from '../WorkspaceApp.module.css';
import SpreadsheetContextMenu from './SpreadsheetContextMenu.jsx';
import SpreadsheetFormulaBar from './SpreadsheetFormulaBar.jsx';
import SpreadsheetGrid from './SpreadsheetGrid.jsx';
import SpreadsheetStatusBar from './SpreadsheetStatusBar.jsx';
import SpreadsheetToolbar from './SpreadsheetToolbar.jsx';
import { buildSpreadsheetCommands, buildSpreadsheetContextCommands } from './spreadsheetCommands.js';
import {
  buildRangeTsv,
  cellRef,
  cleanCellValue,
  clearRangeValues,
  columnRange,
  nextCellPosition,
  normalizeRange,
  normalizeRows,
  pasteRange,
  parseClipboardMatrix,
  rangeLabel,
  rowRange,
} from './spreadsheetUtils.js';

export default function SpreadsheetApp({ requestConfirm }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [draft, setDraft] = useState('');
  const [sheetNameDraft, setSheetNameDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [contextMenu, setContextMenu] = useState(null);

  const activeSheet = useMemo(() => sheets.find((sheet) => sheet.id === activeSheetId) || sheets[0] || null, [sheets, activeSheetId]);
  const selectedColumn = selectedCell ? columns[selectedCell.colIndex] : null;
  const isSingleCellSelection = selectedRange && selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol;
  const selectedLabel = selectedRange ? rangeLabel(selectedRange) : '—';
  const selectedValue = selectedCell && isSingleCellSelection ? String(rows[selectedCell.rowIndex]?.[selectedColumn?.key] ?? '') : '';

  const loadSheet = useCallback(async (sheetId = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await listSupportDailyRows(sheetId || undefined);
      const nextColumns = Array.isArray(response?.columns) ? response.columns : [];
      const nextRows = normalizeRows(response?.rows || [], nextColumns);
      const nextSheetId = response?.activeSheetId || sheetId || response?.sheets?.[0]?.id || '';
      setSheets(Array.isArray(response?.sheets) ? response.sheets : []);
      setActiveSheetId(nextSheetId);
      setColumns(nextColumns);
      setRows(nextRows);
      setSelectedCell(null);
      setSelectionAnchor(null);
      setSelectedRange(null);
      setEditing(null);
      setContextMenu(null);
      setStatus(nextRows.length || nextColumns.length ? 'Sincronizada' : '');
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar as planilhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSheet('');
  }, [loadSheet]);

  useEffect(() => {
    setSheetNameDraft(activeSheet?.name || '');
  }, [activeSheet?.id, activeSheet?.name]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    function handleClose() {
      setContextMenu(null);
    }
    window.addEventListener('keydown', handleClose);
    window.addEventListener('resize', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('keydown', handleClose);
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [contextMenu]);

  async function handleCreateSheet() {
    setLoading(true);
    try {
      const response = await createSupportDailySheet({ name: 'Nova planilha', columnCount: 8, rowCount: 18, columnWidth: 168 });
      setSheets(Array.isArray(response?.sheets) ? response.sheets : []);
      setActiveSheetId(response?.sheet?.id || '');
      setColumns(Array.isArray(response?.columns) ? response.columns : []);
      setRows(normalizeRows(response?.rows || [], response?.columns || []));
      setSelectedCell(null);
      setSelectionAnchor(null);
      setSelectedRange(null);
      setStatus('Planilha criada');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectSheet(sheetId) {
    if (!sheetId || sheetId === activeSheetId) return;
    await loadSheet(sheetId);
  }

  async function handleSaveSheetName() {
    if (!activeSheet?.id) return;
    const cleanName = String(sheetNameDraft || '').trim() || 'Planilha sem nome';
    if (cleanName === activeSheet.name) return;
    const response = await updateSupportDailySheet(activeSheet.id, { name: cleanName });
    if (Array.isArray(response?.sheets)) setSheets(response.sheets);
    setSheetNameDraft(cleanName);
    setStatus('Nome salvo');
  }

  function requestDeleteSheet() {
    if (!activeSheet?.id) return;
    requestConfirm?.({
      title: 'Excluir planilha?',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        await deleteSupportDailySheet(activeSheet.id);
        await loadSheet('');
        requestConfirm(null);
      },
    });
  }

  async function handleAddColumn() {
    if (!activeSheetId) return null;
    const response = await createSupportDailyColumn({ sheetId: activeSheetId, label: `Coluna ${columns.length + 1}`, width: 168 });
    const nextColumns = Array.isArray(response?.columns) ? response.columns : columns;
    setColumns(nextColumns);
    setRows((current) => normalizeRows(current, nextColumns));
    setStatus('Coluna adicionada');
    return nextColumns;
  }

  async function ensureColumnCapacity(requiredCount, currentColumns = columns) {
    let nextColumns = currentColumns;
    while (activeSheetId && nextColumns.length < requiredCount) {
      const response = await createSupportDailyColumn({ sheetId: activeSheetId, label: `Coluna ${nextColumns.length + 1}`, width: 168 });
      nextColumns = Array.isArray(response?.columns) ? response.columns : nextColumns;
    }
    if (nextColumns !== currentColumns) {
      setColumns(nextColumns);
      setRows((current) => normalizeRows(current, nextColumns));
    }
    return nextColumns;
  }

  async function handleRenameColumn(column, label) {
    if (!column?.key) return;
    const cleanLabel = String(label || '').trim() || 'Coluna';
    if (cleanLabel === column.label) return;
    const response = await updateSupportDailyColumn(column.key, { label: cleanLabel });
    if (Array.isArray(response?.columns)) setColumns(response.columns);
    setStatus('Coluna renomeada');
  }

  function requestDeleteColumn(column) {
    if (!column?.key) return;
    requestConfirm?.({
      title: 'Excluir coluna?',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        await deleteSupportDailyColumn(column.key, { sheetId: activeSheetId });
        await loadSheet(activeSheetId);
        requestConfirm(null);
      },
    });
  }

  async function handleAddRow() {
    if (!activeSheetId) return null;
    const response = await createSupportDailyRow({ sheetId: activeSheetId });
    if (response?.row) setRows((current) => normalizeRows([...current, response.row], columns));
    setStatus('Linha adicionada');
    return response?.row || null;
  }

  async function ensureRowCapacity(requiredCount, currentRows = rows, currentColumns = columns) {
    let nextRows = currentRows;
    while (activeSheetId && nextRows.length < requiredCount) {
      const response = await createSupportDailyRow({ sheetId: activeSheetId });
      if (!response?.row) break;
      nextRows = normalizeRows([...nextRows, response.row], currentColumns);
    }
    if (nextRows !== currentRows) setRows(nextRows);
    return nextRows;
  }

  function requestDeleteRow(row) {
    if (!row?.id) return;
    requestConfirm?.({
      title: 'Excluir linha?',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        await deleteSupportDailyRow(row.id, { sheetId: activeSheetId });
        setRows((current) => current.filter((item) => item.id !== row.id));
        requestConfirm(null);
      },
    });
  }

  function selectCell(rowIndex, colIndex, extendSelection = false) {
    const column = columns[colIndex];
    const target = { rowIndex, colIndex };
    const anchor = extendSelection && selectionAnchor ? selectionAnchor : target;
    setSelectedCell(target);
    setSelectionAnchor(anchor);
    setSelectedRange(normalizeRange(anchor, target));
    setDraft(String(rows[rowIndex]?.[column?.key] ?? ''));
    setContextMenu(null);
  }

  function selectRow(rowIndex) {
    const target = { rowIndex, colIndex: 0 };
    setSelectedCell(target);
    setSelectionAnchor(target);
    setSelectedRange(rowRange(rowIndex, columns.length));
    setDraft('');
    setEditing(null);
    setContextMenu(null);
  }

  function selectColumn(colIndex) {
    const target = { rowIndex: 0, colIndex };
    setSelectedCell(target);
    setSelectionAnchor(target);
    setSelectedRange(columnRange(colIndex, rows.length));
    setDraft('');
    setEditing(null);
    setContextMenu(null);
  }

  function startEditing(rowIndex, columnKey, colIndex) {
    const target = { rowIndex, colIndex };
    setSelectedCell(target);
    setSelectionAnchor(target);
    setSelectedRange(normalizeRange(target, target));
    setEditing({ rowIndex, columnKey });
    setDraft(String(rows[rowIndex]?.[columnKey] ?? ''));
  }

  async function saveCellValue(rowIndex, columnKey, value) {
    const row = rows[rowIndex];
    if (!row?.id || !columnKey) return;
    const cleanValue = cleanCellValue(value);
    setRows((current) => current.map((item, index) => (index === rowIndex ? { ...item, [columnKey]: cleanValue } : item)));
    await updateSupportDailyRow(row.id, { [columnKey]: cleanValue });
    setEditing(null);
    setDraft(cleanValue);
    setStatus('Célula salva');
  }

  async function saveEditing() {
    if (!editing) return;
    await saveCellValue(editing.rowIndex, editing.columnKey, draft);
  }

  async function handleFormulaSave() {
    if (!selectedCell || !selectedColumn || !isSingleCellSelection) return;
    await saveCellValue(selectedCell.rowIndex, selectedColumn.key, draft);
  }

  async function clearSelectedRange(context = null) {
    if (context?.rowIndex !== undefined && context?.column) {
      await saveCellValue(context.rowIndex, context.column.key, '');
      return;
    }
    if (!selectedRange) return;
    const { rows: clearedRows, changed } = clearRangeValues(rows, columns, selectedRange);
    if (!changed.length) return;
    setRows(clearedRows);
    await Promise.all(changed.map(({ rowIndex: targetRow, patch }) => updateSupportDailyRow(clearedRows[targetRow].id, patch)));
    setEditing(null);
    setDraft('');
    setStatus(changed.length === 1 ? 'Célula limpa' : 'Seleção limpa');
  }

  async function copySelection() {
    if (!selectedRange || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    const value = buildRangeTsv(rows, columns, selectedRange);
    await navigator.clipboard.writeText(value);
    setStatus(selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol ? 'Célula copiada' : 'Seleção copiada');
  }

  async function copyCell(context) {
    const column = context?.column || selectedColumn;
    const row = rows[context?.rowIndex ?? selectedCell?.rowIndex];
    if (!column || !row) return;
    const value = String(row[column.key] ?? '');
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      setStatus('Célula copiada');
    }
  }

  async function pasteCell(context) {
    const colIndex = context?.colIndex ?? selectedCell?.colIndex;
    const rowIndex = context?.rowIndex ?? selectedCell?.rowIndex;
    if (rowIndex === undefined || colIndex === undefined || typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    await pasteTextAt(text, rowIndex, colIndex);
  }

  async function handleCellKeyDown(event, rowIndex = selectedCell?.rowIndex, colIndex = selectedCell?.colIndex) {
    const hasPosition = rowIndex !== undefined && colIndex !== undefined;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (rows.length && columns.length) {
        const anchor = { rowIndex: 0, colIndex: 0 };
        const end = { rowIndex: rows.length - 1, colIndex: columns.length - 1 };
        setSelectedCell(anchor);
        setSelectionAnchor(anchor);
        setSelectedRange(normalizeRange(anchor, end));
        setEditing(null);
        setDraft('');
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await copySelection();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      await pasteCell({ rowIndex, colIndex });
      return;
    }

    if (editing) {
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        await saveEditing();
        if (hasPosition) {
          const navKey = event.key === 'Tab' && event.shiftKey ? 'ShiftTab' : event.key;
          const next = nextCellPosition({ rowIndex, colIndex }, navKey, rows.length, columns.length);
          selectCell(next.rowIndex, next.colIndex, event.shiftKey);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setEditing(null);
      }
      return;
    }

    if ((event.key === 'Enter' || event.key === 'F2') && hasPosition) {
      event.preventDefault();
      startEditing(rowIndex, columns[colIndex]?.key, colIndex);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      await clearSelectedRange();
      return;
    }

    if (hasPosition && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
      event.preventDefault();
      const navKey = event.key === 'Tab' && event.shiftKey ? 'ShiftTab' : event.key;
      const next = nextCellPosition({ rowIndex, colIndex }, navKey, rows.length, columns.length);
      selectCell(next.rowIndex, next.colIndex, event.shiftKey);
    }
  }

  async function pasteTextAt(text, rowIndex, colIndex) {
    const matrix = parseClipboardMatrix(text);
    if (!matrix.length || rowIndex === undefined || colIndex === undefined) return;

    const requiredRows = rowIndex + matrix.length;
    const requiredColumns = colIndex + Math.max(...matrix.map((line) => line.length));
    const nextColumns = await ensureColumnCapacity(requiredColumns, columns);
    const nextRows = await ensureRowCapacity(requiredRows, rows, nextColumns);

    const { rows: pastedRows, changed } = pasteRange(nextRows, nextColumns, matrix, rowIndex, colIndex);
    if (!changed.length) return;

    setRows(pastedRows);
    await Promise.all(changed.map(({ rowIndex: targetRow, patch }) => updateSupportDailyRow(pastedRows[targetRow].id, patch)));

    const target = { rowIndex, colIndex };
    const end = { rowIndex: rowIndex + matrix.length - 1, colIndex: colIndex + Math.max(...matrix.map((line) => line.length)) - 1 };
    setSelectedCell(target);
    setSelectionAnchor(target);
    setSelectedRange(normalizeRange(target, end));
    setDraft(String(pastedRows[rowIndex]?.[nextColumns[colIndex]?.key] ?? ''));
    setEditing(null);
    setStatus(matrix.length === 1 && matrix[0]?.length === 1 ? 'Célula colada' : 'Bloco colado');
  }

  async function handlePaste(event, rowIndex, colIndex) {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    await pasteTextAt(text, rowIndex, colIndex);
  }

  function handleColumnResizeStart(event, column) {
    if (!column?.key) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(column.width || 168);

    function handleMove(moveEvent) {
      const nextWidth = Math.max(96, Math.min(420, startWidth + moveEvent.clientX - startX));
      setColumns((current) => current.map((item) => (item.key === column.key ? { ...item, width: nextWidth } : item)));
    }

    async function handleUp(upEvent) {
      const nextWidth = Math.max(96, Math.min(420, startWidth + upEvent.clientX - startX));
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      const response = await updateSupportDailyColumn(column.key, { width: nextWidth });
      if (Array.isArray(response?.columns)) setColumns(response.columns);
      setStatus('Largura salva');
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function openContextMenu(event, context) {
    event.preventDefault();
    const x = Math.min(event.clientX, Math.max(16, window.innerWidth - 244));
    const y = Math.min(event.clientY, Math.max(16, window.innerHeight - 330));
    const column = context.colIndex !== undefined ? columns[context.colIndex] : context.column;
    const row = context.rowIndex !== undefined ? rows[context.rowIndex] : context.row;
    if (context.type === 'cell' && column) {
      const target = { rowIndex: context.rowIndex, colIndex: context.colIndex };
      setSelectedCell(target);
      setSelectionAnchor(target);
      setSelectedRange(normalizeRange(target, target));
      setDraft(String(row?.[column.key] ?? ''));
    }
    if (context.type === 'row' && context.rowIndex !== undefined) {
      const target = { rowIndex: context.rowIndex, colIndex: 0 };
      setSelectedCell(target);
      setSelectionAnchor(target);
      setSelectedRange(rowRange(context.rowIndex, columns.length));
      setDraft('');
      setEditing(null);
    }
    if (context.type === 'column' && context.colIndex !== undefined) {
      const target = { rowIndex: 0, colIndex: context.colIndex };
      setSelectedCell(target);
      setSelectionAnchor(target);
      setSelectedRange(columnRange(context.colIndex, rows.length));
      setDraft('');
      setEditing(null);
    }
    setContextMenu({
      ...context,
      x,
      y,
      column,
      row,
      title: context.type === 'column' ? 'Coluna' : context.type === 'row' ? 'Linha' : 'Célula',
      subtitle: context.type === 'column' ? (column?.label || 'Coluna') : context.type === 'row' ? `Linha ${row?.position || context.rowIndex + 1}` : cellRef(context.rowIndex, context.colIndex),
    });
  }

  const commands = useMemo(
    () => buildSpreadsheetCommands({ activeSheetId, selectedCell, selectedRange, onAddRow: handleAddRow, onAddColumn: handleAddColumn, onClearSelection: clearSelectedRange, onCopySelection: copySelection }),
    [activeSheetId, selectedCell, selectedRange, rows, columns]
  );

  const contextCommands = useMemo(
    () => buildSpreadsheetContextCommands({
      activeSheetId,
      context: contextMenu,
      onAddRow: handleAddRow,
      onAddColumn: handleAddColumn,
      onCopyCell: copyCell,
      onCopySelection: copySelection,
      onPasteCell: pasteCell,
      onClearSelection: clearSelectedRange,
      onEditCell: startEditing,
      onDeleteRow: requestDeleteRow,
      onDeleteColumn: requestDeleteColumn,
      onSelectRow: selectRow,
      onSelectColumn: selectColumn,
    }),
    [activeSheetId, contextMenu, rows, columns]
  );

  return (
    <section className={styles.sheetPanel}>
      <div className={styles.sheetHeader}>
        <div className={styles.sheetTitle}>
          <span className={styles.eyebrow}>Planilhas</span>
          <input
            className={styles.sheetNameInput}
            value={sheetNameDraft}
            onBlur={handleSaveSheetName}
            onChange={(event) => setSheetNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            disabled={!activeSheet}
            aria-label="Nome da planilha"
          />
          <span>{status}</span>
        </div>
        <div className={styles.sheetActions}>
          <Button type="button" size="sm" onClick={handleCreateSheet}>Nova planilha</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => loadSheet(activeSheetId)} disabled={loading}>Atualizar</Button>
          <Button type="button" size="sm" variant="danger" onClick={requestDeleteSheet} disabled={!activeSheet}>Excluir</Button>
        </div>
      </div>

      {error ? <div role="alert" className="workspace-state-box">{error}</div> : null}

      {sheets.length ? (
        <div className={styles.sheetTabs} aria-label="Planilhas">
          {sheets.map((sheet) => (
            <button type="button" key={sheet.id} data-active={sheet.id === activeSheetId} onClick={() => handleSelectSheet(sheet.id)}>
              {sheet.name || 'Planilha'}
            </button>
          ))}
        </div>
      ) : null}

      <SpreadsheetToolbar commands={commands} />
      <SpreadsheetFormulaBar
        label={selectedLabel}
        value={selectedValue}
        draft={draft}
        editing={Boolean(editing)}
        disabled={!selectedCell || !isSingleCellSelection}
        onChange={setDraft}
        onFocus={() => {
          if (selectedCell && !editing) {
            setEditing({ rowIndex: selectedCell.rowIndex, columnKey: selectedColumn?.key });
            setDraft(selectedValue);
          }
        }}
        onBlur={handleFormulaSave}
        onKeyDown={handleCellKeyDown}
      />

      {loading ? <div className="workspace-state-box">Carregando planilha...</div> : null}
      {!loading && !activeSheet ? <WorkspaceEmptyState title="Sem planilhas" /> : null}

      {!loading && activeSheet ? (
        <SpreadsheetGrid
          columns={columns}
          rows={rows}
          editing={editing}
          selectedCell={selectedCell}
          selectedRange={selectedRange}
          draft={draft}
          onDraftChange={setDraft}
          onSelectCell={selectCell}
          onSelectRow={selectRow}
          onSelectColumn={selectColumn}
          onStartEditing={startEditing}
          onSaveEditing={saveEditing}
          onCellKeyDown={handleCellKeyDown}
          onPaste={handlePaste}
          onRenameColumn={handleRenameColumn}
          onDeleteColumn={requestDeleteColumn}
          onDeleteRow={requestDeleteRow}
          onColumnResizeStart={handleColumnResizeStart}
          onOpenContextMenu={openContextMenu}
        />
      ) : null}

      <SpreadsheetContextMenu menu={contextMenu} commands={contextCommands} onClose={() => setContextMenu(null)} />
      <SpreadsheetStatusBar status={status} selectedRange={selectedRange} rowCount={rows.length} columnCount={columns.length} />
    </section>
  );
}
