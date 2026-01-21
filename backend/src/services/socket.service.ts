import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { Notification } from './notification.service';
import { db } from '../config/database';

/**
 * Verify user has access to an organization
 */
async function canAccessOrganization(userId: string, organizationId: string): Promise<boolean> {
  try {
    const membership = await db('organization_members')
      .where({ user_id: userId, organization_id: organizationId })
      .first();
    return !!membership;
  } catch (error) {
    logger.error('Error checking organization access:', error);
    return false;
  }
}

/**
 * Verify user has access to a task (must be in same org, or be creator/assignee/reviewer)
 */
async function canAccessTask(userId: string, userOrgId: string | undefined, taskId: string): Promise<boolean> {
  try {
    const task = await db('tasks')
      .where({ id: taskId })
      .first();

    if (!task) return false;

    // User must be in the same organization as the task
    if (task.organization_id !== userOrgId) {
      // Check if user is a member of the task's organization
      const isMember = await canAccessOrganization(userId, task.organization_id);
      if (!isMember) return false;
    }

    return true;
  } catch (error) {
    logger.error('Error checking task access:', error);
    return false;
  }
}

/**
 * Verify user has access to a recording
 */
async function canAccessRecording(userId: string, userOrgId: string | undefined, recordingId: string): Promise<boolean> {
  try {
    const recording = await db('recordings')
      .where({ id: recordingId })
      .first();

    if (!recording) return false;

    // User must be in the same organization as the recording
    if (recording.organization_id !== userOrgId) {
      const isMember = await canAccessOrganization(userId, recording.organization_id);
      if (!isMember) return false;
    }

    return true;
  } catch (error) {
    logger.error('Error checking recording access:', error);
    return false;
  }
}

/**
 * SECURITY: Verify user can send WebRTC signaling to target user
 * Users can only signal:
 * 1. Other users in the same organization, OR
 * 2. Participants in a shared live session
 */
