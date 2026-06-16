import styles from './Button.module.css';

export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  iconOnly = false,
  ...props
}) {
  const classes = [
    styles.button,
    styles[`variant_${variant}`] || styles.variant_secondary,
    styles[`size_${size}`] || styles.size_md,
    iconOnly ? styles.iconOnly : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
