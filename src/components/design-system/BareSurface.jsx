export default function BareSurface({ as: Tag = 'section', depth = 'soft', className = '', children, ...props }) {
  return (
    <Tag className={['btSurface', className].filter(Boolean).join(' ')} data-depth={depth} {...props}>
      {children}
    </Tag>
  );
}
