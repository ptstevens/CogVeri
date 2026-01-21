import { Worker, Job, Queue, WorkerOptions, Processor, JobProgress as BullMQJobProgress } from 'bullmq';
import { logger } from '../utils/logger';
import { getRedisConnection, QUEUE_PREFIX } from '../config/bullmq';
import { JobProgress } from './types/job-types';
import { db } from '../config/database';

/**
 * Dead Letter Queue (DLQ) job data structure
 * Contains the original job data plus failure context
 */
export interface DeadLetterJobData<TData = unknown> {
  originalJob: {
    id: string;
    name: string;
    data: TData;
    attemptsMade: number;
    processedOn?: number;
    finishedOn?: number;
    timestamp: number;
  };
  failureReason: string;
  failureStack?: string;
  failedAt: string;
  sourceQueue: string;
}

/**
 * Abstract base class for BullMQ workers/processors
 * Provides a typed wrapper around Worker with common functionality
 *
 * @template TData - The type of data for jobs in this queue
 * @template TResult - The type of result returned by job processing
 */
export abstract class BaseProcessor<TData = unknown, TResult = unknown> {
  protected worker: Worker<TData, TResult, string> | null = null;
  protected readonly queueName: string;
  protected readonly concurrency: number;
  private isShuttingDown = false;

  // Dead Letter Queue for jobs that fail all retry attempts
  private deadLetterQueue: Queue<DeadLetterJobData<TData>> | null = null;
  private readonly dlqEnabled: boolean;

  /**
   * Create a new processor instance
   * @param queueName - The queue name to process (must match the queue it's consuming)
   * @param concurrency - Number of concurrent jobs to process
   * @param enableDLQ - Whether to enable dead letter queue (default: true)
   */
  constructor(queueName: string, concurrency = 1, enableDLQ = true) {
    this.queueName = queueName;
    this.concurrency = concurrency;
    this.dlqEnabled = enableDLQ;

    // Initialize DLQ if enabled
    if (this.dlqEnabled) {
      this.initializeDeadLetterQueue();
    }
  }

  /**
   * Initialize the Dead Letter Queue for this processor
   */
  private initializeDeadLetterQueue(): void {
    const dlqName = `${this.queueName}-dlq`;
    this.deadLetterQueue = new Queue<DeadLetterJobData<TData>>(dlqName, {
      connection: getRedisConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        removeOnComplete: false, // Keep DLQ jobs until manually processed
        removeOnFail: false,
        attempts: 1, // DLQ jobs shouldn't auto-retry
      },
    });

