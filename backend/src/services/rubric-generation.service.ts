/**
 * Rubric Generation Service
 *
 * Premium feature for generating evaluation rubrics from sample videos.
 * Flow:
 * 1. Upload video → Create temp recording → Queue transcription
 * 2. Wait for transcription to complete
 * 3. User clicks "Generate Rubric" → Extract frames + AI generates rubric
 * 4. Cleanup temp files when done
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, getS3Bucket, isS3Available, getS3PublicUrlBase, resolveOrganizationBucket, generateRubricVideoKey } from '../config/s3';
import { getRedisClient } from '../config/redis';
import { db } from '../config/database';
import {
  getVisionAnalysisModel,
  getRubricGenerationModel,
  estimateCost,
  GEMINI_MODELS,
} from '../config/gemini';
import {
  buildRubricGenerationPrompt,
  buildBatchFrameDescriptionPrompt,
} from './analysis/prompts/rubric-generation.prompts';
import { getRubricGenerationPrompt } from './analysis/prompts/prompt-resolver';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError, InternalServerError } from '../utils/AppError';
import { RubricStep, SpeechCriteria, VisualCriteria, EvidenceType } from '../queues/types/job-types';
import { transcriptionQueueHelpers } from '../queues/definitions/transcription.queue';

// Configuration constants
const CONFIG = {
  MAX_FILE_SIZE_MB: 200,
  MAX_FILE_SIZE_BYTES: 200 * 1024 * 1024,
  MAX_VIDEO_DURATION_MINUTES: 15,
  MAX_VIDEO_DURATION_SECONDS: 15 * 60,
  MAX_KEYFRAMES: 10,
  TEMP_FILE_RETENTION_HOURS: 24,
  TEMP_FILE_RETENTION_MS: 24 * 60 * 60 * 1000,
  REDIS_KEY_PREFIX: 'rubric-gen:',
  REDIS_STATUS_TTL_SECONDS: 86400, // 24 hours
  // @deprecated Use org-scoped paths via generateRubricVideoKey() instead
  // Path structure: {orgSlug}/rubrics/{tempVideoId}/{filename}
  S3_RUBRIC_PREFIX: 'cogveri-rubric-videos',
};

// Generation status stages
export type GenerationStage =
  | 'uploaded'
  | 'transcribing'
  | 'transcription_complete'
  | 'extracting_frames'
  | 'analyzing_frames'
  | 'generating_rubric'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Status stored in Redis
export interface GenerationStatus {
  tempVideoId: string;
  tempRecordingId: string; // Temp recording created for transcription
  organizationId: string;
  stage: GenerationStage;
  progress: number; // 0-100
  message?: string;
  storageKey?: string;
  storageBucket?: string; // Bucket where video is stored (for direct uploads)
  videoUrl?: string; // URL to the uploaded video
  createdAt: string;
  updatedAt: string;
  error?: string;
  result?: GenerationResult;
}

// Task requirements generated from video analysis
export interface TaskRequirements {
  title: string;           // Clear task title
  description: string;     // Brief 1-2 sentence summary
  requirements: string[];  // Must-do items (bullet points)
  tips: string[];          // Helpful suggestions
  estimatedDuration: string; // e.g., "2-3 minutes"
}

// Result of rubric generation
export interface GenerationResult {
  rubricSteps: RubricStep[];
  confidence: number;
  suggestedTitle: string;
  taskRequirements: TaskRequirements; // Generated task instructions
  tokensUsed: number;
  estimatedCost: number;
}

// Parsed rubric step from AI response
interface ParsedRubricStep {
  id: string;
  order: number;
  title: string;
  description: string;
  evidenceType: EvidenceType;
  speechCriteria?: SpeechCriteria;
  visualCriteria?: VisualCriteria;
  weight: number;
  isRequired: boolean;
}

// Frame description from AI
interface FrameDescription {
  timestampSeconds: number;
  description: string;
}

// Transcript segment
interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Rubric Generation Service
 */
class RubricGenerationService {
  private visionModel = getVisionAnalysisModel();
  private textModel = getRubricGenerationModel();

  /**
   * Upload video to temp S3 location and start transcription
   */
  async uploadTempVideo(
    file: Express.Multer.File,
    organizationId: string,
    userId?: string
  ): Promise<{ tempVideoId: string; tempRecordingId: string; storageKey: string }> {
    // Validate file size
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new BadRequestError(
        `File size exceeds maximum of ${CONFIG.MAX_FILE_SIZE_MB}MB`,
        { maxSizeMb: CONFIG.MAX_FILE_SIZE_MB, actualSizeMb: Math.round(file.size / 1024 / 1024) }
      );
    }

    // Validate mime type
    if (!file.mimetype.startsWith('video/')) {
      throw new BadRequestError(
        'Invalid file type. Only video files are allowed.',
        { mimeType: file.mimetype }
      );
    }

    // Check S3 availability
    if (!isS3Available()) {
      throw new InternalServerError('Storage service is not available');
    }

