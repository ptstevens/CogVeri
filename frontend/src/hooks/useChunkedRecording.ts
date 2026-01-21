import { useState, useCallback, useRef, useEffect } from 'react';
import { multipartUploadService, ChunkUploadProgress } from '../services/multipartUpload.service';
import { WebcamCompositor, BubbleConfig } from '../services/webcamCompositor.service';

export type ChunkedRecordingState =
  | 'idle'
  | 'initializing'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'preview'      // Recording stopped, awaiting user decision (submit or redo)
  | 'completing'
  | 'completed'
  | 'error';

export interface ChunkedRecordingOptions {
  taskId: string;
  hasAudio?: boolean;
  audioDeviceId?: string;  // Specific audio input device ID
  resolution?: string;
  frameRate?: number;
  // For public/magic link uploads
  token?: string;
  organizationId?: string;
  // Webcam overlay options
  hasWebcam?: boolean;
  webcamStream?: MediaStream;  // Pre-acquired webcam stream
  webcamConfig?: Partial<BubbleConfig>;  // Bubble position, size, shape
}

export interface ChunkedRecordingProgress {
  durationSeconds: number;
  safeMinutes: number;
  partsUploaded: number;
  totalBytesUploaded: number;
  isUploading: boolean;
}

export interface UseChunkedRecordingReturn {
  state: ChunkedRecordingState;
  progress: ChunkedRecordingProgress;
  error: string | null;
  mediaStream: MediaStream | null;  // Expose stream for audio waveform visualization
  // Webcam state for floating preview
  webcamStream: MediaStream | null;
  webcamConfig: BubbleConfig | null;
  startRecording: (options: ChunkedRecordingOptions) => Promise<void>;
  stopRecording: () => Promise<void>;  // Stops recording and transitions to 'preview' state
  submitRecording: () => Promise<{ recording: any; fileUrl: string } | null>;  // Completes upload from preview state
  redoRecording: () => Promise<void>;  // Aborts upload and resets to idle
  getPreviewUrl: () => string | null;  // Returns blob URL for video preview
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => Promise<void>;
  isChunkedUploadAvailable: boolean;
  checkAvailability: () => Promise<void>;
  // Webcam controls (only work during recording with hasWebcam: true)
  updateWebcamBubble: (config: Partial<BubbleConfig>) => void;
  setWebcamBubblePosition: (x: number, y: number) => void;
  toggleWebcamVisible: () => boolean;
}

export interface UseChunkedRecordingOptions {
  /** Use public/unauthenticated availability check (for magic link pages) */
  isPublic?: boolean;
}

/**
 * Hook for managing chunked video recording with real-time upload
 *
 * This hook combines MediaRecorder with multipart upload to provide:
 * - Low memory footprint (chunks uploaded and freed every ~5MB)
 * - Real-time progress ("X minutes safely uploaded")
 * - Resume capability on failure
 * - Works for both authenticated users and external contributors
 */
