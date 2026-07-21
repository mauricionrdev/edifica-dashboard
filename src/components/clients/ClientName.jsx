import styles from './ClientName.module.css';

export function isPremiumClient(client) {
  if (!client || typeof client !== 'object') return false;
  const value = client.isPremium ?? client.premium ?? client.clientePremium ?? client.cliente_premium ?? client.is_premium;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function PremiumBadge({ className = '' }) {
  return <span className={`${styles.premiumBadge} ${className}`.trim()}>Premium</span>;
}

export default function ClientName({
  client,
  name,
  as: Tag = 'span',
  className = '',
  ...rest
}) {
  const label = String(name ?? client?.name ?? client?.clientName ?? client?.client_name ?? 'Cliente').trim() || 'Cliente';

  return (
    <Tag className={`${styles.clientName} ${className}`.trim()} {...rest}>
      <span className={styles.nameText}>{label}</span>
      {isPremiumClient(client) ? <PremiumBadge /> : null}
    </Tag>
  );
}
