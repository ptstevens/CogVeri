interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

const Card = ({
  children,
  title,
  subtitle,
  actions,
  className = '',
  hoverable = false,
  onClick,
}: CardProps) => {
  const hoverClass = hoverable ? 'card-hover cursor-pointer' : '';

  return (
    <div
      className={`card ${hoverClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title || subtitle || actions) && (
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <div>
              {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
              {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            </div>
            {actions && <div className="ml-4">{actions}</div>}
          </div>
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};

export default Card;