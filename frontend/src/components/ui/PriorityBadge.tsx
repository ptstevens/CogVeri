import { LucideIcon } from 'lucide-react';
import { getPriorityConfig, type PriorityConfig } from '../../utils/statusUtils';

export type PriorityType = 'low' | 'medium' | 'high' | 'urgent' | string;

export interface PriorityBadgeProps {
  priority: PriorityType;
  size?: 'sm' | 'md';
  variant?: 'solid' | 'subtle';
  showIcon?: boolean;
  className?: string;
  customLabel?: string;
}

// Extended config with variant colors
interface ExtendedPriorityConfig extends PriorityConfig {
  solid: {
    bg: string;
    text: string;
  };
  subtle: {
    bg: string;
    text: string;
  };
}

const priorityConfigs: Record<string, ExtendedPriorityConfig> = {
  low: {
    label: 'Low',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-600',
    icon: getPriorityConfig('low').icon,
    solid: {
      bg: 'bg-slate-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
    },
  },
  medium: {
    label: 'Medium',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    icon: getPriorityConfig('medium').icon,
    solid: {
      bg: 'bg-amber-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
    },
  },
  high: {
    label: 'High',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    icon: getPriorityConfig('high').icon,
    solid: {
      bg: 'bg-orange-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
    },
  },
  urgent: {
    label: 'Urgent',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: getPriorityConfig('urgent').icon,
    solid: {
      bg: 'bg-red-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-red-100',
      text: 'text-red-800',
    },
  },
};

const defaultConfig: ExtendedPriorityConfig = {
  label: 'Unknown',
  bgColor: 'bg-gray-100',
  textColor: 'text-gray-600',
  icon: getPriorityConfig('low').icon,
  solid: {
    bg: 'bg-gray-500',
    text: 'text-white',
  },
  subtle: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
  },
};

const PriorityBadge = ({
  priority,
  size = 'md',
  variant = 'subtle',
  showIcon = true,
  className = '',
  customLabel,
}: PriorityBadgeProps) => {
  const config = priorityConfigs[priority] || defaultConfig;
  const Icon: LucideIcon = config.icon;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
  };

  const colorClasses = variant === 'solid' ? config.solid : config.subtle;
  const label = customLabel || config.label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${sizeClasses[size]} ${colorClasses.bg} ${colorClasses.text} ${className}`}
    >
      {showIcon && <Icon className={iconSizeClasses[size]} />}
      <span>{label}</span>
    </span>
  );
};

export default PriorityBadge;
