import styles from './Avatar.module.css';

function initialsFrom(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return '—';
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase();
}

export default function Avatar({
  src,
  name = '',
  size = 'md',
  className = '',
  fallbackColor,
  ...rest
}) {
  const classes = [styles.avatar, styles[`size_${size}`] || styles.size_md, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={fallbackColor ? { '--avatar-bg': fallbackColor } : undefined} {...rest}>
      {src ? <img src={src} alt={name || ''} /> : <span>{initialsFrom(name)}</span>}
    </span>
  );
}
