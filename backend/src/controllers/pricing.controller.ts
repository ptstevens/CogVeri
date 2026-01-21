import { Request, Response, NextFunction } from 'express';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import pricingService from '../services/pricing.service';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const updateTierSchema = z.object({
  tierName: z.enum(['free', 'enterprise']),
});

const checkLimitSchema = z.object({
  feature: z.enum(['members', 'storage', 'tasks']),
});

/**
 * Get all available pricing tiers
 */
export const getPricingTiers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tiers = await pricingService.getPricingTiers();

    res.json({
      success: true,
      data: {
        tiers,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific pricing tier details
 */
export const getPricingTier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tierName } = req.params;
    const tier = await pricingService.getPricingTier(tierName);

    res.json({
      success: true,
      data: {
        tier,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get organization usage and current tier
 * Requires organization context from EnhancedAuthRequest
 */
export const getOrganizationUsage = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const usage = await pricingService.getOrganizationUsage(req.user.org_id);

    res.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check specific feature limit for organization
 */
export const checkFeatureLimit = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const { feature } = checkLimitSchema.parse(req.query);

    const limitCheck = await pricingService.checkFeatureLimit(
      req.user.org_id,
      feature as 'members' | 'storage' | 'tasks'
    );

    res.json({
      success: true,
      data: limitCheck,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

/**
 * Upgrade organization to new pricing tier
 * Requires OWNER role
 */
export const upgradeOrganization = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    if (req.user.org_role !== 'OWNER') {
      throw new UnauthorizedError('Only organization owners can upgrade subscription');
    }

    const { tierName } = updateTierSchema.parse(req.body);

    const result = await pricingService.updateOrganizationTier(req.user.org_id, tierName);

    logger.info(`Organization ${req.user.org_id} upgraded to ${tierName} by ${req.user.id}`);

    res.json({
      success: true,
      message: `Subscription upgraded to ${tierName}`,
      data: {
        organization: result.organization,
        previousTier: result.previousTier,
        newTier: result.newTier,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

/**
 * Get feature availability for organization
 */
export const getFeatureAccess = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    // Get organization tier
    const { db } = await import('../config/database');
    const org = await db('organizations').where('id', req.user.org_id).first();

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    // List all features - use valid feature names from PricingTier
    const features = [
      'customBranding',
      'advancedAnalytics',
      'apiAccess',
      'prioritySupport',
      'ssoSaml',
      'advancedPermissions',
      'auditLogs',
      'ipWhitelist',
      'customDomain',
      'webhooks',
      'customDataRetention',
    ] as const;

    const featureDescriptions = pricingService.getFeatureDescriptions();
    const access = features.reduce((acc, feature) => {
      acc[feature] = {
        allowed: pricingService.hasFeatureAccess(org.subscription_tier, feature),
        description: featureDescriptions[feature]?.description || feature,
      };
      return acc;
    }, {} as Record<string, { allowed: boolean; description: string }>);

    res.json({
      success: true,
      data: {
        currentTier: org.subscription_tier,
        features: access,
      },
    });
  } catch (error) {
    next(error);
  }
};
