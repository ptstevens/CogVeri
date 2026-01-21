import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Square,
  Circle,
  Pause,
  Play,
  Download,
  Upload,
  Monitor,
  AlertCircle,
  CheckCircle,
  Clock,
  Shield,
  CloudUpload,
} from 'lucide-react';
import { recordingService } from '../../services/recording.service';
import { taskService } from '../../services/task.service';
import { useAuth } from '../../contexts/AuthContext';
import { RecordingPiPControls } from '../../components/RecordingPiPControls';
import { useRecordingKeyboardShortcuts } from '../../hooks/useRecordingKeyboardShortcuts';
import { useChunkedRecording } from '../../hooks/useChunkedRecording';
import { RecordingSetupModal, RecordingSetupConfig } from '../../components/RecordingSetup';
import { FloatingWebcamBubble } from '../../components/WebcamBubble';
import toast from 'react-hot-toast';

const RecordingSession: React.FC = () => {
  const { id: taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'stopped' | 'submitted'>('idle');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [_showSettings, _setShowSettings] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Always use chunked recording mode (better for all recordings)
  const chunkedRecording = useChunkedRecording();

  // Fetch task details if taskId is provided
  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => taskId ? taskService.getTaskById(taskId) : null,
    enabled: !!taskId,
  });

  // Check browser support
  const isSupported = recordingService.isScreenRecordingSupported();
  // supportedTypes available via recordingService.getSupportedMimeTypes() if needed

  // Recording state (always using chunked mode)
  const isActivelyRecording = chunkedRecording.state === 'recording' || chunkedRecording.state === 'paused';
  const isRecordingPaused = chunkedRecording.state === 'paused';

  // Handle chunked recording stop - transitions to preview state
  const handleChunkedStop = useCallback(async () => {
    try {
      await chunkedRecording.stopRecording();
      // After stopRecording, state transitions to 'preview'
      // User can then review and submit via submitRecording()
    } catch (error) {
      toast.error('Failed to stop recording');
    }
  }, [chunkedRecording]);

  // Enable global keyboard shortcuts for recording controls
  useRecordingKeyboardShortcuts({
    isRecording: isActivelyRecording,
    isPaused: isRecordingPaused,
    onPause: chunkedRecording.pauseRecording,
    onResume: chunkedRecording.resumeRecording,
    onStop: handleChunkedStop,
    enabled: true,
  });

  // Open setup modal to configure recording
  const openSetupModal = useCallback(() => {
    if (!taskId) {
      toast.error('No task ID provided');
      return;
    }
    setShowSetupModal(true);
  }, [taskId]);

  // Handle recording start from setup modal
  const handleStartFromSetup = useCallback(async (
    config: RecordingSetupConfig,
    webcamStream: MediaStream | null
  ) => {
    if (!taskId) return;

    // Store webcam stream ref for cleanup
    webcamStreamRef.current = webcamStream;
    setShowSetupModal(false);
    setCountdown(3);

    // Start countdown
    let count = 3;
    countdownRef.current = setInterval(async () => {
      count--;
      setCountdown(count);

      if (count === 0) {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        setCountdown(0);

        try {
          await chunkedRecording.startRecording({
            taskId,
            hasAudio: config.hasAudio,
            hasWebcam: config.hasWebcam,
            webcamStream: webcamStream ?? undefined,
            webcamConfig: config.hasWebcam ? config.webcamConfig : undefined,
          });
          toast.success('Recording started');
        } catch (error: any) {
          // Clean up webcam stream on error
          if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStreamRef.current = null;
          }
          if (error.name === 'NotAllowedError') {
            toast.error('Screen recording permission denied');
          } else {
            toast.error('Failed to start recording');
          }
        }
      }
    }, 1000);
  }, [taskId, chunkedRecording]);

  // Update recording duration every second
  useEffect(() => {
    if (recordingState === 'recording') {
      intervalRef.current = setInterval(() => {
        setRecordingDuration(recordingService.getRecordingDuration());
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [recordingState]);

  // Legacy recording handlers removed - replaced by chunked recording approach
  // See uploadRecording() and other active handlers below

  // Legacy: Upload recording (kept for backward compatibility)
  const uploadRecording = useCallback(async () => {
    if (!recordedBlob || !taskId) {
      toast.error('No recording to upload');
      return;
    }

    setIsUploading(true);
    try {
      const recording = await recordingService.uploadRecording(
        recordedBlob,
        taskId,
        {
          duration_seconds: recordingDuration,
          has_audio: true, // Default to true for legacy path
        }
      );

      // Update task status to submitted
      await taskService.submitTask(taskId, recording.id);

      toast.success('Recording uploaded successfully');

      // If user is authenticated, navigate to tasks, otherwise show success screen
      if (user) {
        navigate('/tasks');
      } else {
        setRecordingState('submitted');
      }
    } catch (error) {
      toast.error('Failed to upload recording');
    } finally {
      setIsUploading(false);
    }
  }, [recordedBlob, taskId, recordingDuration, user, navigate]);

  // Download recording
  const downloadRecording = useCallback(() => {
    if (!recordedBlob) return;

    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${taskId || 'session'}-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordedBlob, taskId]);

  // Discard recording
  const discardRecording = useCallback(() => {
    if (videoPreviewRef.current && videoPreviewRef.current.src) {
      URL.revokeObjectURL(videoPreviewRef.current.src);
      videoPreviewRef.current.src = '';
    }
    setRecordedBlob(null);
    setRecordingState('idle');
    setRecordingDuration(0);
  }, []);

  // Format time display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) {
      parts.push(hours.toString().padStart(2, '0'));
    }
    parts.push(minutes.toString().padStart(2, '0'));
    parts.push(secs.toString().padStart(2, '0'));

    return parts.join(':');
  };

  if (!isSupported) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Screen Recording Not Supported</h2>
        <p className="text-gray-600 text-center max-w-md">
          Your browser does not support screen recording. Please use a modern browser like
          Chrome, Edge, or Firefox to use this feature.
        </p>
      </div>
    );
  }

  // Show success screen for external contributors
  if (recordingState === 'submitted') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="max-w-2xl w-full bg-white rounded-lg border border-gray-200 shadow-lg p-8">
          <div className="flex flex-col items-center text-center">
            <div className="bg-green-100 rounded-full p-4 mb-6">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Recording Submitted Successfully! 🎉
            </h1>

            <p className="text-lg text-gray-600 mb-8">
              Thank you for completing this task. Your recording has been uploaded and will be reviewed shortly.
            </p>

            <div className="w-full bg-blue-50 rounded-lg p-6 mb-8">
              <h3 className="font-semibold text-blue-900 mb-3">What happens next?</h3>
              <ul className="text-left text-sm text-blue-800 space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                  <span>The task owner will review your recording</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                  <span>You'll receive an email with feedback or approval</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                  <span>If changes are needed, you'll get a new link to resubmit</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 w-full">
              <p className="text-sm text-gray-600">
                <strong>You can now safely close this browser tab.</strong>
              </p>
              <p className="text-sm text-gray-500 mt-2">
                If you have any questions, please contact the person who sent you the task link.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {task ? `Recording for: ${task.title}` : 'Screen Recording Session'}
        </h1>
        {task && (
          <p className="text-gray-600">{task.description}</p>
        )}
      </div>

      {/* Video Preview/Recording Area */}
      <div className="bg-black rounded-lg overflow-hidden mb-6" style={{ minHeight: '400px' }}>
        {recordingState === 'idle' && !recordedBlob && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <Monitor className="h-24 w-24 mb-4 text-gray-400" />
            <p className="text-xl mb-2">Ready to Record</p>
            <p className="text-gray-400">Click the record button to start capturing your screen</p>
          </div>
        )}

        {countdown > 0 && (
          <div className="flex items-center justify-center h-96 text-white">
            <div className="text-6xl font-bold animate-pulse">{countdown}</div>
          </div>
        )}

        {/* Recording display - when PiP is active, show minimal message */}
        {isActivelyRecording && isPiPActive && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-3 h-3 rounded-full bg-red-500 animate-pulse"
                style={{ boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)' }}
              />
              <span className="text-xl font-semibold">Recording in progress...</span>
            </div>
            <p className="text-gray-400 text-center max-w-md mb-6">
              Use the floating controls to manage your recording, or use keyboard shortcuts:
            </p>
            <div className="flex gap-6 text-sm text-gray-300 mb-6">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">⌘⇧P</kbd>
                <span>Pause/Resume</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">⌘⇧S</kbd>
                <span>Stop Recording</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Keep this tab open until done</span>
            </div>
          </div>
        )}

        {/* Recording display - full controls when PiP is not active */}
        {chunkedRecording.state === 'recording' && !isPiPActive && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Circle className="h-6 w-6 text-red-500 animate-pulse fill-red-500" />
              <span className="text-2xl font-semibold">Recording in Progress</span>
            </div>
            <div className="text-4xl font-mono">{formatTime(chunkedRecording.progress.durationSeconds)}</div>

            {/* Upload progress indicator */}
            <div className="mt-6 bg-gray-800 rounded-lg p-4 max-w-md w-full">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <Shield className="h-5 w-5" />
                <span className="font-medium">
                  {chunkedRecording.progress.safeMinutes > 0
                    ? `${chunkedRecording.progress.safeMinutes} min safely uploaded`
                    : 'Starting upload...'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>{chunkedRecording.progress.partsUploaded} chunks uploaded</span>
                <span>
                  {chunkedRecording.progress.isUploading && (
                    <span className="flex items-center gap-1">
                      <CloudUpload className="h-4 w-4 animate-pulse" />
                      Uploading...
                    </span>
                  )}
                </span>
              </div>
            </div>

            <p className="text-gray-400 mt-4">Your recording is being uploaded as you go</p>
          </div>
        )}

        {chunkedRecording.state === 'paused' && !isPiPActive && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Pause className="h-6 w-6 text-yellow-500" />
              <span className="text-2xl font-semibold">Recording Paused</span>
            </div>
            <div className="text-4xl font-mono">{formatTime(chunkedRecording.progress.durationSeconds)}</div>

            {/* Upload progress indicator */}
            <div className="mt-6 bg-gray-800 rounded-lg p-4 max-w-md w-full">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <Shield className="h-5 w-5" />
                <span className="font-medium">
                  {chunkedRecording.progress.safeMinutes} min safely uploaded
                </span>
              </div>
            </div>

            <p className="text-gray-400 mt-4">Click resume to continue recording</p>
          </div>
        )}

        {(chunkedRecording.state === 'stopping' || chunkedRecording.state === 'completing') && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mb-4" />
            <span className="text-2xl font-semibold">
              {chunkedRecording.state === 'stopping' ? 'Stopping...' : 'Completing upload...'}
            </span>
            <p className="text-gray-400 mt-4">Please wait while we finalize your recording</p>
          </div>
        )}

        {recordingState === 'stopped' && recordedBlob && (
          <video
            ref={videoPreviewRef}
            className="w-full h-full"
            controls
            autoPlay
          />
        )}
      </div>

      {/* Controls - hide when PiP is active during recording */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Start Recording */}
            {chunkedRecording.state === 'idle' && !recordedBlob && (
              <button
                onClick={openSetupModal}
                disabled={!chunkedRecording.isChunkedUploadAvailable}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Circle className="h-5 w-5" />
                Start Recording
              </button>
            )}

            {/* Recording Controls - only show when PiP is NOT active */}
            {chunkedRecording.state === 'recording' && !isPiPActive && (
              <>
                <button
                  onClick={chunkedRecording.pauseRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  <Pause className="h-5 w-5" />
                  Pause
                </button>
                <button
                  onClick={handleChunkedStop}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Square className="h-5 w-5" />
                  Stop & Upload
                </button>
              </>
            )}

            {chunkedRecording.state === 'paused' && !isPiPActive && (
              <>
                <button
                  onClick={chunkedRecording.resumeRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Play className="h-5 w-5" />
                  Resume
                </button>
                <button
                  onClick={handleChunkedStop}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Square className="h-5 w-5" />
                  Stop & Upload
                </button>
              </>
            )}

            {(chunkedRecording.state === 'stopping' || chunkedRecording.state === 'completing') && (
              <button
                disabled
                className="flex items-center gap-2 px-6 py-3 bg-gray-400 text-white rounded-lg cursor-not-allowed"
              >
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                Uploading...
              </button>
            )}

            {recordingState === 'stopped' && recordedBlob && (
              <>
                <button
                  onClick={uploadRecording}
                  disabled={isUploading || !taskId}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      Upload Recording
                    </>
                  )}
                </button>
                <button
                  onClick={downloadRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Download className="h-5 w-5" />
                  Download
                </button>
                <button
                  onClick={discardRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Discard & Retry
                </button>
              </>
            )}
          </div>

          {/* Duration display */}
          <div className="flex items-center gap-4">
            {chunkedRecording.progress.durationSeconds > 0 && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-5 w-5" />
                <span className="font-mono text-lg">{formatTime(chunkedRecording.progress.durationSeconds)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Recording Info */}
        {recordedBlob && (
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div>
                <span className="font-medium">Duration:</span> {formatTime(recordingDuration)}
              </div>
              <div>
                <span className="font-medium">Size:</span>{' '}
                {recordingService.formatFileSize(recordedBlob.size)}
              </div>
              <div>
                <span className="font-medium">Format:</span> {recordedBlob.type}
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {chunkedRecording.state === 'idle' && !recordedBlob && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Recording Instructions:</h3>
            <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
              <li>Click "Start Recording" to begin capturing your screen</li>
              <li>Select the screen or window you want to record</li>
              <li>You can pause and resume recording as needed</li>
              <li>Click "Stop" when you're finished</li>
              <li>Your recording is uploaded as you go - no waiting at the end!</li>
            </ul>

            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-green-900">Real-Time Upload</h4>
                  <p className="text-sm text-green-700 mt-1">
                    Your recording is uploaded in real-time as you record:
                  </p>
                  <ul className="text-sm text-green-700 mt-2 space-y-1">
                    <li>• Safe for long recordings (low memory usage)</li>
                    <li>• Progress saved every ~30 seconds</li>
                    <li>• Instant completion when you stop</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Picture-in-Picture Controls */}
      {(chunkedRecording.state === 'recording' || chunkedRecording.state === 'paused') && (
        <RecordingPiPControls
          isRecording={chunkedRecording.state === 'recording' || chunkedRecording.state === 'paused'}
          isPaused={chunkedRecording.state === 'paused'}
          duration={chunkedRecording.progress.durationSeconds}
          onPause={chunkedRecording.pauseRecording}
          onResume={chunkedRecording.resumeRecording}
          onStop={handleChunkedStop}
          safeMinutes={chunkedRecording.progress.safeMinutes}
          mediaStream={chunkedRecording.mediaStream}
          onPiPStateChange={setIsPiPActive}
          autoOpen
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

      {/* Recording Setup Modal */}
      <RecordingSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onStartRecording={handleStartFromSetup}
        taskTitle={task?.title}
      />
    </div>
  );
};

export default RecordingSession;