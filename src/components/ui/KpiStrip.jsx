import styles from './KpiStrip.module.css';

export default function KpiStrip({ items = [], className = '' }) {
  return (
    <section className={[styles.strip, className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <article key={item.label} className={styles.item}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.meta ? <em>{item.meta}</em> : null}
        </article>
      ))}
    </section>
  );
}
