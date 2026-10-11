import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import * as Sentry from '@sentry/node';

/**
 * Sensitive field patterns to redact from logs
 */
const SENSITIVE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'apiSecret',
  'privateKey',
  'private_key',
  'authorization',
  'cookie',
  'sessionId',
  'session_id',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'ssn',
  'socialSecurityNumber',
];

const SENSITIVE_PATTERNS = [
  // Credit card numbers (13-19 digits, possibly with spaces/dashes)
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g,
  // SSN patterns
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  // JWT tokens (xxx.xxx.xxx format)
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // Bearer tokens in strings
  /Bearer\s+[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*\.?[A-Za-z0-9_-]*/gi,
  // API keys (common formats)
  /\b[a-zA-Z0-9]{32,}\b/g,
];

/**
 * Redact sensitive data from log objects
 * Recursively traverses objects to find and mask sensitive values
 */
export const redactSensitiveData = (obj: unknown, depth = 0): unknown => {
  // Prevent infinite recursion
  if (depth > 10) return obj;

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    let result = obj;
    // Check for sensitive patterns in strings
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key matches any sensitive field
      const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
        lowerKey.includes(sensitiveKey.toLowerCase())
      );

      if (isSensitive && value !== undefined && value !== null) {
        // Redact the value but show that it existed
        if (typeof value === 'string') {
          // Show truncated version for debugging (first 4 chars)
          redacted[key] = value.length > 4 ? `${value.substring(0, 4)}...[REDACTED]` : '[REDACTED]';
        } else {
          redacted[key] = '[REDACTED]';
        }
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }

    return redacted;
  }

  return obj;
};

/**
 * Async Local Storage for request correlation
 * Stores correlation ID and request context for the duration of a request
 */
interface RequestContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  method?: string;
  path?: string;
  startTime?: number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a unique correlation ID
 * Format: timestamp-random (e.g., "1704295200000-a1b2c3d4")
 */
export const generateCorrelationId = (): string => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
};

/**
 * Get the current correlation ID from async context
 * Returns a new ID if none exists (for non-request contexts like background jobs)
 */
export const getCorrelationId = (): string => {
  const context = requestContext.getStore();
  return context?.correlationId || generateCorrelationId();
};

/**
 * Get the current request context
 */
export const getRequestContext = (): RequestContext | undefined => {
  return requestContext.getStore();
};

/**
 * Run a function within a correlation context
 */
export const runWithCorrelation = <T>(
  correlationId: string,
  fn: () => T,
  additionalContext?: Partial<RequestContext>
): T => {
  return requestContext.run(
    {
      correlationId,
      ...additionalContext,
    },
    fn
  );
};

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';

/**
 * Custom format that adds correlation ID to all log entries
 */
const correlationFormat = winston.format((info) => {
  const context = requestContext.getStore();
  if (context) {
    info.correlationId = context.correlationId;
    if (context.requestId) info.requestId = context.requestId;
    if (context.userId) info.userId = context.userId;
    if (context.organizationId) info.organizationId = context.organizationId;
    if (context.method) info.method = context.method;
    if (context.path) info.path = context.path;
  }
  return info;
});

/**
 * Sentry breadcrumb integration format
 * Sends log entries as breadcrumbs to Sentry for error context
 */
const sentryBreadcrumbFormat = winston.format((info) => {
  // Only send to Sentry if DSN is configured
  if (process.env.SENTRY_DSN) {
    // Map Winston levels to Sentry severity levels
    const levelMap: Record<string, Sentry.SeverityLevel> = {
      error: 'error',
      warn: 'warning',
      info: 'info',
      http: 'info',
      verbose: 'debug',
      debug: 'debug',
      silly: 'debug',
    };

    const level = levelMap[info.level] || 'info';

    // Don't add error-level logs as breadcrumbs (they'll be captured as events)
    if (level !== 'error') {
      Sentry.addBreadcrumb({
        message: typeof info.message === 'string' ? info.message : JSON.stringify(info.message),
        category: 'logger',
        level,
        data: {
          correlationId: info.correlationId as string | undefined,
          ...(info.requestId ? { requestId: info.requestId as string } : {}),
          ...(info.userId ? { userId: info.userId as string } : {}),
          ...(info.organizationId ? { organizationId: info.organizationId as string } : {}),
        },
        timestamp: Date.now() / 1000,
      });
    }
  }

  return info;
});

