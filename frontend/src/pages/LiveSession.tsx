import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  VideoCameraIcon,
  VideoCameraSlashIcon,
  MicrophoneIcon,
  ComputerDesktopIcon,
  PhoneXMarkIcon,
  UserGroupIcon,
  ChatBubbleLeftIcon,
  ArrowLeftIcon,
  PlayCircleIcon,
  StopCircleIcon,
  UsersIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';
import { io, Socket } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

interface Participant {
  id: string;
  userName: string;
  role: 'presenter' | 'viewer';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  stream?: MediaStream;
  peerConnection?: RTCPeerConnection;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Date;
}

const LiveSession: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  // ICE servers configuration
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Fetch task details
  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await api.get(`/tasks/${taskId}`);
      return response.data.task;
    },
    enabled: !!taskId,
  });

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user || !taskId) return;

    const socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      transports: ['websocket'],
      auth: {
        token: localStorage.getItem('access_token'),
      },
    });

    socketInstance.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Connected to WebRTC signaling server');

      // Create or join session
      if (user.id === task?.created_by || user.id === task?.assigned_to) {
        socketInstance.emit('create-session', {
          taskId,
          userId: user.id,
          userName: user.name || user.email,
        });
      } else {
        // For now, auto-join if session exists
        // In production, you'd check for existing session first
      }
    });

    socketInstance.on('disconnect', () => {
      setConnectionStatus('disconnected');
      console.log('Disconnected from signaling server');
    });

    // Session events
    socketInstance.on('session-created', (data) => {
      setSessionId(data.sessionId);
      setIsHost(data.role === 'presenter');
      toast.success('Live session created');
    });

    socketInstance.on('session-joined', (data) => {
      setSessionId(data.sessionId);
      setIsHost(data.role === 'presenter');

      // Add existing participants
      data.participants.forEach((p: any) => {
        if (p.id !== socketInstance.id) {
          setParticipants(prev => new Map(prev).set(p.id, {
            id: p.id,
            userName: p.userName,
            role: p.role,
            isAudioEnabled: p.isAudioEnabled,
            isVideoEnabled: p.isVideoEnabled,
            isScreenSharing: p.isScreenSharing,
          }));
        }
      });
    });

    socketInstance.on('participant-joined', (data) => {
      setParticipants(prev => new Map(prev).set(data.id, {
        id: data.id,
        userName: data.userName,
        role: data.role,
        isAudioEnabled: false,
        isVideoEnabled: false,
        isScreenSharing: false,
      }));
      toast.success(`${data.userName} joined the session`);

      // Initiate peer connection for new participant
      if (localStream) {
        createPeerConnection(data.id, true);
      }
    });

    socketInstance.on('participant-left', (data) => {
      setParticipants(prev => {
        const updated = new Map(prev);
        updated.delete(data.id);
        return updated;
      });

      // Clean up peer connection
      const pc = peerConnections.current.get(data.id);
      if (pc) {
        pc.close();
        peerConnections.current.delete(data.id);
      }

      toast.info(`${data.userName} left the session`);
    });

    // WebRTC signaling
    socketInstance.on('webrtc-offer', async (data) => {
      await handleOffer(data.from, data.data);
    });

    socketInstance.on('webrtc-answer', async (data) => {
      await handleAnswer(data.from, data.data);
    });

    socketInstance.on('webrtc-ice-candidate', async (data) => {
      await handleIceCandidate(data.from, data.data);
    });

    // Media events
    socketInstance.on('participant-media-toggle', (data) => {
      setParticipants(prev => {
        const updated = new Map(prev);
        const participant = updated.get(data.participantId);
        if (participant) {
          if (data.type === 'audio') {
            participant.isAudioEnabled = data.enabled;
          } else {
            participant.isVideoEnabled = data.enabled;
          }
        }
        return updated;
      });
    });

    socketInstance.on('screen-share-started', (data) => {
      toast.info(`${data.userName} is sharing their screen`);
    });

    socketInstance.on('screen-share-stopped', (data) => {
      toast.info(`${data.userName} stopped sharing their screen`);
    });

    // Chat messages
    socketInstance.on('chat-message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    // Recording events
    socketInstance.on('recording-started', () => {
      setIsRecording(true);
      toast.success('Recording started');
    });

    socketInstance.on('recording-stopped', () => {
      setIsRecording(false);
      toast.success('Recording stopped');
    });

    // Session end
    socketInstance.on('session-ended', () => {
      toast.info('Session has ended');
      navigate(`/tasks/${taskId}`);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user, taskId, task]);

  // Initialize local media stream
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        toast.error('Failed to access camera/microphone');
      }
    };

    initializeMedia();

    return () => {
      localStream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback((participantId: string, isInitiator: boolean) => {
    if (peerConnections.current.has(participantId)) return;

    const pc = new RTCPeerConnection(iceServers);

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const participant = participants.get(participantId);
      if (participant) {
        participant.stream = event.streams[0];
        setParticipants(new Map(participants));
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', {
          to: participantId,
          data: event.candidate,
        });
      }
    };

    peerConnections.current.set(participantId, pc);

    // Create offer if initiator
    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket?.emit('webrtc-offer', {
          to: participantId,
          data: offer,
        });
      });
    }

    return pc;
  }, [localStream, socket, participants]);

  // Handle WebRTC offer
  const handleOffer = async (from: string, offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(from, false);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket?.emit('webrtc-answer', {
      to: from,
      data: answer,
    });
  };

  // Handle WebRTC answer
  const handleAnswer = async (from: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnections.current.get(from);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  };

  // Handle ICE candidate
  const handleIceCandidate = async (from: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnections.current.get(from);
    if (!pc) return;

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        socket?.emit('toggle-audio', { enabled: audioTrack.enabled });
      }
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        socket?.emit('toggle-video', { enabled: videoTrack.enabled });
      }
    }
  };

  // Start screen share
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      setScreenStream(stream);
      setIsScreenSharing(true);

      // Replace video track in peer connections
      const videoTrack = stream.getVideoTracks()[0];
      peerConnections.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      socket?.emit('start-screen-share', {});

      // Handle screen share ending
      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
      toast.error('Failed to start screen share');
    }
  };

  // Stop screen share
  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    setIsScreenSharing(false);

    // Restore camera video
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      peerConnections.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      });
    }

    socket?.emit('stop-screen-share');
  };

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      socket?.emit('stop-recording');
    } else {
      socket?.emit('start-recording', {});
    }
  };

  // Send chat message
  const sendChatMessage = () => {
    if (!chatInput.trim() || !socket) return;

    socket.emit('send-message', { text: chatInput });
    setChatInput('');
  };

  // Leave session
  const leaveSession = () => {
    socket?.emit('leave-session');
    navigate(`/tasks/${taskId}`);
  };

  if (taskLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/tasks/${taskId}`)}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">{task?.title}</h1>
              <p className="text-sm text-gray-400">Live Demo Session</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {connectionStatus === 'connected' ? (
              <span className="flex items-center text-green-400 text-sm">
                <span className="h-2 w-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Connected
              </span>
            ) : (
              <span className="flex items-center text-yellow-400 text-sm">
                <span className="h-2 w-2 bg-yellow-400 rounded-full mr-2"></span>
                Connecting...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex flex-col bg-black">
          {/* Main video */}
          <div className="flex-1 relative">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
              You {isScreenSharing && '(Screen)'}
            </div>
          </div>

          {/* Remote videos grid */}
          {participants.size > 0 && (
            <div className="h-32 bg-gray-900 border-t border-gray-800 p-2 flex space-x-2 overflow-x-auto">
              {Array.from(participants.values()).map(participant => (
                <div key={participant.id} className="relative h-full aspect-video bg-gray-800 rounded">
                  <video
                    autoPlay
                    className="w-full h-full object-cover rounded"
                    ref={(el) => {
                      if (el && participant.stream) {
                        el.srcObject = participant.stream;
                      }
                    }}
                  />
                  <div className="absolute bottom-1 left-1 text-xs text-white bg-black bg-opacity-50 px-1 rounded">
                    {participant.userName}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="bg-gray-900 border-t border-gray-800 px-6 py-4">
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={toggleAudio}
                className={`p-3 rounded-full ${
                  isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
                } text-white transition-colors`}
              >
                {isAudioEnabled ? (
                  <MicrophoneIcon className="h-6 w-6" />
                ) : (
                  <SpeakerXMarkIcon className="h-6 w-6" />
                )}
              </button>

              <button
                onClick={toggleVideo}
                className={`p-3 rounded-full ${
                  isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
                } text-white transition-colors`}
              >
                {isVideoEnabled ? (
                  <VideoCameraIcon className="h-6 w-6" />
                ) : (
                  <VideoCameraSlashIcon className="h-6 w-6" />
                )}
              </button>

              <button
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`p-3 rounded-full ${
                  isScreenSharing ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'
                } text-white transition-colors`}
              >
                <ComputerDesktopIcon className="h-6 w-6" />
              </button>

              {isHost && (
                <button
                  onClick={toggleRecording}
                  className={`p-3 rounded-full ${
                    isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'
                  } text-white transition-colors`}
                >
                  {isRecording ? (
                    <StopCircleIcon className="h-6 w-6" />
                  ) : (
                    <PlayCircleIcon className="h-6 w-6" />
                  )}
                </button>
              )}

              <button
                onClick={leaveSession}
                className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors ml-8"
              >
                <PhoneXMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => { setShowChat(true); setShowParticipants(false); }}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                showChat ? 'text-white bg-gray-900' : 'text-gray-400 hover:text-white'
              }`}
            >
              <ChatBubbleLeftIcon className="h-5 w-5 inline mr-2" />
              Chat
            </button>
            <button
              onClick={() => { setShowParticipants(true); setShowChat(false); }}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                showParticipants ? 'text-white bg-gray-900' : 'text-gray-400 hover:text-white'
              }`}
            >
              <UsersIcon className="h-5 w-5 inline mr-2" />
              Participants ({participants.size + 1})
            </button>
          </div>

          {/* Content */}
          {showChat ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <div className="font-medium text-gray-300">{msg.userName}</div>
                    <div className="text-gray-400">{msg.text}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-700 p-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={sendChatMessage}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-gray-700 rounded">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                      {user?.name?.[0] || user?.email?.[0]}
                    </div>
                    <span className="ml-3 text-white">You {isHost && '(Host)'}</span>
                  </div>
                  <div className="flex space-x-1">
                    {isAudioEnabled && <MicrophoneIcon className="h-4 w-4 text-green-400" />}
                    {isVideoEnabled && <VideoCameraIcon className="h-4 w-4 text-green-400" />}
                  </div>
                </div>

                {Array.from(participants.values()).map(participant => (
                  <div key={participant.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white font-medium">
                        {participant.userName[0]}
                      </div>
                      <span className="ml-3 text-white">
                        {participant.userName}
                        {participant.role === 'presenter' && ' (Presenter)'}
                      </span>
                    </div>
                    <div className="flex space-x-1">
                      {participant.isAudioEnabled && <MicrophoneIcon className="h-4 w-4 text-green-400" />}
                      {participant.isVideoEnabled && <VideoCameraIcon className="h-4 w-4 text-green-400" />}
                      {participant.isScreenSharing && <ComputerDesktopIcon className="h-4 w-4 text-purple-400" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveSession;