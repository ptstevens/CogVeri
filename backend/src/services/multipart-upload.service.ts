import { db } from '../config/database';
import { NotFoundError, BadRequestError, InternalServerError, ServiceUnavailableError } from '../utils/AppError';
import { logger } from '../utils/logger';
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import storageService from './storage.service';
import { emailService } from './email.service';
import pricingService from './pricing.service';
import { transcriptionQueueHelpers } from '../queues/definitions/transcription.queue';
import { transcodeQueueHelpers } from '../queues/definitions/transcode.queue';
import { TranscodeQuality } from '../queues/types/job-types';
// SECURITY: File validation using magic bytes instead of trusting client MIME types
import { validateVideoFile } from '../utils/file-validation';
// Centralized S3 client and path generation (Fix #13 - consolidated S3 initialization)
import { getS3Client, isS3Available, getS3Bucket, resolveOrganizationBucket, generateRecordingKey } from '../config/s3';

// Types
export interface UploadSession {
  id: string;
  task_id: string;
  organization_id: string;
  user_id: string | null;
  external_contributor_id: string | null;
  recording_id: string | null;
  s3_upload_id: string;
  s3_bucket: string;
  s3_key: string;
  total_parts: number;
  total_bytes_uploaded: string;
  uploaded_parts: UploadedPart[];
  mime_type: string;
  duration_seconds: number;
  has_audio: boolean;
  resolution: string | null;
  frame_rate: number | null;
  browser_info: string | null;
  status: 'active' | 'completing' | 'completed' | 'failed' | 'expired' | 'aborted';
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface InitiateUploadDto {
  taskId: string;
  mimeType: string;
  hasAudio?: boolean;
  resolution?: string;
  frameRate?: number;
  browserInfo?: string;
}

export interface CompleteUploadDto {
  sessionId: string;
  parts: Array<{ partNumber: number; etag: string }>;
  durationSeconds: number;
  hasAudio?: boolean;
}

export interface InitiateUploadResponse {
  sessionId: string;
  uploadId: string;
  key: string;
  bucket: string;
}

export interface PresignPartResponse {
  presignedUrl: string;
  partNumber: number;
  expiresAt: string;
}

class MultipartUploadService {
  // S3 client is now centralized in config/s3.ts (Fix #13)

  /**
   * Check if multipart upload is available (S3/R2 configured)
   */
  isAvailable(): boolean {
    return isS3Available() && getS3Bucket() !== undefined;
  }

