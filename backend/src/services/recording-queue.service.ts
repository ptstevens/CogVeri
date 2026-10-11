/**
 * RecordingQueueService
 *
 * Handles job queue operations for recordings.
 * Extracted from RecordingService for better separation of concerns (Fix #1).
 *
 * Responsibilities:
 * - Queue post-upload operations (transcription, transcoding, thumbnails)
 * - Check feature access before queueing jobs
 */

import { db } from '../config/database';
import {
  transcriptionQueueHelpers,
  transcodeQueueHelpers,
  thumbnailQueueHelpers,
  TranscodeQuality,
} from '../queues';
import pricingService from './pricing.service';
import { logger } from '../utils/logger';

/**
 * Recording interface (minimal fields needed for queue operations)
 */
interface Recording {
  id: string;
  task_id: string;
}

export class RecordingQueueService {
  /**
   * Queue all post-upload operations for a recording
   * Includes: transcription, thumbnails, transcoding
   * Note: Reviewer notification is now sent AFTER AI analysis completes (in analysis.processor.ts)
   */
  async queuePostUploadOperations(
    recordingId: string,
    _recording: Recording,
    fileUrl: string,
    userId: string,
    organizationId: string,
    orgSlug: string
  ): Promise<void> {
    // Reviewer email notification is now sent after AI analysis completes
    // See analysis.processor.ts onCompleted() method

    // Queue transcription job if feature is available (non-blocking)
    this.queueTranscriptionIfEnabled(recordingId, fileUrl, userId, organizationId, orgSlug).catch(
      (err) => {
        logger.error('Failed to queue transcription:', err);
      }
    );

    // Queue thumbnail generation (non-blocking)
    thumbnailQueueHelpers
      .queueDefaultThumbnail({
        recordingId,
        fileUrl,
        organizationId,
        orgSlug,
      })
      .catch((err) => {
        logger.error('Failed to queue thumbnail generation:', err);
      });

    // Queue MP4 transcoding for better playback seeking support (non-blocking)
    // Only queue medium quality for now to balance quality and processing time
    transcodeQueueHelpers
      .queueTranscode({
        recordingId,
        inputFileUrl: fileUrl,
        organizationId,
        orgSlug,
        quality: TranscodeQuality.MEDIUM,
        outputFormat: 'mp4',
      })
      .then((job) => {
        logger.info(
          `Transcode job queued successfully: jobId=${job?.id}, recordingId=${recordingId}`
        );
      })
      .catch((err) => {
        logger.error('Failed to queue transcode:', {
          error: err.message,
          stack: err.stack,
          recordingId,
        });
      });
  }

  /**
   * Queue transcription job if the organization has access to the feature
   */
  async queueTranscriptionIfEnabled(
    recordingId: string,
    fileUrl: string,
    userId: string,
    organizationId: string,
    orgSlug: string
  ): Promise<void> {
    // Check if transcription job already exists (deduplication - Fix #23)
    const existingJob = await db('transcription_jobs')
      .where('recording_id', recordingId)
      .whereIn('status', ['pending', 'processing'])
      .first();

    if (existingJob) {
      logger.info(`Transcription job already exists for recording ${recordingId}, skipping queue`);
      return;
    }

    const org = await db('organizations')
      .where('id', organizationId)
      .select('subscription_tier')
      .first();

    const tier = org?.subscription_tier || 'free';
    const hasTranscription = pricingService.hasFeatureAccess(tier, 'basicTranscription');

    if (hasTranscription) {
      await transcriptionQueueHelpers.queueTranscription({
        recordingId,
        fileUrl,
        organizationId,
        orgSlug,
        userId,
        language: 'auto',
        options: {
          includeTimestamps: true,
        },
      });
      logger.info(`Auto-transcription queued for recording ${recordingId}`);
    } else {
      logger.info(
        `Transcription skipped for recording ${recordingId} - feature not available on ${tier} tier`
      );
    }
  }
}

// Export singleton instance
export const recordingQueueService = new RecordingQueueService();
export default recordingQueueService;
