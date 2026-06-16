import './bare-components.css';

export default function BareButton({ variant = 'secondary', size = 'md', className = '', children, ...props }) {
  return (
    <button className={`bareButton bareButton_${variant} bareButton_${size} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
