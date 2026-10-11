import { BaseQueue } from '../base.queue';
import {
  RubricTemplateGenerationJobData,
  RubricTemplateGenerationJobResult,
  JobName,
} from '../types/job-types';
import { QUEUE_CONFIGS } from '../../config/bullmq';
import { logger } from '../../utils/logger';
import { db } from '../../config/database';

/**
 * Rubric Template Generation Queue
 * Handles background processing for:
 * 1. Waiting for transcription to complete
 * 2. AI-powered rubric generation from video
 * 3. Template creation as draft
 * 4. User notification on completion
 */
export class RubricTemplateGenerationQueue extends BaseQueue<
  RubricTemplateGenerationJobData,
  RubricTemplateGenerationJobResult
> {
  constructor() {
    super(QUEUE_CONFIGS.rubricTemplateGeneration.name, {
      defaultJobOptions: QUEUE_CONFIGS.rubricTemplateGeneration.defaultJobOptions,
    });
  }

  /**
   * Get job name based on temp video ID
   */
  protected getJobName(data: RubricTemplateGenerationJobData): string {
    return `${JobName.RUBRIC_TEMPLATE_GENERATION}:${data.tempVideoId}`;
  }

  /**
   * Get jobs by temp video ID
   */
  async getJobsByTempVideoId(tempVideoId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 1000),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 1000),
      this.getFailedJobs(0, 1000),
    ]);

    return allJobs.flat().filter((job) => job.data.tempVideoId === tempVideoId);
  }

  /**
   * Get jobs by organization ID
   */
  async getJobsByOrganizationId(organizationId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 1000),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 1000),
      this.getFailedJobs(0, 1000),
    ]);

    return allJobs.flat().filter((job) => job.data.organizationId === organizationId);
  }
}

// Singleton instance
let rubricTemplateGenerationQueueInstance: RubricTemplateGenerationQueue | null = null;

/**
 * Get or create the RubricTemplateGenerationQueue singleton instance
 */
export function getRubricTemplateGenerationQueue(): RubricTemplateGenerationQueue {
  if (!rubricTemplateGenerationQueueInstance) {
    rubricTemplateGenerationQueueInstance = new RubricTemplateGenerationQueue();
  }
  return rubricTemplateGenerationQueueInstance;
}

// Lazy singleton exports for convenient access
export const rubricTemplateGenerationQueue = {
  add: (data: RubricTemplateGenerationJobData) => getRubricTemplateGenerationQueue().add(data),
  getJobsByTempVideoId: (tempVideoId: string) =>
    getRubricTemplateGenerationQueue().getJobsByTempVideoId(tempVideoId),
  getJobsByOrganizationId: (organizationId: string) =>
    getRubricTemplateGenerationQueue().getJobsByOrganizationId(organizationId),
};

/**
 * Helper for queueing rubric template generation jobs
 */
export const rubricTemplateGenerationQueueHelpers = {
  /**
   * Queue a rubric template generation job
   * Called after video upload to start background processing
   */
  queueGeneration: async (params: {
    tempVideoId: string;
    tempRecordingId: string;
    organizationId: string;
    userId: string;
    storageKey: string;
    storageBucket?: string;
    templateTitle: string;
    taskType: string;
    templateDescription?: string;
    templateCategory?: string;
    templatePriority?: 'low' | 'medium' | 'high' | 'urgent';
    customContext?: string;
    metadata?: Record<string, unknown>;
  }) => {
    logger.info('Queueing rubric template generation job', {
      tempVideoId: params.tempVideoId,
      organizationId: params.organizationId,
      templateTitle: params.templateTitle,
      taskType: params.taskType,
    });

    // Fetch org slug for storage path construction
    const org = await db('organizations').where('id', params.organizationId).select('slug').first();
    const orgSlug = org?.slug || 'unknown';

    const queue = getRubricTemplateGenerationQueue();
    const job = await queue.add({
      tempVideoId: params.tempVideoId,
      tempRecordingId: params.tempRecordingId,
      organizationId: params.organizationId,
      orgSlug,
      userId: params.userId,
      storageKey: params.storageKey,
      storageBucket: params.storageBucket,
      templateTitle: params.templateTitle,
      taskType: params.taskType,
      templateDescription: params.templateDescription,
      templateCategory: params.templateCategory,
      templatePriority: params.templatePriority,
      customContext: params.customContext,
      metadata: params.metadata,
    });

    logger.info('Rubric template generation job queued', {
      jobId: job.id,
      tempVideoId: params.tempVideoId,
    });

    return {
      jobId: job.id,
      tempVideoId: params.tempVideoId,
    };
  },
};
