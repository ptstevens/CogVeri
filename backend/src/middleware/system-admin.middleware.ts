import { Response, NextFunction } from 'express';
import { EnhancedAuthRequest } from './enhanced-auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { PRIMARY_ADMIN_EMAIL } from '../config/sysadmin';

/**
 * System-Level Permission Middleware
 *
 * This middleware handles system-level (global) permissions, separate from organization-level roles.
 *
 * Permission Hierarchy:
 * - System Roles: SUPER_ADMIN (can manage all organizations, users, and system-wide features)
 * - Organization Roles: OWNER > ADMIN > MEMBER > VIEWER (can only manage their own organization)
 */

/**
 * Check if user has system-level admin privileges
 * Queries the users table to check system_role field
 */
export const isSystemAdmin = async (userId: string): Promise<boolean> => {
  try {
    const user = await db('users').where('id', userId).select('system_role').first();
    return user?.system_role === 'SUPER_ADMIN';
  } catch (error) {
    logger.error('Error checking system admin status:', error);
    return false;
  }
};

/**
 * Check if user is the primary system admin (admin@cogveri.com)
 *
 * The primary admin is identified by their email address, NOT by being
 * the first admin (by system_admin_since). This is a security measure
 * to ensure only the designated master account can grant/revoke SYSADMIN.
 */
export const isPrimarySystemAdmin = async (userId: string): Promise<boolean> => {
  try {
    const user = await db('users')
      .where('id', userId)
      .where('system_role', 'SUPER_ADMIN')
      .select('email')
      .first();

    if (!user) return false;

    // Primary admin is specifically admin@cogveri.com
    return user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
  } catch (error) {
    logger.error('Error checking primary system admin status:', error);
    return false;
  }
};

/**
 * Check if user email matches the primary admin email
 * Does not require database lookup - can use JWT payload
 */
export const isPrimaryAdminEmail = (email: string): boolean => {
  return email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
};

/**
 * Check if user is organization owner
 */
export const isOrganizationOwner = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    // First check organization_members table (new multi-org model)
    const member = await db('organization_members')
      .where({
        user_id: userId,
        organization_id: organizationId,
        role: 'owner',
        status: 'active',
      })
      .select('role')
      .first();

    if (member) return true;

    // Fallback to legacy users table (transition period)
    const legacyMember = await db('users')
      .where({
        id: userId,
        organization_id: organizationId,
        org_role: 'owner',
      })
      .first();

    return !!legacyMember;
  } catch (error) {
    logger.error('Error checking organization owner status:', error);
    return false;
  }
};

/**
 * Check if user is organization admin (owner or admin role)
 */
export const isOrganizationAdmin = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    // First check organization_members table (new multi-org model)
    const member = await db('organization_members')
      .where({
        user_id: userId,
        organization_id: organizationId,
        status: 'active',
      })
      .whereIn('role', ['owner', 'admin'])
      .select('role')
      .first();

    if (member) return true;

    // Fallback to legacy users table (transition period)
    const legacyMember = await db('users')
      .where({
        id: userId,
        organization_id: organizationId,
      })
      .whereIn('org_role', ['owner', 'admin'])
      .first();

    return !!legacyMember;
  } catch (error) {
    logger.error('Error checking organization admin status:', error);
    return false;
  }
};

/**
 * Check if user has a specific organization role
 */
export const hasOrganizationRole = async (
  userId: string,
  organizationId: string,
  role: string
): Promise<boolean> => {
  try {
    // First check organization_members table (new multi-org model)
    const member = await db('organization_members')
      .where({
        user_id: userId,
        organization_id: organizationId,
        role: role.toLowerCase(),
        status: 'active',
      })
      .select('role')
      .first();

    if (member) return true;

    // Fallback to legacy users table (transition period)
    const legacyMember = await db('users')
      .where({
        id: userId,
        organization_id: organizationId,
        org_role: role.toLowerCase(),
      })
      .first();

    return !!legacyMember;
  } catch (error) {
    logger.error('Error checking organization role:', error);
    return false;
  }
};

/**
 * Get user's system role
 */
export const getUserSystemRole = async (userId: string): Promise<string | null> => {
  try {
    const user = await db('users').where('id', userId).select('system_role').first();
    return user?.system_role || null;
  } catch (error) {
    logger.error('Error getting user system role:', error);
    return null;
  }
};

/**
 * Get user's role in a specific organization
 */
