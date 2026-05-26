import { columnWidth } from './spreadsheetUtils.js';
import styles from '../WorkspaceApp.module.css';

export default function SpreadsheetGrid({
  columns = [],
  rows = [],
  editing,
  selectedCell,
  draft,
  onDraftChange,
  onSelectCell,
  onStartEditing,
  onSaveEditing,
  onCellKeyDown,
  onPaste,
  onRenameColumn,
  onDeleteColumn,
  onDeleteRow,
  onColumnResizeStart,
  onOpenContextMenu,
}) {
  return (
    <div className={styles.sheetScroll}>
      <table className={styles.sheetGrid}>
        <thead>
          <tr>
            <th>#</th>
            {columns.map((column, colIndex) => (
              <th
                key={column.key}
                style={columnWidth(column)}
                onContextMenu={(event) => onOpenContextMenu(event, { type: 'column', column, colIndex })}
              >
                <div className={styles.columnHeader}>
                  <input
                    className={styles.columnNameInput}
                    defaultValue={column.label || column.key}
                    onBlur={(event) => onRenameColumn(column, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                    aria-label={`Nome da coluna ${column.label || column.key}`}
                  />
                  <button type="button" className={styles.headerAction} onClick={() => onDeleteColumn(column)} aria-label={`Excluir coluna ${column.label || column.key}`}>×</button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    className={styles.resizeHandle}
                    onMouseDown={(event) => onColumnResizeStart(event, column)}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || rowIndex}>
              <td onContextMenu={(event) => onOpenContextMenu(event, { type: 'row', row, rowIndex })}>
                <div className={styles.rowHeader}>
                  <span className={styles.rowNumber}>{row.position || rowIndex + 1}</span>
                  <button type="button" className={styles.headerAction} onClick={() => onDeleteRow(row)} aria-label={`Excluir linha ${row.position || rowIndex + 1}`}>×</button>
                </div>
              </td>
              {columns.map((column, colIndex) => {
                const isEditing = editing?.rowIndex === rowIndex && editing?.columnKey === column.key;
                const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.colIndex === colIndex;
                return (
                  <td
                    key={column.key}
                    style={columnWidth(column)}
                    onContextMenu={(event) => onOpenContextMenu(event, { type: 'cell', row, column, rowIndex, colIndex })}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        className={styles.cellInput}
                        value={draft}
                        onBlur={onSaveEditing}
                        onChange={(event) => onDraftChange(event.target.value)}
                        onKeyDown={onCellKeyDown}
                        onPaste={(event) => onPaste(event, rowIndex, colIndex)}
                      />
                    ) : (
                      <button
                        type="button"
                        className={styles.cellButton}
                        data-active={isSelected}
                        onClick={() => onSelectCell(rowIndex, colIndex)}
                        onDoubleClick={() => onStartEditing(rowIndex, column.key, colIndex)}
                        onKeyDown={(event) => onCellKeyDown(event, rowIndex, colIndex)}
                        onPaste={(event) => onPaste(event, rowIndex, colIndex)}
                      >
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
  );
}
