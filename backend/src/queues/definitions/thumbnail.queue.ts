import { BaseQueue } from '../base.queue';
import { ThumbnailJobData, ThumbnailJobResult, JobName } from '../types/job-types';
import { QUEUE_CONFIGS } from '../../config/bullmq';

/**
 * Thumbnail Queue
 * Handles thumbnail generation from video recordings.
 *
 * Features:
 * - Multiple timestamp capture
 * - Customizable dimensions
 * - Multiple format output (JPEG, PNG, WebP)
 */
export class ThumbnailQueue extends BaseQueue<ThumbnailJobData, ThumbnailJobResult> {
  constructor() {
    super(QUEUE_CONFIGS.thumbnail.name, {
      defaultJobOptions: QUEUE_CONFIGS.thumbnail.defaultJobOptions,
    });
  }

  /**
   * Get job name based on recording ID
   */
  protected getJobName(data: ThumbnailJobData): string {
    return `${JobName.THUMBNAIL}:${data.recordingId}`;
  }

  /**
   * Add a high-priority thumbnail job
   */
  async addHighPriority(data: ThumbnailJobData) {
    return this.add(data, { priority: 1 });
  }

  /**
   * Generate multiple thumbnails at different timestamps
   */
  async generateMultipleThumbnails(
    recordingId: string,
    fileUrl: string,
    organizationId: string,
    orgSlug: string,
    timestamps: number[]
  ) {
    const jobs = timestamps.map((timestamp) => ({
      data: {
        recordingId,
        fileUrl,
        organizationId,
        orgSlug,
        options: {
          timestamp,
          width: 320,
          height: 180,
          format: 'jpeg' as const,
        },
      },
    }));

    return this.addBulk(jobs);
  }
}

// Singleton instance
let thumbnailQueueInstance: ThumbnailQueue | null = null;

export function getThumbnailQueue(): ThumbnailQueue {
  if (!thumbnailQueueInstance) {
    thumbnailQueueInstance = new ThumbnailQueue();
  }
  return thumbnailQueueInstance;
}

export const thumbnailQueueHelpers = {
  /**
   * Queue a thumbnail generation job
   */
  queueThumbnail: async (params: {
    recordingId: string;
    fileUrl: string;
    organizationId: string;
    orgSlug: string;
    options?: {
      timestamp?: number;
      width?: number;
      height?: number;
      format?: 'jpeg' | 'png' | 'webp';
    };
  }) => {
    const queue = getThumbnailQueue();
    return queue.add({
      recordingId: params.recordingId,
      fileUrl: params.fileUrl,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      options: params.options,
    });
  },

  /**
   * Queue default thumbnail (at 25% of video duration)
   */
  queueDefaultThumbnail: async (params: {
    recordingId: string;
    fileUrl: string;
    organizationId: string;
    orgSlug: string;
  }) => {
    const queue = getThumbnailQueue();
    return queue.add({
      recordingId: params.recordingId,
      fileUrl: params.fileUrl,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      options: {
        width: 320,
        height: 180,
        format: 'jpeg',
      },
    });
  },
};
