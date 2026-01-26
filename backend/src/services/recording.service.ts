import { db } from '../config/database';
import { Knex } from 'knex';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs/promises';
import { v4 as _uuidv4 } from 'uuid';
// Import async context at top level (Fix #15 - avoid dynamic imports)
import { getAsyncContext } from '../middleware/asyncContext';
// SECURITY: File validation using magic bytes instead of trusting client MIME types
import { assertValidVideoFile } from '../utils/file-validation';
// Centralized S3 client and path generation (Fix #13 - consolidated S3 initialization)
import {
  getS3Client,
  resolveOrganizationBucket,
  generateTranscodeKey,
} from '../config/s3';
// Keep pricingService for feature access checks in uploadRecording
import pricingService from './pricing.service';
// Extracted services for better separation of concerns (Fix #1)
import { recordingStorageService, StorageUploadResult } from './recording-storage.service';
import { recordingQueueService } from './recording-queue.service';

// Multer File type definition
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

export interface Recording {
  id: string;
  task_id: string;
  user_id: string;
  organization_id: string;
  type: 'screen' | 'camera' | 'screen_camera' | 'live_session';
  status: 'initializing' | 'recording' | 'processing' | 'completed' | 'failed' | 'deleted';
  file_url?: string;
  thumbnail_url?: string;
  file_size_bytes?: string;
  file_format?: string;
  mime_type?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  started_at?: Date;
  ended_at?: Date;
  uploaded_at?: Date;
  processed_at?: Date;
  storage_provider?: string;
  storage_bucket?: string;
  storage_key?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
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

export interface UploadRecordingDto {
  file: MulterFile;
  recording_id: string;
}

// StorageUploadResult is now imported from recording-storage.service.ts

class RecordingService {
  private uploadDir = path.join(process.cwd(), 'uploads', 'recordings');

  constructor() {
    // Ensure local upload directory exists (S3 client is now centralized in config/s3.ts)
    this.ensureUploadDir();
  }

  /**
   * Get organization ID, preferring provided value, then falling back to async context
   */
  private getOrganizationId(provided?: string): string | undefined {
    if (provided) return provided;
    const context = getAsyncContext();
    return context?.organization_id;
  }

  private async ensureUploadDir(): Promise<void> {
    // Delegate to extracted storage service (Fix #1)
    return recordingStorageService.ensureUploadDir();
  }

  /**
   * Creates a new recording entry in the database with initializing status.
   * Does not upload any file; use uploadRecording after this call.
   * @param userId - The UUID of the user creating the recording, or null for external contributors
   * @param data - Recording metadata including task_id, duration, audio flag, and optional resolution
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns The newly created recording object
   * @throws {BadRequestError} If organization ID cannot be determined
   */
  async createRecording(userId: string | null, data: CreateRecordingDto, organizationId?: string): Promise<Recording> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      // Parse resolution if provided
      let width: number | undefined;
      let height: number | undefined;
      if (data.resolution) {
        const [w, h] = data.resolution.split('x').map(Number);
        width = w;
        height = h;
      }

