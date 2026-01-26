import { db } from '../config/database';
import { Knex } from 'knex';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';
// Import async context at top level (Fix #15 - avoid dynamic imports)
import { getAsyncContext } from '../middleware/asyncContext';
import recordingService from './recording.service';

export interface Task {
  id: string;
  organization_id: string;
  title: string;
  description?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  status:
    | 'draft'
    | 'assigned'
    | 'in_progress'
    | 'submitted'
    | 'in_review'
    | 'completed'
    | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string;
  created_by: string;
  reviewed_by?: string;
  due_date?: Date;
  completed_at?: Date;
  estimated_duration?: number;
  actual_duration?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  version: number; // Optimistic locking version
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string | null; // Optional for external link tasks
  reviewed_by?: string | null;
  due_date?: Date;
  estimated_duration?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?:
    | 'draft'
    | 'assigned'
    | 'in_progress'
    | 'submitted'
    | 'in_review'
    | 'completed'
    | 'rejected';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  reviewed_by?: string;
  due_date?: Date;
  estimated_duration?: number;
  actual_duration?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  archived?: boolean;
  version?: number; // For optimistic locking - REQUIRED for safe concurrent updates
}

// Constants
const ADMIN_ROLES = ['OWNER', 'ADMIN'] as const;
const MAX_TASKS_PER_PAGE = 100;
const DEFAULT_TASKS_PER_PAGE = 50;

class TaskService {
  /**
   * Get organization ID, preferring provided value, then falling back to async context
   */
  private getOrganizationId(provided?: string): string | undefined {
    if (provided) return provided;
    const context = getAsyncContext();
    return context?.organization_id;
  }

  /**
   * Clean UUID fields - convert empty strings to null
   */
  private cleanUuidFields(data: Record<string, any>, fields: string[]): void {
    fields.forEach((field) => {
      if (field in data) {
        const value = data[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          data[field] = null;
        }
      }
    });
  }

  /**
   * Clean timestamp fields - convert empty strings to null
   */
  private cleanTimestampFields(data: Record<string, any>, fields: string[]): void {
    fields.forEach((field) => {
      if (field in data) {
        const value = data[field];
        if (value === '' || value === null || value === undefined) {
          data[field] = null;
        }
      }
    });
  }

  /**
   * Check if user has admin privileges
   */
  private isAdmin(userRole: string): boolean {
    return ADMIN_ROLES.includes(userRole as typeof ADMIN_ROLES[number]);
  }

  /**
   * Creates a new task within an organization.
   * Automatically notifies the assigned user if different from the creator.
   * @param userId - The UUID of the user creating the task
   * @param taskData - The task details including title, description, type, and optional assignment
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns The newly created task object
   * @throws {BadRequestError} If organization ID cannot be determined
   */
  async createTask(
    userId: string,
    taskData: CreateTaskDto,
    organizationId?: string
  ): Promise<Task> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      const cleanedData: Record<string, any> = { ...taskData };

      // Clean up empty strings to null for UUID and timestamp fields
      this.cleanUuidFields(cleanedData, ['assigned_to', 'reviewed_by']);
      this.cleanTimestampFields(cleanedData, ['due_date', 'completed_at']);

