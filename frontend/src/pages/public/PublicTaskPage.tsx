import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Video,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  Calendar,
  FileText,
  Lock,
  Loader,
  ListChecks,
  Shield,
  RotateCcw,
  Play,
} from 'lucide-react';
import { RichTextContent } from '../../components/ui/RichTextEditor';
import { magicLinkService, ClaimTaskDto } from '../../services/magicLink.service';
import { recordingService } from '../../services/recording.service';
import { RecordingPiPControls } from '../../components/RecordingPiPControls';
import { useRecordingKeyboardShortcuts } from '../../hooks/useRecordingKeyboardShortcuts';
import { useChunkedRecording } from '../../hooks/useChunkedRecording';
import { RecordingSetupModal, RecordingSetupConfig } from '../../components/RecordingSetup';
import { FloatingWebcamBubble } from '../../components/WebcamBubble';
import toast from 'react-hot-toast';

type PageState = 'loading' | 'landing' | 'claim' | 'task' | 'error';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

const PublicTaskPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const searchParams = new URLSearchParams(window.location.search);
  const organizationId = searchParams.get('org') || undefined;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [taskData, setTaskData] = useState<any>(null);
  const [claimData, setClaimData] = useState<ClaimTaskDto>({
    firstName: '',
    lastName: '',
    email: '',
  });
  const [_isRecording, setIsRecording] = useState(false);
  const [_isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Use refs for interval IDs to ensure synchronous access and proper cleanup
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null); // Countdown before recording starts
  const [_isPiPActive, setIsPiPActive] = useState(false);

  // Always use chunked recording mode (better for all recordings)
  const chunkedRecording = useChunkedRecording({ isPublic: true });

  // Fetch task data on mount
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-task', token, organizationId],
    queryFn: async () => {
      if (!token) throw new Error('No token provided');
      return await magicLinkService.getTaskByToken(token, organizationId);
    },
    retry: false,
  });

  useEffect(() => {
    if (isLoading) {
      setPageState('loading');
    } else if (error) {
      setPageState('error');
    } else if (data) {
      setTaskData(data);
      // Pre-fill email from token
      setClaimData((prev) => ({ ...prev, email: data.tokenInfo.email }));

      // Parse checklist from task metadata
      if (data.task.metadata?.checklist && Array.isArray(data.task.metadata.checklist)) {
        const items = data.task.metadata.checklist.map((text: string, index: number) => ({
          id: `item-${index}`,
          text,
          completed: false,
        }));
        setChecklistItems(items);
      }

      // If already claimed, go directly to task view
      if (data.tokenInfo.isClaimed) {
        setPageState('task');
      } else {
        setPageState('landing');
      }
    }
  }, [data, isLoading, error]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Claim task mutation
  const claimMutation = useMutation({
    mutationFn: async (data: ClaimTaskDto) => {
      if (!token) throw new Error('No token');
      return await magicLinkService.claimTask(token, data);
    },
    onSuccess: (result) => {
      setTaskData(result);
      setPageState('task');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to claim task');
    },
  });

  // Legacy recording handlers removed - replaced by chunked recording approach
  // See openSetupModal() and chunked recording handlers below

  // === Chunked Recording Handlers ===

  // Open setup modal to configure recording
  const openSetupModal = () => {
    if (chunkedRecording.state !== 'idle' || !token || !taskData?.task) {
      return;
    }
    setShowSetupModal(true);
  };

  // Handle recording start from setup modal
  const handleStartFromSetup = async (
    config: RecordingSetupConfig,
    webcamStream: MediaStream | null
  ) => {
    if (!token || !taskData?.task) return;

    // Store webcam stream ref for cleanup
    webcamStreamRef.current = webcamStream;
    setShowSetupModal(false);

    try {
      // Show 3-second countdown
      setCountdown(3);
      setIsRecording(true); // Enable PiP auto-open

      // Countdown
      let count = 3;
      const interval = setInterval(() => {
        count--;
        setCountdown(count);
        if (count === 0) {
          clearInterval(interval);
          countdownIntervalRef.current = null;
          setCountdown(null);

          // Start chunked recording with webcam config
          chunkedRecording.startRecording({
            taskId: taskData.task.id,
            token: token,
            organizationId: taskData.tokenInfo?.organizationId,
            hasAudio: config.hasAudio,
            audioDeviceId: config.audioDeviceId ?? undefined,
            hasWebcam: config.hasWebcam,
            webcamStream: webcamStream ?? undefined,
            webcamConfig: config.hasWebcam ? config.webcamConfig : undefined,
          }).catch((err) => {
            toast.error(err.message || 'Failed to start recording');
            setIsRecording(false);
            // Clean up webcam stream on error
            if (webcamStream) {
              webcamStream.getTracks().forEach(track => track.stop());
              webcamStreamRef.current = null;
            }
          });
        }
      }, 1000);

      countdownIntervalRef.current = interval;
    } catch (error: any) {
      setCountdown(null);
      setIsRecording(false);
      // Clean up webcam stream on error
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
      }
      toast.error(error.message || 'Failed to start recording');
    }
  };

  // Stop chunked recording (transitions to preview state, does NOT submit)
  const handleStopChunkedRecording = async () => {
    try {
      // Clear intervals
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      setIsRecording(false);
      setCountdown(null);

      await chunkedRecording.stopRecording();
    } catch (error: any) {
      toast.error(error.message || 'Failed to stop recording');
    }
  };

  // Submit chunked recording (from preview state)
  const handleSubmitChunkedRecording = async () => {
    try {
      const result = await chunkedRecording.submitRecording();

      if (result) {
        // Update task data to show submitted status
        setTaskData({
          ...taskData,
          task: { ...taskData.task, status: 'submitted' },
        });
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit recording');
    }
  };

  // Redo chunked recording (deletes uploaded files and resets)
  const handleRedoChunkedRecording = async () => {
    try {
      await chunkedRecording.redoRecording();
      toast('Recording cleared - you can start again');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset recording');
    }
  };

  // Pause chunked recording
  const handlePauseChunkedRecording = () => {
    chunkedRecording.pauseRecording();
    setIsPaused(true);
  };

  // Resume chunked recording
  const handleResumeChunkedRecording = () => {
    chunkedRecording.resumeRecording();
    setIsPaused(false);
  };

  // Recording state (always using chunked mode)
  const isActivelyRecording = chunkedRecording.state === 'recording' || chunkedRecording.state === 'paused';
  const isRecordingPaused = chunkedRecording.state === 'paused';

  // Enable global keyboard shortcuts for recording controls
  useRecordingKeyboardShortcuts({
    isRecording: isActivelyRecording,
    isPaused: isRecordingPaused,
    onPause: handlePauseChunkedRecording,
    onResume: handleResumeChunkedRecording,
    onStop: handleStopChunkedRecording,
    enabled: true,
  });

  // Legacy: Upload recording (kept for backward compatibility)
  const handleUploadRecording = async () => {
    if (!recordedBlob || !taskData?.task || !token) {
      toast.error('No recording to upload');
      return;
    }

    try {
      const uploadToast = toast.loading('Uploading recording...');

      // Use the token-based upload method for external contributors
      await recordingService.uploadRecordingWithToken(recordedBlob, token, {
        duration_seconds: recordingDuration,
        has_audio: true, // Default to true for legacy path
        resolution: '1920x1080', // You can get actual resolution from video
      }, taskData?.tokenInfo?.organizationId);

      toast.dismiss(uploadToast);

      // Update task data to show submitted status
      setTaskData({
        ...taskData,
        task: { ...taskData.task, status: 'submitted' },
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to upload recording');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const toggleChecklistItem = (id: string) => {
    setChecklistItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const allChecklistItemsCompleted = checklistItems.length === 0 || checklistItems.every((item) => item.completed);

  // Loading State
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <img src="/cogveri-icon.png" alt="CogVeri" className="h-16 w-auto mx-auto mb-4 animate-pulse" />
            <Loader className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-2" />
            <p className="text-gray-600">Loading task...</p>
          </div>
        </div>
        <footer className="py-4 text-center text-sm text-gray-500">
          Powered by <span className="font-semibold text-purple-600">CogVeri</span>
        </footer>
      </div>
    );
  }

  // Error State
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <img src="/cogveri-icon.png" alt="CogVeri" className="h-12 w-auto mx-auto mb-4" />
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid or Expired Link</h1>
            <p className="text-gray-600 mb-6">
              This link may have expired or been revoked. Please contact the person who sent you this link.
            </p>
          </div>
        </div>
        <footer className="py-4 text-center text-sm text-gray-500">
          Powered by <span className="font-semibold text-purple-600">CogVeri</span>
        </footer>
      </div>
    );
  }

  // Landing State (Before Claim)
  if (pageState === 'landing' && taskData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex flex-col px-4 py-8">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-10 text-white">
              <div className="flex items-center justify-center mb-4">
                <img src="/cogveri-icon.png" alt="CogVeri" className="h-14 w-auto" />
              </div>
              <h1 className="text-3xl font-bold text-center mb-2">You've Been Invited!</h1>
              <p className="text-center text-purple-100">
                Complete a recording task for {taskData.task.creator_name}
              </p>
            </div>

          {/* Task Details */}
          <div className="px-8 py-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{taskData.task.title}</h2>
              {taskData.task.description && (
                <RichTextContent
                  content={taskData.task.description}
                  className="text-gray-600"
                />
              )}
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <User className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Requested by</p>
                  <p className="text-sm text-gray-600">{taskData.task.creator_name}</p>
                </div>
              </div>

              {taskData.task.due_date && (
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Due Date</p>
                    <p className="text-sm text-gray-600">{formatDate(taskData.task.due_date)}</p>
                  </div>
                </div>
              )}

              {taskData.task.estimated_duration && (
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Estimated Time</p>
                    <p className="text-sm text-gray-600">{taskData.task.estimated_duration} minutes</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <Lock className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Link Expires</p>
                  <p className="text-sm text-gray-600">{formatDate(taskData.tokenInfo.expiresAt)}</p>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                What You'll Do
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                <li>Confirm your details on the next step</li>
                <li>Review the full task requirements</li>
                <li>Record your screen (and optionally audio)</li>
                <li>Submit your recording for review</li>
              </ol>
            </div>

            {/* Get Started Button */}
            <button
              onClick={() => setPageState('claim')}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
            >
              Get Started
            </button>
          </div>
          </div>
        </div>
        <footer className="py-4 text-center text-sm text-gray-500">
          Powered by <span className="font-semibold text-purple-600">CogVeri</span>
        </footer>
      </div>
    );
  }

  // Claim State (Name/Email Form)
  if (pageState === 'claim' && taskData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex flex-col px-4 py-8">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <img src="/cogveri-icon.png" alt="CogVeri" className="h-12 w-auto mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm Your Details</h2>
            <p className="text-gray-600">Please verify your information to continue</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              claimMutation.mutate(claimData);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={claimData.firstName}
                onChange={(e) => setClaimData({ ...claimData, firstName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="John"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={claimData.lastName}
                onChange={(e) => setClaimData({ ...claimData, lastName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={claimData.email}
                onChange={(e) => setClaimData({ ...claimData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-50"
                placeholder="john@example.com"
                readOnly
              />
              <p className="text-xs text-gray-500 mt-1">
                This must match the email where you received the invitation
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setPageState('landing')}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={claimMutation.isPending}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claimMutation.isPending ? 'Claiming...' : 'Continue'}
              </button>
            </div>
          </form>
          </div>
        </div>
        <footer className="py-4 text-center text-sm text-gray-500">
          Powered by <span className="font-semibold text-purple-600">CogVeri</span>
        </footer>
      </div>
    );
  }

  // Task State (After Claim - Recording Interface)
  if (pageState === 'task' && taskData) {
    const task = taskData.task;
    const isSubmitted = task.status === 'submitted' || task.status === 'completed';

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header with CogVeri branding */}
        <header className="bg-white border-b border-gray-200 py-3 px-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/cogveri-icon.png" alt="CogVeri" className="h-8 w-auto" />
              <span className="font-semibold text-gray-900">CogVeri</span>
            </div>
            <span className="text-sm text-gray-500">Recording Task</span>
          </div>
        </header>

        <div className="flex-1 py-8 px-4">
          <div className="max-w-5xl mx-auto">
            {/* Task Header */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{task.title}</h1>
                {task.description && (
                  <RichTextContent
                    content={task.description}
                    className="text-gray-600"
                  />
                )}
              </div>
              {isSubmitted && (
                <span className="px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center gap-2 ml-4 whitespace-nowrap">
                  <CheckCircle className="h-4 w-4" />
                  Submitted
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2 text-gray-600">
                <User className="h-5 w-5" />
                <span className="text-sm">Requested by: {task.creator_name}</span>
              </div>
              {task.due_date && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-5 w-5" />
                  <span className="text-sm">Due: {formatDate(task.due_date)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-5 w-5" />
                <span className="text-sm">Status: {task.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>

          {/* Task Checklist - Display After Recording */}
          {recordedBlob && !isSubmitted && checklistItems.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ListChecks className="h-6 w-6 text-purple-600" />
                Task Requirements
              </h2>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-purple-900">
                  Please review and verify you have completed all of the following items in your recording. You must check all boxes to submit.
                </p>
              </div>

              <div className="space-y-3">
                {checklistItems.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      item.completed
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleChecklistItem(item.id)}
                      className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500 mt-0.5 flex-shrink-0"
                    />
                    <span className={`text-sm ${item.completed ? 'text-green-900 line-through' : 'text-gray-700'}`}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>

              {allChecklistItemsCompleted ? (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-900 font-medium">All requirements verified! You're ready to submit.</span>
                </div>
              ) : (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <span className="text-sm text-yellow-900">
                    Verify {checklistItems.filter(item => !item.completed).length} remaining item{checklistItems.filter(item => !item.completed).length !== 1 ? 's' : ''} before submitting.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Recording Section */}
          {!isSubmitted && chunkedRecording.state !== 'completed' && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Video className="h-6 w-6 text-purple-600" />
                Record Your Screen
              </h2>

              {/* Idle state - show options and start button */}
              {chunkedRecording.state === 'idle' && !recordedBlob && (
                <div className="space-y-4">
                  {/* Real-time Upload Info */}
                  {chunkedRecording.isChunkedUploadAvailable && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-green-900">Real-Time Upload</h4>
                          <p className="text-sm text-green-700 mt-1">
                            Your recording uploads as you record. No waiting at the end, and your progress is saved automatically!
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      Click "Start Recording" to configure your camera, microphone, and screen capture options.
                    </p>
                  </div>

                  <button
                    onClick={openSetupModal}
                    disabled={!chunkedRecording.isChunkedUploadAvailable}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Recording
                  </button>
                </div>
              )}

              {/* Recording in Progress */}
              {(chunkedRecording.state === 'recording' || chunkedRecording.state === 'paused' || chunkedRecording.state === 'initializing') && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-6 text-white">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <div className={`w-4 h-4 rounded-full ${chunkedRecording.state === 'paused' ? 'bg-yellow-400' : 'bg-red-400 animate-pulse'}`}></div>
                      <span className="text-xl font-bold">
                        {chunkedRecording.state === 'initializing' ? 'Starting...' : chunkedRecording.state === 'paused' ? 'Paused' : 'Recording'}
                      </span>
                    </div>
                    <p className="text-4xl font-mono text-center mb-3">{formatDuration(chunkedRecording.progress.durationSeconds)}</p>

                    {/* Upload Progress */}
                    {chunkedRecording.progress.partsUploaded > 0 && (
                      <div className="flex items-center justify-center gap-2 text-green-200">
                        <Shield className="h-4 w-4" />
                        <span className="text-sm">
                          {chunkedRecording.progress.safeMinutes > 0
                            ? `${chunkedRecording.progress.safeMinutes} min safely uploaded`
                            : 'Uploading...'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={chunkedRecording.state === 'paused' ? handleResumeChunkedRecording : handlePauseChunkedRecording}
                      disabled={chunkedRecording.state === 'initializing'}
                      className={`flex-1 py-3 font-medium rounded-lg transition ${
                        chunkedRecording.state === 'paused'
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      } disabled:opacity-50`}
                    >
                      {chunkedRecording.state === 'paused' ? '▶ Resume' : '⏸ Pause'}
                    </button>
                    <button
                      onClick={handleStopChunkedRecording}
                      disabled={chunkedRecording.state === 'initializing'}
                      className="flex-1 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      ⏹ Stop Recording
                    </button>
                  </div>

                  {chunkedRecording.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                      <span className="text-sm text-red-900">{chunkedRecording.error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Chunked Recording Preview State */}
              {chunkedRecording.state === 'preview' && (
                <div className="space-y-4">
                  {/* Preview Header */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                      <Play className="h-5 w-5" />
                      Review Your Recording
                    </h3>
                    <p className="text-sm text-blue-700">
                      Watch your recording below. If you're happy with it, click Submit. Otherwise, click Redo to record again.
                    </p>
                  </div>

                  {/* Video Preview Player */}
                  <div className="bg-black rounded-lg overflow-hidden">
                    <video
                      className="w-full h-auto max-h-[50vh]"
                      controls
                      src={chunkedRecording.getPreviewUrl() || undefined}
                      preload="metadata"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  {/* Recording Info */}
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">Duration: {formatDuration(chunkedRecording.progress.durationSeconds)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-green-600">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm">
                        {chunkedRecording.progress.safeMinutes > 0
                          ? `${chunkedRecording.progress.safeMinutes} min uploaded`
                          : 'Upload complete'}
                      </span>
                    </div>
                  </div>

                  {/* Checklist - must complete before submit */}
                  {checklistItems.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-purple-600" />
                        Verify Checklist Items
                      </h4>
                      <div className="space-y-2">
                        {checklistItems.map((item) => (
                          <label
                            key={item.id}
                            className={`flex items-start gap-3 p-2 rounded-lg border transition-all cursor-pointer ${
                              item.completed
                                ? 'bg-green-50 border-green-300'
                                : 'bg-white border-gray-200 hover:border-purple-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleChecklistItem(item.id)}
                              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 mt-0.5 flex-shrink-0"
                            />
                            <span className={`text-sm ${item.completed ? 'text-green-900 line-through' : 'text-gray-700'}`}>
                              {item.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleRedoChunkedRecording}
                      className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="h-5 w-5" />
                      Redo Recording
                    </button>
                    <button
                      onClick={handleSubmitChunkedRecording}
                      disabled={!allChecklistItemsCompleted}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="h-5 w-5" />
                      Submit Recording
                    </button>
                  </div>

                  {!allChecklistItemsCompleted && checklistItems.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                      <span className="text-xs text-yellow-900">
                        Complete all checklist items above before submitting.
                      </span>
                    </div>
                  )}

                  {chunkedRecording.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                      <span className="text-sm text-red-900">{chunkedRecording.error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Chunked Recording Completing State */}
              {chunkedRecording.state === 'completing' && (
                <div className="space-y-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 text-center">
                    <Loader className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
                    <p className="text-purple-900 font-medium">Submitting your recording...</p>
                    <p className="text-sm text-purple-700 mt-1">Please wait while we finalize your upload.</p>
                  </div>
                </div>
              )}

              {/* ★ Error State UI - Displayed when recording encounters a critical error */}
              {chunkedRecording.state === 'error' && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <AlertCircle className="h-8 w-8 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-red-900 mb-2">Recording Error</h3>
                        <p className="text-sm text-red-700 mb-4">
                          {chunkedRecording.error || 'An unexpected error occurred during recording. Please try again.'}
                        </p>
                        <div className="space-y-2 text-sm text-red-600">
                          <p className="font-medium">Troubleshooting tips:</p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>Check that your browser has permission to record your screen</li>
                            <li>Ensure you have a stable internet connection</li>
                            <li>Try refreshing the page and starting again</li>
                            <li>If the problem persists, try using Chrome or Edge browser</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => window.location.reload()}
                      className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition"
                    >
                      🔄 Refresh Page
                    </button>
                    <button
                      onClick={handleRedoChunkedRecording}
                      className="flex-1 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition"
                    >
                      🎬 Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Legacy standard mode recording complete - for backwards compatibility */}
              {recordedBlob && !isSubmitted && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-900">
                      Recording complete! Duration: {formatDuration(recordingDuration)}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setRecordedBlob(null);
                        setRecordingDuration(0);
                      }}
                      className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                    >
                      Re-record
                    </button>
                    <button
                      onClick={handleUploadRecording}
                      disabled={!recordedBlob || recordedBlob.size === 0 || recordingDuration === 0 || !allChecklistItemsCompleted}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!allChecklistItemsCompleted ? 'Verify all checklist items before submitting' : ''}
                    >
                      Submit Recording
                    </button>
                  </div>
                  {!allChecklistItemsCompleted && (
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                      <span className="text-xs text-yellow-900">
                        You must complete all checklist items before submitting.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submitted State */}
          {isSubmitted && (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h3>
              <p className="text-gray-600 mb-6">
                Your recording has been submitted successfully and is now being reviewed by {task.creator_name}.
              </p>
              <p className="text-sm text-gray-500">
                You can close this page. If any changes are needed, you'll receive an email notification.
              </p>
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <footer className="py-4 text-center text-sm text-gray-500 border-t border-gray-200 bg-white">
          Powered by <span className="font-semibold text-purple-600">CogVeri</span>
        </footer>

        {/* Countdown Overlay */}
        {countdown !== null && countdown > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-center">
              <img src="/cogveri-icon.png" alt="CogVeri" className="h-16 w-auto mx-auto mb-6 opacity-80" />
              <div className="text-9xl font-bold text-white mb-4 animate-pulse">
                {countdown}
              </div>
              <p className="text-2xl text-white">Recording starts in...</p>
            </div>
          </div>
        )}

        {/* Picture-in-Picture Controls */}
        {isActivelyRecording && !recordedBlob && chunkedRecording.state !== 'completed' && (
          <RecordingPiPControls
            isRecording={isActivelyRecording}
            isPaused={isRecordingPaused}
            duration={chunkedRecording.progress.durationSeconds}
            onPause={handlePauseChunkedRecording}
            onResume={handleResumeChunkedRecording}
            onStop={handleStopChunkedRecording}
            autoOpen={true}
            safeMinutes={chunkedRecording.progress.safeMinutes}
            mediaStream={chunkedRecording.mediaStream}
            onPiPStateChange={setIsPiPActive}
          />
        )}

        {/* Floating Webcam Bubble - displayed on screen and captured by screen recording */}
        {(chunkedRecording.state === 'recording' || chunkedRecording.state === 'paused') &&
          chunkedRecording.webcamStream && (
            <FloatingWebcamBubble
              stream={chunkedRecording.webcamStream}
              size={chunkedRecording.webcamConfig?.size}
              shape={chunkedRecording.webcamConfig?.shape}
              position={chunkedRecording.webcamConfig?.position}
              visible={true}
            />
          )}

        <RecordingSetupModal
          isOpen={showSetupModal}
          onClose={() => setShowSetupModal(false)}
          onStartRecording={handleStartFromSetup}
          taskTitle={taskData?.task?.title}
        />
      </div>
    );
  }

  return null;
};

export default PublicTaskPage;
