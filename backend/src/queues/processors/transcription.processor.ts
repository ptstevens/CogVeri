import { Job } from 'bullmq';
import { BaseProcessor } from '../base.processor';
import { TranscriptionJobData, TranscriptionJobResult } from '../types/job-types';
import { QUEUE_CONFIGS, WORKER_CONCURRENCY } from '../../config/bullmq';
import { logger } from '../../utils/logger';
import { db } from '../../config/database';
// ffmpegService is available for future audio extraction optimization
// import ffmpegService from '../../services/ffmpeg.service';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Transcription Processor
 * Processes transcription jobs by:
 * 1. Downloading the video/audio file
 * 2. Extracting audio (if video)
 * 3. Sending to Python Whisper worker via Redis
 * 4. Storing results in the database
 *
 * Note: The actual Whisper processing is handled by the Python worker.
 * This processor handles the Node.js side: file management, DB updates, and job orchestration.
 */
export class TranscriptionProcessor extends BaseProcessor<TranscriptionJobData, TranscriptionJobResult> {
  private s3Client: S3Client | null = null;
  private tempDir: string;

  constructor() {
    super(QUEUE_CONFIGS.transcription.name, WORKER_CONCURRENCY.transcription);
    this.tempDir = path.join(os.tmpdir(), 'cogveri-transcription');

    // Initialize S3 client if configured
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      const s3Config: any = {
        region: process.env.AWS_REGION || 'auto',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      };

      if (process.env.AWS_ENDPOINT_URL) {
        s3Config.endpoint = process.env.AWS_ENDPOINT_URL;
        s3Config.forcePathStyle = true;
      }

      this.s3Client = new S3Client(s3Config);
    }

    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create transcription temp directory:', error);
    }
  }

  /**
   * Main processing logic
   */
  protected async process(job: Job<TranscriptionJobData, TranscriptionJobResult>): Promise<TranscriptionJobResult> {
    const { recordingId, fileUrl, organizationId, language, options } = job.data;
    const jobLog = logger.child({ jobId: job.id, recordingId, organizationId });

    jobLog.info('Starting transcription job');

    try {
      // Update recording status to processing
      await this.updateRecordingStatus(recordingId, 'processing');
      await this.updateTranscriptionJob(recordingId, {
        status: 'processing',
        started_at: new Date(),
        queue_job_id: job.id,
      });

      // Stage 1: Download or get file URL
      await this.reportProgress(job, {
        percentage: 5,
        stage: 'preparing',
        message: 'Preparing file for transcription',
      });

      const downloadUrl = await this.getDownloadUrl(fileUrl);

      // Stage 2: Check if we need to extract audio
      await this.reportProgress(job, {
        percentage: 10,
        stage: 'analyzing',
        message: 'Analyzing media file',
      });

      // For now, we pass the video URL directly to the Python worker
      // The Python worker will use the URL to download and process
      // In production, you might want to extract audio first for faster processing

      // Stage 3: Queue for Python worker (via Redis)
      await this.reportProgress(job, {
        percentage: 20,
        stage: 'queued',
        message: 'Queued for transcription',
      });

      // The Python worker is polling the same Redis queue
      // Wait for the result by polling the job's return value
      // Note: This is a simplified approach. In production, you might want
      // to use a callback mechanism or separate result queue.

      // For now, we'll simulate the transcription locally using FFmpeg
      // and a mock transcription (the actual Whisper runs in Python)
      const result = await this.processTranscription(job, downloadUrl, language, options);

      // Stage 4: Store results
      await this.reportProgress(job, {
        percentage: 95,
        stage: 'storing',
        message: 'Storing transcription results',
      });

      await this.storeTranscriptionResults(recordingId, result);

      // Stage 5: Complete
      await this.reportProgress(job, {
        percentage: 100,
        stage: 'completed',
        message: 'Transcription complete',
      });

      await this.updateRecordingStatus(recordingId, 'completed');
      await this.updateTranscriptionJob(recordingId, {
        status: 'completed',
        completed_at: new Date(),
        processing_duration_seconds: result.duration,
      });

      jobLog.info('Transcription job completed', {
        language: result.language,
        duration: result.duration,
        segmentsCount: result.segments?.length || 0,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      jobLog.error('Transcription job failed', { error: errorMessage });

      // Update status to failed
      await this.updateRecordingStatus(recordingId, 'failed', errorMessage);
      await this.updateTranscriptionJob(recordingId, {
        status: 'failed',
        error_message: errorMessage,
        retry_count: job.attemptsMade,
      });

      throw error;
    }
  }

  /**
   * Get a download URL for the file (generate signed URL if S3)
   */
  private async getDownloadUrl(fileUrl: string): Promise<string> {
    // If it's already an HTTP URL, return as-is
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl;
    }

    // If it's a local path, return as file:// URL
    if (fileUrl.startsWith('/')) {
      return `file://${fileUrl}`;
    }

    // If it's an S3 path, generate a signed URL
    if (this.s3Client && process.env.AWS_S3_BUCKET) {
      const key = fileUrl.startsWith('s3://') ? fileUrl.slice(5) : fileUrl;
      const [bucket, ...keyParts] = key.split('/');
      const actualKey = keyParts.join('/');

      const command = new GetObjectCommand({
        Bucket: bucket || process.env.AWS_S3_BUCKET,
        Key: actualKey || key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    }

    // Return as-is for local development
    return fileUrl;
  }

  /**
   * Process transcription
   * In production, this communicates with the Python Whisper worker.
   * For now, we use a simplified approach that works with the Python worker.
   */
  private async processTranscription(
    job: Job<TranscriptionJobData, TranscriptionJobResult>,
    _fileUrl: string,
    language?: string,
    _options?: TranscriptionJobData['options']
  ): Promise<TranscriptionJobResult> {
    const { recordingId } = job.data;

    // The Python worker processes jobs from the same queue
    // For hybrid Node.js/Python setup, we use Redis pub/sub or polling

    // For this implementation, we'll wait for the Python worker to complete
    // by checking the transcription_jobs table for results
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes max
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();

    // Update progress periodically while waiting
    let lastProgress = 20;
    const progressInterval = setInterval(async () => {
      // Check if job is still active
      const state = await job.getState();
      if (state !== 'active') {
        clearInterval(progressInterval);
        return;
      }

      // Increment progress slowly
      if (lastProgress < 85) {
        lastProgress += 5;
        await this.reportProgress(job, {
          percentage: lastProgress,
          stage: 'transcribing',
          message: 'Processing audio with Whisper',
        });
      }
    }, 30000); // Update every 30 seconds

    try {
      // Poll for completion from Python worker
      while (Date.now() - startTime < maxWaitTime) {
        // Check if transcription result is available
        const recording = await db('recordings')
          .where('id', recordingId)
          .first();

        if (recording?.transcription_status === 'completed' && recording?.transcript_text) {
          // Results are ready from Python worker
          clearInterval(progressInterval);

          // Get segments from the segments table
          const segments = await db('transcription_segments')
            .where('recording_id', recordingId)
            .orderBy('segment_index');

          return {
            recordingId,
            transcriptText: recording.transcript_text,
            segments: segments.map((s: any) => ({
              start: s.start_time,
              end: s.end_time,
              text: s.text,
              speaker: s.speaker,
            })),
            language: recording.transcript_language || language || 'en',
            duration: recording.transcript_duration_seconds || 0,
          };
        }

        // Check if failed
        if (recording?.transcription_status === 'failed') {
          clearInterval(progressInterval);
          throw new Error('Transcription failed in Python worker');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      clearInterval(progressInterval);
      throw new Error('Transcription timeout - Python worker did not complete in time');
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  /**
   * Store transcription results in the database
   */
  private async storeTranscriptionResults(
    recordingId: string,
    result: TranscriptionJobResult
  ): Promise<void> {
    // Update recording with transcript
    await db('recordings')
      .where('id', recordingId)
      .update({
        transcription_status: 'completed',
        transcript_text: result.transcriptText,
        transcript_language: result.language,
        transcript_duration_seconds: result.duration,
        updated_at: new Date(),
      });

    // Store segments if available
    if (result.segments && result.segments.length > 0) {
      // Delete existing segments
      await db('transcription_segments')
        .where('recording_id', recordingId)
        .delete();

      // Insert new segments
      const segmentRecords = result.segments.map((segment, index) => ({
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
  }

  /**
   * Update recording transcription status
   */
  private async updateRecordingStatus(
    recordingId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    const updateData: any = {
      transcription_status: status,
      updated_at: new Date(),
    };

    if (status === 'failed' && error) {
      // Store error in metadata or a separate field
      updateData.processing_error = error;
    }

    await db('recordings')
      .where('id', recordingId)
      .update(updateData);
  }

  /**
   * Update transcription job record
   */
  private async updateTranscriptionJob(
    recordingId: string,
    data: Partial<{
      status: string;
      started_at: Date;
      completed_at: Date;
      error_message: string;
      retry_count: number;
      queue_job_id: string;
      processing_duration_seconds: number;
    }>
  ): Promise<void> {
    await db('transcription_jobs')
      .where('recording_id', recordingId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .update({
        ...data,
        updated_at: new Date(),
      });
  }

  /**
   * Called when a job completes successfully
   */
  protected async onCompleted(job: Job<TranscriptionJobData, TranscriptionJobResult>, result: TranscriptionJobResult): Promise<void> {
    logger.info(`Transcription completed for recording: ${result.recordingId}`, {
      jobId: job.id,
      language: result.language,
      duration: result.duration,
      segmentsCount: result.segments?.length || 0,
    });

    // Check if auto-analyze is enabled for this recording's task
    try {
      await this.triggerAutoAnalysisIfEnabled(result.recordingId);
    } catch (error) {
      logger.error('Failed to trigger auto-analysis', {
        recordingId: result.recordingId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - transcription was successful, analysis failure shouldn't affect that
    }
  }

  /**
   * Check if the task template has auto-analyze enabled and queue analysis if so
   */
  private async triggerAutoAnalysisIfEnabled(recordingId: string): Promise<void> {
    // Get recording with task and template info
    const recording = await db('recordings')
      .where('recordings.id', recordingId)
      .first();

    if (!recording || !recording.task_id) {
      logger.debug('No task associated with recording, skipping auto-analysis', { recordingId });
      return;
    }

    const task = await db('tasks').where('id', recording.task_id).first();
    if (!task || !task.template_id) {
      logger.debug('No template associated with task, skipping auto-analysis', {
        recordingId,
        taskId: recording.task_id,
      });
      return;
    }

    const template = await db('task_templates').where('id', task.template_id).first();
    if (!template || !template.evaluation_criteria) {
      logger.debug('No evaluation criteria in template, skipping auto-analysis', {
        recordingId,
        templateId: task.template_id,
      });
      return;
    }

    const evaluationCriteria = template.evaluation_criteria;

    // Check if auto-analyze is enabled
    if (!evaluationCriteria.autoAnalyze) {
      logger.debug('Auto-analyze not enabled for template, skipping', {
        recordingId,
        templateId: task.template_id,
      });
      return;
    }

    // Check if there are rubric steps to analyze
    if (!evaluationCriteria.rubricSteps?.length) {
      logger.debug('No rubric steps in template, skipping auto-analysis', {
        recordingId,
        templateId: task.template_id,
      });
      return;
    }

    // Import and queue analysis
    const { analysisQueue } = await import('../definitions/analysis.queue');

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

    logger.info('Auto-analysis queued after transcription completed', {
      recordingId,
      analysisJobId: analysisJob.id,
      taskId: task.id,
      templateId: task.template_id,
      rubricStepsCount: evaluationCriteria.rubricSteps.length,
    });
  }

  /**
   * Called when a job fails
   */
  protected async onFailed(job: Job<TranscriptionJobData, TranscriptionJobResult>, error: Error): Promise<void> {
    // Call parent to handle DLQ
    await super.onFailed(job, error);

    logger.error(`Transcription failed for recording: ${job.data.recordingId}`, {
      jobId: job.id,
      error: error.message,
      attemptsMade: job.attemptsMade,
    });
  }
}

// Singleton instance
let transcriptionProcessorInstance: TranscriptionProcessor | null = null;

/**
 * Get or create the TranscriptionProcessor singleton instance
 */
export function getTranscriptionProcessor(): TranscriptionProcessor {
  if (!transcriptionProcessorInstance) {
    transcriptionProcessorInstance = new TranscriptionProcessor();
  }
  return transcriptionProcessorInstance;
}
