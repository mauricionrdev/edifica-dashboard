import styles from './MetricCard.module.css';

export default function MetricCard({
  label,
  value,
  detail,
  meta,
  icon: Icon,
  tone = 'neutral',
  progress,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  return (
    <article
      className={`${styles.card} ${styles[`tone_${tone}`] || styles.tone_neutral} ${dragging ? styles.dragging : ''}`.trim()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {Icon ? (
          <span className={styles.icon} aria-hidden="true">
            <Icon size={16} strokeWidth={1.8} />
          </span>
        ) : null}
      </div>
      <strong className={styles.value}>{value}</strong>
      <div className={styles.footer}>
        <span className={styles.detail}>{detail}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      {typeof progress === 'number' ? (
        <span className={styles.progress} aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
        </span>
      ) : null}
    </article>
  );
}
