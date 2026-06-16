import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons.jsx';
import Button from './Button.jsx';
import styles from './Dialog.module.css';

export default function Dialog({ open, title, children, footer, onClose, className = '' }) {
  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} role="presentation">
      <section className={[styles.dialog, className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.header}>
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} />
          </Button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </section>
    </div>,
    document.body
  );
}
