import crypto from 'crypto';
import { db } from '../config/database';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { getMagicLinkUrl } from '../utils/config';

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
  async createMagicLink(data: CreateMagicLinkDto, organizationId?: string): Promise<{ token: string; url: string }> {
    try {
      logger.info(`[createMagicLink] START - Received organizationId: ${organizationId}, taskId: ${data.taskId}`);
      
      // Check if task exists
      const task = await db('tasks').where('id', data.taskId).first();
      if (!task) {
        throw new NotFoundError('Task not found');
      }
      
      logger.info(`[createMagicLink] Task found - task.organization_id: ${task.organization_id}, task.title: ${task.title}`);

      // If organization context is provided, verify task belongs to this org
      if (organizationId) {
        logger.info(`[createMagicLink] organizationId provided (${organizationId}), verifying task belongs to org`);
        if (task.organization_id !== organizationId) {
          throw new UnauthorizedError('Task does not belong to this organization');
        }
        logger.info(`[createMagicLink] Task verified to belong to organization ${organizationId}`);
      } else {
        // If no org context, extract from task
        logger.info(`[createMagicLink] No organizationId provided, extracting from task.organization_id: ${task.organization_id}`);
        organizationId = task.organization_id;
      }
      
      logger.info(`[createMagicLink] Final organizationId to use: ${organizationId}`);

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

      // Check if contributor already exists within this organization
      let contributor = await db('external_contributors')
        .where('email', data.email.toLowerCase())
        .andWhere('organization_id', organizationId)
        .first();

      if (!contributor) {
        // Create new contributor record scoped to organization
        [contributor] = await db('external_contributors')
          .insert({
            email: data.email.toLowerCase(),
            organization_id: organizationId,
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

      // Create access token scoped to organization
      logger.info(`[createMagicLink] About to insert token with organizationId: ${organizationId}, email: ${data.email}, taskId: ${data.taskId}, contributor.id: ${contributor.id}`);
      await db('task_access_tokens').insert({
        task_id: data.taskId,
        token,
        email: data.email.toLowerCase(),
        contributor_id: contributor.id,
        organization_id: organizationId,
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

      const url = getMagicLinkUrl(token, organizationId);

      // Send email to external contributor with magic link
      try {
        const { emailService } = await import('./email.service');
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px;">
              <h2 style="color: #333;">You've been assigned a task!</h2>
              <p style="color: #666; font-size: 16px;">Hello,</p>
              <p style="color: #666; font-size: 16px;">
                You've been assigned to the following task: <strong>${task.title || 'New Task'}</strong>
              </p>
              ${task.description ? `<p style="color: #666; font-size: 14px; margin: 15px 0;"><strong>Description:</strong><br/>${task.description}</p>` : ''}
              <div style="margin: 30px 0;">
                <a href="${url}" style="display: inline-block; padding: 12px 30px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  View Task & Submit Recording
                </a>
              </div>
              <p style="color: #999; font-size: 12px;">
                This link will expire in ${data.expiresInDays} day${data.expiresInDays === 1 ? '' : 's'}.
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">
                If you did not expect this email, please disregard it.
              </p>
            </div>
          </div>
        `;

        await emailService.sendEmail({
          to: data.email,
          subject: `Task Assignment: ${task.title || 'New Task'}`,
          html,
        });
        logger.info(`Magic link email sent to ${data.email} for task ${data.taskId}`);
      } catch (emailError) {
        logger.error(`Failed to send magic link email to ${data.email}:`, emailError);
        // Don't fail the entire operation if email fails - token is already created
      }

      logger.info(`[createMagicLink] SUCCESS - Magic link created for task ${data.taskId}, email ${data.email}, org ${organizationId}, token: ${token.substring(0, 16)}...`);
      logger.info(`[createMagicLink] Magic link URL: ${url}`);

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
    userAgent?: string,
    organizationId?: string
  ): Promise<{ valid: boolean; taskId?: string; email?: string; contributorId?: string; organizationId?: string }> {
    try {
      logger.info(`[validateToken] START - token: ${token.substring(0, 16)}..., organizationId: ${organizationId}`);
      let query = db('task_access_tokens').where('token', token);

      // If organization context is provided, scope to that organization
      if (organizationId) {
        logger.info(`[validateToken] Adding organizationId filter: ${organizationId}`);
        query = query.andWhere('organization_id', organizationId);
      }

      const accessToken = await query.first();
      logger.info(`[validateToken] Token lookup result - found: ${!!accessToken}, token.organization_id: ${accessToken?.organization_id}`);

      if (!accessToken) {
        logger.info(`[validateToken] No token found in database`);
        return { valid: false };
      }

      // Check if revoked
      if (accessToken.is_revoked) {
        logger.warn(`[validateToken] Token is revoked: ${token}`);
        return { valid: false };
      }
      logger.info(`[validateToken] Token not revoked`);

      // Check if expired
      const expiryDate = new Date(accessToken.expires_at);
      const now = new Date();
      logger.info(`[validateToken] Expiry check - expiresAt: ${expiryDate.toISOString()}, now: ${now.toISOString()}, expired: ${expiryDate < now}`);
      if (expiryDate < now) {
        logger.warn(`[validateToken] Token expired: ${token}`);
        return { valid: false };
      }

      // Check max uses
      if (accessToken.max_uses && accessToken.current_uses >= accessToken.max_uses) {
        logger.warn(`[validateToken] Token max uses exceeded: ${token}`);
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

      // Log the access with organization context
      await this.logAccess({
        tokenId: accessToken.id,
        taskId: accessToken.task_id,
        contributorId: accessToken.contributor_id,
        organizationId: accessToken.organization_id,
        action: 'viewed',
        ipAddress,
        userAgent,
      });

      logger.info(`[validateToken] SUCCESS - token valid, taskId: ${accessToken.task_id}, contributorId: ${accessToken.contributor_id}, organizationId: ${accessToken.organization_id}`);
      
      return {
        valid: true,
        taskId: accessToken.task_id,
        email: accessToken.email,
        contributorId: accessToken.contributor_id,
        organizationId: accessToken.organization_id,
      };
    } catch (error) {
      logger.error('Error validating token:', error);
      return { valid: false };
    }
  }

  /**
   * Claim a task (set name and verify email)
   */
  async claimTask(data: ClaimTaskDto, ipAddress?: string, userAgent?: string, organizationId?: string): Promise<{
    task: Record<string, unknown>;
    contributor: ExternalContributor & { first_name: string; last_name: string };
  }> {
    try {
      // Validate token with organization context
      const validation = await this.validateToken(data.token, ipAddress, userAgent, organizationId);
      if (!validation.valid || !validation.taskId) {
        throw new UnauthorizedError('Invalid or expired link');
      }

      // Verify email matches token
      if (validation.email?.toLowerCase() !== data.email.toLowerCase()) {
        throw new BadRequestError('Email does not match the invitation');
      }

      // Verify organization context if provided
      if (organizationId && validation.organizationId !== organizationId) {
        throw new UnauthorizedError('Token does not belong to this organization');
      }

      // Use organization from token if not provided
      const orgId = organizationId || validation.organizationId;

      // Update contributor with name (organization-scoped)
      const contributor = await db('external_contributors')
        .where('id', validation.contributorId)
        .andWhere('organization_id', orgId)
        .first();

      if (!contributor) {
        throw new NotFoundError('Contributor not found in this organization');
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

      // Log the claim action with organization context
      const accessToken = await db('task_access_tokens').where('token', data.token).first();
      await this.logAccess({
        tokenId: accessToken.id,
        taskId: validation.taskId,
        contributorId: contributor.id,
        organizationId: orgId,
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

      logger.info(`Task ${validation.taskId} claimed by ${data.email} in org ${orgId}`);

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
  async getTaskByToken(token: string, organizationId?: string): Promise<{
    task: Record<string, unknown>;
    tokenInfo: {
      email: string;
      expiresAt: Date;
      isClaimed: boolean;
      organizationId: string;
    };
  }> {
    try {
      let query = db('task_access_tokens').where('token', token);

      // If organization context is provided, scope to that organization
      if (organizationId) {
        query = query.andWhere('organization_id', organizationId);
      }

      const accessToken = await query.first();

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
          organizationId: accessToken.organization_id,
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
  async revokeToken(taskId: string, userId: string, organizationId?: string): Promise<void> {
    try {
      // Verify user has permission (creator or admin in org)
      const task = await db('tasks').where('id', taskId).first();
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // If organization context provided, verify task belongs to org
      if (organizationId && task.organization_id !== organizationId) {
        throw new UnauthorizedError('Task does not belong to this organization');
      }

      const user = await db('users').where('id', userId).first();
      
      // Check if user is creator, admin in org, or global admin
      const isCreator = task.created_by === userId;
      const isOrgAdmin = organizationId && await db('memberships')
        .where('user_id', userId)
        .andWhere('organization_id', organizationId || task.organization_id)
        .whereIn('role', ['OWNER', 'ADMIN'])
        .first();
      const isGlobalAdmin = user.role === 'admin';

      if (!isCreator && !isOrgAdmin && !isGlobalAdmin) {
        throw new UnauthorizedError('You do not have permission to revoke this link');
      }

      // Revoke all tokens for this task
      await db('task_access_tokens')
        .where('task_id', taskId)
        .update({
          is_revoked: true,
          updated_at: new Date(),
        });

      logger.info(`All tokens for task ${taskId} revoked by user ${userId} in org ${organizationId || task.organization_id}`);
    } catch (error) {
      logger.error('Error revoking token:', error);
      throw error;
    }
  }

  /**
   * Get all external contributors (for dropdown selection)
   */
  async getExternalContributors(
    organizationId: string,
    search?: string,
    limit: number = 50
  ): Promise<ExternalContributor[]> {
    try {
      let query = db('external_contributors')
        .select('*')
        .where('organization_id', organizationId)
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
  async getContributorAnalytics(organizationId: string, contributorId: string): Promise<{
    contributor: ExternalContributor;
    stats: {
      completionRate: number;
      successRate: number;
      averageCompletionTime?: number;
    };
    tasks: Record<string, unknown>[];
    recentActivity: Record<string, unknown>[];
  }> {
    try {
      const contributor = await db('external_contributors')
        .where('id', contributorId)
        .andWhere('organization_id', organizationId)
        .first();

      if (!contributor) {
        throw new NotFoundError('Contributor not found in this organization');
      }

      // Get task history for this organization
      const tasks = await db('tasks')
        .where('external_contributor_id', contributorId)
        .andWhere('organization_id', organizationId)
        .orderBy('created_at', 'desc');

      // Get access logs for this organization
      const accessLogs = await db('task_access_logs')
        .where('contributor_id', contributorId)
        .andWhere('organization_id', organizationId)
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
    organizationId?: string;
    action: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await db('task_access_logs').insert({
        token_id: data.tokenId,
        task_id: data.taskId,
        contributor_id: data.contributorId,
        organization_id: data.organizationId,
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
