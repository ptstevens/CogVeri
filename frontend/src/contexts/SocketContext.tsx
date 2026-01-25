import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { tokenService } from '../services/token.service';
import { billingKeys } from '../hooks/useBilling';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  joinTaskRoom: (taskId: string) => void;
  leaveTaskRoom: (taskId: string) => void;
  joinRecordingRoom: (recordingId: string) => void;
  leaveRecordingRoom: (recordingId: string) => void;
  joinOrganizationRoom: (organizationId: string) => void;
  leaveOrganizationRoom: (organizationId: string) => void;
  sendWebRTCOffer: (to: string, offer: any) => void;
  sendWebRTCAnswer: (to: string, answer: any) => void;
  sendWebRTCIceCandidate: (to: string, candidate: any) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isCleaningUp = useRef(false);
  const currentTokenRef = useRef<string | null>(null);

  // Extract stable user identifiers to prevent unnecessary socket recreation
  // when user object reference changes but identity remains the same
  const userId = user?.id;
  const userOrgId = user?.org_id;

  // Subscribe to token changes to update socket auth on refresh
  useEffect(() => {
    const unsubscribe = tokenService.onTokenChange((newToken) => {
      // Only act if we have a socket and the token actually changed
      if (socket && newToken && newToken !== currentTokenRef.current) {
        console.log('[Socket] Token refreshed, updating socket auth');
        currentTokenRef.current = newToken;

        // Update socket auth for next reconnection
        socket.auth = { token: newToken };

        // If currently disconnected due to auth error, try to reconnect
        if (!socket.connected && connectionError?.includes('Authentication')) {
          console.log('[Socket] Reconnecting with new token');
          setConnectionError(null);
          reconnectAttempts.current = 0;
          socket.connect();
        }
      }
    });

    return unsubscribe;
  }, [socket, connectionError]);

  useEffect(() => {
    // Use stable userId instead of user object to prevent unnecessary reconnections
    if (!isAuthenticated || !userId) {
      return;
    }

    const token = tokenService.getAccessToken();
    currentTokenRef.current = token;

    // Don't attempt connection without a valid token
    if (!token) {
      return;
    }

    // Reset cleanup flag when effect runs
    isCleaningUp.current = false;

    // Determine socket URL: use VITE_SOCKET_URL if set, otherwise derive from API URL or current origin
    let socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      // Extract base URL from API URL (remove /api suffix if present)
      socketUrl = apiUrl.replace(/\/api\/?$/, '') || window.location.origin;
    }

    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Connection success
    newSocket.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttempts.current = 0;
      console.log('[Socket] Connected successfully');

      // Auto-join organization room to receive org-level events (e.g., subscription changes)
      if (userOrgId) {
        newSocket.emit('join:organization', userOrgId);
        console.log('[Socket] Joined organization room:', userOrgId);
      }
    });

    // Normal disconnect
    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      // Don't log during intentional cleanup (React re-renders)
      if (!isCleaningUp.current) {
        console.log('[Socket] Disconnected:', reason);
      }

      // Handle server-initiated disconnects
      if (reason === 'io server disconnect') {
        // Server kicked the client - likely auth issue
        setConnectionError('Disconnected by server - please refresh the page');
      }
    });

    // Connection errors (e.g., server unavailable, network issues)
    newSocket.on('connect_error', (error) => {
      // Ignore errors during intentional cleanup (React re-renders)
      if (isCleaningUp.current) {
        return;
      }

      reconnectAttempts.current++;
      console.error('[Socket] Connection error:', error.message);

      if (error.message.includes('Authentication')) {
        setConnectionError('Authentication failed - please log in again');
        newSocket.disconnect(); // Don't retry on auth errors
      } else if (reconnectAttempts.current >= maxReconnectAttempts) {
        setConnectionError('Unable to connect to real-time server');
        toast.error('Real-time connection failed. Some features may be unavailable.');
      }
    });

    // Server-side errors (e.g., access denied to room)
    newSocket.on('error', (error: { message: string }) => {
      console.error('[Socket] Server error:', error);

      // Handle specific error types
      if (error.message?.includes('Access denied')) {
        toast.error(error.message || 'Access denied');
      } else if (error.message?.includes('Not authenticated')) {
        setConnectionError('Session expired - please log in again');
      }
    });

    // Reconnection events
    newSocket.io.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnection attempt ${attempt}/${maxReconnectAttempts}`);
    });

    newSocket.io.on('reconnect', () => {
      console.log('[Socket] Reconnected successfully');
      setConnectionError(null);
    });

    newSocket.io.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after max attempts');
      setConnectionError('Connection lost - please refresh the page');
      toast.error('Real-time connection lost. Please refresh the page.');
    });

    // Handle notifications
    newSocket.on('notification', (_notification: any) => {
      // Notifications are shown in the notification panel - no toasts needed
    });

    // Handle WebRTC signaling
    newSocket.on('webrtc:offer', (data: { from: string; offer: any }) => {
      window.dispatchEvent(
        new CustomEvent('webrtc:offer', { detail: data })
      );
    });

    newSocket.on('webrtc:answer', (data: { from: string; answer: any }) => {
      window.dispatchEvent(
        new CustomEvent('webrtc:answer', { detail: data })
      );
    });

    newSocket.on('webrtc:ice-candidate', (data: { from: string; candidate: any }) => {
      window.dispatchEvent(
        new CustomEvent('webrtc:ice-candidate', { detail: data })
      );
    });

    // Handle subscription changes - invalidate billing cache so UI updates immediately
    newSocket.on('subscription:changed', (data: { event: string; tier: string; status: string }) => {
      console.log('[Socket] Subscription changed:', data);

      // Invalidate all billing-related queries to force refetch
      queryClient.invalidateQueries({ queryKey: billingKeys.all });

      // Show toast notification for subscription changes
      if (data.event === 'created' || data.event === 'updated') {
        toast.success(`Your plan has been updated to ${data.tier?.toUpperCase() || 'new plan'}`);
      } else if (data.event === 'restored') {
        toast.success('Your subscription has been restored');
      } else if (data.event === 'deleted') {
        toast('Your subscription has ended', { icon: '📋' });
      }
    });

    // Handle admin config changes - invalidate billing/pricing cache when admin makes changes
    // This ensures all users see updated pricing/features/settings in real-time
    newSocket.on('admin:config-changed', (data: { type: string; timestamp: string; details?: Record<string, unknown> }) => {
      console.log('[Socket] Admin config changed:', data);

      // Invalidate billing-related queries (includes tiers, subscription info)
      queryClient.invalidateQueries({ queryKey: billingKeys.all });

      // Also invalidate any pricing-specific queries
      queryClient.invalidateQueries({ queryKey: ['pricing'] });

      // Invalidate organization data if features changed (affects org limits/features)
      if (data.type.includes('feature') || data.type.includes('pricing_tier')) {
        queryClient.invalidateQueries({ queryKey: ['organization'] });
      }
    });

    setSocket(newSocket);

    return () => {
      // Mark as cleaning up to suppress errors during React re-renders
      isCleaningUp.current = true;
      newSocket.disconnect();
    };
    // Use userId and userOrgId instead of user object to prevent unnecessary reconnections
    // when user object reference changes but identity remains the same (e.g., after token refresh)
  }, [isAuthenticated, userId, userOrgId, queryClient]);

  const joinTaskRoom = useCallback((taskId: string) => {
    socket?.emit('join:task', taskId);
  }, [socket]);

  const leaveTaskRoom = useCallback((taskId: string) => {
    socket?.emit('leave:task', taskId);
  }, [socket]);

  const joinRecordingRoom = useCallback((recordingId: string) => {
    socket?.emit('join:recording', recordingId);
  }, [socket]);

  const leaveRecordingRoom = useCallback((recordingId: string) => {
    socket?.emit('leave:recording', recordingId);
  }, [socket]);

  const joinOrganizationRoom = useCallback((organizationId: string) => {
    socket?.emit('join:organization', organizationId);
  }, [socket]);

  const leaveOrganizationRoom = useCallback((organizationId: string) => {
    socket?.emit('leave:organization', organizationId);
  }, [socket]);

  const sendWebRTCOffer = useCallback((to: string, offer: any) => {
    socket?.emit('webrtc:offer', { to, offer });
  }, [socket]);

  const sendWebRTCAnswer = useCallback((to: string, answer: any) => {
    socket?.emit('webrtc:answer', { to, answer });
  }, [socket]);

  const sendWebRTCIceCandidate = useCallback((to: string, candidate: any) => {
    socket?.emit('webrtc:ice-candidate', { to, candidate });
  }, [socket]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({
      socket,
      isConnected,
      connectionError,
      joinTaskRoom,
      leaveTaskRoom,
      joinRecordingRoom,
      leaveRecordingRoom,
      joinOrganizationRoom,
      leaveOrganizationRoom,
      sendWebRTCOffer,
      sendWebRTCAnswer,
      sendWebRTCIceCandidate,
    }),
    [
      socket,
      isConnected,
      connectionError,
      joinTaskRoom,
      leaveTaskRoom,
      joinRecordingRoom,
      leaveRecordingRoom,
      joinOrganizationRoom,
      leaveOrganizationRoom,
      sendWebRTCOffer,
      sendWebRTCAnswer,
      sendWebRTCIceCandidate,
    ]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};