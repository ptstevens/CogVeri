import { BaseQueue } from '../base.queue';
import { TranscriptionJobData, TranscriptionJobResult, JobName } from '../types/job-types';
import { QUEUE_CONFIGS } from '../../config/bullmq';

/**
 * Transcription Queue
 * Handles asynchronous audio/video transcription using Whisper
 *
 * Features:
 * - Automatic retries with exponential backoff
 * - Progress tracking for long-running jobs
 * - Priority-based processing
 * - Integration with Python Whisper worker
 */
export class TranscriptionQueue extends BaseQueue<TranscriptionJobData, TranscriptionJobResult> {
  constructor() {
    super(QUEUE_CONFIGS.transcription.name, {
      defaultJobOptions: QUEUE_CONFIGS.transcription.defaultJobOptions,
    });
  }

  /**
   * Get job name based on recording ID
   * Useful for monitoring and debugging
   */
  protected getJobName(data: TranscriptionJobData): string {
    return `${JobName.TRANSCRIPTION}:${data.recordingId}`;
  }

  /**
   * Add a high-priority transcription job
   * Use for user-initiated requests
   */
  async addHighPriority(data: TranscriptionJobData) {
    return this.add(data, { priority: 1 });
  }

  /**
   * Add a low-priority transcription job
   * Use for batch processing or background tasks
   */
  async addLowPriority(data: TranscriptionJobData) {
    return this.add(data, { priority: 10 });
  }

  /**
   * Add a transcription job with custom language
   */
  async addWithLanguage(data: Omit<TranscriptionJobData, 'language'>, language: string) {
    return this.add({ ...data, language });
  }

  /**
   * Add multiple transcriptions in bulk
   */
  async addBulkTranscriptions(transcriptions: TranscriptionJobData[]) {
    return this.addBulk(transcriptions.map((data) => ({ data })));
  }

  /**
   * Get jobs by recording ID
   */
  async getJobsByRecordingId(recordingId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 1000),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 1000),
      this.getFailedJobs(0, 1000),
    ]);

    return allJobs.flat().filter((job) => job.data.recordingId === recordingId);
  }
}

// Singleton instance
let transcriptionQueueInstance: TranscriptionQueue | null = null;

/**
 * Get or create the TranscriptionQueue singleton instance
 */
export function getTranscriptionQueue(): TranscriptionQueue {
  if (!transcriptionQueueInstance) {
    transcriptionQueueInstance = new TranscriptionQueue();
  }
  return transcriptionQueueInstance;
}

// Type-safe helper for adding transcription jobs
export const transcriptionQueueHelpers = {
  /**
   * Queue a transcription for a recording
   */
  queueTranscription: async (params: {
    recordingId: string;
    fileUrl: string;
    organizationId: string;
    orgSlug: string;
    userId?: string;
    language?: string;
    options?: {
      includeSpeakerDiarization?: boolean;
      includeTimestamps?: boolean;
      vocabularyFilter?: string[];
    };
  }) => {
    const queue = getTranscriptionQueue();
    return queue.add({
      recordingId: params.recordingId,
      fileUrl: params.fileUrl,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      userId: params.userId,
      language: params.language,
      options: params.options,
    });
  },

  /**
   * Queue a high-priority transcription (user-initiated)
   */
  queueHighPriorityTranscription: async (params: {
    recordingId: string;
    fileUrl: string;
    organizationId: string;
    orgSlug: string;
    userId?: string;
    language?: string;
  }) => {
    const queue = getTranscriptionQueue();
    return queue.addHighPriority({
      recordingId: params.recordingId,
      fileUrl: params.fileUrl,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      userId: params.userId,
      language: params.language,
    });
  },

  /**
   * Get transcription job status by recording ID
   */
  getTranscriptionStatus: async (recordingId: string) => {
    const queue = getTranscriptionQueue();
    const jobs = await queue.getJobsByRecordingId(recordingId);

    if (jobs.length === 0) {
      return null;
    }

    // Return the most recent job
    const sortedJobs = jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const latestJob = sortedJobs[0];

    if (!latestJob) {
      return null;
    }

    const state = await latestJob.getState();
    const progress = latestJob.progress as
      { percentage?: number; stage?: string; message?: string } | number;

    return {
      jobId: latestJob.id,
      state,
      progress: typeof progress === 'number' ? progress : progress?.percentage || 0,
      stage: typeof progress === 'object' ? progress?.stage : undefined,
      message: typeof progress === 'object' ? progress?.message : undefined,
      attemptsMade: latestJob.attemptsMade,
      result: state === 'completed' ? latestJob.returnvalue : undefined,
      failedReason: state === 'failed' ? latestJob.failedReason : undefined,
    };
  },

  /**
   * Cancel a pending transcription job
   */
  cancelTranscription: async (recordingId: string): Promise<boolean> => {
    const queue = getTranscriptionQueue();
    const jobs = await queue.getJobsByRecordingId(recordingId);

    let cancelled = false;
    for (const job of jobs) {
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
        cancelled = true;
      }
    }

    return cancelled;
  },
};
