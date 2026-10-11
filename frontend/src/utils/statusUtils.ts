import {
  Clock,
  PlayCircle,
  CheckCircle,
  Send,
  ThumbsUp,
  XCircle,
  Archive,
  AlertCircle,
  Minus,
  Equal,
  ChevronUp,
  AlertTriangle,
  LucideIcon,
} from 'lucide-react';

// Type definitions
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'reviewed'
  | 'in_review';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface StatusConfig {
  label: string;
  bgColor: string;
  textColor: string;
  icon: LucideIcon;
}

export interface PriorityConfig {
  label: string;
  bgColor: string;
  textColor: string;
  icon: LucideIcon;
}

// Status configurations for tasks
export const taskStatusConfig: Record<string, StatusConfig> = {
  pending: {
    label: 'Pending',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-700',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: PlayCircle,
  },
  completed: {
    label: 'Completed',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: CheckCircle,
  },
  submitted: {
    label: 'Submitted',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    icon: Send,
  },
  approved: {
    label: 'Approved',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    icon: ThumbsUp,
  },
  rejected: {
    label: 'Rejected',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: XCircle,
  },
  archived: {
    label: 'Archived',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    icon: Archive,
  },
  reviewed: {
    label: 'Reviewed',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    icon: CheckCircle,
  },
  in_review: {
    label: 'In Review',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    icon: Clock,
  },
};

// Default status configuration for unknown statuses
const defaultStatusConfig: StatusConfig = {
  label: 'Unknown',
  bgColor: 'bg-gray-100',
  textColor: 'text-gray-600',
  icon: AlertCircle,
};

// Priority configurations
export const priorityConfig: Record<string, PriorityConfig> = {
  low: {
    label: 'Low',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-600',
    icon: Minus,
  },
  medium: {
    label: 'Medium',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    icon: Equal,
  },
  high: {
    label: 'High',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    icon: ChevronUp,
  },
  urgent: {
    label: 'Urgent',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: AlertTriangle,
  },
};

// Default priority configuration for unknown priorities
const defaultPriorityConfig: PriorityConfig = {
  label: 'Unknown',
  bgColor: 'bg-gray-100',
  textColor: 'text-gray-600',
  icon: Minus,
};

/**
 * Get the status configuration for a given status
 * @param status - The task status string
 * @returns StatusConfig object with label, colors, and icon
 */
export function getStatusConfig(status: string): StatusConfig {
  return taskStatusConfig[status] || defaultStatusConfig;
}

/**
 * Get the priority configuration for a given priority
 * @param priority - The task priority string
 * @returns PriorityConfig object with label, colors, and icon
 */
export function getPriorityConfig(priority: string): PriorityConfig {
  return priorityConfig[priority] || defaultPriorityConfig;
}

/**
 * Get the combined CSS color classes for a status (for inline badges)
 * @param status - The task status string
 * @returns CSS class string with background and text colors
 */
export function getStatusColor(status: string): string {
  const config = getStatusConfig(status);
  return `${config.bgColor} ${config.textColor}`;
}

/**
 * Get the combined CSS color classes for a priority (for inline badges)
 * @param priority - The task priority string
 * @returns CSS class string with background and text colors
 */
export function getPriorityColor(priority: string): string {
  const config = getPriorityConfig(priority);
  return `${config.bgColor} ${config.textColor}`;
}

/**
 * Get the label for a given status
 * @param status - The task status string
 * @returns Human-readable status label
 */
export function getStatusLabel(status: string): string {
  const config = getStatusConfig(status);
  return config.label;
}

/**
 * Get the label for a given priority
 * @param priority - The task priority string
 * @returns Human-readable priority label
 */
export function getPriorityLabel(priority: string): string {
  const config = getPriorityConfig(priority);
  return config.label;
}

/**
 * Get the icon component for a given status
 * @param status - The task status string
 * @returns Lucide icon component
 */
export function getStatusIcon(status: string): LucideIcon {
  const config = getStatusConfig(status);
  return config.icon;
}

/**
 * Get the icon component for a given priority
 * @param priority - The task priority string
 * @returns Lucide icon component
 */
export function getPriorityIcon(priority: string): LucideIcon {
  const config = getPriorityConfig(priority);
  return config.icon;
}

/**
 * Format a status string for display (removes underscores, capitalizes)
 * @param status - The task status string
 * @returns Formatted status string
 */
export function formatStatusDisplay(status: string): string {
  return getStatusLabel(status);
}

/**
 * Check if a status is considered "active" (task is being worked on)
 * @param status - The task status string
 * @returns boolean indicating if status is active
 */
export function isActiveStatus(status: string): boolean {
  return ['in_progress', 'in_review'].includes(status);
}

/**
 * Check if a status is considered "complete" (task is finished)
 * @param status - The task status string
 * @returns boolean indicating if status is complete
 */
export function isCompleteStatus(status: string): boolean {
  return ['completed', 'approved', 'reviewed'].includes(status);
}

/**
 * Check if a status requires attention (needs review or is rejected)
 * @param status - The task status string
 * @returns boolean indicating if status needs attention
 */
export function needsAttention(status: string): boolean {
  return ['submitted', 'rejected'].includes(status);
}

/**
 * Check if a priority is considered high priority
 * @param priority - The task priority string
 * @returns boolean indicating if priority is high
 */
export function isHighPriority(priority: string): boolean {
  return ['high', 'urgent'].includes(priority);
}