// Define log format
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  correlationFormat(),
  sentryBreadcrumbFormat(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  correlationFormat(),
  sentryBreadcrumbFormat(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    let msg = `${timestamp} [${level}]`;
    if (correlationId) {
      msg += ` [${correlationId}]`;
    }
    msg += `: ${message}`;

    // Filter out internal fields from meta output
    const {
      requestId: _requestId,
      userId: _userId,
      organizationId: _organizationId,
      method: _method,
      path: _reqPath,
      ...restMeta
    } = meta;
    if (Object.keys(restMeta).length > 0) {
      msg += ` ${JSON.stringify(restMeta, null, 2)}`;
    }
    return msg;
  })
);

// Log rotation configuration
const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '20m'; // 20MB per file
const LOG_MAX_FILES = process.env.LOG_MAX_FILES || '14d'; // Keep 14 days of logs
const LOG_COMPRESS = process.env.LOG_COMPRESS !== 'false'; // Gzip by default

// Create transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleFormat,
  }),
];

// Add rotating file transports in production
if (process.env.NODE_ENV === 'production') {
  // Error logs - separate file for easier debugging
  const errorRotateTransport = new DailyRotateFile({
    filename: path.join(LOG_DIR, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: jsonFormat,
    maxSize: LOG_MAX_SIZE,
    maxFiles: LOG_MAX_FILES,
    zippedArchive: LOG_COMPRESS,
    createSymlink: true,
    symlinkName: 'error.log',
  });

  // Combined logs - all levels
  const combinedRotateTransport = new DailyRotateFile({
    filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: jsonFormat,
    maxSize: LOG_MAX_SIZE,
    maxFiles: LOG_MAX_FILES,
    zippedArchive: LOG_COMPRESS,
    createSymlink: true,
    symlinkName: 'combined.log',
  });

  // Log rotation events
  errorRotateTransport.on('rotate', (oldFilename, newFilename) => {
    console.log(`Error log rotated: ${oldFilename} -> ${newFilename}`);
  });

  combinedRotateTransport.on('rotate', (oldFilename, newFilename) => {
    console.log(`Combined log rotated: ${oldFilename} -> ${newFilename}`);
  });

  transports.push(errorRotateTransport, combinedRotateTransport);
}

// Create logger instance
const winstonLogger = winston.createLogger({
  level: logLevel,
  format: logFormat === 'json' ? jsonFormat : consoleFormat,
  transports,
  exitOnError: false,
});

/**
 * Enhanced logger with correlation ID support
 * Wraps Winston logger to automatically include correlation context
 */
interface LogMeta {
  [key: string]: unknown;
}

// Allow Error objects or any object as meta for flexible logging
type LogMetaArg = LogMeta | Error | unknown;

interface EnhancedLogger {
  error: (message: string | Error, meta?: LogMetaArg) => void;
  warn: (message: string, meta?: LogMetaArg) => void;
  info: (message: string, meta?: LogMetaArg) => void;
  http: (message: string, meta?: LogMetaArg) => void;
  verbose: (message: string, meta?: LogMetaArg) => void;
  debug: (message: string, meta?: LogMetaArg) => void;
  silly: (message: string, meta?: LogMetaArg) => void;

  // Utility methods
  child: (defaultMeta: LogMeta) => EnhancedLogger;
  startTimer: () => {
    done: (info: { level: string; message: string; [key: string]: unknown }) => void;
  };
  profile: (id: string) => void;
}

const createEnhancedLogger = (
  baseLogger: winston.Logger,
  defaultMeta: LogMeta = {}
): EnhancedLogger => {
  const log = (level: string, message: string | Error, meta?: LogMetaArg) => {
    const context = requestContext.getStore();

    // Normalize meta to an object, handling Error objects and unknown types
    const metaObj: LogMeta =
      meta instanceof Error
        ? { error: { name: meta.name, message: meta.message, stack: meta.stack } }
        : typeof meta === 'object' && meta !== null
          ? (meta as LogMeta)
          : {};

    // Redact sensitive data from log entry
    const rawLogEntry = {
      ...defaultMeta,
      ...metaObj,
      correlationId: context?.correlationId || (metaObj as any).correlationId,
    };
    const logEntry = redactSensitiveData(rawLogEntry) as LogMeta;

    // Redact sensitive data from message if it's a string
    const redactedMessage =
      typeof message === 'string' ? (redactSensitiveData(message) as string) : message;

    if (redactedMessage instanceof Error) {
      baseLogger.log(level, redactedMessage.message, {
        ...logEntry,
        error: {
          name: redactedMessage.name,
          message: redactedMessage.message,
          stack: redactedMessage.stack,
        },
      });

      // Send errors to Sentry (also with redacted extra data)
      if (level === 'error' && process.env.SENTRY_DSN) {
        Sentry.captureException(redactedMessage, {
          tags: {
            correlationId: logEntry.correlationId as string,
            ...(context?.userId && { userId: context.userId }),
            ...(context?.organizationId && { organizationId: context.organizationId }),
          },
          extra: logEntry,
        });
      }
    } else {
      baseLogger.log(level, redactedMessage, logEntry);
    }
  };

  return {
    error: (message: string | Error, meta?: LogMetaArg) => log('error', message, meta),
    warn: (message: string, meta?: LogMetaArg) => log('warn', message, meta),
    info: (message: string, meta?: LogMetaArg) => log('info', message, meta),
    http: (message: string, meta?: LogMetaArg) => log('http', message, meta),
    verbose: (message: string, meta?: LogMetaArg) => log('verbose', message, meta),
    debug: (message: string, meta?: LogMetaArg) => log('debug', message, meta),
    silly: (message: string, meta?: LogMetaArg) => log('silly', message, meta),

    child: (childMeta: LogMeta) =>
      createEnhancedLogger(baseLogger, { ...defaultMeta, ...childMeta }),
    startTimer: () => baseLogger.startTimer(),
    profile: (id: string) => baseLogger.profile(id),
  };
};

export const logger = createEnhancedLogger(winstonLogger);

// Create stream for Morgan HTTP logging
export const httpLogStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

/**
 * Correlation ID middleware for Express
 * Creates a new correlation ID for each request or uses existing one from headers
 */
export const correlationMiddleware = () => {
  return (req: any, res: any, next: () => void) => {
    // Check for existing correlation ID in headers
    const existingId =
      req.headers['x-correlation-id'] ||
      req.headers['x-request-id'] ||
      req.headers['traceparent']?.split('-')[1];

    const correlationId = existingId || generateCorrelationId();

    // Add correlation ID to response headers
    res.setHeader('X-Correlation-Id', correlationId);

    // Run the request within the correlation context
    requestContext.run(
      {
        correlationId,
        requestId: req.headers['x-request-id'],
        method: req.method,
        path: req.path,
        startTime: Date.now(),
      },
      () => {
        next();
      }
    );
  };
};

/**
 * Update request context with user info after authentication
 */
export const setUserContext = (userId: string, organizationId?: string): void => {
  const context = requestContext.getStore();
  if (context) {
    context.userId = userId;
    if (organizationId) {
      context.organizationId = organizationId;
    }
  }
};

/**
 * Log request duration
 */
export const logRequestDuration = (): void => {
  const context = requestContext.getStore();
  if (context?.startTime) {
    const duration = Date.now() - context.startTime;
    logger.http(`Request completed`, {
      method: context.method,
      path: context.path,
      duration: `${duration}ms`,
    });
  }
};

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise: String(promise), reason: String(reason) });

  // Also capture in Sentry
  if (process.env.SENTRY_DSN && reason instanceof Error) {
    Sentry.captureException(reason, {
      tags: { type: 'unhandledRejection' },
    });
  }
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(error);

  // Also capture in Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: { type: 'uncaughtException' },
    });

    // Flush Sentry before crashing
    Sentry.flush(2000).finally(() => {
      process.exit(1);
    });
  }
});
