import { CameraIcon, TrashIcon } from '../ui/Icons.jsx';
import { clientInitials } from '../../utils/clientHelpers.js';
import styles from './AvatarTab.module.css';

export default function AvatarTab({
  client,
  avatarUrl = '',
  canManageAvatar = false,
  onPickAvatar,
  onRemoveAvatar,
}) {
  if (!client) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.avatarCard}>
        <div className={styles.avatarPreview}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(client.name)}
        </div>

        <div className={styles.avatarInfo}>
          <span>Imagem do cliente</span>
          <strong>{client.name}</strong>
        </div>

        {canManageAvatar ? (
          <div className={styles.actions}>
            <button type="button" onClick={onPickAvatar}>
              <CameraIcon size={14} />
              Enviar imagem
            </button>
            {avatarUrl ? (
              <button type="button" className={styles.dangerButton} onClick={onRemoveAvatar}>
                <TrashIcon size={14} />
                Remover imagem
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
