import styles from './StateBlock.module.css';

function iconFor(variant) {
  if (variant === 'loading') return '○';
  if (variant === 'error') return '!';
  return '•';
}

export default function StateBlock({
  variant = 'empty',
  title,
  description,
  action = null,
  compact = false,
  className = '',
}) {
  const classes = [
    styles.block,
    styles[variant] || '',
    compact ? styles.compact : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role={variant === 'error' ? 'alert' : 'status'}>
      <div className={styles.badge} aria-hidden="true">
        {iconFor(variant)}
      </div>
      <div className={styles.body}>
        {title ? <div className={styles.title}>{title}</div> : null}
        {description ? <div className={styles.description}>{description}</div> : null}
        {action ? <div className={styles.actions}>{action}</div> : null}
      </div>
    </div>
  );
}