      // Create recording entry
      const [recording] = await db('recordings')
        .insert({
          task_id: data.task_id,
          user_id: userId,
          organization_id: orgId,
          type: 'screen',
          status: 'initializing',
          mime_type: data.mime_type,
          duration_seconds: data.duration_seconds,
          width,
          height,
          fps: data.frame_rate,
          metadata: {
            browser_info: data.browser_info,
            has_audio: data.has_audio,
          },
          started_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Recording created: ${recording.id}`);
      return recording;
    } catch (error) {
      logger.error('Error creating recording:', error);
      throw error;
    }
  }

  /**
   * Uploads a recording file and updates all related database records atomically.
   * Uploads to S3/R2 if configured, otherwise falls back to local storage.
   * Automatically updates task status to 'submitted' and queues transcription if enabled.
   * @param userId - The UUID of the user uploading the file
   * @param recordingId - The UUID of the recording entry to update
   * @param file - The uploaded file from Multer middleware
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns The updated recording object with file URL and storage information
   * @throws {BadRequestError} If organization ID cannot be determined
   * @throws {NotFoundError} If the recording does not exist
   * @throws {ForbiddenError} If the user is not the owner of the recording
   */
  async uploadRecording(userId: string, recordingId: string, file: MulterFile, organizationId?: string): Promise<Recording> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Fetch org slug for storage path construction
    const org = await db('organizations').where('id', orgId).select('slug').first();
    const orgSlug = org?.slug || 'unknown';

    // Verify recording exists and belongs to user (outside transaction for early fail)
    const recording = await this.getRecordingById(recordingId, orgId);
    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Check ownership - either user_id or external_contributor_id must match
    const isOwner = recording.user_id === userId ||
                    (recording as any).external_contributor_id === userId;

    if (!isOwner) {
      throw new ForbiddenError('Unauthorized to upload to this recording');
    }

    // SECURITY: Validate file content using magic bytes, not client-provided MIME type
    // This prevents malicious file uploads disguised with fake MIME types
    try {
      let fileBuffer: Buffer;
      if (file.buffer) {
        fileBuffer = file.buffer;
      } else if (file.path) {
        // Read from disk if multer stored it there
        fileBuffer = await fs.readFile(file.path);
      } else {
        throw new BadRequestError('No file content available for validation');
      }

      // Validate that it's actually a video file
      const validationResult = await assertValidVideoFile(fileBuffer, file.mimetype);
      logger.info(`File validated for recording ${recordingId}: ${validationResult.detectedType}`);
    } catch (validationError) {
      logger.warn(`File validation failed for recording ${recordingId}:`, validationError);
      await this.markRecordingFailed(recordingId, 'File validation failed');
      throw validationError;
    }

    let uploadResult: StorageUploadResult;

    try {
      // Step 1: Upload file to storage (cannot be rolled back)
      uploadResult = await this.uploadToStorage(file, recording, recordingId, userId);
      logger.info(`File uploaded for recording ${recordingId}`, {
        provider: uploadResult.storageProvider,
        key: uploadResult.storageKey
      });
    } catch (uploadError) {
      // Mark recording as failed if upload fails
      await this.markRecordingFailed(recordingId, 'File upload failed');
      throw uploadError;
    }

    let updatedRecording: Recording;

    try {
      // Step 2: Use transaction for all database operations
      updatedRecording = await db.transaction(async (trx: Knex.Transaction) => {
        // Update recording with file information
        const [updated] = await trx('recordings')
          .where('id', recordingId)
          .update({
            status: 'completed',
            file_url: uploadResult.fileUrl,
            file_size_bytes: file.size.toString(),
            file_format: path.extname(file.originalname).slice(1),
            storage_provider: uploadResult.storageProvider,
            storage_bucket: uploadResult.storageBucket,
            storage_key: uploadResult.storageKey,
            uploaded_at: new Date(),
            ended_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        // Get task details for status update
        const task = await trx('tasks')
          .where('id', recording.task_id)
          .first();

        if (task) {
          // Update task status to 'submitted'
          // If no reviewer is assigned, assign the task creator as reviewer
          const taskUpdateData: Record<string, any> = {
            status: 'submitted',
            updated_at: new Date(),
          };

          if (!task.reviewed_by && task.created_by) {
            taskUpdateData.reviewed_by = task.created_by;
            logger.info(`Auto-assigned task creator ${task.created_by} as reviewer for task ${recording.task_id}`);
          }

          await trx('tasks')
            .where('id', recording.task_id)
            .update(taskUpdateData);
        }

        // Track storage usage within transaction (recording_file_sizes table)
        // Note: No ON CONFLICT needed since recording_id is not unique
        // (multiple files per recording for variants/thumbnails)
        await trx('recording_file_sizes')
          .insert({
            organization_id: orgId,
            recording_id: recordingId,
            file_size_bytes: file.size,
            file_type: file.mimetype,
            storage_provider: 's3',
            created_at: new Date(),
            updated_at: new Date(),
          });

        // Check for transcription feature access
        const org = await trx('organizations')
          .where('id', orgId)
          .select('subscription_tier')
          .first();

        const tier = org?.subscription_tier || 'free';
        const hasTranscription = pricingService.hasFeatureAccess(tier, 'basicTranscription');

        if (hasTranscription) {
          // Update recording to indicate transcription is pending
          // Note: The actual transcription_jobs record is created by the transcription
          // worker when it picks up the job from BullMQ. This avoids a race condition
          // where the deduplication check in queueTranscriptionIfEnabled() would skip
          // queueing if a DB record already exists.
          await trx('recordings')
            .where('id', recordingId)
            .update({
              transcription_status: 'pending',
              updated_at: new Date(),
            });
        }

        return updated;
      });

      logger.info(`Recording transaction completed: ${recordingId}`);

    } catch (dbError) {
      // Transaction failed - attempt to clean up uploaded file
      logger.error('Database transaction failed for recording upload:', dbError);

      // Try to clean up the uploaded file (best effort)
      await this.cleanupUploadedFile(uploadResult).catch(cleanupError => {
        logger.error('Failed to cleanup uploaded file after transaction failure:', cleanupError);
      });

      // Mark recording as failed
      await this.markRecordingFailed(recordingId, 'Database update failed');
      throw dbError;
    }

    // Step 3: Queue async operations (outside transaction - these can fail independently)
    await this.queuePostUploadOperations(
      recordingId,
      recording,
      uploadResult.fileUrl,
      userId,
      orgId,
      orgSlug
    );

    return updatedRecording;
  }

  /**
   * Upload file to storage (S3 or local filesystem)
   */
  private async uploadToStorage(
    file: MulterFile,
    recording: Recording,
    recordingId: string,
    userId: string
  ): Promise<StorageUploadResult> {
    // Delegate to extracted storage service (Fix #1)
    return recordingStorageService.uploadToStorage(file, recording, recordingId, userId);
  }

  /**
   * Clean up uploaded file (for rollback scenarios)
   */
  private async cleanupUploadedFile(uploadResult: StorageUploadResult): Promise<void> {
    // Delegate to extracted storage service (Fix #1)
    return recordingStorageService.cleanupUploadedFile(uploadResult);
  }

  /**
   * Mark a recording as failed
   */
  private async markRecordingFailed(recordingId: string, error: string): Promise<void> {
    try {
      await db('recordings')
        .where('id', recordingId)
        .update({
          status: 'failed',
          processing_error: error,
          updated_at: new Date(),
        });
    } catch (updateError) {
      logger.error('Failed to mark recording as failed:', updateError);
    }
  }

  /**
   * Queue post-upload async operations (notifications, transcription)
   * These are non-critical and run outside the main transaction
   */
  private async queuePostUploadOperations(
    recordingId: string,
    recording: Recording,
    fileUrl: string,
    userId: string,
    organizationId: string,
    orgSlug: string
  ): Promise<void> {
    // Delegate to extracted queue service (Fix #1)
    return recordingQueueService.queuePostUploadOperations(
      recordingId,
      recording,
      fileUrl,
      userId,
      organizationId,
      orgSlug
    );
  }

  /**
   * Retrieves a recording by its unique identifier.
   * @param id - The UUID of the recording to retrieve
   * @param organizationId - Optional organization ID for additional filtering
   * @returns The recording object if found, or null if not found
   */
  async getRecordingById(id: string, organizationId?: string): Promise<Recording | null> {
    const orgId = this.getOrganizationId(organizationId);

    try {
      let query = db('recordings').where('id', id);

      if (orgId) {
        query = query.where('organization_id', orgId);
      }

      const recording = await query.first();
      return recording || null;
    } catch (error) {
      logger.error('Error fetching recording:', error);
      throw error;
    }
  }

  /**
   * Retrieves a paginated list of recordings with optional filtering.
   * Results are limited to 100 per request for performance.
   * @param filters - Optional filters for task_id, user_id, status, or type
   * @param pagination - Cursor-based pagination with limit (max 100) and compound cursor
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns An object with recordings array and optional nextCursor/nextCursorId for pagination
   * @throws {BadRequestError} If organization ID cannot be determined
   */
  async getRecordings(
    filters?: {
      task_id?: string;
      user_id?: string;
      status?: string;
      type?: string;
    },
    pagination?: {
      limit?: number;
      cursor?: string;
      cursorId?: string; // Added for compound cursor (Fix #9)
    },
    organizationId?: string
  ): Promise<{ recordings: Recording[]; nextCursor?: string; nextCursorId?: string }> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      // Pagination with safety cap (Fix #7)
      const limit = Math.min(pagination?.limit || 50, 100);

      let query = db('recordings')
        .select('*')
        .where('organization_id', orgId)
        .orderBy([
          { column: 'created_at', order: 'desc' },
          { column: 'id', order: 'desc' }, // Secondary sort for stable cursor
        ]);

      if (filters?.task_id) {
        query = query.where('task_id', filters.task_id);
      }

      if (filters?.user_id) {
        query = query.where('user_id', filters.user_id);
      }

      if (filters?.status) {
        query = query.where('status', filters.status);
      }

      if (filters?.type) {
        query = query.where('type', filters.type);
      }

      // Compound cursor pagination for consistent results (Fix #9)
      if (pagination?.cursor && pagination?.cursorId) {
        const cursorValue = pagination.cursor;
        const cursorIdValue = pagination.cursorId;
        query = query.where(function(this: Knex.QueryBuilder) {
          this.where('created_at', '<', cursorValue)
            .orWhere(function(this: Knex.QueryBuilder) {
              this.where('created_at', '=', cursorValue)
                .andWhere('id', '<', cursorIdValue);
            });
        });
      } else if (pagination?.cursor) {
        // Fallback for simple cursor
        query = query.where('created_at', '<', pagination.cursor);
      }

      // Fetch one extra to determine if there are more results
      const recordings = await query.limit(limit + 1);

      // Check if there are more results
      const hasMore = recordings.length > limit;
      if (hasMore) {
        recordings.pop();
      }

      // Determine next cursor (compound)
      const lastRecord = recordings[recordings.length - 1];
      const nextCursor = hasMore && lastRecord ? lastRecord.created_at : undefined;
      const nextCursorId = hasMore && lastRecord ? lastRecord.id : undefined;

      return { recordings, nextCursor, nextCursorId };
    } catch (error) {
      logger.error('Error fetching recordings:', error);
      throw error;
    }
  }

  /**
   * Soft-deletes a recording and removes its file from storage.
   * Users can only delete their own recordings.
   * @param userId - The UUID of the user attempting the deletion
   * @param recordingId - The UUID of the recording to delete
   * @param organizationId - Optional organization ID for additional filtering
   * @throws {NotFoundError} If the recording does not exist
   * @throws {ForbiddenError} If the user is not the owner of the recording
   */
  async deleteRecording(userId: string, recordingId: string, organizationId?: string): Promise<void> {
    const recording = await this.getRecordingById(recordingId, organizationId);

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Check permission (user can delete their own recordings, admins can delete any)
    if (recording.user_id !== userId) {
      throw new ForbiddenError('Unauthorized to delete this recording');
    }

    try {
      // Use transaction for database operations
      await db.transaction(async (trx) => {
        // Delete file from storage (outside transaction, but before DB changes)
        const s3Client = getS3Client();
        if (recording.storage_provider === 's3' && s3Client && recording.storage_bucket && recording.storage_key) {
          const command = new DeleteObjectCommand({
            Bucket: recording.storage_bucket,
            Key: recording.storage_key,
          });
          await s3Client.send(command);
        } else if (recording.storage_provider === 'local' && recording.storage_key) {
          const filePath = path.join(this.uploadDir, recording.storage_key);
          await fs.unlink(filePath).catch(err => {
            logger.warn(`Failed to delete local file: ${filePath}`, err);
          });
        }

        // Update recording status to deleted (soft delete)
        await trx('recordings')
          .where('id', recordingId)
          .where('organization_id', recording.organization_id)
          .update({
            status: 'deleted',
            file_url: null,
            updated_at: new Date(),
          });

        // Update storage metrics (delete from recording_file_sizes)
        const fileSizeBytes = recording.file_size_bytes ? Number(recording.file_size_bytes) : 0;
        if (fileSizeBytes > 0) {
          await trx('recording_file_sizes')
            .where('recording_id', recordingId)
            .del();
        }
      });

      logger.info(`Recording deleted: ${recordingId}`);
    } catch (error) {
      logger.error('Error deleting recording:', error);
      throw error;
    }
  }

  /**
   * Hard deletes a recording and ALL associated files from storage.
   * This includes: main recording file, transcoded variants, thumbnails.
   * Use this for complete cleanup (e.g., when deleting a task).
   * @param recordingId - The UUID of the recording to delete
   * @param trx - Optional transaction to use
   */
  async hardDeleteRecording(recordingId: string, trx?: Knex.Transaction): Promise<void> {
    const query = trx || db;

    const recording = await query('recordings')
      .where('id', recordingId)
      .first();

    if (!recording) {
      logger.warn(`Recording not found for hard delete: ${recordingId}`);
      return;
    }

    try {
      // Fetch org slug for path construction
      const org = await db('organizations')
        .where('id', recording.organization_id)
        .select('slug')
        .first();
      const orgSlug = org?.slug || 'unknown';

      // Delete all files from S3/R2 storage
      const s3Client = getS3Client();
      if (s3Client && process.env.AWS_S3_BUCKET) {
        // Resolve bucket from recording or organization
        const bucket = recording.storage_bucket ||
          await resolveOrganizationBucket(recording.organization_id);

        // Delete all objects with the org-scoped recording prefix (includes variants, thumbnails)
        // Path: {orgSlug}/recordings/{recordingId}/
        const prefix = `${orgSlug}/recordings/${recordingId}/`;
        await this.deleteS3Prefix(bucket, prefix);

        // Also delete the main recording file if it has a different path structure
        if (recording.storage_key && !recording.storage_key.startsWith(prefix)) {
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: bucket,
              Key: recording.storage_key,
            }));
          } catch (err) {
            logger.warn(`Failed to delete main recording file: ${recording.storage_key}`, err);
          }
        }
      } else if (recording.storage_provider === 'local' && recording.storage_key) {
        // Delete local file
        const filePath = path.join(this.uploadDir, recording.storage_key);
        await fs.unlink(filePath).catch(() => {});
      }

      // Delete all related database records
      await query('recording_variants').where('recording_id', recordingId).del();
      await query('analysis_step_scores')
        .whereIn('analysis_job_id',
          query('analysis_jobs').select('id').where('recording_id', recordingId)
        ).del();
      await query('analysis_results').where('recording_id', recordingId).del();
      await query('analysis_jobs').where('recording_id', recordingId).del();
      await query('transcription_jobs').where('recording_id', recordingId).del();
      await query('recording_file_sizes').where('recording_id', recordingId).del();
      await query('recordings').where('id', recordingId).del();

      logger.info(`Recording hard deleted with all files: ${recordingId}`);
    } catch (error) {
      logger.error(`Error hard deleting recording ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Delete all objects in S3 with a given prefix
   */
  private async deleteS3Prefix(bucket: string, prefix: string): Promise<void> {
    // Delegate to extracted storage service (Fix #1)
    return recordingStorageService.deleteS3Prefix(bucket, prefix);
  }

  /**
   * Hard delete all recordings for a task (used when deleting a task)
   * @param taskId - The task ID
   * @param trx - Optional transaction
   */
  async hardDeleteAllRecordingsForTask(taskId: string, trx?: Knex.Transaction): Promise<void> {
    const query = trx || db;

    const recordings = await query('recordings')
      .where('task_id', taskId)
      .select('id');

    logger.info(`Hard deleting ${recordings.length} recordings for task ${taskId}`);

    for (const recording of recordings) {
      await this.hardDeleteRecording(recording.id, trx);
    }
  }

  /**
   * Generates a download URL for a completed recording.
   * For S3 storage, creates a signed URL with 1-hour expiry and download disposition.
   * @param recordingId - The UUID of the recording to download
   * @returns A URL for downloading the recording file
   * @throws {NotFoundError} If the recording does not exist
   * @throws {BadRequestError} If the recording is not completed or file is unavailable
   */
  async getRecordingDownloadUrl(recordingId: string): Promise<string> {
    const recording = await this.getRecordingById(recordingId);

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    if (recording.status !== 'completed') {
      throw new BadRequestError('Recording is not ready for download');
    }

    // If using S3, generate a new signed URL
    const s3Client = getS3Client();
    if (recording.storage_provider === 's3' && s3Client && recording.storage_bucket && recording.storage_key) {
      const command = new GetObjectCommand({
        Bucket: recording.storage_bucket,
        Key: recording.storage_key,
        ResponseContentDisposition: `attachment; filename="recording-${recordingId}.${recording.file_format || 'webm'}"`,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
      return url;
    }

    // For local storage, return the file URL
    if (recording.file_url) {
      return recording.file_url;
    }

    throw new BadRequestError('Recording file not available');
  }

  /**
   * Generates a playback URL for streaming a completed recording.
   * For S3 storage, creates a signed URL with 24-hour expiry for streaming.
   * @param recordingId - The UUID of the recording to play
   * @returns A URL for streaming the recording file
   * @throws {NotFoundError} If the recording does not exist
   * @throws {BadRequestError} If the recording is not completed or file is unavailable
   */
  async getRecordingPlaybackUrl(recordingId: string): Promise<string> {
    const recording = await this.getRecordingById(recordingId);

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    if (recording.status !== 'completed') {
      throw new BadRequestError('Recording is not ready for playback');
    }

    // Check for transcoded MP4 variants first (better seeking support with faststart)
    // Prefer original quality, then high, medium, low
    const qualityOrder = ['original', 'high', 'medium', 'low'];
    const variants = await db('recording_variants')
      .where('recording_id', recordingId)
      .where('format', 'mp4')
      .where('is_ready', true)
      .orderByRaw(`CASE quality ${qualityOrder.map((q, i) => `WHEN '${q}' THEN ${i}`).join(' ')} ELSE 999 END`);

    const s3Client = getS3Client();
    if (variants.length > 0 && s3Client && recording.storage_bucket) {
      const variant = variants[0];

      // Fetch org slug for path construction
      const org = await db('organizations')
        .where('id', recording.organization_id)
        .select('slug')
        .first();
      const orgSlug = org?.slug || 'unknown';

      // Reconstruct the S3 key for the variant using org-scoped path
      const variantKey = generateTranscodeKey(
        orgSlug,
        recordingId,
        `${recordingId}_${variant.quality}`,
        variant.format
      );

      const command = new GetObjectCommand({
        Bucket: recording.storage_bucket,
        Key: variantKey,
      });
      
      try {
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 * 24 });
        logger.info(`Generated playback URL for transcoded variant ${recordingId}@${variant.quality}`);
        return url;
      } catch (error) {
        // If variant file doesn't exist, fall through to original
        logger.warn(`Failed to get variant URL for ${recordingId}@${variant.quality}, falling back to original`, { error });
      }
    }

    // Fall back to original file if no transcoded variants available
    // If using S3/R2, generate a fresh signed URL for streaming
    if (recording.storage_provider === 's3' && s3Client && recording.storage_bucket && recording.storage_key) {
      const command = new GetObjectCommand({
        Bucket: recording.storage_bucket,
        Key: recording.storage_key,
      });

      // Longer expiration for playback (24 hours)
      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 * 24 });
      logger.info(`Generated playback URL for original recording ${recordingId}`);
      return url;
    }

    // For local storage, return the file URL
    if (recording.file_url) {
      return recording.file_url;
    }

    throw new BadRequestError('Recording file not available');
  }

