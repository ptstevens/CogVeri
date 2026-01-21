import { Request, Response, NextFunction, RequestHandler } from 'express';
import { doubleCsrf, DoubleCsrfConfigOptions, CsrfTokenGenerator } from 'csrf-csrf';
import { HttpError } from 'http-errors';
import { logger } from '../utils/logger';

/**
 * CSRF Protection Middleware using Double-Submit Cookie Pattern
 *
 * Security features:
 * - Uses cryptographically secure tokens
 * - SameSite=Strict cookies (prevents CSRF via cross-site requests)
 * - HttpOnly cookies (prevents XSS from stealing tokens)
 * - Secure cookies in production (prevents MITM attacks)
 * - Token validation on state-changing operations (POST, PUT, PATCH, DELETE)
 *
 * The double-submit cookie pattern works by:
 * 1. Server sets a signed cookie with a secret value
 * 2. Server provides a token derived from the cookie to the client
 * 3. Client sends token in header with subsequent requests
 * 4. Server validates that header token matches cookie value
 *
 * This protects against CSRF because:
 * - Attackers cannot read cookies due to same-origin policy
 * - Attackers cannot forge valid header tokens without the cookie value
 */

const isProduction = process.env.NODE_ENV === 'production';

// CSRF secret - MUST be set in production (separate from JWT_SECRET for security)
const CSRF_SECRET = process.env.CSRF_SECRET;

if (!CSRF_SECRET) {
  if (isProduction) {
    // CRITICAL: In production, CSRF_SECRET must be explicitly set
    logger.error('FATAL: CSRF_SECRET environment variable must be set in production');
    throw new Error('CSRF_SECRET must be configured in production');
  } else {
    // In development, warn but allow fallback
    logger.warn(
      'CSRF_SECRET not set - using JWT_SECRET as fallback. ' +
      'Set CSRF_SECRET in production for proper secret separation.'
    );
  }
}

// Use CSRF_SECRET if set, otherwise fall back to JWT_SECRET for development only
const effectiveCsrfSecret = CSRF_SECRET || process.env.JWT_SECRET;

if (!effectiveCsrfSecret) {
  logger.error('Neither CSRF_SECRET nor JWT_SECRET is configured');
  throw new Error('CSRF protection requires CSRF_SECRET or JWT_SECRET to be set');
}

/**
 * Routes that should be excluded from CSRF protection.
 * These routes either:
 * 1. Use their own authentication mechanism (webhooks with signature verification)
 * 2. Are safe read-only operations (GET requests are excluded by default)
 * 3. Need to work before CSRF token is obtained (initial auth endpoints)
 */
// Paths to exclude from CSRF protection
// NOTE: Since CSRF middleware is mounted at '/api', req.path does NOT include '/api' prefix
const CSRF_EXCLUDED_PATHS = [
  // Webhook routes - use signature verification instead of CSRF
  '/webhooks/stripe',

  // Internal API routes - use API key authentication
  '/transcription/callback',

  // Public authentication endpoints that must work before CSRF token is obtained
  // Note: These are POST endpoints but are the entry points to get authenticated
  '/auth/login',
  '/auth/register',
  '/auth/register-for-invitation',
  '/auth/refresh',
  '/auth/logout',
  '/auth/google',
  '/auth/google/callback',
  '/auth/v2/login',
  '/auth/v2/register',
  '/auth/v2/refresh',
  '/auth/v2/logout',
  '/auth/v2/google',
  '/auth/v2/google/callback',

  // Magic link submission (external contributors without accounts)
  '/magic-links',

  // Subscriber email (public landing page signup)
  '/subscriber-email',
];

/**
 * Check if a request path should be excluded from CSRF protection
 */
function isExcludedPath(path: string): boolean {
  // Exact match or prefix match for routes with dynamic segments
  return CSRF_EXCLUDED_PATHS.some(
    (excludedPath) =>
      path === excludedPath || path.startsWith(`${excludedPath}/`)
  );
}

/**
 * Configure double CSRF protection
 */
const csrfConfig: DoubleCsrfConfigOptions = {
  getSecret: () => effectiveCsrfSecret,
  // Session identifier for double-submit cookie pattern
  // We use a constant since our JWT auth already handles session identity
  getSessionIdentifier: () => 'session',
  cookieName: isProduction ? '__Host-csrf' : 'csrf', // __Host- prefix requires HTTPS
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: isProduction, // Only send over HTTPS in production
  },
  size: 64, // Token size in bytes
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Only protect state-changing methods
  getCsrfTokenFromRequest: (req: Request) => {
    // Check X-CSRF-Token header first (preferred for SPAs)
    const headerToken = req.headers['x-csrf-token'];
    if (headerToken && typeof headerToken === 'string') {
      return headerToken;
    }

    // Fallback to request body (for form submissions)
    if (req.body && typeof req.body === 'object' && '_csrf' in req.body) {
      const bodyToken = (req.body as Record<string, unknown>)._csrf;
      if (typeof bodyToken === 'string') {
        return bodyToken;
      }
    }

    return null;
  },
  // Use skipCsrfProtection for path-based exclusions
  skipCsrfProtection: (req: Request) => isExcludedPath(req.path),
};

// Initialize double CSRF protection
const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError,
} = doubleCsrf(csrfConfig);

// Store the generateCsrfToken function for use in the endpoint
const csrfGenerateToken: CsrfTokenGenerator = generateCsrfToken;

// Export the error for external use with explicit type
const csrfInvalidTokenError: HttpError = invalidCsrfTokenError;

/**
 * Get a CSRF token for the current request.
 * Should be called after the CSRF middleware has run.
 */
export function getCsrfToken(req: Request, res: Response): string {
  return csrfGenerateToken(req, res);
}

/**
 * CSRF protection middleware with path exclusions.
 * Applies CSRF validation to all state-changing requests except excluded paths.
 */
export const csrfProtection: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip CSRF for excluded paths (also handled by skipCsrfProtection config)
  if (isExcludedPath(req.path)) {
    logger.debug(`CSRF: Skipping protection for excluded path: ${req.path}`);
    next();
    return;
  }

  // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safeMethod) {
    next();
    return;
  }

  // Apply CSRF protection
  doubleCsrfProtection(req, res, (err: unknown) => {
    if (err) {
      // Check if it's a CSRF token error
      if (err === invalidCsrfTokenError) {
        logger.warn(`CSRF validation failed for ${req.method} ${req.path}`, {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
        res.status(403).json({
          error: 'Forbidden',
          message: 'Invalid or missing CSRF token',
          code: 'CSRF_VALIDATION_FAILED',
        });
        return;
      }

      // Pass other errors to error handler
      next(err);
      return;
    }

    next();
  });
};

/**
 * Middleware to ensure CSRF cookie is set for all requests.
 * This should be applied early in the middleware chain so the
 * cookie is available for the frontend to read.
 */
export const csrfCookieSetter: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate token to ensure cookie is set
  // The token will be regenerated when explicitly requested via the endpoint
  try {
    csrfGenerateToken(req, res);
  } catch {
    // Ignore errors - cookie will be set on next request
    logger.debug('CSRF: Could not set cookie on request');
  }
  next();
};

export { csrfInvalidTokenError as invalidCsrfTokenError };
