export default function BareButton({ as: Tag = 'button', variant = 'secondary', className = '', children, ...props }) {
  return (
    <Tag className={['btButton', className].filter(Boolean).join(' ')} data-variant={variant} {...props}>
      {children}
    </Tag>
  );
}
