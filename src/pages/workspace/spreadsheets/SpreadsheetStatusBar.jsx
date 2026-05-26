import { rangeLabel, rangeSize } from './spreadsheetUtils.js';
import styles from '../WorkspaceApp.module.css';

export default function SpreadsheetStatusBar({ status, selectedRange, rowCount = 0, columnCount = 0 }) {
  const total = rangeSize(selectedRange);
  const label = rangeLabel(selectedRange);

  return (
    <div className={styles.sheetStatusBar}>
      <span>{status || 'Sincronizada'}</span>
      <span>{rowCount} linhas</span>
      <span>{columnCount} colunas</span>
      {label ? <span>{label}</span> : null}
      {total > 1 ? <span>{total} células</span> : null}
    </div>
  );
}
