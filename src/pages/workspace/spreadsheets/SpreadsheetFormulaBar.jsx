import styles from '../WorkspaceApp.module.css';

export default function SpreadsheetFormulaBar({ label, value, draft, editing, disabled, onChange, onFocus, onBlur, onKeyDown }) {
  return (
    <div className={styles.formulaBar}>
      <span className={styles.formulaBadge}>{label}</span>
      <input
        className={styles.formulaInput}
        value={editing ? draft : value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-label="Valor da célula"
      />
    </div>
  );
}
