import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { getRedisConnection, isQueueWorkersEnabled, validateBullMQConfig } from '../config/bullmq';
import { BaseQueue } from '../queues/base.queue';
import { BaseProcessor } from '../queues/base.processor';

/**
 * Queue registration entry
 */
interface QueueEntry {
  queue: BaseQueue<unknown, unknown>;
  processor?: BaseProcessor<unknown, unknown>;
}

/**
 * Queue Service Singleton
 * Manages all BullMQ queues and workers in the application
 *
 * Features:
 * - Centralized queue registration and management
 * - Automatic worker startup based on configuration
 * - Graceful shutdown handling
 * - Health check support
 * - Connection management
 */
class QueueService {
  private static instance: QueueService;
  private queues: Map<string, QueueEntry> = new Map();
  private redisConnection: Redis | null = null;
  private isInitialized = false;
  private isShuttingDown = false;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of QueueService
   */
  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * Initialize the queue service
   * Should be called once during application startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Queue service already initialized');
      return;
    }

    logger.info('Initializing queue service...');

    // Validate configuration
    validateBullMQConfig();

    // Create shared Redis connection for health checks
    try {
      const connectionConfig = getRedisConnection();
      this.redisConnection = new Redis({
        host: connectionConfig.host,
        port: connectionConfig.port,
        password: connectionConfig.password,
        db: connectionConfig.db,
        lazyConnect: true,
      });

      await this.redisConnection.connect();
      logger.info('Queue service Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis for queue service:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    this.isInitialized = true;
    logger.info('Queue service initialized successfully');
  }

  /**
   * Register a queue with an optional processor
   * @param queue - The queue instance to register
   * @param processor - Optional processor/worker for the queue
   */
  registerQueue<TData, TResult>(
    queue: BaseQueue<TData, TResult>,
    processor?: BaseProcessor<TData, TResult>
  ): void {
    const queueName = queue.getName();

    if (this.queues.has(queueName)) {
      logger.warn(`Queue already registered: ${queueName}`);
      return;
    }

    this.queues.set(queueName, {
      queue: queue as BaseQueue<unknown, unknown>,
      processor: processor as BaseProcessor<unknown, unknown> | undefined,
    });
    logger.info(`Queue registered: ${queueName}`, {
      hasProcessor: !!processor,
    });
  }

  /**
   * Get a registered queue by name
   * @param name - The queue name
   * @returns The queue instance or undefined
   */
  getQueue<TData = unknown, TResult = unknown>(
    name: string
  ): BaseQueue<TData, TResult> | undefined {
    const entry = this.queues.get(name);
    return entry?.queue as BaseQueue<TData, TResult> | undefined;
  }

  /**
   * Get all registered queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Start all registered workers
   * Only starts workers if QUEUE_WORKERS_ENABLED is true
   */
  startAllWorkers(): void {
    if (!isQueueWorkersEnabled()) {
      logger.info('Queue workers disabled - skipping worker startup');
      return;
    }

    logger.info(`Starting workers for ${this.queues.size} registered queues...`);

    let workersStarted = 0;
    for (const [queueName, entry] of this.queues) {
      if (entry.processor) {
        entry.processor.start();
        workersStarted++;
        logger.info(`Worker started for queue: ${queueName}`);
      } else {
        logger.debug(`No processor registered for queue: ${queueName}`);
      }
    }

    logger.info(`Started ${workersStarted} queue workers`);
  }

  /**
   * Stop a specific worker
   * @param queueName - The queue name whose worker to stop
   * @param force - If true, force stop without waiting for active jobs
   */
  async stopWorker(queueName: string, force = false): Promise<void> {
    const entry = this.queues.get(queueName);
    if (entry?.processor) {
      await entry.processor.stop(force);
    }
  }

  /**
   * Gracefully shutdown all queues and workers
   * @param force - If true, force close without waiting for active jobs
   * @param timeout - Maximum time to wait for graceful shutdown (ms)
   */
  async gracefulShutdown(force = false, timeout = 30000): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Queue service already shutting down');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting queue service graceful shutdown...');

    const shutdownPromises: Promise<void>[] = [];

    // Stop all workers first
    for (const [queueName, entry] of this.queues) {
      if (entry.processor?.isRunning()) {
        logger.info(`Stopping worker: ${queueName}`);
        shutdownPromises.push(
          entry.processor.stop(force).catch((error) => {
            logger.error(`Error stopping worker ${queueName}:`, {
              error: error instanceof Error ? error.message : String(error),
            });
          })
        );
      }
    }

    // Wait for workers with timeout
    try {
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
        ),
      ]);
      logger.info('All workers stopped successfully');
    } catch (error) {
      logger.warn('Worker shutdown timeout - forcing close');
      // Force stop remaining workers
      for (const [, entry] of this.queues) {
        if (entry.processor?.isRunning()) {
          await entry.processor.stop(true).catch(() => {});
        }
      }
    }

    // Close all queues
    for (const [queueName, entry] of this.queues) {
      try {
        await entry.queue.close();
        logger.debug(`Queue closed: ${queueName}`);
      } catch (error) {
        logger.error(`Error closing queue ${queueName}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Close Redis connection
    if (this.redisConnection) {
      try {
        await this.redisConnection.quit();
        this.redisConnection = null;
        logger.info('Queue service Redis connection closed');
      } catch (error) {
        logger.error('Error closing Redis connection:', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.queues.clear();
    this.isInitialized = false;
    this.isShuttingDown = false;
    logger.info('Queue service shutdown complete');
  }

  /**
   * Check the health of the queue system
   * @returns Health status object
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    redis: 'connected' | 'disconnected';
    queues: {
      name: string;
      waiting: number;
      active: number;
      failed: number;
      workerRunning: boolean;
    }[];
    error?: string;
  }> {
    const result: {
      healthy: boolean;
      redis: 'connected' | 'disconnected';
      queues: {
        name: string;
        waiting: number;
        active: number;
        failed: number;
        workerRunning: boolean;
      }[];
      error?: string;
    } = {
      healthy: true,
      redis: 'disconnected',
      queues: [],
    };

    // Check Redis connection
    try {
      if (this.redisConnection) {
        await this.redisConnection.ping();
        result.redis = 'connected';
      }
    } catch (error) {
      result.healthy = false;
      result.redis = 'disconnected';
      result.error = 'Redis connection failed';
    }

    // Check each queue
    for (const [queueName, entry] of this.queues) {
      try {
        const counts = await entry.queue.getJobCounts();
        result.queues.push({
          name: queueName,
          waiting: counts.waiting,
          active: counts.active,
          failed: counts.failed,
          workerRunning: entry.processor?.isRunning() ?? false,
        });
      } catch (error) {
        result.healthy = false;
        result.queues.push({
          name: queueName,
          waiting: -1,
          active: -1,
          failed: -1,
          workerRunning: false,
        });
      }
    }

    return result;
  }

  /**
   * Get statistics for all queues
   */
  async getStats(): Promise<
    Map<
      string,
      {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        paused: number;
      }
    >
  > {
    const stats = new Map<
      string,
      {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        paused: number;
      }
    >();

    for (const [queueName, entry] of this.queues) {
      try {
        const counts = await entry.queue.getJobCounts();
        stats.set(queueName, counts);
      } catch (error) {
        logger.error(`Error getting stats for queue ${queueName}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
        stats.set(queueName, {
          waiting: -1,
          active: -1,
          completed: -1,
          failed: -1,
          delayed: -1,
          paused: -1,
        });
      }
    }

    return stats;
  }

  /**
   * Clean old jobs from all queues
   * @param olderThanMs - Clean jobs older than this many milliseconds
   */
  async cleanAllQueues(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
    logger.info(`Cleaning jobs older than ${olderThanMs}ms from all queues`);

    for (const [queueName, entry] of this.queues) {
      try {
        await entry.queue.clean(olderThanMs, 1000, 'completed');
        await entry.queue.clean(olderThanMs, 1000, 'failed');
        logger.debug(`Cleaned queue: ${queueName}`);
      } catch (error) {
        logger.error(`Error cleaning queue ${queueName}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check if the service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }
}

// Export singleton instance
export const queueService = QueueService.getInstance();

// Export for testing
export { QueueService };
