import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './SpreadsheetGrid.module.css';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 36;
const INDEX_WIDTH = 52;
const BUFFER_ROWS = 14;
const BUFFER_COLUMNS = 4;

function stripText(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/<\/?span[^>]*>?/gi, ' ')
    .replace(/<\/?strong[^>]*>?/gi, ' ')
    .replace(/<\/?b[^>]*>?/gi, ' ')
    .replace(/<\/?i[^>]*>?/gi, ' ')
    .replace(/<\/?u[^>]*>?/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getStyle(row, key) {
  return row?.__styles?.[key] || {};
}

function resolveCellFontSize(value = '') {
  if (value === 'small') return 'var(--fs-label)';
  if (value === 'large') return 'var(--fs-title)';
  return undefined;
}

function resolveVerticalAlign(value = '') {
  if (value === 'top') return 'flex-start';
  if (value === 'bottom') return 'flex-end';
  return undefined;
}

function normalizeRichRuns(style = {}, textLength = 0) {
  const runs = Array.isArray(style.richText) ? style.richText : [];
  return runs
    .map((run) => ({
      ...run,
      start: clamp(Number(run.start || 0), 0, textLength),
      end: clamp(Number(run.end || 0), 0, textLength),
    }))
    .filter((run) => run.end > run.start);
}

function getRunStyle(runs = [], start = 0, end = 0) {
  return runs.reduce((acc, run) => {
    if (run.start < end && run.end > start) return { ...acc, ...run };
    return acc;
  }, {});
}

function renderRichText(text = '', style = {}) {
  const value = String(text ?? '');
  const runs = normalizeRichRuns(style, value.length);
  if (!runs.length) return value;
  const boundaries = new Set([0, value.length]);
  runs.forEach((run) => {
    boundaries.add(run.start);
    boundaries.add(run.end);
  });
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const content = value.slice(start, end);
    if (!content) return null;
    const runStyle = getRunStyle(runs, start, end);
    return (
      <span
        key={`${start}-${end}`}
        style={{
          color: runStyle.color || undefined,
          fontWeight: runStyle.bold ? 700 : undefined,
          fontStyle: runStyle.italic ? 'italic' : undefined,
          textDecoration: [runStyle.underline ? 'underline' : '', runStyle.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
        }}
      >
        {content}
      </span>
    );
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function Cell({
  row,
  rowIndex,
  column,
  columnIndex,
  left,
  top,
  width,
  selected,
  active,
  saving,
  editing,
  editValue,
  displayMeta,
  formulaReference,
  canEdit,
  onSelect,
  onCellClick,
  onStartEdit,
  onEditChange,
  onCommit,
  onCancel,
  onNavigate,
  onJump,
  onContextMenu,
  onRowContextMenu,
  onColumnContextMenu,
  onPasteTable,
  onEditorSelectionChange,
  onDragSelectionStart,
  onDragSelectionMove,
}) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const value = row?.[column.key] || '';
  const rawValue = stripText(value);
  const displayValue = displayMeta?.value ?? rawValue;
  const style = getStyle(row, column.key);

  useEffect(() => {
    if (!active || editing || !ref.current) return;
    ref.current.focus({ preventScroll: true });
  }, [active, editing]);

  useEffect(() => {
    if (!editing || !editorRef.current) return;
    editorRef.current.focus({ preventScroll: true });
    editorRef.current.select();
    onEditorSelectionChange?.({ rowId: row.id, key: column.key, start: 0, end: String(editValue || '').length, value: editValue || '' });
  }, [column.key, editValue, editing, onEditorSelectionChange, row.id]);

  const reportEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onEditorSelectionChange?.({
      rowId: row.id,
      key: column.key,
      start: Number(editor.selectionStart || 0),
      end: Number(editor.selectionEnd || 0),
      value: editor.value,
    });
  };

  const handleKeyDown = (event) => {
    if (editing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        onEditorSelectionChange?.(null);
        ref.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onCommit(row.id, column.key, 1, 0);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        onCommit(row.id, column.key, 0, event.shiftKey ? -1 : 1);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      if (!canEdit) return;
      event.preventDefault();
      onStartEdit(row.id, column.key, rawValue);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      onNavigate(row.id, column.key, 0, event.shiftKey ? -1 : 1);
      return;
    }

    const deltas = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (deltas[event.key]) {
      event.preventDefault();
      const [rowDelta, columnDelta] = deltas[event.key];
      onNavigate(row.id, column.key, rowDelta, columnDelta, event.shiftKey);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onJump(row.id, column.key, {
        edge: event.key === 'Home' ? 'start' : 'end',
        axis: event.metaKey || event.ctrlKey ? 'both' : 'column',
        extendSelection: event.shiftKey,
      });
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
      data-row-id={row.id}
      data-column-key={column.key}
      data-row-index={rowIndex}
      data-column-index={columnIndex}
      data-selected={selected || undefined}
      data-active={active || undefined}
      data-saving={saving || undefined}
      data-formula={displayMeta?.isFormula || undefined}
      data-formula-error={displayMeta?.hasFormulaError || undefined}
      data-validation-error={displayMeta?.hasValidationError || undefined}
      data-formula-reference={formulaReference || undefined}
      data-editing={editing || undefined}
      data-wrap={style.wrapText || undefined}
      title={displayMeta?.validationMessage || undefined}
      role="gridcell"
      tabIndex={0}
      style={{
        left,
        top,
        width,
        height: ROW_HEIGHT,
        color: style.color || undefined,
        backgroundColor: style.backgroundColor || undefined,
        fontWeight: style.bold || style.fontWeight ? style.fontWeight || 700 : undefined,
        fontStyle: style.italic || style.fontStyle ? style.fontStyle || 'italic' : undefined,
        textDecoration: style.textDecoration || [style.underline ? 'underline' : '', style.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
        textAlign: style.textAlign || undefined,
        fontSize: resolveCellFontSize(style.fontSize),
        alignItems: resolveVerticalAlign(style.verticalAlign),
      }}
      onFocus={(event) => onSelect(row.id, column.key, event.currentTarget, false)}
      onClick={(event) => onCellClick?.(event, row.id, column.key, event.currentTarget)}
      onPointerDown={(event) => {
        if (event.button !== 0 || editing) return;
        onDragSelectionStart?.(event, row.id, column.key);
      }}
      onPointerEnter={() => onDragSelectionMove?.(row.id, column.key)}
      onDoubleClick={() => canEdit && onStartEdit(row.id, column.key, rawValue)}
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
      {!editing ? <span className={styles.cellValue}>{renderRichText(displayValue, style)}</span> : null}
      {editing ? (
        <textarea
          ref={editorRef}
          className={styles.cellEditor}
          value={editValue}
          rows={1}
          spellCheck={false}
          onChange={(event) => {
            onEditChange(event.target.value);
            window.requestAnimationFrame(reportEditorSelection);
          }}
          onSelect={reportEditorSelection}
          onMouseUp={reportEditorSelection}
          onKeyUp={reportEditorSelection}
          onBlur={() => {
            onEditorSelectionChange?.(null);
            onCommit(row.id, column.key, 0, 0, false);
          }}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const text = event.clipboardData?.getData('text/plain') || '';
            if (text.includes('\t') || text.includes('\n')) {
              event.preventDefault();
              onPasteTable(row.id, column.key, text);
              onCancel();
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
  displayValueMap,
  formulaReferenceIds,
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
  onSelectColumn,
  onSelectRowRange,
  onSelectColumnRange,
  onCellChange,
  onCellCommit,
  onFormulaDraftChange,
  onEditorSelectionChange,
  onNavigateCell,
  onJumpCell,
  onContextMenu,
  onRowContextMenu,
  onColumnContextMenu,
  onPasteTable,
  onColumnLabelChange,
  onColumnLabelCommit,
  onResizeStart,
  onScrollStateChange,
  onAutoFillSelection,
}) {
  const scrollerRef = useRef(null);
  const frameRef = useRef(null);
  const rafRef = useRef(0);
  const [viewport, setViewport] = useState({ top: 0, left: 0, width: 900, height: 520 });
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const draggingSelectionRef = useRef(false);
  const lastDragCellRef = useRef('');
  const selectionDraggedRef = useRef(false);
  const rowHeaderDragRef = useRef(null);
  const columnHeaderDragRef = useRef(null);
  const autoScrollRef = useRef(0);
  const fillDragRef = useRef(null);
  const [fillPreview, setFillPreview] = useState(null);

  const formulaReferenceSet = useMemo(() => new Set(formulaReferenceIds || []), [formulaReferenceIds]);

  const columnMetrics = useMemo(() => {
    let left = INDEX_WIDTH;
    return columns.map((column) => {
      const width = Math.max(5, Number(column.width || 160));
      const metric = { column, left, width };
      left += width;
      return metric;
    });
  }, [columns]);

  const totalWidth = useMemo(() => columnMetrics.reduce((last, metric) => metric.left + metric.width, INDEX_WIDTH), [columnMetrics]);
  const totalHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;

  const visibleRows = useMemo(() => {
    const first = clamp(Math.floor(Math.max(0, viewport.top - HEADER_HEIGHT) / ROW_HEIGHT) - BUFFER_ROWS, 0, rows.length);
    const last = clamp(Math.ceil((Math.max(0, viewport.top - HEADER_HEIGHT) + viewport.height) / ROW_HEIGHT) + BUFFER_ROWS, first, rows.length);
    return rows.slice(first, last).map((row, index) => ({ row, index: first + index, top: HEADER_HEIGHT + (first + index) * ROW_HEIGHT }));
  }, [rows, viewport.height, viewport.top]);

  const visibleColumns = useMemo(() => {
    const leftEdge = viewport.left;
    const rightEdge = viewport.left + viewport.width;
    const firstVisible = columnMetrics.findIndex((metric) => metric.left + metric.width >= leftEdge - 240);
    const start = Math.max(0, (firstVisible < 0 ? 0 : firstVisible) - BUFFER_COLUMNS);
    let end = columnMetrics.findIndex((metric) => metric.left > rightEdge + 240);
    if (end < 0) end = columnMetrics.length;
    end = Math.min(columnMetrics.length, end + BUFFER_COLUMNS);
    return columnMetrics.slice(start, end);
  }, [columnMetrics, viewport.left, viewport.width]);

  const updateViewport = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      const next = {
        top: scroller.scrollTop,
        left: scroller.scrollLeft,
        width: scroller.clientWidth,
        height: scroller.clientHeight,
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

  const getCellAtPointer = useCallback((clientX, clientY) => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;
    const rect = scroller.getBoundingClientRect();
    const x = clientX - rect.left + scroller.scrollLeft;
    const y = clientY - rect.top + scroller.scrollTop;
    if (y < HEADER_HEIGHT || x < INDEX_WIDTH) return null;
    const rowIndex = clamp(Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT), 0, rows.length - 1);
    const columnIndex = columnMetrics.findIndex((metric) => x >= metric.left && x <= metric.left + metric.width);
    const row = rows[rowIndex];
    const column = columnMetrics[columnIndex]?.column;
    if (!row || !column) return null;
    return { rowId: row.id, key: column.key, rowIndex, columnIndex };
  }, [columnMetrics, rows]);

  const buildFillPreview = useCallback((target) => {
    if (!selectionBounds || !target) return null;
    const nextBounds = {
      startRow: Math.min(selectionBounds.startRow, target.rowIndex),
      endRow: Math.max(selectionBounds.endRow, target.rowIndex),
      startColumn: Math.min(selectionBounds.startColumn, target.columnIndex),
      endColumn: Math.max(selectionBounds.endColumn, target.columnIndex),
    };
    const top = HEADER_HEIGHT + nextBounds.startRow * ROW_HEIGHT;
    const height = (nextBounds.endRow - nextBounds.startRow + 1) * ROW_HEIGHT;
    const startMetric = columnMetrics[nextBounds.startColumn];
    const endMetric = columnMetrics[nextBounds.endColumn];
    if (!startMetric || !endMetric) return null;
    return {
      bounds: nextBounds,
      target,
      rect: { top, left: startMetric.left, width: endMetric.left + endMetric.width - startMetric.left, height },
    };
  }, [columnMetrics, selectionBounds]);

  const startFillDrag = useCallback((event) => {
    if (!canEdit || !selectionBounds) return;
    event.preventDefault();
    event.stopPropagation();
    fillDragRef.current = { active: true, target: null };

    const onMove = (moveEvent) => {
      const target = getCellAtPointer(moveEvent.clientX, moveEvent.clientY);
      if (!target) return;
      const preview = buildFillPreview(target);
      fillDragRef.current = { active: true, target };
      setFillPreview(preview);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const target = fillDragRef.current?.target;
      fillDragRef.current = null;
      setFillPreview(null);
      if (target) onAutoFillSelection?.({ rowId: target.rowId, key: target.key });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, [buildFillPreview, canEdit, getCellAtPointer, onAutoFillSelection, selectionBounds]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    updateViewport();
    scroller.addEventListener('scroll', updateViewport, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', updateViewport);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [updateViewport, activeSheetId]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !activeCell?.rowId || !activeCell?.key) return;
    const rowIndex = rows.findIndex((row) => row.id === activeCell.rowId);
    const columnMetric = columnMetrics.find((metric) => metric.column.key === activeCell.key);
    if (rowIndex < 0 || !columnMetric) return;

    const cellTop = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
    const cellBottom = cellTop + ROW_HEIGHT;
    const cellLeft = columnMetric.left;
    const cellRight = cellLeft + columnMetric.width;

    if (cellTop < scroller.scrollTop + HEADER_HEIGHT) scroller.scrollTop = Math.max(0, cellTop - HEADER_HEIGHT);
    else if (cellBottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = cellBottom - scroller.clientHeight;

    if (cellLeft < scroller.scrollLeft + INDEX_WIDTH) scroller.scrollLeft = Math.max(0, cellLeft - INDEX_WIDTH);
    else if (cellRight > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = cellRight - scroller.clientWidth;
  }, [activeCell?.key, activeCell?.rowId, columnMetrics, rows]);

  const startEdit = useCallback((rowId, key, initialValue) => {
    if (!canEdit) return;
    const row = rows.find((entry) => entry.id === rowId);
    const nextValue = initialValue ?? stripText(row?.[key] || '');
    setEditingCell({ rowId, key });
    setEditingValue(nextValue);
    onFormulaDraftChange?.(nextValue);
  }, [canEdit, onFormulaDraftChange, rows]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const commitEdit = useCallback(async (rowId, key, rowDelta = 0, columnDelta = 0, navigateAfter = true) => {
    onCellChange(rowId, key, editingValue);
    setEditingCell(null);
    setEditingValue('');
    await onCellCommit(rowId, key);
    if (navigateAfter && (rowDelta || columnDelta)) onNavigateCell(rowId, key, rowDelta, columnDelta);
  }, [editingValue, onCellChange, onCellCommit, onNavigateCell]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    const onWheel = (event) => {
      if (!event.shiftKey) return;
      const amount = event.deltaY || event.deltaX;
      if (!amount) return;
      event.preventDefault();
      scroller.scrollLeft += amount;
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);


  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) window.cancelAnimationFrame(autoScrollRef.current);
    autoScrollRef.current = 0;
  }, []);

  const autoScrollWhileSelecting = useCallback((clientX, clientY) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const edge = 44;
    const horizontal = clientX > rect.right - edge ? 18 : clientX < rect.left + edge ? -18 : 0;
    const vertical = clientY > rect.bottom - edge ? 18 : clientY < rect.top + edge ? -18 : 0;
    stopAutoScroll();
    if (!horizontal && !vertical) return;
    const tick = () => {
      scroller.scrollLeft += horizontal;
      scroller.scrollTop += vertical;
      autoScrollRef.current = window.requestAnimationFrame(tick);
    };
    autoScrollRef.current = window.requestAnimationFrame(tick);
  }, [stopAutoScroll]);

  const startDragSelection = useCallback((event, rowId, key) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    draggingSelectionRef.current = true;
    lastDragCellRef.current = `${rowId}:${key}`;
    selectionDraggedRef.current = false;
    onSelectCell(rowId, key, event.currentTarget, false);
    const onMove = (moveEvent) => autoScrollWhileSelecting(moveEvent.clientX, moveEvent.clientY);
    const finish = () => {
      draggingSelectionRef.current = false;
      lastDragCellRef.current = '';
      stopAutoScroll();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }, [autoScrollWhileSelecting, onSelectCell, stopAutoScroll]);

  const moveDragSelection = useCallback((rowId, key) => {
    if (!draggingSelectionRef.current) return;
    const nextId = `${rowId}:${key}`;
    if (lastDragCellRef.current === nextId) return;
    lastDragCellRef.current = nextId;
    selectionDraggedRef.current = true;
    onSelectCell(rowId, key, null, true);
  }, [onSelectCell]);

  const handleCellClick = useCallback((event, rowId, key, element) => {
    if (selectionDraggedRef.current) {
      selectionDraggedRef.current = false;
      return;
    }
    onSelectCell(rowId, key, element, event.shiftKey);
  }, [onSelectCell]);


  const startRowHeaderDrag = useCallback((event, rowId) => {
    if (event.button !== 0) return;
    rowHeaderDragRef.current = { anchorRowId: rowId };
    onSelectRow?.(rowId);
    const onMove = (moveEvent) => autoScrollWhileSelecting(moveEvent.clientX, moveEvent.clientY);
    const finish = () => {
      rowHeaderDragRef.current = null;
      stopAutoScroll();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }, [autoScrollWhileSelecting, onSelectRow, stopAutoScroll]);

  const moveRowHeaderDrag = useCallback((rowId) => {
    if (!rowHeaderDragRef.current?.anchorRowId) return;
    onSelectRowRange?.(rowHeaderDragRef.current.anchorRowId, rowId);
  }, [onSelectRowRange]);

  const startColumnHeaderDrag = useCallback((event, key) => {
    if (event.button !== 0) return;
    columnHeaderDragRef.current = { anchorKey: key };
    onSelectColumn?.(key);
    const onMove = (moveEvent) => autoScrollWhileSelecting(moveEvent.clientX, moveEvent.clientY);
    const finish = () => {
      columnHeaderDragRef.current = null;
      stopAutoScroll();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }, [autoScrollWhileSelecting, onSelectColumn, stopAutoScroll]);

  const moveColumnHeaderDrag = useCallback((key) => {
    if (!columnHeaderDragRef.current?.anchorKey) return;
    onSelectColumnRange?.(columnHeaderDragRef.current.anchorKey, key);
  }, [onSelectColumnRange]);

  const selectionRect = useMemo(() => {
    if (!selectionBounds) return null;
    const top = HEADER_HEIGHT + selectionBounds.startRow * ROW_HEIGHT;
    const height = (selectionBounds.endRow - selectionBounds.startRow + 1) * ROW_HEIGHT;
    const startMetric = columnMetrics[selectionBounds.startColumn];
    const endMetric = columnMetrics[selectionBounds.endColumn];
    if (!startMetric || !endMetric) return null;
    return { top, left: startMetric.left, width: endMetric.left + endMetric.width - startMetric.left, height };
  }, [columnMetrics, selectionBounds]);

  const handleGridContextMenuCapture = useCallback((event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const rowHeader = target.closest('[data-row-header="true"]');
    if (rowHeader?.dataset?.rowId) {
      event.preventDefault();
      event.stopPropagation();
      onRowContextMenu?.(event, rowHeader.dataset.rowId);
      return;
    }

    const columnHeader = target.closest('[data-column-header="true"]');
    if (columnHeader?.dataset?.columnKey) {
      event.preventDefault();
      event.stopPropagation();
      onColumnContextMenu?.(event, columnHeader.dataset.columnKey);
      return;
    }

    const cell = target.closest('[data-cell-id]');
    if (cell?.dataset?.rowId && cell?.dataset?.columnKey) {
      event.preventDefault();
      event.stopPropagation();
      onContextMenu?.(event, cell.dataset.rowId, cell.dataset.columnKey);
    }
  }, [onColumnContextMenu, onContextMenu, onRowContextMenu]);

  return (
    <div ref={frameRef} className={styles.frame}>
      <div ref={scrollerRef} className={styles.scroller} data-scrolled-x={viewport.left > 2 || undefined} data-scrolled-y={viewport.top > 2 || undefined} onContextMenuCapture={handleGridContextMenuCapture}>
        <div className={styles.canvas} style={{ width: totalWidth, height: Math.max(totalHeight, viewport.height) }}>
          <div className={styles.header} style={{ width: totalWidth, height: HEADER_HEIGHT }}>
            <div className={styles.corner} style={{ left: viewport.left, width: INDEX_WIDTH, height: HEADER_HEIGHT }} />
            {visibleColumns.map(({ column, left, width }) => (
              <div
                key={column.key}
                className={styles.headerCell}
                data-column-header="true"
                data-column-key={column.key}
                data-active={activeCell?.key === column.key || undefined}
                data-saving={savingColumn === column.key || undefined}
                style={{ left, width, height: HEADER_HEIGHT }}
                onClick={(event) => {
                  if (event.target?.tagName === 'INPUT' || event.target?.className?.includes?.('resizeHandle')) return;
                  onSelectColumn?.(column.key);
                }}
                onPointerDown={(event) => {
                  if (event.target?.tagName === 'INPUT' || event.target?.className?.includes?.('resizeHandle') || event.target?.className?.includes?.('headerMenu')) return;
                  startColumnHeaderDrag(event, column.key);
                }}
                onPointerEnter={() => moveColumnHeaderDrag(column.key)}
                onContextMenu={(event) => onColumnContextMenu?.(event, column.key)}
              >
                <input
                  value={column.label}
                  disabled={!canEdit}
                  onChange={(event) => onColumnLabelChange(column.key, event.target.value)}
                  onBlur={() => onColumnLabelCommit(column.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  className={styles.headerMenu}
                  aria-label={`Abrir menu da coluna ${column.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onColumnContextMenu?.(event, column.key);
                  }}
                >
                  ⋯
                </button>
                <button
                  type="button"
                  className={styles.resizeHandle}
                  aria-label={`Redimensionar ${column.label}`}
                  onPointerDown={(event) => canEdit && onResizeStart(event, column.key)}
                />
              </div>
            ))}
          </div>

          {visibleRows.map(({ row, index, top }) => (
            <button
              key={row.id}
              type="button"
              className={styles.rowIndex}
              data-row-header="true"
              data-row-id={row.id}
              data-active={activeCell?.rowId === row.id || undefined}
              style={{ left: viewport.left, top, width: INDEX_WIDTH, height: ROW_HEIGHT }}
              onClick={() => onSelectRow(row.id)}
              onPointerDown={(event) => startRowHeaderDrag(event, row.id)}
              onPointerEnter={() => moveRowHeaderDrag(row.id)}
              onContextMenu={(event) => onRowContextMenu?.(event, row.id)}
            >
              <span>{index + 1}</span>
              <em
                role="button"
                tabIndex={-1}
                aria-label={`Abrir menu da linha ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRowContextMenu?.(event, row.id);
                }}
              >
                ⋯
              </em>
            </button>
          ))}

          {visibleRows.map(({ row, index: rowIndex, top }) => (
            visibleColumns.map(({ column, left, width }, columnIndex) => {
              const id = `${row.id}:${column.key}`;
              const active = activeCell?.rowId === row.id && activeCell?.key === column.key;
              const editing = editingCell?.rowId === row.id && editingCell?.key === column.key;
              return (
                <Cell
                  key={id}
                  row={row}
                  rowIndex={rowIndex}
                  column={column}
                  columnIndex={columnIndex}
                  left={left}
                  top={top}
                  width={width}
                  selected={selectedCellIds?.has(id)}
                  active={active}
                  saving={savingCell === id}
                  editing={editing}
                  editValue={editingValue}
                  displayMeta={displayValueMap?.get(id)}
                  formulaReference={formulaReferenceSet.has(id)}
                  canEdit={canEdit}
                  onSelect={onSelectCell}
                  onCellClick={handleCellClick}
                  onStartEdit={startEdit}
                  onEditChange={(value) => {
                    setEditingValue(value);
                    onFormulaDraftChange?.(value);
                  }}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  onNavigate={onNavigateCell}
                  onJump={onJumpCell}
                  onContextMenu={onContextMenu}
                  onPasteTable={onPasteTable}
                  onEditorSelectionChange={onEditorSelectionChange}
                  onDragSelectionStart={startDragSelection}
                  onDragSelectionMove={moveDragSelection}
                />
              );
            })
          ))}

          {selectionRect && selectedCount > 1 ? (
            <div className={styles.selectionLayer} style={selectionRect}>
              {canEdit ? (
                <button
                  type="button"
                  className={styles.fillHandle}
                  aria-label="Preencher seleção"
                  onPointerDown={startFillDrag}
                />
              ) : null}
            </div>
          ) : null}

          {fillPreview?.rect ? (
            <div className={styles.fillPreview} style={fillPreview.rect} />
          ) : null}

          {resizeState ? (
            <div className={styles.resizeGuide} style={{ left: resizeState.left }}>
              <span>{resizeState.label}: {resizeState.width}px</span>
            </div>
          ) : null}

          {!rows.length && !rowsLoading ? (
            <div className={styles.emptyState}>
              <span>Planilha vazia</span>
              <button type="button" onClick={onAddRow} disabled={!canEdit || creatingRow}>Criar linha</button>
              <button type="button" onClick={onAddColumn} disabled={!canEdit || creatingColumn}>Criar coluna</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
