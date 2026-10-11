import { z } from 'zod';

/**
 * Task validation schemas using Zod.
 * These schemas validate and transform incoming request data.
 */

// Task type enum matching the database enum
export const taskTypeSchema = z.enum(['recording', 'live_demo', 'hybrid']);

// Task status enum matching the DTO types used by task.service.ts
export const taskStatusSchema = z.enum([
  'draft',
  'assigned',
  'in_progress',
  'submitted',
  'in_review',
  'completed',
  'rejected',
]);

// Task priority enum
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

// UUID validation helper
const uuidSchema = z.string().uuid('Invalid UUID format');

// Optional UUID that handles empty strings from forms
const optionalUuidSchema = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  uuidSchema.optional()
);

// Common ID params schema
export const idParamSchema = z.object({
  id: uuidSchema,
});

// Create task schema - matches CreateTaskDto in task.service.ts
export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .trim(),
  description: z.string().max(5000, 'Description must be 5000 characters or less').optional(),
  type: taskTypeSchema,
  priority: taskPrioritySchema.optional(),
  assigned_to: optionalUuidSchema,
  reviewed_by: optionalUuidSchema,
  due_date: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.date().optional()
  ),
  estimated_duration: z.preprocess(
    // Convert 0, empty string, null, undefined to undefined (0 minutes doesn't make sense)
    (val) => (val === 0 || val === '' || val === null || val === undefined ? undefined : val),
    z.number().int().positive().optional()
  ),
  template_id: optionalUuidSchema,
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Update task schema (all fields optional) - matches UpdateTaskDto in task.service.ts
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigned_to: optionalUuidSchema,
  reviewed_by: optionalUuidSchema,
  due_date: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.date().optional()
  ),
  estimated_duration: z.preprocess(
    // Convert 0, empty string, null, undefined to undefined (0 minutes doesn't make sense)
    (val) => (val === 0 || val === '' || val === null || val === undefined ? undefined : val),
    z.number().int().positive().optional()
  ),
  actual_duration: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  archived: z.boolean().optional(),
  version: z.number().int().positive().optional(),
});

// Get tasks query schema
export const getTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  assigned_to: uuidSchema.optional(),
  created_by: uuidSchema.optional(),
  type: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  scope: z.enum(['mine', 'all']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// Update task progress schema
// Update task progress schema - limited status options for progress updates
export const updateTaskProgressSchema = z.object({
  status: z.enum(['completed', 'in_progress']).optional(),
  actual_duration: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

// Submit task schema
export const submitTaskSchema = z.object({
  recordingId: uuidSchema,
});

// Submit review schema
export const submitReviewSchema = z.object({
  status: z.enum(['completed', 'rejected']),
  feedback: z.string().max(5000).optional(),
});

// Type exports for use in controllers
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type GetTasksQuery = z.infer<typeof getTasksQuerySchema>;
export type UpdateTaskProgressInput = z.infer<typeof updateTaskProgressSchema>;
export type SubmitTaskInput = z.infer<typeof submitTaskSchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