    logger.info(`Dead Letter Queue initialized: ${QUEUE_PREFIX}:${dlqName}`);
  }

  /**
   * Abstract method that subclasses must implement
   * This is where the actual job processing logic goes
   * @param job - The job to process
   * @returns The result of processing
   */
  protected abstract process(job: Job<TData, TResult, string>): Promise<TResult>;

  /**
   * Start the worker to begin processing jobs
   * @param options - Optional worker configuration overrides
   */
  start(options?: Partial<WorkerOptions>): void {
    if (this.worker) {
      logger.warn(`Worker already running for queue: ${this.queueName}`);
      return;
    }

    const workerOptions: WorkerOptions = {
      connection: getRedisConnection(),
      prefix: QUEUE_PREFIX,
      concurrency: this.concurrency,
      ...options,
    };

    // Create the processor function that wraps our abstract process method
    const processor: Processor<TData, TResult, string> = async (job: Job<TData, TResult, string>) => {
      return this.handleJob(job);
    };

    this.worker = new Worker<TData, TResult, string>(this.queueName, processor, workerOptions);

    // Set up event handlers
    this.setupEventHandlers();

    logger.info(`Worker started for queue: ${QUEUE_PREFIX}:${this.queueName}`, {
      concurrency: this.concurrency,
    });
  }

  /**
   * Internal job handler with logging, error handling, metrics, and RLS context
   *
   * Security: Sets PostgreSQL RLS context if job data contains organizationId.
   * This ensures all database queries within the job respect tenant isolation.
   */
  private async handleJob(job: Job<TData, TResult, string>): Promise<TResult> {
    const startTime = Date.now();
    const jobData = job.data as Record<string, unknown>;
    const organizationId = jobData?.organizationId as string | undefined;

    const jobContext = {
      jobId: job.id,
      queueName: this.queueName,
      attemptsMade: job.attemptsMade,
      organizationId,
    };

    logger.info(`Processing job [${this.queueName}]: ${job.id}`, jobContext);

    try {
      // Set RLS context for tenant isolation if organizationId is provided
      if (organizationId) {
        await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);
        logger.debug(`RLS context set for job [${this.queueName}]: ${job.id}`, { organizationId });
      }

      // Call the subclass implementation
      const result = await this.process(job);

      const duration = Date.now() - startTime;
      logger.info(`Job completed [${this.queueName}]: ${job.id}`, {
        ...jobContext,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Job failed [${this.queueName}]: ${job.id}`, {
        ...jobContext,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Re-throw to let BullMQ handle retry logic
      throw error;
    }
  }

  /**
   * Set up event handlers for the worker
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job: Job<TData, TResult, string>, result: TResult) => {
      logger.debug(`Job completed event [${this.queueName}]: ${job.id}`, {
        jobId: job.id,
        result: typeof result === 'object' ? JSON.stringify(result).slice(0, 200) : result,
      });
      this.onCompleted(job, result);
    });

    this.worker.on('failed', (job: Job<TData, TResult, string> | undefined, error: Error) => {
      if (job) {
        logger.error(`Job failed event [${this.queueName}]: ${job.id}`, {
          jobId: job.id,
          error: error.message,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts?.attempts || 'default',
        });
        // Note: onFailed is async but we don't await here to not block the event handler
        this.onFailed(job, error).catch(err => {
          logger.error(`Error in onFailed handler [${this.queueName}]:`, { error: err.message });
        });
      } else {
        logger.error(`Job failed event [${this.queueName}]: unknown job`, {
          error: error.message,
        });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error(`Worker error [${this.queueName}]:`, { error: error.message });
      this.onError(error);
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn(`Job stalled [${this.queueName}]: ${jobId}`);
      this.onStalled(jobId);
    });

    this.worker.on('progress', (job: Job<TData, TResult, string>, progress: BullMQJobProgress) => {
      logger.debug(`Job progress [${this.queueName}]: ${job.id}`, {
        jobId: job.id,
        progress,
      });
      this.onProgress(job, progress);
    });

    this.worker.on('active', (job: Job<TData, TResult, string>) => {
      logger.debug(`Job active [${this.queueName}]: ${job.id}`);
    });
  }

  /**
   * Report job progress
   * @param job - The job to update progress for
   * @param progress - Progress data (percentage or detailed object)
   */
  protected async reportProgress(
    job: Job<TData, TResult, string>,
    progress: number | JobProgress
  ): Promise<void> {
    await job.updateProgress(progress);
  }

  /**
   * Gracefully stop the worker
   * Waits for active jobs to complete before shutting down
   * @param force - If true, force close without waiting
   */
  async stop(force = false): Promise<void> {
    if (!this.worker && !this.deadLetterQueue) {
      return;
    }

    if (this.isShuttingDown) {
      logger.warn(`Worker already shutting down: ${this.queueName}`);
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Stopping worker for queue: ${this.queueName}`, { force });

    try {
      // Close worker
      if (this.worker) {
        await this.worker.close(force);
        this.worker = null;
      }

      // Close DLQ connection
      if (this.deadLetterQueue) {
        await this.deadLetterQueue.close();
        this.deadLetterQueue = null;
        logger.info(`Dead Letter Queue closed for: ${this.queueName}`);
      }

      this.isShuttingDown = false;
      logger.info(`Worker stopped for queue: ${this.queueName}`);
    } catch (error) {
      this.isShuttingDown = false;
      logger.error(`Error stopping worker [${this.queueName}]:`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Pause the worker (stop taking new jobs, let active ones complete)
   */
  async pause(force = false): Promise<void> {
    if (this.worker) {
      await this.worker.pause(force);
      logger.info(`Worker paused: ${this.queueName}`);
    }
  }

  /**
   * Resume the worker
   */
  resume(): void {
    if (this.worker) {
      this.worker.resume();
      logger.info(`Worker resumed: ${this.queueName}`);
    }
  }

  /**
   * Check if the worker is running
   */
  isRunning(): boolean {
    return this.worker !== null && !this.isShuttingDown;
  }

  /**
   * Get the queue name this processor handles
   */
  getQueueName(): string {
    return this.queueName;
  }

  // ==========================================================================
  // Lifecycle hooks - can be overridden by subclasses
  // ==========================================================================

  /**
   * Called when a job completes successfully
   * Override to add custom behavior
   */
  protected onCompleted(_job: Job<TData, TResult, string>, _result: TResult): void {
    // Default: no-op, subclasses can override
  }

  /**
   * Called when a job fails
   * If the job has exhausted all retry attempts, it's moved to the Dead Letter Queue
   * Override to add custom error handling
   */
  protected async onFailed(job: Job<TData, TResult, string>, error: Error): Promise<void> {
    // Check if job has exhausted all retry attempts
    const maxAttempts = job.opts?.attempts || 3; // Default attempts
    const isLastAttempt = job.attemptsMade >= maxAttempts;

    if (isLastAttempt && this.deadLetterQueue) {
      await this.moveToDeadLetterQueue(job, error);
    }
  }

  /**
   * Move a failed job to the Dead Letter Queue
   * Preserves all job data and failure context for later inspection
   */
  private async moveToDeadLetterQueue(job: Job<TData, TResult, string>, error: Error): Promise<void> {
    if (!this.deadLetterQueue) return;

    const dlqJobData: DeadLetterJobData<TData> = {
      originalJob: {
        id: job.id || 'unknown',
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        timestamp: job.timestamp,
      },
      failureReason: error.message,
      failureStack: error.stack,
      failedAt: new Date().toISOString(),
      sourceQueue: this.queueName,
    };

    try {
      await this.deadLetterQueue.add(
        `dlq-${job.name}`,
        dlqJobData,
        {
          jobId: `dlq-${job.id}-${Date.now()}`,
        }
      );

      logger.warn(`Job moved to DLQ [${this.queueName}]: ${job.id}`, {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        error: error.message,
        dlqQueue: `${this.queueName}-dlq`,
      });
    } catch (dlqError) {
      logger.error(`Failed to move job to DLQ [${this.queueName}]: ${job.id}`, {
        jobId: job.id,
        error: dlqError instanceof Error ? dlqError.message : String(dlqError),
      });
    }
  }

  /**
   * Get the Dead Letter Queue instance
   * Useful for admin operations like viewing/retrying failed jobs
   */
  getDeadLetterQueue(): Queue<DeadLetterJobData<TData>> | null {
    return this.deadLetterQueue;
  }

  /**
   * Get count of jobs in the Dead Letter Queue
   */
  async getDeadLetterQueueCount(): Promise<number> {
    if (!this.deadLetterQueue) return 0;
    const counts = await this.deadLetterQueue.getJobCounts('waiting', 'delayed');
    return (counts.waiting || 0) + (counts.delayed || 0);
  }

  /**
   * Called when the worker encounters an error
   * Override to add custom error handling
   */
  protected onError(_error: Error): void {
    // Default: no-op, subclasses can override
  }

  /**
   * Called when a job becomes stalled
   * Override to add custom handling
   */
  protected onStalled(_jobId: string): void {
    // Default: no-op, subclasses can override
  }

  /**
   * Called when a job reports progress
   * Override to add custom progress handling
   */
  protected onProgress(_job: Job<TData, TResult, string>, _progress: BullMQJobProgress): void {
    // Default: no-op, subclasses can override
  }
}
