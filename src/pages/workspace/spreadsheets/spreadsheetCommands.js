export function buildSpreadsheetCommands({ activeSheetId, selectedCell, onAddRow, onAddColumn, onClearCell }) {
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
      id: 'clear-cell',
      label: 'Limpar célula',
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
  onPasteCell,
  onClearCell,
  onEditCell,
  onDeleteRow,
  onDeleteColumn,
}) {
  if (!activeSheetId || !context) return [];

  if (context.type === 'column') {
    return [
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
