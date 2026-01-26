import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import taskService from '../services/task.service';
import userService from '../services/user.service';
import { emailService } from '../services/email.service';
import { BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';
// Import validation schemas from centralized schema file (Fix #6 - remove duplicate schemas)
import {
  createTaskSchema,
  updateTaskSchema,
  updateTaskProgressSchema as updateProgressSchema,
  submitTaskSchema,
  submitReviewSchema,
} from '../schemas/task.schema';

/**
 * Helper function to ensure organizationId is not undefined.
 * TypeScript narrows the type to string after this check.
 */
function requireOrganizationId(orgId: string | undefined): string {
  if (!orgId) {
    throw new BadRequestError('Organization ID is required');
  }
  return orgId;
}

class TaskController {
  // Create a new task
  async createTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const organizationId = requireOrganizationId((req as any).user?.org_id);

      // Log incoming request for debugging
      logger.info('Creating task:', { userId, organizationId, body: req.body });

      // Validate request body
      let validatedData;
      try {
        validatedData = createTaskSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`);
        }
        throw error;
      }

      const task = await taskService.createTask(userId, validatedData, organizationId);

      // Send email notification to assignee (if enabled, assigned to a user, and not self-assigned)
      if (process.env.EMAIL_ENABLED === 'true' && task.assigned_to && task.assigned_to !== userId) {
        try {
          const assignee = await userService.findById(task.assigned_to);
          const creator = await userService.findById(userId);

          if (assignee && creator) {
            // Send email notification
            await emailService.sendTaskAssignmentEmail(task, assignee, creator);
            logger.info(`Task assignment email sent for task ${task.id} to ${assignee.email}`);
          }
        } catch (emailError) {
          // Log error but don't fail the task creation
          logger.error('Failed to send task assignment notification:', emailError);
        }
      }

      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all tasks for the current user
  async getTasks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);

      // Debug logging
      logger.info('getTasks called', { user: req.user, organizationId });

      const filters = {
        status: req.query.status as string,
        assigned_to: req.query.assigned_to as string,
        created_by: req.query.created_by as string,
        type: req.query.type as string,
        priority: req.query.priority as string,
      };

      const result = await taskService.getTasks(
        userId,
        userRole,
        filters,
        undefined,
        organizationId
      );

      res.json({
        success: true,
        data: result.tasks,
        count: result.tasks.length,
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get a single task by ID
  async getTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);
      const taskId = req.params.id!;

      const task = await taskService.getTaskById(taskId, userId, userRole, organizationId);

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update a task
  async updateTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);
      const taskId = req.params.id!;

      // Validate request body
      let validatedData;
      try {
        validatedData = updateTaskSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`);
        }
        throw error;
      }

      const task = await taskService.updateTask(taskId, userId, userRole, validatedData, organizationId);

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete a task
  async deleteTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);
      const taskId = req.params.id!;

      await taskService.deleteTask(taskId, userId, userRole, organizationId);

      res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get task statistics for dashboard
  async getTaskStatistics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);

      const stats = await taskService.getTaskStatistics(userId, userRole, organizationId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update task progress (for assignee)
  async updateTaskProgress(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);
      const taskId = req.params.id!;

      // Validate request body
      let validatedData;
      try {
        validatedData = updateProgressSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`);
        }
        throw error;
      }

      const task = await taskService.updateTaskProgress(
        taskId,
        userId,
        userRole,
        validatedData,
        organizationId
      );

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get tasks by status for kanban view
  async getTasksByStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);

      const [pending, inProgress, completed, reviewed] = await Promise.all([
        taskService.getTasks(userId, userRole, { status: 'pending' }, undefined, organizationId),
        taskService.getTasks(
          userId,
          userRole,
          { status: 'in_progress' },
          undefined,
          organizationId
        ),
        taskService.getTasks(userId, userRole, { status: 'completed' }, undefined, organizationId),
        taskService.getTasks(userId, userRole, { status: 'reviewed' }, undefined, organizationId),
      ]);

      res.json({
        success: true,
        data: {
          pending,
          in_progress: inProgress,
          completed,
          reviewed,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Submit task with recording (assignee submits their work)
  async submitTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);
      const taskId = req.params.id!;

      // Validate request body
      let validatedData;
      try {
        validatedData = submitTaskSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`);
        }
        throw error;
      }

      const { recordingId } = validatedData;

      // Update task status to submitted (waiting for review)
      const task = await taskService.updateTask(
        taskId,
        userId,
        userRole,
        {
          status: 'submitted',
          metadata: {
            // Need to fetch task first to get metadata? updateTask allows merging?
            // Service implementation: "const cleanedData: any = { ...updateData };"
            // It replaces metadata if provided.
            // We need to fetch existing metadata.
            // getTaskById now requires userRole.
            ...(await taskService.getTaskById(taskId, userId, userRole, organizationId)).metadata,
            recordingId,
            submittedAt: new Date(),
          },
        },
        organizationId
      );

      res.json({
        success: true,
        message: 'Task submitted successfully',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async submitReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const taskId = req.params.id!;
      const reviewerId = req.user!.id;
      const userRole = req.user!.org_role;
      const organizationId = requireOrganizationId((req as any).user?.org_id);

      // Validate request body
      let validatedData;
      try {
        validatedData = submitReviewSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`);
        }
        throw error;
      }

      const { status, feedback } = validatedData;

      // Update task with review feedback
      const updatedTask = await taskService.updateTask(
        taskId,
        reviewerId,
        userRole,
        {
          status,
          metadata: {
            review_feedback: feedback,
            reviewed_at: new Date(),
            reviewed_by: reviewerId,
          },
        },
        organizationId
      );

      // Check if this is an external magic link task
      const { db } = await import('../config/database');
      const magicLinkToken = await db('task_access_tokens')
        .where('task_id', taskId)
        .andWhere('is_revoked', false)
        .first();

      if (magicLinkToken) {
        // External contributor task - handle differently
        const contributor = await db('external_contributors')
          .where('id', magicLinkToken.contributor_id)
          .first();

        const reviewer = await userService.findById(reviewerId);

        if (contributor && reviewer) {
          if (status === 'completed') {
            // Approved - send success email
            await emailService.sendExternalTaskApprovedEmail(
              updatedTask,
              contributor,
              reviewer,
              feedback || ''
            );
          } else if (status === 'rejected') {
            // Rejected - generate new magic link and send rejection email
            const magicLinkService = (await import('../services/magic-link.service')).default;

            // Calculate new expiry (30 days from now by default)
            const expiresInDays = 30;

            const newMagicLink = await magicLinkService.createMagicLink({
              taskId,
              email: contributor.email,
              expiresInDays,
            }, organizationId);

            await emailService.sendExternalTaskRejectedEmail(
              updatedTask,
              contributor,
              reviewer,
              feedback || '',
              newMagicLink.url
            );

            logger.info(`Generated new magic link for rejected task ${taskId}: ${newMagicLink.url}`);
          }
        }
      } else {
        // Internal user task - original logic
        if (updatedTask.assigned_to) {
          const assignee = await userService.findById(updatedTask.assigned_to);
          const reviewer = await userService.findById(reviewerId);

          if (assignee && reviewer) {
            if (status === 'completed') {
              await emailService.sendTaskCompletionEmail(updatedTask, reviewer, assignee);
            } else if (status === 'rejected') {
              await emailService.sendTaskRejectionEmail(updatedTask, reviewer, assignee, feedback || '');
            }
          }
        }
      }

      res.json({
        success: true,
        message: `Task ${status === 'completed' ? 'approved' : 'rejected'} successfully`,
        data: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TaskController();
