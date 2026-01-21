import {
  Clock,
  PlayCircle,
  CheckCircle,
  Send,
  ThumbsUp,
  XCircle,
  Archive,
  AlertCircle,
  LucideIcon,
  FileEdit,
  UserCheck,
  Eye,
  Star,
} from 'lucide-react';

export type StatusType =
  | 'draft'
  | 'assigned'
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'in_review'
  | 'completed'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'archived'
  | string;

export interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
  variant?: 'solid' | 'subtle';
  showIcon?: boolean;
  className?: string;
  customLabel?: string;
}

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  solid: {
    bg: string;
    text: string;
  };
  subtle: {
    bg: string;
    text: string;
  };
}

const statusConfigs: Record<string, StatusConfig> = {
  draft: {
    label: 'Draft',
    icon: FileEdit,
    solid: {
      bg: 'bg-gray-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
    },
  },
  assigned: {
    label: 'Assigned',
    icon: UserCheck,
    solid: {
      bg: 'bg-yellow-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
    },
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    solid: {
      bg: 'bg-yellow-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
    },
  },
  in_progress: {
    label: 'In Progress',
    icon: PlayCircle,
    solid: {
      bg: 'bg-blue-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
    },
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    solid: {
      bg: 'bg-green-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-green-100',
      text: 'text-green-800',
    },
  },
  submitted: {
    label: 'Awaiting Review',
    icon: Send,
    solid: {
      bg: 'bg-purple-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-purple-100',
      text: 'text-purple-800',
    },
  },
  in_review: {
    label: 'In Review',
    icon: Eye,
    solid: {
      bg: 'bg-amber-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
    },
  },
  reviewed: {
    label: 'Reviewed',
    icon: Star,
    solid: {
      bg: 'bg-green-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-green-100',
      text: 'text-green-800',
    },
  },
  approved: {
    label: 'Approved',
    icon: ThumbsUp,
    solid: {
      bg: 'bg-emerald-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-emerald-100',
      text: 'text-emerald-800',
    },
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    solid: {
      bg: 'bg-red-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-red-100',
      text: 'text-red-800',
    },
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    solid: {
      bg: 'bg-gray-500',
      text: 'text-white',
    },
    subtle: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
    },
  },
};

const defaultConfig: StatusConfig = {
  label: 'Unknown',
  icon: AlertCircle,
  solid: {
    bg: 'bg-gray-500',
    text: 'text-white',
  },
  subtle: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
  },
};

const StatusBadge = ({
  status,
  size = 'md',
  variant = 'subtle',
  showIcon = true,
  className = '',
  customLabel,
}: StatusBadgeProps) => {
  const config = statusConfigs[status] || defaultConfig;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1.5',
    md: 'px-2.5 py-1 text-sm gap-2',
  };

  // NOTE: Icon size classes available for future use
  // const iconSizeClasses = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2' };

  // Enterprise "Dot" style badges are typically subtle backgrounds with a colored dot
  // We override solid/subtle to map to our new enterprise style
  // The 'solid' prop from config is used for the dot color
  // The 'subtle' prop from config is used for the bg/text

  // Extract base color from the existing config classes (heuristic mapping since we used tailwind classes in config)
  // Actually, let's just stick to the subtle variant which is standard for enterprise badges, but strictly enforced.

  // Using ring-1 and bg-opacity-50 for that "modern SaaS" look
  const colorClasses = variant === 'solid' ? config.solid : config.subtle;
  const label = customLabel || config.label;

  // We want a dot if showIcon is true, but instead of the Lucide Icon, we use a simple dot for the "modern" look?
  // User asked for "Enterprise Grade". Usually that means a colored dot.
  // Let's use the Lucide icon if it's semantic (like Check), or a dot if it's state (like Pending).
  // For now, I'll keep the Lucide Icon but make it smaller and maybe use the dot style if variant is strictly "dot" (which isn't in props yet).
  // Let's stick to the existing props but refine styling.

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ring-1 ring-inset ${sizeClasses[size]} ${colorClasses.bg} ${colorClasses.text} ${className.includes('ring') ? '' : 'ring-black/10'} ${className}`}
    >
      {showIcon && <Icon className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </span>
  );
};

export default StatusBadge;
