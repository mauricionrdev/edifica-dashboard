import styles from './Tabs.module.css';

export default function Tabs({ tabs = [], value, onChange, className = '', ariaLabel = 'Abas' }) {
  return (
    <div className={[styles.tabs, className].filter(Boolean).join(' ')} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const active = String(tab.value) === String(value);
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => !tab.disabled && onChange?.(tab.value)}
            disabled={tab.disabled}
          >
            {tab.icon ? <span className={styles.icon}>{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {tab.count != null ? <strong>{tab.count}</strong> : null}
          </button>
        );
      })}
    </div>
  );
}
