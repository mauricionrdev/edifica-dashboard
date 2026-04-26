import styles from './Button.module.css';

export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  const classes = [
    styles.button,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
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
