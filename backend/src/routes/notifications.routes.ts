import { Router, Response, NextFunction } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import notificationService, { NotificationType } from '../services/notification.service';
import notificationPreferencesService from '../services/notification-preferences.service';
import { notificationSocketService } from '../services/socket.service';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/AppError';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

/**
 * GET /notifications
 * Get all notifications with pagination
 */
router.get('/', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.org_id;

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const unreadOnly = req.query.unread === 'true';
    const type = req.query.type as NotificationType | undefined;

    const result = await notificationService.getAll({
      userId,
      organizationId,
      unreadOnly,
      type,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.notifications,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /notifications/unread/count
 * Get unread notification count
 */
router.get('/unread/count', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.org_id;

    const count = await notificationService.getUnreadCount(userId, organizationId);

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /notifications/unread
 * Get unread notifications
 */
router.get('/unread', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.org_id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const notifications = await notificationService.getUnread(userId, organizationId, limit);

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /notifications/:id/read
 * Mark a single notification as read
 */
router.put('/:id/read', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id!;

    const notification = await notificationService.markAsRead(notificationId, userId);

    // Send socket update
    notificationSocketService.notifyRead(userId, notificationId);

    // Get and send updated unread count
    const count = await notificationService.getUnreadCount(userId, req.user!.org_id);
    notificationSocketService.updateUnreadCount(userId, count);

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.org_id;

    const count = await notificationService.markAllAsRead(userId, organizationId);

    // Send socket update
    notificationSocketService.notifyAllRead(userId);
    notificationSocketService.updateUnreadCount(userId, 0);

    res.json({
      success: true,
      data: { markedAsRead: count },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id!;

    const deleted = await notificationService.delete(notificationId, userId);

    if (!deleted) {
      throw new NotFoundError('Notification not found');
    }

    // Get and send updated unread count
    const count = await notificationService.getUnreadCount(userId, req.user!.org_id);
    notificationSocketService.updateUnreadCount(userId, count);

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /notifications/preferences
 * Get notification preferences for the current user
 */
router.get('/preferences', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const preferences = await notificationPreferencesService.getPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /notifications/preferences
 * Update notification preferences for the current user
 */
router.put('/preferences', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown>;
    const {
      email_enabled,
      push_enabled,
      in_app_enabled,
      digest_frequency,
      preferences_json,
      quiet_hours_start,
      quiet_hours_end,
      timezone,
    } = body as {
      email_enabled?: boolean;
      push_enabled?: boolean;
      in_app_enabled?: boolean;
      digest_frequency?: 'immediate' | 'daily' | 'weekly' | 'never';
      preferences_json?: Record<string, unknown>;
      quiet_hours_start?: string;
      quiet_hours_end?: string;
      timezone?: string;
    };

    // Validate digest_frequency if provided
    if (digest_frequency && !['immediate', 'daily', 'weekly', 'never'].includes(digest_frequency)) {
      throw new BadRequestError('Invalid digest_frequency. Must be: immediate, daily, weekly, or never');
    }

    const preferences = await notificationPreferencesService.updatePreferences(userId, {
      email_enabled,
      push_enabled,
      in_app_enabled,
      digest_frequency,
      preferences_json,
      quiet_hours_start,
      quiet_hours_end,
      timezone,
    });

    logger.info(`User ${userId} updated notification preferences`);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /notifications/:id
 * Get a single notification by ID
 */
router.get('/:id', async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id!;

    const notification = await notificationService.getById(notificationId, userId);

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
