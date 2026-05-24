import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './SpreadsheetGrid.module.css';

const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 38;
const BUFFER_ROWS = 8;
const INDEX_WIDTH = 54;

function stripText(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function getStyle(row, key) {
  return row?.__styles?.[key] || {};
}

function CellEditor({ row, column, selected, selectedGroup, rangeEdges, saving, onSelect, onChange, onCommit, onNavigate, onContextMenu, onPasteTable }) {
  const ref = useRef(null);
  const style = getStyle(row, column.key);
  const value = row?.[column.key] || '';

  useEffect(() => {
    if (!selected || !ref.current) return;
    const active = document.activeElement;
    if (active?.dataset?.cellId === `${row.id}:${column.key}`) return;
    ref.current.focus({ preventScroll: true });
  }, [column.key, row.id, selected]);

  return (
    <div
      ref={ref}
      className={styles.cell}
      data-cell-id={`${row.id}:${column.key}`}
      data-selected={selected || undefined}
      data-group={selectedGroup || undefined}
      data-saving={saving || undefined}
      data-edge-top={rangeEdges?.top || undefined}
      data-edge-bottom={rangeEdges?.bottom || undefined}
      data-edge-left={rangeEdges?.left || undefined}
      data-edge-right={rangeEdges?.right || undefined}
      role="gridcell"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      style={{
        color: style.color || undefined,
        backgroundColor: style.backgroundColor || undefined,
        fontWeight: style.bold ? 700 : undefined,
        fontStyle: style.italic ? 'italic' : undefined,
        textDecoration: [style.underline ? 'underline' : '', style.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
        textAlign: style.textAlign || undefined,
      }}
      onFocus={(event) => onSelect(row.id, column.key, event.currentTarget, false)}
      onClick={(event) => onSelect(row.id, column.key, event.currentTarget, event.shiftKey)}
      onInput={(event) => onChange(row.id, column.key, event.currentTarget.innerHTML)}
      onBlur={() => onCommit(row.id, column.key)}
      onContextMenu={(event) => onContextMenu(event, row.id, column.key)}
      onPaste={(event) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        if (text.includes('\t') || text.includes('\n')) {
          event.preventDefault();
          onPasteTable(row.id, column.key, text);
        }
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) return;
        if (event.key === 'Tab') {
          event.preventDefault();
          onCommit(row.id, column.key);
          onNavigate(row.id, column.key, 0, event.shiftKey ? -1 : 1);
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onCommit(row.id, column.key);
          onNavigate(row.id, column.key, 1, 0);
        }
        if (event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          const delta = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
          }[event.key];
          onCommit(row.id, column.key);
          onNavigate(row.id, column.key, delta[0], delta[1]);
        }
      }}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}

