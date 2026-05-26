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
import { buildRangeTsv, cellRef, cleanCellValue, nextCellPosition, normalizeRange, normalizeRows, parseClipboardMatrix } from './spreadsheetUtils.js';

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
  const selectedLabel = selectedCell ? cellRef(selectedCell.rowIndex, selectedCell.colIndex) : '—';
  const selectedValue = selectedCell ? String(rows[selectedCell.rowIndex]?.[selectedColumn?.key] ?? '') : '';

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
    if (!activeSheetId) return;
    const response = await createSupportDailyColumn({ sheetId: activeSheetId, label: `Coluna ${columns.length + 1}`, width: 168 });
    const nextColumns = Array.isArray(response?.columns) ? response.columns : columns;
    setColumns(nextColumns);
    setRows((current) => normalizeRows(current, nextColumns));
    setStatus('Coluna adicionada');
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
    if (!activeSheetId) return;
    const response = await createSupportDailyRow({ sheetId: activeSheetId });
    if (response?.row) setRows((current) => normalizeRows([...current, response.row], columns));
    setStatus('Linha adicionada');
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
    if (!selectedCell || !selectedColumn) return;
    await saveCellValue(selectedCell.rowIndex, selectedColumn.key, draft);
  }

  async function clearSelectedCell(context = null) {
    const target = context || selectedCell;
    const column = context?.column || selectedColumn;
    if (!target || !column) return;
    await saveCellValue(target.rowIndex, column.key, '');
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
    const column = context?.column || selectedColumn;
    const rowIndex = context?.rowIndex ?? selectedCell?.rowIndex;
    if (!column || rowIndex === undefined || typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    await saveCellValue(rowIndex, column.key, cleanCellValue(text));
    setStatus('Texto colado');
  }

  function handleCellKeyDown(event, rowIndex = selectedCell?.rowIndex, colIndex = selectedCell?.colIndex) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEditing();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
      return;
    }
    if (!editing && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
      event.preventDefault();
      const next = nextCellPosition({ rowIndex, colIndex }, event.key, rows.length, columns.length);
      selectCell(next.rowIndex, next.colIndex, event.shiftKey);
    }
  }

  async function handlePaste(event, rowIndex, colIndex) {
    const text = event.clipboardData?.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    event.preventDefault();
    const matrix = parseClipboardMatrix(text);
    const updatedRows = [...rows];
    const changed = new Map();
    matrix.forEach((line, lineIndex) => {
      const targetRow = rowIndex + lineIndex;
      if (!updatedRows[targetRow]) return;
      line.forEach((value, valueIndex) => {
        const targetColumn = columns[colIndex + valueIndex];
        if (!targetColumn) return;
        updatedRows[targetRow] = { ...updatedRows[targetRow], [targetColumn.key]: value };
        const patch = changed.get(targetRow) || {};
        patch[targetColumn.key] = value;
        changed.set(targetRow, patch);
      });
    });
    setRows(updatedRows);
    await Promise.all(Array.from(changed.entries()).map(([targetRow, patch]) => updateSupportDailyRow(updatedRows[targetRow].id, patch)));
    setStatus('Colagem salva');
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
    () => buildSpreadsheetCommands({ activeSheetId, selectedCell, selectedRange, onAddRow: handleAddRow, onAddColumn: handleAddColumn, onClearCell: clearSelectedCell, onCopySelection: copySelection }),
    [activeSheetId, selectedCell, rows, columns]
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
      onClearCell: clearSelectedCell,
      onEditCell: startEditing,
      onDeleteRow: requestDeleteRow,
      onDeleteColumn: requestDeleteColumn,
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
        disabled={!selectedCell}
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
