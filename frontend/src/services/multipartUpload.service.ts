import api from './api';

// Types
export interface UploadSession {
  sessionId: string;
  uploadId: string;
  key: string;
  bucket: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface ChunkUploadProgress {
  partsUploaded: number;
  totalBytesUploaded: number;
  safeMinutes: number; // Minutes of video safely uploaded
}

export interface MultipartUploadCallbacks {
  onChunkUploaded?: (progress: ChunkUploadProgress) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

/**
 * Service for handling chunked/multipart uploads during recording
 * Uploads video chunks directly to R2/S3 via presigned URLs
 */
class MultipartUploadService {
  private session: UploadSession | null = null;
  private uploadedParts: UploadedPart[] = [];
  private partNumber: number = 1;
  private pendingBuffer: Blob[] = [];
  private totalBytesUploaded: number = 0;
  private isUploading: boolean = false;
  private callbacks: MultipartUploadCallbacks = {};

  // Minimum part size for R2/S3 (5MB)
  private readonly MIN_PART_SIZE = 5 * 1024 * 1024;

  // Token for public/magic link uploads (null for authenticated users)
  private token: string | null = null;
  private organizationId: string | null = null;

  /**
   * Check if multipart upload is available on the backend (authenticated)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { data } = await api.get('/recordings/multipart/available');
      return data.available === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if multipart upload is available (public/unauthenticated)
   */
  async isAvailablePublic(): Promise<boolean> {
    try {
      const { data } = await api.get('/magic-links/multipart/available');
      return data.available === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize for authenticated user upload
   */
  async initiate(
    taskId: string,
    mimeType: string,
    options: {
      hasAudio?: boolean;
      resolution?: string;
      frameRate?: number;
      browserInfo?: string;
    } = {}
  ): Promise<UploadSession> {
    this.reset();

    const { data } = await api.post('/recordings/multipart/initiate', {
      taskId,
      mimeType,
      hasAudio: options.hasAudio || false,
      resolution: options.resolution,
      frameRate: options.frameRate,
      browserInfo: options.browserInfo || navigator.userAgent,
    });

    this.session = data.data;

    return this.session!;
  }

  /**
   * Initialize for public/magic link upload
   */
  async initiateWithToken(
    token: string,
    mimeType: string,
    organizationId?: string,
    options: {
      hasAudio?: boolean;
      resolution?: string;
      frameRate?: number;
      browserInfo?: string;
    } = {}
  ): Promise<UploadSession> {
    this.reset();
    this.token = token;
    this.organizationId = organizationId || null;

    let url = `/magic-links/multipart/initiate/${token}`;
    if (organizationId) {
      url += `?organization_id=${organizationId}`;
    }

    const { data } = await api.post(url, {
      mimeType,
      hasAudio: options.hasAudio || false,
      resolution: options.resolution,
      frameRate: options.frameRate,
      browserInfo: options.browserInfo || navigator.userAgent,
    });

    this.session = data.data;

    return this.session!;
  }

  /**
   * Set callbacks for upload events
   */
  setCallbacks(callbacks: MultipartUploadCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Buffer a chunk from MediaRecorder ondataavailable
   * Will automatically upload when buffer reaches MIN_PART_SIZE
   */
  async bufferChunk(chunk: Blob): Promise<void> {
    if (!this.session) {
      this.pendingBuffer.push(chunk);
      return;
    }

    this.pendingBuffer.push(chunk);

    const bufferSize = this.pendingBuffer.reduce((sum, b) => sum + b.size, 0);

    // Upload when we have enough data
    if (bufferSize >= this.MIN_PART_SIZE && !this.isUploading) {
      await this.uploadBufferedChunks();
    }
  }

  // Maximum retry attempts for part uploads
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  /**
   * Upload all buffered chunks as a single part with retry logic
   * IMPORTANT: R2/S3 requires all non-trailing parts to be EXACTLY the same size.
   * This method ensures we upload exactly MIN_PART_SIZE bytes for each part.
   */
  async uploadBufferedChunks(isLastPart: boolean = false): Promise<void> {
    if (!this.session || this.pendingBuffer.length === 0 || this.isUploading) {
      return;
    }

    this.isUploading = true;

    // Create blob from pending chunks
    const fullBlob = new Blob(this.pendingBuffer, { type: 'video/webm' });

    let partBlob: Blob;
    let remainingBlob: Blob | null = null;

    if (isLastPart) {
      // For the last part, upload everything (can be any size)
      partBlob = fullBlob;
      this.pendingBuffer = [];
    } else if (fullBlob.size > this.MIN_PART_SIZE) {
      // For non-trailing parts, upload EXACTLY MIN_PART_SIZE bytes
      // This ensures all parts are the same size (R2/S3 requirement)
      partBlob = fullBlob.slice(0, this.MIN_PART_SIZE);
      remainingBlob = fullBlob.slice(this.MIN_PART_SIZE);
      // Keep remaining data in buffer for next part
      this.pendingBuffer = remainingBlob.size > 0 ? [remainingBlob] : [];
    } else {
      // Not enough data and not the last part - shouldn't happen but handle gracefully
      partBlob = fullBlob;
      this.pendingBuffer = [];
    }

    const partSize = partBlob.size;
    const currentPartNumber = this.partNumber;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Get presigned URL for this part
        const presignedUrl = await this.getPresignedUrl(currentPartNumber);

        // Upload directly to R2/S3
        const response = await fetch(presignedUrl, {
          method: 'PUT',
          body: partBlob,
          headers: {
            'Content-Type': 'video/webm',
          },
        });

        if (!response.ok) {
          throw new Error(`Part upload failed: ${response.status} ${response.statusText}`);
        }

        // Get ETag from response (required for complete)
        const etag = response.headers.get('ETag');
        if (!etag) {
          throw new Error('No ETag in response');
        }

        // Store part info - keep the ETag as-is (backend will handle formatting)
        // Some S3/R2 implementations return ETags with quotes, some without
        const part: UploadedPart = {
          partNumber: currentPartNumber,
          etag: etag.replace(/^"|"$/g, ''), // Normalize by removing surrounding quotes only
          size: partSize,
        };
        this.uploadedParts.push(part);

        // Register part with backend
        await this.registerPart(part);

        // Update progress
        this.totalBytesUploaded += partSize;
        this.partNumber++;

        // Notify callback
        if (this.callbacks.onChunkUploaded) {
          const progress: ChunkUploadProgress = {
            partsUploaded: this.uploadedParts.length,
            totalBytesUploaded: this.totalBytesUploaded,
            safeMinutes: this.calculateSafeMinutes(),
          };
          this.callbacks.onChunkUploaded(progress);
        }

        this.isUploading = false;

        // If not the last part and buffer has accumulated more data, trigger another upload
        // This handles cases where data arrives faster than we can upload
        if (!isLastPart) {
          const remainingSize = this.pendingBuffer.reduce((sum, b) => sum + b.size, 0);
          if (remainingSize >= this.MIN_PART_SIZE) {
            // Don't await - let the caller continue while this uploads
            // Use setTimeout to avoid stack overflow and allow event loop to process
            setTimeout(() => this.uploadBufferedChunks(false), 0);
          }
        }

        return; // Success - exit the retry loop
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.MAX_RETRIES) {
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * attempt));
        }
      }
    }

