import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import permissionService from '../services/permission.service';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Middleware to check if user has specific permission(s)
 */
export const requirePermission = (permission: string | string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      const permissions = Array.isArray(permission) ? permission : [permission];

      // Check if user has any of the required permissions
      const hasPermission = await permissionService.hasAnyPermission(req.user.id, permissions);

      if (!hasPermission) {
        logger.warn(`User ${req.user.id} denied access - missing permission: ${permissions.join(', ')}`);
        throw new ForbiddenError('Insufficient permissions to perform this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user has all specified permissions
 */
export const requireAllPermissions = (permissions: string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      const hasAllPermissions = await permissionService.hasAllPermissions(req.user.id, permissions);

      if (!hasAllPermissions) {
        logger.warn(`User ${req.user.id} denied access - missing all permissions: ${permissions.join(', ')}`);
        throw new ForbiddenError('Insufficient permissions to perform this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check resource-specific access
 */
export const requireResourceAccess = (
  resourceType: string,
  resourceIdParam: string = 'id',
  requiredLevel: string = 'view'
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        throw new ForbiddenError('Resource ID not provided');
      }

      const hasAccess = await permissionService.hasResourceAccess(
        req.user.id,
        resourceType,
        resourceId,
        requiredLevel
      );

      if (!hasAccess) {
        logger.warn(`User ${req.user.id} denied access to ${resourceType} ${resourceId} - required level: ${requiredLevel}`);
        throw new ForbiddenError(`You do not have ${requiredLevel} access to this ${resourceType}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user is an admin
 */
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const isAdmin = await permissionService.isAdmin(req.user.id);

    if (!isAdmin) {
      logger.warn(`User ${req.user.id} denied admin access`);
      throw new ForbiddenError('Administrator access required');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user is a reviewer
 */
export const requireReviewer = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const isReviewer = await permissionService.isReviewer(req.user.id);

    if (!isReviewer) {
      logger.warn(`User ${req.user.id} denied reviewer access`);
      throw new ForbiddenError('Reviewer access required');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to attach user permissions to request
 */
export const attachPermissions = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      const permissions = await permissionService.getUserPermissions(req.user.id);
      const roles = await permissionService.getUserRoles(req.user.id);

      // Attach to request for use in controllers
      req.userPermissions = permissions.map(p => p.name);
      req.userRoles = roles.map(r => r.name);
    }

    next();
  } catch (error) {
    // Don't fail if we can't get permissions, just log
    logger.error('Error attaching permissions:', error);
    next();
  }
};

/**
 * Helper to check permissions in controllers
 */
export const checkPermission = async (userId: string, permission: string): Promise<boolean> => {
  return await permissionService.hasPermission(userId, permission);
};

/**
 * Helper to check resource access in controllers
 */
export const checkResourceAccess = async (
  userId: string,
  resourceType: string,
  resourceId: string,
  requiredLevel: string = 'view'
): Promise<boolean> => {
  return await permissionService.hasResourceAccess(userId, resourceType, resourceId, requiredLevel);
};