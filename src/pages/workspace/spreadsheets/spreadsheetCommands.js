export function buildSpreadsheetCommands({ activeSheetId, selectedCell, selectedRange, onAddRow, onAddColumn, onClearCell, onCopySelection }) {
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
      id: 'clear-cell',
      label: 'Limpar',
      variant: 'secondary',
      canRun: Boolean(activeSheetId && selectedCell),
      run: onClearCell,
    },
  ];
}

export function buildSpreadsheetContextCommands({
  activeSheetId,
  context,
  onAddRow,
  onAddColumn,
  onCopyCell,
  onCopySelection,
  onPasteCell,
  onClearCell,
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
        canRun: true,
        run: onCopySelection,
      },
      {
        id: 'add-column',
        label: 'Adicionar coluna',
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
        canRun: true,
        run: onCopySelection,
      },
      {
        id: 'add-row',
        label: 'Adicionar linha',
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
      id: 'clear-cell',
      label: 'Limpar célula',
      canRun: Boolean(context.column),
      run: () => onClearCell?.(context),
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
