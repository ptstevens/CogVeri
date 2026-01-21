import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

/**
 * Sentry Configuration for Frontend
 *
 * Provides error tracking, performance monitoring, and user session replay
 * for the CogVeri frontend React application.
 *
 * Key features:
 * - Error tracking with component stack traces
 * - Performance monitoring with React Router integration
 * - Browser tracing for web vitals
 * - User context integration
 * - Release tracking for deployment correlation
 */

// Environment configuration
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENTRY_ENVIRONMENT = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development';
const SENTRY_RELEASE = import.meta.env.VITE_SENTRY_RELEASE || import.meta.env.VITE_APP_VERSION || '1.0.0';

// Sampling rates - adjust based on traffic volume and budget
const TRACES_SAMPLE_RATE = parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'); // 10% of transactions
const REPLAYS_SESSION_SAMPLE_RATE = parseFloat(import.meta.env.VITE_SENTRY_REPLAYS_SESSION_RATE || '0.1'); // 10% of sessions
const REPLAYS_ERROR_SAMPLE_RATE = parseFloat(import.meta.env.VITE_SENTRY_REPLAYS_ERROR_RATE || '1.0'); // 100% on error

/**
 * Initialize Sentry for the frontend application
 * Should be called as early as possible, ideally in main.tsx before React renders
 */
