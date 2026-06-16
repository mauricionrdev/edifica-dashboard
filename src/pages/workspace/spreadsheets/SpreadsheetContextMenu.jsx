import styles from '../WorkspaceApp.module.css';

export default function SpreadsheetContextMenu({ menu, commands = [], onClose }) {
  if (!menu || !commands.length) return null;

  return (
    <div className={styles.contextBackdrop} onClick={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className={styles.contextMenu}
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        aria-label={menu.label || 'Menu da planilha'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.contextHeader}>
          <span>{menu.title}</span>
          <strong>{menu.subtitle}</strong>
        </div>
        <div className={styles.contextList}>
          {commands.map((command) => (
            <button
              key={command.id}
              type="button"
              role="menuitem"
              className={styles.contextItem}
              data-danger={command.variant === 'danger'}
              disabled={!command.canRun}
              onClick={async () => {
                if (!command.canRun) return;
                await command.run?.();
                if (command.closeOnRun !== false) onClose?.();
              }}
            >
              <span>{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
