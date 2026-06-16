import './bare-components.css';

export default function BareMetric({ label, value, hint, tone = 'neutral', className = '' }) {
  return (
    <article className={`bareMetric bareMetric_${tone} ${className}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}
