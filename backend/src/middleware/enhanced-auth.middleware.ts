import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwt.service';
import { logger } from '../utils/logger';
import { AsyncLocalStorage } from 'async_hooks';
import { IncomingHttpHeaders } from 'http';
import { db } from '../config/database';

/**
 * Extended request interface with authenticated user context.
 *
 * Note: We explicitly declare params, query, body, and headers properties
 * to ensure TypeScript compilation succeeds in Docker environments where
 * @types/express may not be properly resolved. The types are defined inline
 * to avoid dependency on external type packages.
 */
export interface EnhancedAuthRequest extends Request {
  // Express Request properties - explicitly declared for Docker build compatibility
  // Types defined inline to avoid @types/express resolution issues in Docker
  params: { [key: string]: string };
  query: { [key: string]: string | string[] | undefined };
  body: any;
  headers: IncomingHttpHeaders;

  // Custom user property set by authentication middleware
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
    is_system_admin?: boolean;
  };
}

// Create async local storage for organization context
export const orgContext = new AsyncLocalStorage<{ orgId: string; orgSlug: string }>();

/**
 * Main authentication middleware - validates JWT and sets up organization context
 * Also checks if user is deactivated and sets PostgreSQL RLS context
 */
export const enhancedAuthenticate = async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = jwtService.verifyAccessToken(token);

    // Check if user account is active
    const user = await db('users')
      .where('id', payload.userId)
      .select('is_active', 'current_organization_id')
      .first();

    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User account not found or inactive' });
      return;
    }

    // Check if organization is suspended
    if (payload.org_id) {
      const organization = await db('organizations')
        .where('id', payload.org_id)
        .select('is_active', 'suspended_at', 'suspended_reason', 'scheduled_deletion_at', 'name')
        .first();

      if (organization?.suspended_at) {
        // Organization is suspended - return specific error for frontend handling
        res.status(403).json({
          error: 'Organization suspended',
          code: 'ORGANIZATION_SUSPENDED',
          data: {
            reason: organization.suspended_reason,
            suspendedAt: organization.suspended_at,
            scheduledDeletionAt: organization.scheduled_deletion_at,
            organizationName: organization.name,
          },
        });
        return;
      }

      if (organization && !organization.is_active) {
        res.status(403).json({
          error: 'Organization is inactive',
          code: 'ORGANIZATION_INACTIVE',
        });
        return;
      }
    }

    // Check membership status in the target organization using organization_members table
    if (payload.org_id) {
      const membership = await db('organization_members')
        .where('user_id', payload.userId)
        .where('organization_id', payload.org_id)
        .select('status', 'role')
        .first();

      // Fall back to legacy users table if no membership record (transition period)
      if (!membership) {
        const legacyUser = await db('users')
          .where('id', payload.userId)
          .where('organization_id', payload.org_id)
          .select('org_status')
          .first();

        if (legacyUser?.org_status === 'inactive') {
          res.status(401).json({ error: 'Your account has been deactivated. Please contact your organization administrator.' });
          return;
        }
      } else if (membership.status === 'inactive') {
        res.status(401).json({ error: 'Your account has been deactivated. Please contact your organization administrator.' });
        return;
      }
    }

    // Set PostgreSQL RLS context for data isolation
    // This ensures database-level security even if application code has bugs
    if (payload.org_id) {
      await db.raw('SELECT set_current_org(?::uuid)', [payload.org_id]);
    }
    await db.raw('SELECT set_current_user_id(?::uuid)', [payload.userId]);

    // Attach user to request
    req.user = {
      id: payload.userId,
      email: payload.email,
      org_id: payload.org_id,
      org_slug: payload.org_slug,
      org_role: payload.org_role,
      organizations: payload.organizations,
      isImpersonating: !!payload.impersonation_id,
      impersonationId: payload.impersonation_id,
      actorUserId: payload.impersonation_actor_id,
      is_system_admin: payload.is_system_admin,
    };

    // Set AsyncLocalStorage organization context for application-level access
    orgContext.run({ orgId: payload.org_id, orgSlug: payload.org_slug }, () => {
      next();
    });
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};;

/**
 * Middleware to ensure organization context exists
 */
export const requireOrganization = (req: EnhancedAuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.org_id) {
    res.status(401).json({ error: 'Organization context required' });
    return;
  }
  next();
};

/**
 * Middleware factory to require specific roles
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: EnhancedAuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!allowedRoles.includes(req.user.org_role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.org_role,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to prevent actions while impersonating
 */
export const preventImpersonatedActions = (req: EnhancedAuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.isImpersonating) {
    res.status(403).json({
      error: 'Cannot perform this action while impersonating a user',
    });
    return;
  }
  next();
};

/**
 * Middleware to require impersonation context
 */
export const requireImpersonation = (req: EnhancedAuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isImpersonating) {
    res.status(403).json({
      error: 'Impersonation context required for this action',
    });
    return;
  }
  next();
};

/**
 * Endpoint middleware to refresh access token
 */
export const refreshAccessToken = async (
  req: EnhancedAuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken, targetOrgId } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const payload = jwtService.verifyRefreshToken(refreshToken);

    // Generate new access token
    const newAccessToken = await jwtService.generateAccessToken(payload.userId, targetOrgId);

    res.json({
      accessToken: newAccessToken,
      expiresIn: '1h',
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

/**
 * Endpoint middleware to switch organization
 */
export const switchOrganization = async (
  req: EnhancedAuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: 'Organization ID required' });
      return;
    }

    const newAccessToken = await jwtService.switchOrganization(req.user.id, organizationId);

    res.json({
      accessToken: newAccessToken,
      expiresIn: '1h',
    });
  } catch (error) {
    logger.error('Organization switch error:', error);
    res.status(400).json({ error: (error as Error).message });
  }
};

/**
 * Utility function to get organization context from AsyncLocalStorage
 */
export const getOrgContext = () => {
  return orgContext.getStore();
};
