import dotenv from 'dotenv';

// Load environment variables FIRST, before any other imports that might use them
dotenv.config();

import express, { raw } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { logger, correlationMiddleware } from './utils/logger';
import { validateFrontendConfiguration, validateEnvironmentOrFail } from './utils/config';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter, authenticatedRateLimiter, authenticatedIpRateLimiter } from './middleware/rateLimiter';
import { optionalAuth } from './middleware/auth';
import { metricsRecordingMiddleware } from './middleware/metrics.middleware';
import { apiRateLimiter, checkHourlyQuota } from './middleware/api-rate-limiter';
import { csrfProtection, csrfCookieSetter } from './middleware/csrf.middleware';
import schedulerService from './services/scheduler.service';
import routes from './routes';
import healthRoutes from './routes/health';
import { handleStripeWebhook } from './webhooks/stripe';
import { connectDatabase } from './config/database';
import { initializeSocketIO } from './services/socket.service';
import { getRedisClient, closeRedis } from './config/redis';
import { queueService } from './services/queue.service';
import { isQueueWorkersEnabled, isTranscriptionWorkerEnabled } from './config/bullmq';
import { getSendEmailQueue } from './queues/definitions/send-email.queue';
import { getSendEmailProcessor } from './queues/processors/send-email.processor';
import { getTranscriptionQueue } from './queues/definitions/transcription.queue';
import { getTranscriptionProcessor } from './queues/processors/transcription.processor';
import { getTranscodeQueue } from './queues/definitions/transcode.queue';
import { getTranscodeProcessor } from './queues/processors/transcode.processor';
import { getThumbnailQueue } from './queues/definitions/thumbnail.queue';
import { getThumbnailProcessor } from './queues/processors/thumbnail.processor';
import { getAnalysisQueue } from './queues/definitions/analysis.queue';
import { initializeCleanupJob, closeCleanupJob } from './jobs/cleanup-temp-rubric-videos.job';
import { getAnalysisProcessor } from './queues/processors/analysis.processor';
import { getRubricTemplateGenerationQueue } from './queues/definitions/rubric-template-generation.queue';
import { getRubricTemplateGenerationProcessor } from './queues/processors/rubric-template-generation.processor';
import {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  setupExpressErrorHandler,
  flushSentry,
} from './config/sentry';

const app = express();
const httpServer = createServer(app);

// Parse CORS origins (supports comma-separated list)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

// Log CORS configuration at startup for debugging
console.log('[CORS] Configured origins:', corsOrigins);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// Initialize Sentry FIRST before any other middleware
initSentry();

// Trust proxy - required for Railway and rate limiting
app.set('trust proxy', 1);

// ============================================================
// STRIPE WEBHOOK - MUST be mounted BEFORE any body parsers or auth middleware
// Stripe requires the raw body for signature verification
// This endpoint is authenticated via Stripe signature, not JWT
// ============================================================
app.post(
  '/api/webhooks/stripe',
  raw({ type: 'application/json' }),
  handleStripeWebhook
);

// Sentry request handler must be the first middleware
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// Correlation ID middleware (adds X-Correlation-Id header)
app.use(correlationMiddleware());

// Basic middleware
// Generate nonce for inline scripts (more secure than 'unsafe-inline')
// In production with React, Vite handles this. This is for any inline scripts the server might need.
const generateNonce = () => {
  return require('crypto').randomBytes(16).toString('base64');
};

// Middleware to add nonce to response locals for use in templates
app.use((_req, res, next) => {
  res.locals.nonce = generateNonce();
  next();
});

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // Styles: unsafe-inline is acceptable for styles (lower XSS risk than scripts)
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // Scripts: No unsafe-inline in production - use nonces or hashes
      // For API server, we don't typically serve scripts, so strict policy is fine
      scriptSrc: process.env.NODE_ENV === 'production'
        ? ["'self'"]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Dev needs eval for HMR
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      // Connect: Allow API calls and WebSocket connections
      connectSrc: ["'self'", "wss:", "ws:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https:"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Upgrade insecure requests in production
      ...(process.env.NODE_ENV === 'production' && { upgradeInsecureRequests: [] }),
    },
  },
  // Additional security headers
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
}));

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

app.use(compression());

// JSON body parser
// Note: Stripe webhook is mounted BEFORE this middleware so it gets raw body
app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser - required for CSRF protection
app.use(cookieParser());

// Request logging
app.use(requestLogger);

// API metrics recording (non-blocking)
app.use(metricsRecordingMiddleware);

// Optional authentication - populate req.user if valid token present
// This runs early so rate limiters can identify authenticated users
app.use('/api', optionalAuth);

// Rate limiting
// 1. General rate limiter for anonymous users (skips authenticated)
app.use('/api', rateLimiter);
// 2. SECURITY: Baseline rate limiter for ALL authenticated users (500 req/min per user)
//    This provides a safety net regardless of tier-based limits
app.use('/api', authenticatedRateLimiter);
// 3. SECURITY: IP-based rate limiter for authenticated users (1000 req/min per IP)
//    Prevents compromised accounts from being weaponized for DDoS
app.use('/api', authenticatedIpRateLimiter);

// API quota enforcement (tracks API calls per minute/hour/day by tier)
app.use('/api', apiRateLimiter);
app.use('/api', checkHourlyQuota);

// CSRF Protection
// The cookie setter ensures the CSRF cookie is set for all requests
// The protection middleware validates CSRF tokens on state-changing requests
// Note: Webhook routes are excluded (they use signature verification)
// Note: Initial auth endpoints are excluded (login, register, refresh)
app.use('/api', csrfCookieSetter);
app.use('/api', csrfProtection);