  /**
   * Initiate a new multipart upload session
   */
  async initiateUpload(
    userId: string | null,
    data: InitiateUploadDto,
    organizationId: string,
    externalContributorId?: string
  ): Promise<InitiateUploadResponse> {
    const s3Client = getS3Client();
    const bucket = getS3Bucket();
    if (!s3Client || !bucket) {
      throw new BadRequestError('Multipart upload not available - S3/R2 not configured');
    }

    // Verify task exists and belongs to organization
    const task = await db('tasks')
      .where('id', data.taskId)
      .where('organization_id', organizationId)
      .first();

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Fetch org slug for path construction
    const org = await db('organizations')
      .where('id', organizationId)
      .select('slug')
      .first();
    const orgSlug = org?.slug || 'unknown';

    // Resolve bucket (now returns the single environment bucket)
    const orgBucket = await resolveOrganizationBucket(organizationId);

    // Generate unique recording ID and org-scoped S3 key
    const recordingId = uuidv4();
    const fileExtension = this.getFileExtension(data.mimeType);
    // Path: {orgSlug}/recordings/{taskId}/{recordingId}/video.{ext}
    const s3Key = generateRecordingKey(orgSlug, data.taskId, recordingId, `video.${fileExtension}`);

    try {
      // Create multipart upload in S3/R2
      const createCommand = new CreateMultipartUploadCommand({
        Bucket: orgBucket,
        Key: s3Key,
        ContentType: data.mimeType,
        Metadata: {
          task_id: data.taskId,
          recording_id: recordingId,
          organization_id: organizationId,
          org_slug: orgSlug,
        },
      });

      const response = await s3Client.send(createCommand);
      const uploadId = response.UploadId;

      if (!uploadId) {
        throw new Error('Failed to get upload ID from S3');
      }

      logger.info(`Multipart upload initiated: ${uploadId} for recording ${recordingId}`, {
        bucket: orgBucket,
      });

      // Create recording entry with org-specific bucket
      const [_recording] = await db('recordings')
        .insert({
          id: recordingId,
          task_id: data.taskId,
          user_id: userId,
          external_contributor_id: externalContributorId || null,
          organization_id: organizationId,
          type: 'screen',
          status: 'initializing',
          storage_bucket: orgBucket,
          mime_type: data.mimeType,
          metadata: {
            browser_info: data.browserInfo,
            has_audio: data.hasAudio || false,
            multipart: true,
          },
          started_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      // Create upload session
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 4); // Sessions expire after 4 hours (cleanup runs hourly)

      const [session] = await db('upload_sessions')
        .insert({
          task_id: data.taskId,
          organization_id: organizationId,
          user_id: userId,
          external_contributor_id: externalContributorId || null,
          recording_id: recordingId,
          s3_upload_id: uploadId,
          s3_bucket: orgBucket,
          s3_key: s3Key,
          mime_type: data.mimeType,
          has_audio: data.hasAudio || false,
          resolution: data.resolution || null,
          frame_rate: data.frameRate || null,
          // browser_info is JSONB column - must be valid JSON object, not plain string
          browser_info: data.browserInfo ? { userAgent: data.browserInfo } : null,
          status: 'active',
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
          last_activity_at: new Date(),
        })
        .returning('*');

      return {
        sessionId: session.id,
        uploadId: uploadId,
        key: s3Key,
        bucket: orgBucket,
      };
    } catch (error) {
      logger.error('Failed to initiate multipart upload:', error);
      throw error;
    }
  }

  /**
   * Generate a presigned URL for uploading a specific part
   */
  async getPresignedUrl(
    sessionId: string,
    partNumber: number,
    organizationId: string
  ): Promise<PresignPartResponse> {
    const s3Client = getS3Client();
    if (!s3Client) {
      throw new BadRequestError('Multipart upload not available');
    }

    // Get session
    const session = await this.getSession(sessionId, organizationId);

    if (session.status !== 'active') {
      throw new BadRequestError(`Upload session is ${session.status}, cannot get presigned URL`);
    }

    // Generate presigned URL for UploadPart
    const command = new UploadPartCommand({
      Bucket: session.s3_bucket,
      Key: session.s3_key,
      UploadId: session.s3_upload_id,
      PartNumber: partNumber,
    });

    // URL expires in 1 hour
    const expiresIn = 3600;
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    // Update last activity
    await db('upload_sessions')
      .where('id', sessionId)
      .update({
        last_activity_at: new Date(),
        updated_at: new Date(),
      });

    logger.info(`Generated presigned URL for session ${sessionId}, part ${partNumber}`);

    return {
      presignedUrl,
      partNumber,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Register a successfully uploaded part
   */
  async registerPart(
    sessionId: string,
    partNumber: number,
    etag: string,
    size: number,
    organizationId: string
  ): Promise<void> {
    const session = await this.getSession(sessionId, organizationId);

    if (session.status !== 'active') {
      throw new BadRequestError(`Upload session is ${session.status}`);
    }

    // Get current parts
    const uploadedParts: UploadedPart[] = session.uploaded_parts || [];

    // Check if part already registered
    const existingIndex = uploadedParts.findIndex(p => p.partNumber === partNumber);
    if (existingIndex >= 0) {
      // Update existing part (in case of retry)
      uploadedParts[existingIndex] = { partNumber, etag, size };
    } else {
      // Add new part
      uploadedParts.push({ partNumber, etag, size });
    }

    // Sort by part number
    uploadedParts.sort((a, b) => a.partNumber - b.partNumber);

    // Calculate total bytes
    const totalBytes = uploadedParts.reduce((sum, p) => sum + p.size, 0);

    // Update session
    await db('upload_sessions')
      .where('id', sessionId)
      .update({
        uploaded_parts: JSON.stringify(uploadedParts),
        total_parts: uploadedParts.length,
        total_bytes_uploaded: totalBytes.toString(),
        last_activity_at: new Date(),
        updated_at: new Date(),
      });

    logger.info(`Registered part ${partNumber} for session ${sessionId} (${size} bytes)`);
  }

  /**
   * Ensure ETag is properly quoted (required by R2/S3)
   * ETags must be enclosed in double quotes for the CompleteMultipartUpload API
   */
  private ensureETagQuoted(etag: string): string {
    if (!etag) return etag;
    // Remove any existing quotes first, then add them back
    const cleanEtag = etag.replace(/^"|"$/g, '');
    return `"${cleanEtag}"`;
  }

  /**
   * Complete a multipart upload
   */
  async completeUpload(
    data: CompleteUploadDto,
    organizationId: string
  ): Promise<{ recording: any; fileUrl: string }> {
    const s3Client = getS3Client();
    if (!s3Client) {
      throw new BadRequestError('Multipart upload not available');
    }

    const session = await this.getSession(data.sessionId, organizationId);

    // Allow completion if status is 'active' or 'completing' (for retries after transient failures)
    if (session.status !== 'active' && session.status !== 'completing') {
      throw new BadRequestError(`Upload session is ${session.status}, cannot complete`);
    }

    // Always use session-registered parts as the source of truth
    // The session parts are registered via registerPart() after each successful upload
    const sessionParts = session.uploaded_parts || [];

    if (sessionParts.length === 0) {
      // Fall back to request parts if no session parts (shouldn't happen normally)
      if (!data.parts || data.parts.length === 0) {
        throw new BadRequestError('No parts uploaded - cannot complete multipart upload');
      }
      logger.warn(`No session parts found, using ${data.parts.length} parts from request for session ${data.sessionId}`);
    } else {
      // Prefer session parts - they are verified by the backend
      data.parts = sessionParts.map((p: UploadedPart) => ({
        partNumber: p.partNumber,
        etag: p.etag,
      }));
      logger.info(`Using ${data.parts.length} session-registered parts for session ${data.sessionId}`);
    }

    // Validate we have at least one part
    logger.info(`Completing multipart upload ${session.s3_upload_id} with ${data.parts.length} parts`);

    // Mark as completing
    await db('upload_sessions')
      .where('id', data.sessionId)
      .update({
        status: 'completing',
        updated_at: new Date(),
      });

    try {
      // Sort parts by part number (required by S3)
      const sortedParts = [...data.parts].sort((a, b) => a.partNumber - b.partNumber);

      // Log parts for debugging - use info level so it's visible in production
      logger.info('Parts for completion:', {
        sessionId: data.sessionId,
        uploadId: session.s3_upload_id,
        partsCount: sortedParts.length,
        parts: sortedParts.map(p => ({
          partNumber: p.partNumber,
          etagRaw: p.etag,
          etagQuoted: this.ensureETagQuoted(p.etag),
        })),
      });

      // Complete multipart upload in S3/R2
      // Note: R2/S3 requires ETags to be properly quoted
      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: session.s3_bucket,
        Key: session.s3_key,
        UploadId: session.s3_upload_id,
        MultipartUpload: {
          Parts: sortedParts.map(p => ({
            PartNumber: p.partNumber,
            ETag: this.ensureETagQuoted(p.etag),
          })),
        },
      });

      await s3Client.send(completeCommand);
      logger.info(`Multipart upload completed: ${session.s3_upload_id}`);

      // SECURITY: Validate file content using magic bytes after upload completes
      // Download the first chunk to verify it's actually a video file
      try {
        const headCommand = new GetObjectCommand({
          Bucket: session.s3_bucket,
          Key: session.s3_key,
          Range: 'bytes=0-8191', // First 8KB is enough for magic byte detection
        });
        const headResponse = await s3Client.send(headCommand);

        if (headResponse.Body) {
          const chunks: Uint8Array[] = [];
          // @ts-ignore - Body is a readable stream
          for await (const chunk of headResponse.Body) {
            chunks.push(chunk);
          }
          const fileHead = Buffer.concat(chunks);

          const validationResult = await validateVideoFile(fileHead);
          if (!validationResult.isValid) {
            // Check if validation itself failed (library error) vs file being definitely invalid
            if (validationResult.validationFailed) {
              // Validation process failed - don't reject the upload, just log
              logger.warn(`Could not validate file for multipart upload ${session.s3_upload_id} (validation error):`, {
                error: validationResult.error,
                sessionId: data.sessionId,
              });
              // Continue with upload - better to allow potentially valid files than reject valid ones
            } else {
              // File was validated but is definitely not a valid video type
              logger.warn(`File validation failed for multipart upload ${session.s3_upload_id}:`, {
                detectedType: validationResult.detectedType,
                error: validationResult.error,
                sessionId: data.sessionId,
              });

              // Delete the invalid file from S3
              const deleteCommand = new DeleteObjectCommand({
                Bucket: session.s3_bucket,
                Key: session.s3_key,
              });
              await s3Client.send(deleteCommand);
              logger.info(`Deleted invalid file from S3: ${session.s3_key}`);

              // Mark session as failed
              await db('upload_sessions')
                .where('id', data.sessionId)
                .update({
                  status: 'failed',
                  error_message: `Invalid file type: ${validationResult.error}`,
                  updated_at: new Date(),
                });

              throw new BadRequestError(
                `Invalid file type detected. Expected video but found: ${validationResult.detectedType || 'unknown'}`
              );
            }
          } else {
            logger.info(`File validated for multipart upload: ${validationResult.detectedType}`);
          }
        }
      } catch (validationError) {
        if (validationError instanceof BadRequestError) {
          throw validationError;
        }
        // Log but don't fail on validation read errors - the file might still be valid
        logger.warn(`Could not validate multipart upload ${session.s3_upload_id}:`, validationError);
      }

      // Generate signed URL for access
      const getCommand = new GetObjectCommand({
        Bucket: session.s3_bucket,
        Key: session.s3_key,
      });
      // SECURITY: Reduced from 7 days to 4 hours - regenerate URLs as needed
      const fileUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 * 4 });

      // Calculate total size
      const totalSize = (session.uploaded_parts || []).reduce(
        (sum: number, p: UploadedPart) => sum + p.size,
        0
      );

      // Parse resolution
      let width: number | undefined;
      let height: number | undefined;
      if (session.resolution) {
        const [w, h] = session.resolution.split('x').map(Number);
        width = w;
        height = h;
      }

      // Update recording with file information
      const [updatedRecording] = await db('recordings')
        .where('id', session.recording_id)
        .update({
          status: 'completed',
          file_url: fileUrl,
          file_size_bytes: totalSize.toString(),
          file_format: this.getFileExtension(session.mime_type),
          duration_seconds: data.durationSeconds,
          width,
          height,
          fps: session.frame_rate,
          storage_provider: 's3',
          storage_bucket: session.s3_bucket,
          storage_key: session.s3_key,
          uploaded_at: new Date(),
          ended_at: new Date(),
          updated_at: new Date(),
          metadata: {
            browser_info: session.browser_info,
            has_audio: data.hasAudio ?? session.has_audio,
            multipart: true,
            parts_count: data.parts.length,
          },
        })
        .returning('*');

      // Update session as completed
      await db('upload_sessions')
        .where('id', data.sessionId)
        .update({
          status: 'completed',
          duration_seconds: data.durationSeconds,
          has_audio: data.hasAudio ?? session.has_audio,
          completed_at: new Date(),
          updated_at: new Date(),
        });

      // Track storage usage
      try {
        await storageService.trackRecordingSize(session.recording_id!, organizationId, totalSize);
        logger.info(`Storage metrics updated for recording ${session.recording_id}`);
      } catch (storageError) {
        logger.error('Failed to update storage metrics:', storageError);
      }

      // Send notification to reviewer
      try {
        const task = await db('tasks')
          .where('id', session.task_id)
          .first();

        if (task && task.reviewed_by) {
          const reviewer = await db('users')
            .where('id', task.reviewed_by)
            .first();

          let assignee = await db('users')
            .where('id', session.user_id)
            .first();

          if (!assignee && session.external_contributor_id) {
            const contributor = await db('external_contributors')
              .where('id', session.external_contributor_id)
              .first();

            if (contributor) {
              assignee = {
                id: contributor.id,
                name: `${contributor.first_name || ''} ${contributor.last_name || ''}`.trim() || contributor.email,
                email: contributor.email,
              };
            }
          }

          if (reviewer && assignee) {
            await emailService.sendReviewNotification(
              { ...task, recording_url: fileUrl },
              reviewer,
              assignee
            );
            logger.info(`Review notification sent for recording ${session.recording_id}`);
          }
        }

        // Update task status to 'submitted'
        const updateData: any = {
          status: 'submitted',
          updated_at: new Date(),
        };

        if (!task.reviewed_by && task.created_by) {
          updateData.reviewed_by = task.created_by;
        }

        await db('tasks')
          .where('id', session.task_id)
          .update(updateData);

      } catch (notificationError) {
        logger.error('Failed to send notification:', notificationError);
      }

      logger.info(`Recording ${session.recording_id} completed via multipart upload`);

      // Get organization's subscription tier and slug for post-upload operations
      const org = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'slug')
        .first();

