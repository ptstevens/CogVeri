import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { UnauthorizedError, ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { tokenBlacklistService } from '../services/token-blacklist.service';
import { IncomingHttpHeaders } from 'http';

// JWT issuer and audience for validation (must match jwt.service.ts)
const JWT_ISSUER = 'cogveri';
const JWT_AUDIENCE = 'cogveri-api';

/**
 * Extended request interface with authenticated user context.
 */
export interface AuthenticatedRequest extends Request {
  params: { [key: string]: string };
  query: { [key: string]: string | string[] | undefined };
  body: unknown;
  headers: IncomingHttpHeaders;

  user?: {
    id: string;
    email: string;
    org_id: string;
    org_slug: string;
    org_role: string;
    organizations: Array<{ id: string; slug: string; role: string }>;
    isImpersonating?: boolean;
    impersonationId?: string;
    actorUserId?: string;
    permissions?: string[];
    is_system_admin?: boolean;
  };
  userPermissions?: string[];
  userRoles?: string[];
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if strings are equal, false otherwise.
 */
function constantTimeStringCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Use fixed-length comparison to avoid timing leaks based on length
  const aBuffer = Buffer.from(a, 'utf-8');
  const bBuffer = Buffer.from(b, 'utf-8');

  // If lengths differ, still do the comparison to maintain constant time
  // but use the longer buffer as reference
  const maxLength = Math.max(aBuffer.length, bBuffer.length);

  if (maxLength === 0) {
    return true;
  }

  // Pad shorter buffer to match length (prevents length-based timing leak)
  const aPadded = Buffer.alloc(maxLength);
  const bPadded = Buffer.alloc(maxLength);

  aBuffer.copy(aPadded);
  bBuffer.copy(bPadded);

  // Now do constant-time comparison
  const isEqual = timingSafeEqual(aPadded, bPadded);

  // Also check lengths matched
  return isEqual && aBuffer.length === bBuffer.length;
}

/**
 * Main authentication middleware.
 *
 * Security considerations:
 * - Performs JWT verification first (fails fast on invalid format)
 * - Runs blacklist checks in parallel to reduce timing information leakage
 * - Uses consistent error messages to prevent enumeration
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication required');
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET is not configured');
      throw new UnauthorizedError('Authentication service unavailable');
    }

    // Verify JWT signature, expiry, issuer, and audience (this is the fast path for invalid tokens)
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as jwt.JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }

    // Validate token type - only accept access tokens
    if (decoded.type && decoded.type !== 'access') {
      logger.warn(`Invalid token type used for authentication: ${decoded.type}`);
      throw new UnauthorizedError('Invalid token');
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) {
      throw new UnauthorizedError('Invalid token');
    }

    // SECURITY FIX #5: Run blacklist checks in parallel to reduce timing attack surface
    // This makes it harder to distinguish between different rejection reasons
    const [isBlacklisted, isUserInvalidated] = await Promise.all([
      tokenBlacklistService.isBlacklisted(token),
      decoded.iat
        ? tokenBlacklistService.isTokenInvalidatedForUser(userId, decoded.iat)
        : Promise.resolve(false),
    ]);

    // Check results with generic error message
    if (isBlacklisted || isUserInvalidated) {
      // Use generic message to prevent enumeration of token states
      throw new UnauthorizedError('Token is no longer valid');
    }

    // Set user context on request
    (req as AuthenticatedRequest).user = {
      id: userId,
      email: decoded.email || '',
      org_id: decoded.org_id || '',
      org_slug: decoded.org_slug || '',
      org_role: decoded.org_role || 'MEMBER',
      organizations: decoded.organizations || [],
      is_system_admin: decoded.is_system_admin || false,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      next(error);
    } else {
      // Log unexpected errors but return generic auth error to client
      logger.error('Unexpected authentication error:', error);
      next(new UnauthorizedError('Authentication failed'));
    }
  }
};

/**
 * Role-based authorization middleware.
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Check both user.role and user.org_role for flexibility
    const userRole = authReq.user.org_role;

    if (!roles.includes(userRole)) {
      return next(new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`));
    }

    next();
  };
};

/**
 * Optional authentication - populates user context if valid token provided,
 * but doesn't fail if no token or invalid token.
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);

    if (!token) {
      next();
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      next();
      return;
    }

    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as jwt.JwtPayload;

      // Validate token type
      if (decoded.type && decoded.type !== 'access') {
        logger.debug('Optional auth rejected: invalid token type');
        next();
        return;
      }

      const userId = decoded.userId || decoded.id;
      if (!userId) {
        next();
        return;
      }

      // SECURITY FIX: Check blacklist even for optional auth to prevent revoked token usage
      // Run checks in parallel for efficiency
      const [isBlacklisted, isUserInvalidated] = await Promise.all([
        tokenBlacklistService.isBlacklisted(token),
        decoded.iat
          ? tokenBlacklistService.isTokenInvalidatedForUser(userId, decoded.iat)
          : Promise.resolve(false),
      ]);

      // If token is blacklisted, don't set user context
      if (isBlacklisted || isUserInvalidated) {
        logger.debug('Optional auth: token is blacklisted, continuing without user context');
        next();
        return;
      }

      (req as AuthenticatedRequest).user = {
        id: userId,
        email: decoded.email || '',
        org_id: decoded.org_id || '',
        org_slug: decoded.org_slug || '',
        org_role: decoded.org_role || 'MEMBER',
        organizations: decoded.organizations || [],
        is_system_admin: decoded.is_system_admin || false,
      };
    } catch {
      // Token is invalid - that's fine for optional auth
      logger.debug('Optional auth: invalid token, continuing without user context');
    }

    next();
  } catch (error) {
    // Log but don't fail the request
    logger.debug('Optional auth error:', error);
    next();
  }
};

/**
 * Alias for authenticate - matches common naming convention.
 */
export const authenticateToken = authenticate;

/**
 * API key authentication for service-to-service communication.
 * Used by Python transcription worker and other internal services.
 *
 * Uses constant-time comparison to prevent timing attacks.
 */
export const authenticateApiKey = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedError('API key required');
    }

    const expectedApiKey = process.env.BACKEND_API_KEY || process.env.INTERNAL_API_KEY;

    if (!expectedApiKey) {
      logger.warn('BACKEND_API_KEY not configured - API key authentication will fail');
      throw new UnauthorizedError('API key authentication not available');
    }

    // Use constant-time comparison to prevent timing attacks
    const isValid = constantTimeStringCompare(apiKey, expectedApiKey);

    if (!isValid) {
      // Add small random delay to further obscure timing
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
      throw new UnauthorizedError('Invalid API key');
    }

    // API key is valid - allow the request
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      logger.error('Unexpected API key auth error:', error);
      next(new UnauthorizedError('API key authentication failed'));
    }
  }
};
