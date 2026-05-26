import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import {
  createSupportDailyColumn,
  createSupportDailyRow,
  createSupportDailySheet,
  deleteSupportDailyColumn,
  deleteSupportDailyRow,
  deleteSupportDailySheet,
  listSupportDailyRows,
  updateSupportDailyRow,
  updateSupportDailySheet,
} from '../../api/support.js';
import WorkspaceEmptyState from './WorkspaceEmptyState.jsx';
import styles from './WorkspaceApp.module.css';

function normalizeRows(rows = [], columns = []) {
  return rows.map((row, rowIndex) => {
    const next = { ...row, position: Number(row.position || rowIndex + 1) };
    columns.forEach((column) => {
      if (next[column.key] === undefined || next[column.key] === null) next[column.key] = '';
    });
    return next;
  });
}

function cleanCellValue(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function columnWidth(column) {
  const width = Math.max(96, Math.min(360, Number(column?.width || 168)));
  return { minWidth: width, width };
}

export default function WorkspaceSheets({ requestConfirm }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const activeSheet = useMemo(() => sheets.find((sheet) => sheet.id === activeSheetId) || sheets[0] || null, [sheets, activeSheetId]);

  const loadSheet = useCallback(async (sheetId = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await listSupportDailyRows(sheetId || undefined);
      const nextColumns = Array.isArray(response?.columns) ? response.columns : [];
      const nextRows = normalizeRows(response?.rows || [], nextColumns);
      setSheets(Array.isArray(response?.sheets) ? response.sheets : []);
      setActiveSheetId(response?.activeSheetId || sheetId || response?.sheets?.[0]?.id || '');
      setColumns(nextColumns);
      setRows(nextRows);
      setStatus(nextRows.length || nextColumns.length ? 'Planilha carregada' : 'Crie uma planilha para começar');
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar as planilhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSheet('');
  }, [loadSheet]);

  async function handleCreateSheet() {
    setLoading(true);
    try {
      const response = await createSupportDailySheet({ name: 'Nova planilha', columnCount: 8, rowCount: 18, columnWidth: 168 });
      setSheets(Array.isArray(response?.sheets) ? response.sheets : []);
      setActiveSheetId(response?.sheet?.id || '');
      setColumns(Array.isArray(response?.columns) ? response.columns : []);
      setRows(normalizeRows(response?.rows || [], response?.columns || []));
      setStatus('Planilha criada');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectSheet(sheetId) {
    if (!sheetId || sheetId === activeSheetId) return;
    await loadSheet(sheetId);
  }

  async function handleRenameSheet() {
    if (!activeSheet?.id) return;
    const name = window.prompt('Nome da planilha', activeSheet.name || 'Planilha');
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const response = await updateSupportDailySheet(activeSheet.id, { name: cleanName });
    if (Array.isArray(response?.sheets)) setSheets(response.sheets);
    setStatus('Nome da planilha salvo');
  }

  function requestDeleteSheet() {
    if (!activeSheet?.id) return;
    requestConfirm?.({
      title: 'Excluir planilha?',
      description: `A planilha ${activeSheet.name || 'sem nome'} será removida com linhas, colunas e células.`,
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
    if (Array.isArray(response?.columns)) setColumns(response.columns);
    setRows((current) => normalizeRows(current, response?.columns || columns));
    setStatus('Coluna adicionada');
  }

  function requestDeleteColumn(column) {
    if (!column?.key) return;
    requestConfirm?.({
      title: 'Excluir coluna?',
      description: `A coluna ${column.label || column.key} será removida de forma permanente.`,
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
      description: `A linha ${row.position || ''} será removida de forma permanente.`,
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        await deleteSupportDailyRow(row.id, { sheetId: activeSheetId });
        setRows((current) => current.filter((item) => item.id !== row.id));
        requestConfirm(null);
      },
    });
  }

  function startEditing(rowIndex, columnKey) {
    setEditing({ rowIndex, columnKey });
    setDraft(String(rows[rowIndex]?.[columnKey] ?? ''));
  }

  async function saveEditing() {
    if (!editing) return;
    const row = rows[editing.rowIndex];
    if (!row?.id) {
      setEditing(null);
      return;
    }
    const value = cleanCellValue(draft);
    setRows((current) => current.map((item, index) => (index === editing.rowIndex ? { ...item, [editing.columnKey]: value } : item)));
    setEditing(null);
    const response = await updateSupportDailyRow(row.id, { [editing.columnKey]: value });
    if (response?.row) {
      setRows((current) => current.map((item, index) => (index === editing.rowIndex ? normalizeRows([response.row], columns)[0] : item)));
    }
    setStatus('Célula salva');
  }

  function handleCellKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEditing();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
    }
  }

  async function handlePaste(event, rowIndex, colIndex) {
    const text = event.clipboardData?.getData('text/plain');
    if (!text || !text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n').filter((line) => line !== '').map((line) => line.split('\t'));
    const updatedRows = [...rows];
    const changed = new Map();
    matrix.forEach((line, lineIndex) => {
      const targetRow = rowIndex + lineIndex;
      if (!updatedRows[targetRow]) return;
      line.forEach((value, valueIndex) => {
        const targetColumn = columns[colIndex + valueIndex];
        if (!targetColumn) return;
        const cleanValue = cleanCellValue(value);
        updatedRows[targetRow] = { ...updatedRows[targetRow], [targetColumn.key]: cleanValue };
        const patch = changed.get(targetRow) || {};
        patch[targetColumn.key] = cleanValue;
        changed.set(targetRow, patch);
      });
    });
    setRows(updatedRows);
    await Promise.all(Array.from(changed.entries()).map(([targetRow, patch]) => updateSupportDailyRow(updatedRows[targetRow].id, patch)));
    setStatus('Colagem salva');
  }

  return (
    <section className={styles.sheetPanel}>
      <div className={styles.sheetHeader}>
        <div className={styles.sheetTitle}>
          <span className={styles.eyebrow}>Planilhas</span>
          <h2>{activeSheet?.name || 'Planilhas do workspace'}</h2>
          <span>{status}</span>
        </div>
        <div className={styles.sheetActions}>
          <Button type="button" size="sm" onClick={handleCreateSheet}>Nova planilha</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => loadSheet(activeSheetId)} disabled={loading}>Atualizar</Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleRenameSheet} disabled={!activeSheet}>Renomear</Button>
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

      <div className={styles.sheetToolbar}>
        <div className={styles.sheetActions}>
          <Button type="button" size="sm" variant="secondary" onClick={handleAddRow} disabled={!activeSheetId}>Adicionar linha</Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleAddColumn} disabled={!activeSheetId}>Adicionar coluna</Button>
        </div>
        <span className={styles.sheetStatus}>{rows.length} linhas · {columns.length} colunas</span>
      </div>

      {loading ? <div className="workspace-state-box">Carregando planilha...</div> : null}
      {!loading && !activeSheet ? <WorkspaceEmptyState title="Nenhuma planilha" description="Crie uma planilha para iniciar a reconstrução limpa do grid." /> : null}

      {!loading && activeSheet ? (
        <div className={styles.sheetScroll}>
          <table className={styles.sheetGrid}>
            <thead>
              <tr>
                <th>#</th>
                {columns.map((column) => (
                  <th key={column.key} style={columnWidth(column)}>
                    <button type="button" className={styles.cellButton} onDoubleClick={() => requestDeleteColumn(column)} title="Duplo clique para excluir com confirmação">
                      {column.label || column.key}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.id || rowIndex}>
                  <td>
                    <button type="button" className={styles.cellButton} onDoubleClick={() => requestDeleteRow(row)} title="Duplo clique para excluir com confirmação">
                      {row.position || rowIndex + 1}
                    </button>
                  </td>
                  {columns.map((column, colIndex) => {
                    const isEditing = editing?.rowIndex === rowIndex && editing?.columnKey === column.key;
                    return (
                      <td key={column.key} style={columnWidth(column)}>
                        {isEditing ? (
                          <input
                            autoFocus
                            className={styles.cellInput}
                            value={draft}
                            onBlur={saveEditing}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={handleCellKeyDown}
                            onPaste={(event) => handlePaste(event, rowIndex, colIndex)}
                          />
                        ) : (
                          <button type="button" className={styles.cellButton} onClick={() => startEditing(rowIndex, column.key)} onPaste={(event) => handlePaste(event, rowIndex, colIndex)}>
                            {String(row[column.key] ?? '')}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
