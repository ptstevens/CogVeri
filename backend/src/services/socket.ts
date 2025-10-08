import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

export const initializeSocketIO = (io: Server) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.userId = decoded.id;
      socket.userRole = decoded.role;

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

    // Handle joining task-specific rooms
    socket.on('join:task', (taskId: string) => {
      socket.join(`task:${taskId}`);
      logger.info(`User ${socket.userId} joined task room: ${taskId}`);
    });

    // Handle leaving task-specific rooms
    socket.on('leave:task', (taskId: string) => {
      socket.leave(`task:${taskId}`);
      logger.info(`User ${socket.userId} left task room: ${taskId}`);
    });

    // Handle joining recording session
    socket.on('join:recording', (recordingId: string) => {
      socket.join(`recording:${recordingId}`);
      logger.info(`User ${socket.userId} joined recording room: ${recordingId}`);

      // Notify others in the room
      socket.to(`recording:${recordingId}`).emit('user:joined', {
        userId: socket.userId,
        timestamp: new Date(),
      });
    });

    // Handle live session signaling
    socket.on('webrtc:offer', (data: { to: string; offer: any }) => {
      socket.to(`user:${data.to}`).emit('webrtc:offer', {
        from: socket.userId,
        offer: data.offer,
      });
    });

    socket.on('webrtc:answer', (data: { to: string; answer: any }) => {
      socket.to(`user:${data.to}`).emit('webrtc:answer', {
        from: socket.userId,
        answer: data.answer,
      });
    });

    socket.on('webrtc:ice-candidate', (data: { to: string; candidate: any }) => {
      socket.to(`user:${data.to}`).emit('webrtc:ice-candidate', {
        from: socket.userId,
        candidate: data.candidate,
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