export const getUserOrganizationRole = async (
  userId: string,
  organizationId: string
): Promise<string | null> => {
  try {
    // First check organization_members table (new multi-org model)
    const member = await db('organization_members')
      .where({
        user_id: userId,
        organization_id: organizationId,
        status: 'active',
      })
      .select('role')
      .first();

    if (member?.role) {
      return member.role;
    }

    // Fallback to legacy users table (transition period)
    const legacyMember = await db('users')
      .where({
        id: userId,
        organization_id: organizationId,
      })
      .select('org_role')
      .first();

    return legacyMember?.org_role || null;
  } catch (error) {
    logger.error('Error getting user organization role:', error);
    return null;
  }
};

/**
 * Middleware: Require system admin (SUPER_ADMIN role)
 * Only system administrators can access these endpoints
 */
export const requireSystemAdmin = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Not authenticated',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    const isAdmin = await isSystemAdmin(req.user.id);

    if (!isAdmin) {
      logger.warn(`Unauthorized system admin access attempt by user ${req.user.id}`);
      res.status(403).json({
        error: 'System administrator access required',
        code: 'INSUFFICIENT_SYSTEM_PERMISSIONS',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('System admin middleware error:', error);
    res.status(500).json({
      error: 'Failed to verify system admin status',
      code: 'PERMISSION_CHECK_ERROR',
    });
  }
};

/**
 * Middleware: Require PRIMARY admin (admin@cogveri.com)
 *
 * This is a stricter check than requireSystemAdmin.
 * Only the primary admin (admin@cogveri.com) can access these endpoints.
 * Used for sensitive operations like granting/revoking SYSADMIN status.
 *
 * IMPORTANT: This middleware MUST come after enhancedAuthenticate
 */
export const requirePrimaryAdmin = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Not authenticated',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    // Check if user email matches primary admin email
    if (!isPrimaryAdminEmail(req.user.email)) {
      logger.warn(
        `Unauthorized primary admin access attempt by user ${req.user.id} (${req.user.email})`
      );
      res.status(403).json({
        error: 'Primary administrator access required',
        code: 'PRIMARY_ADMIN_REQUIRED',
      });
      return;
    }

    // Also verify they are a system admin (belt and suspenders)
    const isAdmin = await isSystemAdmin(req.user.id);
    if (!isAdmin) {
      logger.warn(`Primary admin email matched but user ${req.user.id} is not a system admin`);
      res.status(403).json({
        error: 'Primary administrator access required',
        code: 'PRIMARY_ADMIN_REQUIRED',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Primary admin middleware error:', error);
    res.status(500).json({
      error: 'Failed to verify primary admin status',
      code: 'PERMISSION_CHECK_ERROR',
    });
  }
};

/**
 * Middleware: Require organization owner
 * Only organization owners can access these endpoints
 * Expects organizationId in req.params.organizationId
 */
export const requireOrganizationOwner = (paramName: string = 'organizationId') => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Not authenticated',
          code: 'UNAUTHENTICATED',
        });
        return;
      }

      const organizationId = req.params[paramName];

      if (!organizationId) {
        res.status(400).json({
          error: `Organization ID (${paramName}) is required in request parameters`,
          code: 'MISSING_ORG_ID',
        });
        return;
      }

      const isOwner = await isOrganizationOwner(req.user.id, organizationId);

      if (!isOwner) {
        logger.warn(
          `Unauthorized owner access attempt by user ${req.user.id} for org ${organizationId}`
        );
        res.status(403).json({
          error: 'Organization owner access required',
          code: 'INSUFFICIENT_ORG_PERMISSIONS',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Organization owner middleware error:', error);
      res.status(500).json({
        error: 'Failed to verify organization owner status',
        code: 'PERMISSION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Middleware: Require organization admin (owner or admin role)
 * Only organization admins can access these endpoints
 * Expects organizationId in req.params.organizationId
 */
export const requireOrganizationAdmin = (paramName: string = 'organizationId') => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Not authenticated',
          code: 'UNAUTHENTICATED',
        });
        return;
      }

      const organizationId = req.params[paramName];

      if (!organizationId) {
        res.status(400).json({
          error: `Organization ID (${paramName}) is required in request parameters`,
          code: 'MISSING_ORG_ID',
        });
        return;
      }

      const isAdmin = await isOrganizationAdmin(req.user.id, organizationId);

      if (!isAdmin) {
        logger.warn(
          `Unauthorized admin access attempt by user ${req.user.id} for org ${organizationId}`
        );
        res.status(403).json({
          error: 'Organization admin access required',
          code: 'INSUFFICIENT_ORG_PERMISSIONS',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Organization admin middleware error:', error);
      res.status(500).json({
        error: 'Failed to verify organization admin status',
        code: 'PERMISSION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Middleware: Require specific organization role
 * Only users with the specified role can access these endpoints
 */
export const requireOrganizationRole = (role: string, paramName: string = 'organizationId') => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Not authenticated',
          code: 'UNAUTHENTICATED',
        });
        return;
      }

      const organizationId = req.params[paramName];

      if (!organizationId) {
        res.status(400).json({
          error: `Organization ID (${paramName}) is required in request parameters`,
          code: 'MISSING_ORG_ID',
        });
        return;
      }

      const hasRole = await hasOrganizationRole(req.user.id, organizationId, role);

      if (!hasRole) {
        logger.warn(
          `Unauthorized role access attempt by user ${req.user.id} for role ${role} in org ${organizationId}`
        );
        res.status(403).json({
          error: `${role} role required for this organization`,
          code: 'INSUFFICIENT_ORG_PERMISSIONS',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Organization role middleware error:', error);
      res.status(500).json({
        error: 'Failed to verify organization role',
        code: 'PERMISSION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Middleware: Allow system admin OR organization admin
 * Either system admin OR organization admin can access
 */
export const requireAdminAccess = (paramName: string = 'organizationId') => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Not authenticated',
          code: 'UNAUTHENTICATED',
        });
      }

      const organizationId = req.params[paramName];

      if (!organizationId) {
        return res.status(400).json({
          error: `Organization ID (${paramName}) is required in request parameters`,
          code: 'MISSING_ORG_ID',
        });
      }

      // Check if system admin
      const isAdmin = await isSystemAdmin(req.user.id);
      if (isAdmin) {
        return next();
      }

      // Check if organization admin
      const isOrgAdmin = await isOrganizationAdmin(req.user.id, organizationId);
      if (isOrgAdmin) {
        return next();
      }

      logger.warn(
        `Unauthorized admin access attempt by user ${req.user.id} for org ${organizationId}`
      );
      res.status(403).json({
        error: 'System or organization admin access required',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    } catch (error) {
      logger.error('Admin access middleware error:', error);
      res.status(500).json({
        error: 'Failed to verify admin access',
        code: 'PERMISSION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Middleware: Verify user is member of organization
 * Prevents accessing other organizations' data
 */
export const requireOrganizationMembership = (paramName: string = 'organizationId') => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Not authenticated',
          code: 'UNAUTHENTICATED',
        });
      }

      const organizationId = req.params[paramName];

      if (!organizationId) {
        return res.status(400).json({
          error: `Organization ID (${paramName}) is required in request parameters`,
          code: 'MISSING_ORG_ID',
        });
      }

      // System admins can access any organization
      const isAdmin = await isSystemAdmin(req.user.id);
      if (isAdmin) {
        return next();
      }

      // Check if user is member of organization
      const member = await db('organization_members')
        .where({
          user_id: req.user.id,
          organization_id: organizationId,
        })
        .select('id')
        .first();

      if (!member) {
        logger.warn(
          `Unauthorized organization access attempt by user ${req.user.id} for org ${organizationId}`
        );
        return res.status(403).json({
          error: 'You are not a member of this organization',
          code: 'NOT_ORGANIZATION_MEMBER',
        });
      }

      next();
    } catch (error) {
      logger.error('Organization membership middleware error:', error);
      res.status(500).json({
        error: 'Failed to verify organization membership',
        code: 'PERMISSION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Middleware: Set RLS context to target organization for admin routes
 * This allows system admins to query organization-scoped data via RLS
 *
 * Usage: Place AFTER requireSystemAdmin to set context for the target org
 * For routes with :organizationId param, sets RLS context to that org
 */
export const setTargetOrgContext = (paramName: string = 'organizationId') => {
  return async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params[paramName];

      if (organizationId) {
        // Set RLS context to the target organization
        await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);
        logger.debug(`Admin RLS context set to org: ${organizationId}`);
      }

      next();
    } catch (error) {
      logger.error('Error setting target org context:', error);
      res.status(500).json({
        error: 'Failed to set organization context',
        code: 'CONTEXT_ERROR',
      });
    }
  };
};

/**
 * Middleware: Attach user's system and organization roles to request
 * Useful for logging and conditional UI rendering
 */
export const attachUserRoles = async (
  req: EnhancedAuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return next();
    }

    const systemRole = await getUserSystemRole(req.user.id);
    const orgRole = req.user.org_id
      ? await getUserOrganizationRole(req.user.id, req.user.org_id)
      : null;

    (req.user as any).systemRole = systemRole;
    (req.user as any).organizationRole = orgRole;

    next();
  } catch (error) {
    logger.error('Error attaching user roles:', error);
    // Don't fail the request on role attachment error
    next();
  }
};
