import { LucideIcon, Inbox } from 'lucide-react';
import Button from './Button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  size = 'md',
}: EmptyStateProps) => {
  const sizeClasses = {
    sm: {
      container: 'py-8 px-4',
      icon: 'h-10 w-10',
      iconContainer: 'p-3',
      title: 'text-base',
      description: 'text-sm',
    },
    md: {
      container: 'py-12 px-6',
      icon: 'h-12 w-12',
      iconContainer: 'p-4',
      title: 'text-lg',
      description: 'text-sm',
    },
    lg: {
      container: 'py-16 px-8',
      icon: 'h-16 w-16',
      iconContainer: 'p-5',
      title: 'text-xl',
      description: 'text-base',
    },
  };

  const styles = sizeClasses[size];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${styles.container} ${className}`}
    >
      {/* Icon */}
      <div
        className={`${styles.iconContainer} bg-gray-100 rounded-full mb-4`}
      >
        <Icon className={`${styles.icon} text-gray-400`} />
      </div>

      {/* Title */}
      <h3 className={`${styles.title} font-semibold text-gray-900 mb-2`}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={`${styles.description} text-gray-500 max-w-sm mb-6`}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button
              variant={action.variant || 'primary'}
              onClick={action.onClick}
              size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
            >
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'ghost'}
              onClick={secondaryAction.onClick}
              size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
            >
              {secondaryAction.icon && (
                <secondaryAction.icon className="h-4 w-4 mr-2" />
              )}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