      const tier = org?.subscription_tier || 'free';
      const orgSlug = org?.slug || 'unknown';

      // Auto-start transcription if organization has access to the feature
      try {
        const hasTranscription = pricingService.hasFeatureAccess(tier, 'basicTranscription');

        if (hasTranscription) {
          // Queue transcription job with org slug for storage paths
          await transcriptionQueueHelpers.queueTranscription({
            recordingId: session.recording_id!,
            fileUrl,
            organizationId,
            orgSlug,
            userId: session.user_id || undefined,
            language: 'auto',
            options: { includeTimestamps: true },
          });

          // Update recording status to pending transcription
          await db('recordings')
            .where('id', session.recording_id)
            .update({ transcription_status: 'pending' });

          logger.info(`Auto-transcription queued for recording ${session.recording_id}`);
        } else {
          logger.info(`Transcription skipped for recording ${session.recording_id} - feature not available on ${tier} tier`);
        }
      } catch (transcriptionError) {
        // Don't fail the upload if transcription queueing fails
        logger.error('Failed to queue auto-transcription:', transcriptionError);
      }

      // Queue MP4 transcoding with faststart for instant seeking
      // This is essential for video playback - without it, timeline seeking won't work
      try {
        const transcodeJob = await transcodeQueueHelpers.queueTranscode({
          recordingId: session.recording_id!,
          inputFileUrl: fileUrl,
          organizationId,
          orgSlug,
          quality: TranscodeQuality.MEDIUM,
          outputFormat: 'mp4',
        });
        logger.info(`Transcode job queued for recording ${session.recording_id}: jobId=${transcodeJob?.id}`);
      } catch (transcodeError) {
        // Don't fail the upload if transcode queueing fails
        logger.error('Failed to queue transcode:', transcodeError);
      }

