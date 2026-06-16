import './bare-components.css';

export default function BareBadge({ tone = 'neutral', className = '', children, ...props }) {
  return (
    <span className={`bareBadge bareBadge_${tone} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
