import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import taskService from '../services/task.service';
import userService from '../services/user.service';
import { emailService } from '../services/email.service';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';

class TaskController {
  // Create a new task
  async createTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      // Validate required fields
      const { title, type } = req.body;
      if (!title || !type) {
        throw new BadRequestError('Title and type are required');
      }

      const task = await taskService.createTask(userId, req.body);

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
      const filters = {
        status: req.query.status as string,
        assigned_to: req.query.assigned_to as string,
        created_by: req.query.created_by as string,
        type: req.query.type as string,
        priority: req.query.priority as string,
      };

      const tasks = await taskService.getTasks(userId, filters);

      res.json({
        success: true,
        data: tasks,
        count: tasks.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get a single task by ID
  async getTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const task = await taskService.getTaskById(id, userId);

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
      const { id } = req.params;

      const task = await taskService.updateTask(id, userId, req.body);

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
      const { id } = req.params;

      await taskService.deleteTask(id, userId);

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

      const stats = await taskService.getTaskStatistics(userId);

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
      const { id } = req.params;
      const { status, actual_duration, notes } = req.body;

      const task = await taskService.updateTaskProgress(id, userId, {
        status,
        actual_duration,
        notes,
      });

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

      const [pending, inProgress, completed, reviewed] = await Promise.all([
        taskService.getTasks(userId, { status: 'pending' }),
        taskService.getTasks(userId, { status: 'in_progress' }),
        taskService.getTasks(userId, { status: 'completed' }),
        taskService.getTasks(userId, { status: 'reviewed' }),
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
      const { id } = req.params;
      const { recordingId } = req.body;

      if (!recordingId) {
        throw new BadRequestError('Recording ID is required');
      }

      // Update task status to completed
      const task = await taskService.updateTask(id, userId, {
        status: 'completed',
        metadata: {
          ...(await taskService.getTaskById(id, userId)).metadata,
          recordingId,
          submittedAt: new Date(),
        },
      });

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
      const { id } = req.params;
      const { status, feedback } = req.body;
      const reviewerId = req.user!.id;

      // Update task with review feedback
      const updatedTask = await taskService.updateTask(id, reviewerId, {
        status,
        metadata: {
          review_feedback: feedback,
          reviewed_at: new Date(),
          reviewed_by: reviewerId
        }
      });

      // Check if this is an external magic link task
      const { db } = await import('../config/database');
      const magicLinkToken = await db('task_access_tokens')
        .where('task_id', id)
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
              feedback
            );
          } else if (status === 'rejected') {
            // Rejected - generate new magic link and send rejection email
            const magicLinkService = (await import('../services/magicLink.service')).default;

            // Calculate new expiry (30 days from now by default)
            const expiresInDays = 30;

            const newMagicLink = await magicLinkService.createMagicLink({
              taskId: id,
              email: contributor.email,
              expiresInDays
            });

            await emailService.sendExternalTaskRejectedEmail(
              updatedTask,
              contributor,
              reviewer,
              feedback,
              newMagicLink.url
            );

            logger.info(`Generated new magic link for rejected task ${id}: ${newMagicLink.url}`);
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
              await emailService.sendTaskRejectionEmail(updatedTask, reviewer, assignee, feedback);
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