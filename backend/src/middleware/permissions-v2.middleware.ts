import { Response, NextFunction } from 'express';
import { EnhancedAuthRequest } from './enhanced-auth.middleware';
import { permissionsService } from '../services/permissions.service';
// import { prisma } from '../db/prisma'; // TODO: Not using Prisma - use Knex instead
import { logger } from '../utils/logger';

/**
 * Middleware factory to require specific permission
 */
export const requirePermission = (permission: string) => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const hasPermission = await permissionsService.hasPermission(
        req.user.id,
        req.user.org_id,
        permission
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          required: permission,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Failed to check permissions' });
    }
  };
};

/**
 * Middleware factory to require any of specified permissions (OR logic)
 */
export const requireAnyPermission = (permissions: string[]) => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const hasPermission = await permissionsService.hasAnyPermission(
        req.user.id,
        req.user.org_id,
        permissions
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          required: permissions,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Failed to check permissions' });
    }
  };
};

/**
 * Middleware factory to require all specified permissions (AND logic)
 */
export const requireAllPermissions = (permissions: string[]) => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const hasPermission = await permissionsService.hasAllPermissions(
        req.user.id,
        req.user.org_id,
        permissions
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          required: permissions,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Failed to check permissions' });
    }
  };
};

/**
 * Middleware to attach user permissions to request
 */
export const attachPermissions = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const permissions = await permissionsService.getUserPermissions(req.user.id, req.user.org_id);

    // TODO: TypeScript doesn't recognize permissions property until runtime - use type assertion
    (req.user as any).permissions = permissions;
    next();
  } catch (error) {
    logger.error('Error attaching permissions:', error);
    res.status(500).json({ error: 'Failed to attach permissions' });
  }
};

/**
 * Middleware to check resource ownership
 */
export const checkResourceOwnership = (
  userIdParam: string,
  createdByParam: string = 'createdBy'
) => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const resourceUserId = req.params[userIdParam] || req.body[userIdParam];
      const createdBy = req.body[createdByParam] || req.params[createdByParam];

      if (req.user.id !== resourceUserId && req.user.id !== createdBy) {
        res.status(403).json({
          error: 'You do not own this resource',
          code: 'RESOURCE_OWNERSHIP_DENIED',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      res.status(500).json({ error: 'Failed to check resource ownership' });
    }
  };
};

/**
 * Middleware to ensure organization context matches request
 */
export const ensureOrgContext = (
  source: 'param' | 'body' = 'param',
  paramName: string = 'orgId'
) => {
  return (req: EnhancedAuthRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      let requestOrgId: string | undefined;

      if (source === 'param') {
        requestOrgId = req.params[paramName];
      } else {
        requestOrgId = req.body[paramName];
      }

      if (!requestOrgId) {
        res.status(400).json({
          error: `Organization ID (${paramName}) is required`,
          code: 'ORG_CONTEXT_MISSING',
        });
        return;
      }

      if (req.user.org_id !== requestOrgId) {
        res.status(403).json({
          error: 'Organization context mismatch',
          code: 'ORG_CONTEXT_MISMATCH',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Organization context error:', error);
      res.status(500).json({ error: 'Failed to verify organization context' });
    }
  };
};

/**
 * Middleware to enforce role-based rate limiting
 * Different roles get different request allowances
 */
export const enforceRateLimitByRole = (baseLimitPerMinute: number = 60) => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(); // Skip rate limiting for unauthenticated requests
      }

      // Role multipliers
      const roleMultipliers: Record<string, number> = {
        OWNER: 5,
        ADMIN: 4,
        CREATOR: 2,
        REVIEWER: 1.5,
        VIEWER: 1,
        MEMBER: 0.5,
      };

      const multiplier = roleMultipliers[req.user.org_role] || 1;
      const limit = Math.floor(baseLimitPerMinute * multiplier);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', limit - 1);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());

      // TODO: Implement actual rate limiting logic with Redis or in-memory store
      // For now, just set headers and pass through

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      // Don't block request on rate limiter error
      next();
    }
  };
};

/**
 * Extend EnhancedAuthRequest to include permissions
 */
declare global {
  namespace Express {
    interface Request {
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
      };
    }
  }
}

export {};
