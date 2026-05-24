import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import { CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../ui/Icons.jsx';
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
} from '../../api/support.js';
import styles from './UserSpreadsheetPanel.module.css';

const BLANK_COLUMN_WIDTH = 168;
const BLANK_ROW_HEIGHT = 44;
const BLANK_MIN_COLUMNS = 6;
const BLANK_MIN_ROWS = 14;
const MIN_COLUMN_WIDTH = 5;
const COMPACT_COLUMN_WIDTH = 72;

const TEXT_COLORS = [
  '#ffffff', '#f8fafc', '#e5e7eb', '#cbd5e1', '#94a3b8', '#64748b',
  '#22c55e', '#86efac', '#84cc16', '#bef264', '#facc15', '#fde68a',
  '#fb923c', '#fdba74', '#ef4444', '#fca5a5', '#fb7185', '#f9a8d4',
  '#c084fc', '#ddd6fe', '#818cf8', '#a5b4fc', '#60a5fa', '#93c5fd',
  '#22d3ee', '#67e8f9', '#2dd4bf', '#5eead4', '#d6d3d1', '#a8a29e',
];

const FILL_COLORS = [
  'transparent', '#020617', '#08090a', '#0f172a', '#111827', '#1f2937',
  '#052e16', '#064e3b', '#16310d', '#365314', '#422006', '#713f12',
  '#431407', '#7c2d12', '#450a0a', '#7f1d1d', '#4a044e', '#831843',
  '#2e1065', '#4c1d95', '#1e1b4b', '#312e81', '#172554', '#1e3a8a',
  '#083344', '#155e75', '#042f2e', '#115e59', '#292524', '#44403c',
];

const FORMAT_GROUPS = [
  {
    title: 'Texto',
    commands: [
      ['formatBlock', 'Texto normal', 'P'],
      ['formatBlock', 'Título', 'H3'],
      ['removeFormat', 'Limpar formatação'],
    ],
  },
  {
    title: 'Estrutura',
    commands: [
      ['insertUnorderedList', 'Lista com marcadores'],
      ['insertOrderedList', 'Lista numerada'],
      ['indent', 'Aumentar recuo'],
      ['outdent', 'Diminuir recuo'],
    ],
  },
  {
    title: 'Edição',
    commands: [
      ['undo', 'Desfazer'],
      ['redo', 'Refazer'],
      ['selectAll', 'Selecionar célula'],
    ],
  },
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function stripHtml(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function parseClipboardTable(text = '') {
  const source = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = source.endsWith('\n') ? source.slice(0, -1) : source;
  return trimmed
    .split('\n')
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((line, index, lines) => line.some(Boolean) || index < lines.length - 1);
}

function detectDelimitedSeparator(text = '') {
  const sample = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .find((line) => line.trim()) || '';
  const candidates = ['\t', ';', ','].map((separator) => ({
    separator,
    count: sample.split(separator).length - 1,
  }));
  const best = candidates.sort((a, b) => b.count - a.count)[0];
  return best?.count > 0 ? best.separator : '\t';
}

function resolveDelimitedSeparator(delimiter = 'auto', text = '') {
  if (delimiter === 'tab') return '\t';
  if (delimiter === 'semicolon') return ';';
  if (delimiter === 'comma') return ',';
  return detectDelimitedSeparator(text);
}

function parseDelimitedText(text = '', delimiter = 'auto') {
  const source = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = source.endsWith('\n') ? source.slice(0, -1) : source;
  if (!trimmed.trim()) return [];

  const separator = resolveDelimitedSeparator(delimiter, trimmed);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    const next = trimmed[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === separator) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (!quoted && char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  rows.push(row);
  return rows.filter((line, index, list) => line.some(Boolean) || index < list.length - 1);
}

function serializeTable(rows = []) {
  return rows.map((row) => row.map((cell) => String(cell ?? '').replace(/\r?\n/g, ' ')).join('\t')).join('\n');
}

function escapeCsvCell(value = '') {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeSheetToCsv(rows = [], columns = []) {
  const header = columns.map((column) => escapeCsvCell(column.label || 'Coluna')).join(';');
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(stripHtml(row?.[column.key] || ''))).join(';'));
  return [header, ...body].join('\n');
}

function safeFileName(value = 'planilha') {
  return String(value || 'planilha')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'planilha';
}

function downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function normalizeColumns(columns = []) {
  return (Array.isArray(columns) ? columns : []).map((column) => ({
    key: column.key,
    label: column.label || 'Coluna',
    width: Math.max(5, Number(column.width || 180)),
    system: column.system !== false,
  })).filter((column) => column.key);
}

function normalizeRow(row = {}, columns = []) {
  const base = columns.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {});
  return {
    id: row?.id || '',
    position: Number(row?.position || 0),
    ...base,
    __styles: row?.__styles && typeof row.__styles === 'object' ? row.__styles : {},
  };
}

function cellId(rowId, key) {
  return `${rowId}:${key}`;
}

function rangeCells(rows = [], columns = [], selection = null) {
  if (!selection?.start || !selection?.end) return [];
  const startRow = rows.findIndex((row) => row.id === selection.start.rowId);
  const endRow = rows.findIndex((row) => row.id === selection.end.rowId);
  const startColumn = columns.findIndex((column) => column.key === selection.start.key);
  const endColumn = columns.findIndex((column) => column.key === selection.end.key);
  if ([startRow, endRow, startColumn, endColumn].some((index) => index < 0)) return [];
  const rowFrom = Math.min(startRow, endRow);
  const rowTo = Math.max(startRow, endRow);
  const columnFrom = Math.min(startColumn, endColumn);
  const columnTo = Math.max(startColumn, endColumn);
  const cells = [];
  for (let rowIndex = rowFrom; rowIndex <= rowTo; rowIndex += 1) {
    for (let columnIndex = columnFrom; columnIndex <= columnTo; columnIndex += 1) {
      cells.push({ rowId: rows[rowIndex].id, key: columns[columnIndex].key });
    }
  }
  return cells;
}

function applyStyleCommand(style = {}, command, value = null) {
  const next = { ...(style || {}) };
  if (command === 'foreColor') next.color = value;
  if (command === 'hiliteColor') {
    if (value === 'transparent') delete next.backgroundColor;
    else next.backgroundColor = value;
  }
  if (command === 'bold') next.fontWeight = '800';
  if (command === 'italic') next.fontStyle = 'italic';
  if (command === 'underline') next.textDecoration = 'underline';
  if (command === 'strikeThrough') next.textDecoration = 'line-through';
  if (command === 'justifyLeft') next.textAlign = 'left';
  if (command === 'justifyCenter') next.textAlign = 'center';
  if (command === 'justifyRight') next.textAlign = 'right';
  if (command === 'removeFormat') return {};
  return Object.fromEntries(Object.entries(next).filter(([, styleValue]) => styleValue !== undefined && styleValue !== null && styleValue !== ''));
}

function sortByPosition(items = []) {
  return [...items].sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
}

function cloneRowPayload(row = {}, columns = []) {
  return columns.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {});
}

function cloneRowStyles(row = {}, columns = []) {
  return columns.reduce((acc, column) => {
    const style = row?.__styles?.[column.key];
    if (!style || !Object.keys(style).length) return acc;
    return { ...acc, [column.key]: style };
  }, {});
}

function toneFromContent(value = '') {
  const text = stripHtml(value).toLowerCase();
  if (text.includes('desconect') || text.includes('erro') || text.includes('inativo')) return 'danger';
  if (text.includes('pendente') || text.includes('revisar') || text.includes('ajustar')) return 'warning';
  if (text.includes('ok') || text.includes('conectado') || text.includes('ativo') || text.includes('implementado')) return 'success';
  return 'neutral';
}

function formatSyncTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
  } catch {
    return '';
  }
}

function saveSelectionInside(element) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !element) return null;
  const range = selection.getRangeAt(0);
  const owner = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!owner || !element.contains(owner)) return null;
  return range.cloneRange();
}

function restoreSelection(element, range) {
  if (!element) return;
  element.focus({ preventScroll: true });
  const selection = window.getSelection?.();
  if (!selection) return;
  selection.removeAllRanges();
  if (range) {
    selection.addRange(range);
    return;
  }
  const nextRange = document.createRange();
  nextRange.selectNodeContents(element);
  nextRange.collapse(false);
  selection.addRange(nextRange);
}

function preventToolbarBlur(event) {
  event.preventDefault();
}

