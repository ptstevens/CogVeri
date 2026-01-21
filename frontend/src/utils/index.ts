// Utility functions and configurations
// Centralized exports for the Revui frontend

export {
  // Type definitions
  type TaskStatus,
  type Priority,
  type StatusConfig,
  type PriorityConfig,
  // Configuration objects
  taskStatusConfig,
  priorityConfig,
  // Helper functions
  getStatusConfig,
  getPriorityConfig,
  getStatusColor,
  getPriorityColor,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  formatStatusDisplay,
  isActiveStatus,
  isCompleteStatus,
  needsAttention,
  isHighPriority,
} from './statusUtils';
