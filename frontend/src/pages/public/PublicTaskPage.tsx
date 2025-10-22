import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { magicLinkService, ClaimTaskDto } from '../../services/magicLink.service';
import { recordingService } from '../../services/recording.service';
import { RecordingPiPControls } from '../../components/RecordingPiPControls';
import { useRecordingKeyboardShortcuts } from '../../hooks/useRecordingKeyboardShortcuts';
import toast from 'react-hot-toast';

type PageState = 'loading' | 'landing' | 'claim' | 'task' | 'error';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

const PublicTaskPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [taskData, setTaskData] = useState<any>(null);
  const [claimData, setClaimData] = useState<ClaimTaskDto>({
    firstName: '',
    lastName: '',
    email: '',
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [includeAudio, setIncludeAudio] = useState(true);

  // Use refs for interval IDs to ensure synchronous access and proper cleanup
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null); // Countdown before recording starts

  // Fetch task data on mount
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-task', token],
    queryFn: async () => {
      if (!token) throw new Error('No token provided');
      return await magicLinkService.getTaskByToken(token);
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

  // DEBUG: Log component mount/unmount
  useEffect(() => {
    console.log('🔵 PublicTaskPage component MOUNTED');
    return () => {
      console.log('🔴 PublicTaskPage component UNMOUNTED');
    };
  }, []);

  // DEBUG: Log whenever recordingDuration changes
  useEffect(() => {
    console.log('📊 recordingDuration changed to:', recordingDuration);
    if (recordingDuration === 0 && recordedBlob) {
      console.error('🚨 BUG: Duration reset to 0 even though we have a recorded blob!');
      console.trace('Stack trace for duration reset:');
    }
  }, [recordingDuration, recordedBlob]);

  // Claim task mutation
  const claimMutation = useMutation({
    mutationFn: async (data: ClaimTaskDto) => {
      if (!token) throw new Error('No token');
      return await magicLinkService.claimTask(token, data);
    },
    onSuccess: (result) => {
      setTaskData(result);
      setPageState('task');
      toast.success('Task claimed successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to claim task');
    },
  });

  // Start recording with 5-second countdown
  const handleStartRecording = async () => {
    console.log('🎬 === START RECORDING CALLED ===');
    console.trace('Stack trace for START RECORDING:');

    // Guard: Don't start if already recording or have recorded content
    if (isRecording || recordedBlob) {
      console.log('❌ Ignoring start recording - already recording or have recorded content');
      return;
    }

    try {
      const supportedTypes = recordingService.getSupportedMimeTypes();

      // Start media capture (screen picker will appear)
      await recordingService.startRecording({
        video: true,
        audio: includeAudio,
        mimeType: supportedTypes[0],
        videoBitsPerSecond: 2500000,
      });

      // Show 5-second countdown and set recording to true immediately
      // This allows PiP to open while user gesture is still fresh
      toast.success('Screen selected! Starting in 5 seconds...');
      setCountdown(5);
      setIsRecording(true); // Set immediately to trigger PiP auto-open
      setRecordingDuration(0);

      // Countdown from 5 to 1
      let count = 5;
      const interval = setInterval(() => {
        count--;
        setCountdown(count);
        if (count === 0) {
          clearInterval(interval);
          countdownIntervalRef.current = null;
          setCountdown(null);

          // Reset the recording start time NOW (after countdown completes)
          // This ensures the countdown time is not included in the recording duration
          recordingService.resetStartTime();

          toast.success('🎬 Recording started!');

          // Update duration every second
          const durationTimer = setInterval(() => {
            const duration = recordingService.getRecordingDuration();
            console.log('⏱️ Interval firing - setting duration to:', duration);
            setRecordingDuration(duration);
          }, 1000);

          durationIntervalRef.current = durationTimer;
        }
      }, 1000);

      // Store the countdown interval so it can be cleared if stopped early
      countdownIntervalRef.current = interval;
    } catch (error: any) {
      setCountdown(null);
      setIsRecording(false);
      if (error.name === 'NotAllowedError') {
        toast.error('Screen recording permission denied');
      } else {
        toast.error('Failed to start recording');
      }
    }
  };

  // Pause recording
  const handlePauseRecording = () => {
    recordingService.pauseRecording();
    setIsPaused(true);
    toast.success('Recording paused');
  };

  // Resume recording
  const handleResumeRecording = () => {
    recordingService.resumeRecording();
    setIsPaused(false);
    toast.success('Recording resumed');
  };

  // Stop recording
  const handleStopRecording = async () => {
    try {
      console.log('=== STOP RECORDING CALLED ===');

      // Get final duration FIRST before stopping anything
      const finalDuration = recordingService.getRecordingDuration();
      console.log('Final duration from recording service:', finalDuration);

      // CRITICAL: Clear duration interval FIRST - using ref ensures synchronous access
      if (durationIntervalRef.current) {
        console.log('Clearing duration interval:', durationIntervalRef.current);
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Clear countdown interval too
      if (countdownIntervalRef.current) {
        console.log('Clearing countdown interval:', countdownIntervalRef.current);
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      // Set isRecording to false to prevent PiP auto-open from triggering
      setIsRecording(false);
      setIsPaused(false);

      // Clear countdown display
      setCountdown(null);

      // Stop the recording and get the blob
      console.log('Stopping recording service...');
      const blob = await recordingService.stopRecording();
      console.log('Recording service stopped, blob size:', blob.size);

      // Set the final states
      console.log('Setting recordedBlob and recordingDuration:', finalDuration);
      setRecordedBlob(blob);
      setRecordingDuration(finalDuration);

      console.log('=== STOP RECORDING COMPLETE ===');
      toast.success(`Recording stopped (${Math.round(finalDuration)}s)`);
    } catch (error) {
      console.error('Error in handleStopRecording:', error);
      toast.error('Failed to stop recording');
    }
  };

  // Enable global keyboard shortcuts for recording controls
  useRecordingKeyboardShortcuts({
    isRecording: isRecording && !recordedBlob,
    isPaused: isPaused,
    onPause: handlePauseRecording,
    onResume: handleResumeRecording,
    onStop: handleStopRecording,
    enabled: true,
  });

  // Upload recording
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
        has_audio: includeAudio,
        resolution: '1920x1080', // You can get actual resolution from video
      });

      toast.success('Recording uploaded successfully!', { id: uploadToast });

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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading task...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid or Expired Link</h1>
          <p className="text-gray-600 mb-6">
            This link may have expired or been revoked. Please contact the person who sent you this link.
          </p>
        </div>
      </div>
    );
  }

  // Landing State (Before Claim)
  if (pageState === 'landing' && taskData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-12 text-white">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <Video className="h-8 w-8" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-center mb-2">You've Been Invited!</h1>
            <p className="text-center text-purple-100">
              Complete a task for {taskData.task.creator_name}
            </p>
          </div>

          {/* Task Details */}
          <div className="px-8 py-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{taskData.task.title}</h2>
              {taskData.task.description && (
                <div className="prose prose-sm max-w-none text-gray-600">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {taskData.task.description}
                  </ReactMarkdown>
                </div>
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
    );
  }

  // Claim State (Name/Email Form)
  if (pageState === 'claim' && taskData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-8 w-8 text-purple-600" />
            </div>
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
    );
  }

  // Task State (After Claim - Recording Interface)
  if (pageState === 'task' && taskData) {
    const task = taskData.task;
    const isSubmitted = task.status === 'submitted' || task.status === 'completed';

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{task.title}</h1>
                {task.description && (
                  <div className="prose prose-sm max-w-none text-gray-600">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {task.description}
                    </ReactMarkdown>
                  </div>
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

          {/* Task Checklist */}
          {!isSubmitted && checklistItems.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ListChecks className="h-6 w-6 text-purple-600" />
                Task Requirements
              </h2>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-purple-900">
                  Please complete all checklist items before recording. You must check all boxes to submit your recording.
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
                  <span className="text-sm text-green-900 font-medium">All requirements completed! You may proceed with recording.</span>
                </div>
              ) : (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <span className="text-sm text-yellow-900">
                    Complete {checklistItems.filter(item => !item.completed).length} remaining item{checklistItems.filter(item => !item.completed).length !== 1 ? 's' : ''} before recording.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Recording Section */}
          {!isSubmitted && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Video className="h-6 w-6 text-purple-600" />
                Record Your Screen
              </h2>

              {!isRecording && !recordedBlob && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      Click "Start Recording" to begin capturing your screen. You'll be prompted to select
                      which screen or window to share.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="include-audio"
                      checked={includeAudio}
                      onChange={(e) => setIncludeAudio(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="include-audio" className="text-sm text-gray-700">
                      Include microphone audio
                    </label>
                  </div>

                  <button
                    onClick={handleStartRecording}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition"
                  >
                    Start Recording
                  </button>
                </div>
              )}

              {isRecording && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-2xl font-bold text-red-700">Recording...</span>
                    </div>
                    <p className="text-3xl font-mono text-gray-900">{formatDuration(recordingDuration)}</p>
                  </div>

                  <button
                    onClick={handleStopRecording}
                    className="w-full py-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
                  >
                    Stop Recording
                  </button>
                </div>
              )}

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
                      title={!allChecklistItemsCompleted ? 'Complete all checklist items first' : ''}
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

        {/* Countdown Overlay */}
        {countdown !== null && countdown > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-center">
              <div className="text-9xl font-bold text-white mb-4 animate-pulse">
                {countdown}
              </div>
              <p className="text-2xl text-white">Recording starts in...</p>
            </div>
          </div>
        )}

        {/* Picture-in-Picture Controls - Always-on-top global controls */}
        {isRecording && !recordedBlob && (
          <RecordingPiPControls
            isRecording={isRecording}
            isPaused={isPaused}
            duration={recordingDuration}
            onPause={handlePauseRecording}
            onResume={handleResumeRecording}
            onStop={handleStopRecording}
            autoOpen={true}
          />
        )}
      </div>
    );
  }

  return null;
};

export default PublicTaskPage;
