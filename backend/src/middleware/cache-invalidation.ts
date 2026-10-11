/**
 * Cache Invalidation Middleware
 * Automatically invalidates relevant caches when data is modified
 * This ensures dashboard stats are fresh after task/recording updates
 */

import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cache.service';
import { logger } from '../utils/logger';

/**
 * Middleware to invalidate dashboard cache after task updates
 * Called after task creation, update, deletion, or status changes
 */
export const invalidateDashboardCache = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Get organization and user ID from request context
    const userId = (req as any).user?.userId;
    const organizationId = (req as any).organizationId || (req as any).user?.org_id;

    if (userId && organizationId && organizationId !== 'default-org') {
      // Invalidate the specific user's dashboard cache
      const cacheKey = `dashboard:stats:${organizationId}:${userId}`;
      await cacheService.delete(cacheKey);
      logger.debug(`Invalidated dashboard cache for user ${userId} in org ${organizationId}`);
    }

    next();
  } catch (error) {
    logger.error('Error invalidating dashboard cache:', error);
    // Don't fail the request if cache invalidation fails
    next();
  }
};

/**
 * Middleware to invalidate user-specific caches
 * Called after profile/user data updates
 */
export const invalidateUserCache = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;
    const organizationId = (req as any).organizationId || (req as any).user?.org_id;

    if (userId && organizationId && organizationId !== 'default-org') {
      // Invalidate dashboard cache (user data affects it)
      const dashboardCacheKey = `dashboard:stats:${organizationId}:${userId}`;
      await cacheService.delete(dashboardCacheKey);

      // Could add more specific user cache keys here
      logger.debug(`Invalidated user caches for user ${userId}`);
    }

    next();
  } catch (error) {
    logger.error('Error invalidating user cache:', error);
    next();
  }
};

/**
 * Middleware to invalidate recording-related caches
 */
export const invalidateRecordingCache = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.userId;
    const organizationId = (req as any).organizationId || (req as any).user?.org_id;

    if (userId && organizationId && organizationId !== 'default-org') {
      // Invalidate dashboard cache (recordings are displayed in stats)
      const dashboardCacheKey = `dashboard:stats:${organizationId}:${userId}`;
      await cacheService.delete(dashboardCacheKey);

      logger.debug(`Invalidated recording caches for user ${userId}`);
    }

    next();
  } catch (error) {
    logger.error('Error invalidating recording cache:', error);
    next();
  }
};

/**
 * Middleware to invalidate all caches for an organization
 * Use sparingly - for major data changes
 */
export const invalidateOrganizationCache = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = (req as any).organizationId || (req as any).user?.org_id;

    if (organizationId && organizationId !== 'default-org') {
      // Invalidate all dashboard caches for the organization
      const pattern = `dashboard:stats:${organizationId}:*`;
      const deletedCount = await cacheService.deletePattern(pattern);
      logger.debug(`Invalidated ${deletedCount} cache entries for org ${organizationId}`);
    }

    next();
  } catch (error) {
    logger.error('Error invalidating organization cache:', error);
    next();
  }
};
