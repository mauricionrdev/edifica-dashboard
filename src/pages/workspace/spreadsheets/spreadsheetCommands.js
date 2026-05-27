export function buildSpreadsheetCommands({ activeSheetId, selectedCell, selectedRange, onAddRow, onAddColumn, onClearSelection, onCopySelection }) {
  return [
    {
      id: 'add-row',
      label: 'Adicionar linha',
      variant: 'secondary',
      canRun: Boolean(activeSheetId),
      run: onAddRow,
    },
    {
      id: 'add-column',
      label: 'Adicionar coluna',
      variant: 'secondary',
      canRun: Boolean(activeSheetId),
      run: onAddColumn,
    },
    {
      id: 'copy-selection',
      label: 'Copiar seleção',
      variant: 'secondary',
      canRun: Boolean(activeSheetId && selectedRange),
      run: onCopySelection,
    },
    {
      id: 'clear-selection',
      label: 'Limpar seleção',
      variant: 'secondary',
      canRun: Boolean(activeSheetId && (selectedRange || selectedCell)),
      run: onClearSelection,
    },
  ];
}

export function buildSpreadsheetContextCommands({
  activeSheetId,
  context,
  onAddRow,
  onAddColumn,
  onInsertRow,
  onInsertColumn,
  onDuplicateRow,
  onDuplicateColumn,
  onCopyCell,
  onCopySelection,
  onPasteCell,
  onClearSelection,
  onEditCell,
  onDeleteRow,
  onDeleteColumn,
  onSelectRow,
  onSelectColumn,
}) {
  if (!activeSheetId || !context) return [];

  if (context.type === 'column') {
    return [
      {
        id: 'select-column',
        label: 'Selecionar coluna',
        canRun: Boolean(context.colIndex !== undefined),
        run: () => onSelectColumn?.(context.colIndex),
      },
      {
        id: 'copy-column',
        label: 'Copiar coluna',
        shortcut: 'Ctrl C',
        canRun: true,
        run: onCopySelection,
      },
      {
        id: 'insert-column-before',
        label: 'Inserir à esquerda',
        canRun: Boolean(context.colIndex !== undefined),
        run: () => onInsertColumn?.(context.colIndex, 'before'),
      },
      {
        id: 'insert-column-after',
        label: 'Inserir à direita',
        canRun: Boolean(context.colIndex !== undefined),
        run: () => onInsertColumn?.(context.colIndex, 'after'),
      },
      {
        id: 'duplicate-column',
        label: 'Duplicar coluna',
        canRun: Boolean(context.column),
        run: () => onDuplicateColumn?.(context),
      },
      {
        id: 'add-column',
        label: 'Adicionar no fim',
        canRun: true,
        run: onAddColumn,
      },
      {
        id: 'delete-column',
        label: 'Excluir coluna',
        variant: 'danger',
        canRun: Boolean(context.column),
        run: () => onDeleteColumn?.(context.column),
      },
    ];
  }

  if (context.type === 'row') {
    return [
      {
        id: 'select-row',
        label: 'Selecionar linha',
        canRun: Boolean(context.rowIndex !== undefined),
        run: () => onSelectRow?.(context.rowIndex),
      },
      {
        id: 'copy-row',
        label: 'Copiar linha',
        shortcut: 'Ctrl C',
        canRun: true,
        run: onCopySelection,
      },
      {
        id: 'insert-row-before',
        label: 'Inserir acima',
        canRun: Boolean(context.rowIndex !== undefined),
        run: () => onInsertRow?.(context.rowIndex, 'before'),
      },
      {
        id: 'insert-row-after',
        label: 'Inserir abaixo',
        canRun: Boolean(context.rowIndex !== undefined),
        run: () => onInsertRow?.(context.rowIndex, 'after'),
      },
      {
        id: 'duplicate-row',
        label: 'Duplicar linha',
        canRun: Boolean(context.row),
        run: () => onDuplicateRow?.(context),
      },
      {
        id: 'add-row',
        label: 'Adicionar no fim',
        canRun: true,
        run: onAddRow,
      },
      {
        id: 'delete-row',
        label: 'Excluir linha',
        variant: 'danger',
        canRun: Boolean(context.row),
        run: () => onDeleteRow?.(context.row),
      },
    ];
  }

  return [
    {
      id: 'edit-cell',
      label: 'Editar célula',
      shortcut: 'Enter',
      canRun: Boolean(context.column),
      run: () => onEditCell?.(context.rowIndex, context.column?.key, context.colIndex),
    },
    {
      id: 'copy-cell',
      label: 'Copiar célula',
      shortcut: 'Ctrl C',
      canRun: Boolean(context.column),
      run: () => onCopyCell?.(context),
    },
    {
      id: 'copy-selection',
      label: 'Copiar seleção',
      canRun: true,
      run: onCopySelection,
    },
    {
      id: 'paste-cell',
      label: 'Colar texto',
      shortcut: 'Ctrl V',
      canRun: Boolean(context.column && typeof navigator !== 'undefined' && navigator.clipboard?.readText),
      run: () => onPasteCell?.(context),
    },
    {
      id: 'clear-selection',
      label: 'Limpar seleção',
      canRun: Boolean(context.column),
      run: () => onClearSelection?.(context),
    },
    {
      id: 'insert-row-after',
      label: 'Inserir linha abaixo',
      canRun: Boolean(context.rowIndex !== undefined),
      run: () => onInsertRow?.(context.rowIndex, 'after'),
    },
    {
      id: 'insert-column-after',
      label: 'Inserir coluna à direita',
      canRun: Boolean(context.colIndex !== undefined),
      run: () => onInsertColumn?.(context.colIndex, 'after'),
    },
    {
      id: 'delete-row',
      label: 'Excluir linha',
      variant: 'danger',
      canRun: Boolean(context.row),
      run: () => onDeleteRow?.(context.row),
    },
    {
      id: 'delete-column',
      label: 'Excluir coluna',
      variant: 'danger',
      canRun: Boolean(context.column),
      run: () => onDeleteColumn?.(context.column),
    },
  ];
}
