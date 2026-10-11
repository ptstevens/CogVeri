import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import permissionService from './permission.service';

interface SessionParticipant {
  userId: string;
  socketId: string;
  userName: string;
  role: 'presenter' | 'viewer';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
}

interface LiveSession {
  id: string;
  taskId: string;
  hostId: string;
  participants: Map<string, SessionParticipant>;
  status: 'waiting' | 'active' | 'ended';
  startedAt?: Date;
  endedAt?: Date;
  recordingId?: string;
  isRecording: boolean;
}

interface SignalingData {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  data: any;
  sessionId: string;
}

class WebRTCService {
  private io: SocketIOServer | null = null;
  private sessions: Map<string, LiveSession> = new Map();
  private socketToSession: Map<string, string> = new Map();
  private socketToUser: Map<string, string> = new Map();

  /**
   * Initialize WebRTC signaling server
   */
  initialize(io: SocketIOServer) {
    this.io = io;
    this.setupSignalingHandlers();
    logger.info('WebRTC signaling server initialized');
  }

  /**
   * Set up Socket.IO event handlers for WebRTC signaling
   */
  private setupSignalingHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.info(`WebRTC client connected: ${socket.id}`);

      // Handle session creation
      socket.on('create-session', async (data) => {
        await this.handleCreateSession(socket, data);
      });

      // Handle joining a session
      socket.on('join-session', async (data) => {
        await this.handleJoinSession(socket, data);
      });

      // Handle leaving a session
      socket.on('leave-session', async () => {
        await this.handleLeaveSession(socket);
      });

      // WebRTC signaling events
      socket.on('webrtc-offer', (data: SignalingData) => {
        this.handleWebRTCSignal(socket, data);
      });

      socket.on('webrtc-answer', (data: SignalingData) => {
        this.handleWebRTCSignal(socket, data);
      });

      socket.on('webrtc-ice-candidate', (data: SignalingData) => {
        this.handleWebRTCSignal(socket, data);
      });

      // Media control events
      socket.on('toggle-audio', (data) => {
        this.handleMediaToggle(socket, 'audio', data.enabled);
      });

      socket.on('toggle-video', (data) => {
        this.handleMediaToggle(socket, 'video', data.enabled);
      });

      socket.on('start-screen-share', async (data) => {
        await this.handleScreenShareStart(socket, data);
      });

      socket.on('stop-screen-share', () => {
        this.handleScreenShareStop(socket);
      });

      // Recording control
      socket.on('start-recording', async (data) => {
        await this.handleStartRecording(socket, data);
      });

      socket.on('stop-recording', async () => {
        await this.handleStopRecording(socket);
      });

