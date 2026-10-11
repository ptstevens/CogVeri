import { useState, useRef, useCallback, useId } from 'react';
import { Upload, Film, X, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../../services/api';

export interface RubricVideoUploaderProps {
  onUploadComplete: (tempVideoId: string) => void;
  onError: (error: string) => void;
  maxSizeMB?: number;
  maxDurationSeconds?: number;
  disabled?: boolean;
}

type UploadState = 'idle' | 'validating' | 'uploading' | 'complete' | 'error';

const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

export function RubricVideoUploader({
  onUploadComplete,
  onError,
  maxSizeMB = 500, // Increased since we bypass Cloudflare with direct R2 upload
  maxDurationSeconds = 900,
  disabled = false,
}: RubricVideoUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const inputId = `${id}-file-input`;

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateFile = useCallback(
    async (file: File): Promise<{ valid: boolean; error?: string; duration?: number }> => {
      // Check file type
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        return {
          valid: false,
          error: 'Invalid file type. Please upload MP4, WebM, MOV, AVI, or MKV.',
        };
      }

      // Check file size
      if (file.size > maxSizeBytes) {
        return {
          valid: false,
          error: `File too large. Maximum size is ${maxSizeMB}MB.`,
        };
      }

      // Check video duration
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          const duration = video.duration;

          if (duration > maxDurationSeconds) {
            resolve({
              valid: false,
              error: `Video too long. Maximum duration is ${formatDuration(maxDurationSeconds)}.`,
            });
          } else {
            resolve({ valid: true, duration });
          }
        };

        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          resolve({
            valid: false,
            error: 'Could not read video file. Please try a different file.',
          });
        };

        video.src = URL.createObjectURL(file);
      });
    },
    [maxSizeBytes, maxSizeMB, maxDurationSeconds]
  );

  const generateThumbnail = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        // Seek to 1 second or 10% of duration, whichever is smaller
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(video.src);
          resolve(thumbnailDataUrl);
        } else {
          URL.revokeObjectURL(video.src);
          reject(new Error('Could not create thumbnail'));
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Could not load video for thumbnail'));
      };

      video.src = URL.createObjectURL(file);
    });
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setState('uploading');
      setProgress(0);

      try {
        // Step 1: Get presigned upload URL from backend
        const urlResponse = await api.post('/rubric-generation/get-upload-url', {
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
        });

        const { uploadUrl, tempVideoId, storageKey } = urlResponse.data.data;

        // Step 2: Upload directly to R2 using presigned URL
        // Using XMLHttpRequest for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              // Reserve last 5% for confirmation step
              const percent = Math.round((event.loaded * 95) / event.total);
              setProgress(percent);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed. Please check your connection and try again.'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload was cancelled.'));
          });

          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });

        // Step 3: Confirm upload with backend to start transcription
        setProgress(98);
        await api.post('/rubric-generation/confirm-upload', {
          tempVideoId,
          storageKey,
          filename: file.name,
          fileSize: file.size,
          contentType: file.type,
        });

        setState('complete');
        setProgress(100);

        onUploadComplete(tempVideoId);
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              'Upload failed. Please try again.';
        setState('error');
        setErrorMessage(message);
        onError(message);
      }
    },
    [onUploadComplete, onError]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setErrorMessage(null);
      setThumbnailUrl(null);
      setState('validating');

      // Validate file
      const validation = await validateFile(file);

      if (!validation.valid) {
        setState('error');
        setErrorMessage(validation.error || 'Invalid file');
        onError(validation.error || 'Invalid file');
        return;
      }

      setVideoDuration(validation.duration || null);

      // Generate thumbnail
      try {
        const thumbnail = await generateThumbnail(file);
        setThumbnailUrl(thumbnail);
      } catch {
        // Thumbnail generation failed, continue without it
      }

      // Start upload
      await uploadFile(file);
    },
    [validateFile, generateThumbnail, uploadFile, onError]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (disabled || state === 'uploading') return;

      dropZoneRef.current?.classList.remove('border-primary-500', 'bg-primary-50');

      const files = event.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [disabled, state, handleFileSelect]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (disabled || state === 'uploading') return;

      dropZoneRef.current?.classList.add('border-primary-500', 'bg-primary-50');
    },
    [disabled, state]
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    dropZoneRef.current?.classList.remove('border-primary-500', 'bg-primary-50');
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleReset = useCallback(() => {
    setState('idle');
    setProgress(0);
    setErrorMessage(null);
    setSelectedFile(null);
    setThumbnailUrl(null);
    setVideoDuration(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const isUploading = state === 'uploading';
  const isComplete = state === 'complete';
  const hasError = state === 'error';

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_VIDEO_TYPES.join(',')}
        onChange={handleInputChange}
        className="sr-only"
        disabled={disabled || isUploading}
      />

      {/* Drop Zone / Upload Area */}
      {state === 'idle' && (
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleBrowseClick}
          className={`
            relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-all duration-200
            ${disabled ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'}
          `}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleBrowseClick();
            }
          }}
          aria-label="Upload video file"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <Upload className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Drag and drop your video here</p>
              <p className="text-sm text-gray-500 mt-1">
                or <span className="text-primary-600 font-medium">browse</span> to select a file
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              MP4, WebM, MOV, AVI, or MKV. Max {maxSizeMB}MB, {formatDuration(maxDurationSeconds)}{' '}
              max duration.
            </p>
          </div>
        </div>
      )}

      {/* Validating State */}
      {state === 'validating' && (
        <div className="border rounded-lg p-6 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Validating video...</p>
              <p className="text-xs text-gray-500">{selectedFile?.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Uploading State */}
      {isUploading && (
        <div className="border rounded-lg p-6 bg-white">
          <div className="flex items-start gap-4">
            {thumbnailUrl ? (
              <div className="w-20 h-14 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-14 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Film className="w-6 h-6 text-gray-400" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{selectedFile?.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedFile && formatFileSize(selectedFile.size)}
                {videoDuration && ` - ${formatDuration(videoDuration)}`}
              </p>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete State */}
      {isComplete && (
        <div className="border border-success-200 rounded-lg p-6 bg-success-50">
          <div className="flex items-start gap-4">
            {thumbnailUrl ? (
              <div className="w-20 h-14 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-14 rounded bg-success-100 flex items-center justify-center flex-shrink-0">
                <Film className="w-6 h-6 text-success-600" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success-600 flex-shrink-0" />
                <p className="text-sm font-medium text-success-700">Upload complete</p>
              </div>
              <p className="text-xs text-success-600 mt-0.5 truncate">{selectedFile?.name}</p>
              <p className="text-xs text-success-600">
                {selectedFile && formatFileSize(selectedFile.size)}
                {videoDuration && ` - ${formatDuration(videoDuration)}`}
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="p-1 text-success-600 hover:text-success-700 hover:bg-success-100 rounded transition-colors"
              aria-label="Remove uploaded video"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="border border-error rounded-lg p-6 bg-red-50">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-error" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-error">Upload failed</p>
              <p className="text-xs text-red-600 mt-0.5">{errorMessage}</p>
              {selectedFile && (
                <p className="text-xs text-gray-500 mt-1 truncate">{selectedFile.name}</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 text-sm font-medium text-error hover:bg-red-100 rounded transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RubricVideoUploader;
