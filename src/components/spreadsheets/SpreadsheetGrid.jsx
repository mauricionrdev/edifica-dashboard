import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './SpreadsheetGrid.module.css';

const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 38;
const BUFFER_ROWS = 10;
const INDEX_WIDTH = 54;

function stripText(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function getStyle(row, key) {
  return row?.__styles?.[key] || {};
}

function CellView({ row, rowIndex, column, columnIndex, selected, selectedGroup, saving, editing, editingValue, canEdit, onSelect, onStartEdit, onEditorChange, onCommitEdit, onCancelEdit, onNavigate, onContextMenu, onPasteTable }) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const style = getStyle(row, column.key);
  const value = row?.[column.key] || '';

  useEffect(() => {
    if (!selected || editing || !ref.current) return;
    const active = document.activeElement;
    if (active?.dataset?.cellId === `${row.id}:${column.key}`) return;
    ref.current.focus({ preventScroll: true });
  }, [column.key, editing, row.id, selected]);

  useEffect(() => {
    if (!editing || !editorRef.current) return;
    editorRef.current.focus({ preventScroll: true });
    editorRef.current.select();
  }, [editing]);

  const handleKeyDown = (event) => {
    if (editing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelEdit();
        ref.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onCommitEdit(row.id, column.key, 1, 0);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        onCommitEdit(row.id, column.key, 0, event.shiftKey ? -1 : 1);
        return;
      }
      return;
    }

    if (!canEdit && ['Enter', 'F2'].includes(event.key)) return;

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      onStartEdit(row.id, column.key, stripText(value));
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      onNavigate(row.id, column.key, 0, event.shiftKey ? -1 : 1);
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const delta = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }[event.key];
      onNavigate(row.id, column.key, delta[0], delta[1]);
      return;
    }

    if (canEdit && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      onStartEdit(row.id, column.key, event.key);
    }
  };

  return (
    <div
      ref={ref}
      className={styles.cell}
      data-cell-id={`${row.id}:${column.key}`}
      data-row-index={rowIndex}
      data-column-index={columnIndex}
      data-selected={selected || undefined}
      data-group={selectedGroup || undefined}
      data-saving={saving || undefined}
      data-editing={editing || undefined}
      role="gridcell"
      tabIndex={0}
      style={{
        color: style.color || undefined,
        backgroundColor: style.backgroundColor || undefined,
        fontWeight: style.bold || style.fontWeight ? style.fontWeight || 700 : undefined,
        fontStyle: style.italic || style.fontStyle ? style.fontStyle || 'italic' : undefined,
        textDecoration: style.textDecoration || [style.underline ? 'underline' : '', style.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
        textAlign: style.textAlign || undefined,
      }}
      onFocus={(event) => onSelect(row.id, column.key, event.currentTarget, false)}
      onClick={(event) => onSelect(row.id, column.key, event.currentTarget, event.shiftKey)}
      onDoubleClick={() => canEdit && onStartEdit(row.id, column.key, stripText(value))}
      onContextMenu={(event) => onContextMenu(event, row.id, column.key)}
      onKeyDown={handleKeyDown}
      onPaste={(event) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        if (text.includes('\t') || text.includes('\n')) {
          event.preventDefault();
          onPasteTable(row.id, column.key, text);
        }
      }}
    >
      <span className={styles.cellValue} dangerouslySetInnerHTML={{ __html: value || '' }} />
      {editing ? (
        <textarea
          ref={editorRef}
          className={styles.cellEditor}
          value={editingValue}
          rows={1}
          spellCheck={false}
          onChange={(event) => onEditorChange(event.target.value)}
          onBlur={() => onCommitEdit(row.id, column.key, 0, 0, false)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const text = event.clipboardData?.getData('text/plain') || '';
            if (text.includes('\t') || text.includes('\n')) {
              event.preventDefault();
              onPasteTable(row.id, column.key, text);
              onCancelEdit();
            }
          }}
        />
      ) : null}
    </div>
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
  const animationFrameRef = useRef(0);
  const [viewport, setViewport] = useState({ top: 0, height: 520, left: 0, width: 900 });
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const columnTemplate = useMemo(() => `${INDEX_WIDTH}px ${columns.map((column) => `${Math.max(5, Number(column.width || 5))}px`).join(' ')}`, [columns]);
  const columnOffsets = useMemo(() => {
    let current = INDEX_WIDTH;
    return columns.map((column) => {
      const width = Math.max(5, Number(column.width || 5));
      const offset = { key: column.key, left: current, width };
      current += width;
      return offset;
    });
  }, [columns]);
  const totalWidth = useMemo(() => INDEX_WIDTH + columns.reduce((sum, column) => sum + Math.max(5, Number(column.width || 5)), 0), [columns]);
  const bodyHeight = rows.length * ROW_HEIGHT;

  const updateViewport = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = window.requestAnimationFrame(() => {
      const next = {
        top: scroller.scrollTop,
        height: scroller.clientHeight,
        left: scroller.scrollLeft,
        width: scroller.clientWidth,
      };
      setViewport(next);
      onScrollStateChange?.({
        x: next.left > 2,
        y: next.top > 2,
        endX: next.left + next.width >= scroller.scrollWidth - 2,
        endY: next.top + next.height >= scroller.scrollHeight - 2,
      });
    });
  }, [onScrollStateChange]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    updateViewport();
    scroller.addEventListener('scroll', updateViewport, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', updateViewport);
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    };
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
      updateViewport();
    }
  }, [updateViewport]);

  const visibleRange = useMemo(() => {
    const first = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - BUFFER_ROWS);
    const visibleCount = Math.ceil(viewport.height / ROW_HEIGHT) + BUFFER_ROWS * 2;
    const last = Math.min(rows.length, first + visibleCount);
    return { first, last };
  }, [rows.length, viewport.height, viewport.top]);

  const visibleColumnRange = useMemo(() => {
    const leftLimit = Math.max(0, viewport.left - 220);
    const rightLimit = viewport.left + viewport.width + 220;
    const first = Math.max(0, columnOffsets.findIndex((item) => item.left + item.width >= leftLimit));
    const lastRaw = columnOffsets.findIndex((item) => item.left > rightLimit);
    const last = lastRaw === -1 ? columns.length : Math.min(columns.length, lastRaw + 1);
    return { first, last };
  }, [columnOffsets, columns.length, viewport.left, viewport.width]);

  const visibleRows = rows.slice(visibleRange.first, visibleRange.last);
  const visibleColumns = columns.slice(visibleColumnRange.first, visibleColumnRange.last);
  const topSpacer = visibleRange.first * ROW_HEIGHT;
  const bottomSpacer = Math.max(0, bodyHeight - topSpacer - visibleRows.length * ROW_HEIGHT);

  const activeRect = useMemo(() => {
    if (!activeCell) return null;
    const rowIndex = rows.findIndex((row) => row.id === activeCell.rowId);
    const columnIndex = columns.findIndex((column) => column.key === activeCell.key);
    const columnMeta = columnOffsets[columnIndex];
    if (rowIndex < 0 || !columnMeta) return null;
    return {
      top: HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
      left: columnMeta.left,
      width: columnMeta.width,
      height: ROW_HEIGHT,
    };
  }, [activeCell, columnOffsets, columns, rows]);

  const selectionRect = useMemo(() => {
    if (!selectionBounds || selectedCount <= 1) return null;
    const startColumn = columnOffsets[selectionBounds.columnFrom];
    const endColumn = columnOffsets[selectionBounds.columnTo];
    if (!startColumn || !endColumn) return null;
    return {
      top: HEADER_HEIGHT + selectionBounds.rowFrom * ROW_HEIGHT,
      left: startColumn.left,
      width: endColumn.left + endColumn.width - startColumn.left,
      height: (selectionBounds.rowTo - selectionBounds.rowFrom + 1) * ROW_HEIGHT,
    };
  }, [columnOffsets, selectedCount, selectionBounds]);

  const resizeRect = useMemo(() => {
    if (!resizeState?.key) return null;
    const columnMeta = columnOffsets.find((item) => item.key === resizeState.key);
    if (!columnMeta) return null;
    return {
      left: columnMeta.left + columnMeta.width,
      label: `${resizeState.label || 'Coluna'} · ${resizeState.width || Math.round(columnMeta.width)}px`,
    };
  }, [columnOffsets, resizeState]);

  const startEdit = useCallback((rowId, key, value) => {
    if (!canEdit) return;
    setEditingCell({ rowId, key });
    setEditingValue(value);
  }, [canEdit]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const commitEdit = useCallback((rowId, key, rowDelta = 0, columnDelta = 0, navigate = true) => {
    if (!editingCell || editingCell.rowId !== rowId || editingCell.key !== key) return;
    onCellChange(rowId, key, escapeHtml(editingValue));
    window.requestAnimationFrame(() => {
      onCellCommit(rowId, key);
      if (navigate && (rowDelta !== 0 || columnDelta !== 0)) onNavigateCell(rowId, key, rowDelta, columnDelta);
    });
    cancelEdit();
  }, [cancelEdit, editingCell, editingValue, onCellChange, onCellCommit, onNavigateCell]);

  useEffect(() => {
    if (!activeCell) return;
    const rowIndex = rows.findIndex((row) => row.id === activeCell.rowId);
    const columnIndex = columns.findIndex((column) => column.key === activeCell.key);
    if (rowIndex < 0 || columnIndex < 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const columnMeta = columnOffsets[columnIndex];
    const rowTop = rowIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const columnLeft = columnMeta.left;
    const columnRight = columnMeta.left + columnMeta.width;

    let nextTop = scroller.scrollTop;
    let nextLeft = scroller.scrollLeft;
    if (rowTop < scroller.scrollTop) nextTop = rowTop;
    if (rowBottom > scroller.scrollTop + scroller.clientHeight) nextTop = rowBottom - scroller.clientHeight;
    if (columnLeft < scroller.scrollLeft + INDEX_WIDTH) nextLeft = Math.max(0, columnLeft - INDEX_WIDTH);
    if (columnRight > scroller.scrollLeft + scroller.clientWidth) nextLeft = columnRight - scroller.clientWidth + 12;
    if (nextTop !== scroller.scrollTop || nextLeft !== scroller.scrollLeft) scroller.scrollTo({ top: nextTop, left: nextLeft, behavior: 'auto' });
  }, [activeCell, columnOffsets, columns, rows]);

  return (
    <div className={styles.frame} data-loading={rowsLoading || undefined} data-editing={!!editingCell || undefined}>
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
                  {visibleColumnRange.first > 0 ? <div className={styles.columnGap} style={{ gridColumn: `2 / ${visibleColumnRange.first + 2}` }} aria-hidden="true" /> : null}
                  {visibleColumns.map((column, offsetIndex) => {
                    const columnIndex = visibleColumnRange.first + offsetIndex;
                    const selectedGroup = selectedCellIds.has(`${row.id}:${column.key}`);
                    return (
                      <CellView
                        key={column.key}
                        row={row}
                        rowIndex={rowIndex}
                        column={column}
                        columnIndex={columnIndex}
                        selected={activeCell?.rowId === row.id && activeCell?.key === column.key}
                        selectedGroup={selectedGroup}
                        saving={savingCell === `${row.id}:${column.key}` || savingCell === 'bulk-selection'}
                        editing={editingCell?.rowId === row.id && editingCell?.key === column.key}
                        editingValue={editingValue}
                        canEdit={canEdit}
                        onSelect={onSelectCell}
                        onStartEdit={startEdit}
                        onEditorChange={setEditingValue}
                        onCommitEdit={commitEdit}
                        onCancelEdit={cancelEdit}
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

          <div className={styles.overlayLayer} aria-hidden="true">
            {selectionRect ? (
              <div
                className={styles.selectionOverlay}
                style={{
                  transform: `translate3d(${selectionRect.left}px, ${selectionRect.top}px, 0)`,
                  width: selectionRect.width,
                  height: selectionRect.height,
                }}
              />
            ) : null}
            {activeRect ? (
              <div
                className={styles.activeOverlay}
                style={{
                  transform: `translate3d(${activeRect.left}px, ${activeRect.top}px, 0)`,
                  width: activeRect.width,
                  height: activeRect.height,
                }}
              >
                <span />
              </div>
            ) : null}
            {resizeRect ? (
              <div className={styles.resizeOverlay} style={{ transform: `translate3d(${resizeRect.left}px, 0, 0)` }}>
                <span>{resizeRect.label}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