      // Chat messages
      socket.on('send-message', (data) => {
        this.handleChatMessage(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Create a new live session
   */
  private async handleCreateSession(socket: Socket, data: any) {
    try {
      const { taskId, userId, userName } = data;

      // Check permissions
      const canCreate = await permissionService.hasResourceAccess(userId, 'tasks', taskId, 'edit');

      if (!canCreate) {
        socket.emit('error', { message: 'Insufficient permissions to create session' });
        return;
      }

      // Create session in database
      const sessionResult = await db('live_sessions')
        .insert({
          task_id: taskId,
          host_id: userId,
          status: 'waiting',
          started_at: new Date(),
        })
        .returning('*');

      const sessionId = sessionResult[0].id;

      // Create in-memory session
      const session: LiveSession = {
        id: sessionId,
        taskId,
        hostId: userId,
        participants: new Map(),
        status: 'waiting',
        startedAt: new Date(),
        isRecording: false,
      };

      // Add host as first participant
      const participant: SessionParticipant = {
        userId,
        socketId: socket.id,
        userName,
        role: 'presenter',
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        joinedAt: new Date(),
      };

      session.participants.set(socket.id, participant);
      this.sessions.set(sessionId, session);
      this.socketToSession.set(socket.id, sessionId);
      this.socketToUser.set(socket.id, userId);

      // Join Socket.IO room
      socket.join(sessionId);

      // Send session created confirmation
      socket.emit('session-created', {
        sessionId,
        participantId: socket.id,
        role: 'presenter',
      });

      // Notify others in the task
      socket.broadcast.emit('session-available', {
        sessionId,
        taskId,
        hostName: userName,
      });

      logger.info(`Live session created: ${sessionId} for task ${taskId}`);
    } catch (error) {
      logger.error('Error creating session:', error);
      socket.emit('error', { message: 'Failed to create session' });
    }
  }

  /**
   * Handle participant joining a session
   */
  private async handleJoinSession(socket: Socket, data: any) {
    try {
      const { sessionId, userId, userName } = data;

      const session = this.sessions.get(sessionId);
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Check permissions
      const canJoin = await permissionService.hasResourceAccess(
        userId,
        'tasks',
        session.taskId,
        'view'
      );

      if (!canJoin) {
        socket.emit('error', { message: 'Insufficient permissions to join session' });
        return;
      }

      // Add participant
      const participant: SessionParticipant = {
        userId,
        socketId: socket.id,
        userName,
        role: userId === session.hostId ? 'presenter' : 'viewer',
        isAudioEnabled: false,
        isVideoEnabled: false,
        isScreenSharing: false,
        joinedAt: new Date(),
      };

      session.participants.set(socket.id, participant);
      this.socketToSession.set(socket.id, sessionId);
      this.socketToUser.set(socket.id, userId);

      // Join Socket.IO room
      socket.join(sessionId);

      // Update session status if needed
      if (session.status === 'waiting' && session.participants.size > 1) {
        session.status = 'active';
        await db('live_sessions').where('id', sessionId).update({ status: 'active' });
      }

      // Send join confirmation
      socket.emit('session-joined', {
        sessionId,
        participantId: socket.id,
        role: participant.role,
        participants: Array.from(session.participants.values()).map((p) => ({
          id: p.socketId,
          userName: p.userName,
          role: p.role,
          isAudioEnabled: p.isAudioEnabled,
          isVideoEnabled: p.isVideoEnabled,
          isScreenSharing: p.isScreenSharing,
        })),
      });

      // Notify other participants
      socket.to(sessionId).emit('participant-joined', {
        id: socket.id,
        userName,
        role: participant.role,
      });

      logger.info(`User ${userName} joined session ${sessionId}`);
    } catch (error) {
      logger.error('Error joining session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  }

  /**
   * Handle participant leaving a session
   */
  private async handleLeaveSession(socket: Socket) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(socket.id);
    if (!participant) return;

    // Remove participant
    session.participants.delete(socket.id);
    this.socketToSession.delete(socket.id);
    this.socketToUser.delete(socket.id);

    // Leave Socket.IO room
    socket.leave(sessionId);

    // Notify other participants
    socket.to(sessionId).emit('participant-left', {
      id: socket.id,
      userName: participant.userName,
    });

    // End session if host left or no participants
    if (participant.userId === session.hostId || session.participants.size === 0) {
      await this.endSession(sessionId);
    }

    logger.info(`Participant ${participant.userName} left session ${sessionId}`);
  }

  /**
   * Handle WebRTC signaling
   */
  private handleWebRTCSignal(socket: Socket, signal: SignalingData) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) {
      socket.emit('error', { message: 'Not in a session' });
      return;
    }

    // Forward signal to target peer
    if (signal.to) {
      this.io?.to(signal.to).emit(`webrtc-${signal.type}`, {
        from: socket.id,
        data: signal.data,
      });
    } else {
      // Broadcast to all other participants in the session
      socket.to(sessionId).emit(`webrtc-${signal.type}`, {
        from: socket.id,
        data: signal.data,
      });
    }
  }

  /**
   * Handle media toggle (audio/video)
   */
  private handleMediaToggle(socket: Socket, type: 'audio' | 'video', enabled: boolean) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(socket.id);
    if (!participant) return;

    // Update participant media state
    if (type === 'audio') {
      participant.isAudioEnabled = enabled;
    } else {
      participant.isVideoEnabled = enabled;
    }

    // Notify other participants
    socket.to(sessionId).emit('participant-media-toggle', {
      participantId: socket.id,
      type,
      enabled,
    });

    logger.info(`${participant.userName} toggled ${type}: ${enabled}`);
  }

  /**
   * Handle screen share start
   */
  private async handleScreenShareStart(socket: Socket, _data: any) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(socket.id);
    if (!participant) return;

    // Check if user is presenter
    if (participant.role !== 'presenter') {
      socket.emit('error', { message: 'Only presenters can share screen' });
      return;
    }

    // Check if someone else is already sharing
    const currentSharer = Array.from(session.participants.values()).find((p) => p.isScreenSharing);

    if (currentSharer && currentSharer.socketId !== socket.id) {
      socket.emit('error', { message: 'Someone else is already sharing' });
      return;
    }

    participant.isScreenSharing = true;

    // Notify all participants
    this.io?.to(sessionId).emit('screen-share-started', {
      participantId: socket.id,
      userName: participant.userName,
    });

    logger.info(`${participant.userName} started screen sharing in session ${sessionId}`);
  }

  /**
   * Handle screen share stop
   */
  private handleScreenShareStop(socket: Socket) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(socket.id);
    if (!participant) return;

    participant.isScreenSharing = false;

    // Notify all participants
    this.io?.to(sessionId).emit('screen-share-stopped', {
      participantId: socket.id,
      userName: participant.userName,
    });

    logger.info(`${participant.userName} stopped screen sharing in session ${sessionId}`);
  }

