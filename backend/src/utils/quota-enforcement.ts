import { Request, Response, NextFunction } from 'express';
import pricingService from '../services/pricing.service';
import { logger } from './logger';

/**
 * Quota Enforcement Utilities
 * Provides reusable quota checking functions for controllers
 */

/**
 * Check if organization has quota available for a specific limit type
 * Returns { allowed, current, limit, percentageUsed }
 */
export async function checkQuotaAvailability(
  organizationId: string,
  limitType: 'members' | 'storage' | 'tasks'
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  percentageUsed: number;
}> {
  try {
    const result = await pricingService.checkFeatureLimit(organizationId, limitType);
    return result;
  } catch (error) {
    logger.error(`Error checking quota for ${limitType}:`, error);
    throw error;
  }
}

/**
 * Enforce quota limit - throws error if limit exceeded
 * Returns quota info if allowed
 */
export async function enforceQuotaLimit(
  organizationId: string,
  limitType: 'members' | 'storage' | 'tasks'
): Promise<{
  current: number;
  limit: number;
  percentageUsed: number;
}> {
  const quotaCheck = await checkQuotaAvailability(organizationId, limitType);

  if (!quotaCheck.allowed) {
    const error = new Error(`${limitType} quota limit reached`);
    (error as any).statusCode = 429;
    (error as any).quotaExceeded = true;
    (error as any).limitType = limitType;
    (error as any).current = quotaCheck.current;
    (error as any).limit = quotaCheck.limit;
    throw error;
  }

  return {
    current: quotaCheck.current,
    limit: quotaCheck.limit,
    percentageUsed: quotaCheck.percentageUsed,
  };
}

/**
 * Check API rate limit for organization
 * Rate limits are based on subscription tier
 */
export async function checkRateLimitQuota(
  organizationId: string,
  _apiCallsMade: number = 1
): Promise<boolean> {
  try {
    const quotaCheck = await pricingService.checkFeatureLimit(organizationId, 'tasks');
    // For API calls, we use the tasks limit as a proxy
    // In a real system, you'd track API calls separately
    return quotaCheck.allowed;
  } catch (error) {
    logger.error('Error checking rate limit quota:', error);
    return false;
  }
}

/**
 * Middleware to enforce storage quota on recording uploads
 */
export const enforceStorageQuota = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      res.status(400).json({
        error: 'Organization ID is required',
      });
      return;
    }

    const storageQuota = await checkQuotaAvailability(organizationId, 'storage');

    if (storageQuota.percentageUsed > 90) {
      logger.warn(`Storage quota at ${storageQuota.percentageUsed}% for org ${organizationId}`);
      res.status(429).json({
        error: 'Storage quota nearly exceeded',
        limitType: 'storage',
        current: storageQuota.current,
        limit: storageQuota.limit,
        percentageUsed: storageQuota.percentageUsed,
        message:
          'Your organization is using over 90% of its storage quota. Please upgrade or delete old recordings.',
      });
      return;
    }

    if (!storageQuota.allowed) {
      res.status(429).json({
        error: 'Storage quota limit exceeded',
        limitType: 'storage',
        current: storageQuota.current,
        limit: storageQuota.limit,
        percentageUsed: storageQuota.percentageUsed,
        message:
          'Your organization has reached its storage limit. Please upgrade your plan or delete old recordings.',
      });
      return;
    }

    // Attach quota info to request for logging
    (req as any).storageQuota = storageQuota;
    next();
  } catch (error: any) {
    logger.error('Error checking storage quota:', error);
    res.status(500).json({
      error: 'Failed to verify storage quota',
    });
  }
};

/**
 * Middleware to enforce member quota on user invitations
 */
export const enforceMemberQuota = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      res.status(400).json({
        error: 'Organization ID is required',
      });
      return;
    }

    const memberQuota = await checkQuotaAvailability(organizationId, 'members');

    if (!memberQuota.allowed) {
      res.status(429).json({
        error: 'Member quota limit exceeded',
        limitType: 'members',
        current: memberQuota.current,
        limit: memberQuota.limit,
        percentageUsed: memberQuota.percentageUsed,
        message: `Your organization has reached its maximum member limit of ${memberQuota.limit}. Please upgrade your plan to add more members.`,
      });
      return;
    }

    // Attach quota info to request for logging
    (req as any).memberQuota = memberQuota;
    next();
  } catch (error: any) {
    logger.error('Error checking member quota:', error);
    res.status(500).json({
      error: 'Failed to verify member quota',
    });
  }
};

/**
 * Middleware to enforce task quota on task creation
 */
export const enforceTaskQuota = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      res.status(400).json({
        error: 'Organization ID is required',
      });
      return;
    }

    const taskQuota = await checkQuotaAvailability(organizationId, 'tasks');

    if (taskQuota.percentageUsed > 90) {
      logger.warn(`Task quota at ${taskQuota.percentageUsed}% for org ${organizationId}`);
    }

    if (!taskQuota.allowed) {
      res.status(429).json({
        error: 'Task quota limit exceeded for this month',
        limitType: 'tasks',
        current: taskQuota.current,
        limit: taskQuota.limit,
        percentageUsed: taskQuota.percentageUsed,
        message: `Your organization has reached its monthly task limit of ${taskQuota.limit}. Limit resets on the 1st of next month.`,
      });
      return;
    }

    // Attach quota info to request for logging
    (req as any).taskQuota = taskQuota;
    next();
  } catch (error: any) {
    logger.error('Error checking task quota:', error);
    res.status(500).json({
      error: 'Failed to verify task quota',
    });
  }
};

/**
 * Get full quota status for organization
 * Useful for dashboard/UI displays
 */
export async function getFullQuotaStatus(organizationId: string) {
  try {
    const usage = await pricingService.getOrganizationUsage(organizationId);

    return {
      organization: {
        id: usage.organization.id,
        name: usage.organization.name,
        tier: usage.tier.displayName,
      },
      quotas: {
        members: {
          current: usage.usage.members.current,
          limit: usage.usage.members.limit,
          percentageUsed: usage.usage.members.percentageUsed,
          exceeded: usage.usage.members.current >= usage.usage.members.limit,
        },
        storage: {
          current: usage.usage.storage.current,
          limit: usage.usage.storage.limit,
          percentageUsed: usage.usage.storage.percentageUsed,
          exceeded: usage.usage.storage.current >= usage.usage.storage.limit,
        },
        tasks: {
          current: usage.usage.tasks.current,
          limit: usage.usage.tasks.limit,
          percentageUsed: usage.usage.tasks.percentageUsed,
          exceeded: usage.usage.tasks.current >= usage.usage.tasks.limit,
        },
      },
      warnings: usage.warnings,
    };
  } catch (error) {
    logger.error('Error getting full quota status:', error);
    throw error;
  }
}
