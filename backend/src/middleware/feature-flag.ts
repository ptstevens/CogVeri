import { Request, Response, NextFunction } from 'express';
import pricingService from '../services/pricing.service';
import { db } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Feature Flag Middleware
 * Enforces feature access based on organization subscription tier
 */

export const requireFeature = (featureName: keyof import('../services/pricing.service').PricingTier['features']) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params.organizationId || req.body.organizationId || req.user?.org_id;

      if (!organizationId) {
        res.status(400).json({
          error: 'Organization ID is required for feature access check'
        });
        return;
      }

      // Get organization with tier info
      const organization = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'is_active', 'is_suspended')
        .first();

      if (!organization) {
        res.status(404).json({
          error: 'Organization not found'
        });
        return;
      }

      if (!organization.is_active || organization.is_suspended) {
        res.status(403).json({
          error: 'Organization is not active or has been suspended'
        });
        return;
      }

      // Check if organization has access to feature (respects custom overrides)
      const hasAccess = await pricingService.hasOrganizationFeatureAccess(organizationId, featureName);

      if (!hasAccess) {
        logger.warn(
          `Feature access denied: ${featureName} not available for organization ${organizationId} (tier: ${organization.subscription_tier})`
        );

        res.status(403).json({
          error: `Feature "${featureName}" is not available on your current plan`,
          feature: featureName,
          currentTier: organization.subscription_tier,
          suggestion: `Upgrade to a higher tier to access this feature`
        });
        return;
      }

      // Feature is available - attach to request for logging
      (req as any).featureAccess = {
        feature: featureName,
        tier: organization.subscription_tier,
        allowed: true
      };

      next();
    } catch (error: any) {
      logger.error(`Error checking feature access for ${featureName}:`, error);
      res.status(500).json({
        error: 'Failed to verify feature access'
      });
    }
  };
};

/**
 * Check usage limits before allowing feature usage
 * Prevents operations that would exceed tier limits
 */
export const requireUsageLimit = (limitType: 'members' | 'storage' | 'tasks') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params.organizationId || req.body.organizationId || req.user?.org_id;

      if (!organizationId) {
        res.status(400).json({
          error: 'Organization ID is required for usage limit check'
        });
        return;
      }

      // Check if organization would exceed limit
      const limitCheck = await pricingService.checkFeatureLimit(organizationId, limitType);

      if (!limitCheck.allowed) {
        logger.warn(
          `Usage limit exceeded: ${limitType} at ${limitCheck.percentageUsed}% (org: ${organizationId})`
        );

        res.status(429).json({
          error: `${limitType} limit reached for your organization`,
          limitType,
          current: limitCheck.current,
          limit: limitCheck.limit,
          percentageUsed: limitCheck.percentageUsed,
          suggestion: `Upgrade your plan or contact support to increase your ${limitType} limit`
        });
        return;
      }

      // Attach usage info to request for logging
      (req as any).usageLimit = limitCheck;

      next();
    } catch (error: any) {
      logger.error(`Error checking usage limit for ${limitType}:`, error);
      res.status(500).json({
        error: 'Failed to verify usage limits'
      });
    }
  };
};

/**
 * Get organization tier info (non-blocking)
 * Attaches organization tier to request for conditional logic
 */
export const attachOrganizationTier = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.params.organizationId || req.body.organizationId || req.user?.org_id;

    if (organizationId) {
      const organization = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'id')
        .first();

      if (organization) {
        (req as any).organizationTier = {
          organizationId: organization.id,
          tier: organization.subscription_tier
        };
      }
    }

    next();
  } catch (error) {
    // Non-blocking - continue even if error
    next();
  }
};

export default {
  requireFeature,
  requireUsageLimit,
  attachOrganizationTier
};
