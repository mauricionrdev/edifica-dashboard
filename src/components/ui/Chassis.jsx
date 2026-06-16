import styles from './Chassis.module.css';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function PageShell({ className = '', children, ...props }) {
  return <section className={cx(styles.pageShell, className)} {...props}>{children}</section>;
}

export function PageHeader({ className = '', children, ...props }) {
  return <header className={cx(styles.pageHeader, className)} {...props}>{children}</header>;
}

export function Panel({ className = '', children, ...props }) {
  return <section className={cx(styles.panel, className)} {...props}>{children}</section>;
}

export function PanelHeader({ className = '', children, ...props }) {
  return <div className={cx(styles.panelHeader, className)} {...props}>{children}</div>;
}

export function PanelBody({ className = '', children, ...props }) {
  return <div className={cx(styles.panelBody, className)} {...props}>{children}</div>;
}

export function Divider({ className = '', ...props }) {
  return <div className={cx(styles.divider, className)} {...props} />;
}
