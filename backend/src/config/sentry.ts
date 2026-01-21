import * as Sentry from '@sentry/node';
import { Express, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ProfilingIntegration is optional - only load if available
let ProfilingIntegration: any = null;
try {
  ProfilingIntegration = require('@sentry/profiling-node').ProfilingIntegration;
} catch {
  // Profiling not available - this is fine for production
}

/**
 * Sentry Configuration for Backend
 *
 * Provides error tracking, performance monitoring, and profiling
 * for the CogVeri backend API server.
 *
 * Key features:
 * - Error tracking with full stack traces
 * - Performance monitoring with distributed tracing
 * - Release tracking for deployment correlation
 * - Custom tags for organization/user context
 * - Express integration for automatic request tracking
 */

// Environment configuration
const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || process.env.npm_package_version || '1.0.0';

// Sampling rates - adjust based on traffic volume and budget
const TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'); // 10% of transactions
const PROFILES_SAMPLE_RATE = parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'); // 10% of profiled transactions
// ERROR_SAMPLE_RATE can be used in beforeSend to sample errors if needed (currently 100%)
// const ERROR_SAMPLE_RATE = parseFloat(process.env.SENTRY_ERROR_SAMPLE_RATE || '1.0');

/**
 * Initialize Sentry for the backend application
 * Should be called as early as possible in the application lifecycle
 */
export const initSentry = (): void => {
  if (!SENTRY_DSN) {
    logger.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: `cogveri-backend@${SENTRY_RELEASE}`,

      // Performance monitoring
      tracesSampleRate: TRACES_SAMPLE_RATE,

      // Profiling (requires @sentry/profiling-node)
      profilesSampleRate: PROFILES_SAMPLE_RATE,

      // Integrations
      integrations: [
        // HTTP integration for outgoing requests
        new Sentry.Integrations.Http({ tracing: true }),

        // Express integration for incoming requests
        new Sentry.Integrations.Express({
          app: undefined, // Will be set in setupExpressErrorHandler
        }),

        // Database integration for PostgreSQL
        new Sentry.Integrations.Postgres(),

        // Profiling integration for performance insights (if available)
        ...(ProfilingIntegration ? [new ProfilingIntegration()] : []),
      ],

      // Error filtering
      beforeSend(event, hint) {
        // Filter out sensitive data
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-api-key'];
        }

        // Filter out request body for specific endpoints
        if (event.request?.url?.includes('/auth/')) {
          delete event.request.data;
        }

        // Add custom fingerprinting for common errors
        const error = hint?.originalException as Error;
        if (error) {
          // Group database connection errors
          if (error.message?.includes('ECONNREFUSED')) {
            event.fingerprint = ['database-connection-error'];
          }

          // Group rate limit errors
          if (error.message?.includes('rate limit')) {
            event.fingerprint = ['rate-limit-error'];
          }
        }

        return event;
      },

      // Performance transaction filtering
      beforeSendTransaction(event) {
        // Skip health check transactions to reduce noise
        if (event.transaction?.includes('/health')) {
          return null;
        }

        return event;
      },

      // Breadcrumb filtering
      beforeBreadcrumb(breadcrumb) {
        // Filter out sensitive breadcrumbs
        if (breadcrumb.category === 'console' && breadcrumb.message?.includes('password')) {
          return null;
        }

        return breadcrumb;
      },

      // Send default PII (disabled for GDPR compliance)
      sendDefaultPii: false,

      // Maximum breadcrumbs to store
      maxBreadcrumbs: 50,

      // Attach stack traces to messages
      attachStacktrace: true,

      // Debug mode (only in development)
      debug: SENTRY_ENVIRONMENT === 'development',
    });

    logger.info(`Sentry initialized for environment: ${SENTRY_ENVIRONMENT}, release: ${SENTRY_RELEASE}`);
  } catch (error) {
    logger.error('Failed to initialize Sentry:', error);
  }
};

/**
 * Setup Sentry Express error handler
 * Must be called after all routes are registered
 */
export const setupExpressErrorHandler = (app: Express): void => {
  if (!SENTRY_DSN) return;

  // The error handler must be before any other error middleware
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error: any) {
      // Capture all 500 errors
      if (error.statusCode >= 500) {
        return true;
      }

      // Capture specific 4xx errors
      if (error.statusCode === 429) { // Rate limit
        return true;
      }

      // Don't capture 4xx client errors
      return false;
    },
  }));
};

