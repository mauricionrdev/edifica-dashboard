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
