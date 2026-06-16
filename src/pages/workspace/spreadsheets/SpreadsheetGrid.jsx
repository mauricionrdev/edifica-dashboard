import styles from '../WorkspaceApp.module.css';
import { columnWidth, isCellInRange, isColumnSelected, isRowSelected } from './spreadsheetUtils.js';

export default function SpreadsheetGrid({
  columns,
  rows,
  editing,
  selectedCell,
  selectedRange,
  draft,
  onDraftChange,
  onSelectCell,
  onSelectRow,
  onSelectColumn,
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
            <th aria-hidden="true" />
            {columns.map((column, colIndex) => {
              const columnSelected = isColumnSelected(selectedRange, colIndex, rows.length);
              return (
                <th
                  key={column.key}
                  style={columnWidth(column)}
                  data-selected={columnSelected ? 'true' : undefined}
                  onContextMenu={(event) => onOpenContextMenu(event, { type: 'column', column, colIndex })}
                >
                  <div className={styles.columnHeader}>
                    <button
                      type="button"
                      className={styles.columnSelector}
                      data-active={columnSelected ? 'true' : undefined}
                      onClick={() => onSelectColumn(colIndex)}
                      aria-label={`Selecionar coluna ${column.label || column.key}`}
                    >
                      {column.label || column.key}
                    </button>
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
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowSelected = isRowSelected(selectedRange, rowIndex, columns.length);
            return (
              <tr key={row.id || rowIndex} data-selected={rowSelected ? 'true' : undefined}>
                <td data-selected={rowSelected ? 'true' : undefined} onContextMenu={(event) => onOpenContextMenu(event, { type: 'row', row, rowIndex })}>
                  <div className={styles.rowHeader}>
                    <button
                      type="button"
                      className={styles.rowSelector}
                      data-active={rowSelected ? 'true' : undefined}
                      onClick={() => onSelectRow(rowIndex)}
                      aria-label={`Selecionar linha ${row.position || rowIndex + 1}`}
                    >
                      {row.position || rowIndex + 1}
                    </button>
                    <button type="button" className={styles.headerAction} onClick={() => onDeleteRow(row)} aria-label={`Excluir linha ${row.position || rowIndex + 1}`}>×</button>
                  </div>
                </td>
                {columns.map((column, colIndex) => {
                  const isEditing = editing?.rowIndex === rowIndex && editing?.columnKey === column.key;
                  const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.colIndex === colIndex;
                  const isInRange = isCellInRange(selectedRange, rowIndex, colIndex);
                  return (
                    <td
                      key={column.key}
                      style={columnWidth(column)}
                      data-range={isInRange ? 'true' : undefined}
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
                          data-range={isInRange && !isSelected ? 'true' : undefined}
                          onClick={(event) => onSelectCell(rowIndex, colIndex, event.shiftKey)}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
