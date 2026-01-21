import { z } from 'zod';

/**
 * Task validation schemas using Zod.
 * These schemas validate and transform incoming request data.
 */

// Task type enum matching the database enum
export const taskTypeSchema = z.enum(['recording', 'live_demo', 'hybrid']);

// Task status enum matching the database enum
export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'submitted',
  'awaiting_review',
  'in_review',
  'completed',
  'rejected',
  'reviewed',
]);

// Task priority enum
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

// UUID validation helper
const uuidSchema = z.string().uuid('Invalid UUID format');

// Common ID params schema
export const idParamSchema = z.object({
  id: uuidSchema,
});

// Create task schema
export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .trim(),
  description: z.string().max(5000, 'Description must be 5000 characters or less').optional(),
  type: taskTypeSchema,
  priority: taskPrioritySchema.default('medium'),
  assigned_to: uuidSchema.optional().nullable(),
  due_date: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.date().optional().nullable()
  ),
  estimated_duration: z.preprocess(
    // Convert 0, empty string, null, undefined to undefined (0 minutes doesn't make sense)
    (val) => (val === 0 || val === '' || val === null || val === undefined ? undefined : val),
    z.number().int().positive().optional()
  ),
  template_id: uuidSchema.optional().nullable(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  checklist: z
    .array(
      z.object({
        label: z.string().min(1).max(500),
        completed: z.boolean().default(false),
      })
    )
    .optional(),
  external_email: z.string().email('Invalid email format').optional().nullable(),
});

// Update task schema (all fields optional)
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(5000).optional(),
  type: taskTypeSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigned_to: uuidSchema.optional().nullable(),
  due_date: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.date().optional().nullable()
  ),
  estimated_duration: z.preprocess(
    // Convert 0, empty string, null, undefined to undefined (0 minutes doesn't make sense)
    (val) => (val === 0 || val === '' || val === null || val === undefined ? undefined : val),
    z.number().int().positive().optional()
  ),
  actual_duration: z.number().int().nonnegative().optional().nullable(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  checklist: z
    .array(
      z.object({
        label: z.string().min(1).max(500),
        completed: z.boolean().default(false),
      })
    )
    .optional(),
  archived: z.boolean().optional(),
});

// Get tasks query schema
export const getTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  assigned_to: uuidSchema.optional(),
  created_by: uuidSchema.optional(),
  type: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// Update task progress schema
export const updateTaskProgressSchema = z.object({
  status: taskStatusSchema.optional(),
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