    // All retries failed
    this.isUploading = false;

    if (this.callbacks.onError) {
      this.callbacks.onError(lastError || new Error('Upload failed after retries'));
    }
  }

  /**
   * Flush any remaining buffered chunks (for final part)
   * If there's more than MIN_PART_SIZE, upload full parts first, then the remainder as the last part
   */
  async flush(): Promise<void> {
    if (this.pendingBuffer.length === 0) {
      return;
    }

    this.isUploading = false; // Reset flag

    // Keep uploading full MIN_PART_SIZE parts until we have less than that remaining
    let bufferSize = this.pendingBuffer.reduce((sum, b) => sum + b.size, 0);

    while (bufferSize >= this.MIN_PART_SIZE) {
      await this.uploadBufferedChunks(false); // Not the last part yet
      bufferSize = this.pendingBuffer.reduce((sum, b) => sum + b.size, 0);
    }

    // Upload remaining data as the final part (can be smaller than MIN_PART_SIZE)
    if (this.pendingBuffer.length > 0) {
      await this.uploadBufferedChunks(true); // true = this is the last part
    }
  }

  /**
   * Complete the multipart upload with retry logic
   */
  async complete(durationSeconds: number, hasAudio: boolean = false): Promise<{ recording: any; fileUrl: string }> {
    if (!this.session) {
      throw new Error('No active upload session');
    }

    // Flush any remaining chunks
    await this.flush();

    // Wait for any pending uploads to complete
    let waitAttempts = 0;
    while (this.isUploading && waitAttempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitAttempts++;
    }

    // Validate we have parts to complete
    if (this.uploadedParts.length === 0) {
      throw new Error('No parts uploaded - cannot complete multipart upload');
    }

    // Prepare parts array for completion
    const parts = this.uploadedParts.map(p => ({
      partNumber: p.partNumber,
      etag: p.etag,
    }));

    let lastError: Error | null = null;

    // Retry logic for completion
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        let result;

        if (this.token) {
          // Public/magic link completion
          let url = `/magic-links/multipart/complete/${this.token}`;
          if (this.organizationId) {
            url += `?organization_id=${this.organizationId}`;
          }

          const { data } = await api.post(url, {
            sessionId: this.session.sessionId,
            parts,
            durationSeconds,
            hasAudio,
          });
          result = data.data;
        } else {
          // Authenticated user completion
          const { data } = await api.post('/recordings/multipart/complete', {
            sessionId: this.session.sessionId,
            parts,
            durationSeconds,
            hasAudio,
          });
          result = data.data;
        }

        if (this.callbacks.onComplete) {
          this.callbacks.onComplete();
        }

        // Reset for next upload
        this.reset();

        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry on 4xx errors (client errors), but DO retry on 503 (Service Unavailable)
        const statusCode = error?.response?.status;
        if (statusCode >= 400 && statusCode < 500) {
          break;
        }

        if (attempt < this.MAX_RETRIES) {
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * attempt));
        }
      }
    }

    // All retries failed
    const errorMessage = lastError instanceof Error
      ? lastError.message
      : (lastError as any)?.response?.data?.message || 'Upload completion failed';

    throw new Error(errorMessage);
  }

  /**
   * Abort the current upload
   */
  async abort(): Promise<void> {
    if (!this.session) {
      return;
    }

    try {
      if (this.token) {
        // Public/magic link abort
        let url = `/magic-links/multipart/abort/${this.token}?sessionId=${this.session.sessionId}`;
        if (this.organizationId) {
          url += `&organization_id=${this.organizationId}`;
        }
        await api.delete(url);
      } else {
        // Authenticated user abort
        await api.delete(`/recordings/multipart/abort?sessionId=${this.session.sessionId}`);
      }
    } catch (error) {
      // Silently handle abort errors
    }

    this.reset();
  }

  /**
   * Get current session ID (for resume functionality)
   */
  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }

  /**
   * Get current upload progress
   */
  getProgress(): ChunkUploadProgress {
    return {
      partsUploaded: this.uploadedParts.length,
      totalBytesUploaded: this.totalBytesUploaded,
      safeMinutes: this.calculateSafeMinutes(),
    };
  }

  /**
   * Check if there's an active session
   */
  hasActiveSession(): boolean {
    return this.session !== null;
  }

  /**
   * Get presigned URL for a part
   */
  private async getPresignedUrl(partNumber: number): Promise<string> {
    if (!this.session) {
      throw new Error('No active upload session');
    }

    let result;

    if (this.token) {
      // Public/magic link presign
      let url = `/magic-links/multipart/presign/${this.token}?sessionId=${this.session.sessionId}&partNumber=${partNumber}`;
      if (this.organizationId) {
        url += `&organization_id=${this.organizationId}`;
      }
      const { data } = await api.get(url);
      result = data.data;
    } else {
      // Authenticated user presign
      const { data } = await api.get(
        `/recordings/multipart/presign?sessionId=${this.session.sessionId}&partNumber=${partNumber}`
      );
      result = data.data;
    }

    return result.presignedUrl;
  }

  /**
   * Register an uploaded part with the backend
   */
  private async registerPart(part: UploadedPart): Promise<void> {
    if (!this.session) {
      return;
    }

    const body = {
      sessionId: this.session.sessionId,
      partNumber: part.partNumber,
      etag: part.etag,
      size: part.size,
    };

    if (this.token) {
      // Public/magic link register
      let url = `/magic-links/multipart/register-part/${this.token}`;
      if (this.organizationId) {
        url += `?organization_id=${this.organizationId}`;
      }
      await api.post(url, body);
    } else {
      // Authenticated user register
      await api.post('/recordings/multipart/register-part', body);
    }
  }

  /**
   * Calculate safe minutes based on bytes uploaded
   * Assumes ~10MB/minute at 1.2Mbps video + 128kbps audio
   */
  private calculateSafeMinutes(): number {
    const bytesPerMinute = 10 * 1024 * 1024; // ~10MB/min
    return Math.floor(this.totalBytesUploaded / bytesPerMinute);
  }

  /**
   * Format bytes for display (available for future use in progress reporting)
   */
  // @ts-expect-error Method available for future use
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Reset state for new upload
   */
  private reset(): void {
    this.session = null;
    this.uploadedParts = [];
    this.partNumber = 1;
    this.pendingBuffer = [];
    this.totalBytesUploaded = 0;
    this.isUploading = false;
    this.token = null;
    this.organizationId = null;
    this.callbacks = {};
  }
}

export const multipartUploadService = new MultipartUploadService();
export default multipartUploadService;