function EditorButton({ disabled, title, children, onCommand }) {
  return (
    <button
      type="button"
      className={styles.editorButton}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseDown={preventToolbarBlur}
      onClick={onCommand}
    >
      {children}
    </button>
  );
}

function ColorMenu({ disabled, label, title, colors, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current?.contains(event.target)) return;
      setOpen(false);
    };
    const keyClose = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', keyClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', keyClose);
    };
  }, [open]);

  return (
    <div className={styles.colorMenuWrapper} ref={ref}>
      <button
        type="button"
        className={styles.editorButton}
        disabled={disabled}
        aria-expanded={open}
        aria-label={title}
        title={title}
        onMouseDown={preventToolbarBlur}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open ? (
        <div className={styles.colorMenu} role="menu" aria-label={title} onMouseDown={preventToolbarBlur}>
          <span className={styles.menuTitle}>{title}</span>
          <div className={styles.swatchGrid}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                style={color === 'transparent' ? undefined : { '--swatch': color }}
                data-empty={color === 'transparent' || undefined}
                aria-label={color === 'transparent' ? 'Sem fundo' : color}
                title={color === 'transparent' ? 'Sem fundo' : color}
                onMouseDown={preventToolbarBlur}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MoreMenu({ disabled, onCommand }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current?.contains(event.target)) return;
      setOpen(false);
    };
    const keyClose = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', keyClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', keyClose);
    };
  }, [open]);

  return (
    <div className={styles.moreMenuWrapper} ref={ref}>
      <button
        type="button"
        className={styles.editorButton}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Mais opções de edição"
        title="Mais opções"
        onMouseDown={preventToolbarBlur}
        onClick={() => setOpen((current) => !current)}
      >
        Todos
      </button>
      {open ? (
        <div className={styles.moreMenu} role="menu" aria-label="Mais opções de edição" onMouseDown={preventToolbarBlur}>
          {FORMAT_GROUPS.map((group) => (
            <div className={styles.moreMenuGroup} key={group.title}>
              <span className={styles.menuTitle}>{group.title}</span>
              {group.commands.map(([command, text, value]) => (
                <button
                  key={`${command}-${text}`}
                  type="button"
                  className={styles.menuItem}
                  onMouseDown={preventToolbarBlur}
                  onClick={() => {
                    onCommand(command, value || null);
                    setOpen(false);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditorToolbar({ disabled, onCommand }) {
  return (
    <div className={styles.editorToolbar} aria-label="Edição da célula ativa" onMouseDown={preventToolbarBlur}>
      <EditorButton disabled={disabled} title="Negrito" onCommand={() => onCommand('bold')}><strong>B</strong></EditorButton>
      <EditorButton disabled={disabled} title="Itálico" onCommand={() => onCommand('italic')}><em>I</em></EditorButton>
      <EditorButton disabled={disabled} title="Sublinhado" onCommand={() => onCommand('underline')}><span className={styles.underline}>U</span></EditorButton>
      <EditorButton disabled={disabled} title="Riscado" onCommand={() => onCommand('strikeThrough')}><span className={styles.strike}>S</span></EditorButton>
      <span className={styles.toolbarDivider} />
      <EditorButton disabled={disabled} title="Alinhar à esquerda" onCommand={() => onCommand('justifyLeft')}>Esq</EditorButton>
      <EditorButton disabled={disabled} title="Centralizar" onCommand={() => onCommand('justifyCenter')}>Centro</EditorButton>
      <EditorButton disabled={disabled} title="Alinhar à direita" onCommand={() => onCommand('justifyRight')}>Dir</EditorButton>
      <span className={styles.toolbarDivider} />
      <ColorMenu disabled={disabled} label="Texto" title="Cor do texto" colors={TEXT_COLORS} onSelect={(color) => onCommand('foreColor', color)} />
      <ColorMenu disabled={disabled} label="Fundo" title="Cor de fundo" colors={FILL_COLORS} onSelect={(color) => onCommand('hiliteColor', color)} />
      <span className={styles.toolbarDivider} />
      <MoreMenu disabled={disabled} onCommand={onCommand} />
    </div>
  );
}

function HeaderCell({ column, editable, resizing, compact, onLabelChange, onLabelCommit, onResizeStart, onContextMenu }) {
  return (
    <div className={styles.headerCell} data-resizing={resizing || undefined} data-compact={compact || undefined} onContextMenu={(event) => onContextMenu(event, null, column.key)}>
      {editable ? (
        <input
          value={column.label}
          aria-label={`Nome da coluna ${column.label}`}
          onChange={(event) => onLabelChange(column.key, event.target.value)}
          onBlur={() => onLabelCommit(column.key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
          }}
        />
      ) : (
        <span>{column.label}</span>
      )}
      {editable ? (
        <button
          type="button"
          className={styles.resizeHandle}
          data-resizing={resizing || undefined}
          aria-label={`Redimensionar ${column.label}`}
          onMouseDown={(event) => onResizeStart(event, column.key)}
        />
      ) : null}
    </div>
  );
}

function SheetCell({ row, column, editable, selected, selectedGroup, rangeEdges, saving, onSelect, onChange, onCommit, onNavigate, onContextMenu, onPasteTable }) {
  const ref = useRef(null);
  const value = String(row[column.key] || '');
  const style = row.__styles?.[column.key] || undefined;

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  if (!editable) {
    return (
      <div
        className={styles.readonlyCell}
        data-tone={toneFromContent(value)}
        style={style}
        title={stripHtml(value)}
        onContextMenu={(event) => onContextMenu(event, row.id, column.key)}
        dangerouslySetInnerHTML={{ __html: value || '—' }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={styles.sheetCell}
      data-selected={selected || undefined}
      data-range={selectedGroup && !selected ? true : undefined}
      data-range-top={rangeEdges?.top || undefined}
      data-range-bottom={rangeEdges?.bottom || undefined}
      data-range-left={rangeEdges?.left || undefined}
      data-range-right={rangeEdges?.right || undefined}
      data-saving={saving || undefined}
      data-tone={toneFromContent(value)}
      data-cell-id={`${row.id}:${column.key}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      tabIndex={0}
      onFocus={() => onSelect(row.id, column.key, ref.current)}
      onMouseDown={(event) => {
        if (event.shiftKey) {
          event.preventDefault();
          onSelect(row.id, column.key, ref.current, true);
        }
      }}
      onMouseUp={(event) => {
        if (!event.shiftKey) onSelect(row.id, column.key, ref.current);
      }}
      onKeyUp={() => onSelect(row.id, column.key, ref.current)}
      onInput={(event) => onChange(row.id, column.key, event.currentTarget.innerHTML)}
      onBlur={() => onCommit(row.id, column.key)}
      onContextMenu={(event) => onContextMenu(event, row.id, column.key)}
      onPaste={(event) => {
        const text = event.clipboardData.getData('text/plain');
        const table = parseClipboardTable(text);
        if (table.length > 1 || table.some((line) => line.length > 1)) {
          event.preventDefault();
          onPasteTable(row.id, column.key, text);
          return;
        }
        event.preventDefault();
        document.execCommand('insertText', false, text);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          onCommit(row.id, column.key);
          onNavigate(row.id, column.key, 0, event.shiftKey ? -1 : 1);
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onCommit(row.id, column.key);
          onNavigate(row.id, column.key, 1, 0);
          return;
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
          return;
        }
        if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          const command = { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()];
          document.execCommand(command, false, null);
          onChange(row.id, column.key, event.currentTarget.innerHTML);
          return;
        }
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

function ImportDialog({ open, text, delimiter, preview, disabled, onTextChange, onDelimiterChange, onClose, onApply, onPickFile }) {
  if (!open) return null;
  return (
    <div className={styles.importOverlay} role="dialog" aria-modal="true" aria-label="Importar dados para a planilha">
      <div className={styles.importModal}>
        <header className={styles.importHeader}>
          <div>
            <span>Importar dados</span>
            <strong>CSV / TSV para a planilha ativa</strong>
          </div>
          <button type="button" className={styles.importClose} onClick={onClose} aria-label="Fechar importação"><CloseIcon size={16} /></button>
        </header>
        <div className={styles.importControls}>
          <button type="button" onClick={onPickFile}>Selecionar arquivo</button>
          <label>
            Separador
            <select value={delimiter} onChange={(event) => onDelimiterChange(event.target.value)}>
              <option value="auto">Automático</option>
              <option value="\t">Tabulação</option>
              <option value=";">Ponto e vírgula</option>
              <option value=",">Vírgula</option>
            </select>
          </label>
        </div>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Cole aqui dados CSV, TSV ou conteúdo copiado de outra planilha"
          spellCheck={false}
        />
        <div className={styles.importPreview}>
          <span>{preview.rows} linhas</span>
          <span>{preview.columns} colunas</span>
          <span>{preview.cells} células previstas</span>
        </div>
        <footer className={styles.importFooter}>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" onClick={onApply} disabled={disabled}>Importar para a célula ativa</button>
        </footer>
      </div>
    </div>
  );
}

function SheetContextMenu({ menu, canEdit, onClose, onAddRow, onAddColumn, onInsertRow, onInsertColumn, onDuplicateRow, onDuplicateColumn, onSelectRow, onSelectColumn, onClearSelection, onDeleteRow, onDeleteColumn }) {
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => onClose();
    const keyClose = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', keyClose);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', keyClose);
    };
  }, [menu, onClose]);

  if (!menu || !canEdit) return null;

  return (
    <div
      className={styles.contextMenu}
      role="menu"
      aria-label="Ações da planilha"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className={styles.menuTitle}>Linha</span>
      {menu.rowId ? (
        <>
          <button type="button" className={styles.menuItem} onClick={() => { onInsertRow(menu.rowId, 'above'); onClose(); }}>
            <PlusIcon size={14} /> Inserir acima
          </button>
          <button type="button" className={styles.menuItem} onClick={() => { onInsertRow(menu.rowId, 'below'); onClose(); }}>
            <PlusIcon size={14} /> Inserir abaixo
          </button>
          <button type="button" className={styles.menuItem} onClick={() => { onDuplicateRow(menu.rowId); onClose(); }}>
            Duplicar linha
          </button>
          <button type="button" className={styles.menuItem} onClick={() => { onSelectRow(menu.rowId); onClose(); }}>
            Selecionar linha
          </button>
        </>
      ) : (
        <button type="button" className={styles.menuItem} onClick={() => { onAddRow(); onClose(); }}>
          <PlusIcon size={14} /> Nova linha
        </button>
      )}
      <span className={styles.menuTitle}>Coluna</span>
      {menu.columnKey ? (
        <>
          <button type="button" className={styles.menuItem} onClick={() => { onInsertColumn(menu.columnKey, 'left'); onClose(); }}>
            <PlusIcon size={14} /> Inserir à esquerda
          </button>
          <button type="button" className={styles.menuItem} onClick={() => { onInsertColumn(menu.columnKey, 'right'); onClose(); }}>
            <PlusIcon size={14} /> Inserir à direita
          </button>
          <button type="button" className={styles.menuItem} onClick={() => { onDuplicateColumn(menu.columnKey); onClose(); }}>
            Duplicar coluna
          </button>
          <button type="button" className={styles.menuItem} onClick={() => { onSelectColumn(menu.columnKey); onClose(); }}>
            Selecionar coluna
          </button>
        </>
      ) : (
        <button type="button" className={styles.menuItem} onClick={() => { onAddColumn(); onClose(); }}>
          <PlusIcon size={14} /> Nova coluna
        </button>
      )}
      <span className={styles.menuTitle}>Seleção</span>
      <button type="button" className={styles.menuItem} onClick={() => { onClearSelection(); onClose(); }}>
        Limpar seleção
      </button>
      {menu.rowId ? (
        <button type="button" className={styles.dangerItem} onClick={() => onDeleteRow(menu.rowId)}>
          <TrashIcon size={14} /> Excluir linha
        </button>
      ) : null}
      {menu.columnKey ? (
        <button type="button" className={styles.dangerItem} onClick={() => onDeleteColumn(menu.columnKey)}>
          <TrashIcon size={14} /> Excluir coluna
        </button>
      ) : null}
    </div>
  );
}

export default function UserSpreadsheetPanel({ ownerUserId, canEdit = true, showToast }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState('');
  const [sheetSearch, setSheetSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importDelimiter, setImportDelimiter] = useState('auto');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [activeCell, setActiveCell] = useState(null);
  const [selectionRange, setSelectionRange] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const rangeRef = useRef(null);
  const resizeRef = useRef(null);
  const sheetFrameRef = useRef(null);
  const [resizeState, setResizeState] = useState(null);
  const [scrollState, setScrollState] = useState({ x: false, y: false, endX: false, endY: false });
  const [syncState, setSyncState] = useState({ status: 'syncing', label: 'Sincronizando', detail: 'Carregando planilhas', at: null });
  const scrollerRef = useRef(null);
  const importFileRef = useRef(null);

  const markSync = useCallback((status, detail = '') => {
    const labelMap = {
      syncing: 'Sincronizando',
      saving: 'Salvando',
      saved: 'Salvo',
      error: 'Erro ao salvar',
    };
    setSyncState({ status, label: labelMap[status] || 'Salvo', detail, at: status === 'saved' ? new Date() : null });
  }, []);

  const sheetMinWidth = useMemo(() => {
    const total = columns.reduce((sum, column) => sum + Math.max(5, Number(column.width || 5)), 0);
    return Math.max(540, total + 54);
  }, [columns]);

  const refreshRows = useCallback(async (sheetId = activeSheetId) => {
    setRowsLoading(true);
    markSync('syncing', 'Atualizando dados da planilha');
    try {
      const data = await listSupportDailyRows(sheetId || undefined, { ownerUserId });
      const nextColumns = normalizeColumns(data?.columns);
      setSheets(Array.isArray(data?.sheets) ? data.sheets : []);
      setActiveSheetId(data?.activeSheetId || sheetId || data?.sheets?.[0]?.id || '');
      setColumns(nextColumns);
      setRows((Array.isArray(data?.rows) ? data.rows : []).map((row) => normalizeRow(row, nextColumns)));
      setActiveCell(null);
      setSelectionRange(null);
      markSync('saved', 'Planilha sincronizada');
      return { ...data, columns: nextColumns, rows: (Array.isArray(data?.rows) ? data.rows : []).map((row) => normalizeRow(row, nextColumns)) };
    } catch (err) {
      markSync('error', 'Falha ao sincronizar');
      throw err;
    } finally {
      setRowsLoading(false);
    }
  }, [activeSheetId, markSync, ownerUserId]);

  useEffect(() => {
    refreshRows().catch(() => showToast?.('Não foi possível carregar suas planilhas.', { variant: 'error' }));
  }, [ownerUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const syncSelection = () => {
      if (!activeCell?.element) return;
      const range = saveSelectionInside(activeCell.element);
      if (range) rangeRef.current = range;
    };
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [activeCell]);

  const selectCell = useCallback((rowId, key, element, extend = false) => {
    const range = saveSelectionInside(element);
    if (range) rangeRef.current = range;
    setActiveCell((current) => {
      const start = extend && current?.rowId && current?.key ? { rowId: current.rowId, key: current.key } : { rowId, key };
      setSelectionRange({ start, end: { rowId, key } });
      return { rowId, key, element };
    });
  }, []);

  const focusCell = useCallback((rowId, key) => {
    window.requestAnimationFrame(() => {
      const element = document.querySelector(`[data-cell-id="${rowId}:${key}"]`);
      if (!element) return;
      element.focus({ preventScroll: true });
      restoreSelection(element, null);
      const scroller = scrollerRef.current;
      if (scroller) {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }, []);

  const navigateCell = useCallback((rowId, key, rowDelta, columnDelta) => {
    if (!rows.length || !columns.length) return;
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const columnIndex = columns.findIndex((column) => column.key === key);
    if (rowIndex < 0 || columnIndex < 0) return;
    const nextRow = rows[Math.min(rows.length - 1, Math.max(0, rowIndex + rowDelta))];
    const nextColumn = columns[Math.min(columns.length - 1, Math.max(0, columnIndex + columnDelta))];
    if (!nextRow || !nextColumn) return;
    focusCell(nextRow.id, nextColumn.key);
  }, [columns, focusCell, rows]);

  const selectedCells = useMemo(() => rangeCells(rows, columns, selectionRange), [columns, rows, selectionRange]);
  const selectedCellIds = useMemo(() => new Set(selectedCells.map((cell) => cellId(cell.rowId, cell.key))), [selectedCells]);
  const selectedCount = selectedCells.length;

  const selectionBounds = useMemo(() => {
    if (!selectionRange?.start || !selectionRange?.end) return null;
    const startRow = rows.findIndex((row) => row.id === selectionRange.start.rowId);
    const endRow = rows.findIndex((row) => row.id === selectionRange.end.rowId);
    const startColumn = columns.findIndex((column) => column.key === selectionRange.start.key);
    const endColumn = columns.findIndex((column) => column.key === selectionRange.end.key);
    if ([startRow, endRow, startColumn, endColumn].some((index) => index < 0)) return null;
    return {
      rowFrom: Math.min(startRow, endRow),
      rowTo: Math.max(startRow, endRow),
      columnFrom: Math.min(startColumn, endColumn),
      columnTo: Math.max(startColumn, endColumn),
    };
  }, [columns, rows, selectionRange]);

  const selectionLabel = useMemo(() => {
    if (!selectionBounds || selectedCount <= 1) return '';
    const startColumn = columns[selectionBounds.columnFrom]?.label || 'Coluna';
    const endColumn = columns[selectionBounds.columnTo]?.label || startColumn;
    const startRow = selectionBounds.rowFrom + 1;
    const endRow = selectionBounds.rowTo + 1;
    return `${startColumn} ${startRow} → ${endColumn} ${endRow}`;
  }, [columns, selectedCount, selectionBounds]);

  const selectRow = useCallback((rowId) => {
    if (!rowId || !columns.length) return;
    setSelectionRange({ start: { rowId, key: columns[0].key }, end: { rowId, key: columns[columns.length - 1].key } });
    setActiveCell((current) => ({ rowId, key: columns[0].key, element: current?.element || null }));
  }, [columns]);

  const selectColumn = useCallback((key) => {
    if (!key || !rows.length) return;
    setSelectionRange({ start: { rowId: rows[0].id, key }, end: { rowId: rows[rows.length - 1].id, key } });
    setActiveCell((current) => ({ rowId: rows[0].id, key, element: current?.element || null }));
  }, [rows]);

  const clearSelection = useCallback(() => {
    setSelectionRange(activeCell?.rowId && activeCell?.key ? { start: { rowId: activeCell.rowId, key: activeCell.key }, end: { rowId: activeCell.rowId, key: activeCell.key } } : null);
  }, [activeCell?.key, activeCell?.rowId]);

  const activeCellText = useMemo(() => {
    if (!activeCell?.rowId || !activeCell?.key) return '';
    const row = rows.find((entry) => entry.id === activeCell.rowId);
    return stripHtml(row?.[activeCell.key] || '');
  }, [activeCell?.key, activeCell?.rowId, rows]);

  const handleActiveCellTextChange = useCallback((value) => {
    if (!activeCell?.rowId || !activeCell?.key) return;
    const element = document.querySelector(`[data-cell-id="${activeCell.rowId}:${activeCell.key}"]`);
    if (element) element.textContent = value;
    setRows((current) => current.map((row) => (row.id === activeCell.rowId ? { ...row, [activeCell.key]: value } : row)));
  }, [activeCell?.key, activeCell?.rowId]);

  const openContextMenu = useCallback((event, rowId = null, columnKey = null) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ rowId, columnKey, x: event.clientX, y: event.clientY });
  }, [canEdit]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const next = {
      x: scroller.scrollLeft > 2,
      y: scroller.scrollTop > 2,
      endX: scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2,
      endY: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
    };
    setScrollState((current) => (
      current.x === next.x && current.y === next.y && current.endX === next.endX && current.endY === next.endY
        ? current
        : next
    ));
  }, []);


  useEffect(() => {
    window.requestAnimationFrame(updateScrollState);
  }, [columns.length, rows.length, sheetMinWidth, updateScrollState]);

  const handleSheetWheel = useCallback((event) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
      updateScrollState();
    }
  }, [updateScrollState]);

  const handleSheetScroll = useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  const estimateBlankSheetSize = useCallback(() => {
    const workspaceWidth = Math.max(900, scrollerRef.current?.clientWidth || window.innerWidth - 360 || 1100);
    const workspaceHeight = Math.max(560, scrollerRef.current?.clientHeight || window.innerHeight - 360 || 620);
    const columnCount = Math.max(BLANK_MIN_COLUMNS, Math.ceil((workspaceWidth - 54) / BLANK_COLUMN_WIDTH));
    const rowCount = Math.max(BLANK_MIN_ROWS, Math.ceil((workspaceHeight - 96) / BLANK_ROW_HEIGHT));
    return { columnCount, rowCount, columnWidth: BLANK_COLUMN_WIDTH };
  }, []);

  const handleAddSheet = async () => {
    setCreatingSheet(true);
    markSync('saving', 'Criando nova planilha');
    try {
      const data = await createSupportDailySheet({ name: `Planilha ${sheets.length + 1}`, ownerUserId, ...estimateBlankSheetSize() });
      setSheets(Array.isArray(data?.sheets) ? data.sheets : []);
      if (data?.sheet?.id) await refreshRows(data.sheet.id);
      markSync('saved', 'Nova planilha criada');
    } catch (err) {
      markSync('error', 'Falha ao criar planilha');
      showToast?.(err?.message || 'Não foi possível criar planilha.', { variant: 'error' });
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleSheetNameCommit = async (sheetId, name) => {
    markSync('saving', 'Renomeando planilha');
    try {
      const data = await updateSupportDailySheet(sheetId, { name: cleanText(name) || 'Planilha', ownerUserId });
      if (Array.isArray(data?.sheets)) setSheets(data.sheets);
      markSync('saved', 'Nome da planilha salvo');
    } catch (err) {
      markSync('error', 'Falha ao renomear planilha');
      showToast?.(err?.message || 'Não foi possível renomear a planilha.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    }
  };

  const handleDeleteSheet = async (sheetId) => {
    if (!sheetId) return;
    markSync('saving', 'Removendo planilha');
    try {
      const data = await deleteSupportDailySheet(sheetId, { ownerUserId });
      const nextSheets = Array.isArray(data?.sheets) ? data.sheets : sheets.filter((sheet) => sheet.id !== sheetId);
      setSheets(nextSheets);
      await refreshRows(nextSheets[0]?.id || '');
      markSync('saved', 'Planilha removida');
    } catch (err) {
      markSync('error', 'Falha ao remover planilha');
      showToast?.(err?.message || 'Não foi possível excluir a planilha.', { variant: 'error' });
    }
  };

  const handleDuplicateSheet = async (sheetId = activeSheetId) => {
    if (!sheetId || creatingSheet) return;
    const sourceSheet = sheets.find((sheet) => sheet.id === sheetId) || activeSheet;
    const sourceName = cleanText(sourceSheet?.name || activeSheet?.name || 'Planilha');
    setCreatingSheet(true);
    markSync('saving', 'Duplicando planilha');
    try {
      const sourceColumns = [...columns];
      const sourceRows = [...rows];
      const data = await createSupportDailySheet({
        name: `${sourceName} cópia`,
        ownerUserId,
        columnCount: Math.max(BLANK_MIN_COLUMNS, sourceColumns.length || BLANK_MIN_COLUMNS),
        rowCount: Math.max(BLANK_MIN_ROWS, sourceRows.length || BLANK_MIN_ROWS),
        columnWidth: sourceColumns[0]?.width || BLANK_COLUMN_WIDTH,
      });
      const targetSheetId = data?.sheet?.id;
      if (!targetSheetId) throw new Error('Planilha duplicada não retornou identificador.');

      const targetData = await listSupportDailyRows(targetSheetId, { ownerUserId });
      const targetColumns = normalizeColumns(targetData?.columns).slice(0, sourceColumns.length);
      const targetRows = (Array.isArray(targetData?.rows) ? targetData.rows : []).map((row) => normalizeRow(row, targetColumns)).slice(0, sourceRows.length);

      await Promise.all(targetColumns.map((targetColumn, index) => updateSupportDailyColumn(targetColumn.key, {
        ownerUserId,
        label: sourceColumns[index]?.label || targetColumn.label,
        width: sourceColumns[index]?.width || targetColumn.width || BLANK_COLUMN_WIDTH,
        position: index + 1,
      })));

      await Promise.all(targetRows.map((targetRow, rowIndex) => {
        const sourceRow = sourceRows[rowIndex] || {};
        const payload = targetColumns.reduce((acc, targetColumn, columnIndex) => {
          const sourceColumn = sourceColumns[columnIndex];
          if (!sourceColumn) return acc;
          return { ...acc, [targetColumn.key]: sourceRow?.[sourceColumn.key] || '' };
        }, {});
        const styles = targetColumns.reduce((acc, targetColumn, columnIndex) => {
          const sourceColumn = sourceColumns[columnIndex];
          const style = sourceColumn ? sourceRow?.__styles?.[sourceColumn.key] : null;
          if (!style || !Object.keys(style).length) return acc;
          return { ...acc, [targetColumn.key]: style };
        }, {});
        return updateSupportDailyRow(targetRow.id, { ...payload, styles, ownerUserId, position: rowIndex + 1 });
      }));

      await refreshRows(targetSheetId);
      markSync('saved', 'Planilha duplicada');
    } catch (err) {
      markSync('error', 'Falha ao duplicar planilha');
      showToast?.(err?.message || 'Não foi possível duplicar a planilha.', { variant: 'error' });
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleSheetTabKeyDown = (event, sheetId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (sheetId !== activeSheetId) refreshRows(sheetId).catch(() => {});
    }
  };

  const createRowAt = async ({ anchorRowId = '', placement = 'end', duplicateFromRowId = '' } = {}) => {
    if (!activeSheetId) return null;
    setCreatingRow(true);
    markSync('saving', duplicateFromRowId ? 'Duplicando linha' : 'Criando linha');
    try {
      const sourceRow = duplicateFromRowId ? rows.find((row) => row.id === duplicateFromRowId) : null;
      const data = await createSupportDailyRow({ sheetId: activeSheetId, ownerUserId });
      const createdRow = normalizeRow(data?.row, columns);
      const ordered = sortByPosition(rows);
      const anchorIndex = ordered.findIndex((row) => row.id === anchorRowId);
      const insertIndex = anchorIndex < 0
        ? ordered.length
        : placement === 'above'
          ? anchorIndex
          : anchorIndex + 1;
      const nextRows = [...ordered];
      nextRows.splice(insertIndex, 0, sourceRow ? { ...createdRow, ...cloneRowPayload(sourceRow, columns), __styles: cloneRowStyles(sourceRow, columns) } : createdRow);

      const updates = nextRows.map((row, index) => updateSupportDailyRow(row.id, {
        ...((row.id === createdRow.id && sourceRow) ? cloneRowPayload(sourceRow, columns) : {}),
        ...((row.id === createdRow.id && sourceRow) ? { styles: cloneRowStyles(sourceRow, columns) } : {}),
        ownerUserId,
        position: index + 1,
      }));
      await Promise.all(updates);
      setRows(nextRows.map((row, index) => ({ ...row, position: index + 1 })));
      if (createdRow.id && columns[0]?.key) {
        setActiveCell({ rowId: createdRow.id, key: columns[0].key, element: null });
        setSelectionRange({ start: { rowId: createdRow.id, key: columns[0].key }, end: { rowId: createdRow.id, key: columns[columns.length - 1]?.key || columns[0].key } });
      }
      markSync('saved', duplicateFromRowId ? 'Linha duplicada' : 'Linha criada');
      return createdRow;
    } catch (err) {
      markSync('error', 'Falha ao salvar linha');
      showToast?.(err?.message || 'Não foi possível criar a linha.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
      return null;
    } finally {
      setCreatingRow(false);
    }
  };

  const handleAddRow = () => createRowAt();

  const handleInsertRow = (rowId, placement = 'below') => createRowAt({ anchorRowId: rowId, placement });

  const handleDuplicateRow = (rowId) => createRowAt({ anchorRowId: rowId, placement: 'below', duplicateFromRowId: rowId });

  const handleDeleteRow = async (id) => {
    if (!id) return;
    closeContextMenu();
    markSync('saving', 'Removendo linha');
    try {
      await deleteSupportDailyRow(id, { ownerUserId });
      setRows((current) => current.filter((row) => row.id !== id));
      markSync('saved', 'Linha removida');
    } catch (err) {
      markSync('error', 'Falha ao remover linha');
      showToast?.(err?.message || 'Não foi possível remover a linha.', { variant: 'error' });
    }
  };

  const handleCellChange = (id, key, value) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  const handleCellCommit = async (id, key) => {
    const row = rows.find((entry) => entry.id === id);
    if (!row) return;
    const saveKey = `${id}:${key}`;
    setSavingCell(saveKey);
    markSync('saving', 'Salvando célula');
    try {
      const data = await updateSupportDailyRow(id, { [key]: row[key] || '', ownerUserId });
      if (data?.row) setRows((current) => current.map((entry) => (entry.id === id ? normalizeRow(data.row, columns) : entry)));
      markSync('saved', 'Célula salva');
    } catch (err) {
      markSync('error', 'Falha ao salvar célula');
      showToast?.(err?.message || 'Não foi possível salvar a célula.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  const handlePasteTable = useCallback(async (startRowId, startKey, text) => {
    if (!activeSheetId || !startRowId || !startKey) return;
    const table = parseClipboardTable(text);
    if (!table.length) return;

    const startRowIndex = rows.findIndex((row) => row.id === startRowId);
    const startColumnIndex = columns.findIndex((column) => column.key === startKey);
    if (startRowIndex < 0 || startColumnIndex < 0) return;

    const writableRows = table.slice(0, Math.max(0, rows.length - startRowIndex));
    const updatesByRow = new Map();
    writableRows.forEach((line, rowOffset) => {
      const row = rows[startRowIndex + rowOffset];
      if (!row) return;
      const payload = {};
      line.slice(0, Math.max(0, columns.length - startColumnIndex)).forEach((value, columnOffset) => {
        const column = columns[startColumnIndex + columnOffset];
        if (column?.key) payload[column.key] = value;
      });
      if (Object.keys(payload).length) updatesByRow.set(row.id, payload);
    });

    if (!updatesByRow.size) return;
    setSavingCell('bulk-selection');
    markSync('saving', 'Colando dados tabulares');
    try {
      setRows((current) => current.map((row) => (updatesByRow.has(row.id) ? { ...row, ...updatesByRow.get(row.id) } : row)));
      await Promise.all([...updatesByRow.entries()].map(([rowId, payload]) => updateSupportDailyRow(rowId, { ...payload, ownerUserId })));
      const lastRow = rows[Math.min(rows.length - 1, startRowIndex + writableRows.length - 1)];
      const maxColumns = Math.max(...writableRows.map((line) => line.length), 1);
      const lastColumn = columns[Math.min(columns.length - 1, startColumnIndex + maxColumns - 1)];
      if (lastRow && lastColumn) {
        setSelectionRange({ start: { rowId: startRowId, key: startKey }, end: { rowId: lastRow.id, key: lastColumn.key } });
        setActiveCell((current) => ({ rowId: startRowId, key: startKey, element: current?.element || null }));
      }
      markSync('saved', 'Dados colados na planilha');
      if (table.length > writableRows.length || table.some((line) => line.length > columns.length - startColumnIndex)) {
        showToast?.('Parte dos dados não coube na área atual da planilha.', { variant: 'warning' });
      }
    } catch (err) {
      markSync('error', 'Falha ao colar dados');
      showToast?.(err?.message || 'Não foi possível colar os dados.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
  }, [activeSheetId, columns, markSync, ownerUserId, refreshRows, rows, showToast]);

  const handleApplyBulkStyle = async (command, value = null) => {
    if (!selectedCells.length) return false;
    const supported = ['foreColor', 'hiliteColor', 'bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'removeFormat'];
    if (!supported.includes(command)) return false;

    const groupedStyles = new Map();
    setRows((current) => current.map((row) => {
      const cellsForRow = selectedCells.filter((cell) => cell.rowId === row.id);
      if (!cellsForRow.length) return row;
      const nextStyles = { ...(row.__styles || {}) };
      cellsForRow.forEach((cell) => {
        nextStyles[cell.key] = applyStyleCommand(nextStyles[cell.key], command, value);
      });
      groupedStyles.set(row.id, cellsForRow.reduce((acc, cell) => ({ ...acc, [cell.key]: nextStyles[cell.key] }), {}));
      return { ...row, __styles: nextStyles };
    }));

    setSavingCell('bulk-selection');
    markSync('saving', 'Aplicando formatação em lote');
    try {
      await Promise.all(Array.from(groupedStyles.entries()).map(([rowId, stylesPayload]) => updateSupportDailyRow(rowId, { ownerUserId, styles: stylesPayload })));
      markSync('saved', 'Formatação aplicada');
    } catch (err) {
      markSync('error', 'Falha na formatação em lote');
      showToast?.(err?.message || 'Não foi possível aplicar a formatação em lote.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
    return true;
  };

  const commitActiveCellText = useCallback(() => {
    if (!activeCell?.rowId || !activeCell?.key) return;
    handleCellCommit(activeCell.rowId, activeCell.key);
  }, [activeCell?.key, activeCell?.rowId, handleCellCommit]);

  const handleApplyFormat = async (command, value = null) => {
    if (!activeCell || !canEdit) return;
    if (selectedCount > 1 && await handleApplyBulkStyle(command, value)) return;
    const { rowId, key } = activeCell;
    const element = activeCell.element || document.querySelector(`[data-cell-id="${rowId}:${key}"]`);
    if (!element) return;
    restoreSelection(element, rangeRef.current);
    if (command === 'hiliteColor' && value === 'transparent') {
      document.execCommand('removeFormat', false, null);
    } else if (command === 'hiliteColor') {
      const ran = document.execCommand('hiliteColor', false, value);
      if (!ran) document.execCommand('backColor', false, value);
    } else {
      document.execCommand(command, false, value);
    }
    rangeRef.current = saveSelectionInside(element);
    const nextHtml = element.innerHTML;
    setRows((current) => current.map((entry) => (entry.id === rowId ? { ...entry, [key]: nextHtml } : entry)));
    setSavingCell(`${rowId}:${key}`);
    markSync('saving', 'Salvando formatação');
    try {
      await updateSupportDailyRow(rowId, { [key]: nextHtml, ownerUserId });
      markSync('saved', 'Formatação salva');
    } catch (err) {
      markSync('error', 'Falha ao salvar formatação');
      showToast?.(err?.message || 'Não foi possível salvar a formatação.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  const createColumnAt = async ({ anchorKey = '', placement = 'end', duplicateFromKey = '' } = {}) => {
    if (!activeSheetId) return null;
    setCreatingColumn(true);
    markSync('saving', duplicateFromKey ? 'Duplicando coluna' : 'Criando coluna');
    try {
      const sourceColumn = duplicateFromKey ? columns.find((column) => column.key === duplicateFromKey) : null;
      const sourceLabel = sourceColumn?.label ? `${sourceColumn.label} cópia` : 'Nova coluna';
      const data = await createSupportDailyColumn({ sheetId: activeSheetId, ownerUserId, label: sourceLabel, width: sourceColumn?.width || 200 });
      const createdColumn = normalizeColumns(data?.column ? [data.column] : []).at(0);
      const freshColumns = data?.columns ? normalizeColumns(data.columns) : [...columns, createdColumn].filter(Boolean);
      if (!createdColumn?.key) return null;

      const ordered = sortByPosition(freshColumns.filter((column) => column.key !== createdColumn.key));
      const anchorIndex = ordered.findIndex((column) => column.key === anchorKey);
      const insertIndex = anchorIndex < 0
        ? ordered.length
        : placement === 'left'
          ? anchorIndex
          : anchorIndex + 1;
      const nextColumns = [...ordered];
      nextColumns.splice(insertIndex, 0, createdColumn);

      await Promise.all(nextColumns.map((column, index) => updateSupportDailyColumn(column.key, { ownerUserId, position: index + 1 })));

      let nextRows = rows.map((row) => ({ ...row, [createdColumn.key]: duplicateFromKey ? row[duplicateFromKey] || '' : '', __styles: { ...(row.__styles || {}) } }));
      if (duplicateFromKey) {
        await Promise.all(rows.map((row) => updateSupportDailyRow(row.id, {
          [createdColumn.key]: row[duplicateFromKey] || '',
          styles: row.__styles?.[duplicateFromKey] ? { [createdColumn.key]: row.__styles[duplicateFromKey] } : {},
          ownerUserId,
        })));
        nextRows = nextRows.map((row) => ({
          ...row,
          __styles: row.__styles?.[duplicateFromKey]
            ? { ...row.__styles, [createdColumn.key]: row.__styles[duplicateFromKey] }
            : row.__styles,
        }));
      }

      setColumns(nextColumns.map((column, index) => ({ ...column, position: index + 1 })));
      setRows(nextRows);
      if (rows[0]?.id) {
        setActiveCell({ rowId: rows[0].id, key: createdColumn.key, element: null });
        setSelectionRange({ start: { rowId: rows[0].id, key: createdColumn.key }, end: { rowId: rows[rows.length - 1]?.id || rows[0].id, key: createdColumn.key } });
      }
      markSync('saved', duplicateFromKey ? 'Coluna duplicada' : 'Coluna criada');
      return createdColumn;
    } catch (err) {
      markSync('error', 'Falha ao salvar coluna');
      showToast?.(err?.message || 'Não foi possível criar a coluna.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
      return null;
    } finally {
      setCreatingColumn(false);
    }
  };

  const handleAddColumn = () => createColumnAt();

  const handleInsertColumn = (columnKey, placement = 'right') => createColumnAt({ anchorKey: columnKey, placement });

  const handleDuplicateColumn = (columnKey) => createColumnAt({ anchorKey: columnKey, placement: 'right', duplicateFromKey: columnKey });

  const handleColumnLabelChange = (key, label) => {
    setColumns((current) => current.map((column) => (column.key === key ? { ...column, label } : column)));
  };

  const handleColumnLabelCommit = async (key) => {
    const column = columns.find((entry) => entry.key === key);
    if (!column) return;
    setSavingColumn(key);
    markSync('saving', 'Salvando coluna');
    try {
      const data = await updateSupportDailyColumn(key, { ownerUserId, label: column.label || 'Coluna' });
      if (data?.columns) setColumns(normalizeColumns(data.columns));
      markSync('saved', 'Coluna salva');
    } catch (err) {
      markSync('error', 'Falha ao salvar coluna');
      showToast?.(err?.message || 'Não foi possível salvar a coluna.', { variant: 'error' });
      refreshRows(activeSheetId).catch(() => {});
    } finally {
      setSavingColumn('');
    }
  };

  const handleDeleteColumn = async (key) => {
    if (!key) return;
    closeContextMenu();
    markSync('saving', 'Removendo coluna');
    try {
      await deleteSupportDailyColumn(key, { ownerUserId });
      setColumns((current) => current.filter((entry) => entry.key !== key));
      setRows((current) => current.map((row) => {
        const next = { ...row, __styles: { ...(row.__styles || {}) } };
        delete next[key];
        delete next.__styles[key];
        return next;
      }));
      markSync('saved', 'Coluna removida');
    } catch (err) {
      markSync('error', 'Falha ao remover coluna');
      showToast?.(err?.message || 'Não foi possível remover a coluna.', { variant: 'error' });
    }
  };

  const handleResizeStart = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
    const column = columns.find((entry) => entry.key === key);
    if (!column) return;
    const frameRect = sheetFrameRef.current?.getBoundingClientRect();
    resizeRef.current = {
      key,
      label: column.label || 'Coluna',
      startX: event.clientX,
      startWidth: Number(column.width || BLANK_COLUMN_WIDTH),
      width: Number(column.width || BLANK_COLUMN_WIDTH),
    };
    setResizeState({
      key,
      label: column.label || 'Coluna',
      width: Number(column.width || BLANK_COLUMN_WIDTH),
      left: frameRect ? event.clientX - frameRect.left : 0,
    });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMove = (event) => {
      const state = resizeRef.current;
      if (!state) return;
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(state.startWidth + event.clientX - state.startX));
      const frameRect = sheetFrameRef.current?.getBoundingClientRect();
      resizeRef.current = { ...state, width };
      setResizeState({
        key: state.key,
        label: state.label,
        width,
        left: frameRect ? event.clientX - frameRect.left : 0,
      });
      setColumns((current) => current.map((column) => (column.key === state.key ? { ...column, width } : column)));
    };
    const handleUp = async () => {
      const state = resizeRef.current;
      if (!state) return;
      resizeRef.current = null;
      setResizeState(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      markSync('saving', 'Salvando largura da coluna');
      try {
        await updateSupportDailyColumn(state.key, { ownerUserId, width: state.width });
        markSync('saved', 'Largura da coluna salva');
      } catch {
        markSync('error', 'Falha ao salvar largura');
        refreshRows(activeSheetId).catch(() => {});
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setResizeState(null);
      resizeRef.current = null;
    };
  }, [activeSheetId, ownerUserId, refreshRows]);

  const activeSheet = useMemo(() => sheets.find((sheet) => sheet.id === activeSheetId) || null, [activeSheetId, sheets]);
  const visibleSheets = useMemo(() => {
    const query = cleanText(sheetSearch).toLowerCase();
    if (!query) return sheets;
    return sheets.filter((sheet) => String(sheet.name || '').toLowerCase().includes(query));
  }, [sheetSearch, sheets]);
  const activeSheetIndex = useMemo(() => sheets.findIndex((sheet) => sheet.id === activeSheetId), [activeSheetId, sheets]);
  const activeColumn = useMemo(() => columns.find((column) => column.key === activeCell?.key) || null, [activeCell?.key, columns]);
  const activeRowNumber = useMemo(() => {
    if (!activeCell?.rowId) return null;
    const index = rows.findIndex((row) => row.id === activeCell.rowId);
    return index >= 0 ? index + 1 : null;
  }, [activeCell?.rowId, rows]);
  const activeCellLabel = selectedCount > 1
    ? `${selectedCount} células selecionadas`
    : activeCell
      ? `${activeColumn?.label || 'Coluna'} · L${activeRowNumber || '—'}`
      : 'Nenhuma célula';
  const savingState = savingCell || savingColumn || syncState.status === 'saving' ? 'Salvando' : syncState.label;
  const syncTime = formatSyncTime(syncState.at);

  const importPreview = useMemo(() => {
    const parsed = parseDelimitedText(importText, importDelimiter);
    const rowsCount = parsed.length;
    const columnsCount = parsed.reduce((max, row) => Math.max(max, row.length), 0);
    return { rows: rowsCount, columns: columnsCount, cells: rowsCount * columnsCount };
  }, [importDelimiter, importText]);

  const handleCopySelection = useCallback(async () => {
    if (!rows.length || !columns.length) return;
    let matrix = [];
    if (selectionBounds && selectedCount > 1) {
      matrix = rows.slice(selectionBounds.rowFrom, selectionBounds.rowTo + 1).map((row) => (
        columns.slice(selectionBounds.columnFrom, selectionBounds.columnTo + 1).map((column) => stripHtml(row?.[column.key] || ''))
      ));
    } else if (activeCell?.rowId && activeCell?.key) {
      const row = rows.find((entry) => entry.id === activeCell.rowId);
      matrix = [[stripHtml(row?.[activeCell.key] || '')]];
    }
    if (!matrix.length) return;
    try {
      await writeClipboardText(serializeTable(matrix));
      markSync('saved', selectedCount > 1 ? 'Seleção copiada' : 'Célula copiada');
    } catch {
      markSync('error', 'Falha ao copiar seleção');
      showToast?.('Não foi possível copiar a seleção.', { variant: 'error' });
    }
  }, [activeCell?.key, activeCell?.rowId, columns, markSync, rows, selectedCount, selectionBounds, showToast]);

  const handleExportCsv = useCallback(() => {
    if (!columns.length) return;
    try {
      const csv = serializeSheetToCsv(rows, columns);
      downloadTextFile(`${safeFileName(activeSheet?.name || 'planilha')}.csv`, csv, 'text/csv;charset=utf-8');
      markSync('saved', 'CSV exportado');
    } catch {
      markSync('error', 'Falha ao exportar CSV');
      showToast?.('Não foi possível exportar a planilha.', { variant: 'error' });
    }
  }, [activeSheet?.name, columns, markSync, rows, showToast]);

  const handleImportFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setImportText(content);
      setImportOpen(true);
      markSync('saved', `Arquivo ${file.name} carregado`);
    } catch {
      markSync('error', 'Falha ao ler arquivo');
      showToast?.('Não foi possível ler o arquivo selecionado.', { variant: 'error' });
    } finally {
      event.target.value = '';
    }
  }, [markSync, showToast]);

  const handleApplyImport = useCallback(() => {
    const parsed = parseDelimitedText(importText, importDelimiter);
    if (!parsed.length) return;
    const startRowId = activeCell?.rowId || rows[0]?.id;
    const startKey = activeCell?.key || columns[0]?.key;
    if (!startRowId || !startKey) {
      showToast?.('Crie pelo menos uma linha e uma coluna antes de importar.', { variant: 'warning' });
      return;
    }
    setImportOpen(false);
    handlePasteTable(startRowId, startKey, serializeTable(parsed));
  }, [activeCell?.key, activeCell?.rowId, columns, handlePasteTable, importDelimiter, importText, rows, showToast]);

  return (
    <section className={styles.panel}>
      <header className={styles.sheetHeader}>
        <div className={styles.sheetTitleGroup}>
          <span className={styles.sheetEyebrow}>Planilhas pessoais</span>
          <div className={styles.sheetTitleRow}>
            <strong>{activeSheet?.name || 'Nova planilha'}</strong>
            <span className={styles.syncBadge} data-status={syncState.status}>
              <i aria-hidden="true" />
              {savingState}
              {syncTime ? <em>{syncTime}</em> : null}
            </span>
          </div>
          <span className={styles.syncDetail} data-status={syncState.status}>{syncState.detail || 'Alterações salvas automaticamente'}</span>
        </div>

        {canEdit ? (
          <div className={styles.sheetActions}>
            <Button type="button" size="sm" variant="secondary" onClick={handleCopySelection} disabled={!activeCell && selectedCount <= 1}>Copiar</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setImportOpen(true)} disabled={!activeSheetId || !columns.length || !rows.length}>Importar</Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleExportCsv} disabled={!activeSheetId || !columns.length}>Exportar CSV</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => handleDuplicateSheet(activeSheetId)} disabled={!activeSheetId || creatingSheet}>Duplicar</Button>
            <Button type="button" size="sm" onClick={handleAddSheet} disabled={creatingSheet}><PlusIcon size={14} /> Nova planilha</Button>
            <Button type="button" size="sm" onClick={handleAddColumn} disabled={creatingColumn || !activeSheetId}><PlusIcon size={14} /> Coluna</Button>
            <Button type="button" size="sm" onClick={handleAddRow} disabled={creatingRow || !activeSheetId}><PlusIcon size={14} /> Linha</Button>
          </div>
        ) : null}

        <div className={styles.sheetTabsShell}>
          <div className={styles.sheetTabsHeader}>
            <span>{sheets.length} planilha{sheets.length === 1 ? '' : 's'}</span>
            <input
              value={sheetSearch}
              onChange={(event) => setSheetSearch(event.target.value)}
              placeholder="Buscar planilha"
              aria-label="Buscar planilha"
            />
          </div>
          <div className={styles.sheetTabs} aria-label="Planilhas do perfil">
            {visibleSheets.length ? visibleSheets.map((sheet) => {
              const index = sheets.findIndex((item) => item.id === sheet.id);
              return (
                <div key={sheet.id} className={styles.sheetTab} data-active={sheet.id === activeSheetId || undefined}>
                  <button
                    type="button"
                    className={styles.sheetTabButton}
                    onClick={() => {
                      if (sheet.id !== activeSheetId) refreshRows(sheet.id).catch(() => {});
                    }}
                    onKeyDown={(event) => handleSheetTabKeyDown(event, sheet.id)}
                    title={sheet.name}
                  >
                    <em>{index + 1}</em>
                    <span>{sheet.name}</span>
                  </button>
                  <input
                    value={sheet.name}
                    disabled={!canEdit}
                    aria-label={`Nome da planilha ${sheet.name}`}
                    onFocus={() => {
                      if (sheet.id !== activeSheetId) refreshRows(sheet.id).catch(() => {});
                    }}
                    onChange={(event) => setSheets((current) => current.map((item) => (item.id === sheet.id ? { ...item, name: event.target.value } : item)))}
                    onBlur={(event) => canEdit && handleSheetNameCommit(sheet.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                    }}
                  />
                  {canEdit ? (
                    <div className={styles.sheetTabActions}>
                      <button type="button" onClick={() => handleDuplicateSheet(sheet.id)} aria-label={`Duplicar ${sheet.name}`} title="Duplicar planilha">Duplicar</button>
                      <button type="button" className={styles.deleteSheetButton} onClick={() => handleDeleteSheet(sheet.id)} aria-label={`Remover ${sheet.name}`} title="Remover planilha">
                        <CloseIcon size={11} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }) : (
              <span className={styles.emptyTab}>{sheetSearch ? 'Nenhuma planilha encontrada' : 'Nenhuma planilha'}</span>
            )}
          </div>
          {sheets.length > 1 ? (
            <div className={styles.sheetOrganizer}>
              <span>Atual: {activeSheetIndex >= 0 ? activeSheetIndex + 1 : '—'} de {sheets.length}</span>
              <span>Busca e duplicação ajudam a organizar muitas planilhas sem perder largura no grid.</span>
            </div>
          ) : null}
        </div>
      </header>

      {canEdit ? (
        <div className={styles.editorBar}>
          <div className={styles.toolbarStack}>
            <EditorToolbar disabled={!activeCell || !activeSheetId} onCommand={handleApplyFormat} />
            {selectedCount > 1 ? (
              <div className={styles.bulkActions}>
                <span>Seleção em lote</span>
                <button type="button" onClick={() => handleApplyFormat('removeFormat')}>Limpar</button>
                <button type="button" onClick={clearSelection}>Reduzir</button>
              </div>
            ) : null}
          </div>
          <div className={styles.cellFormulaBar}>
            <span>{activeColumn?.label || 'Célula'}</span>
            <input
              value={activeCellText}
              disabled={!activeCell || !activeSheetId}
              aria-label="Conteúdo da célula ativa"
              placeholder="Selecione uma célula para editar"
              onChange={(event) => handleActiveCellTextChange(event.target.value)}
              onBlur={commitActiveCellText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitActiveCellText();
                }
                if (event.key === 'Escape') event.currentTarget.blur();
              }}
            />
          </div>
          <div className={styles.editorMeta}>
            <span>{activeCellLabel}</span>
            <span>{rows.length} linhas</span>
            <span>{columns.length} colunas</span>
          </div>
        </div>
      ) : null}

      <div
        ref={sheetFrameRef}
        className={styles.sheetFrame}
        data-scrolled-x={scrollState.x || undefined}
        data-scrolled-y={scrollState.y || undefined}
        data-at-end-x={scrollState.endX || undefined}
        data-at-end-y={scrollState.endY || undefined}
      >
        {resizeState ? (
          <div
            className={styles.resizeGuide}
            style={{ '--resize-left': `${Math.max(0, resizeState.left)}px` }}
            aria-hidden="true"
          >
            <span>{resizeState.label} · {resizeState.width}px</span>
          </div>
        ) : null}
        <div
          ref={scrollerRef}
          className={styles.sheetScroller}
          style={{ '--sheet-min-width': `${sheetMinWidth}px` }}
          onWheel={handleSheetWheel}
          onScroll={handleSheetScroll}
        >
          {!activeSheetId && !rowsLoading ? (
            <div className={styles.noSheetState}>
              <div className={styles.noSheetCard}>
                <span>Planilhas pessoais</span>
                <strong>Comece com uma planilha zerada</strong>
                {canEdit ? <Button type="button" size="sm" onClick={handleAddSheet} disabled={creatingSheet}><PlusIcon size={14} /> Nova planilha</Button> : null}
              </div>
            </div>
          ) : (
            <table className={styles.sheetTable}>
              <colgroup>
                <col style={{ width: 54 }} />
                {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.indexHeader}>#</th>
                  {columns.map((column, columnIndex) => {
                    const columnInSelection = selectionBounds && columnIndex >= selectionBounds.columnFrom && columnIndex <= selectionBounds.columnTo && selectedCount > 1;
                    const columnActive = activeCell?.key === column.key;
                    return (
                      <th
                        key={column.key}
                        data-saving={savingColumn === column.key || undefined}
                        data-selected-column={columnInSelection || undefined}
                        data-active-column={columnActive || undefined}
                        data-resizing-column={resizeState?.key === column.key || undefined}
                        data-compact-column={column.width <= COMPACT_COLUMN_WIDTH || undefined}
                      >
                      <HeaderCell
                        column={column}
                        editable={canEdit}
                        onLabelChange={handleColumnLabelChange}
                        resizing={resizeState?.key === column.key}
                        compact={column.width <= COMPACT_COLUMN_WIDTH}
                        onLabelCommit={handleColumnLabelCommit}
                        onResizeStart={handleResizeStart}
                        onContextMenu={openContextMenu}
                      />
                    </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr><td colSpan={columns.length + 1} className={styles.emptyState}>Carregando...</td></tr>
                ) : null}
                {!rowsLoading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className={styles.emptyState}>
                      <div className={styles.emptySheetContent}>
                        <span>Planilha vazia</span>
                        {canEdit ? (
                          <div>
                            <button type="button" onClick={handleAddRow} disabled={creatingRow}>Nova linha</button>
                            <button type="button" onClick={handleAddColumn} disabled={creatingColumn}>Nova coluna</button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {rows.map((row, index) => {
                  const rowInSelection = selectionBounds && index >= selectionBounds.rowFrom && index <= selectionBounds.rowTo && selectedCount > 1;
                  const rowActive = activeCell?.rowId === row.id;
                  return (
                    <tr key={row.id} data-selected-row={rowInSelection || undefined} data-active-row={rowActive || undefined}>
                    <td
                      className={styles.rowIndex}
                      data-range={rowInSelection || undefined}
                      data-active-row={rowActive || undefined}
                      onClick={() => selectRow(row.id)}
                      onContextMenu={(event) => openContextMenu(event, row.id, null)}
                    >
                      {index + 1}
                    </td>
                    {columns.map((column, columnIndex) => {
                      const inRange = selectedCellIds.has(cellId(row.id, column.key));
                      const rangeEdges = selectionBounds && inRange ? {
                        top: index === selectionBounds.rowFrom,
                        bottom: index === selectionBounds.rowTo,
                        left: columnIndex === selectionBounds.columnFrom,
                        right: columnIndex === selectionBounds.columnTo,
                      } : null;
                      return (
                      <td key={column.key} data-column={column.key} data-active-column={activeCell?.key === column.key || undefined} data-selected-column={selectionBounds && columnIndex >= selectionBounds.columnFrom && columnIndex <= selectionBounds.columnTo && selectedCount > 1 || undefined} data-resizing-column={resizeState?.key === column.key || undefined} data-compact-column={column.width <= COMPACT_COLUMN_WIDTH || undefined}>
                        <SheetCell
                          row={row}
                          column={column}
                          editable={canEdit}
                          selected={activeCell?.rowId === row.id && activeCell?.key === column.key}
                          selectedGroup={inRange}
                          rangeEdges={rangeEdges}
                          saving={savingCell === `${row.id}:${column.key}` || savingCell === 'bulk-selection'}
                          onSelect={selectCell}
                          onChange={handleCellChange}
                          onCommit={handleCellCommit}
                          onNavigate={navigateCell}
                          onContextMenu={openContextMenu}
                          onPasteTable={handlePasteTable}
                        />
                      </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <footer className={styles.panelFooter}>
        <span className={styles.footerSync} data-status={syncState.status}><SaveIcon size={13} /> {syncState.detail || 'Salvamento automático'}{syncTime ? ` · ${syncTime}` : ''}</span>
        <span>{resizeState ? `Redimensionando ${resizeState.label}: ${resizeState.width}px · ` : ''}{selectedCount > 1 ? `${selectedCount} células selecionadas${selectionLabel ? ` · ${selectionLabel}` : ''} · ` : ''}{rows.length} linha{rows.length === 1 ? '' : 's'} · {columns.length} coluna{columns.length === 1 ? '' : 's'}</span>
      </footer>

      <input
        ref={importFileRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
        className={styles.fileInput}
        onChange={handleImportFile}
      />
      <ImportDialog
        open={importOpen}
        text={importText}
        delimiter={importDelimiter}
        preview={importPreview}
        disabled={!importPreview.cells || !activeSheetId}
        onTextChange={setImportText}
        onDelimiterChange={setImportDelimiter}
        onClose={() => setImportOpen(false)}
        onApply={handleApplyImport}
        onPickFile={() => importFileRef.current?.click()}
      />

      <SheetContextMenu
        menu={contextMenu}
        canEdit={canEdit}
        onClose={closeContextMenu}
        onAddRow={handleAddRow}
        onAddColumn={handleAddColumn}
        onInsertRow={handleInsertRow}
        onInsertColumn={handleInsertColumn}
        onDuplicateRow={handleDuplicateRow}
        onDuplicateColumn={handleDuplicateColumn}
        onSelectRow={selectRow}
        onSelectColumn={selectColumn}
        onClearSelection={clearSelection}
        onDeleteRow={handleDeleteRow}
        onDeleteColumn={handleDeleteColumn}
      />
    </section>
  );
}
