import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
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
  Settings,
} from 'lucide-react';
import { recordingService, RecordingOptions } from '../../services/recording.service';
import { taskService } from '../../services/task.service';
import { useAuth } from '../../contexts/AuthContext';
import { RecordingPiPControls } from '../../components/RecordingPiPControls';
import { useRecordingKeyboardShortcuts } from '../../hooks/useRecordingKeyboardShortcuts';
import toast from 'react-hot-toast';

const RecordingSession: React.FC = () => {
  const { id: taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'stopped' | 'submitted'>('idle');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch task details if taskId is provided
  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => taskId ? taskService.getTaskById(taskId) : null,
    enabled: !!taskId,
  });

  // Check browser support
  const isSupported = recordingService.isScreenRecordingSupported();
  const supportedTypes = recordingService.getSupportedMimeTypes();

  // Enable global keyboard shortcuts for recording controls
  useRecordingKeyboardShortcuts({
    isRecording: recordingState === 'recording' || recordingState === 'paused',
    isPaused: recordingState === 'paused',
    onPause: pauseRecording,
    onResume: resumeRecording,
    onStop: stopRecording,
    enabled: true,
  });

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

  // Start recording with countdown
  const startRecordingWithCountdown = useCallback(async () => {
    setCountdown(3);
    setRecordingState('idle');

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

        // Start actual recording
        try {
          const options: RecordingOptions = {
            video: true,
            audio: includeAudio,
            mimeType: supportedTypes[0],
            videoBitsPerSecond: 2500000,
          };

          await recordingService.startRecording(options);
          setRecordingState('recording');
          setRecordingDuration(0);
          toast.success('Recording started');
        } catch (error: any) {
          console.error('Failed to start recording:', error);
          if (error.name === 'NotAllowedError') {
            toast.error('Screen recording permission denied');
          } else {
            toast.error('Failed to start recording');
          }
          setRecordingState('idle');
        }
      }
    }, 1000);
  }, [includeAudio, supportedTypes]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      const blob = await recordingService.stopRecording();
      setRecordedBlob(blob);
      setRecordingState('stopped');

      // Preview the recorded video
      if (videoPreviewRef.current && blob) {
        videoPreviewRef.current.src = URL.createObjectURL(blob);
      }

      toast.success('Recording stopped');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast.error('Failed to stop recording');
      setRecordingState('idle');
    }
  }, []);

  // Pause recording
  const pauseRecording = useCallback(() => {
    recordingService.pauseRecording();
    setRecordingState('paused');
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    recordingService.resumeRecording();
    setRecordingState('recording');
  }, []);

  // Upload recording
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
          has_audio: includeAudio,
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
      console.error('Failed to upload recording:', error);
      toast.error('Failed to upload recording');
    } finally {
      setIsUploading(false);
    }
  }, [recordedBlob, taskId, recordingDuration, includeAudio, navigate]);

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

        {recordingState === 'recording' && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Circle className="h-6 w-6 text-red-500 animate-pulse fill-red-500" />
              <span className="text-2xl font-semibold">Recording in Progress</span>
            </div>
            <div className="text-4xl font-mono">{formatTime(recordingDuration)}</div>
            <p className="text-gray-400 mt-4">Your screen is being recorded</p>
          </div>
        )}

        {recordingState === 'paused' && (
          <div className="flex flex-col items-center justify-center h-96 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Pause className="h-6 w-6 text-yellow-500" />
              <span className="text-2xl font-semibold">Recording Paused</span>
            </div>
            <div className="text-4xl font-mono">{formatTime(recordingDuration)}</div>
            <p className="text-gray-400 mt-4">Click resume to continue recording</p>
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

      {/* Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Recording Controls */}
            {recordingState === 'idle' && !recordedBlob && (
              <button
                onClick={startRecordingWithCountdown}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Circle className="h-5 w-5" />
                Start Recording
              </button>
            )}

            {recordingState === 'recording' && (
              <>
                <button
                  onClick={pauseRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  <Pause className="h-5 w-5" />
                  Pause
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Square className="h-5 w-5" />
                  Stop
                </button>
              </>
            )}

            {recordingState === 'paused' && (
              <>
                <button
                  onClick={resumeRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Play className="h-5 w-5" />
                  Resume
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Square className="h-5 w-5" />
                  Stop
                </button>
              </>
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

          {/* Settings */}
          <div className="flex items-center gap-4">
            {recordingState === 'idle' && !recordedBlob && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={(e) => setIncludeAudio(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                {includeAudio ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                <span className="text-sm text-gray-700">Include Microphone</span>
              </label>
            )}

            {recordingDuration > 0 && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-5 w-5" />
                <span className="font-mono text-lg">{formatTime(recordingDuration)}</span>
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
        {recordingState === 'idle' && !recordedBlob && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Recording Instructions:</h3>
            <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
              <li>Click "Start Recording" to begin capturing your screen</li>
              <li>Select the screen or window you want to record</li>
              <li>You can pause and resume recording as needed</li>
              <li>Click "Stop" when you're finished</li>
              <li>Review your recording before uploading</li>
            </ul>
          </div>
        )}
      </div>

      {/* Picture-in-Picture Controls - Always-on-top global controls */}
      {(recordingState === 'recording' || recordingState === 'paused') && (
        <RecordingPiPControls
          isRecording={recordingState === 'recording' || recordingState === 'paused'}
          isPaused={recordingState === 'paused'}
          duration={recordingDuration}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
        />
      )}
    </div>
  );
};

export default RecordingSession;