export function useChunkedRecording(hookOptions: UseChunkedRecordingOptions = {}): UseChunkedRecordingReturn {
  // State
  const [state, setState] = useState<ChunkedRecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ChunkedRecordingProgress>({
    durationSeconds: 0,
    safeMinutes: 0,
    partsUploaded: 0,
    totalBytesUploaded: 0,
    isUploading: false,
  });
  const [isChunkedUploadAvailable, setIsChunkedUploadAvailable] = useState(false);
  // Webcam state for floating preview
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamConfig, setWebcamConfig] = useState<BubbleConfig | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const optionsRef = useRef<ChunkedRecordingOptions | null>(null);
  // For preview functionality - store chunks locally
  const localChunksRef = useRef<Blob[]>([]);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  // For webcam compositing
  const compositorRef = useRef<WebcamCompositor | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);  // Keep reference to stop tracks

  // Function to check availability (can be called manually or on mount)
  const checkAvailability = useCallback(async () => {
    const available = hookOptions.isPublic
      ? await multipartUploadService.isAvailablePublic()
      : await multipartUploadService.isAvailable();
    setIsChunkedUploadAvailable(available);
  }, [hookOptions.isPublic]);

  // Check if chunked upload is available on mount
  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Cleanup preview URL to free memory
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  /**
   * Handle chunk upload progress callback
   */
  const handleChunkUploaded = useCallback((uploadProgress: ChunkUploadProgress) => {
    setProgress(prev => ({
      ...prev,
      safeMinutes: uploadProgress.safeMinutes,
      partsUploaded: uploadProgress.partsUploaded,
      totalBytesUploaded: uploadProgress.totalBytesUploaded,
      isUploading: false,
    }));
  }, []);

  /**
   * Handle upload error callback
   */
  const handleUploadError = useCallback((err: Error) => {
    setError(`Upload failed: ${err.message}`);
    // Don't stop recording - just notify user
    // They can continue and we'll retry
  }, []);

  /**
   * Get supported MIME types
   */
  const getSupportedMimeType = useCallback((): string => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }, []);

  /**
   * Start recording with chunked upload
   */
  const startRecording = useCallback(async (options: ChunkedRecordingOptions) => {
    try {
      setError(null);
      setState('initializing');
      optionsRef.current = options;

      // Clear local chunks from any previous recording
      localChunksRef.current = [];
      previewBlobRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      const mimeType = getSupportedMimeType();

      // Initialize multipart upload session
      if (options.token) {
        await multipartUploadService.initiateWithToken(
          options.token,
          mimeType,
          options.organizationId,
          {
            hasAudio: options.hasAudio,
            resolution: options.resolution,
            frameRate: options.frameRate,
          }
        );
      } else {
        await multipartUploadService.initiate(
          options.taskId,
          mimeType,
          {
            hasAudio: options.hasAudio,
            resolution: options.resolution,
            frameRate: options.frameRate,
          }
        );
      }

      // Set up callbacks
      multipartUploadService.setCallbacks({
        onChunkUploaded: handleChunkUploaded,
        onError: handleUploadError,
      });

      // Get display stream
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        } as any,
        audio: false,
      });
      displayStreamRef.current = displayStream;

      // Get audio stream if requested
      let audioStream: MediaStream | null = null;
      if (options.hasAudio) {
        try {
          // Use specific audio device if provided, otherwise use default
          const audioConstraints = options.audioDeviceId
            ? { deviceId: { exact: options.audioDeviceId } }
            : true;
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });
        } catch (err) {
          console.warn('[Recording] Audio stream failed:', err);
          // Audio stream failed - continue without audio
        }
      }

      // Determine video stream (composited with webcam or raw display)
      let videoStream: MediaStream;

      // Store webcam stream for FloatingWebcamBubble (captured by screen recording)
      // No compositor - the floating bubble on screen is captured naturally by getDisplayMedia
      if (options.hasWebcam && options.webcamStream) {
        setWebcamStream(options.webcamStream);
        const fullConfig: BubbleConfig = {
          size: options.webcamConfig?.size ?? 'medium',
          shape: options.webcamConfig?.shape ?? 'circle',
          position: options.webcamConfig?.position ?? 'bottom-left',
          visible: options.webcamConfig?.visible ?? true,
          borderWidth: options.webcamConfig?.borderWidth ?? 3,
          borderColor: options.webcamConfig?.borderColor ?? '#ffffff',
          mirrored: options.webcamConfig?.mirrored ?? true,
        };
        setWebcamConfig(fullConfig);
      } else {
        setWebcamStream(null);
        setWebcamConfig(null);
      }

      // Use display stream directly - floating webcam bubble is captured as part of screen
      videoStream = displayStream;

      // Combine video and audio tracks
      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      if (audioStream) {
        tracks.push(...audioStream.getAudioTracks());
      }
      streamRef.current = new MediaStream(tracks);

      // Create MediaRecorder
      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 1200000, // 1.2 Mbps
      };

      if (options.hasAudio && audioStream) {
        recorderOptions.audioBitsPerSecond = 128000; // 128 kbps
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available - buffer chunks for upload AND store locally for preview
      mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data.size > 0) {
          // Store locally for preview playback
          localChunksRef.current.push(event.data);
          // Upload to S3/R2
          setProgress(prev => ({ ...prev, isUploading: true }));
          await multipartUploadService.bufferChunk(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        // Recording stopped
      };

      // Handle errors
      mediaRecorder.onerror = () => {
        setError('Recording error occurred');
        setState('error');
      };

      // Handle user stopping screen share
      displayStream.getVideoTracks()[0].onended = () => {
        // User stopped screen sharing - this will trigger the stop flow
      };

      // Start recording - collect data every 100ms
      mediaRecorder.start(100);
      startTimeRef.current = Date.now();

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setProgress(prev => ({ ...prev, durationSeconds: seconds }));
      }, 1000);

      setState('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setState('error');

      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Abort any pending upload
      await multipartUploadService.abort();
    }
  }, [getSupportedMimeType, handleChunkUploaded, handleUploadError]);

  /**
   * Stop recording and transition to preview state (does NOT complete upload)
   * User must call submitRecording() to finalize or redoRecording() to abort
   */
  const stopRecording = useCallback(async (): Promise<void> => {
    if (!mediaRecorderRef.current || (state !== 'recording' && state !== 'paused')) {
      return;
    }

    try {
      setState('stopping');

      // Stop the MediaRecorder
      return new Promise((resolve, reject) => {
        const recorder = mediaRecorderRef.current!;

        recorder.onstop = async () => {
          try {
            // Clear duration timer
            if (durationIntervalRef.current) {
              clearInterval(durationIntervalRef.current);
              durationIntervalRef.current = null;
            }

            // Calculate final duration
            const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
            setProgress(prev => ({ ...prev, durationSeconds: finalDuration }));

            // Flush remaining chunks to S3 (but don't complete the upload)
            await multipartUploadService.flush();

            // Create preview blob from local chunks
            const mimeType = getSupportedMimeType();
            previewBlobRef.current = new Blob(localChunksRef.current, { type: mimeType });

            // Create preview URL
            if (previewUrlRef.current) {
              URL.revokeObjectURL(previewUrlRef.current);
            }
            previewUrlRef.current = URL.createObjectURL(previewBlobRef.current);

            // Stop compositor if running
            if (compositorRef.current) {
              compositorRef.current.stop();
              compositorRef.current = null;
            }

            // Stop display stream tracks (original screen capture)
            if (displayStreamRef.current) {
              displayStreamRef.current.getTracks().forEach(track => track.stop());
              displayStreamRef.current = null;
            }

            // Stop combined stream tracks
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
            }

            setState('preview');

            resolve();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to stop recording');
            setState('error');
            reject(err);
          }
        };

        // Request any remaining data
        recorder.requestData();

        // Stop after brief delay
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 100);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setState('error');
    }
  }, [state, getSupportedMimeType]);

  /**
   * Submit the recording (completes multipart upload)
   * Only works when in 'preview' state
   */
  const submitRecording = useCallback(async (): Promise<{ recording: any; fileUrl: string } | null> => {
    if (state !== 'preview') {
      return null;
    }

    try {
      setState('completing');

      // Complete the multipart upload
      const result = await multipartUploadService.complete(
        progress.durationSeconds,
        optionsRef.current?.hasAudio || false
      );

      // Cleanup
      streamRef.current = null;
      mediaRecorderRef.current = null;
      localChunksRef.current = [];
      previewBlobRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      setState('completed');

      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit recording');
      setState('error');
      return null;
    }
  }, [state, progress.durationSeconds]);

  /**
   * Redo recording (aborts upload, deletes uploaded parts, resets to idle)
   * Only works when in 'preview' state
   */
  const redoRecording = useCallback(async (): Promise<void> => {
    if (state !== 'preview') {
      return;
    }

    try {
      // Abort the multipart upload (deletes uploaded parts from S3/R2)
      await multipartUploadService.abort();

      // Cleanup
      streamRef.current = null;
      mediaRecorderRef.current = null;
      localChunksRef.current = [];
      previewBlobRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      // Reset progress
      setProgress({
        durationSeconds: 0,
        safeMinutes: 0,
        partsUploaded: 0,
        totalBytesUploaded: 0,
        isUploading: false,
      });
      setError(null);
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset recording');
      setState('error');
    }
  }, [state]);

  /**
   * Get the preview URL for video playback
   * Returns null if not in preview state or no preview available
   */
  const getPreviewUrl = useCallback((): string | null => {
    return previewUrlRef.current;
  }, []);

  /**
   * Pause recording
   */
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setState('paused');
    }
  }, []);

  /**
   * Resume recording
   */
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setState('recording');
    }
  }, []);

  /**
   * Cancel recording and abort upload
   */
  const cancelRecording = useCallback(async () => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Clear timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop compositor if running
    if (compositorRef.current) {
      compositorRef.current.stop();
      compositorRef.current = null;
    }

    // Cleanup display stream
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach(track => track.stop());
      displayStreamRef.current = null;
    }

    // Cleanup combined stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Abort multipart upload
    await multipartUploadService.abort();

    // Reset state
    mediaRecorderRef.current = null;
    setProgress({
      durationSeconds: 0,
      safeMinutes: 0,
      partsUploaded: 0,
      totalBytesUploaded: 0,
      isUploading: false,
    });
    setError(null);
    setState('idle');
  }, []);

  /**
   * Update webcam bubble configuration during recording (for dragging, resizing)
   */
  const updateWebcamBubble = useCallback((config: Partial<BubbleConfig>): void => {
    if (compositorRef.current) {
      compositorRef.current.updateBubbleConfig(config);
    }
  }, []);

  /**
   * Set webcam bubble position during recording
   * @param x - X position as percentage (0-1) from left
   * @param y - Y position as percentage (0-1) from top
   */
  const setWebcamBubblePosition = useCallback((x: number, y: number): void => {
    if (compositorRef.current) {
      // Convert percentage to canvas pixel coordinates
      const canvas = compositorRef.current.getCanvas();
      const pixelX = x * canvas.width;
      const pixelY = y * canvas.height;
      compositorRef.current.setBubblePixelPosition(pixelX, pixelY);
    }
  }, []);

  /**
   * Toggle webcam visibility during recording
   */
  const toggleWebcamVisible = useCallback((): boolean => {
    if (compositorRef.current) {
      return compositorRef.current.toggleWebcam();
    }
    return false;
  }, []);

  return {
    state,
    progress,
    error,
    mediaStream: streamRef.current, // Expose stream for audio waveform visualization
    // Webcam state for floating preview
    webcamStream,
    webcamConfig,
    startRecording,
    stopRecording,
    submitRecording,
    redoRecording,
    getPreviewUrl,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isChunkedUploadAvailable,
    checkAvailability,
    // Webcam controls
    updateWebcamBubble,
    setWebcamBubblePosition,
    toggleWebcamVisible,
  };
}

export default useChunkedRecording;
