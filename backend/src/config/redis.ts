import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { withTimeout } from '../utils/timeout';

// Redis configuration with timeouts
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  // Connection timeout (fails fast if Redis is unavailable)
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000'),
  // Enable automatic reconnection
  retryStrategy: (times: number) => {
    // Stop retrying after 5 attempts
    if (times > 5) {
      logger.warn('Redis: max retry attempts reached, giving up');
      return null; // Return null to stop retrying
    }
    const delay = Math.min(times * 100, 2000);
    return delay;
  },
  // Set command timeout
  commandTimeout: 5000,
  // Enable offline queue but limit it
  enableOfflineQueue: true,
  offlineQueue: true,
  // Max retries before giving up
  maxRetriesPerRequest: 3,
  // Reconnection settings
  reconnectOnError: (err: Error) => {
    // Only reconnect on connection errors, not command errors
    const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
    return targetErrors.some(e => err.message.includes(e));
  },
};

// Create Redis client - lazy initialized
let redisClient: Redis | null = null;

/**
 * Get or initialize Redis client
 * Implements lazy initialization to handle optional Redis setup
 */
export const getRedisClient = (): Redis | null => {
  if (redisClient !== null) {
    return redisClient;
  }

  // If Redis is disabled via env var, return null
  if (process.env.REDIS_DISABLED === 'true') {
    logger.info('Redis is disabled');
    return null;
  }

  try {
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis error:', error);
      // Don't crash the app if Redis fails - it's optional for caching
    });

    redisClient.on('close', () => {
      logger.info('Redis connection closed');
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    return null;
  }
};

/**
 * Close Redis connection with timeout protection
 */
export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      // Use timeout to prevent hanging during shutdown
      await withTimeout(
        redisClient.quit(),
        5000,
        'Redis close'
      );
      redisClient = null;
      logger.info('Redis connection closed successfully');
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        logger.warn('Redis close timed out, forcing disconnect');
        redisClient?.disconnect();
        redisClient = null;
      } else {
        logger.error('Error closing Redis connection:', error);
      }
    }
  }
};

export { Redis };
