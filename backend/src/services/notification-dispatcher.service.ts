import notificationService, { NotificationType, Notification } from './notification.service';
import notificationPreferencesService from './notification-preferences.service';
import { notificationSocketService } from './socket.service';
import { emailService } from './email.service';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { generateEmailTemplate, createInfoCard, BRAND_COLORS } from '../utils/email-templates';

/**
 * Notification Dispatcher Service
 *
 * High-level service for dispatching notifications to users.
 * Handles:
 * - Creating notification records in the database
 * - Sending real-time push via Socket.IO
 * - Sending immediate emails (when preferences allow)
 * - Respecting user notification preferences
 */

interface DispatchNotificationOptions {
  userId: string;
  organizationId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, any>;
  triggeredBy?: string;
  expiresAt?: Date;
}

interface DispatchBatchOptions {
  userIds: string[];
  organizationId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, any>;
  triggeredBy?: string;
  expiresAt?: Date;
}

class NotificationDispatcherService {
  /**
   * Dispatch a notification to a single user
   * Handles all channels (in-app, push, email) based on user preferences
   */
  async dispatch(options: DispatchNotificationOptions): Promise<Notification> {
    try {
      // ★ N+1 Query Fix: Fetch preferences once and reuse
      // Previously: 4 separate getPreferences() calls per dispatch
      // Now: 1 query per dispatch
      const preferences = await notificationPreferencesService.getPreferences(options.userId);
      
      // Helper to check if notification should be sent for a channel
      const shouldSendToChannel = (channel: 'email' | 'push' | 'in_app'): boolean => {
        // Check global toggle first
        if (channel === 'email' && !preferences.email_enabled) return false;
        if (channel === 'push' && !preferences.push_enabled) return false;
        if (channel === 'in_app' && !preferences.in_app_enabled) return false;

        // Check quiet hours for push notifications
        if (channel === 'push' && notificationPreferencesService.isInQuietHours(preferences)) {
          return false;
        }

        // Check per-notification-type preference
        const typePrefs = preferences.preferences_json[options.type];
        if (typePrefs) {
          return typePrefs[channel] ?? true;
        }

        // Default to true if notification type not configured
        return true;
      };

      const shouldSendInApp = shouldSendToChannel('in_app');
      let notification: Notification;

      if (shouldSendInApp) {
        // Create notification in database
        notification = await notificationService.create({
          userId: options.userId,
          organizationId: options.organizationId,
          type: options.type,
          title: options.title,
          message: options.message,
          entityType: options.entityType,
          entityId: options.entityId,
          actionUrl: options.actionUrl,
          priority: options.priority,
          metadata: options.metadata,
          triggeredBy: options.triggeredBy,
          expiresAt: options.expiresAt,
        });

        // Send real-time push notification
        if (shouldSendToChannel('push')) {
          notificationSocketService.notifyUser(options.userId, notification);
        }

        // Check if immediate email should be sent
        if (preferences.digest_frequency === 'immediate' && shouldSendToChannel('email')) {
          await this.sendImmediateEmail(options.userId, notification);
        }
      } else {
        // Create a minimal notification record even if not displayed
        notification = await notificationService.create({
          userId: options.userId,
          organizationId: options.organizationId,
          type: options.type,
          title: options.title,
          message: options.message,
          entityType: options.entityType,
          entityId: options.entityId,
          actionUrl: options.actionUrl,
          priority: options.priority,
          metadata: options.metadata,
          triggeredBy: options.triggeredBy,
          expiresAt: options.expiresAt,
        });
      }

      return notification;
    } catch (error) {
      logger.error('Error dispatching notification:', error);
      throw error;
    }
  }

  /**
   * Dispatch notifications to multiple users
   */
  async dispatchToMany(options: DispatchBatchOptions): Promise<Notification[]> {
    const notifications: Notification[] = [];

    for (const userId of options.userIds) {
      try {
        const notification = await this.dispatch({
          ...options,
          userId,
        });
        notifications.push(notification);
      } catch (error) {
        logger.error(`Error dispatching notification to user ${userId}:`, error);
        // Continue with other users
      }
    }

    return notifications;
  }

