export default function BareBadge({ tone = 'neutral', className = '', children, ...props }) {
  return (
    <span className={['btBadge', className].filter(Boolean).join(' ')} data-tone={tone} {...props}>
      {children}
    </span>
  );
}