export const initSentry = (): void => {
  if (!SENTRY_DSN) {
    // Only log in development - this is expected in production if Sentry isn't configured
    if (import.meta.env.DEV) {
      console.info('Sentry DSN not configured - error tracking disabled');
    }
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: `cogveri-frontend@${SENTRY_RELEASE}`,

      // Performance monitoring
      tracesSampleRate: TRACES_SAMPLE_RATE,

      // Session replay (for debugging user sessions)
      replaysSessionSampleRate: REPLAYS_SESSION_SAMPLE_RATE,
      replaysOnErrorSampleRate: REPLAYS_ERROR_SAMPLE_RATE,

      // Integrations
      integrations: [
        // Browser tracing for performance monitoring
        new BrowserTracing({
          // Trace all requests to our API
          tracePropagationTargets: [
            'localhost',
            /^https:\/\/api\.cogveri\.com/,
            /^https:\/\/.*\.cogveri\.com/,
            new RegExp(`^${import.meta.env.VITE_API_URL?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          ],

          // Note: React Router instrumentation should be set up in App.tsx with useEffect
          // See Sentry docs for proper v7+ integration
        }),

        // Replay integration for session recording
        new Sentry.Replay({
          // Mask all text content for privacy
          maskAllText: false,

          // Block all media for privacy
          blockAllMedia: false,

          // Network capture settings
          networkDetailAllowUrls: [
            window.location.origin,
            import.meta.env.VITE_API_URL || '',
          ],

          // Network headers to capture
          networkRequestHeaders: ['X-Correlation-Id', 'X-Request-Id'],
          networkResponseHeaders: ['X-Correlation-Id', 'X-Request-Id'],
        }),
      ],

      // Error filtering
      beforeSend(event, hint) {
        // Filter out errors from browser extensions
        if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
          frame => frame.filename?.includes('extension://')
        )) {
          return null;
        }

        // Filter out network errors that are likely user connectivity issues
        const error = hint?.originalException as Error;
        if (error?.message?.includes('Failed to fetch') ||
            error?.message?.includes('NetworkError') ||
            error?.message?.includes('Network request failed')) {
          // Still log locally but reduce Sentry noise
          event.level = 'warning';
        }

        // Filter out cancelled requests
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          return null;
        }

        // Add custom fingerprinting for common errors
        if (error) {
          // Group authentication errors
          if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            event.fingerprint = ['authentication-error'];
          }

          // Group API errors by status code
          const statusMatch = error.message?.match(/(\d{3})/);
          if (statusMatch) {
            event.fingerprint = [`api-error-${statusMatch[1]}`];
          }
        }

        return event;
      },

      // Performance transaction filtering
      beforeSendTransaction(event) {
        // Filter out transactions with very short duration (likely cached)
        if ((event.timestamp ?? 0) - (event.start_timestamp ?? 0) < 0.01) {
          return null;
        }

        return event;
      },

      // Breadcrumb filtering
      beforeBreadcrumb(breadcrumb) {
        // Filter out console breadcrumbs in production
        if (SENTRY_ENVIRONMENT === 'production' && breadcrumb.category === 'console') {
          // Only keep error and warning logs
          if (breadcrumb.level !== 'error' && breadcrumb.level !== 'warning') {
            return null;
          }
        }

        // Filter out UI breadcrumbs that are too noisy
        if (breadcrumb.category === 'ui.click' && !breadcrumb.message?.includes('button')) {
          return null;
        }

        return breadcrumb;
      },

      // Send default PII (disabled for GDPR compliance)
      sendDefaultPii: false,

      // Maximum breadcrumbs to store
      maxBreadcrumbs: 100,

      // Attach stack traces to messages
      attachStacktrace: true,

      // Debug mode (only in development)
      debug: SENTRY_ENVIRONMENT === 'development',

      // Normalize depth for context data
      normalizeDepth: 5,
    });

    console.info(`Sentry initialized for environment: ${SENTRY_ENVIRONMENT}, release: ${SENTRY_RELEASE}`);
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
};

/**
 * Check if Sentry is initialized
 */
export const isSentryInitialized = (): boolean => {
  return !!SENTRY_DSN && Sentry.getCurrentHub().getClient() !== undefined;
};

/**
 * Set user context for Sentry
 * Call this after user authentication
 */
export const setSentryUser = (user: {
  id: string;
  email?: string;
  name?: string;
  organizationId?: string;
  role?: string;
}): void => {
  if (!isSentryInitialized()) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
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
  if (!isSentryInitialized()) return;

  Sentry.setUser(null);
  Sentry.setTag('organization_id', undefined);
  Sentry.setTag('user_role', undefined);
};

/**
 * Set custom tags for the current scope
 */
export const setSentryTags = (tags: Record<string, string | number | boolean>): void => {
  if (!isSentryInitialized()) return;

  Object.entries(tags).forEach(([key, value]) => {
    Sentry.setTag(key, String(value));
  });
};

/**
 * Set custom context for the current scope
 */
export const setSentryContext = (name: string, context: Record<string, unknown>): void => {
  if (!isSentryInitialized()) return;

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
  if (!isSentryInitialized()) {
    console.error('Sentry not configured, error not captured:', error);
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
  if (!isSentryInitialized()) {
    console.info('Sentry not configured, message not captured:', message);
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
  if (!isSentryInitialized()) return;

  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'custom',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
    timestamp: Date.now() / 1000,
  });
};

/**
 * Start a span for performance measurement
 */
export const startSpan = (
  name: string,
  op: string
): Sentry.Span | undefined => {
  if (!isSentryInitialized()) return undefined;

  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
  if (!transaction) return undefined;

  return transaction.startChild({
    op,
    description: name,
  });
};

/**
 * Create a profiled callback for performance measurement
 */
export const withProfiler = <T extends (...args: unknown[]) => unknown>(
  name: string,
  fn: T
): T => {
  if (!isSentryInitialized()) return fn;

  return Sentry.startSpanManual(
    { name, op: 'function' },
    () => fn
  ) as T;
};

/**
 * Flush Sentry events (useful before page unload)
 */
export const flushSentry = async (timeout = 2000): Promise<boolean> => {
  if (!isSentryInitialized()) return true;

  try {
    return await Sentry.flush(timeout);
  } catch (error) {
    console.error('Failed to flush Sentry events:', error);
    return false;
  }
};

// Export Sentry for advanced usage and ErrorBoundary
export { Sentry };

// Export withErrorBoundary HOC for wrapping components
export const withErrorBoundary = Sentry.withErrorBoundary;

// Export ErrorBoundary component
export const SentryErrorBoundary = Sentry.ErrorBoundary;
