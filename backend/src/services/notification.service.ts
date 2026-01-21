import { db } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/AppError';

// Notification types supported by the system
export type NotificationType =
  | 'task_assigned'
  | 'review_comment'
  | 'recording_ready'
  | 'task_due_soon'
  | 'task_overdue'
  | 'recording_submitted'
  | 'review_requested'
  | 'review_completed'
  | 'feedback_received'
  | 'mention'
  | 'system'
  | 'rubric_template_ready'
  | 'rubric_template_failed'
  | 'analysis_complete';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateNotificationDto {
  userId: string;
  organizationId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string; // 'task', 'recording', 'review', etc.
  entityId?: string;
  actionUrl?: string;
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
  triggeredBy?: string; // User ID who triggered the notification
  expiresAt?: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  organization_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  action_url?: string;
  priority: NotificationPriority;
  metadata?: Record<string, any>;
  triggered_by?: string;
  in_app: boolean;
  email_sent: boolean;
  slack_sent: boolean;
  is_read: boolean;
  read_at?: Date;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationListOptions {
  userId: string;
  organizationId?: string;
  unreadOnly?: boolean;
  type?: NotificationType;
  limit?: number;
  offset?: number;
}

class NotificationService {
  /**
   * Create a new notification
   */
  async create(data: CreateNotificationDto): Promise<Notification> {
    try {
      const [notification] = await db('notifications')
        .insert({
          user_id: data.userId,
          organization_id: data.organizationId,
          type: data.type,
          title: data.title,
          message: data.message,
          entity_type: data.entityType,
          entity_id: data.entityId,
          action_url: data.actionUrl,
          priority: data.priority || 'medium',
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          triggered_by: data.triggeredBy,
          expires_at: data.expiresAt,
          in_app: true,
          email_sent: false,
          slack_sent: false,
          is_read: false,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Notification created for user ${data.userId}: ${data.type} - ${data.title}`);

      return this.formatNotification(notification);
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create multiple notifications at once (for batch operations)
   */
  async createBatch(notifications: CreateNotificationDto[]): Promise<Notification[]> {
    try {
      const records = notifications.map((data) => ({
        user_id: data.userId,
        organization_id: data.organizationId,
        type: data.type,
        title: data.title,
        message: data.message,
        entity_type: data.entityType,
        entity_id: data.entityId,
        action_url: data.actionUrl,
        priority: data.priority || 'medium',
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        triggered_by: data.triggeredBy,
        expires_at: data.expiresAt,
        in_app: true,
        email_sent: false,
        slack_sent: false,
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      const results = await db('notifications').insert(records).returning('*');

      logger.info(`Created ${results.length} notifications in batch`);

      return results.map((n) => this.formatNotification(n));
    } catch (error) {
      logger.error('Error creating batch notifications:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    try {
      const [notification] = await db('notifications')
        .where('id', notificationId)
        .andWhere('user_id', userId)
        .update({
          is_read: true,
          read_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      logger.info(`Notification ${notificationId} marked as read by user ${userId}`);

      return this.formatNotification(notification);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string, organizationId?: string): Promise<number> {
    try {
      let query = db('notifications')
        .where('user_id', userId)
        .andWhere('is_read', false);

      if (organizationId) {
        query = query.andWhere('organization_id', organizationId);
      }

      const count = await query.update({
        is_read: true,
        read_at: new Date(),
        updated_at: new Date(),
      });

      logger.info(`Marked ${count} notifications as read for user ${userId}`);

      return count;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get unread notifications for a user
   */
  async getUnread(userId: string, organizationId?: string, limit: number = 50): Promise<Notification[]> {
    try {
      let query = db('notifications')
        .where('user_id', userId)
        .andWhere('is_read', false)
        .andWhere(function () {
          this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
        })
        .orderBy('created_at', 'desc')
        .limit(limit);

      if (organizationId) {
        query = query.andWhere('organization_id', organizationId);
      }

      const notifications = await query;

      return notifications.map((n) => this.formatNotification(n));
    } catch (error) {
      logger.error('Error getting unread notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string, organizationId?: string): Promise<number> {
    try {
      let query = db('notifications')
        .where('user_id', userId)
        .andWhere('is_read', false)
        .andWhere(function () {
          this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
        });

      if (organizationId) {
        query = query.andWhere('organization_id', organizationId);
      }

      const result = await query.count('id as count').first();

      return parseInt(result?.count as string) || 0;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Get all notifications for a user with pagination
   */
  async getAll(options: NotificationListOptions): Promise<{
    notifications: Notification[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const { userId, organizationId, unreadOnly, type, limit = 20, offset = 0 } = options;

      let query = db('notifications')
        .where('user_id', userId)
        .andWhere(function () {
          this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
        });

      if (organizationId) {
        query = query.andWhere('organization_id', organizationId);
      }

      if (unreadOnly) {
        query = query.andWhere('is_read', false);
      }

      if (type) {
        query = query.andWhere('type', type);
      }

      // Get total count
      const countQuery = query.clone();
      const countResult = await countQuery.count('id as count').first();
      const total = parseInt(countResult?.count as string) || 0;

      // Get paginated results
      const notifications = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        notifications: notifications.map((n) => this.formatNotification(n)),
        total,
        hasMore: offset + notifications.length < total,
      };
    } catch (error) {
      logger.error('Error getting all notifications:', error);
      throw error;
    }
  }

  /**
   * Get a single notification by ID
   */
  async getById(notificationId: string, userId: string): Promise<Notification | null> {
    try {
      const notification = await db('notifications')
        .where('id', notificationId)
        .andWhere('user_id', userId)
        .first();

      if (!notification) {
        return null;
      }

      return this.formatNotification(notification);
    } catch (error) {
      logger.error('Error getting notification by ID:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   */
  async delete(notificationId: string, userId: string): Promise<boolean> {
    try {
      const deleted = await db('notifications')
        .where('id', notificationId)
        .andWhere('user_id', userId)
        .delete();

      if (deleted) {
        logger.info(`Notification ${notificationId} deleted by user ${userId}`);
      }

      return deleted > 0;
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Delete expired notifications (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    try {
      const deleted = await db('notifications')
        .where('expires_at', '<', new Date())
        .delete();

      if (deleted > 0) {
        logger.info(`Deleted ${deleted} expired notifications`);
      }

      return deleted;
    } catch (error) {
      logger.error('Error deleting expired notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as email sent
   */
  async markEmailSent(notificationId: string): Promise<void> {
    try {
      await db('notifications')
        .where('id', notificationId)
        .update({
          email_sent: true,
          updated_at: new Date(),
        });
    } catch (error) {
      logger.error('Error marking notification as email sent:', error);
      throw error;
    }
  }

  /**
   * Get notifications pending email digest
   */
  async getPendingDigestNotifications(
    userId: string,
    since: Date
  ): Promise<Notification[]> {
    try {
      const notifications = await db('notifications')
        .where('user_id', userId)
        .andWhere('email_sent', false)
        .andWhere('created_at', '>=', since)
        .andWhere(function () {
          this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
        })
        .orderBy('created_at', 'asc');

      return notifications.map((n) => this.formatNotification(n));
    } catch (error) {
      logger.error('Error getting pending digest notifications:', error);
      throw error;
    }
  }

  /**
   * Format notification from database row
   */
  private formatNotification(row: any): Notification {
    return {
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      type: row.type,
      title: row.title,
      message: row.message,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action_url: row.action_url,
      priority: row.priority,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      triggered_by: row.triggered_by,
      in_app: row.in_app,
      email_sent: row.email_sent,
      slack_sent: row.slack_sent,
      is_read: row.is_read,
      read_at: row.read_at,
      expires_at: row.expires_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default new NotificationService();
