import Button from '../../components/ui/Button.jsx';
import styles from './WorkspaceApp.module.css';

export default function WorkspaceConfirmDialog({ state, onCancel }) {
  if (!state) return null;

  async function handleConfirm() {
    await state.onConfirm?.();
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-label={state.title || 'Confirmar ação'}>
        <span>Confirmar ação</span>
        <h2>{state.title || 'Confirmar ação?'}</h2>
        <p>{state.description || 'Esta ação não poderá ser desfeita.'}</p>
        <div className={styles.dialogActions}>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="button" size="sm" variant="danger" onClick={handleConfirm}>{state.confirmLabel || 'Confirmar'}</Button>
        </div>
      </div>
    </div>
  );
}
