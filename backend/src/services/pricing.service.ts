import { Knex } from 'knex';
import { db } from '../config/database';
import { NotFoundError, ConflictError } from '../utils/AppError';
import { logger } from '../utils/logger';
import storageService from './storage.service';
import metricsService from './metrics.service';
import { featureGrantService } from './feature-grant.service';
import { tierAuditService } from './tier-audit.service';
import { stripeTierService } from './stripe';

/**
 * Pricing tiers define feature access and usage limits
 * Based on competitive analysis of Loom, Vidyard, Tella, Screencastify
 */
export interface PricingTier {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number; // ~20% discount on annual
  // Usage limits
  limits: {
    maxMembers: number;
    maxStorageGb: number;
    maxTasksPerMonth: number; // -1 = unlimited
    maxVideosPerMonth: number; // -1 = unlimited
    maxVideoLengthMinutes: number; // -1 = unlimited
    maxExternalContributors: number; // Magic link users, -1 = unlimited
    maxWorkspaces: number;
  };
  // Feature flags
  features: {
    // Recording & Playback
    removeWatermark: boolean;
    customThumbnails: boolean;
    downloadRecordings: boolean;
    hdRecording: boolean; // 1080p vs 720p

    // Transcription & AI
    basicTranscription: boolean;
    advancedTranscription: boolean; // Speaker detection, timestamps
    aiSummaries: boolean;
    basicAiAnalysis: boolean; // Basic AI analysis without custom rubrics
    fullAiRubricScoring: boolean; // Full AI rubric-based competency scoring
    evidenceTimestamps: boolean; // Timestamped evidence in analysis results
    taskTemplates: boolean; // Access to task templates

    // Collaboration
    timestampedComments: boolean;
    reviewWorkflows: boolean;
    teamWorkspaces: boolean;

    // Analytics
    basicAnalytics: boolean; // View counts
    advancedAnalytics: boolean; // Engagement, viewer tracking
    orgWideDashboards: boolean; // Organization-wide analytics dashboards
    advancedReporting: boolean; // Custom reports and data exports

    // Integrations
    slackIntegration: boolean;
    webhooks: boolean;
    apiAccess: boolean;

    // Branding & Customization
    customBranding: boolean;
    customDomain: boolean;

    // Security & Admin
    ssoSaml: boolean;
    scimProvisioning: boolean;
    auditLogs: boolean;
    advancedPermissions: boolean;
    ipWhitelist: boolean;
    customDataRetention: boolean;

    // Support
    emailSupport: boolean;
    prioritySupport: boolean;
    dedicatedCsm: boolean;
  };
  // For display on pricing page
  highlighted: boolean;
  ctaText: string;
}

/**
 * CogVeri Early-Stage Pricing (Jan 2026)
 *
 * Simple, predictable pricing with AI features included.
 * No per-video, per-minute, or per-seat complexity.
 *
 * Tiers:
 * - Free: $0 (evaluation, demos)
 * - Starter: $25/mo (small teams, basic AI)
 * - Pro: $65/mo (full AI rubric scoring) - HIGHLIGHTED
 * - Business: $125/mo (API, advanced reporting)
 * - Enterprise: Custom ($250+)
 */
export const PRICING_TIERS: Record<string, PricingTier> = {
  free: {
    id: 'free',
    name: 'free',
    displayName: 'Free',
    description: 'Perfect for trying out CogVeri',
    monthlyPrice: 0,
    yearlyPrice: 0,
    limits: {
      maxMembers: 2,
      maxStorageGb: 5,
      maxTasksPerMonth: -1, // unlimited
      maxVideosPerMonth: 5, // 5 recordings per month
      maxVideoLengthMinutes: 10,
      maxExternalContributors: -1, // unlimited magic links
      maxWorkspaces: 1,
    },
    features: {
      // Recording & Playback
      removeWatermark: false,
      customThumbnails: false,
      downloadRecordings: false,
      hdRecording: false,
      // Transcription & AI
      basicTranscription: true, // Transcription included in Free
      advancedTranscription: false,
      aiSummaries: false,
      basicAiAnalysis: false, // No AI analysis in Free
      fullAiRubricScoring: false,
      evidenceTimestamps: false,
      taskTemplates: false,
      // Collaboration
      timestampedComments: false,
      reviewWorkflows: false,
      teamWorkspaces: false,
      // Analytics
      basicAnalytics: true,
      advancedAnalytics: false,
      orgWideDashboards: false,
      advancedReporting: false,
      // Integrations
      slackIntegration: false,
      webhooks: false,
      apiAccess: false,
      // Branding
      customBranding: false,
      customDomain: false,
      // Security
      ssoSaml: false,
      scimProvisioning: false,
      auditLogs: false,
      advancedPermissions: false,
      ipWhitelist: false,
      customDataRetention: false,
      // Support
      emailSupport: false,
      prioritySupport: false,
      dedicatedCsm: false,
    },
    highlighted: false,
    ctaText: 'Get Started Free',
  },

  enterprise: {
    id: 'enterprise',
    name: 'enterprise',
    displayName: 'Enterprise',
    description: 'Custom solutions for large organizations',
    monthlyPrice: 250, // Starting price (custom pricing applies)
    yearlyPrice: 2400,
    limits: {
      maxMembers: -1, // unlimited
      maxStorageGb: -1,
      maxTasksPerMonth: -1,
      maxVideosPerMonth: -1,
      maxVideoLengthMinutes: -1,
      maxExternalContributors: -1,
      maxWorkspaces: -1,
    },
    features: {
      // Recording & Playback
      removeWatermark: true,
      customThumbnails: true,
      downloadRecordings: true,
      hdRecording: true,
      // Transcription & AI
      basicTranscription: true,
      advancedTranscription: true,
      aiSummaries: true,
      basicAiAnalysis: true,
      fullAiRubricScoring: true,
      evidenceTimestamps: true,
      taskTemplates: true,
      // Collaboration
      timestampedComments: true,
      reviewWorkflows: true,
      teamWorkspaces: true,
      // Analytics
      basicAnalytics: true,
      advancedAnalytics: true,
      orgWideDashboards: true,
      advancedReporting: true,
      // Integrations
      slackIntegration: true,
      webhooks: true,
      apiAccess: true,
      // Branding
      customBranding: true,
      customDomain: true, // Custom domain
      // Security
      ssoSaml: true,
      scimProvisioning: true, // SCIM provisioning
      auditLogs: true,
      advancedPermissions: true,
      ipWhitelist: true, // IP whitelist
      customDataRetention: true,
      // Support
      emailSupport: true,
      prioritySupport: true,
      dedicatedCsm: true, // Dedicated CSM
    },
    highlighted: false,
    ctaText: 'Contact Sales',
  },
};

