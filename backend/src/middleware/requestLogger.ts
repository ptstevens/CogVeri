import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Paths to exclude from request/response logging (e.g., health checks, static assets)
const EXCLUDED_PATHS = ['/health', '/api/health', '/favicon.ico'];
const EXCLUDED_PREFIXES = ['/static', '/assets'];

// Paths where 401 is expected behavior (not an error worth warning about)
// These are endpoints where unauthenticated requests are normal
const EXPECTED_401_PATHS = ['/api/auth/refresh'];

// Slow request threshold (ms) - log at warn level if exceeded
const SLOW_REQUEST_THRESHOLD = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '3000', 10);

// Whether to log all requests or just errors/slow (default: all in dev, errors/slow in prod)
const LOG_ALL_REQUESTS = process.env.LOG_ALL_REQUESTS === 'true' || process.env.NODE_ENV !== 'production';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Skip logging for excluded paths
  if (EXCLUDED_PATHS.includes(req.path) || EXCLUDED_PREFIXES.some(p => req.path.startsWith(p))) {
    return next();
  }

  const startTime = Date.now();

  // Log response when finished (single log entry instead of two)
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const isSlow = duration > SLOW_REQUEST_THRESHOLD;

    // Check if this is an expected 401 (e.g., /auth/refresh when no session)
    const isExpected401 = res.statusCode === 401 && EXPECTED_401_PATHS.includes(req.path);
    const isError = res.statusCode >= 400 && !isExpected401;

    // In production, only log errors, slow requests, or if explicitly enabled
    // Skip logging for expected 401s entirely (they're noise in logs)
    if (isExpected401) {
      return;
    }

    if (!LOG_ALL_REQUESTS && !isError && !isSlow) {
      return;
    }

    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    const message = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;

    // Use appropriate log level based on status and duration
    if (isError) {
      logger.warn(message, { ...logData, type: 'request_error' });
    } else if (isSlow) {
      logger.warn(message, { ...logData, type: 'slow_request' });
    } else {
      logger.http(message, { ...logData, type: 'request' });
    }
  });

  next();
};