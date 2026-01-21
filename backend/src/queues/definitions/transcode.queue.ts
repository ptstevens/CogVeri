import { BaseQueue } from '../base.queue';
import { TranscodeJobData, TranscodeJobResult, JobName, TranscodeQuality } from '../types/job-types';
import { QUEUE_CONFIGS } from '../../config/bullmq';

/**
 * Transcode Queue
 * Handles video transcoding to multiple formats and resolutions.
 *
 * Features:
 * - Multi-resolution output (480p, 720p, 1080p)
 * - Format conversion (WebM to MP4)
 * - Progress tracking for long-running jobs
 * - HLS segment generation for adaptive streaming
 */
export class TranscodeQueue extends BaseQueue<TranscodeJobData, TranscodeJobResult> {
  constructor() {
    super(QUEUE_CONFIGS.transcode.name, {
      defaultJobOptions: QUEUE_CONFIGS.transcode.defaultJobOptions,
    });
  }

  /**
   * Get job name based on recording ID and quality
   */
  protected getJobName(data: TranscodeJobData): string {
    return `${JobName.TRANSCODE}:${data.recordingId}:${data.quality || 'medium'}`;
  }

  /**
   * Add a high-priority transcode job
   */
  async addHighPriority(data: TranscodeJobData) {
    return this.add(data, { priority: 1 });
  }

  /**
   * Transcode to all standard qualities
   */
  async transcodeAllQualities(
    recordingId: string,
    inputFileUrl: string,
    organizationId: string,
    orgSlug: string
  ) {
    const qualities: TranscodeQuality[] = [
      TranscodeQuality.LOW,
      TranscodeQuality.MEDIUM,
      TranscodeQuality.HIGH,
    ];

    const jobs = qualities.map((quality) => ({
      data: {
        recordingId,
        inputFileUrl,
        organizationId,
        orgSlug,
        quality,
        outputFormat: 'mp4' as const,
      },
    }));

    return this.addBulk(jobs);
  }

  /**
   * Get jobs by recording ID
   */
  async getJobsByRecordingId(recordingId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 100),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 100),
      this.getFailedJobs(0, 100),
    ]);

    return allJobs.flat().filter(job => job.data.recordingId === recordingId);
  }
}

// Singleton instance
let transcodeQueueInstance: TranscodeQueue | null = null;

export function getTranscodeQueue(): TranscodeQueue {
  if (!transcodeQueueInstance) {
    transcodeQueueInstance = new TranscodeQueue();
  }
  return transcodeQueueInstance;
}

export const transcodeQueueHelpers = {
  /**
   * Queue a transcode job
   */
  queueTranscode: async (params: {
    recordingId: string;
    inputFileUrl: string;
    organizationId: string;
    orgSlug: string;
    quality?: TranscodeQuality;
    outputFormat?: 'mp4' | 'webm';
    options?: {
      maxBitrate?: number;
      audioBitrate?: number;
      frameRate?: number;
      stripAudio?: boolean;
    };
  }) => {
    const queue = getTranscodeQueue();
    return queue.add({
      recordingId: params.recordingId,
      inputFileUrl: params.inputFileUrl,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      quality: params.quality || TranscodeQuality.MEDIUM,
      outputFormat: params.outputFormat || 'mp4',
      options: params.options,
    });
  },

  /**
   * Queue all quality variants
   */
  queueAllQualities: async (params: {
    recordingId: string;
    inputFileUrl: string;
    organizationId: string;
    orgSlug: string;
  }) => {
    const queue = getTranscodeQueue();
    return queue.transcodeAllQualities(
      params.recordingId,
      params.inputFileUrl,
      params.organizationId,
      params.orgSlug
    );
  },

  /**
   * Get transcode status for a recording
   */
  getTranscodeStatus: async (recordingId: string) => {
    const queue = getTranscodeQueue();
    const jobs = await queue.getJobsByRecordingId(recordingId);

    if (jobs.length === 0) {
      return null;
    }

    const statusByQuality: Record<string, any> = {};

    for (const job of jobs) {
      const quality = job.data.quality || 'unknown';
      const state = await job.getState();
      const progress = job.progress as { percentage?: number } | number;

      statusByQuality[quality] = {
        jobId: job.id,
        state,
        progress: typeof progress === 'number' ? progress : progress?.percentage || 0,
        result: state === 'completed' ? job.returnvalue : undefined,
        failedReason: state === 'failed' ? job.failedReason : undefined,
      };
    }

    return statusByQuality;
  },
};