// Serve static files for uploads
const uploadsPath = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    // Set proper headers for video files
    if (filePath.endsWith('.webm')) {
      res.set('Content-Type', 'video/webm');
      res.set('Accept-Ranges', 'bytes');
    } else if (filePath.endsWith('.mp4')) {
      res.set('Content-Type', 'video/mp4');
      res.set('Accept-Ranges', 'bytes');
    }
    // Allow cross-origin for media files
    res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:5173');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// Health check routes (includes /health, /health/ready, /health/live, etc.)
app.use('/health', healthRoutes);

// API routes
app.use('/api', routes);

// 404 handler - MUST be before error handler
app.use((req, res, _next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Sentry error handler (must be before other error handlers)
setupExpressErrorHandler(app);

// Error handling - MUST be last
app.use(errorHandler);

// Initialize Socket.IO
initializeSocketIO(io);

// Start server
const startServer = async () => {
  try {
    // Validate environment variables first (fail fast on missing critical vars)
    validateEnvironmentOrFail();

    // Validate frontend configuration
    validateFrontendConfiguration();

    // Connect to database
    await connectDatabase();

    // Initialize Redis for caching (optional - will gracefully degrade if unavailable)
    getRedisClient();

    // Initialize scheduler for metrics aggregation
    schedulerService.initializeScheduler();

    // Initialize queue service if workers are enabled
    if (isQueueWorkersEnabled()) {
      try {
        await queueService.initialize();

        // Register email queue and processor
        const emailQueue = getSendEmailQueue();
        const emailProcessor = getSendEmailProcessor();
        queueService.registerQueue(emailQueue, emailProcessor);

        // Register transcription queue and processor (conditionally)
        // When using external transcription (e.g., Python Whisper), disable Node.js worker
        // to prevent it from consuming jobs before the external worker can process them
        const transcriptionQueue = getTranscriptionQueue();
        if (isTranscriptionWorkerEnabled()) {
          const transcriptionProcessor = getTranscriptionProcessor();
          queueService.registerQueue(transcriptionQueue, transcriptionProcessor);
        } else {
          logger.info('Transcription queue registered without Node.js worker (external worker mode)');
        }

        // Register transcode queue and processor
        const transcodeQueue = getTranscodeQueue();
        const transcodeProcessor = getTranscodeProcessor();
        queueService.registerQueue(transcodeQueue, transcodeProcessor);

        // Register thumbnail queue and processor
        const thumbnailQueue = getThumbnailQueue();
        const thumbnailProcessor = getThumbnailProcessor();
        queueService.registerQueue(thumbnailQueue, thumbnailProcessor);

        // Register analysis queue and processor (AI-powered video analysis)
        const analysisQueue = getAnalysisQueue();
        const analysisProcessor = getAnalysisProcessor();
        queueService.registerQueue(analysisQueue, analysisProcessor);

        // Register rubric template generation queue and processor (background rubric generation)
        const rubricTemplateGenerationQueue = getRubricTemplateGenerationQueue();
        const rubricTemplateGenerationProcessor = getRubricTemplateGenerationProcessor();
        queueService.registerQueue(rubricTemplateGenerationQueue, rubricTemplateGenerationProcessor);

        // Initialize cleanup job for temp rubric generation videos
        await initializeCleanupJob();

        // Start all registered workers
        queueService.startAllWorkers();

        logger.info('Queue service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize queue service:', error);
        // Continue without queues - emails will fail but app will run
      }
    } else {
      logger.info('Queue workers disabled - skipping queue initialization');
    }

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
      logger.info(`API endpoints available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} signal received: starting graceful shutdown`);

  // Stop accepting new jobs immediately (synchronous)
  schedulerService.stopScheduler();

  // Run cleanup operations in parallel with Promise.allSettled
  // This ensures all cleanup runs even if some fail
  const cleanupTasks: Array<{ name: string; task: () => Promise<unknown> }> = [];

  // Queue shutdown task
  if (queueService.isReady()) {
    cleanupTasks.push({
      name: 'Queue workers',
      task: () => queueService.gracefulShutdown(false, 30000),
    });
  }

  // Cleanup job shutdown task
  cleanupTasks.push({
    name: 'Rubric cleanup job',
    task: () => closeCleanupJob(),
  });

  // Sentry flush task
  cleanupTasks.push({
    name: 'Sentry flush',
    task: () => flushSentry(2000),
  });

  // Redis close task
  cleanupTasks.push({
    name: 'Redis connection',
    task: () => closeRedis(),
  });

  // Execute all cleanup tasks in parallel
  logger.info(`Running ${cleanupTasks.length} cleanup tasks...`);
  const results = await Promise.allSettled(
    cleanupTasks.map(({ name, task }) =>
      task().catch((error) => {
        logger.warn(`Cleanup task "${name}" failed:`, error);
        throw error;
      })
    )
  );

  // Log results
  results.forEach((result, index) => {
    const task = cleanupTasks[index];
    const taskName = task?.name ?? 'Unknown task';
    if (result.status === 'fulfilled') {
      logger.info(`✅ ${taskName} shutdown complete`);
    } else {
      logger.error(`❌ ${taskName} shutdown failed:`, result.reason);
    }
  });

  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    logger.warn('Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 35000);
};

// Only register signal and exception handlers if not in test environment
// Tests need to handle their own errors without process.exit() calls
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise: String(promise) });
    process.exit(1);
  });

  startServer();
}

export { app, io };