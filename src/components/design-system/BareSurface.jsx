import './bare-components.css';

export default function BareSurface({ as: Component = 'section', className = '', children, ...props }) {
  return (
    <Component className={`bareSurface ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
