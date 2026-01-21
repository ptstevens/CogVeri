import { Queue, QueueOptions, Job, JobsOptions, BulkJobOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { getRedisConnection, QUEUE_PREFIX, DEFAULT_JOB_OPTIONS } from '../config/bullmq';

/**
 * Abstract base class for BullMQ queues
 * Provides a typed wrapper around Queue with common functionality
 *
 * @template TData - The type of data for jobs in this queue
 * @template TResult - The type of result returned by job processing
 */
export abstract class BaseQueue<TData = unknown, TResult = unknown> {
  protected queue: Queue;
  protected readonly queueName: string;

  /**
   * Create a new queue instance
   * @param name - The queue name (will be prefixed with QUEUE_PREFIX)
   * @param options - Optional queue configuration overrides
   */
  constructor(name: string, options?: Partial<QueueOptions>) {
    this.queueName = name;

    const queueOptions: QueueOptions = {
      connection: getRedisConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
      ...options,
    };

    this.queue = new Queue(name, queueOptions);

    // Log queue creation
    logger.info(`Queue initialized: ${QUEUE_PREFIX}:${name}`);

    // Handle queue errors
    this.queue.on('error', (error) => {
      logger.error(`Queue error [${this.queueName}]:`, { error: error.message });
    });
  }

  /**
   * Get the queue name
   */
  getName(): string {
    return this.queueName;
  }

  /**
   * Get the underlying BullMQ Queue instance
   */
  getQueue(): Queue {
    return this.queue;
  }

  /**
   * Add a job to the queue
   * @param data - The job data
   * @param options - Optional job-specific options
   * @returns The created job
   */
  async add(data: TData, options?: JobsOptions): Promise<Job<TData, TResult>> {
    const jobName = this.getJobName(data);
    const job = await this.queue.add(jobName, data, options);

    logger.debug(`Job added to queue [${this.queueName}]: ${job.id}`, {
      jobName,
      queueName: this.queueName,
      jobId: job.id,
    });

    return job as Job<TData, TResult>;
  }

  /**
   * Add multiple jobs to the queue in bulk
   * @param jobs - Array of job data with optional individual options
   * @returns Array of created jobs
   */
  async addBulk(
    jobs: Array<{ data: TData; opts?: BulkJobOptions }>
  ): Promise<Job<TData, TResult>[]> {
    const bulkJobs = jobs.map((job) => ({
      name: this.getJobName(job.data),
      data: job.data,
      opts: job.opts,
    }));

    const createdJobs = await this.queue.addBulk(bulkJobs);

    logger.info(`Bulk jobs added to queue [${this.queueName}]: ${createdJobs.length} jobs`, {
      queueName: this.queueName,
      jobCount: createdJobs.length,
    });

    return createdJobs as Job<TData, TResult>[];
  }

  /**
   * Get a job by ID
   * @param jobId - The job ID
   * @returns The job or undefined if not found
   */
  async getJob(jobId: string): Promise<Job<TData, TResult> | undefined> {
    const job = await this.queue.getJob(jobId);
    return job as Job<TData, TResult> | undefined;
  }

  /**
   * Remove a job from the queue
   * @param jobId - The job ID to remove
   * @returns True if the job was removed, false otherwise
   */
  async removeJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.debug(`Job removed from queue [${this.queueName}]: ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Get the count of jobs in various states
   */
  async getJobCounts(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  /**
   * Get waiting jobs
   * @param start - Start index
   * @param end - End index
   */
  async getWaitingJobs(start = 0, end = 100): Promise<Job<TData, TResult>[]> {
    const jobs = await this.queue.getJobs(['waiting'], start, end);
    return jobs as Job<TData, TResult>[];
  }

  /**
   * Get active jobs
   * @param start - Start index
   * @param end - End index
   */
  async getActiveJobs(start = 0, end = 100): Promise<Job<TData, TResult>[]> {
    const jobs = await this.queue.getJobs(['active'], start, end);
    return jobs as Job<TData, TResult>[];
  }

  /**
   * Get failed jobs
   * @param start - Start index
   * @param end - End index
   */
  async getFailedJobs(start = 0, end = 100): Promise<Job<TData, TResult>[]> {
    const jobs = await this.queue.getJobs(['failed'], start, end);
    return jobs as Job<TData, TResult>[];
  }

  /**
   * Get completed jobs
   * @param start - Start index
   * @param end - End index
   */
  async getCompletedJobs(start = 0, end = 100): Promise<Job<TData, TResult>[]> {
    const jobs = await this.queue.getJobs(['completed'], start, end);
    return jobs as Job<TData, TResult>[];
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info(`Queue paused: ${this.queueName}`);
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info(`Queue resumed: ${this.queueName}`);
  }

  /**
   * Drain the queue (remove all jobs)
   * @param delayed - Whether to also remove delayed jobs
   */
  async drain(delayed = false): Promise<void> {
    await this.queue.drain(delayed);
    logger.info(`Queue drained: ${this.queueName}`, { delayed });
  }

  /**
   * Clean old jobs from the queue
   * @param grace - Grace period in milliseconds
   * @param limit - Maximum number of jobs to remove
   * @param type - Type of jobs to clean
   */
  async clean(
    grace: number,
    limit: number,
    type: 'completed' | 'wait' | 'active' | 'paused' | 'delayed' | 'failed' = 'completed'
  ): Promise<string[]> {
    const removedJobIds = await this.queue.clean(grace, limit, type);
    logger.info(`Queue cleaned [${this.queueName}]: ${removedJobIds.length} ${type} jobs removed`);
    return removedJobIds;
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    await this.queue.close();
    logger.info(`Queue closed: ${this.queueName}`);
  }

  /**
   * Check if the queue is ready (connected to Redis)
   */
  async isReady(): Promise<boolean> {
    try {
      await this.queue.getJobCounts();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the job name for logging and tracking
   * Can be overridden by subclasses for custom naming
   * @param data - The job data
   */
  protected getJobName(_data: TData): string {
    // Default implementation uses queue name
    // Subclasses can override for more specific naming
    return this.queueName;
  }
}