// Database tier record type
interface PricingTierRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  limits: PricingTier['limits'] | string;
  features: PricingTier['features'] | string;
  highlighted: boolean;
  cta_text: string;
  sort_order: number;
  is_active: boolean;
  archived: boolean;
  archived_at: Date | null;
  archived_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class PricingService {
  // Cache for DB tiers (invalidated on admin updates)
  private dbTiersCache: PricingTier[] | null = null;
  private dbTiersCacheTime: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  /**
   * Convert database row to PricingTier object
   */
  private mapDbRowToTier(row: PricingTierRow): PricingTier {
    const limits = typeof row.limits === 'string' ? JSON.parse(row.limits) : row.limits;
    const features = typeof row.features === 'string' ? JSON.parse(row.features) : row.features;

    return {
      id: row.name,
      name: row.name,
      displayName: row.display_name,
      description: row.description || '',
      monthlyPrice: row.monthly_price / 100, // Convert cents to dollars
      yearlyPrice: row.yearly_price / 100,
      limits,
      features,
      highlighted: row.highlighted,
      ctaText: row.cta_text,
    };
  }

  /**
   * Invalidate the tiers cache (call after admin updates)
   */
  invalidateTiersCache(): void {
    this.dbTiersCache = null;
    this.dbTiersCacheTime = 0;
    logger.debug('Pricing tiers cache invalidated');
  }

  /**
   * Get all pricing tiers from database with fallback to code constants
   */
  async getPricingTiersFromDb(): Promise<PricingTier[]> {
    // Check cache first
    if (this.dbTiersCache && Date.now() - this.dbTiersCacheTime < this.CACHE_TTL_MS) {
      return this.dbTiersCache;
    }

    try {
      const rows = await db('pricing_tiers')
        .where('is_active', true)
        .orderBy('sort_order', 'asc') as PricingTierRow[];

      if (rows.length > 0) {
        this.dbTiersCache = rows.map(row => this.mapDbRowToTier(row));
        this.dbTiersCacheTime = Date.now();
        return this.dbTiersCache;
      }
    } catch (error) {
      logger.warn('Failed to fetch pricing tiers from database, using code constants:', error);
    }

    // Fallback to code constants
    return Object.values(PRICING_TIERS);
  }

  /**
   * Get specific pricing tier by name from database with fallback
   */
  async getPricingTierFromDb(tierName: string): Promise<PricingTier | null> {
    try {
      const row = await db('pricing_tiers')
        .where('name', tierName.toLowerCase())
        .first() as PricingTierRow | undefined;

      if (row) {
        return this.mapDbRowToTier(row);
      }
    } catch (error) {
      logger.warn(`Failed to fetch tier ${tierName} from database:`, error);
    }
    return null;
  }

  /**
   * Get specific pricing tier with admin fields (includes stripe IDs)
   */
  async getPricingTierFromDbAdmin(tierName: string): Promise<(PricingTier & {
    isActive: boolean;
    sortOrder: number;
    stripeProductId: string | null;
    stripePriceIdMonthly: string | null;
    stripePriceIdYearly: string | null;
    dbId: string;
    archived: boolean;
    archivedAt: string | null;
  }) | null> {
    try {
      const row = await db('pricing_tiers')
        .where('name', tierName.toLowerCase())
        .first() as PricingTierRow | undefined;

      if (row) {
        return {
          ...this.mapDbRowToTier(row),
          isActive: row.is_active,
          sortOrder: row.sort_order,
          stripeProductId: row.stripe_product_id,
          stripePriceIdMonthly: row.stripe_price_id_monthly,
          stripePriceIdYearly: row.stripe_price_id_yearly,
          dbId: row.id,
          archived: row.archived ?? false,
          archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
        };
      }
    } catch (error) {
      logger.warn(`Failed to fetch tier ${tierName} from database:`, error);
    }
    return null;
  }

  /**
   * Get all pricing tiers (active only, for public display)
   */
  async getPricingTiers(): Promise<PricingTier[]> {
    return this.getPricingTiersFromDb();
  }

  /**
   * Get specific pricing tier
   * Defaults to 'free' if tierName is null/undefined
   * Uses DB with fallback to code constants
   */
  async getPricingTier(tierName: string | null | undefined): Promise<PricingTier> {
    const normalizedName = (tierName || 'free').toLowerCase();

    // Try database first
    const dbTier = await this.getPricingTierFromDb(normalizedName);
    if (dbTier) {
      return dbTier;
    }

    // Fallback to code constants
    const tier = PRICING_TIERS[normalizedName];
    if (!tier) {
      // Fall back to free tier if unknown tier name
      return PRICING_TIERS['free']!;
    }
    return tier;
  }

  // ============================================
  // Admin Methods for Pricing Tier Management
  // ============================================

  /**
   * Get all pricing tiers for admin (includes inactive)
   */
  async getAllPricingTiersAdmin(): Promise<(PricingTier & {
    isActive: boolean;
    sortOrder: number;
    stripeProductId: string | null;
    stripePriceIdMonthly: string | null;
    stripePriceIdYearly: string | null;
    dbId: string;
    archived: boolean;
    archivedAt: string | null;
  })[]> {
    try {
      const rows = await db('pricing_tiers')
        .orderBy('sort_order', 'asc') as PricingTierRow[];

      return rows.map(row => ({
        ...this.mapDbRowToTier(row),
        isActive: row.is_active,
        sortOrder: row.sort_order,
        stripeProductId: row.stripe_product_id,
        stripePriceIdMonthly: row.stripe_price_id_monthly,
        stripePriceIdYearly: row.stripe_price_id_yearly,
        dbId: row.id,
        archived: row.archived ?? false,
        archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
      }));
    } catch (error) {
      logger.error('Failed to fetch admin pricing tiers:', error);
      throw error;
    }
  }

  /**
   * Create a new pricing tier
   */
  async createPricingTier(tier: {
    name: string;
    displayName: string;
    description?: string;
    monthlyPrice: number;
    yearlyPrice: number;
    stripePriceIdMonthly?: string;
    stripePriceIdYearly?: string;
    limits: PricingTier['limits'];
    features: Record<string, boolean>;
    highlighted?: boolean;
    ctaText?: string;
    sortOrder?: number;
  }): Promise<PricingTier> {
    try {
      const [row] = await db('pricing_tiers')
        .insert({
          name: tier.name.toLowerCase(),
          display_name: tier.displayName,
          description: tier.description || '',
          monthly_price: Math.round(tier.monthlyPrice * 100),
          yearly_price: Math.round(tier.yearlyPrice * 100),
          stripe_price_id_monthly: tier.stripePriceIdMonthly || null,
          stripe_price_id_yearly: tier.stripePriceIdYearly || null,
          limits: JSON.stringify(tier.limits),
          features: JSON.stringify(tier.features),
          highlighted: tier.highlighted || false,
          cta_text: tier.ctaText || 'Get Started',
          sort_order: tier.sortOrder ?? 99,
          is_active: true,
        })
        .returning('*');

      this.invalidateTiersCache();
      logger.info(`Created pricing tier: ${tier.name}`);
      return this.mapDbRowToTier(row);
    } catch (error) {
      logger.error('Failed to create pricing tier:', error);
      throw error;
    }
  }

  /**
   * Update an existing pricing tier
   */
  async updatePricingTier(tierName: string, updates: {
    displayName?: string;
    description?: string;
    monthlyPrice?: number;
    yearlyPrice?: number;
    stripePriceIdMonthly?: string | null;
    stripePriceIdYearly?: string | null;
    limits?: Partial<PricingTier['limits']>;
    features?: Partial<PricingTier['features']>;
    highlighted?: boolean;
    ctaText?: string;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<PricingTier> {
    try {
      // Get current tier to merge limits/features
      const current = await db('pricing_tiers')
        .where('name', tierName.toLowerCase())
        .first() as PricingTierRow | undefined;

      if (!current) {
        throw new NotFoundError(`Pricing tier '${tierName}' not found`);
      }

      const currentLimits = typeof current.limits === 'string'
        ? JSON.parse(current.limits)
        : current.limits;
      const currentFeatures = typeof current.features === 'string'
        ? JSON.parse(current.features)
        : current.features;

      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };

      if (updates.displayName !== undefined) updateData.display_name = updates.displayName;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.monthlyPrice !== undefined) updateData.monthly_price = Math.round(updates.monthlyPrice * 100);
      if (updates.yearlyPrice !== undefined) updateData.yearly_price = Math.round(updates.yearlyPrice * 100);
      if (updates.stripePriceIdMonthly !== undefined) updateData.stripe_price_id_monthly = updates.stripePriceIdMonthly;
      if (updates.stripePriceIdYearly !== undefined) updateData.stripe_price_id_yearly = updates.stripePriceIdYearly;
      if (updates.limits !== undefined) updateData.limits = JSON.stringify({ ...currentLimits, ...updates.limits });
      if (updates.features !== undefined) updateData.features = JSON.stringify({ ...currentFeatures, ...updates.features });
      if (updates.highlighted !== undefined) updateData.highlighted = updates.highlighted;
      if (updates.ctaText !== undefined) updateData.cta_text = updates.ctaText;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      const [row] = await db('pricing_tiers')
        .where('name', tierName.toLowerCase())
        .update(updateData)
        .returning('*');

      this.invalidateTiersCache();
      logger.info(`Updated pricing tier: ${tierName}`);
      return this.mapDbRowToTier(row);
    } catch (error) {
      logger.error('Failed to update pricing tier:', error);
      throw error;
    }
  }

  /**
   * Activate a pricing tier
   */
  async activatePricingTier(tierName: string): Promise<void> {
    await this.updatePricingTier(tierName, { isActive: true });
    logger.info(`Activated pricing tier: ${tierName}`);
  }

  /**
   * Deactivate a pricing tier (check for organizations using it first)
   */
  async deactivatePricingTier(tierName: string): Promise<{ success: boolean; organizationsUsingTier?: number }> {
    // Check if any organizations are on this tier
    const orgCount = await db('organizations')
      .where('subscription_tier', tierName.toLowerCase())
      .count('id as count')
      .first();

    const count = parseInt(String(orgCount?.count || 0));
    if (count > 0) {
      return { success: false, organizationsUsingTier: count };
    }

    await this.updatePricingTier(tierName, { isActive: false });
    logger.info(`Deactivated pricing tier: ${tierName}`);
    return { success: true };
  }

  /**
   * Reorder pricing tiers
   */
  async reorderPricingTiers(tierOrder: string[]): Promise<void> {
    try {
      await db.transaction(async trx => {
        for (let i = 0; i < tierOrder.length; i++) {
          const tierName = tierOrder[i];
          if (tierName) {
            await trx('pricing_tiers')
              .where('name', tierName.toLowerCase())
              .update({ sort_order: i, updated_at: new Date() });
          }
        }
      });

      this.invalidateTiersCache();
      logger.info('Reordered pricing tiers');
    } catch (error) {
      logger.error('Failed to reorder pricing tiers:', error);
      throw error;
    }
  }

  /**
   * Check if a tier name is available
   */
  async isTierNameAvailable(name: string): Promise<boolean> {
    const existing = await db('pricing_tiers')
      .where('name', name.toLowerCase())
      .first();
    return !existing;
  }

  /**
   * Update organization subscription tier
   */
  async updateOrganizationTier(
    organizationId: string,
    newTierName: string,
    trx?: Knex.Transaction
  ): Promise<{
    organization: any;
    previousTier: string;
    newTier: string;
  }> {
    // ★ Transaction Support: Use provided transaction or create new one
    // This ensures atomic updates to organization + audit log
    const executeUpdate = async (queryBuilder: Knex | Knex.Transaction) => {
      const tier = await this.getPricingTier(newTierName);

      // Get current organization
      const organization = await queryBuilder('organizations')
        .where('id', organizationId)
        .first();

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const previousTier = organization.subscription_tier;

      // Update organization with new tier limits (-1 means unlimited)
      const [updated] = await queryBuilder('organizations')
        .where('id', organizationId)
        .update({
          subscription_tier: tier.name,
          max_members: tier.limits.maxMembers === -1 ? 999999 : tier.limits.maxMembers,
          max_recordings_gb: tier.limits.maxStorageGb === -1 ? 999999 : tier.limits.maxStorageGb,
          max_tasks_per_month: tier.limits.maxTasksPerMonth === -1 ? 999999 : tier.limits.maxTasksPerMonth,
          updated_at: new Date(),
        })
        .returning('*');

      // Update storage limit in storage metrics (outside transaction - non-critical)
      if (tier.limits.maxStorageGb > 0) {
        try {
          await storageService.updateMaxStorage(
            organizationId,
            tier.limits.maxStorageGb
          );
          logger.info(`Storage limit updated to ${tier.limits.maxStorageGb}GB for organization ${organizationId}`);
        } catch (storageError) {
          logger.error('Failed to update storage limit:', storageError);
          // Continue despite storage update error - tier upgrade is still successful
        }
      }

      // Create audit log (within transaction for consistency)
      await queryBuilder('audit_logs').insert({
        organization_id: organizationId,
        actor_id: null, // System action
        action: 'subscription_tier_changed',
        object_type: 'organization',
        object_id: organizationId,
        changes: {
          previousTier,
          newTier: tier.name,
          limits: tier.limits,
        },
        created_at: new Date(),
      });

      // Invalidate rate limit config cache since tier has changed
      metricsService.invalidateRateLimitCache(organizationId);

      logger.info(`Organization ${organizationId} upgraded from ${previousTier} to ${tier.name}`);

      return {
        organization: updated,
        previousTier,
        newTier: tier.name,
      };
    };

    try {
      // If transaction provided, use it; otherwise create our own
      if (trx) {
        return await executeUpdate(trx);
      } else {
        return await db.transaction(async (newTrx) => {
          return await executeUpdate(newTrx);
        });
      }
    } catch (error) {
      logger.error('Error updating organization tier:', error);
      throw error;
    }
  }

  /**
   * Check if organization has reached feature limit
   */
  async checkFeatureLimit(
    organizationId: string,
    featureName: 'members' | 'storage' | 'tasks' | 'videos' | 'externalContributors'
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    percentageUsed: number;
    isUnlimited: boolean;
  }> {
    try {
      // Use cached organization lookup
      const organization = await metricsService.getOrganizationWithCache(organizationId);

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const tier = await this.getPricingTier(organization.subscription_tier);

      // Get all feature usage counts in a single query
      const usage = (await db('organizations')
        .where('id', organizationId)
        .select(
          db.raw(`(
            select count(*) from users
            where organization_id = organizations.id
          ) as member_count`),
          db.raw(`(
            select coalesce(sum(file_size_bytes)::bigint / 1073741824, 0) from recordings
            where organization_id = organizations.id and status != 'deleted'
          ) as storage_gb`),
          db.raw(`(
            select count(*) from tasks
            where organization_id = organizations.id
            and created_at >= date_trunc('month', now())
          ) as tasks_this_month`),
          db.raw(`(
            select count(*) from recordings
            where organization_id = organizations.id
            and created_at >= date_trunc('month', now())
          ) as videos_this_month`),
          db.raw(`(
            select count(*) from external_contributors
            where organization_id = organizations.id
          ) as external_contributors`)
        )
        .first());

      let current = 0;
      let limit = 0;

      switch (featureName) {
        case 'members':
          current = parseInt(usage.member_count) || 0;
          limit = tier.limits.maxMembers;
          break;

        case 'storage':
          current = parseFloat(usage.storage_gb) || 0;
          limit = tier.limits.maxStorageGb;
          break;

        case 'tasks':
          current = parseInt(usage.tasks_this_month) || 0;
          limit = tier.limits.maxTasksPerMonth;
          break;

        case 'videos':
          current = parseInt(usage.videos_this_month) || 0;
          limit = tier.limits.maxVideosPerMonth;
          break;

        case 'externalContributors':
          current = parseInt(usage.external_contributors) || 0;
          limit = tier.limits.maxExternalContributors;
          break;
      }

      // -1 means unlimited
      const isUnlimited = limit === -1;
      const percentageUsed = isUnlimited ? 0 : (limit > 0 ? (current / limit) * 100 : 0);
      const allowed = isUnlimited || current < limit;

      return {
        allowed,
        current: Math.round(current * 100) / 100,
        limit: isUnlimited ? -1 : limit,
        percentageUsed: Math.round(percentageUsed * 100) / 100,
        isUnlimited,
      };
    } catch (error) {
      logger.error(`Error checking feature limit for ${featureName}:`, error);
      throw error;
    }
  }

  /**
   * Get organization usage stats
   */
  async getOrganizationUsage(organizationId: string): Promise<{
    organization: any;
    tier: PricingTier;
    usage: {
      members: { current: number; limit: number; percentageUsed: number; isUnlimited: boolean };
      storage: { current: number; limit: number; percentageUsed: number; isUnlimited: boolean };
      tasks: { current: number; limit: number; percentageUsed: number; isUnlimited: boolean };
      videos: { current: number; limit: number; percentageUsed: number; isUnlimited: boolean };
      externalContributors: { current: number; limit: number; percentageUsed: number; isUnlimited: boolean };
    };
    warnings: string[];
  }> {
    try {
      const organization = await metricsService.getOrganizationWithCache(organizationId);

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const tier = await this.getPricingTier(organization.subscription_tier);

      // Get all usage stats - use individual queries for resilience
      const allUsage = {
        member_count: 0,
        storage_gb: 0,
        tasks_this_month: 0,
        videos_this_month: 0,
        external_contributors: 0,
      };

      try {
        // Member count
        const memberResult = await db('users')
          .where('organization_id', organizationId)
          .count('* as count')
          .first();
        allUsage.member_count = parseInt(String(memberResult?.count || 0));

        // Storage (in GB)
        const storageResult = await db('recordings')
          .where('organization_id', organizationId)
          .whereNot('status', 'deleted')
          .sum('file_size_bytes as total')
          .first();
        allUsage.storage_gb = Math.round((parseInt(String(storageResult?.total || 0)) / 1073741824) * 100) / 100;

        // Tasks this month
        const tasksResult = await db('tasks')
          .where('organization_id', organizationId)
          .whereRaw("created_at >= date_trunc('month', now())")
          .count('* as count')
          .first();
        allUsage.tasks_this_month = parseInt(String(tasksResult?.count || 0));

        // Videos this month
        const videosResult = await db('recordings')
          .where('organization_id', organizationId)
          .whereRaw("created_at >= date_trunc('month', now())")
          .count('* as count')
          .first();
        allUsage.videos_this_month = parseInt(String(videosResult?.count || 0));

        // External contributors - wrapped in try-catch for schema resilience
        try {
          const extContribResult = await db('external_contributors')
            .where('organization_id', organizationId)
            .count('* as count')
            .first();
          allUsage.external_contributors = parseInt(String(extContribResult?.count || 0));
        } catch {
          // Table might not have organization_id column - default to 0
          allUsage.external_contributors = 0;
        }
      } catch (queryError) {
        logger.warn('Error fetching usage stats, using defaults:', queryError);
      }

      const calculateUsage = (current: number, limit: number) => {
        const isUnlimited = limit === -1;
        return {
          current,
          limit: isUnlimited ? -1 : limit,
          percentageUsed: isUnlimited ? 0 : Math.round((current / limit) * 10000) / 100,
          isUnlimited,
        };
      };

      const members = calculateUsage(allUsage.member_count, tier.limits.maxMembers);
      const storage = calculateUsage(allUsage.storage_gb, tier.limits.maxStorageGb);
      const tasks = calculateUsage(allUsage.tasks_this_month, tier.limits.maxTasksPerMonth);
      const videos = calculateUsage(allUsage.videos_this_month, tier.limits.maxVideosPerMonth);
      const externalContributors = calculateUsage(allUsage.external_contributors, tier.limits.maxExternalContributors);

      // Generate warnings (only for non-unlimited limits)
      const warnings: string[] = [];
      if (!members.isUnlimited && members.percentageUsed >= 80) {
        warnings.push(`Member limit at ${members.percentageUsed}%`);
      }
      if (!storage.isUnlimited && storage.percentageUsed >= 80) {
        warnings.push(`Storage limit at ${storage.percentageUsed}%`);
      }
      if (!tasks.isUnlimited && tasks.percentageUsed >= 80) {
        warnings.push(`Monthly task limit at ${tasks.percentageUsed}%`);
      }
      if (!videos.isUnlimited && videos.percentageUsed >= 80) {
        warnings.push(`Monthly video limit at ${videos.percentageUsed}%`);
      }
      if (!externalContributors.isUnlimited && externalContributors.percentageUsed >= 80) {
        warnings.push(`External contributor limit at ${externalContributors.percentageUsed}%`);
      }

      return {
        organization,
        tier,
        usage: {
          members,
          storage,
          tasks,
          videos,
          externalContributors,
        },
        warnings,
      };
    } catch (error) {
      logger.error('Error getting organization usage:', error);
      throw error;
    }
  }

  /**
   * Check if organization has access to feature
   */
  hasFeatureAccess(tierName: string, featureName: keyof PricingTier['features']): boolean {
    const tier = PRICING_TIERS[tierName.toLowerCase()];
    if (!tier) {
      return false;
    }
    return tier.features[featureName] || false;
  }

  /**
   * Get all feature descriptions for UI display
   */
  getFeatureDescriptions(): Record<keyof PricingTier['features'], { name: string; description: string; category: string }> {
    return {
      // Recording & Playback
      removeWatermark: { name: 'Remove Watermark', description: 'Remove CogVeri branding from videos', category: 'Recording' },
      customThumbnails: { name: 'Custom Thumbnails', description: 'Upload custom video thumbnails', category: 'Recording' },
      downloadRecordings: { name: 'Download Videos', description: 'Download recordings to your device', category: 'Recording' },
      hdRecording: { name: 'HD Recording', description: 'Record in 1080p quality', category: 'Recording' },

      // Transcription & AI
      basicTranscription: { name: 'Transcription', description: 'Auto-generated video transcripts', category: 'AI' },
      advancedTranscription: { name: 'Advanced Transcription', description: 'Speaker detection and timestamps', category: 'AI' },
      aiSummaries: { name: 'AI Summaries', description: 'AI-generated video summaries', category: 'AI' },
      basicAiAnalysis: { name: 'Basic AI Analysis', description: 'AI-powered basic video analysis', category: 'AI' },
      fullAiRubricScoring: { name: 'AI Rubric Scoring', description: 'Full AI rubric-based competency scoring', category: 'AI' },
      evidenceTimestamps: { name: 'Evidence Timestamps', description: 'Timestamped evidence in analysis results', category: 'AI' },
      taskTemplates: { name: 'Task Templates', description: 'Pre-built and custom task templates', category: 'Collaboration' },

      // Collaboration
      timestampedComments: { name: 'Timestamped Comments', description: 'Comment at specific video moments', category: 'Collaboration' },
      reviewWorkflows: { name: 'Review Workflows', description: 'Approval and feedback workflows', category: 'Collaboration' },
      teamWorkspaces: { name: 'Team Workspaces', description: 'Organize work into team spaces', category: 'Collaboration' },

      // Analytics
      basicAnalytics: { name: 'View Counts', description: 'Track video views', category: 'Analytics' },
      advancedAnalytics: { name: 'Advanced Analytics', description: 'Engagement tracking and reports', category: 'Analytics' },
      orgWideDashboards: { name: 'Org-wide Dashboards', description: 'Organization-wide analytics dashboards', category: 'Analytics' },
      advancedReporting: { name: 'Advanced Reporting', description: 'Custom reports and data exports', category: 'Analytics' },

      // Integrations
      slackIntegration: { name: 'Slack Integration', description: 'Connect with Slack', category: 'Integrations' },
      webhooks: { name: 'Webhooks', description: 'Custom event notifications', category: 'Integrations' },
      apiAccess: { name: 'API Access', description: 'REST API for custom integrations', category: 'Integrations' },

      // Branding & Customization
      customBranding: { name: 'Custom Branding', description: 'Add your logo and colors', category: 'Branding' },
      customDomain: { name: 'Custom Domain', description: 'Use your own domain', category: 'Branding' },

      // Security & Admin
      ssoSaml: { name: 'SSO/SAML', description: 'Single sign-on authentication', category: 'Security' },
      scimProvisioning: { name: 'SCIM Provisioning', description: 'Automated user management', category: 'Security' },
      auditLogs: { name: 'Audit Logs', description: 'Track all user actions', category: 'Security' },
      advancedPermissions: { name: 'Advanced Permissions', description: 'Custom roles and access controls', category: 'Security' },
      ipWhitelist: { name: 'IP Whitelist', description: 'Restrict access by IP', category: 'Security' },
      customDataRetention: { name: 'Data Retention', description: 'Custom data retention policies', category: 'Security' },

      // Support
      emailSupport: { name: 'Email Support', description: 'Email-based support', category: 'Support' },
      prioritySupport: { name: 'Priority Support', description: 'Fast-track support responses', category: 'Support' },
      dedicatedCsm: { name: 'Dedicated CSM', description: 'Personal customer success manager', category: 'Support' },
    };
  }

  /**
   * Get limit descriptions for UI display
   */
  getLimitDescriptions(): Record<keyof PricingTier['limits'], { name: string; unit: string }> {
    return {
      maxMembers: { name: 'Team Members', unit: 'users' },
      maxStorageGb: { name: 'Storage', unit: 'GB' },
      maxTasksPerMonth: { name: 'Tasks per Month', unit: 'tasks' },
      maxVideosPerMonth: { name: 'Videos per Month', unit: 'videos' },
      maxVideoLengthMinutes: { name: 'Video Length', unit: 'minutes' },
      maxExternalContributors: { name: 'External Contributors', unit: 'people' },
      maxWorkspaces: { name: 'Workspaces', unit: 'workspaces' },
    };
  }

  /**
   * Compare two tiers for upgrade/downgrade display
   */
  compareTiers(currentTierName: string, targetTierName: string): {
    isUpgrade: boolean;
    priceDifference: number;
    newFeatures: string[];
    removedFeatures: string[];
    limitChanges: Array<{ name: string; from: number | string; to: number | string }>;
  } {
    const current = PRICING_TIERS[currentTierName.toLowerCase()];
    const target = PRICING_TIERS[targetTierName.toLowerCase()];

    if (!current || !target) {
      throw new NotFoundError('Invalid tier name');
    }

    const isUpgrade = target.monthlyPrice > current.monthlyPrice;
    const priceDifference = target.monthlyPrice - current.monthlyPrice;

    const featureDescriptions = this.getFeatureDescriptions();
    const newFeatures: string[] = [];
    const removedFeatures: string[] = [];

    // Compare features
    for (const [key, value] of Object.entries(target.features)) {
      const featureKey = key as keyof PricingTier['features'];
      if (value && !current.features[featureKey]) {
        newFeatures.push(featureDescriptions[featureKey].name);
      } else if (!value && current.features[featureKey]) {
        removedFeatures.push(featureDescriptions[featureKey].name);
      }
    }

    // Compare limits
    const limitDescriptions = this.getLimitDescriptions();
    const limitChanges: Array<{ name: string; from: number | string; to: number | string }> = [];

    for (const [key, currentValue] of Object.entries(current.limits)) {
      const limitKey = key as keyof PricingTier['limits'];
      const targetValue = target.limits[limitKey];
      if (currentValue !== targetValue) {
        limitChanges.push({
          name: limitDescriptions[limitKey].name,
          from: currentValue === -1 ? 'Unlimited' : currentValue,
          to: targetValue === -1 ? 'Unlimited' : targetValue,
        });
      }
    }

    return {
      isUpgrade,
      priceDifference,
      newFeatures,
      removedFeatures,
      limitChanges,
    };
  }

  /**
   * Get effective limits for an organization, considering custom overrides
   * Enterprise customers may have custom limits set by system admins
   */
  async getEffectiveLimits(organizationId: string): Promise<PricingTier['limits']> {
    try {
      const organization = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'custom_limits')
        .first();

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const tier = await this.getPricingTier(organization.subscription_tier);
      const baseLimits = { ...tier.limits };

      // Apply custom overrides if present
      if (organization.custom_limits) {
        const customLimits = typeof organization.custom_limits === 'string'
          ? JSON.parse(organization.custom_limits)
          : organization.custom_limits;

        return {
          ...baseLimits,
          ...customLimits,
        };
      }

      return baseLimits;
    } catch (error) {
      logger.error('Error getting effective limits:', error);
      throw error;
    }
  }

  /**
   * Get effective features for an organization, considering custom overrides
   * Enterprise customers may have custom features enabled by system admins
   */
  async getEffectiveFeatures(organizationId: string): Promise<PricingTier['features']> {
    try {
      const organization = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'custom_features')
        .first();

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const tier = await this.getPricingTier(organization.subscription_tier);
      const baseFeatures = { ...tier.features };

      // Apply custom overrides if present
      if (organization.custom_features) {
        const customFeatures = typeof organization.custom_features === 'string'
          ? JSON.parse(organization.custom_features)
          : organization.custom_features;

        Object.assign(baseFeatures, customFeatures);
      }

      // Apply active feature grants (highest priority - grants override everything)
      try {
        const grantedFeatures = await featureGrantService.getActiveGrantedFeatures(organizationId);
        for (const featureName of grantedFeatures) {
          if (featureName in baseFeatures) {
            (baseFeatures as Record<string, boolean>)[featureName] = true;
          }
        }
      } catch (grantError) {
        // Don't fail feature check if grant service has issues
        logger.warn('Error checking feature grants, continuing without grants:', grantError);
      }

      return baseFeatures;
    } catch (error) {
      logger.error('Error getting effective features:', error);
      throw error;
    }
  }

  /**
   * Check if an organization has a specific feature enabled
   * Considers both tier features and custom overrides
   * Use this for organization-specific checks (async, checks custom overrides)
   * Use hasFeatureAccess() for simple tier-based checks (sync, tier only)
   */
  async hasOrganizationFeatureAccess(
    organizationId: string,
    featureName: keyof PricingTier['features']
  ): Promise<boolean> {
    try {
      const features = await this.getEffectiveFeatures(organizationId);
      return features[featureName] === true;
    } catch (error) {
      logger.error(`Error checking feature access for ${featureName}:`, error);
      return false;
    }
  }

  /**
   * Get a specific limit value for an organization
   * Considers both tier limits and custom overrides
   */
  async getLimit(
    organizationId: string,
    limitName: keyof PricingTier['limits']
  ): Promise<number> {
    try {
      const limits = await this.getEffectiveLimits(organizationId);
      return limits[limitName];
    } catch (error) {
      logger.error(`Error getting limit for ${limitName}:`, error);
      // Return restrictive default on error
      return 0;
    }
  }

  /**
   * Check if organization has enterprise overrides
   */

  /**
   * Check if a tier supports multiple members (i.e., is a team/org plan vs individual)
   * Free tier has maxMembers: 1, making it an individual plan.
   * All other tiers support multiple members.
   */
  isMultiMemberTier(tierName: string): boolean {
    const tier = PRICING_TIERS[tierName];
    if (!tier) return false;
    // maxMembers > 1 or unlimited (-1) means it's a multi-member plan
    return tier.limits.maxMembers > 1 || tier.limits.maxMembers === -1;
  }

  /**
   * Check if an organization supports multiple members based on its tier
   */
  async isMultiMemberOrganization(organizationId: string): Promise<boolean> {
    try {
      const organization = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'max_members')
        .first();

      if (!organization) return false;

      // Check stored max_members first (accounts for custom limits)
      if (organization.max_members !== null && organization.max_members !== undefined) {
        return organization.max_members > 1 || organization.max_members === -1;
      }

      // Fall back to tier default
      return this.isMultiMemberTier(organization.subscription_tier || 'free');
    } catch (error) {
      logger.error('Error checking multi-member organization:', error);
      return false;
    }
  }

  async hasCustomOverrides(organizationId: string): Promise<boolean> {
    try {
      const organization = await db('organizations')
        .where('id', organizationId)
        .select('custom_limits', 'custom_features')
        .first();

      return !!(organization?.custom_limits || organization?.custom_features);
    } catch (error) {
      return false;
    }
  }

  // ============================================================
  // TIER ARCHIVE MANAGEMENT
  // ============================================================

  /**
   * Get information about archiving a tier
   * Returns the count and list of organizations that would be affected
   */
  async getTierArchiveInfo(tierName: string): Promise<{
    canArchive: boolean;
    organizationCount: number;
    organizations: Array<{ id: string; name: string }>;
  }> {
    try {
      const tier = await db('pricing_tiers')
        .where('name', tierName)
        .first();

      if (!tier) {
        throw new NotFoundError(`Tier "${tierName}" not found`);
      }

      // Get organizations on this tier
      const organizations = await db('organizations')
        .where('subscription_tier', tierName)
        .select('id', 'name')
        .limit(100); // Limit to first 100 for display

      const [countResult] = await db('organizations')
        .where('subscription_tier', tierName)
        .count('* as count');

      const organizationCount = Number(countResult?.count ?? 0);

      return {
        canArchive: true, // Always allow archiving, but show warning
        organizationCount,
        organizations,
      };
    } catch (error) {
      logger.error(`Error getting tier archive info for ${tierName}:`, error);
      throw error;
    }
  }

  /**
   * Archive a pricing tier (soft delete)
   * Organizations on this tier keep it, but new subscriptions are blocked
   */
  async archivePricingTier(
    tierName: string,
    userId: string
  ): Promise<{
    success: boolean;
    organizationsAffected: number;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    try {
      const tier = await db('pricing_tiers')
        .where('name', tierName)
        .first();

      if (!tier) {
        throw new NotFoundError(`Tier "${tierName}" not found`);
      }

      if (tier.archived) {
        throw new ConflictError(`Tier "${tierName}" is already archived`);
      }

      // Prevent archiving free tier
      if (tierName === 'free') {
        throw new ConflictError('Cannot archive the free tier');
      }

      // Get affected organizations
      const [countResult] = await db('organizations')
        .where('subscription_tier', tierName)
        .count('* as count');
      const organizationsAffected = Number(countResult?.count ?? 0);

      if (organizationsAffected > 0) {
        warnings.push(
          `${organizationsAffected} organization(s) are currently on this tier. ` +
          'They will keep their current tier until they manually change it.'
        );
      }

      // Archive the tier
      await db('pricing_tiers')
        .where('name', tierName)
        .update({
          archived: true,
          archived_at: new Date(),
          archived_by: userId,
          is_active: false, // Also mark as inactive
          updated_at: new Date(),
        });

      // Archive Stripe product if exists
      if (tier.stripe_product_id) {
        try {
          await stripeTierService.archiveProduct(tier.stripe_product_id);
        } catch (stripeError) {
          logger.warn(`Failed to archive Stripe product for tier ${tierName}:`, stripeError);
          warnings.push('Failed to archive Stripe product. You may need to archive it manually.');
        }
      }

      // Log audit
      await tierAuditService.logTierAction({
        tierName,
        action: 'archived',
        actorId: userId,
        changes: {
          archived: { from: false, to: true },
          is_active: { from: tier.is_active, to: false },
        },
        stripeDetails: tier.stripe_product_id ? {
          productId: tier.stripe_product_id,
        } : undefined,
      });

      // Invalidate cache
      this.invalidateTiersCache();

      logger.info(`Tier "${tierName}" archived by user ${userId}`, {
        tierName,
        organizationsAffected,
        archivedBy: userId,
      });

      return {
        success: true,
        organizationsAffected,
        warnings,
      };
    } catch (error) {
      logger.error(`Error archiving tier ${tierName}:`, error);
      throw error;
    }
  }

  /**
   * Reactivate an archived pricing tier
   */
  async reactivatePricingTier(tierName: string, userId: string): Promise<void> {
    try {
      const tier = await db('pricing_tiers')
        .where('name', tierName)
        .first();

      if (!tier) {
        throw new NotFoundError(`Tier "${tierName}" not found`);
      }

      if (!tier.archived) {
        throw new ConflictError(`Tier "${tierName}" is not archived`);
      }

      // Reactivate the tier
      await db('pricing_tiers')
        .where('name', tierName)
        .update({
          archived: false,
          archived_at: null,
          archived_by: null,
          is_active: true,
          updated_at: new Date(),
        });

      // Reactivate Stripe product if exists
      if (tier.stripe_product_id) {
        try {
          await stripeTierService.reactivateProduct(tier.stripe_product_id);
        } catch (stripeError) {
          logger.warn(`Failed to reactivate Stripe product for tier ${tierName}:`, stripeError);
        }
      }

      // Log audit
      await tierAuditService.logTierAction({
        tierName,
        action: 'reactivated',
        actorId: userId,
        changes: {
          archived: { from: true, to: false },
          is_active: { from: false, to: true },
        },
      });

      // Invalidate cache
      this.invalidateTiersCache();

      logger.info(`Tier "${tierName}" reactivated by user ${userId}`, {
        tierName,
        reactivatedBy: userId,
      });
    } catch (error) {
      logger.error(`Error reactivating tier ${tierName}:`, error);
      throw error;
    }
  }

  /**
   * Get all pricing tiers for admin, including archived
   */
  async getAllPricingTiersAdminIncludingArchived(): Promise<PricingTier[]> {
    try {
      const rows = await db('pricing_tiers')
        .orderBy('sort_order', 'asc')
        .select('*');

      return rows.map(this.mapDbRowToTier);
    } catch (error) {
      logger.error('Error getting all pricing tiers for admin:', error);
      throw error;
    }
  }

  /**
   * Get organizations on a specific tier
   */
  async getOrganizationsOnTier(
    tierName: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{
    organizations: Array<{ id: string; name: string; createdAt: Date }>;
    total: number;
  }> {
    try {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      const [organizations, countResult] = await Promise.all([
        db('organizations')
          .where('subscription_tier', tierName)
          .select('id', 'name', 'created_at')
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        db('organizations')
          .where('subscription_tier', tierName)
          .count('* as count')
          .first(),
      ]);

      return {
        organizations: organizations.map((org) => ({
          id: org.id,
          name: org.name,
          createdAt: org.created_at,
        })),
        total: Number((countResult as { count: string })?.count ?? 0),
      };
    } catch (error) {
      logger.error(`Error getting organizations on tier ${tierName}:`, error);
      throw error;
    }
  }
}

export default new PricingService();
