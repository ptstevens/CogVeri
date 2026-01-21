import { Router, Request, Response } from 'express';
import { db } from '../config/database';
import { getRedisClient } from '../config/redis';
import { logger, getCorrelationId } from '../utils/logger';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const router = Router();

/**
 * Health Check Routes
 *
 * Provides comprehensive health checking for the CogVeri backend:
 * - Basic health check for load balancers
 * - Detailed readiness check for Kubernetes
 * - Individual component status checks
 *
 * SLI Targets:
 * - /health: < 100ms response time, 99.99% availability
 * - /health/ready: < 500ms response time, 99.9% availability
 */

// Application metadata
const APP_VERSION = process.env.npm_package_version || '1.0.0';
// Note: APP_NAME ('cogveri-backend') and START_TIME could be added to health responses if needed

/**
 * Component health status
 */
interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  lastChecked: string;
}

/**
 * Full health response
 */
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  uptimeHuman: string;
  timestamp: string;
  correlationId: string;
  environment: string;
  components?: {
    database: ComponentHealth;
    redis: ComponentHealth;
    storage: ComponentHealth;
  };
  metrics?: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

/**
 * Convert uptime in seconds to human readable format
 */
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
};

/**
 * Check PostgreSQL database health
 */
const checkDatabaseHealth = async (): Promise<ComponentHealth> => {
  const start = Date.now();
  try {
    await db.raw('SELECT 1').timeout(5000);
    return {
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Database health check failed:', { error: message });
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      message,
      lastChecked: new Date().toISOString(),
    };
  }
};

/**
 * Check Redis health
 */
const checkRedisHealth = async (): Promise<ComponentHealth> => {
  const start = Date.now();
  const redis = getRedisClient();

  if (!redis) {
    return {
      status: 'degraded',
      message: 'Redis not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    await redis.ping();
    return {
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Redis health check failed:', { error: message });
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      message,
      lastChecked: new Date().toISOString(),
    };
  }
};

/**
 * Check R2/S3 storage health
 */
const checkStorageHealth = async (): Promise<ComponentHealth> => {
  const start = Date.now();

  // Check if storage is configured
  const bucketName = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucketName || !accessKeyId || !secretAccessKey) {
    return {
      status: 'degraded',
      message: 'Storage not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const s3Client = new S3Client({
      region: process.env.R2_REGION || process.env.AWS_REGION || 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Check if bucket is accessible
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));

    return {
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Storage health check failed:', { error: message });
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      message,
      lastChecked: new Date().toISOString(),
    };
  }
};

/**
 * Determine overall health status from component statuses
 */
const determineOverallStatus = (components: {
  database: ComponentHealth;
  redis: ComponentHealth;
  storage: ComponentHealth;
}): 'healthy' | 'degraded' | 'unhealthy' => {
  // Database is critical - if it's down, we're unhealthy
  if (components.database.status === 'unhealthy') {
    return 'unhealthy';
  }

  // Check if any component is unhealthy
  const statuses = Object.values(components).map(c => c.status);
  if (statuses.includes('unhealthy')) {
    return 'degraded';
  }

  // Check if any component is degraded
  if (statuses.includes('degraded')) {
    return 'degraded';
  }

  return 'healthy';
};

/**
 * GET /health
 * Basic health check - used by load balancers
 *
 * This endpoint is designed to be fast and lightweight.
 * It only checks the database connectivity with a short timeout.
 */
router.get('/', async (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();

  try {
    // Quick database check with short timeout
    await db.raw('SELECT 1').timeout(5000);

    const uptime = process.uptime();

    const response: Partial<HealthResponse> = {
      status: 'healthy',
      version: APP_VERSION,
      uptime,
      uptimeHuman: formatUptime(uptime),
      timestamp: new Date().toISOString(),
      correlationId,
      environment: process.env.NODE_ENV || 'development',
    };

    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Basic health check failed:', { correlationId, error: message });

    res.status(503).json({
      status: 'unhealthy',
      version: APP_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      correlationId,
      environment: process.env.NODE_ENV || 'development',
      message: 'Database connectivity check failed',
    });
  }
});

/**
 * GET /health/ready
 * Detailed readiness check - used by Kubernetes readiness probes
 *
 * This endpoint checks all dependencies and returns detailed status.
 * Use this to determine if the service is ready to receive traffic.
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();

  try {
    // Check all components in parallel
    const [database, redis, storage] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkStorageHealth(),
    ]);

    const components = { database, redis, storage };
    const overallStatus = determineOverallStatus(components);

    const uptime = process.uptime();

    const response: HealthResponse = {
      status: overallStatus,
      version: APP_VERSION,
      uptime,
      uptimeHuman: formatUptime(uptime),
      timestamp: new Date().toISOString(),
      correlationId,
      environment: process.env.NODE_ENV || 'development',
      components,
      metrics: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    // Return 503 if unhealthy (Kubernetes will not route traffic)
    // Return 200 if healthy or degraded (can still serve requests)
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

    res.status(statusCode).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Readiness check failed:', { correlationId, error: message });

    res.status(503).json({
      status: 'unhealthy',
      version: APP_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      correlationId,
      environment: process.env.NODE_ENV || 'development',
      message: 'Readiness check failed',
      error: message,
    });
  }
});

/**
 * GET /health/live
 * Liveness check - used by Kubernetes liveness probes
 *
 * This endpoint only checks if the process is alive and responsive.
 * If this fails, Kubernetes will restart the pod.
 */
router.get('/live', (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();

  res.status(200).json({
    status: 'alive',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    correlationId,
    pid: process.pid,
    uptime: process.uptime(),
  });
});

/**
 * GET /health/components/database
 * Individual database health check
 */
router.get('/components/database', async (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();
  const health = await checkDatabaseHealth();

  res.status(health.status === 'healthy' ? 200 : 503).json({
    correlationId,
    ...health,
  });
});

/**
 * GET /health/components/redis
 * Individual Redis health check
 */
router.get('/components/redis', async (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();
  const health = await checkRedisHealth();

  // Redis being degraded is acceptable
  const statusCode = health.status === 'unhealthy' ? 503 : 200;

  res.status(statusCode).json({
    correlationId,
    ...health,
  });
});

/**
 * GET /health/components/storage
 * Individual storage (R2/S3) health check
 */
router.get('/components/storage', async (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();
  const health = await checkStorageHealth();

  // Storage being degraded is acceptable
  const statusCode = health.status === 'unhealthy' ? 503 : 200;

  res.status(statusCode).json({
    correlationId,
    ...health,
  });
});

/**
 * GET /health/startup
 * Startup check - used by Kubernetes startup probes
 *
 * This endpoint checks if the application has completed startup.
 * It's more lenient than readiness and allows time for initialization.
 */
router.get('/startup', async (_req: Request, res: Response) => {
  const correlationId = getCorrelationId();

  try {
    // Only check database on startup - other services can come up later
    const database = await checkDatabaseHealth();

    if (database.status === 'healthy') {
      res.status(200).json({
        status: 'started',
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        correlationId,
        uptime: process.uptime(),
        database,
      });
    } else {
      res.status(503).json({
        status: 'starting',
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        correlationId,
        uptime: process.uptime(),
        database,
        message: 'Waiting for database connection',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    res.status(503).json({
      status: 'starting',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      correlationId,
      uptime: process.uptime(),
      message: 'Startup check failed',
      error: message,
    });
  }
});

export default router;