  /**
   * Dispatch notification to all members of an organization
   */
  async dispatchToOrganization(
    organizationId: string,
    options: Omit<DispatchNotificationOptions, 'userId' | 'organizationId'>
  ): Promise<Notification[]> {
    try {
      // Get all active members of the organization
      const members = await db('memberships')
        .where('organization_id', organizationId)
        .andWhere('status', 'ACTIVE')
        .select('user_id');

      const userIds = members.map((m) => m.user_id);

      return this.dispatchToMany({
        ...options,
        userIds,
        organizationId,
      });
    } catch (error) {
      logger.error(`Error dispatching notification to organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Send immediate email for a notification
   */
  private async sendImmediateEmail(userId: string, notification: Notification): Promise<void> {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user || !user.email) {
        return;
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';
      const actionUrl = notification.action_url || `${frontendUrl}/notifications`;

      const html = generateEmailTemplate({
        title: notification.title,
        preheader: notification.message,
        content: `
          <p>Hi ${user.name || user.email},</p>

          ${createInfoCard(`
            <h3 style="margin: 0 0 10px 0; color: ${BRAND_COLORS.text};">
              ${this.getNotificationEmoji(notification.type)} ${notification.title}
            </h3>
            <p style="margin: 0; color: ${BRAND_COLORS.textMuted};">
              ${notification.message}
            </p>
          `)}
        `,
        ctaButton: {
          text: 'View Details',
          url: actionUrl,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 12px;">
            You're receiving this email because of your notification preferences.
            <a href="${frontendUrl}/profile" style="color: ${BRAND_COLORS.primary};">Update preferences</a>
          </p>
        `,
      });

      await emailService.sendEmail({
        to: user.email,
        subject: notification.title,
        html,
      });

      // Mark notification as email sent
      await notificationService.markEmailSent(notification.id);

      logger.debug(`Immediate email sent to ${user.email} for notification ${notification.id}`);
    } catch (error) {
      logger.error(`Error sending immediate email for notification ${notification.id}:`, error);
      // Don't throw - email failure shouldn't fail the notification
    }
  }

  /**
   * Get emoji for notification type
   */
  private getNotificationEmoji(type: NotificationType): string {
    const emojis: Record<NotificationType, string> = {
      task_assigned: '📋',
      review_comment: '💬',
      recording_ready: '🎬',
      task_due_soon: '⏰',
      task_overdue: '❗',
      recording_submitted: '📤',
      review_requested: '👀',
      review_completed: '✅',
      feedback_received: '📝',
      mention: '@',
      system: '🔔',
      rubric_template_ready: '✨',
      rubric_template_failed: '⚠️',
      analysis_complete: '📊',
    };
    return emojis[type] || '🔔';
  }

  // ==========================================
  // Convenience methods for common notifications
  // ==========================================

  /**
   * Notify user when a task is assigned to them
   */
  async notifyTaskAssigned(options: {
    assigneeId: string;
    taskId: string;
    taskTitle: string;
    assignedBy?: string;
    organizationId?: string;
  }): Promise<Notification> {
    const assignerName = options.assignedBy
      ? await this.getUserName(options.assignedBy)
      : 'Someone';

    return this.dispatch({
      userId: options.assigneeId,
      organizationId: options.organizationId,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `${assignerName} assigned you "${options.taskTitle}"`,
      entityType: 'task',
      entityId: options.taskId,
      actionUrl: `/tasks/${options.taskId}`,
      priority: 'medium',
      triggeredBy: options.assignedBy,
    });
  }

  /**
   * Notify reviewer when a recording is submitted
   */
  async notifyRecordingSubmitted(options: {
    reviewerId: string;
    taskId: string;
    taskTitle: string;
    submittedBy: string;
    organizationId?: string;
  }): Promise<Notification> {
    const submitterName = await this.getUserName(options.submittedBy);

    return this.dispatch({
      userId: options.reviewerId,
      organizationId: options.organizationId,
      type: 'recording_submitted',
      title: 'Recording Submitted for Review',
      message: `${submitterName} submitted a recording for "${options.taskTitle}"`,
      entityType: 'task',
      entityId: options.taskId,
      actionUrl: `/tasks/${options.taskId}/review`,
      priority: 'medium',
      triggeredBy: options.submittedBy,
    });
  }

  /**
   * Notify user when their task review is completed
   */
  async notifyReviewCompleted(options: {
    assigneeId: string;
    taskId: string;
    taskTitle: string;
    reviewerId: string;
    approved: boolean;
    organizationId?: string;
  }): Promise<Notification> {
    const reviewerName = await this.getUserName(options.reviewerId);

    return this.dispatch({
      userId: options.assigneeId,
      organizationId: options.organizationId,
      type: 'review_completed',
      title: options.approved ? 'Task Approved!' : 'Task Needs Revision',
      message: `${reviewerName} ${options.approved ? 'approved' : 'requested changes for'} "${options.taskTitle}"`,
      entityType: 'task',
      entityId: options.taskId,
      actionUrl: `/tasks/${options.taskId}`,
      priority: options.approved ? 'medium' : 'high',
      triggeredBy: options.reviewerId,
      metadata: { approved: options.approved },
    });
  }

  /**
   * Notify user about a comment on their task
   */
  async notifyReviewComment(options: {
    userId: string;
    taskId: string;
    taskTitle: string;
    commentBy: string;
    commentPreview: string;
    organizationId?: string;
  }): Promise<Notification> {
    const commenterName = await this.getUserName(options.commentBy);

    return this.dispatch({
      userId: options.userId,
      organizationId: options.organizationId,
      type: 'review_comment',
      title: 'New Comment',
      message: `${commenterName} commented on "${options.taskTitle}": ${options.commentPreview}`,
      entityType: 'task',
      entityId: options.taskId,
      actionUrl: `/tasks/${options.taskId}/review`,
      priority: 'low',
      triggeredBy: options.commentBy,
    });
  }

  /**
   * Notify user when their recording is ready
   */
  async notifyRecordingReady(options: {
    userId: string;
    recordingId: string;
    taskId?: string;
    taskTitle?: string;
    organizationId?: string;
  }): Promise<Notification> {
    return this.dispatch({
      userId: options.userId,
      organizationId: options.organizationId,
      type: 'recording_ready',
      title: 'Recording Ready',
      message: options.taskTitle
        ? `Your recording for "${options.taskTitle}" is ready to view`
        : 'Your recording has been processed and is ready to view',
      entityType: 'recording',
      entityId: options.recordingId,
      actionUrl: options.taskId ? `/tasks/${options.taskId}` : `/record/${options.recordingId}`,
      priority: 'medium',
    });
  }

  /**
   * Send a system notification to a user
   */
  async notifySystem(options: {
    userId: string;
    title: string;
    message: string;
    actionUrl?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    organizationId?: string;
  }): Promise<Notification> {
    return this.dispatch({
      userId: options.userId,
      organizationId: options.organizationId,
      type: 'system',
      title: options.title,
      message: options.message,
      actionUrl: options.actionUrl,
      priority: options.priority || 'medium',
    });
  }

  /**
   * Get user name by ID
   */
  private async getUserName(userId: string): Promise<string> {
    try {
      const user = await db('users').where('id', userId).first();
      return user?.name || user?.email || 'Someone';
    } catch {
      return 'Someone';
    }
  }
}

export default new NotificationDispatcherService();
