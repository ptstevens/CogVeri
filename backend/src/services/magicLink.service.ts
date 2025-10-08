import crypto from 'crypto';
import { db } from '../config/database';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface TaskAccessToken {
  id: string;
  task_id: string;
  token: string;
  email: string;
  contributor_id?: string;
  expires_at: Date;
  max_uses?: number;
  current_uses: number;
  last_used_at?: Date;
  is_revoked: boolean;
  created_at: Date;
}

export interface ExternalContributor {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  total_tasks_assigned: number;
  total_tasks_completed: number;
  total_tasks_rejected: number;
  average_completion_time_seconds?: number;
  last_active_at?: Date;
  created_at: Date;
}

export interface CreateMagicLinkDto {
  taskId: string;
  email: string;
  expiresInDays: number;
  maxUses?: number;
}

export interface ClaimTaskDto {
  token: string;
  firstName: string;
  lastName: string;
  email: string;
}

class MagicLinkService {
  /**
   * Generate a cryptographically secure random token
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a magic link for a task
   */
  async createMagicLink(data: CreateMagicLinkDto): Promise<{ token: string; url: string }> {
    try {
      // Check if task exists
      const task = await db('tasks').where('id', data.taskId).first();
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Generate unique token
      let token = this.generateSecureToken();
      let tokenExists = await db('task_access_tokens').where('token', token).first();

      // Ensure token is unique (very unlikely to collide, but just in case)
      while (tokenExists) {
        token = this.generateSecureToken();
        tokenExists = await db('task_access_tokens').where('token', token).first();
      }

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

      // Check if contributor already exists
      let contributor = await db('external_contributors')
        .where('email', data.email.toLowerCase())
        .first();

      if (!contributor) {
        // Create new contributor record
        [contributor] = await db('external_contributors')
          .insert({
            email: data.email.toLowerCase(),
            total_tasks_assigned: 1,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');
      } else {
        // Increment assigned tasks count
        await db('external_contributors')
          .where('id', contributor.id)
          .increment('total_tasks_assigned', 1)
          .update({ updated_at: new Date() });
      }

      // Create access token
      await db('task_access_tokens').insert({
        task_id: data.taskId,
        token,
        email: data.email.toLowerCase(),
        contributor_id: contributor.id,
        expires_at: expiresAt,
        max_uses: data.maxUses || null,
        current_uses: 0,
        is_revoked: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Mark task as external
      await db('tasks')
        .where('id', data.taskId)
        .update({
          is_external_task: true,
          access_token_expires_days: data.expiresInDays,
          updated_at: new Date(),
        });

      const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/t/${token}`;

      logger.info(`Magic link created for task ${data.taskId}, email ${data.email}`);

      return { token, url };
    } catch (error) {
      logger.error('Error creating magic link:', error);
      throw error;
    }
  }

  /**
   * Validate a magic link token
   */
  async validateToken(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ valid: boolean; taskId?: string; email?: string; contributorId?: string }> {
    try {
      const accessToken = await db('task_access_tokens')
        .where('token', token)
        .first();

      if (!accessToken) {
        return { valid: false };
      }

      // Check if revoked
      if (accessToken.is_revoked) {
        logger.warn(`Attempted to use revoked token: ${token}`);
        return { valid: false };
      }

      // Check if expired
      if (new Date(accessToken.expires_at) < new Date()) {
        logger.warn(`Attempted to use expired token: ${token}`);
        return { valid: false };
      }

      // Check max uses
      if (accessToken.max_uses && accessToken.current_uses >= accessToken.max_uses) {
        logger.warn(`Token max uses exceeded: ${token}`);
        return { valid: false };
      }

      // Update last used timestamp and increment use count
      await db('task_access_tokens')
        .where('id', accessToken.id)
        .update({
          current_uses: accessToken.current_uses + 1,
          last_used_at: new Date(),
          ip_address: ipAddress,
          user_agent: userAgent,
          updated_at: new Date(),
        });

      // Log the access
      await this.logAccess({
        tokenId: accessToken.id,
        taskId: accessToken.task_id,
        contributorId: accessToken.contributor_id,
        action: 'viewed',
        ipAddress,
        userAgent,
      });

      return {
        valid: true,
        taskId: accessToken.task_id,
        email: accessToken.email,
        contributorId: accessToken.contributor_id,
      };
    } catch (error) {
      logger.error('Error validating token:', error);
      return { valid: false };
    }
  }

  /**
   * Claim a task (set name and verify email)
   */
  async claimTask(data: ClaimTaskDto, ipAddress?: string, userAgent?: string): Promise<any> {
    try {
      // Validate token
      const validation = await this.validateToken(data.token, ipAddress, userAgent);
      if (!validation.valid || !validation.taskId) {
        throw new UnauthorizedError('Invalid or expired link');
      }

      // Verify email matches token
      if (validation.email?.toLowerCase() !== data.email.toLowerCase()) {
        throw new BadRequestError('Email does not match the invitation');
      }

      // Update contributor with name
      const contributor = await db('external_contributors')
        .where('id', validation.contributorId)
        .first();

      if (!contributor) {
        throw new NotFoundError('Contributor not found');
      }

      // Update contributor name if not already set
      if (!contributor.first_name || !contributor.last_name) {
        await db('external_contributors')
          .where('id', contributor.id)
          .update({
            first_name: data.firstName,
            last_name: data.lastName,
            last_active_at: new Date(),
            updated_at: new Date(),
          });
      }

      // Update task with claim information
      const task = await db('tasks')
        .where('id', validation.taskId)
        .first();

      if (!task.claimed_at) {
        await db('tasks')
          .where('id', validation.taskId)
          .update({
            claimed_at: new Date(),
            claim_name: `${data.firstName} ${data.lastName}`,
            claim_email: data.email.toLowerCase(),
            external_contributor_id: contributor.id,
            status: 'in_progress',
            updated_at: new Date(),
          });
      }

      // Log the claim action
      await this.logAccess({
        tokenId: (await db('task_access_tokens').where('token', data.token).first()).id,
        taskId: validation.taskId,
        contributorId: contributor.id,
        action: 'claimed',
        ipAddress,
        userAgent,
        metadata: {
          name: `${data.firstName} ${data.lastName}`,
          email: data.email,
        },
      });

      // Get updated task with all details
      const updatedTask = await db('tasks')
        .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
        .leftJoin('users as reviewer', 'tasks.reviewed_by', 'reviewer.id')
        .select(
          'tasks.*',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'reviewer.name as reviewer_name',
          'reviewer.email as reviewer_email'
        )
        .where('tasks.id', validation.taskId)
        .first();

      logger.info(`Task ${validation.taskId} claimed by ${data.email}`);

      return {
        task: updatedTask,
        contributor: {
          ...contributor,
          first_name: data.firstName,
          last_name: data.lastName,
        },
      };
    } catch (error) {
      logger.error('Error claiming task:', error);
      throw error;
    }
  }

  /**
   * Get task details via magic link (for public access)
   */
  async getTaskByToken(token: string): Promise<any> {
    try {
      const accessToken = await db('task_access_tokens')
        .where('token', token)
        .first();

      if (!accessToken) {
        throw new NotFoundError('Invalid link');
      }

      // Check if expired or revoked
      if (accessToken.is_revoked || new Date(accessToken.expires_at) < new Date()) {
        throw new UnauthorizedError('This link has expired');
      }

      // Get task details
      const task = await db('tasks')
        .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
        .leftJoin('users as reviewer', 'tasks.reviewed_by', 'reviewer.id')
        .leftJoin('external_contributors', 'tasks.external_contributor_id', 'external_contributors.id')
        .select(
          'tasks.*',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'reviewer.name as reviewer_name',
          'reviewer.email as reviewer_email',
          'external_contributors.first_name as contributor_first_name',
          'external_contributors.last_name as contributor_last_name',
          'external_contributors.email as contributor_email'
        )
        .where('tasks.id', accessToken.task_id)
        .first();

      if (!task) {
        throw new NotFoundError('Task not found');
      }

      return {
        task,
        tokenInfo: {
          email: accessToken.email,
          expiresAt: accessToken.expires_at,
          isClaimed: !!task.claimed_at,
        },
      };
    } catch (error) {
      logger.error('Error getting task by token:', error);
      throw error;
    }
  }

  /**
   * Revoke a magic link
   */
  async revokeToken(taskId: string, userId: string): Promise<void> {
    try {
      // Verify user has permission (creator or admin)
      const task = await db('tasks').where('id', taskId).first();
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      const user = await db('users').where('id', userId).first();
      if (task.created_by !== userId && user.role !== 'admin') {
        throw new UnauthorizedError('You do not have permission to revoke this link');
      }

      // Revoke all tokens for this task
      await db('task_access_tokens')
        .where('task_id', taskId)
        .update({
          is_revoked: true,
          updated_at: new Date(),
        });

      logger.info(`All tokens for task ${taskId} revoked by user ${userId}`);
    } catch (error) {
      logger.error('Error revoking token:', error);
      throw error;
    }
  }

  /**
   * Get all external contributors (for dropdown selection)
   */
  async getExternalContributors(
    search?: string,
    limit: number = 50
  ): Promise<ExternalContributor[]> {
    try {
      let query = db('external_contributors')
        .select('*')
        .orderBy('last_active_at', 'desc')
        .limit(limit);

      if (search) {
        query = query.where((builder) => {
          builder
            .where('email', 'ilike', `%${search}%`)
            .orWhere('first_name', 'ilike', `%${search}%`)
            .orWhere('last_name', 'ilike', `%${search}%`);
        });
      }

      return await query;
    } catch (error) {
      logger.error('Error getting external contributors:', error);
      throw error;
    }
  }

  /**
   * Get contributor analytics
   */
  async getContributorAnalytics(contributorId: string): Promise<any> {
    try {
      const contributor = await db('external_contributors')
        .where('id', contributorId)
        .first();

      if (!contributor) {
        throw new NotFoundError('Contributor not found');
      }

      // Get task history
      const tasks = await db('tasks')
        .where('external_contributor_id', contributorId)
        .orderBy('created_at', 'desc');

      // Get access logs
      const accessLogs = await db('task_access_logs')
        .where('contributor_id', contributorId)
        .orderBy('created_at', 'desc')
        .limit(100);

      // Calculate completion rate
      const completionRate =
        contributor.total_tasks_assigned > 0
          ? (contributor.total_tasks_completed / contributor.total_tasks_assigned) * 100
          : 0;

      return {
        contributor,
        stats: {
          completionRate: Math.round(completionRate),
          successRate:
            contributor.total_tasks_completed > 0
              ? Math.round(
                  (contributor.total_tasks_completed /
                    (contributor.total_tasks_completed + contributor.total_tasks_rejected)) *
                    100
                )
              : 0,
          averageCompletionTime: contributor.average_completion_time_seconds,
        },
        tasks,
        recentActivity: accessLogs,
      };
    } catch (error) {
      logger.error('Error getting contributor analytics:', error);
      throw error;
    }
  }

  /**
   * Log access action
   */
  private async logAccess(data: {
    tokenId: string;
    taskId: string;
    contributorId?: string;
    action: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await db('task_access_logs').insert({
        token_id: data.tokenId,
        task_id: data.taskId,
        contributor_id: data.contributorId,
        action: data.action,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        created_at: new Date(),
      });
    } catch (error) {
      // Don't throw error for logging failures
      logger.error('Error logging access:', error);
    }
  }
}

export default new MagicLinkService();