      return {
        recording: updatedRecording,
        fileUrl,
      };
    } catch (error: any) {
      // Extract meaningful error message from S3/R2 errors
      let errorMessage = 'Complete upload failed';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Check for AWS SDK specific error details
      if (error?.Code) {
        errorMessage = `S3 Error: ${error.Code} - ${error.message || error.Message}`;
      }

      // Determine if this is a transient error (can be retried)
      const httpStatusCode = error?.$metadata?.httpStatusCode;
      const isTransientError = httpStatusCode >= 500 ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'NetworkingError';

      if (error?.$metadata) {
        logger.error('S3 Error metadata:', {
          httpStatusCode: error.$metadata.httpStatusCode,
          requestId: error.$metadata.requestId,
          cfId: error.$metadata.cfId,
          isTransient: isTransientError,
        });
      }

      logger.error('Failed to complete multipart upload:', {
        error: errorMessage,
        sessionId: data.sessionId,
        uploadId: session.s3_upload_id,
        partsCount: data.parts.length,
        bucket: session.s3_bucket,
        key: session.s3_key,
        isTransient: isTransientError,
      });

      if (isTransientError) {
        // For transient errors, keep status as 'completing' to allow retries
        // Don't update the session status - let it remain as 'completing'
        logger.info(`Transient S3 error for session ${data.sessionId}, allowing retry`);

        // Re-throw with 503 status to signal frontend can retry
        throw new ServiceUnavailableError(`Upload completion temporarily failed: ${errorMessage}`, {
          isRetryable: true,
          sessionId: data.sessionId,
        });
      }

      // For permanent errors, mark session as failed
      await db('upload_sessions')
        .where('id', data.sessionId)
        .update({
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date(),
        });

      // Update recording status
      await db('recordings')
        .where('id', session.recording_id)
        .update({
          status: 'failed',
          processing_error: errorMessage,
          updated_at: new Date(),
        });

      // Re-throw with proper AppError so the message is preserved in production
      throw new InternalServerError(`Upload completion failed: ${errorMessage}`);
    }
  }

  /**
   * Abort a multipart upload
   */
  async abortUpload(sessionId: string, organizationId: string): Promise<void> {
    const s3Client = getS3Client();
    if (!s3Client) {
      throw new BadRequestError('Multipart upload not available');
    }

    const session = await this.getSession(sessionId, organizationId);

    if (session.status === 'completed') {
      throw new BadRequestError('Cannot abort completed upload');
    }

    try {
      // Abort in S3
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: session.s3_bucket,
        Key: session.s3_key,
        UploadId: session.s3_upload_id,
      });

      await s3Client.send(abortCommand);
      logger.info(`Multipart upload aborted: ${session.s3_upload_id}`);

      // Update session
      await db('upload_sessions')
        .where('id', sessionId)
        .update({
          status: 'aborted',
          updated_at: new Date(),
        });

      // Update recording status
      if (session.recording_id) {
        await db('recordings')
          .where('id', session.recording_id)
          .update({
            status: 'deleted',
            updated_at: new Date(),
          });
      }
    } catch (error) {
      logger.error('Failed to abort multipart upload:', error);
      throw error;
    }
  }

  /**
   * Get upload session status
   */
  async getSessionStatus(sessionId: string, organizationId: string): Promise<UploadSession> {
    return this.getSession(sessionId, organizationId);
  }

  /**
   * Get active sessions for a user (for resume functionality)
   */
  async getActiveSessions(
    userId: string | null,
    organizationId: string,
    externalContributorId?: string
  ): Promise<UploadSession[]> {
    let query = db('upload_sessions')
      .where('organization_id', organizationId)
      .where('status', 'active')
      .where('expires_at', '>', new Date());

    if (userId) {
      query = query.where('user_id', userId);
    } else if (externalContributorId) {
      query = query.where('external_contributor_id', externalContributorId);
    }

    return query.orderBy('created_at', 'desc');
  }

  /**
   * Cleanup expired and abandoned upload sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const s3Client = getS3Client();
    if (!s3Client) {
      return 0;
    }

    // Find expired active sessions
    const expiredSessions = await db('upload_sessions')
      .whereIn('status', ['active', 'completing'])
      .where('expires_at', '<', new Date())
      .limit(100);

    let cleanedCount = 0;

    for (const session of expiredSessions) {
      try {
        // Abort in S3
        const abortCommand = new AbortMultipartUploadCommand({
          Bucket: session.s3_bucket,
          Key: session.s3_key,
          UploadId: session.s3_upload_id,
        });

        await s3Client.send(abortCommand);

        // Update session
        await db('upload_sessions')
          .where('id', session.id)
          .update({
            status: 'expired',
            updated_at: new Date(),
          });

        // Update recording
        if (session.recording_id) {
          await db('recordings')
            .where('id', session.recording_id)
            .update({
              status: 'deleted',
              processing_error: 'Upload session expired',
              updated_at: new Date(),
            });
        }

        cleanedCount++;
        logger.info(`Cleaned up expired upload session: ${session.id}`);
      } catch (error) {
        logger.error(`Failed to cleanup session ${session.id}:`, error);
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired upload sessions`);
    }

    return cleanedCount;
  }

  /**
   * Get session with validation
   */
  private async getSession(sessionId: string, organizationId: string): Promise<UploadSession> {
    const session = await db('upload_sessions')
      .where('id', sessionId)
      .where('organization_id', organizationId)
      .first();

    if (!session) {
      throw new NotFoundError('Upload session not found');
    }

    // Parse uploaded_parts if it's a string
    if (typeof session.uploaded_parts === 'string') {
      session.uploaded_parts = JSON.parse(session.uploaded_parts);
    }

    return session;
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      // MP4 formats (preferred for Chrome 126+)
      'video/mp4': 'mp4',
      'video/mp4;codecs=avc1.640028,mp4a.40.2': 'mp4',  // H.264 High Profile
      'video/mp4;codecs=avc1.4d0028,mp4a.40.2': 'mp4',  // H.264 Main Profile
      'video/mp4;codecs=avc1.42e01e,mp4a.40.2': 'mp4',  // H.264 Baseline Profile
      // WebM formats (fallback for Firefox)
      'video/webm': 'webm',
      'video/webm;codecs=vp9,opus': 'webm',
      'video/webm;codecs=vp8,opus': 'webm',
      'video/webm;codecs=h264,opus': 'webm',
    };

    // Check for exact match first, then try base MIME type
    if (mimeToExt[mimeType]) {
      return mimeToExt[mimeType];
    }

    // Handle unknown codec variants by checking base type
    if (mimeType.startsWith('video/mp4')) return 'mp4';
    if (mimeType.startsWith('video/webm')) return 'webm';

    return 'webm';
  }
}

export default new MultipartUploadService();
