import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  UserIcon,
  CalendarIcon,
  VideoCameraIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Recording {
  id: string;
  task_id: string;
  file_url: string;
  duration_seconds: number;
  status: string;
  created_at: string;
  user_id: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string;
  reviewed_by: string;
  assignee_name: string;
  assignee_email: string;
  created_at: string;
  due_date: string;
}

interface ReviewComment {
  id: string;
  comment: string;
  timestamp?: number;
  created_at: string;
  reviewer_name: string;
}

const TaskReview: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | ''>('');
  const [videoError, setVideoError] = useState<string>('');
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Fetch task details
  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await api.get(`/tasks/${taskId}`);
      return response.data.data;
    },
  });

  // Fetch recordings for the task
  const { data: recordings, isLoading: recordingsLoading } = useQuery({
    queryKey: ['recordings', taskId],
    queryFn: async () => {
      const response = await api.get(`/recordings?task_id=${taskId}`);
      return response.data.data;
    },
  });

  // Fetch playback URL for the recording
  const { data: playbackUrl, isLoading: playbackUrlLoading } = useQuery({
    queryKey: ['playback-url', recordings?.[0]?.id],
    queryFn: async () => {
      if (!recordings?.[0]?.id) return null;
      const response = await api.get(`/recordings/${recordings[0].id}/playback-url`);
      return response.data.url;
    },
    enabled: !!recordings?.[0]?.id,
    staleTime: 1000 * 60 * 60, // 1 hour (since signed URLs expire after 24 hours)
  });

  // Submit review mutation
  const submitReviewMutation = useMutation({
    mutationFn: async (data: { decision: string; feedback: string }) => {
      const response = await api.post(`/tasks/${taskId}/review`, {
        status: data.decision === 'approve' ? 'completed' : 'rejected',
        feedback: data.feedback,
        reviewed_at: new Date().toISOString(),
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success(
        decision === 'approve'
          ? 'Task approved successfully!'
          : 'Task sent back for revision'
      );
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      navigate('/tasks');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit review');
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const response = await api.post(`/tasks/${taskId}/comments`, {
        comment,
        timestamp: currentTime,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Comment added');
      setFeedback('');
    },
  });

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    let errorMessage = 'Unknown error';

    if (video.error) {
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = 'Video playback aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error while loading video';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = 'Video decode error - codec may not be supported';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = 'Video format not supported';
          break;
      }
      console.error('Video error:', video.error, errorMessage);
    }
    setVideoError(errorMessage);
    toast.error(`Video Error: ${errorMessage}`);
  };

  const handleSubmitReview = () => {
    if (!decision) {
      toast.error('Please select a decision (Approve or Request Changes)');
      return;
    }

    if (!feedback.trim()) {
      toast.error('Please provide feedback for your decision');
      return;
    }

    submitReviewMutation.mutate({ decision, feedback });
  };

  if (taskLoading || recordingsLoading || playbackUrlLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const recording = recordings?.[0]; // Get the first recording
  const isReviewer = user?.id === task?.reviewed_by;

  if (!isReviewer && user?.role !== 'admin') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            You don't have permission to review this task.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Tasks
        </button>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{task?.title}</h1>
              <p className="mt-2 text-gray-600">{task?.description}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium
              ${task?.priority === 'high' ? 'bg-red-100 text-red-800' :
                task?.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'}`}>
              {task?.priority} priority
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center text-gray-600">
              <UserIcon className="h-5 w-5 mr-2" />
              <span>Submitted by: {task?.assignee_name || task?.assignee_email}</span>
            </div>
            <div className="flex items-center text-gray-600">
              <CalendarIcon className="h-5 w-5 mr-2" />
              <span>Due: {new Date(task?.due_date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center text-gray-600">
              <ClockIcon className="h-5 w-5 mr-2" />
              <span>Status: {task?.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Video Player Section */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold flex items-center">
                <VideoCameraIcon className="h-6 w-6 mr-2 text-purple-600" />
                Recording
              </h2>
            </div>

            {recording ? (
              <div className="relative bg-black">
                {videoError && (
                  <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-sm z-10">
                    {videoError}
                  </div>
                )}
                <video
                  ref={videoRef}
                  className="w-full h-auto max-h-[70vh]"
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onError={handleVideoError}
                  onLoadStart={() => console.log('Video load started', playbackUrl)}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    console.log('Video metadata loaded:', {
                      duration: vid.duration,
                      videoWidth: vid.videoWidth,
                      videoHeight: vid.videoHeight,
                    });
                  }}
                  onCanPlay={() => console.log('Video can play')}
                  controls
                  controlsList="nodownload"
                  preload="auto"
                  crossOrigin="anonymous"
                  key={playbackUrl} // Force reload when URL changes
                >
                  <source src={playbackUrl || undefined} type="video/webm; codecs=vp8,opus" />
                  <source src={playbackUrl || undefined} type="video/webm" />
                  Your browser does not support the video tag or the video codec.
                </video>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No recording available for this task yet.
              </div>
            )}
          </div>

          {/* Recording Info */}
          {recording && (
            <div className="mt-4 bg-white shadow rounded-lg p-4">
              <h3 className="font-semibold mb-2">Recording Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Duration:</span>
                  <span className="ml-2 font-medium">{formatTime(recording.duration_seconds)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Submitted:</span>
                  <span className="ml-2 font-medium">
                    {new Date(recording.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Review Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <ChatBubbleLeftRightIcon className="h-6 w-6 mr-2 text-purple-600" />
              Review Feedback
            </h2>

            {/* Feedback Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Feedback
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Provide detailed feedback about the recording..."
                />
              </div>

              {/* Decision Buttons */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Decision
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDecision('approve')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex flex-col items-center ${
                      decision === 'approve'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    <CheckCircleIcon className="h-8 w-8 mb-1" />
                    <span className="text-sm font-medium">Approve</span>
                  </button>
                  <button
                    onClick={() => setDecision('reject')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex flex-col items-center ${
                      decision === 'reject'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-300 hover:border-red-400'
                    }`}
                  >
                    <XCircleIcon className="h-8 w-8 mb-1" />
                    <span className="text-sm font-medium">Request Changes</span>
                  </button>
                </div>
              </div>

              {/* Submit Review Button */}
              <button
                onClick={handleSubmitReview}
                disabled={!decision || !feedback.trim() || submitReviewMutation.isPending}
                className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-medium"
              >
                {submitReviewMutation.isPending ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </span>
                ) : (
                  'Submit Review'
                )}
              </button>

              {/* Helper Text */}
              {decision === 'approve' && (
                <p className="text-sm text-green-600 mt-2">
                  ✓ This will mark the task as completed
                </p>
              )}
              {decision === 'reject' && (
                <p className="text-sm text-red-600 mt-2">
                  ⟲ The assignee will be notified to make changes
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskReview;