import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { db } from '../config/database';
import pricingService, { PricingTier, PRICING_TIERS } from '../services/pricing.service';
import { logger } from '../utils/logger';

/**
 * Quota Enforcer Middleware
 *
 * Provides middleware factory functions for enforcing usage limits
 * based on organization subscription tier.
 *
 * Error codes:
 * - 402 Payment Required: Limit exceeded, upgrade needed
 * - 403 Forbidden: Feature not available on tier
 * - 401 Unauthorized: No valid authentication
 */

// Error response helper
interface QuotaErrorDetails {
  code: 'LIMIT_EXCEEDED' | 'FEATURE_NOT_AVAILABLE' | 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_REQUIRED' | 'TRIAL_EXPIRED_READ_ONLY';
  message: string;
  details: {
    feature: string;
    current?: number;
    limit?: number;
    tier: string;
    upgradeUrl: string;
    suggestedTier?: string;
    readOnlyMode?: boolean;
  };
}

const createQuotaError = (
  res: Response,
  statusCode: number,
  error: QuotaErrorDetails
): Response => {
  return res.status(statusCode).json({
    success: false,
    error,
  });
};

const getUpgradeUrl = (): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';
  return `${frontendUrl}/organizations/settings?tab=billing`;
};

// Helper to get suggested upgrade tier
const getSuggestedUpgradeTier = (currentTier: string): string | undefined => {
  const tierOrder = ['free', 'enterprise'];
  const currentIndex = tierOrder.indexOf(currentTier.toLowerCase());
  if (currentIndex >= 0 && currentIndex < tierOrder.length - 1) {
    return tierOrder[currentIndex + 1];
  }
  return undefined;
};

// Get organization ID from request
const getOrganizationId = (req: AuthenticatedRequest): string | null => {
  // Try from authenticated user first
  if (req.user?.org_id) {
    return req.user.org_id;
  }
  // Try from route params
  if (req.params?.organizationId) {
    return req.params.organizationId;
  }
  if (req.params?.orgId) {
    return req.params.orgId;
  }
  // Try from body
  const body = req.body as Record<string, unknown> | undefined;
  if (body?.organizationId && typeof body.organizationId === 'string') {
    return body.organizationId;
  }
  return null;
};

// Get current subscription and tier for organization
interface SubscriptionInfo {
  tier: PricingTier;
  tierName: string;
  isActive: boolean;
  isTrial: boolean;
  trialEndsAt: Date | null;
  subscriptionStatus: string;
}

const getSubscriptionInfo = async (organizationId: string): Promise<SubscriptionInfo | null> => {
  try {
    // Get organization with subscription info
    const org = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!org) {
      return null;
    }

    // Get active subscription
    const subscription = await db('organization_subscriptions')
      .where('organization_id', organizationId)
      .whereIn('status', ['active', 'trialing'])
      .orderBy('created_at', 'desc')
      .first();

    const tierName = subscription?.tier || org.subscription_tier || 'free';
    const tier = PRICING_TIERS[tierName.toLowerCase()] || PRICING_TIERS.free!;

    // Determine if subscription is active:
    // - Has active/trialing subscription record, OR
    // - Is free tier (always active), OR
    // - Is enterprise tier without subscription (e.g., SUPER_ADMIN org)
    const isActive = subscription?.status === 'active' || 
                     subscription?.status === 'trialing' || 
                     tierName.toLowerCase() === 'free' ||
                     tierName.toLowerCase() === 'enterprise';

    return {
      tier: tier,
      tierName: tierName.toLowerCase(),
      isActive,
      isTrial: subscription?.is_trial || false,
      trialEndsAt: subscription?.trial_end || null,
      subscriptionStatus: subscription?.status || 'active',
    };
  } catch (error) {
    logger.error('Error getting subscription info:', error);
    return null;
  }
};

// Get current month's usage
interface MonthlyUsage {
  tasksCount: number;
  videosCount: number;
  storageBytes: number;
  membersCount: number;
  externalContributorsCount: number;
  workspacesCount: number;
  totalVideoDurationSeconds: number;
}

const getCurrentMonthUsage = async (organizationId: string): Promise<MonthlyUsage> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Try to get from usage table first
  const usageRecord = await db('organization_usage')
    .where('organization_id', organizationId)
    .where('year', year)
    .where('month', month)
    .first();

  if (usageRecord) {
    return {
      tasksCount: usageRecord.tasks_count || 0,
      videosCount: usageRecord.videos_count || 0,
      storageBytes: parseInt(usageRecord.storage_bytes) || 0,
      membersCount: usageRecord.members_count || 0,
      externalContributorsCount: usageRecord.external_contributors_count || 0,
      workspacesCount: usageRecord.workspaces_count || 0,
      totalVideoDurationSeconds: parseInt(usageRecord.total_video_duration_seconds) || 0,
    };
  }

  // Calculate from raw data if no usage record
  const [memberCount] = await db('users')
    .where('organization_id', organizationId)
    .count('id as count');

  const [taskCount] = await db('tasks')
    .where('organization_id', organizationId)
    .whereRaw('created_at >= date_trunc(\'month\', now())')
    .count('id as count');

  const [videoCount] = await db('recordings')
    .where('organization_id', organizationId)
    .whereRaw('created_at >= date_trunc(\'month\', now())')
    .count('id as count');

  const [storageSum] = await db('recordings')
    .where('organization_id', organizationId)
    .where('status', '!=', 'deleted')
    .sum('file_size_bytes as total');

  // Check if external_contributors table exists
  let externalCount = 0;
  try {
    const [extCount] = await db('external_contributors')
      .where('organization_id', organizationId)
      .where('is_active', true)
      .count('id as count');
    externalCount = parseInt(String(extCount?.count)) || 0;
  } catch {
    // Table may not exist yet
  }

  // Check if workspaces table exists
  let workspaceCount = 0;
  try {
    const [wsCount] = await db('workspaces')
      .where('organization_id', organizationId)
      .count('id as count');
    workspaceCount = parseInt(String(wsCount?.count)) || 0;
  } catch {
    // Table may not exist yet
  }

  return {
    tasksCount: parseInt(String(taskCount?.count)) || 0,
    videosCount: parseInt(String(videoCount?.count)) || 0,
    storageBytes: parseInt(storageSum?.total) || 0,
    membersCount: parseInt(String(memberCount?.count)) || 0,
    externalContributorsCount: externalCount,
    workspacesCount: workspaceCount,
    totalVideoDurationSeconds: 0, // Would need to sum from recordings
  };
};

/**
 * Check if organization can add more members
 */
export const checkMemberLimit = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limit = subInfo.tier.limits.maxMembers;

      // -1 means unlimited
      if (limit === -1) {
        next();
        return;
      }

      const usage = await getCurrentMonthUsage(organizationId);

      if (usage.membersCount >= limit) {
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `You've reached your member limit of ${limit} on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'members',
            current: usage.membersCount,
            limit,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkMemberLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Check if organization can create more tasks this month
 */
export const checkTaskLimit = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limit = subInfo.tier.limits.maxTasksPerMonth;

      // -1 means unlimited
      if (limit === -1) {
        next();
        return;
      }

      const usage = await getCurrentMonthUsage(organizationId);

      if (usage.tasksCount >= limit) {
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `You've reached your monthly task limit of ${limit} on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'tasks',
            current: usage.tasksCount,
            limit,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkTaskLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Check if organization can upload more videos this month
 */
export const checkVideoLimit = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limit = subInfo.tier.limits.maxVideosPerMonth;

      // -1 means unlimited
      if (limit === -1) {
        next();
        return;
      }

      const usage = await getCurrentMonthUsage(organizationId);

      if (usage.videosCount >= limit) {
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `You've reached your monthly video limit of ${limit} on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'videos',
            current: usage.videosCount,
            limit,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkVideoLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Check video length against plan limit
 * @param durationMinutes - Duration of the video in minutes (can be from request body or calculated)
 */
export const checkVideoLengthLimit = (getDurationMinutes?: (req: AuthenticatedRequest) => number) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limit = subInfo.tier.limits.maxVideoLengthMinutes;

      // -1 means unlimited
      if (limit === -1) {
        next();
        return;
      }

      // Get duration from function or request body
      let durationMinutes: number;
      if (getDurationMinutes) {
        durationMinutes = getDurationMinutes(req);
      } else {
        const body = req.body as Record<string, unknown> | undefined;
        durationMinutes = (body?.durationMinutes as number) || (body?.duration_minutes as number) || 0;
      }

      if (durationMinutes > limit) {
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `Video duration exceeds your plan limit of ${limit} minutes on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'videoLength',
            current: durationMinutes,
            limit,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkVideoLengthLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Check storage before upload
 * @param getFileSizeBytes - Function to get file size from request, or uses req.body.fileSize
 */
export const checkStorageLimit = (getFileSizeBytes?: (req: AuthenticatedRequest) => number) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limitGb = subInfo.tier.limits.maxStorageGb;

      // -1 means unlimited
      if (limitGb === -1) {
        next();
        return;
      }

      const usage = await getCurrentMonthUsage(organizationId);
      const currentStorageGb = usage.storageBytes / (1024 * 1024 * 1024);

      // Get file size from function or request
      let fileSizeBytes: number;
      if (getFileSizeBytes) {
        fileSizeBytes = getFileSizeBytes(req);
      } else {
        const body = req.body as Record<string, unknown> | undefined;
        fileSizeBytes = (body?.fileSize as number) || (body?.file_size_bytes as number) || 0;
      }

      const newTotalGb = currentStorageGb + (fileSizeBytes / (1024 * 1024 * 1024));

      if (newTotalGb > limitGb) {
        const currentGbRounded = Math.round(currentStorageGb * 100) / 100;
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `This upload would exceed your storage limit of ${limitGb}GB on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'storage',
            current: currentGbRounded,
            limit: limitGb,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkStorageLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Check external contributor limit
 */
export const checkExternalContributorLimit = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limit = subInfo.tier.limits.maxExternalContributors;

      // -1 means unlimited
      if (limit === -1) {
        next();
        return;
      }

      const usage = await getCurrentMonthUsage(organizationId);

      if (usage.externalContributorsCount >= limit) {
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `You've reached your external contributor limit of ${limit} on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'externalContributors',
            current: usage.externalContributorsCount,
            limit,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkExternalContributorLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Check workspace limit
 */
export const checkWorkspaceLimit = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const limit = subInfo.tier.limits.maxWorkspaces;

      // -1 means unlimited
      if (limit === -1) {
        next();
        return;
      }

      const usage = await getCurrentMonthUsage(organizationId);

      if (usage.workspacesCount >= limit) {
        createQuotaError(res, 402, {
          code: 'LIMIT_EXCEEDED',
          message: `You've reached your workspace limit of ${limit} on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: 'workspaces',
            current: usage.workspacesCount,
            limit,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier: getSuggestedUpgradeTier(subInfo.tierName),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in checkWorkspaceLimit middleware:', error);
      next(error);
    }
  };
};

/**
 * Generic feature access check
 * Checks if the organization's tier has access to a specific feature
 */
export const requireFeature = (featureName: keyof PricingTier['features']) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      // Use effective features which includes custom overrides
      const effectiveFeatures = await pricingService.getEffectiveFeatures(organizationId);
      const hasFeature = effectiveFeatures[featureName];

      if (!hasFeature) {
        // Find the first tier that has this feature
        const tierOrder = ['enterprise']; // Custom tiers can be added via admin
        const suggestedTier = tierOrder.find(t => PRICING_TIERS[t]?.features[featureName]);

        const featureDescriptions = pricingService.getFeatureDescriptions();
        const featureInfo = featureDescriptions[featureName];

        createQuotaError(res, 403, {
          code: 'FEATURE_NOT_AVAILABLE',
          message: `${featureInfo?.name || featureName} is not available on the ${subInfo.tier.displayName} plan`,
          details: {
            feature: featureName,
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
            suggestedTier,
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in requireFeature middleware:', error);
      next(error);
    }
  };
};

/**
 * Check if subscription is active (not expired/canceled)
 */
export const requireActiveSubscription = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      // Free tier is always active
      if (subInfo.tierName === 'free') {
        next();
        return;
      }

      if (!subInfo.isActive) {
        createQuotaError(res, 402, {
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'Your subscription has expired. Please renew to continue using premium features.',
          details: {
            feature: 'subscription',
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in requireActiveSubscription middleware:', error);
      next(error);
    }
  };
};

/**
 * Check if trial is still valid or has active subscription
 */
export const requireValidTrialOrSubscription = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      // Free tier doesn't need trial/subscription
      if (subInfo.tierName === 'free') {
        next();
        return;
      }

      // Check if trial has expired
      if (subInfo.isTrial && subInfo.trialEndsAt) {
        const now = new Date();
        if (now > new Date(subInfo.trialEndsAt)) {
          createQuotaError(res, 402, {
            code: 'SUBSCRIPTION_EXPIRED',
            message: 'Your trial has ended. Subscribe to continue using premium features.',
            details: {
              feature: 'subscription',
              tier: subInfo.tierName,
              upgradeUrl: getUpgradeUrl(),
            },
          });
          return;
        }
      }

      // Check active subscription
      if (!subInfo.isActive) {
        createQuotaError(res, 402, {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'An active subscription is required to access this feature.',
          details: {
            feature: 'subscription',
            tier: subInfo.tierName,
            upgradeUrl: getUpgradeUrl(),
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in requireValidTrialOrSubscription middleware:', error);
      next(error);
    }
  };
};

/**
 * Require write access (blocks POST/PUT/PATCH/DELETE when trial is expired)
 *
 * Use this middleware on creation/modification endpoints to enforce read-only mode
 * when a trial has expired. Users can still view content but cannot create new items.
 *
 * - Free tier: Always allowed (limited by quotas)
 * - Active paid subscription: Allowed
 * - Active trial: Allowed
 * - Expired trial: BLOCKED with 402 status
 */
export const requireTrialWriteAccess = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        res.status(401).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (!subInfo) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }

      // Enterprise tier always has write access (SUPER_ADMIN orgs, etc.)
      if (subInfo.tierName === 'enterprise') {
        next();
        return;
      }

      // Free tier always has write access (limited by quotas, not read-only mode)
      if (subInfo.tierName === 'free') {
        next();
        return;
      }

      // Active paid subscription (not a trial) has write access
      if (subInfo.isActive && !subInfo.isTrial) {
        next();
        return;
      }

      // Active trial (not expired) has write access
      if (subInfo.isTrial && subInfo.trialEndsAt) {
        const now = new Date();
        if (now < new Date(subInfo.trialEndsAt)) {
          next();
          return;
        }
      }

      // Trial has expired - read-only mode
      // Block all write operations
      createQuotaError(res, 402, {
        code: 'TRIAL_EXPIRED_READ_ONLY',
        message: 'Your trial has expired. Upgrade to create new content.',
        details: {
          feature: 'write_access',
          tier: subInfo.tierName,
          readOnlyMode: true,
          upgradeUrl: getUpgradeUrl(),
        },
      });
    } catch (error) {
      logger.error('Error in requireTrialWriteAccess middleware:', error);
      next(error);
    }
  };
};

/**
 * Attach subscription info to request for downstream use
 */
export const attachSubscriptionInfo = () => {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getOrganizationId(req);
      if (!organizationId) {
        next();
        return;
      }

      const subInfo = await getSubscriptionInfo(organizationId);
      if (subInfo) {
        // Attach to request for use in controllers
        (req as any).subscriptionInfo = subInfo;
      }

      next();
    } catch (error) {
      logger.error('Error in attachSubscriptionInfo middleware:', error);
      next(error);
    }
  };
};
