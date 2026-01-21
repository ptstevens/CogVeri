/**
 * Transcription Service
 * Manages transcription jobs and retrieves transcription data.
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/AppError';
import { transcriptionQueueHelpers } from '../queues';
import recordingService from './recording.service';

export interface TranscriptionSegment {
  id: string;
  recording_id: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
  confidence?: number;
  segment_index: number;
}

export interface TranscriptionJob {
  id: string;
  recording_id: string;
  organization_id: string;
  user_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  language?: string;
  model_used?: string;
  progress: number;
  stage?: string;
  progress_message?: string;
  started_at?: Date;
  completed_at?: Date;
  processing_duration_seconds?: number;
  error_message?: string;
  retry_count: number;
  options?: Record<string, unknown>;
  queue_job_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface TranscriptionResult {
  recordingId: string;
  transcriptText: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  status: string;
  progress: number;
  stage?: string;
}

class TranscriptionService {
  /**
   * Start transcription for a recording
   */
  async startTranscription(
    recordingId: string,
    organizationId: string,
    options?: {
      userId?: string;
      language?: string;
      includeSpeakerDiarization?: boolean;
      includeTimestamps?: boolean;
    }
  ): Promise<TranscriptionJob> {
    const log = logger.child({ recordingId, organizationId });

    // Verify recording exists and belongs to organization
    const recording = await recordingService.getRecordingById(recordingId, organizationId);
    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    if (recording.status !== 'completed') {
      throw new BadRequestError('Recording must be completed before transcription');
    }

    // Check if transcription already exists or in progress
    const existingJob = await db('transcription_jobs')
      .where('recording_id', recordingId)
      .whereIn('status', ['pending', 'processing'])
      .first();

    if (existingJob) {
      log.info('Transcription already in progress', { jobId: existingJob.id });
      return existingJob;
    }

    // Create transcription job record
    const [job] = await db('transcription_jobs')
      .insert({
        recording_id: recordingId,
        organization_id: organizationId,
        user_id: options?.userId,
        status: 'pending',
        language: options?.language,
        progress: 0,
        stage: 'queued',
        retry_count: 0,
        max_retries: 2,
        options: options ? JSON.stringify({
          includeSpeakerDiarization: options.includeSpeakerDiarization,
          includeTimestamps: options.includeTimestamps ?? true,
        }) : null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    // Update recording transcription status
    await db('recordings')
      .where('id', recordingId)
      .update({
        transcription_status: 'pending',
        updated_at: new Date(),
      });

    // Queue the transcription job
    try {
      const fileUrl = await recordingService.getRecordingPlaybackUrl(recordingId);

      // Fetch org slug for storage path construction
      const org = await db('organizations')
        .where('id', organizationId)
        .select('slug')
        .first();
      const orgSlug = org?.slug || 'unknown';

      const queueJob = await transcriptionQueueHelpers.queueTranscription({
        recordingId,
        fileUrl,
        organizationId,
        orgSlug,
        userId: options?.userId,
        language: options?.language,
        options: {
          includeSpeakerDiarization: options?.includeSpeakerDiarization,
          includeTimestamps: options?.includeTimestamps ?? true,
        },
      });

      // Update job with queue job ID
      await db('transcription_jobs')
        .where('id', job.id)
        .update({
          queue_job_id: queueJob.id,
          updated_at: new Date(),
        });

      log.info('Transcription job queued', { jobId: job.id, queueJobId: queueJob.id });
    } catch (error) {
      // If queuing fails, mark job as failed
      await db('transcription_jobs')
        .where('id', job.id)
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Failed to queue transcription',
          updated_at: new Date(),
        });

      throw error;
    }

    return job;
  }

  /**
   * Get transcription status for a recording
   */
  async getTranscriptionStatus(recordingId: string, organizationId: string): Promise<{
    status: string;
    progress: number;
    stage?: string;
    message?: string;
    job?: TranscriptionJob;
  }> {
    // Get the latest transcription job
    const job = await db('transcription_jobs')
      .where('recording_id', recordingId)
      .where('organization_id', organizationId)
      .orderBy('created_at', 'desc')
      .first();

    if (!job) {
      // Check if recording has transcription data
      const recording = await db('recordings')
        .where('id', recordingId)
        .where('organization_id', organizationId)
        .first();

      if (recording?.transcript_text) {
        return {
          status: 'completed',
          progress: 100,
          stage: 'completed',
        };
      }

      return {
        status: 'none',
        progress: 0,
        message: 'No transcription job found',
      };
    }

    // If job is pending/processing, check queue for real-time status
    if (job.status === 'pending' || job.status === 'processing') {
      const queueStatus = await transcriptionQueueHelpers.getTranscriptionStatus(recordingId);
      if (queueStatus) {
        return {
          status: queueStatus.state,
          progress: queueStatus.progress,
          stage: queueStatus.stage,
          message: queueStatus.message,
          job,
        };
      }
    }

    return {
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      message: job.progress_message || job.error_message,
      job,
    };
  }

  /**
   * Get transcription for a recording
   */
  async getTranscription(recordingId: string, organizationId: string): Promise<TranscriptionResult | null> {
    // Get recording with transcription data
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    if (!recording.transcript_text) {
      return null;
    }

    // Get segments
    const segments = await db('transcription_segments')
      .where('recording_id', recordingId)
      .orderBy('segment_index', 'asc');

    return {
      recordingId,
      transcriptText: recording.transcript_text,
      language: recording.transcript_language || 'en',
      duration: recording.transcript_duration_seconds || recording.duration_seconds || 0,
      segments,
      status: recording.transcription_status || 'completed',
      progress: 100,
    };
  }

  /**
   * Get transcription segments for a recording
   */
  async getTranscriptionSegments(
    recordingId: string,
    organizationId: string,
    options?: {
      startTime?: number;
      endTime?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<TranscriptionSegment[]> {
    // Verify recording access
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    let query = db('transcription_segments')
      .where('recording_id', recordingId)
      .orderBy('segment_index', 'asc');

    if (options?.startTime !== undefined) {
      query = query.where('start_time', '>=', options.startTime);
    }

    if (options?.endTime !== undefined) {
      query = query.where('end_time', '<=', options.endTime);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query;
  }

  /**
   * Get segment at a specific time
   */
  async getSegmentAtTime(
    recordingId: string,
    organizationId: string,
    time: number
  ): Promise<TranscriptionSegment | null> {
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    const segment = await db('transcription_segments')
      .where('recording_id', recordingId)
      .where('start_time', '<=', time)
      .where('end_time', '>', time)
      .first();

    return segment || null;
  }

  /**
   * Cancel a pending transcription job
   */
  async cancelTranscription(recordingId: string, organizationId: string): Promise<boolean> {
    const job = await db('transcription_jobs')
      .where('recording_id', recordingId)
      .where('organization_id', organizationId)
      .whereIn('status', ['pending', 'processing'])
      .first();

    if (!job) {
      return false;
    }

    // Cancel in queue
    await transcriptionQueueHelpers.cancelTranscription(recordingId);

    // Update job status
    await db('transcription_jobs')
      .where('id', job.id)
      .update({
        status: 'cancelled',
        updated_at: new Date(),
      });

    // Update recording status
    await db('recordings')
      .where('id', recordingId)
      .update({
        transcription_status: 'none',
        updated_at: new Date(),
      });

    logger.info('Transcription cancelled', { recordingId, jobId: job.id });
    return true;
  }

  /**
   * Retry a failed transcription
   */
  async retryTranscription(
    recordingId: string,
    organizationId: string,
    userId?: string
  ): Promise<TranscriptionJob> {
    // Get the failed job to copy options
    const failedJob = await db('transcription_jobs')
      .where('recording_id', recordingId)
      .where('organization_id', organizationId)
      .where('status', 'failed')
      .orderBy('created_at', 'desc')
      .first();

    const options = failedJob?.options ? JSON.parse(failedJob.options) : {};

    // Start a new transcription
    return this.startTranscription(recordingId, organizationId, {
      userId,
      language: failedJob?.language,
      ...options,
    });
  }

  /**
   * Get transcription history for a recording
   */
  async getTranscriptionHistory(
    recordingId: string,
    organizationId: string
  ): Promise<TranscriptionJob[]> {
    return db('transcription_jobs')
      .where('recording_id', recordingId)
      .where('organization_id', organizationId)
      .orderBy('created_at', 'desc');
  }

  /**
   * Get all transcription jobs for an organization
   */
  async getOrganizationTranscriptionJobs(
    organizationId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<TranscriptionJob[]> {
    let query = db('transcription_jobs')
      .where('organization_id', organizationId)
      .orderBy('created_at', 'desc');

    if (options?.status) {
      query = query.where('status', options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query;
  }

  /**
   * Handle transcription callback from Python worker
   * Called when the Python worker completes transcription
   */
  async handleTranscriptionCallback(data: {
    recordingId: string;
    transcriptText: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }>;
    language: string;
    duration: number;
    metadata?: {
      modelUsed?: string;
      processingTime?: number;
    };
  }): Promise<void> {
    const { recordingId, transcriptText, segments, language, duration, metadata } = data;
    const log = logger.child({ recordingId });

    log.info('[DIAG] Processing transcription callback', {
      segmentsCount: segments.length,
      language,
      duration,
      transcriptTextLength: transcriptText?.length || 0,
    });

    // Update recording with transcription data
    const updateResult = await db('recordings')
      .where('id', recordingId)
      .update({
        transcription_status: 'completed',
        transcript_text: transcriptText,
        transcript_language: language,
        transcript_duration_seconds: duration,
        updated_at: new Date(),
      });

    log.info('[DIAG] Recording update result', {
      rowsUpdated: updateResult,
      recordingId,
    });

    // Verify the update
    const verifyRecording = await db('recordings')
      .where('id', recordingId)
      .first('id', 'transcription_status', 'is_temp_rubric_generation');
    
    log.info('[DIAG] Verified recording after update', {
      recordingId,
      found: !!verifyRecording,
      transcriptionStatus: verifyRecording?.transcription_status,
      isTempRubricGeneration: verifyRecording?.is_temp_rubric_generation,
    });

    // Delete existing segments and insert new ones
    await db('transcription_segments')
      .where('recording_id', recordingId)
      .delete();

    if (segments.length > 0) {
      const segmentRecords = segments.map((segment, index) => ({
        recording_id: recordingId,
        start_time: segment.start,
        end_time: segment.end,
        text: segment.text,
        speaker: segment.speaker,
        segment_index: index,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      // Batch insert
      const batchSize = 100;
      for (let i = 0; i < segmentRecords.length; i += batchSize) {
        const batch = segmentRecords.slice(i, i + batchSize);
        await db('transcription_segments').insert(batch);
      }
    }

    // Update transcription job
    await db('transcription_jobs')
      .where('recording_id', recordingId)
      .whereIn('status', ['pending', 'processing'])
      .update({
        status: 'completed',
        completed_at: new Date(),
        model_used: metadata?.modelUsed,
        processing_duration_seconds: metadata?.processingTime,
        progress: 100,
        stage: 'completed',
        updated_at: new Date(),
      });

    log.info('[DIAG] Transcription callback processed successfully');

    // Trigger auto-analysis if enabled for this recording's task
    try {
      await this.triggerAutoAnalysisIfEnabled(recordingId);
    } catch (error) {
      log.error('Failed to trigger auto-analysis after transcription callback', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - transcription was successful, analysis failure shouldn't affect that
    }
  }

  /**
   * Trigger auto-analysis if the recording's task has a template with autoAnalyze enabled
   */
  private async triggerAutoAnalysisIfEnabled(recordingId: string): Promise<void> {
    const log = logger.child({ recordingId });

    // Get recording with task and template info
    const recording = await db('recordings')
      .where('recordings.id', recordingId)
      .first();

    if (!recording || !recording.task_id) {
      log.debug('No task associated with recording, skipping auto-analysis');
      return;
    }

    // Skip if this is a temp recording for rubric generation
    if (recording.is_temp_rubric_generation) {
      log.debug('Temp rubric generation recording, skipping auto-analysis');
      return;
    }

    const task = await db('tasks').where('id', recording.task_id).first();
    if (!task || !task.template_id) {
      log.debug('No template associated with task, skipping auto-analysis', {
        taskId: recording.task_id,
      });
      return;
    }

    const template = await db('task_templates').where('id', task.template_id).first();
    if (!template || !template.evaluation_criteria) {
      log.debug('No evaluation criteria in template, skipping auto-analysis', {
        templateId: task.template_id,
      });
      return;
    }

    const evaluationCriteria = template.evaluation_criteria;

    // Check if auto-analyze is enabled
    if (!evaluationCriteria.autoAnalyze) {
      log.debug('Auto-analyze not enabled for template, skipping', {
        templateId: task.template_id,
      });
      return;
    }

    // Check if there are rubric steps to analyze
    if (!evaluationCriteria.rubricSteps?.length) {
      log.debug('No rubric steps in template, skipping auto-analysis', {
        templateId: task.template_id,
      });
      return;
    }

    // Import and queue analysis
    const { analysisQueue } = await import('../queues/definitions/analysis.queue');

    // Create analysis job record
    const [analysisJob] = await db('analysis_jobs')
      .insert({
        recording_id: recordingId,
        task_id: task.id,
        organization_id: recording.organization_id,
        status: 'pending',
        progress: 0,
        stage: 'queued',
        config_snapshot: evaluationCriteria,
        created_at: new Date(),
      })
      .returning('*');

    // Fetch org slug for storage path construction
    const org = await db('organizations')
      .where('id', recording.organization_id)
      .select('slug')
      .first();
    const orgSlug = org?.slug || 'unknown';

    // Queue the analysis job
    await analysisQueue.add({
      recordingId,
      taskId: task.id,
      rubricSteps: evaluationCriteria.rubricSteps,
      analysisJobId: analysisJob.id,
      organizationId: recording.organization_id,
      orgSlug,
      triggeredByUserId: recording.user_id,
      passingScore: evaluationCriteria.passingScore || 70,
      scoringMethod: evaluationCriteria.scoringMethod || 'weighted',
    });

    // Update recording's analysis_status
    await db('recordings')
      .where('id', recordingId)
      .update({
        analysis_status: 'pending',
        updated_at: new Date(),
      });

    log.info('Auto-analysis queued after transcription callback', {
      analysisJobId: analysisJob.id,
      taskId: task.id,
      templateId: task.template_id,
      rubricStepsCount: evaluationCriteria.rubricSteps.length,
    });
  }
}

export const transcriptionService = new TranscriptionService();
export default transcriptionService;
