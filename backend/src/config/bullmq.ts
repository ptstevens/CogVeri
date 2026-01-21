import { DefaultJobOptions } from 'bullmq';
import { logger } from '../utils/logger';

/**
 * BullMQ Configuration
 * Centralized configuration for job queues and workers
 */

// Redis connection configuration type
export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
}

// Redis connection configuration for BullMQ
export const getRedisConnection = (): RedisConnectionConfig => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Improves connection performance
  };
};

// Queue prefix for namespacing all queues
export const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'cogveri';

// Default job options applied to all queues unless overridden
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // Initial delay of 1 second
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000, // Keep maximum 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days for debugging
  },
};

// Queue-specific configurations
export const QUEUE_CONFIGS = {
  // Email queue - lower retry attempts, quick processing
  email: {
    name: 'email',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 5, // More retries for transient email failures
      backoff: {
        type: 'exponential' as const,
        delay: 2000, // Start with 2 second delay for rate limits
      },
    },
  },

  // Transcription queue - long-running jobs
  transcription: {
    name: 'transcription',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2, // Fewer retries for expensive operations
      backoff: {
        type: 'exponential' as const,
        delay: 5000,
      },
    },
  },

  // Thumbnail generation queue - quick processing
  thumbnail: {
    name: 'thumbnail',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 3,
      backoff: {
        type: 'fixed' as const,
        delay: 1000,
      },
    },
  },

  // Video transcoding queue - long-running jobs
  transcode: {
    name: 'transcode',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2,
      backoff: {
        type: 'exponential' as const,
        delay: 10000, // 10 second initial delay
      },
    },
  },

  // AI Analysis queue - orchestrates speech + visual analysis
  analysis: {
    name: 'analysis',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2, // Expensive AI calls, limit retries
      backoff: {
        type: 'exponential' as const,
        delay: 30000, // 30 second initial delay for rate limits
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60, // Keep for 7 days (longer for audit)
        count: 500,
      },
    },
  },

  // Frame extraction queue - FFmpeg frame extraction
  frameExtraction: {
    name: 'frame-extraction',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 3,
      backoff: {
        type: 'fixed' as const,
        delay: 5000,
      },
    },
  },

  // Rubric template generation queue - background rubric + template creation
  rubricTemplateGeneration: {
    name: 'rubric-template-generation',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2, // Expensive AI calls, limit retries
      backoff: {
        type: 'exponential' as const,
        delay: 30000, // 30 second initial delay for rate limits
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60, // Keep for 7 days
        count: 200,
      },
    },
  },
} as const;

// Worker concurrency settings
export const WORKER_CONCURRENCY = {
  email: parseInt(process.env.QUEUE_EMAIL_CONCURRENCY || '5', 10),
  transcription: parseInt(process.env.QUEUE_TRANSCRIPTION_CONCURRENCY || '2', 10),
  thumbnail: parseInt(process.env.QUEUE_THUMBNAIL_CONCURRENCY || '3', 10),
  transcode: parseInt(process.env.QUEUE_TRANSCODE_CONCURRENCY || '1', 10),
  analysis: parseInt(process.env.QUEUE_ANALYSIS_CONCURRENCY || '1', 10), // Rate-limited AI calls
  frameExtraction: parseInt(process.env.QUEUE_FRAME_EXTRACTION_CONCURRENCY || '2', 10),
  rubricTemplateGeneration: parseInt(process.env.QUEUE_RUBRIC_TEMPLATE_CONCURRENCY || '1', 10), // Long-running AI jobs
};

/**
 * Check if queue workers should be enabled
 * Useful for separating API servers from worker processes
 */
export const isQueueWorkersEnabled = (): boolean => {
  const enabled = process.env.QUEUE_WORKERS_ENABLED !== 'false';
  if (!enabled) {
    logger.info('Queue workers are disabled via QUEUE_WORKERS_ENABLED=false');
  }
  return enabled;
};


/**
 * Check if the Node.js transcription worker should be enabled
 * Set TRANSCRIPTION_WORKER_ENABLED=false when using external transcription (e.g., Python Whisper)
 * This prevents the Node.js worker from competing with external workers for queue jobs
 */
export const isTranscriptionWorkerEnabled = (): boolean => {
  const enabled = process.env.TRANSCRIPTION_WORKER_ENABLED !== 'false';
  if (!enabled) {
    logger.info('Node.js transcription worker disabled via TRANSCRIPTION_WORKER_ENABLED=false');
    logger.info('Transcription jobs will be processed by external worker (e.g., Python Whisper)');
  }
  return enabled;
};

/**
 * Validate BullMQ configuration
 * Call during application startup to catch configuration issues early
 */
export const validateBullMQConfig = (): void => {
  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT;

  if (!redisHost && process.env.NODE_ENV === 'production') {
    logger.warn('REDIS_HOST not set in production - using localhost');
  }

  logger.info(`BullMQ configured with Redis at ${redisHost || 'localhost'}:${redisPort || '6379'}`);
  logger.info(`Queue prefix: ${QUEUE_PREFIX}`);
  logger.info(`Worker concurrency: email=${WORKER_CONCURRENCY.email}, transcription=${WORKER_CONCURRENCY.transcription}, thumbnail=${WORKER_CONCURRENCY.thumbnail}, transcode=${WORKER_CONCURRENCY.transcode}, analysis=${WORKER_CONCURRENCY.analysis}, frameExtraction=${WORKER_CONCURRENCY.frameExtraction}`);
};
