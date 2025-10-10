import api from './api';

export interface Recording {
  id: string;
  task_id: string;
  user_id: string;
  file_url?: string;
  thumbnail_url?: string;
  duration_seconds: number;
  file_size_bytes?: number;
  mime_type: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  resolution?: string;
  frame_rate?: number;
  has_audio: boolean;
  browser_info?: string;
  error_message?: string;
  started_at: string;
  ended_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRecordingDto {
  task_id: string;
  duration_seconds: number;
  has_audio: boolean;
  mime_type: string;
  resolution?: string;
  frame_rate?: number;
  browser_info?: string;
}

export interface RecordingOptions {
  video: boolean;
  audio: boolean;
  videoConstraints?: MediaTrackConstraints;
  audioConstraints?: MediaTrackConstraints;
  mimeType?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
}

class RecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;
  private recordingId: string | null = null;

  // Check if screen recording is supported
  isScreenRecordingSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getDisplayMedia &&
      window.MediaRecorder
    );
  }

  // Get supported MIME types (VP9 first for better compression)
  getSupportedMimeTypes(): string[] {
    const types = [
      'video/webm;codecs=vp9,opus',   // Best compression for screen content
      'video/webm;codecs=vp8,opus',   // Fallback for older browsers
      'video/webm;codecs=h264,opus',  // Alternative codec
      'video/webm',
      'video/mp4',
    ];

    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }

  // Start screen recording
  async startRecording(options: RecordingOptions = { video: true, audio: false }): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      throw new Error('Recording is already in progress');
    }

    try {
      // Get display media (screen capture)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: options.videoConstraints || {
          cursor: 'always',
          displaySurface: 'monitor',
        },
        audio: false, // System audio not supported in most browsers
      });

      // Get user media (microphone) if audio is requested
      let audioStream: MediaStream | null = null;
      if (options.audio) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: options.audioConstraints || true,
            video: false,
          });
        } catch (audioError) {
          console.warn('Failed to get audio stream:', audioError);
        }
      }

      // Combine streams
      const tracks: MediaStreamTrack[] = [...displayStream.getTracks()];
      if (audioStream) {
        tracks.push(...audioStream.getAudioTracks());
      }
      this.stream = new MediaStream(tracks);

      // Determine MIME type
      const mimeType = options.mimeType || this.getSupportedMimeTypes()[0];
      if (!mimeType) {
        throw new Error('No supported MIME type found');
      }

      // Create MediaRecorder
      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        // Optimized bitrate for screen recordings:
        // - Screen content compresses better than camera footage
        // - VP9 codec provides 30-50% better compression than VP8
        // - 1.2 Mbps is optimal for 1080p screen content with text/UI
        videoBitsPerSecond: options.videoBitsPerSecond || 1200000, // 1.2 Mbps (down from 2.5)
      };

      if (options.audioBitsPerSecond) {
        recorderOptions.audioBitsPerSecond = options.audioBitsPerSecond;
      } else if (options.audio) {
        // Optimize audio bitrate for voice (128kbps is excellent for speech)
        recorderOptions.audioBitsPerSecond = 128000; // 128 kbps
      }

      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
      this.recordedChunks = [];
      this.startTime = Date.now();

      // Handle data available event
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // Handle stop event
      this.mediaRecorder.onstop = () => {
        // Stream tracks will be stopped in stopRecording method
      };

      // Handle errors
      this.mediaRecorder.onerror = (event: Event) => {
        console.error('MediaRecorder error:', event);
        this.stopRecording();
      };

      // Handle stream ending (user stops sharing)
      displayStream.getVideoTracks()[0].onended = () => {
        if (this.mediaRecorder?.state === 'recording') {
          this.stopRecording();
        }
      };

      // Start recording (collect data more frequently for better file integrity)
      this.mediaRecorder.start(100); // Collect data every 100ms
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  // Stop recording
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      if (this.mediaRecorder.state === 'inactive') {
        reject(new Error('Recording already stopped'));
        return;
      }

      const recorder = this.mediaRecorder;

      // Set up the onstop handler BEFORE calling stop()
      recorder.onstop = () => {
        // Give a small delay to ensure all data chunks are processed
        setTimeout(() => {
          console.log('Recording stopped. Chunks collected:', this.recordedChunks.length);
          console.log('Total size:', this.recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0), 'bytes');

          const duration = (Date.now() - this.startTime) / 1000;
          const blob = new Blob(this.recordedChunks, {
            type: recorder.mimeType,
          });

          console.log('Final blob size:', blob.size, 'bytes');
          console.log('Final blob type:', blob.type);

          this.cleanup();
          resolve(blob);
        }, 100); // Small delay to ensure all ondataavailable events have fired
      };

      if (recorder.state === 'recording') {
        // Request any remaining data before stopping
        recorder.requestData();
        // Stop after a brief moment to allow requestData to complete
        setTimeout(() => {
          recorder.stop();
        }, 50);
      } else {
        this.cleanup();
        reject(new Error('Recording is not in progress'));
      }
    });
  }

  // Pause recording
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  // Resume recording
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  // Get recording state
  getRecordingState(): RecordingState | null {
    if (!this.mediaRecorder) return null;
    return this.mediaRecorder.state;
  }

  // Get recording duration
  getRecordingDuration(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  // Clean up resources
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.startTime = 0;
  }

  // Upload recording via magic link token (public endpoint)
  async uploadRecordingWithToken(
    blob: Blob,
    token: string,
    metadata: Partial<CreateRecordingDto>
  ): Promise<Recording> {
    // Create FormData with all data in one request
    const formData = new FormData();
    formData.append('video', blob, 'recording.webm');
    formData.append('duration_seconds', String(metadata.duration_seconds || this.getRecordingDuration()));
    formData.append('has_audio', String(metadata.has_audio || false));
    formData.append('mime_type', blob.type);
    if (metadata.resolution) {
      formData.append('resolution', metadata.resolution);
    }
    if (metadata.frame_rate) {
      formData.append('frame_rate', String(metadata.frame_rate));
    }
    formData.append('browser_info', navigator.userAgent);

    const { data: response } = await api.post(
      `/magic-links/submit-recording/${token}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          console.log(`Upload Progress: ${percentCompleted}%`);
        },
      }
    );

    return response.data;
  }

  // Upload recording
  async uploadRecording(
    blob: Blob,
    taskId: string,
    metadata: Partial<CreateRecordingDto>
  ): Promise<Recording> {
    // First, create a recording entry
    const createData: CreateRecordingDto = {
      task_id: taskId,
      duration_seconds: metadata.duration_seconds || this.getRecordingDuration(),
      has_audio: metadata.has_audio || false,
      mime_type: blob.type,
      resolution: metadata.resolution,
      frame_rate: metadata.frame_rate,
      browser_info: navigator.userAgent,
    };

    const { data: recording } = await api.post('/recordings', createData);
    this.recordingId = recording.data.id;

    // Then upload the video file
    const formData = new FormData();
    formData.append('video', blob, `recording-${this.recordingId}.webm`);
    formData.append('recording_id', this.recordingId);

    try {
      const { data: updatedRecording } = await api.post(
        `/recordings/${this.recordingId}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            console.log(`Upload Progress: ${percentCompleted}%`);
          },
        }
      );

      return updatedRecording.data;
    } catch (error) {
      // If upload fails, delete the recording entry
      await api.delete(`/recordings/${this.recordingId}`);
      throw error;
    }
  }

  // Get all recordings
  async getRecordings(filters?: {
    task_id?: string;
    user_id?: string;
    status?: string;
  }): Promise<Recording[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }

    const queryString = params.toString();
    const url = queryString ? `/recordings?${queryString}` : '/recordings';

    const response = await api.get(url);
    return response.data.data;
  }

  // Get recording by ID
  async getRecordingById(id: string): Promise<Recording> {
    const response = await api.get(`/recordings/${id}`);
    return response.data.data;
  }

  // Delete recording
  async deleteRecording(id: string): Promise<void> {
    await api.delete(`/recordings/${id}`);
  }

  // Get recording download URL
  async getRecordingDownloadUrl(id: string): Promise<string> {
    const response = await api.get(`/recordings/${id}/download-url`);
    return response.data.url;
  }

  // Generate thumbnail from video
  async generateThumbnail(videoBlob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      video.onloadedmetadata = () => {
        video.currentTime = 1; // Seek to 1 second
      };

      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to generate thumbnail'));
            }
            URL.revokeObjectURL(video.src);
          },
          'image/jpeg',
          0.8
        );
      };

      video.onerror = () => {
        reject(new Error('Failed to load video'));
        URL.revokeObjectURL(video.src);
      };

      video.src = URL.createObjectURL(videoBlob);
    });
  }

  // Helper method to format duration
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  // Helper method to format file size
  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export const recordingService = new RecordingService();