  /**
   * Updates the status of a recording and tracks processing timestamps.
   * Automatically sets uploaded_at, processed_at, or processing_error as appropriate.
   * @param recordingId - The UUID of the recording to update
   * @param status - The new status (initializing, recording, processing, completed, failed, deleted)
   * @param error - Optional error message when status is 'failed'
   * @param organizationId - Optional organization ID for additional filtering
   */
  async updateRecordingStatus(recordingId: string, status: Recording['status'], error?: string, organizationId?: string): Promise<void> {
    const orgId = this.getOrganizationId(organizationId);

    try {
      const updateData: Record<string, any> = {
        status,
        updated_at: new Date(),
      };

      if (status === 'processing') {
        updateData.uploaded_at = new Date();
      }

      if (status === 'completed') {
        updateData.processed_at = new Date();
      }

      if (status === 'failed' && error) {
        updateData.processing_error = error;
      }

      let query = db('recordings').where('id', recordingId);
      if (orgId) {
        query = query.where('organization_id', orgId);
      }

      await query.update(updateData);

      logger.info(`Recording status updated: ${recordingId} -> ${status}`);
    } catch (error) {
      logger.error('Error updating recording status:', error);
      throw error;
    }
  }

  /**
   * Retrieves all non-deleted recordings for a specific task.
   * Results are ordered by creation date (newest first).
   * @param taskId - The UUID of the task to get recordings for
   * @param organizationId - The organization ID (falls back to async context if not provided)
   * @returns An array of recording objects, excluding those with 'deleted' status
   * @throws {BadRequestError} If organization ID cannot be determined
   */
  async getTaskRecordings(taskId: string, organizationId?: string): Promise<Recording[]> {
    const orgId = this.getOrganizationId(organizationId);

    if (!orgId) {
      throw new BadRequestError('Organization ID is required');
    }

    try {
      const recordings = await db('recordings')
        .where('task_id', taskId)
        .where('organization_id', orgId)
        .where('status', '!=', 'deleted')
        .orderBy('created_at', 'desc');

      return recordings;
    } catch (error) {
      logger.error('Error fetching task recordings:', error);
      throw error;
    }
  }
}

export const recordingService = new RecordingService();
export default recordingService;