  /**
   * Handle recording start
   */
  private async handleStartRecording(socket: Socket, _data: any) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(socket.id);
    if (!participant) return;

    // Check if user is presenter
    if (participant.role !== 'presenter') {
      socket.emit('error', { message: 'Only presenters can start recording' });
      return;
    }

    if (session.isRecording) {
      socket.emit('error', { message: 'Session is already being recorded' });
      return;
    }

    try {
      // Create recording entry in database
      const recordingResult = await db('recordings')
        .insert({
          task_id: session.taskId,
          user_id: participant.userId,
          type: 'live_session',
          status: 'recording',
          live_session_id: sessionId,
          started_at: new Date(),
        })
        .returning('*');

      session.recordingId = recordingResult[0].id;
      session.isRecording = true;

      // Notify all participants
      this.io?.to(sessionId).emit('recording-started', {
        recordingId: session.recordingId,
      });

      logger.info(`Recording started for session ${sessionId}`);
    } catch (error) {
      logger.error('Error starting recording:', error);
      socket.emit('error', { message: 'Failed to start recording' });
    }
  }

  /**
   * Handle recording stop
   */
  private async handleStopRecording(socket: Socket) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session || !session.isRecording) return;

    try {
      // Update recording status
      await db('recordings').where('id', session.recordingId).update({
        status: 'processing',
        ended_at: new Date(),
      });

      session.isRecording = false;

      // Notify all participants
      this.io?.to(sessionId).emit('recording-stopped', {
        recordingId: session.recordingId,
      });

      logger.info(`Recording stopped for session ${sessionId}`);
    } catch (error) {
      logger.error('Error stopping recording:', error);
    }
  }

  /**
   * Handle chat messages
   */
  private handleChatMessage(socket: Socket, data: any) {
    const sessionId = this.socketToSession.get(socket.id);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(socket.id);
    if (!participant) return;

    const message = {
      id: Date.now().toString(),
      userId: participant.userId,
      userName: participant.userName,
      text: data.text,
      timestamp: new Date(),
    };

    // Broadcast message to all participants
    this.io?.to(sessionId).emit('chat-message', message);

    logger.info(`Chat message in session ${sessionId} from ${participant.userName}`);
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(socket: Socket) {
    this.handleLeaveSession(socket);
    logger.info(`WebRTC client disconnected: ${socket.id}`);
  }

  /**
   * End a session
   */
  private async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Update session status in database
      await db('live_sessions').where('id', sessionId).update({
        status: 'ended',
        ended_at: new Date(),
      });

      // Notify all remaining participants
      this.io?.to(sessionId).emit('session-ended');

      // Clean up
      session.participants.forEach((p) => {
        this.socketToSession.delete(p.socketId);
        this.socketToUser.delete(p.socketId);
      });
      this.sessions.delete(sessionId);

      logger.info(`Session ${sessionId} ended`);
    } catch (error) {
      logger.error('Error ending session:', error);
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Array<{
    id: string;
    taskId: string;
    hostId: string;
    participantCount: number;
    status: string;
    isRecording: boolean;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      taskId: session.taskId,
      hostId: session.hostId,
      participantCount: session.participants.size,
      status: session.status,
      isRecording: session.isRecording,
    }));
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): LiveSession | undefined {
    return this.sessions.get(sessionId);
  }
}

export default new WebRTCService();
