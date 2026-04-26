import { clientInitials } from '../../utils/clientHelpers.js';
import { fmtMoney } from '../../utils/format.js';
import { resolveClientFeeAtDate } from '../../utils/feeSchedule.js';
import styles from './ClientDetailsTab.module.css';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export default function ClientDetailsTab({
  client,
  avatarUrl = '',
  avatarBg,
  canManageAvatar = false,
  avatarInputRef,
  onAvatarFile,
  onRemoveAvatar,
}) {
  if (!client) return null;

  const rows = [
    ['Cliente', client.name || '—'],
    ['Status', client.status === 'churn' ? 'Churn' : 'Ativo'],
    ['Squad', client.squadName || '—'],
    ['GDV', client.gdvName || '—'],
    ['Gestor', client.gestor || '—'],
    ['Mensalidade atual', fmtMoney(resolveClientFeeAtDate(client))],
    ['Meta base', fmtMoney(client.metaLucro || 0)],
    ['Início', formatDate(client.startDate)],
    ['Término', formatDate(client.endDate)],
    ['Criado em', formatDate(client.createdAt)],
  ];

  return (
    <div className={styles.panel}>
      <section className={styles.photoSection}>
        <div
          className={styles.avatarPreview}
          style={{ background: avatarBg }}
          aria-label={`Avatar de ${client.name}`}
        >
          {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(client.name)}
        </div>

        <div className={styles.photoActions}>
          <strong>Foto do cliente</strong>
          <div className={styles.actionsRow}>
            {canManageAvatar ? (
              <>
                <button type="button" className={styles.actionButton} onClick={() => avatarInputRef?.current?.click()}>
                  Alterar foto
                </button>
                {avatarUrl ? (
                  <button type="button" className={styles.actionButtonMuted} onClick={onRemoveAvatar}>
                    Remover
                  </button>
                ) : null}
              </>
            ) : (
              <span className={styles.readonly}>Somente super admin</span>
            )}
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={onAvatarFile}
            hidden
          />
        </div>
      </section>

      <section className={styles.detailsGrid} aria-label="Detalhes do cliente">
        {rows.map(([label, value]) => (
          <div key={label} className={styles.detailItem}>
            <span>{label}</span>
            <strong title={value}>{value}</strong>
          </div>
        ))}
      </section>
    </div>
  );
}
