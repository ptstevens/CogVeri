/**
 * Cleanup Temp Rubric Videos Job
 *
 * BullMQ repeatable job that runs hourly to clean up expired
 * temporary videos used for rubric generation.
 *
 * Configuration:
 *   - Runs every hour
 *   - Deletes temp videos older than 24 hours
 *   - Cleans up from both S3 and Redis
 */

import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { rubricGenerationService } from '../services/rubric-generation.service';
import { logger } from '../utils/logger';

// Job configuration
const QUEUE_NAME = 'cleanup-temp-rubric-videos';
const JOB_NAME = 'cleanup';

// Schedule: Run every hour at minute 0
const CRON_SCHEDULE = '0 * * * *';

// Job data type (empty for this cleanup job)
interface CleanupJobData {
  triggeredAt?: string;
  manual?: boolean;
}

// Job result type
interface CleanupJobResult {
  cleaned: number;
  errors: number;
  durationMs: number;
}

/**
 * Cleanup job queue class
 */
class CleanupTempRubricVideosQueue {
  private queue: Queue<CleanupJobData, CleanupJobResult> | null = null;
  private worker: Worker<CleanupJobData, CleanupJobResult> | null = null;
  private isInitialized = false;

  /**
   * Initialize the queue and worker
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const redis = getRedisClient();
    if (!redis) {
      logger.warn('Redis not available, cleanup job not started');
      return;
    }

    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    };

    const queueOptions: QueueOptions = {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    };

    const workerOptions: WorkerOptions = {
      connection,
      concurrency: 1, // Only one cleanup job at a time
    };

    try {
      // Create queue
      this.queue = new Queue<CleanupJobData, CleanupJobResult>(QUEUE_NAME, queueOptions);

      // Create worker with processor
      this.worker = new Worker<CleanupJobData, CleanupJobResult>(
        QUEUE_NAME,
        this.processJob.bind(this),
        workerOptions
      );

      // Set up event handlers
      this.setupEventHandlers();

      // Schedule the repeatable job
      await this.scheduleRepeatableJob();

      this.isInitialized = true;
      logger.info('Cleanup temp rubric videos job initialized', {
        queue: QUEUE_NAME,
        schedule: CRON_SCHEDULE,
      });

    } catch (error) {
      logger.error('Failed to initialize cleanup job', { error });
      throw error;
    }
  }

  /**
   * Process the cleanup job
   */
  private async processJob(job: Job<CleanupJobData, CleanupJobResult>): Promise<CleanupJobResult> {
    const startTime = Date.now();

    logger.info('Starting temp rubric video cleanup', {
      jobId: job.id,
      manual: job.data.manual,
    });

    try {
      const { cleaned, errors } = await rubricGenerationService.cleanupExpiredTempVideos();

      const durationMs = Date.now() - startTime;

      logger.info('Temp rubric video cleanup completed', {
        jobId: job.id,
        cleaned,
        errors,
        durationMs,
      });

      return { cleaned, errors, durationMs };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error('Temp rubric video cleanup failed', {
        jobId: job.id,
        error,
        durationMs,
      });
      throw error;
    }
  }

  /**
   * Schedule the repeatable cleanup job
   */
  private async scheduleRepeatableJob(): Promise<void> {
    if (!this.queue) {
      return;
    }

    // Remove any existing repeatable jobs first
    const existingJobs = await this.queue.getRepeatableJobs();
    for (const existingJob of existingJobs) {
      if (existingJob.name === JOB_NAME) {
        await this.queue.removeRepeatableByKey(existingJob.key);
      }
    }

    // Add the repeatable job with cron schedule
    await this.queue.add(
      JOB_NAME,
      { triggeredAt: new Date().toISOString() },
      {
        repeat: {
          pattern: CRON_SCHEDULE,
        },
        jobId: `${JOB_NAME}-repeatable`,
      }
    );

    logger.info('Repeatable cleanup job scheduled', { schedule: CRON_SCHEDULE });
  }

  /**
   * Set up event handlers for the worker
   */
  private setupEventHandlers(): void {
    if (!this.worker) {
      return;
    }

    this.worker.on('completed', (job, result) => {
      logger.debug('Cleanup job completed', {
        jobId: job.id,
        cleaned: result.cleaned,
        errors: result.errors,
      });
    });

    this.worker.on('failed', (job, error) => {
      logger.error('Cleanup job failed', {
        jobId: job?.id,
        error: error.message,
      });
    });

    this.worker.on('error', (error) => {
      logger.error('Cleanup worker error', { error });
    });
  }

  /**
   * Trigger manual cleanup (for admin use)
   */
  async triggerManualCleanup(): Promise<string | undefined> {
    if (!this.queue) {
      throw new Error('Queue not initialized');
    }

    const job = await this.queue.add(
      `${JOB_NAME}-manual`,
      {
        triggeredAt: new Date().toISOString(),
        manual: true,
      },
      {
        priority: 1, // High priority for manual runs
      }
    );

    logger.info('Manual cleanup triggered', { jobId: job.id });
    return job.id;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Close the queue and worker
   */
  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    this.isInitialized = false;
    logger.info('Cleanup job queue closed');
  }
}

// Singleton instance
let cleanupQueueInstance: CleanupTempRubricVideosQueue | null = null;

/**
 * Get or create the cleanup queue singleton
 */
export function getCleanupTempRubricVideosQueue(): CleanupTempRubricVideosQueue {
  if (!cleanupQueueInstance) {
    cleanupQueueInstance = new CleanupTempRubricVideosQueue();
  }
  return cleanupQueueInstance;
}

/**
 * Initialize the cleanup job (call at app startup)
 */
export async function initializeCleanupJob(): Promise<void> {
  const queue = getCleanupTempRubricVideosQueue();
  await queue.initialize();
}

/**
 * Close the cleanup job (call at app shutdown)
 */
export async function closeCleanupJob(): Promise<void> {
  if (cleanupQueueInstance) {
    await cleanupQueueInstance.close();
    cleanupQueueInstance = null;
  }
}

export { CleanupTempRubricVideosQueue };