async function canSignalUser(
  fromUserId: string | undefined,
  fromOrgId: string | undefined,
  toUserId: string,
  sessionId?: string
): Promise<boolean> {
  if (!fromUserId) return false;

  try {
    // Option 1: Check if both users are in the same organization
    if (fromOrgId) {
      const targetMembership = await db('organization_members')
        .where({ user_id: toUserId, organization_id: fromOrgId, status: 'active' })
        .first();

      if (targetMembership) {
        return true;
      }
    }

    // Option 2: Check if both users are participants in the same live session
    if (sessionId) {
      const session = await db('live_sessions')
        .where({ id: sessionId })
        .whereIn('status', ['active', 'pending'])
        .first();

      if (session) {
        // Check if both users are participants
        const participants = await db('live_session_participants')
          .where({ live_session_id: sessionId })
          .whereIn('user_id', [fromUserId, toUserId]);

        // Both users must be participants
        const participantIds = participants.map((p: { user_id: string }) => p.user_id);
        if (participantIds.includes(fromUserId) && participantIds.includes(toUserId)) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error('Error checking signaling authorization:', error);
    return false;
  }
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  organizationId?: string;
}

// Store the io instance for use by NotificationSocketService
let ioInstance: Server | null = null;

export const initializeSocketIO = (io: Server) => {
  // Store the io instance globally
  ioInstance = io;

  // Authentication middleware for Socket.IO
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.userId = decoded.userId || decoded.id;
      socket.userRole = decoded.role || decoded.org_role;
      socket.organizationId = decoded.org_id;

      logger.info(`Socket authenticated for user ${socket.userId}`);
      next();
    } catch (error) {
      logger.error('Socket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected via WebSocket`);

    // Join user to their personal room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Join user to role-based rooms
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }

    // Join user to organization room
    if (socket.organizationId) {
      socket.join(`org:${socket.organizationId}`);
    }

    // Handle joining organization room manually - WITH AUTHORIZATION
    socket.on('join:organization', async (organizationId: string) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      // Verify user has access to this organization
      const hasAccess = await canAccessOrganization(socket.userId, organizationId);
      if (!hasAccess) {
        logger.warn(`User ${socket.userId} denied access to organization room: ${organizationId}`);
        socket.emit('error', { message: 'Access denied to organization' });
        return;
      }

      socket.join(`org:${organizationId}`);
      logger.info(`User ${socket.userId} joined organization room: ${organizationId}`);
    });

    // Handle leaving organization room
    socket.on('leave:organization', (organizationId: string) => {
      socket.leave(`org:${organizationId}`);
      logger.info(`User ${socket.userId} left organization room: ${organizationId}`);
    });

    // Handle joining task-specific rooms - WITH AUTHORIZATION
    socket.on('join:task', async (taskId: string) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      // Verify user has access to this task
      const hasAccess = await canAccessTask(socket.userId, socket.organizationId, taskId);
      if (!hasAccess) {
        logger.warn(`User ${socket.userId} denied access to task room: ${taskId}`);
        socket.emit('error', { message: 'Access denied to task' });
        return;
      }

      socket.join(`task:${taskId}`);
      logger.info(`User ${socket.userId} joined task room: ${taskId}`);
    });

    // Handle leaving task-specific rooms
    socket.on('leave:task', (taskId: string) => {
      socket.leave(`task:${taskId}`);
      logger.info(`User ${socket.userId} left task room: ${taskId}`);
    });

    // Handle joining recording session - WITH AUTHORIZATION
    socket.on('join:recording', async (recordingId: string) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      // Verify user has access to this recording
      const hasAccess = await canAccessRecording(socket.userId, socket.organizationId, recordingId);
      if (!hasAccess) {
        logger.warn(`User ${socket.userId} denied access to recording room: ${recordingId}`);
        socket.emit('error', { message: 'Access denied to recording' });
        return;
      }

      socket.join(`recording:${recordingId}`);
      logger.info(`User ${socket.userId} joined recording room: ${recordingId}`);

      // Notify others in the room
      socket.to(`recording:${recordingId}`).emit('user:joined', {
        userId: socket.userId,
        timestamp: new Date(),
      });
    });

    // Handle live session signaling with authorization
    // SECURITY FIX: Verify sender can signal to target user
    socket.on('webrtc:offer', async (data: { to: string; offer: any; sessionId?: string }) => {
      // Verify target user is in the same organization or shared session
      const canSignal = await canSignalUser(socket.userId, socket.organizationId, data.to, data.sessionId);
      if (!canSignal) {
        logger.warn(`WebRTC signaling denied: ${socket.userId} -> ${data.to}`);
        socket.emit('error', { message: 'Not authorized to signal this user' });
        return;
      }

      socket.to(`user:${data.to}`).emit('webrtc:offer', {
        from: socket.userId,
        offer: data.offer,
        sessionId: data.sessionId,
      });
    });

    socket.on('webrtc:answer', async (data: { to: string; answer: any; sessionId?: string }) => {
      const canSignal = await canSignalUser(socket.userId, socket.organizationId, data.to, data.sessionId);
      if (!canSignal) {
        logger.warn(`WebRTC signaling denied: ${socket.userId} -> ${data.to}`);
        socket.emit('error', { message: 'Not authorized to signal this user' });
        return;
      }

      socket.to(`user:${data.to}`).emit('webrtc:answer', {
        from: socket.userId,
        answer: data.answer,
        sessionId: data.sessionId,
      });
    });

    socket.on('webrtc:ice-candidate', async (data: { to: string; candidate: any; sessionId?: string }) => {
      const canSignal = await canSignalUser(socket.userId, socket.organizationId, data.to, data.sessionId);
      if (!canSignal) {
        // Don't log every ICE candidate denial to avoid log spam
        socket.emit('error', { message: 'Not authorized to signal this user' });
        return;
      }

      socket.to(`user:${data.to}`).emit('webrtc:ice-candidate', {
        from: socket.userId,
        candidate: data.candidate,
        sessionId: data.sessionId,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected from WebSocket`);
    });
  });

  return io;
};

// Helper functions for emitting events from other parts of the application
export const emitToUser = (io: Server, userId: string, event: string, data: any) => {
  io.to(`user:${userId}`).emit(event, data);
};

export const emitToTask = (io: Server, taskId: string, event: string, data: any) => {
  io.to(`task:${taskId}`).emit(event, data);
};

export const emitToRole = (io: Server, role: string, event: string, data: any) => {
  io.to(`role:${role}`).emit(event, data);
};

export const broadcastNotification = (io: Server, notification: {
  type: string;
  title: string;
  message: string;
  userId?: string;
  taskId?: string;
}) => {
  if (notification.userId) {
    emitToUser(io, notification.userId, 'notification', notification);
  } else {
    io.emit('notification', notification);
  }
};

// Get the io instance
export const getIO = (): Server | null => {
  return ioInstance;
};

// Emit to organization room
export const emitToOrganization = (io: Server, organizationId: string, event: string, data: any) => {
  io.to(`org:${organizationId}`).emit(event, data);
};

/**
 * Notification Socket Service
 * Provides methods for sending real-time notifications via Socket.IO
 */
class NotificationSocketService {
  /**
   * Notify a specific user
   */
  notifyUser(userId: string, notification: Notification): void {
    const io = getIO();
    if (!io) {
      logger.warn('Socket.IO not initialized, cannot send notification to user');
      return;
    }

    io.to(`user:${userId}`).emit('notification:new', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      action_url: notification.action_url,
      priority: notification.priority,
      metadata: notification.metadata,
      created_at: notification.created_at,
    });

    logger.debug(`Notification sent to user ${userId}: ${notification.type}`);
  }

  /**
   * Notify all members of an organization
   */
  notifyOrganization(organizationId: string, notification: Notification): void {
    const io = getIO();
    if (!io) {
      logger.warn('Socket.IO not initialized, cannot send notification to organization');
      return;
    }

    io.to(`org:${organizationId}`).emit('notification:new', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      action_url: notification.action_url,
      priority: notification.priority,
      metadata: notification.metadata,
      created_at: notification.created_at,
    });

    logger.debug(`Notification sent to organization ${organizationId}: ${notification.type}`);
  }

  /**
   * Notify multiple users
   */
  notifyUsers(userIds: string[], notification: Notification): void {
    userIds.forEach((userId) => this.notifyUser(userId, notification));
  }

  /**
   * Broadcast to all connected users
   */
  broadcastToAll(notification: Notification): void {
    const io = getIO();
    if (!io) {
      logger.warn('Socket.IO not initialized, cannot broadcast notification');
      return;
    }

    io.emit('notification:new', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      action_url: notification.action_url,
      priority: notification.priority,
      metadata: notification.metadata,
      created_at: notification.created_at,
    });

    logger.debug(`Broadcast notification: ${notification.type}`);
  }

  /**
   * Send notification read update
   */
  notifyRead(userId: string, notificationId: string): void {
    const io = getIO();
    if (!io) {
      return;
    }

    io.to(`user:${userId}`).emit('notification:read', { id: notificationId });
  }

  /**
   * Send all notifications read update
   */
  notifyAllRead(userId: string): void {
    const io = getIO();
    if (!io) {
      return;
    }

    io.to(`user:${userId}`).emit('notification:all-read');
  }

  /**
   * Send updated unread count
   */
  updateUnreadCount(userId: string, count: number): void {
    const io = getIO();
    if (!io) {
      return;
    }

    io.to(`user:${userId}`).emit('notification:unread-count', { count });
  }
}

export const notificationSocketService = new NotificationSocketService();

/**
 * Admin Config Change Types
 * Used to notify all clients when admin makes system-wide changes
 */
export type AdminConfigChangeType =
  | 'pricing_tier_updated'
  | 'pricing_tier_created'
  | 'pricing_tier_archived'
  | 'pricing_tier_reactivated'
  | 'feature_definitions_updated'
  | 'trial_settings_updated'
  | 'system_settings_updated';

export interface AdminConfigChangePayload {
  type: AdminConfigChangeType;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Broadcast admin config changes to ALL connected clients
 * This triggers cache invalidation on the frontend so users see updated data
 */
export function broadcastAdminConfigChange(
  type: AdminConfigChangeType,
  details?: Record<string, unknown>
): void {
  const io = getIO();
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot broadcast admin config change');
    return;
  }

  const payload: AdminConfigChangePayload = {
    type,
    timestamp: new Date().toISOString(),
    details,
  };

  // Broadcast to ALL connected clients
  io.emit('admin:config-changed', payload);

  logger.info(`Admin config change broadcast: ${type}`, { details });
}