/**
 * Setup Sentry request handler middleware
 * Must be called before any other middleware
 */
export const sentryRequestHandler = (): (req: Request, res: Response, next: NextFunction) => void => {
  if (!SENTRY_DSN) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return Sentry.Handlers.requestHandler({
    // Include request details
    request: ['method', 'url', 'query_string', 'headers'],

    // Include user context if available
    user: ['id', 'email'],

    // Include IP address
    ip: true,

    // Flush timeout
    flushTimeout: 2000,
  });
};

/**
 * Setup Sentry tracing handler middleware
 * Must be called after request handler
 */
export const sentryTracingHandler = (): (req: Request, res: Response, next: NextFunction) => void => {
  if (!SENTRY_DSN) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return Sentry.Handlers.tracingHandler();
};

/**
 * Set user context for Sentry
 * Call this after user authentication
 */
export const setSentryUser = (user: {
  id: string;
  email?: string;
  organizationId?: string;
  role?: string;
}): void => {
  if (!SENTRY_DSN) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
  });

  // Set organization context as a tag
  if (user.organizationId) {
    Sentry.setTag('organization_id', user.organizationId);
  }

  // Set role as a tag
  if (user.role) {
    Sentry.setTag('user_role', user.role);
  }
};

/**
 * Clear user context from Sentry
 * Call this on logout
 */
export const clearSentryUser = (): void => {
  if (!SENTRY_DSN) return;

  Sentry.setUser(null);
  Sentry.setTag('organization_id', undefined);
  Sentry.setTag('user_role', undefined);
};

/**
 * Set custom tags for the current scope
 */
export const setSentryTags = (tags: Record<string, string | number | boolean>): void => {
  if (!SENTRY_DSN) return;

  Object.entries(tags).forEach(([key, value]) => {
    Sentry.setTag(key, String(value));
  });
};

/**
 * Set custom context for the current scope
 */
export const setSentryContext = (name: string, context: Record<string, unknown>): void => {
  if (!SENTRY_DSN) return;

  Sentry.setContext(name, context);
};

/**
 * Capture an exception manually
 */
export const captureException = (
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
  }
): string | undefined => {
  if (!SENTRY_DSN) {
    logger.error('Sentry not configured, error not captured:', error);
    return undefined;
  }

  return Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level,
  });
};

/**
 * Capture a message manually
 */
export const captureMessage = (
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
): string | undefined => {
  if (!SENTRY_DSN) {
    logger.info('Sentry not configured, message not captured:', message);
    return undefined;
  }

  return Sentry.captureMessage(message, {
    level,
    tags: context?.tags,
    extra: context?.extra,
  });
};

/**
 * Add a breadcrumb to the current scope
 */
export const addBreadcrumb = (breadcrumb: {
  message: string;
  category?: string;
  level?: Sentry.SeverityLevel;
  data?: Record<string, unknown>;
}): void => {
  if (!SENTRY_DSN) return;

  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'custom',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
    timestamp: Date.now() / 1000,
  });
};

/**
 * Start a new transaction for performance monitoring
 */
export const startTransaction = (
  name: string,
  op: string,
  data?: Record<string, unknown>
): Sentry.Transaction | undefined => {
  if (!SENTRY_DSN) return undefined;

  return Sentry.startTransaction({
    name,
    op,
    data,
  });
};

/**
 * Flush Sentry events before shutdown
 */
export const flushSentry = async (timeout = 2000): Promise<boolean> => {
  if (!SENTRY_DSN) return true;

  try {
    return await Sentry.flush(timeout);
  } catch (error) {
    logger.error('Failed to flush Sentry events:', error);
    return false;
  }
};

/**
 * Close Sentry client
 */
export const closeSentry = async (timeout = 2000): Promise<boolean> => {
  if (!SENTRY_DSN) return true;

  try {
    return await Sentry.close(timeout);
  } catch (error) {
    logger.error('Failed to close Sentry client:', error);
    return false;
  }
};

// Export Sentry for advanced usage
export { Sentry };
