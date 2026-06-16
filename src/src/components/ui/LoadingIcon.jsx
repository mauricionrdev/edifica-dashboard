import styles from './LoadingIcon.module.css';

export default function LoadingIcon({ size = 'md', className = '', label = 'Carregando' }) {
  const classes = [styles.icon, styles[size] || styles.md, className].filter(Boolean).join(' ');

  return (
    <span className={classes} role="status" aria-label={label}>
      <span aria-hidden="true" />
    </span>
  );
}
