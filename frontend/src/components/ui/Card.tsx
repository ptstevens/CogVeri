interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
  /** Whether to add default padding (default: true when title/subtitle present) */
  noPadding?: boolean;
}

const Card = ({
  children,
  title,
  subtitle,
  actions,
  className = '',
  hoverable = false,
  onClick,
  noPadding = false,
}: CardProps) => {
  const hoverClass = hoverable
    ? 'hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer'
    : '';

  const hasHeader = title || subtitle || actions;
  // Add padding when there's a header, unless explicitly disabled or custom padding in className
  const needsPadding = hasHeader && !noPadding && !className.includes('p-');

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${hoverClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {hasHeader && (
        <div className={`${needsPadding ? 'px-6 pt-6' : ''} pb-4`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
              {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            </div>
            {actions && <div className="flex-shrink-0">{actions}</div>}
          </div>
        </div>
      )}
      <div className={needsPadding ? 'px-6 pb-6' : ''}>{children}</div>
    </div>
  );
};

export default Card;