    const tempVideoId = uuidv4();
    const tempRecordingId = uuidv4();
    const sanitizedFilename = this.sanitizeFilename(file.originalname);
    const storageKey = `${CONFIG.S3_RUBRIC_PREFIX}/${organizationId}/${tempVideoId}/${sanitizedFilename}`;

    try {
      const s3Client = getS3Client();
      // Use org-specific bucket for data isolation
      const bucket = await resolveOrganizationBucket(organizationId);

      if (!s3Client || !bucket) {
        throw new InternalServerError('S3 client not configured');
      }

      // Upload to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          'temp-video-id': tempVideoId,
          'temp-recording-id': tempRecordingId,
          'organization-id': organizationId,
          'original-filename': sanitizedFilename,
          'upload-timestamp': new Date().toISOString(),
        },
      }));

      // Generate video URL for transcription
      const videoUrl = await this.getVideoUrl(storageKey, bucket);

      // Create temp recording in database for transcription
      // Note: task_id is nullable for temp rubric generation recordings (after migration 064)
      // Using only columns that exist in the recordings table schema
      await db('recordings').insert({
        id: tempRecordingId,
        organization_id: organizationId,
        user_id: userId || null,
        task_id: null, // No task associated with temp rubric generation
        file_url: videoUrl,
        storage_key: storageKey,
        storage_bucket: bucket, // Store in org bucket
        mime_type: file.mimetype,
        file_size_bytes: file.size,
        status: 'completed', // Video is uploaded, ready for transcription
        transcription_status: 'pending',
        is_temp_rubric_generation: true, // Flag to identify temp recordings (added by migration 064)
        // Store original filename in metadata JSON column
        metadata: JSON.stringify({ originalFilename: sanitizedFilename, purpose: 'rubric-generation' }),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Initialize status in Redis
      await this.updateStatus(tempVideoId, {
        tempVideoId,
        tempRecordingId,
        organizationId,
        stage: 'uploaded',
        progress: 5,
        message: 'Video uploaded, starting transcription...',
        storageKey,
        storageBucket: bucket,
        videoUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Fetch org slug for transcription job
      const org = await db('organizations')
        .where('id', organizationId)
        .select('slug')
        .first();
      const orgSlug = org?.slug || 'unknown';

      // Queue transcription job
      await transcriptionQueueHelpers.queueHighPriorityTranscription({
        recordingId: tempRecordingId,
        fileUrl: videoUrl,
        organizationId,
        orgSlug,
        userId,
        language: 'en',
      });

      // Update status to transcribing
      await this.updateStatus(tempVideoId, {
        tempVideoId,
        tempRecordingId,
        organizationId,
        stage: 'transcribing',
        progress: 10,
        message: 'Transcription in progress...',
        storageKey,
        storageBucket: bucket,
        videoUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      logger.info(`Temp video uploaded and transcription queued`, {
        tempVideoId,
        tempRecordingId,
        organizationId,
        storageKey,
        fileSize: file.size,
      });

      return { tempVideoId, tempRecordingId, storageKey };

    } catch (error) {
      // Cleanup on error
      try {
        await this.deleteFromS3(organizationId, tempVideoId);
        await db('recordings').where('id', tempRecordingId).del();
      } catch (cleanupError) {
        logger.warn('Cleanup failed after upload error', { cleanupError });
      }
      logger.error('Failed to upload temp video', { error, tempVideoId, organizationId });
      throw error;
    }
  }

  /**
   * Get a presigned URL for direct upload to R2
   * This bypasses Cloudflare's 100MB limit
   */
  async getPresignedUploadUrl(
    organizationId: string,
    filename: string,
    contentType: string,
    fileSize: number
  ): Promise<{
    uploadUrl: string;
    tempVideoId: string;
    storageKey: string;
    expiresIn: number;
    bucket: string;
  }> {
    if (!isS3Available()) {
      throw new InternalServerError('Storage service is not available');
    }

    const s3Client = getS3Client();
    // Resolve bucket (now returns the single environment bucket)
    const bucket = await resolveOrganizationBucket(organizationId);

    if (!s3Client || !bucket) {
      throw new InternalServerError('S3 client not configured');
    }

    // Fetch org slug for path construction
    const org = await db('organizations')
      .where('id', organizationId)
      .select('slug')
      .first();
    const orgSlug = org?.slug || 'unknown';

    const tempVideoId = uuidv4();
    const sanitizedFilename = this.sanitizeFilename(filename);
    // Use org-scoped path: {orgSlug}/rubrics/{tempVideoId}/{filename}
    const storageKey = generateRubricVideoKey(orgSlug, tempVideoId, sanitizedFilename);
    const expiresIn = 900; // 15 minutes

    // Generate presigned PUT URL
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: contentType,
      Metadata: {
        'temp-video-id': tempVideoId,
        'organization-id': organizationId,
        'org-slug': orgSlug,
        'original-filename': sanitizedFilename,
        'upload-timestamp': new Date().toISOString(),
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    logger.info('Generated presigned upload URL', {
      tempVideoId,
      organizationId,
      orgSlug,
      storageKey,
      fileSize,
      contentType,
      expiresIn,
    });

    return {
      uploadUrl,
      tempVideoId,
      storageKey,
      expiresIn,
      bucket,
    };
  }

  /**
   * Confirm that a direct upload has completed and start transcription
   */
  async confirmDirectUpload(
    tempVideoId: string,
    organizationId: string,
    userId: string | undefined,
    storageKey: string,
    filename: string,
    fileSize: number,
    contentType: string
  ): Promise<{
    tempVideoId: string;
    tempRecordingId: string;
    status: string;
    storageKey: string;
    storageBucket: string;
  }> {
    const s3Client = getS3Client();
    // Resolve bucket (now returns the single environment bucket)
    const bucket = await resolveOrganizationBucket(organizationId);

    if (!s3Client || !bucket) {
      throw new InternalServerError('S3 client not configured');
    }

    // Fetch org slug for path construction and job data
    const org = await db('organizations')
      .where('id', organizationId)
      .select('slug')
      .first();
    const orgSlug = org?.slug || 'unknown';

    // Verify the file exists in S3
    try {
      const headCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      });
      await s3Client.send(headCommand);
    } catch (error) {
      logger.error('Direct upload verification failed - file not found', {
        tempVideoId,
        storageKey,
        error,
      });
      throw new BadRequestError('Upload not found. Please try uploading again.');
    }

    const tempRecordingId = uuidv4();
    const sanitizedFilename = this.sanitizeFilename(filename);

    try {
      // Generate video URL for transcription
      const videoUrl = await this.getVideoUrl(storageKey, bucket);

      // Create temp recording in database for transcription
      await db('recordings').insert({
        id: tempRecordingId,
        organization_id: organizationId,
        user_id: userId || null,
        task_id: null,
        file_url: videoUrl,
        storage_key: storageKey,
        storage_bucket: bucket, // Store the bucket used
        mime_type: contentType,
        file_size_bytes: fileSize,
        status: 'completed',
        transcription_status: 'pending',
        is_temp_rubric_generation: true,
        metadata: JSON.stringify({
          originalFilename: sanitizedFilename,
          purpose: 'rubric-generation',
          uploadMethod: 'direct'
        }),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Initialize status in Redis
      await this.updateStatus(tempVideoId, {
        tempVideoId,
        tempRecordingId,
        organizationId,
        stage: 'uploaded',
        progress: 5,
        message: 'Video uploaded, starting transcription...',
        storageKey,
        storageBucket: bucket,
        videoUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Queue transcription job with org slug for storage paths
      await transcriptionQueueHelpers.queueHighPriorityTranscription({
        recordingId: tempRecordingId,
        fileUrl: videoUrl,
        organizationId,
        orgSlug,
        userId,
        language: 'en',
      });

      // Update status to transcribing
      await this.updateStatus(tempVideoId, {
        tempVideoId,
        tempRecordingId,
        organizationId,
        stage: 'transcribing',
        progress: 10,
        message: 'Transcription in progress...',
        storageKey,
        storageBucket: bucket,
        videoUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      logger.info('Direct upload confirmed and transcription queued', {
        tempVideoId,
        tempRecordingId,
        organizationId,
        storageKey,
        fileSize,
      });

      return {
        tempVideoId,
        tempRecordingId,
        status: 'transcribing',
        storageKey,
        storageBucket: bucket,
      };

    } catch (error) {
      // Cleanup on error
      try {
        await this.deleteFromS3(organizationId, tempVideoId);
        await db('recordings').where('id', tempRecordingId).del();
      } catch (cleanupError) {
        logger.warn('Cleanup failed after confirm upload error', { cleanupError });
      }
      logger.error('Failed to confirm direct upload', { error, tempVideoId, organizationId });
      throw error;
    }
  }

  /**
   * Get video URL (signed URL for S3 or public URL)
   */
  private async getVideoUrl(storageKey: string, bucketOverride?: string): Promise<string> {
    const s3Client = getS3Client();
    const bucket = bucketOverride || getS3Bucket();
    const publicUrlBase = getS3PublicUrlBase();

    // If we have a public URL base and using the main bucket, use it
    if (publicUrlBase && !bucketOverride) {
      return `${publicUrlBase}/${storageKey}`;
    }

    // Otherwise generate a signed URL (valid for 24 hours)
    if (s3Client && bucket) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      });
      return await getSignedUrl(s3Client, command, { expiresIn: 86400 });
    }

    throw new InternalServerError('Cannot generate video URL');
  }

  /**
   * Get generation status with transcription progress
   * This method checks the actual transcription status and updates our status accordingly
   */
  async getGenerationStatusWithTranscription(tempVideoId: string): Promise<GenerationStatus | null> {
    const status = await this.getGenerationStatus(tempVideoId);
    if (!status) {
      logger.warn('[DIAG] No status found in Redis', { tempVideoId });
      return null;
    }

    logger.info('[DIAG] Retrieved status from Redis', {
      tempVideoId,
      stage: status.stage,
      tempRecordingId: status.tempRecordingId,
      progress: status.progress,
    });

    // If we're in transcribing stage, check actual transcription progress
    if (status.stage === 'transcribing' && status.tempRecordingId) {
      logger.info('[DIAG] Checking database for transcription status', {
        tempVideoId,
        tempRecordingId: status.tempRecordingId,
      });

      try {
        // First check the database - the Python worker callback updates this directly
        const recording = await db('recordings')
          .where('id', status.tempRecordingId)
          .first('transcription_status', 'transcript_text');

        logger.info('[DIAG] Database query result', {
          tempVideoId,
          tempRecordingId: status.tempRecordingId,
          recordingFound: !!recording,
          transcriptionStatus: recording?.transcription_status,
          hasTranscriptText: !!recording?.transcript_text,
          transcriptTextLength: recording?.transcript_text?.length || 0,
        });

        if (recording) {
          if (recording.transcription_status === 'completed' && recording.transcript_text) {
            // Transcription is complete in database!
            logger.info('[DIAG] Transcription complete in database, updating status', {
              tempVideoId,
              tempRecordingId: status.tempRecordingId,
            });

            const updatedStatus: GenerationStatus = {
              ...status,
              stage: 'transcription_complete',
              progress: 50,
              message: 'Transcription complete. Ready to generate rubric.',
              updatedAt: new Date().toISOString(),
            };
            await this.updateStatus(tempVideoId, updatedStatus);
            return updatedStatus;
          } else if (recording.transcription_status === 'failed') {
            // Transcription failed
            logger.info('[DIAG] Transcription failed in database', {
              tempVideoId,
              tempRecordingId: status.tempRecordingId,
            });

            const updatedStatus: GenerationStatus = {
              ...status,
              stage: 'failed',
              progress: 0,
              message: 'Transcription failed',
              error: 'Transcription processing failed',
              updatedAt: new Date().toISOString(),
            };
            await this.updateStatus(tempVideoId, updatedStatus);
            return updatedStatus;
          } else {
            logger.info('[DIAG] Transcription not complete yet in database, falling back to BullMQ check', {
              tempVideoId,
              transcriptionStatus: recording.transcription_status,
            });
          }
        } else {
          logger.warn('[DIAG] Recording not found in database', {
            tempVideoId,
            tempRecordingId: status.tempRecordingId,
          });
        }

        // Fall back to checking BullMQ queue status for progress updates
        logger.info('[DIAG] Checking BullMQ for transcription status', { tempVideoId });
        const transcriptionStatus = await transcriptionQueueHelpers.getTranscriptionStatus(status.tempRecordingId);

        logger.info('[DIAG] BullMQ transcription status', {
          tempVideoId,
          hasTranscriptionStatus: !!transcriptionStatus,
          state: transcriptionStatus?.state,
          progress: transcriptionStatus?.progress,
        });

        if (transcriptionStatus) {
          // Map transcription progress (0-100) to our progress range (10-50)
          const transcriptionProgress = transcriptionStatus.progress || 0;
          const mappedProgress = 10 + Math.floor(transcriptionProgress * 0.4); // 10% to 50%

          if (transcriptionStatus.state === 'completed') {
            // Transcription is complete!
            const updatedStatus: GenerationStatus = {
              ...status,
              stage: 'transcription_complete',
              progress: 50,
              message: 'Transcription complete. Ready to generate rubric.',
              updatedAt: new Date().toISOString(),
            };
            await this.updateStatus(tempVideoId, updatedStatus);
            return updatedStatus;
          } else if (transcriptionStatus.state === 'failed') {
            // Transcription failed
            const updatedStatus: GenerationStatus = {
              ...status,
              stage: 'failed',
              progress: 0,
              message: 'Transcription failed',
              error: transcriptionStatus.failedReason || 'Unknown transcription error',
              updatedAt: new Date().toISOString(),
            };
            await this.updateStatus(tempVideoId, updatedStatus);
            return updatedStatus;
          } else {
            // Still processing - update progress
            const updatedStatus: GenerationStatus = {
              ...status,
              progress: mappedProgress,
              message: transcriptionStatus.message || `Transcribing... ${transcriptionProgress}%`,
              updatedAt: new Date().toISOString(),
            };
            await this.updateStatus(tempVideoId, updatedStatus);
            return updatedStatus;
          }
        }
      } catch (error) {
        logger.error('[DIAG] Exception while checking transcription status', { 
          error, 
          tempVideoId,
          tempRecordingId: status.tempRecordingId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      logger.info('[DIAG] Not in transcribing stage or no tempRecordingId, returning cached status', {
        tempVideoId,
        stage: status.stage,
        hasTempRecordingId: !!status.tempRecordingId,
      });
    }

    return status;
  }

  /**
   * Generate rubric from uploaded video (requires completed transcription)
   */
  async generateRubricFromVideo(
    tempVideoId: string,
    organizationId: string,
    options: {
      taskType: string;
      customContext?: string;
    }
  ): Promise<GenerationResult> {
    // Get status with transcription check
    const status = await this.getGenerationStatusWithTranscription(tempVideoId);

    if (!status) {
      throw new NotFoundError('Temp video not found', { resourceId: tempVideoId });
    }

    if (status.organizationId !== organizationId) {
      throw new NotFoundError('Temp video not found', { resourceId: tempVideoId });
    }

    // Only allow generation when transcription is complete
    if (status.stage !== 'transcription_complete') {
      if (status.stage === 'transcribing') {
        throw new BadRequestError(
          'Transcription is still in progress. Please wait for it to complete.',
          { currentStage: status.stage, progress: status.progress }
        );
      } else if (status.stage === 'failed') {
        throw new BadRequestError(
          'Transcription failed. Please re-upload the video.',
          { error: status.error }
        );
      } else if (status.stage === 'completed') {
        throw new BadRequestError(
          'Rubric has already been generated for this video.',
          { currentStage: status.stage }
        );
      } else {
        throw new BadRequestError(
          `Cannot generate rubric: video is in stage '${status.stage}'`,
          { currentStage: status.stage }
        );
      }
    }

    let tempDir: string | null = null;
    let totalTokensUsed = 0;

    try {
      // Fetch transcript from database
      const recording = await db('recordings')
        .where('id', status.tempRecordingId)
        .first();

      if (!recording) {
        throw new NotFoundError('Recording not found', { resourceId: status.tempRecordingId });
      }

      const transcriptText = recording.transcript_text || '';
      const duration = recording.transcript_duration_seconds || recording.duration_seconds || 60;

      // Fetch transcript segments
      const segmentRows = await db('transcription_segments')
        .where('recording_id', status.tempRecordingId)
        .orderBy('segment_index', 'asc');

      // Note: decimal columns return as strings from PostgreSQL, need to parse
      const segments: TranscriptSegment[] = segmentRows.map((row: { text: string; start_time: string | number; end_time: string | number }) => ({
        text: row.text,
        startTime: typeof row.start_time === 'string' ? parseFloat(row.start_time) : row.start_time,
        endTime: typeof row.end_time === 'string' ? parseFloat(row.end_time) : row.end_time,
      }));

      // Create temp directory for frame extraction
      tempDir = path.join(os.tmpdir(), `rubric-gen-${tempVideoId}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Download video from S3 for frame extraction
      await this.updateStatus(tempVideoId, {
        ...status,
        stage: 'extracting_frames',
        progress: 55,
        message: 'Downloading video for frame analysis...',
        updatedAt: new Date().toISOString(),
      });

      const videoPath = await this.downloadFromS3(status.storageKey!, tempDir, status.storageBucket);

      // Extract keyframes
      await this.updateStatus(tempVideoId, {
        ...status,
        stage: 'extracting_frames',
        progress: 60,
        message: 'Extracting keyframes...',
        updatedAt: new Date().toISOString(),
      });

      const frames = await this.extractKeyframes(videoPath, tempDir, duration);

      // Analyze frames with AI
      await this.updateStatus(tempVideoId, {
        ...status,
        stage: 'analyzing_frames',
        progress: 70,
        message: 'Analyzing video frames with AI...',
        updatedAt: new Date().toISOString(),
      });

      const { frameDescriptions, tokens: frameTokens } = await this.analyzeFrames(frames);
      totalTokensUsed += frameTokens;

      // Generate rubric with AI
      await this.updateStatus(tempVideoId, {
        ...status,
        stage: 'generating_rubric',
        progress: 85,
        message: 'Generating rubric from transcript and frames...',
        updatedAt: new Date().toISOString(),
      });

      const { rubricSteps, confidence, suggestedTitle, taskRequirements, tokens: rubricTokens } =
        await this.generateRubric({
          transcriptText,
          transcriptSegments: segments,
          frameDescriptions,
          taskType: options.taskType,
          customContext: options.customContext,
        });
      totalTokensUsed += rubricTokens;

      const estimatedCost = estimateCost(
        { inputTokens: totalTokensUsed * 0.8, outputTokens: totalTokensUsed * 0.2, totalTokens: totalTokensUsed },
        GEMINI_MODELS.FLASH
      );

      const result: GenerationResult = {
        rubricSteps,
        confidence,
        suggestedTitle,
        taskRequirements,
        tokensUsed: totalTokensUsed,
        estimatedCost,
      };

      // Update status to completed
      await this.updateStatus(tempVideoId, {
        ...status,
        stage: 'completed',
        progress: 100,
        message: 'Rubric generated successfully',
        updatedAt: new Date().toISOString(),
        result,
      });

      logger.info('Rubric generated successfully', {
        tempVideoId,
        organizationId,
        stepsCount: rubricSteps.length,
        tokensUsed: totalTokensUsed,
        estimatedCost,
      });

      // Cleanup temp video from S3 after successful generation
      // This frees up storage since the video is no longer needed
      try {
        await this.cleanupTempVideo(tempVideoId);
        logger.info('Temp video cleaned up after successful rubric generation', { tempVideoId });
      } catch (cleanupError) {
        // Don't fail the request if cleanup fails - the cleanup job will handle it later
        logger.warn('Failed to cleanup temp video after rubric generation', {
          tempVideoId,
          error: cleanupError
        });
      }

      return result;

    } catch (error) {
      // Update status to failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateStatus(tempVideoId, {
        ...status,
        stage: 'failed',
        progress: 0,
        message: 'Generation failed',
        error: errorMessage,
        updatedAt: new Date().toISOString(),
      });

      logger.error('Rubric generation failed', { error, tempVideoId, organizationId });
      throw error;

    } finally {
      // Cleanup temp directory
      if (tempDir) {
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          logger.warn('Failed to cleanup temp directory', { error: cleanupError, tempDir });
        }
      }
    }
  }

  /**
   * Cleanup temp video and extracted frames
   */
  async cleanupTempVideo(tempVideoId: string): Promise<void> {
    const status = await this.getGenerationStatus(tempVideoId);

    if (!status) {
      logger.debug('Temp video not found for cleanup', { tempVideoId });
      return;
    }

    try {
      // Delete from S3 (use the bucket where the file was stored)
      if (status.storageKey) {
        await this.deleteFromS3(status.organizationId, tempVideoId, status.storageBucket);
      }

      // Delete temp recording from database (including transcription segments via cascade)
      if (status.tempRecordingId) {
        // Delete transcription segments first (if no cascade)
        await db('transcription_segments')
          .where('recording_id', status.tempRecordingId)
          .del();

        // Delete the temp recording
        await db('recordings')
          .where('id', status.tempRecordingId)
          .where('is_temp_rubric_generation', true) // Safety check
          .del();
      }

      // Delete from Redis
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`${CONFIG.REDIS_KEY_PREFIX}${tempVideoId}`);
      }

      logger.info('Temp video cleaned up', {
        tempVideoId,
        tempRecordingId: status.tempRecordingId,
        organizationId: status.organizationId,
      });

    } catch (error) {
      logger.error('Failed to cleanup temp video', { error, tempVideoId });
      throw error;
    }
  }

  /**
   * Get generation status
   */
  async getGenerationStatus(tempVideoId: string): Promise<GenerationStatus | null> {
    const redis = getRedisClient();
    if (!redis) {
      return null;
    }

    try {
      const data = await redis.get(`${CONFIG.REDIS_KEY_PREFIX}${tempVideoId}`);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as GenerationStatus;
    } catch (error) {
      logger.error('Failed to get generation status', { error, tempVideoId });
      return null;
    }
  }

  /**
   * Cleanup expired temp videos (called by scheduled job)
   */
  async cleanupExpiredTempVideos(): Promise<{ cleaned: number; errors: number }> {
    const redis = getRedisClient();
    if (!redis) {
      return { cleaned: 0, errors: 0 };
    }

    let cleaned = 0;
    let errors = 0;
    const cutoffTime = Date.now() - CONFIG.TEMP_FILE_RETENTION_MS;

    try {
      // Scan Redis for all rubric generation keys
      const keys = await redis.keys(`${CONFIG.REDIS_KEY_PREFIX}*`);

      for (const key of keys) {
        try {
          const data = await redis.get(key);
          if (!data) continue;

          const status = JSON.parse(data) as GenerationStatus;
          const createdAt = new Date(status.createdAt).getTime();

          if (createdAt < cutoffTime) {
            await this.cleanupTempVideo(status.tempVideoId);
            cleaned++;
            logger.debug('Cleaned up expired temp video', { tempVideoId: status.tempVideoId });
          }
        } catch (keyError) {
          errors++;
          logger.warn('Error processing temp video key', { error: keyError, key });
        }
      }

      logger.info('Temp video cleanup completed', { cleaned, errors });
      return { cleaned, errors };

    } catch (error) {
      logger.error('Temp video cleanup failed', { error });
      return { cleaned, errors };
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Update status in Redis
   */
  private async updateStatus(tempVideoId: string, status: GenerationStatus): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      logger.warn('Redis not available, status not persisted', { tempVideoId });
      return;
    }

    const key = `${CONFIG.REDIS_KEY_PREFIX}${tempVideoId}`;
    try {
      await redis.setex(
        key,
        CONFIG.REDIS_STATUS_TTL_SECONDS,
        JSON.stringify(status)
      );
      logger.debug('[Redis] Status written successfully', {
        tempVideoId,
        key,
        stage: status.stage,
      });
    } catch (error) {
      logger.error('[Redis] Failed to write status', {
        tempVideoId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Re-throw so caller knows the write failed
    }
  }

  /**
   * Sanitize filename for storage
   */
  private sanitizeFilename(filename: string): string {
    // Remove path components
    const basename = path.basename(filename);
    // Replace unsafe characters
    return basename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  }

  /**
   * Download file from S3 to temp directory
   */
  private async downloadFromS3(storageKey: string, tempDir: string, bucketOverride?: string): Promise<string> {
    const s3Client = getS3Client();
    const bucket = bucketOverride || getS3Bucket();

    if (!s3Client || !bucket) {
      throw new InternalServerError('S3 not configured');
    }

    // Generate proper video URL (public or presigned) using the correct bucket
    const videoUrl = await this.getVideoUrl(storageKey, bucketOverride);
    const localPath = path.join(tempDir, 'video.webm');

    logger.info('[DIAG] Downloading video from S3', {
      storageKey,
      bucket,
      videoUrl: videoUrl.substring(0, 100) + '...', // Truncate for logging
      localPath,
    });

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      const protocol = videoUrl.startsWith('https') ? https : http;

      protocol.get(videoUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFromUrl(redirectUrl, localPath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download video: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      }).on('error', (err) => {
        fs.unlink(localPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Download from URL helper
   */
  private downloadFromUrl(url: string, localPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      }).on('error', (err) => {
        fs.unlink(localPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Delete temp files from S3
   */
  private async deleteFromS3(organizationId: string, tempVideoId: string, bucketOverride?: string): Promise<void> {
    const s3Client = getS3Client();
    const bucket = bucketOverride || getS3Bucket();

    if (!s3Client || !bucket) {
      return;
    }

    // Fetch org slug for path construction
    const org = await db('organizations')
      .where('id', organizationId)
      .select('slug')
      .first();
    const orgSlug = org?.slug || 'unknown';

    // Use org-scoped path: {orgSlug}/rubrics/{tempVideoId}/
    const prefix = `${orgSlug}/rubrics/${tempVideoId}/`;

    logger.info('[DIAG] Deleting from S3', {
      bucket,
      prefix,
      orgSlug,
    });

    try {
      // List all objects with this prefix
      const listResponse = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      }));

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return;
      }

      // Delete all objects
      const objectsToDelete = listResponse.Contents
        .filter(obj => obj.Key)
        .map(obj => ({ Key: obj.Key! }));

      if (objectsToDelete.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objectsToDelete },
        }));
      }

    } catch (error) {
      logger.error('Failed to delete from S3', { error, prefix, bucket });
    }
  }

  /**
   * Extract keyframes from video
   */
  private async extractKeyframes(
    videoPath: string,
    tempDir: string,
    duration: number
  ): Promise<Array<{ path: string; timestampSeconds: number }>> {
    const framesDir = path.join(tempDir, 'frames');
    await fs.promises.mkdir(framesDir, { recursive: true });

    // Calculate interval to get CONFIG.MAX_KEYFRAMES evenly distributed
    const interval = duration / CONFIG.MAX_KEYFRAMES;
    const framePattern = path.join(framesDir, 'frame_%04d.jpg');

    return new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-vf', `fps=1/${interval}`,
        '-frames:v', CONFIG.MAX_KEYFRAMES.toString(),
        '-q:v', '2',
        framePattern,
      ];

      const ffmpeg = spawn('ffmpeg', args);
      let errorOutput = '';

      ffmpeg.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          logger.warn('FFmpeg frame extraction returned non-zero', { code, errorOutput: errorOutput.slice(-500) });
        }

        fs.promises.readdir(framesDir)
          .then((files) => {
            const frames = files
              .filter(f => f.startsWith('frame_'))
              .sort()
              .map((f, index) => ({
                path: path.join(framesDir, f),
                timestampSeconds: index * interval,
              }));

            resolve(frames);
          })
          .catch((error) => {
            reject(error);
          });
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Analyze frames with Gemini Vision
   */
  private async analyzeFrames(
    frames: Array<{ path: string; timestampSeconds: number }>
  ): Promise<{ frameDescriptions: FrameDescription[]; tokens: number }> {
    if (frames.length === 0) {
      return { frameDescriptions: [], tokens: 0 };
    }

    try {
      // Read frame images
      const imageBuffers = await Promise.all(
        frames.map(async (frame) => {
          const buffer = await fs.promises.readFile(frame.path);
          return {
            timestampSeconds: frame.timestampSeconds,
            buffer,
          };
        })
      );

      // Build image parts for Gemini
      const imageParts = imageBuffers.map(img => ({
        inlineData: {
          mimeType: 'image/jpeg',
          data: img.buffer.toString('base64'),
        },
      }));

      // Call Gemini with batch prompt
      const prompt = buildBatchFrameDescriptionPrompt(frames.length);
      const result = await this.visionModel.generateContent([
        { text: prompt },
        ...imageParts,
      ]);

      const response = result.response;
      const responseText = response.text();

      // Extract token usage
      const usageMetadata = response.usageMetadata;
      const tokens = usageMetadata?.totalTokenCount || 0;

      // Parse response
      const frameDescriptions = this.parseFrameDescriptions(responseText, imageBuffers);

      return { frameDescriptions, tokens };

    } catch (error) {
      logger.error('Frame analysis failed', { error });
      // Return empty descriptions on failure
      return { frameDescriptions: [], tokens: 0 };
    }
  }

  /**
   * Parse frame descriptions from AI response
   */
  private parseFrameDescriptions(
    responseText: string,
    frames: Array<{ timestampSeconds: number; buffer: Buffer }>
  ): FrameDescription[] {
    try {
      // Extract JSON from response
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr) as {
        frameDescriptions?: Array<{ frameIndex: number; description: string }>;
      };
      const descriptions = parsed.frameDescriptions || [];

      return descriptions.map((desc) => ({
        timestampSeconds: frames[desc.frameIndex]?.timestampSeconds || 0,
        description: desc.description || '',
      }));

    } catch (error) {
      logger.warn('Failed to parse frame descriptions', { error });
      return [];
    }
  }

  /**
   * Generate rubric from collected data
   */
  private async generateRubric(params: {
    transcriptText: string;
    transcriptSegments: TranscriptSegment[];
    frameDescriptions: FrameDescription[];
    taskType: string;
    customContext?: string;
  }): Promise<{
    rubricSteps: RubricStep[];
    confidence: number;
    suggestedTitle: string;
    taskRequirements: TaskRequirements;
    tokens: number;
  }> {
    const prompt = buildRubricGenerationPrompt({
      transcriptText: params.transcriptText,
      transcriptSegments: params.transcriptSegments,
      frameDescriptions: params.frameDescriptions,
      taskType: params.taskType,
      customContext: params.customContext,
    });

    // Fetch system prompt (from DB with fallback to hardcoded)
    const systemPrompt = await getRubricGenerationPrompt();

    const result = await this.textModel.generateContent([
      { text: systemPrompt },
      { text: prompt },
    ]);

    const response = result.response;
    const responseText = response.text();

    // Extract token usage
    const usageMetadata = response.usageMetadata;
    const tokens = usageMetadata?.totalTokenCount || 0;

    // Parse the rubric and task requirements
    const parsed = this.parseRubricResponse(responseText);

    return {
      rubricSteps: parsed.rubricSteps,
      confidence: parsed.confidence,
      suggestedTitle: parsed.suggestedTitle,
      taskRequirements: parsed.taskRequirements,
      tokens,
    };
  }

  /**
   * Parse rubric response from AI
   */
  private parseRubricResponse(responseText: string): {
    rubricSteps: RubricStep[];
    confidence: number;
    suggestedTitle: string;
    taskRequirements: TaskRequirements;
  } {
    try {
      // Extract JSON from response
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr) as {
        rubricSteps?: ParsedRubricStep[];
        confidence?: number;
        suggestedTitle?: string;
        taskRequirements?: {
          title?: string;
          description?: string;
          requirements?: string[];
          tips?: string[];
          estimatedDuration?: string;
        };
      };

      // Validate and transform rubric steps
      const rubricSteps: RubricStep[] = (parsed.rubricSteps || []).map((step: ParsedRubricStep) => {
        // Ensure required fields
        const validatedStep: RubricStep = {
          id: step.id || `step-${Math.random().toString(36).substring(2, 8)}`,
          order: step.order || 1,
          title: step.title || 'Untitled Step',
          description: step.description || '',
          evidenceType: this.validateEvidenceType(step.evidenceType),
          weight: Math.min(10, Math.max(1, step.weight || 5)),
          isRequired: step.isRequired !== false,
        };

        // Add speech criteria if applicable
        if (validatedStep.evidenceType === 'speech' || validatedStep.evidenceType === 'both') {
          validatedStep.speechCriteria = {
            requiredKeywords: step.speechCriteria?.requiredKeywords || [],
            requiredPhrases: step.speechCriteria?.requiredPhrases || [],
            optionalKeywords: step.speechCriteria?.optionalKeywords,
          };
        }

        // Add visual criteria if applicable
        if (validatedStep.evidenceType === 'visual' || validatedStep.evidenceType === 'both') {
          validatedStep.visualCriteria = {
            expectedElements: step.visualCriteria?.expectedElements || [],
            expectedActions: step.visualCriteria?.expectedActions || [],
          };
        }

        return validatedStep;
      });

      // Parse and validate task requirements
      const rawRequirements = parsed.taskRequirements || {};
      const taskRequirements: TaskRequirements = {
        title: rawRequirements.title || parsed.suggestedTitle || 'New Task',
        description: rawRequirements.description || 'Complete the task as demonstrated in the sample video.',
        requirements: Array.isArray(rawRequirements.requirements) ? rawRequirements.requirements : [],
        tips: Array.isArray(rawRequirements.tips) ? rawRequirements.tips : [],
        estimatedDuration: rawRequirements.estimatedDuration || '5-10 minutes',
      };

      return {
        rubricSteps,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        suggestedTitle: parsed.suggestedTitle || 'Generated Rubric',
        taskRequirements,
      };

    } catch (error) {
      logger.error('Failed to parse rubric response', { error, responseText: responseText.substring(0, 500) });

      // Return minimal default rubric
      return {
        rubricSteps: [{
          id: 'step-1',
          order: 1,
          title: 'Complete Task',
          description: 'Complete the assigned task as demonstrated in the sample video',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: [],
            requiredPhrases: [],
          },
          visualCriteria: {
            expectedElements: [],
            expectedActions: [],
          },
          weight: 5,
          isRequired: true,
        }],
        confidence: 0.1,
        suggestedTitle: 'Generated Rubric',
        taskRequirements: {
          title: 'New Task',
          description: 'Complete the task as demonstrated.',
          requirements: ['Follow the steps shown in the sample video'],
          tips: ['Take your time and speak clearly'],
          estimatedDuration: '5-10 minutes',
        },
      };
    }
  }

  /**
   * Validate evidence type
   */
  private validateEvidenceType(type: string | undefined): EvidenceType {
    if (type === 'speech' || type === 'visual' || type === 'both') {
      return type;
    }
    return 'both'; // Default to both for comprehensive evaluation
  }
}

// Export singleton instance
export const rubricGenerationService = new RubricGenerationService();
export default rubricGenerationService;