      const [task] = await db('tasks')
        .insert({
          ...cleanedData,
          organization_id: orgId,
          status: 'assigned',
          priority: taskData.priority || 'medium',
          created_by: userId,
          version: 1, // Initial version for optimistic locking
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Task created: ${task.id} by user ${userId}`);

      // Create notification for assigned user (only if assigned to a specific user)
      if (task.assigned_to && task.assigned_to !== userId) {
        await this.createTaskNotification(task.assigned_to, task.id, 'task_assigned');
      }

      return task;
    } catch (error) {
      logger.error('Error creating task:', error);
      throw error;
    }
  }

  /**
   * Retrieves a paginated list of tasks with filtering and role-based visibility.
   * Admins/Owners can see all org tasks; others see only tasks they created, are assigned to, or review.
   * @param userId - The UUID of the requesting user
   * @param userRole - The user's role (OWNER, ADMIN, etc.) for visibility checks
   * @param filters - Optional filters for status, assigned_to, created_by, type, priority
   * @param pagination - Cursor-based pagination with limit (max 100) and compound cursor
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns An object with tasks array and optional nextCursor/nextCursorId for pagination
   * @throws {BadRequestError} If organization ID cannot be determined
   */
  async getTasks(
    userId: string,
    userRole: string,
    filters?: {
      status?: string;
      assigned_to?: string;
      created_by?: string;
      type?: string;
      priority?: string;
      scope?: 'mine' | 'all';
    },
    pagination?: {
      limit?: number;
      cursor?: string;
      cursorId?: string; // For compound cursor (Fix #9)
    },
    organizationId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string; nextCursorId?: string }> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      // Pagination with safety cap (Fix #7)
      const limit = Math.min(pagination?.limit || DEFAULT_TASKS_PER_PAGE, MAX_TASKS_PER_PAGE);

      let query = db('tasks')
        .leftJoin('users as assignee', 'tasks.assigned_to', 'assignee.id')
        .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
        .leftJoin('users as reviewer', 'tasks.reviewed_by', 'reviewer.id')
        .select(
          'tasks.*',
          'assignee.name as assignee_name',
          'assignee.email as assignee_email',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'reviewer.name as reviewer_name',
          'reviewer.email as reviewer_email'
        )
        .where('tasks.organization_id', orgId);

      // Apply filters
      if (filters?.status) {
        query = query.where('tasks.status', filters.status);
      }
      if (filters?.assigned_to) {
        query = query.where('tasks.assigned_to', filters.assigned_to);
      }
      if (filters?.created_by) {
        query = query.where('tasks.created_by', filters.created_by);
      }
      if (filters?.type) {
        query = query.where('tasks.type', filters.type);
      }
      if (filters?.priority) {
        query = query.where('tasks.priority', filters.priority);
      }

      // Visibility logic:
      // - scope=all + OWNER/ADMIN: Can see everything in the Org
      // - scope=mine (default) or non-admin: Can only see tasks they are assigned to, created, or reviewing
      const shouldFilterToMine = filters?.scope !== 'all' || !this.isAdmin(userRole);
      if (shouldFilterToMine) {
        query = query.where((builder) => {
          builder
            .where('tasks.assigned_to', userId)
            .orWhere('tasks.created_by', userId)
            .orWhere('tasks.reviewed_by', userId);
        });
      }

      // Compound cursor pagination for consistent results (Fix #9)
      if (pagination?.cursor && pagination?.cursorId) {
        const cursorValue = pagination.cursor;
        const cursorIdValue = pagination.cursorId;
        query = query.where(function(this: Knex.QueryBuilder) {
          this.where('tasks.created_at', '<', cursorValue)
            .orWhere(function(this: Knex.QueryBuilder) {
              this.where('tasks.created_at', '=', cursorValue)
                .andWhere('tasks.id', '<', cursorIdValue);
            });
        });
      } else if (pagination?.cursor) {
        // Fallback for simple cursor
        query = query.where('tasks.created_at', '<', pagination.cursor);
      }

      // Fetch one extra to determine if there are more results
      const tasks = await query
        .orderBy([
          { column: 'tasks.created_at', order: 'desc' },
          { column: 'tasks.id', order: 'desc' }, // Secondary sort for stable cursor
        ])
        .limit(limit + 1);

      // Check if there are more results
      const hasMore = tasks.length > limit;
      if (hasMore) {
        tasks.pop();
      }

      // Determine next cursor (compound)
      const lastTask = tasks[tasks.length - 1];
      const nextCursor = hasMore && lastTask ? lastTask.created_at : undefined;
      const nextCursorId = hasMore && lastTask ? lastTask.id : undefined;

      return { tasks, nextCursor, nextCursorId };
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      throw error;
    }
  }

  /**
   * Retrieves a single task by ID with role-based access control.
   * Admins/Owners can view any org task; others can only view tasks they are involved with.
   * @param taskId - The UUID of the task to retrieve
   * @param userId - The UUID of the requesting user
   * @param userRole - The user's role for visibility checks
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns The task object with assignee, creator, and reviewer details
   * @throws {BadRequestError} If organization ID cannot be determined
   * @throws {NotFoundError} If task does not exist or user lacks access
   */
  async getTaskById(
    taskId: string,
    userId: string,
    userRole: string,
    organizationId?: string
  ): Promise<Task> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      const task = await db('tasks')
        .leftJoin('users as assignee', 'tasks.assigned_to', 'assignee.id')
        .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
        .leftJoin('users as reviewer', 'tasks.reviewed_by', 'reviewer.id')
        .select(
          'tasks.*',
          'assignee.name as assignee_name',
          'assignee.email as assignee_email',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'reviewer.name as reviewer_name',
          'reviewer.email as reviewer_email'
        )
        .where('tasks.id', taskId)
        .where('tasks.organization_id', orgId)
        .first();

      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Visibility logic:
      // - OWNER/ADMIN: Can see everything in the Org
      // - Others: Can only see tasks they are assigned to, created, or reviewing
      if (!this.isAdmin(userRole)) {
        if (
          task.assigned_to !== userId &&
          task.created_by !== userId &&
          task.reviewed_by !== userId
        ) {
          throw new NotFoundError('Task not found');
        }
      }

      return task;
    } catch (error) {
      logger.error('Error fetching task:', error);
      throw error;
    }
  }

  /**
   * Updates a task with optimistic locking for concurrent update safety.
   * Clients should send the version field for safe concurrent updates.
   * Handles status transitions, notifications for assignee changes, and completion tracking.
   * @param taskId - The UUID of the task to update
   * @param userId - The UUID of the user performing the update
   * @param userRole - The user's role for permission checks
   * @param updateData - The fields to update, including optional version for optimistic locking
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns The updated task object
   * @throws {NotFoundError} If the task does not exist
   * @throws {ForbiddenError} If the user lacks permission to update the task
   * @throws {ConflictError} If version mismatch occurs (concurrent modification detected)
   */
  async updateTask(
    taskId: string,
    userId: string,
    userRole: string,
    updateData: UpdateTaskDto,
    organizationId?: string
  ): Promise<Task> {
    const orgId = this.getOrganizationId(organizationId);

    // Get existing task
    const existingTask = await this.getTaskById(taskId, userId, userRole, orgId);

    // Permission check
    if (!this.isAdmin(userRole)) {
      if (
        existingTask.created_by !== userId &&
        existingTask.assigned_to !== userId &&
        existingTask.reviewed_by !== userId
      ) {
        throw new ForbiddenError('You do not have permission to update this task');
      }
    }

    // Prepare update data
    const cleanedData: Record<string, any> = { ...updateData };

    // Extract and remove version from cleanedData - handle separately
    const clientVersion = cleanedData.version;
    delete cleanedData.version;

    // Clean up empty strings
    this.cleanUuidFields(cleanedData, ['assigned_to', 'reviewed_by']);
    this.cleanTimestampFields(cleanedData, ['due_date', 'completed_at']);

    try {
      let updatedTask: Task;

      // CRITICAL FIX #3: Proper optimistic locking implementation
      if (clientVersion !== undefined && clientVersion !== null) {
        // Client sent a version - use strict optimistic locking
        const result = await db('tasks')
          .where('id', taskId)
          .where('organization_id', orgId)
          .where('version', clientVersion)
          .update({
            ...cleanedData,
            version: clientVersion + 1,
            updated_at: new Date(),
          })
          .returning('*');

        if (result.length === 0) {
          // Check if task still exists to give better error message
          const currentTask = await db('tasks').where('id', taskId).first();
          if (!currentTask) {
            throw new NotFoundError('Task not found');
          }

          // Task exists but version doesn't match - concurrent modification
          throw new ConflictError(
            `Task was modified by another user. Please refresh and try again. ` +
            `(Your version: ${clientVersion}, Current version: ${currentTask.version})`
          );
        }

        updatedTask = result[0];
        logger.info(`Task updated with optimistic locking: ${taskId} (v${clientVersion} -> v${clientVersion + 1})`);
      } else {
        // No version sent - log warning and do a "force update" (backward compatible)
        logger.warn(
          `Task update without version (no optimistic locking): ${taskId}. ` +
          `Client should send version for safe concurrent updates.`
        );

        // Use the existing task's version to increment
        const currentVersion = existingTask.version ?? 1;

        const result = await db('tasks')
          .where('id', taskId)
          .where('organization_id', orgId)
          .update({
            ...cleanedData,
            version: currentVersion + 1,
            updated_at: new Date(),
          })
          .returning('*');

        if (result.length === 0) {
          throw new NotFoundError('Task not found');
        }

        updatedTask = result[0];
        logger.info(`Task updated (force): ${taskId} by user ${userId} (v${currentVersion} -> v${currentVersion + 1})`);
      }

      // Handle status changes
      if (updateData.status === 'completed' && existingTask.status !== 'completed') {
        await db('tasks').where('id', taskId).update({ completed_at: new Date() });

        // Notify reviewer if task is completed
        if (updatedTask.reviewed_by) {
          await this.createTaskNotification(updatedTask.reviewed_by, taskId, 'task_completed');
        }
      }

      // Handle assignee changes
      if (updateData.assigned_to && updateData.assigned_to !== existingTask.assigned_to) {
        await this.createTaskNotification(updateData.assigned_to, taskId, 'task_assigned');
      }

      return updatedTask;
    } catch (error) {
      logger.error('Error updating task:', error);
      throw error;
    }
  }

  /**
   * Deletes a task and all related data (recordings, reviews, notifications) atomically.
   * Only the task creator or admin users can delete a task.
   * @param taskId - The UUID of the task to delete
   * @param userId - The UUID of the user attempting the deletion
   * @param userRole - The user's role for permission checks
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @throws {NotFoundError} If the task does not exist
   * @throws {ForbiddenError} If the user lacks permission to delete the task
   */
  async deleteTask(
    taskId: string,
    userId: string,
    userRole: string,
    organizationId?: string
  ): Promise<void> {
    const orgId = this.getOrganizationId(organizationId);

    const task = await this.getTaskById(taskId, userId, userRole, orgId);

    // Only creator or Admin can delete
    if (!this.isAdmin(userRole) && task.created_by !== userId) {
      throw new ForbiddenError('You do not have permission to delete this task');
    }

    try {
      // First, delete all recordings with full storage cleanup (outside transaction for S3 ops)
      // This deletes: recording files, variants, thumbnails from S3/R2
      // And: recording_variants, analysis_*, transcription_jobs from DB
      await recordingService.hardDeleteAllRecordingsForTask(taskId);

      // Use transaction to ensure remaining related data is deleted atomically
      await db.transaction(async (trx: Knex.Transaction) => {
        // Delete notifications
        await trx('notifications').where('entity_id', taskId).where('entity_type', 'task').del();

        // Delete review comments
        await trx('review_comments')
          .whereIn('review_id', trx('reviews').select('id').where('task_id', taskId))
          .del();

        // Delete reviews
        await trx('reviews').where('task_id', taskId).del();

        // Delete magic link tokens
        await trx('magic_link_tokens').where('task_id', taskId).del();

        // Delete task
        await trx('tasks').where('id', taskId).del();
      });

      logger.info(`Task deleted with full cleanup: ${taskId} by user ${userId}`);
    } catch (error) {
      logger.error('Error deleting task:', error);
      throw error;
    }
  }

  /**
   * Retrieves task statistics (counts by status) for the organization.
   * Admins see org-wide stats; others see only stats for their tasks.
   * @param userId - The UUID of the requesting user
   * @param userRole - The user's role for visibility filtering
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns An object with counts for total, pending, in_progress, submitted, completed, rejected, and overdue tasks
   * @throws {BadRequestError} If organization ID cannot be determined
   */
  async getTaskStatistics(
    userId: string,
    userRole: string,
    organizationId?: string,
    scope?: 'mine' | 'all'
  ): Promise<Record<string, number>> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      let query = db('tasks').where('organization_id', orgId);

      // Visibility logic: scope=all + admin sees everything, otherwise filter to user's tasks
      const shouldFilterToMine = scope !== 'all' || !this.isAdmin(userRole);
      if (shouldFilterToMine) {
        query = query.where((builder) => {
          builder
            .where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewed_by', userId);
        });
      }

      const stats = await query
        .select(
          db.raw('COUNT(*)::int as total'),
          db.raw("COUNT(CASE WHEN status = 'pending' OR status = 'assigned' THEN 1 END)::int as pending"),
          db.raw("COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int as in_progress"),
          db.raw("COUNT(CASE WHEN status = 'submitted' THEN 1 END)::int as submitted"),
          db.raw("COUNT(CASE WHEN status = 'in_review' THEN 1 END)::int as in_review"),
          db.raw("COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed"),
          db.raw("COUNT(CASE WHEN status = 'reviewed' THEN 1 END)::int as reviewed"),
          db.raw("COUNT(CASE WHEN status = 'rejected' THEN 1 END)::int as rejected"),
          db.raw(
            "COUNT(CASE WHEN due_date < NOW() AND status NOT IN ('completed', 'reviewed') THEN 1 END)::int as overdue"
          )
        )
        .first();

      return stats || {};
    } catch (error) {
      logger.error('Error fetching task statistics:', error);
      throw error;
    }
  }

  /**
   * Updates the progress of a task (status and duration).
   * Only the assigned user or admin can update progress.
   * Creates an activity log entry for tracking.
   * @param taskId - The UUID of the task to update
   * @param userId - The UUID of the user updating progress
   * @param userRole - The user's role for permission checks
   * @param progress - Progress data including optional status, actual_duration, and notes
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns The updated task object
   * @throws {NotFoundError} If the task does not exist
   * @throws {ForbiddenError} If the user is not the assignee and not an admin
   */
  async updateTaskProgress(
    taskId: string,
    userId: string,
    userRole: string,
    progress: {
      status?: 'in_progress' | 'completed';
      actual_duration?: number;
      notes?: string;
    },
    organizationId?: string
  ): Promise<Task> {
    const orgId = this.getOrganizationId(organizationId);

    const task = await this.getTaskById(taskId, userId, userRole, orgId);

    // Only assignee or Admin can update progress
    if (!this.isAdmin(userRole) && task.assigned_to !== userId) {
      throw new ForbiddenError('Only the assigned user can update task progress');
    }

    try {
      const updateData: Record<string, any> = {
        updated_at: new Date(),
        version: (task.version || 1) + 1, // Increment version
      };

      if (progress.status) {
        updateData.status = progress.status;
        if (progress.status === 'completed') {
          updateData.completed_at = new Date();
        }
      }

      if (progress.actual_duration !== undefined) {
        updateData.actual_duration = progress.actual_duration;
      }

      const [updatedTask] = await db('tasks').where('id', taskId).update(updateData).returning('*');

      // Log activity
      await db('activity_logs').insert({
        id: db.raw('gen_random_uuid()'),
        user_id: userId,
        action: 'updated_task_progress',
        entity_type: 'task',
        entity_id: taskId,
        details: progress,
        created_at: new Date(),
      });

      return updatedTask;
    } catch (error) {
      logger.error('Error updating task progress:', error);
      throw error;
    }
  }

  private async createTaskNotification(
    userId: string,
    taskId: string,
    type: string
  ): Promise<void> {
    try {
      await db('notifications').insert({
        id: db.raw('gen_random_uuid()'),
        user_id: userId,
        type,
        entity_type: 'task',
        entity_id: taskId,
        is_read: false,
        created_at: new Date(),
      });
    } catch (error) {
      // Don't throw - notification failure shouldn't break task operations
      logger.error('Error creating notification:', error);
    }
  }
}

export const taskService = new TaskService();
export default taskService;