export default function SpreadsheetGrid({
  columns,
  rows,
  rowsLoading,
  activeCell,
  selectedCellIds,
  selectionBounds,
  selectedCount,
  savingCell,
  savingColumn,
  resizeState,
  canEdit,
  creatingRow,
  creatingColumn,
  activeSheetId,
  onAddRow,
  onAddColumn,
  onSelectCell,
  onSelectRow,
  onCellChange,
  onCellCommit,
  onNavigateCell,
  onContextMenu,
  onPasteTable,
  onColumnLabelChange,
  onColumnLabelCommit,
  onResizeStart,
  onScrollStateChange,
}) {
  const scrollerRef = useRef(null);
  const [viewport, setViewport] = useState({ top: 0, height: 520, left: 0 });

  const columnTemplate = useMemo(() => `${INDEX_WIDTH}px ${columns.map((column) => `${Math.max(5, Number(column.width || 5))}px`).join(' ')}`, [columns]);
  const totalWidth = useMemo(() => INDEX_WIDTH + columns.reduce((sum, column) => sum + Math.max(5, Number(column.width || 5)), 0), [columns]);
  const bodyHeight = rows.length * ROW_HEIGHT;

  const updateViewport = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setViewport({ top: scroller.scrollTop, height: scroller.clientHeight, left: scroller.scrollLeft });
    onScrollStateChange?.({
      x: scroller.scrollLeft > 2,
      y: scroller.scrollTop > 2,
      endX: scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2,
      endY: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
    });
  }, [onScrollStateChange]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    updateViewport();
    scroller.addEventListener('scroll', updateViewport, { passive: true });
    return () => scroller.removeEventListener('scroll', updateViewport);
  }, [updateViewport, rows.length, columns.length]);

  const onWheel = useCallback((event) => {
    if (!event.shiftKey) return;
    const scroller = scrollerRef.current;
    if (!scroller || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const maxLeft = scroller.scrollWidth - scroller.clientWidth;
    if (maxLeft <= 0) return;
    const next = Math.max(0, Math.min(maxLeft, scroller.scrollLeft + event.deltaY));
    if (next !== scroller.scrollLeft) {
      event.preventDefault();
      scroller.scrollLeft = next;
      window.requestAnimationFrame(updateViewport);
    }
  }, [updateViewport]);

  const visibleRange = useMemo(() => {
    const first = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - BUFFER_ROWS);
    const visibleCount = Math.ceil(viewport.height / ROW_HEIGHT) + BUFFER_ROWS * 2;
    const last = Math.min(rows.length, first + visibleCount);
    return { first, last };
  }, [rows.length, viewport.height, viewport.top]);

  const visibleRows = rows.slice(visibleRange.first, visibleRange.last);
  const topSpacer = visibleRange.first * ROW_HEIGHT;
  const bottomSpacer = Math.max(0, bodyHeight - topSpacer - visibleRows.length * ROW_HEIGHT);

  return (
    <div className={styles.frame} data-loading={rowsLoading || undefined}>
      <div ref={scrollerRef} className={styles.scroller} onWheel={onWheel}>
        {!activeSheetId && !rowsLoading ? (
          <div className={styles.emptyState}>
            <strong>Planilha vazia</strong>
            {canEdit ? <button type="button" onClick={onAddRow}>Criar primeira linha</button> : null}
          </div>
        ) : null}

        <div className={styles.gridCanvas} style={{ minWidth: totalWidth }}>
          <div className={styles.headerGrid} style={{ gridTemplateColumns: columnTemplate }}>
            <div className={styles.cornerCell}>#</div>
            {columns.map((column) => (
              <div
                key={column.key}
                className={styles.headerCell}
                data-active={activeCell?.key === column.key || undefined}
                data-saving={savingColumn === column.key || undefined}
                data-resizing={resizeState?.key === column.key || undefined}
                onContextMenu={(event) => onContextMenu(event, null, column.key)}
              >
                {canEdit ? (
                  <input
                    value={column.label || ''}
                    onChange={(event) => onColumnLabelChange(column.key, event.target.value)}
                    onBlur={() => onColumnLabelCommit(column.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                    }}
                    aria-label={`Nome da ${column.label || 'coluna'}`}
                  />
                ) : <span>{column.label}</span>}
                {canEdit ? <button type="button" className={styles.resizeHandle} onPointerDown={(event) => onResizeStart(event, column.key)} aria-label={`Redimensionar ${column.label}`} /> : null}
              </div>
            ))}
          </div>

          <div className={styles.bodyCanvas} style={{ height: bodyHeight || ROW_HEIGHT }}>
            <div style={{ height: topSpacer }} />
            {rowsLoading ? <div className={styles.loadingState}>Carregando...</div> : null}
            {!rowsLoading && rows.length === 0 && activeSheetId ? (
              <div className={styles.emptyState}>
                <strong>Sem registros</strong>
                {canEdit ? (
                  <div className={styles.emptyActions}>
                    <button type="button" onClick={onAddRow} disabled={creatingRow}>Nova linha</button>
                    <button type="button" onClick={onAddColumn} disabled={creatingColumn}>Nova coluna</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {visibleRows.map((row, visibleIndex) => {
              const rowIndex = visibleRange.first + visibleIndex;
              const rowActive = activeCell?.rowId === row.id;
              const rowSelected = selectionBounds && rowIndex >= selectionBounds.rowFrom && rowIndex <= selectionBounds.rowTo && selectedCount > 1;
              return (
                <div key={row.id} className={styles.rowGrid} style={{ gridTemplateColumns: columnTemplate, height: ROW_HEIGHT }} data-active={rowActive || undefined} data-selected={rowSelected || undefined}>
                  <button type="button" className={styles.rowIndex} onClick={() => onSelectRow(row.id)} onContextMenu={(event) => onContextMenu(event, row.id, null)}>{rowIndex + 1}</button>
                  {columns.map((column, columnIndex) => {
                    const selectedGroup = selectedCellIds.has(`${row.id}:${column.key}`);
                    const rangeEdges = selectionBounds && selectedGroup ? {
                      top: rowIndex === selectionBounds.rowFrom,
                      bottom: rowIndex === selectionBounds.rowTo,
                      left: columnIndex === selectionBounds.columnFrom,
                      right: columnIndex === selectionBounds.columnTo,
                    } : null;
                    return (
                      <CellEditor
                        key={column.key}
                        row={row}
                        column={column}
                        selected={activeCell?.rowId === row.id && activeCell?.key === column.key}
                        selectedGroup={selectedGroup}
                        rangeEdges={rangeEdges}
                        saving={savingCell === `${row.id}:${column.key}` || savingCell === 'bulk-selection'}
                        onSelect={onSelectCell}
                        onChange={onCellChange}
                        onCommit={onCellCommit}
                        onNavigate={onNavigateCell}
                        onContextMenu={onContextMenu}
                        onPasteTable={onPasteTable}
                      />
                    );
                  })}
                </div>
              );
            })}
            <div style={{ height: bottomSpacer }} />
          </div>
        </div>
      </div>
    </div>
  );
}
