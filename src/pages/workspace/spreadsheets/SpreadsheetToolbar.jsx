import Button from '../../../components/ui/Button.jsx';
import styles from '../WorkspaceApp.module.css';

export default function SpreadsheetToolbar({ commands = [], rowCount = 0, columnCount = 0 }) {
  return (
    <div className={styles.sheetToolbar}>
      <div className={styles.sheetActions}>
        {commands.map((command) => (
          <Button
            key={command.id}
            type="button"
            size="sm"
            variant={command.variant || 'secondary'}
            onClick={command.run}
            disabled={!command.canRun}
          >
            {command.label}
          </Button>
        ))}
      </div>
      <span className={styles.sheetStatus}>{rowCount} linhas · {columnCount} colunas</span>
    </div>
  );
}
