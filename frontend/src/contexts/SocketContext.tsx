import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinTaskRoom: (taskId: string) => void;
  leaveTaskRoom: (taskId: string) => void;
  joinRecordingRoom: (recordingId: string) => void;
  leaveRecordingRoom: (recordingId: string) => void;
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
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const token = localStorage.getItem(import.meta.env.VITE_AUTH_TOKEN_KEY || 'relay_auth_token');

    const newSocket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    // Handle notifications
    newSocket.on('notification', (notification: any) => {
      switch (notification.type) {
        case 'task_assigned':
          toast.success(notification.message || 'New task assigned to you');
          break;
        case 'task_submitted':
          toast.info(notification.message || 'Task submitted for review');
          break;
        case 'review_completed':
          toast.success(notification.message || 'Review completed');
          break;
        case 'feedback_received':
          toast.info(notification.message || 'New feedback received');
          break;
        default:
          toast(notification.message || 'New notification');
      }
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

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, user]);

  const joinTaskRoom = (taskId: string) => {
    socket?.emit('join:task', taskId);
  };

  const leaveTaskRoom = (taskId: string) => {
    socket?.emit('leave:task', taskId);
  };

  const joinRecordingRoom = (recordingId: string) => {
    socket?.emit('join:recording', recordingId);
  };

  const leaveRecordingRoom = (recordingId: string) => {
    socket?.emit('leave:recording', recordingId);
  };

  const sendWebRTCOffer = (to: string, offer: any) => {
    socket?.emit('webrtc:offer', { to, offer });
  };

  const sendWebRTCAnswer = (to: string, answer: any) => {
    socket?.emit('webrtc:answer', { to, answer });
  };

  const sendWebRTCIceCandidate = (to: string, candidate: any) => {
    socket?.emit('webrtc:ice-candidate', { to, candidate });
  };

  const value = {
    socket,
    isConnected,
    joinTaskRoom,
    leaveTaskRoom,
    joinRecordingRoom,
    leaveRecordingRoom,
    sendWebRTCOffer,
    sendWebRTCAnswer,
    sendWebRTCIceCandidate,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};