import { Request, Response } from 'express';
import { db } from '../config/database';
import { organizationService } from '../services/organization.service';
import { organizationMemberService } from '../services/organization-member.service';
import pricingService, { PricingTier } from '../services/pricing.service';

// Database entity types for type-safe queries
interface DbUser {
  id: string;
  email: string;
  name: string | null;
  organization_id: string | null;
  system_role?: string;
  [key: string]: unknown;
}

interface DbOrganization {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  domain_verified: boolean;
  subscription_tier: string;
  is_active: boolean;
  is_suspended: boolean;
  owner_id: string;
  owner_email?: string;
  member_count?: string | number;
  custom_features?: string | Record<string, boolean>;
  custom_limits?: string | Record<string, number>;
  created_at: Date | string;
  updated_at: Date | string;
  description?: string;
}

interface DbSubscription {
  id: string;
  organization_id: string;
  subscription_tier: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DbAuditLog {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id?: string;
  changes?: string;
  metadata?: string;
  status: string;
  created_at: Date | string;
}

interface CountResult {
  count?: string | number;
  total?: string | number;
}

interface TierDistribution {
  subscription_tier: string | null;
  count: string | number;
}

class AdminController {
  /**
   * Create a new organization (admin only)
   * Creates user if they don't exist, then creates org with that user as owner
   */
  async createOrganization(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as { name?: string; ownerEmail?: string; tier?: string };
      const { name, ownerEmail, tier = 'free' } = body;

      if (!name || !ownerEmail) {
        res.status(400).json({ error: 'Organization name and owner email are required' });
        return;
      }

      // Validate email format
      if (!ownerEmail.includes('@')) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }

      // Check if user exists
      let user: DbUser | undefined = (await db('users')
        .where('email', ownerEmail.toLowerCase())
        .first()) as DbUser | undefined;

      if (!user) {
        // Create new user with invited status
        const emailPrefix = ownerEmail.split('@')[0] || 'user';
        const result = await db('users')
          .insert({
            email: ownerEmail.toLowerCase(),
            name: emailPrefix, // Use part before @ as placeholder name
            password: null, // Will need to set password on first login
            org_role: 'owner',
            org_status: 'invited',
            is_active: true,
            invited_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        user = (Array.isArray(result) ? result[0] : result) as DbUser;
      }

      // Check if user is already in an organization
      if (user.organization_id) {
        res.status(400).json({
          error: 'User already belongs to an organization',
          existingOrgId: user.organization_id,
        });
        return;
      }

      // Create the organization
      const result = await organizationService.createOrganization({
        name,
        ownerId: user.id,
        subscriptionTier: tier,
      });

      // Log audit entry
      await db('organization_audit_logs').insert({
        organization_id: result.id,
        actor_id: req.user?.id || null,
        action: 'organization_created_by_admin',
        resource_type: 'organization',
        resource_id: result.id,
        metadata: JSON.stringify({
          adminId: req.user?.id,
          ownerEmail,
          tier,
        }),
        status: 'success',
        created_at: new Date(),
      });

      res.status(201).json({
        success: true,
        data: {
          organizationId: result.id,
          name: result.name,
          ownerId: result.ownerId,
          ownerEmail,
          tier,
        },
        message: 'Organization created successfully',
      });
    } catch (error: unknown) {
      const err = error as Error;
      res.status(500).json({
        error: err.message || 'Failed to create organization',
      });
    }
  }

  /**
   * Update organization tier (admin only)
   */
  async updateOrganizationTier(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { tier } = req.body as { tier?: string };

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      if (!tier) {
        res.status(400).json({ error: 'Tier is required' });
        return;
      }

      // Validate tier exists
      const validTiers = ['free', 'enterprise'];
      if (!validTiers.includes(tier.toLowerCase())) {
        res.status(400).json({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
        return;
      }

      // Update the organization's subscription tier
      await db('organizations').where('id', organizationId).update({
        subscription_tier: tier.toLowerCase(),
        updated_at: new Date(),
      });

      // Also update the subscription table if it exists
      const existingSubscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .first();

      if (existingSubscription) {
        await db('organization_subscriptions').where('organization_id', organizationId).update({
          subscription_tier: tier.toLowerCase(),
          updated_at: new Date(),
        });
      } else {
        // Create a subscription record
        await db('organization_subscriptions').insert({
          organization_id: organizationId,
          subscription_tier: tier.toLowerCase(),
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // Log audit entry
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        actor_id: req.user?.id || null,
        action: 'tier_changed_by_admin',
        resource_type: 'organization',
        resource_id: organizationId,
        metadata: JSON.stringify({
          adminId: req.user?.id,
          newTier: tier.toLowerCase(),
        }),
        status: 'success',
        created_at: new Date(),
      });

      res.json({
        success: true,
        message: `Organization tier updated to ${tier}`,
        tier: tier.toLowerCase(),
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to update organization tier',
      });
    }
  }

  /**
   * Get all organizations
   */
  async getOrganizations(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = req.query.search as string;
      const status = req.query.status as string;

      let query = db('organizations as o')
        .select(
          'o.*',
          'u.email as owner_email',
          db.raw('COALESCE(mc.member_count, 0) as member_count')
        )
        .leftJoin('users as u', 'o.owner_id', 'u.id')
        .leftJoin(
          db('users')
            .select('organization_id')
            .count('* as member_count')
            .whereNotNull('organization_id')
            .groupBy('organization_id')
            .as('mc'),
          'o.id',
          'mc.organization_id'
        );

      // Apply filters
      if (search) {
        query = query.where('o.name', 'ilike', `%${search}%`);
      }

      if (status) {
        if (status === 'active') {
          query = query.where('o.is_suspended', false).where('o.is_active', true);
        } else if (status === 'suspended') {
          query = query.where('o.is_suspended', true);
        }
      }

      // Get count using a separate optimized query
      let countQuery = db('organizations as o');
      if (search) {
        countQuery = countQuery.where('o.name', 'ilike', `%${search}%`);
      }
      if (status) {
        if (status === 'active') {
          countQuery = countQuery.where('o.is_suspended', false).where('o.is_active', true);
        } else if (status === 'suspended') {
          countQuery = countQuery.where('o.is_suspended', true);
        }
      }
      const countResult = (await countQuery.count('o.id as total').first()) as
        CountResult | undefined;
      const total = parseInt(countResult?.total?.toString() || '0');

      // Get paginated results with JOINs (single query instead of N+1)
      const organizations = (await query
        .orderBy('o.created_at', 'desc')
        .limit(limit)
        .offset(offset)) as DbOrganization[];

      // Map to expected response format
      const enriched = organizations.map((org: DbOrganization) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.domain,
        subscription_tier: org.subscription_tier,
        is_active: org.is_active,
        is_suspended: org.is_suspended,
        owner_id: org.owner_id,
        created_at: org.created_at,
        updated_at: org.updated_at,
        memberCount: parseInt(org.member_count?.toString() || '0'),
        ownerEmail: org.owner_email,
        domainVerified: org.domain_verified,
        createdAt: org.created_at,
        lastActivityAt: org.updated_at,
      }));

      res.json({
        success: true,
        data: {
          organizations: enriched,
          total,
          hasMore: offset + organizations.length < total,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to fetch organizations',
      });
    }
  }

  /**
   * Get organization details
   */
  async getOrganizationDetails(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      // Get organization
      const org = await organizationService.getOrganization(organizationId);

      if (!org) {
        res.status(404).json({
          error: 'Organization not found',
        });
        return;
      }

      // Get members
      const members = await organizationMemberService.getOrganizationMembers(organizationId, {
        limit: 100,
        offset: 0,
      });

      // Get owner info
      const owner = (await db('users')
        .where('id', org.owner_id as string)
        .first()) as DbUser | undefined;

      // Get subscription info from dedicated table (if exists)
      const subscription = (await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc')
        .first()) as DbSubscription | undefined;

      // Get recent audit logs
      const auditLogs = (await db('organization_audit_logs')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc')
        .limit(20)) as DbAuditLog[];

      // Calculate metrics
      const createdAt = new Date(org.created_at as string | number | Date);
      const now = new Date();
      const daysActive = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      // Use subscription table tier if available, otherwise fall back to organization's subscription_tier
      const tier = subscription?.subscription_tier || org.subscription_tier || 'free';

      res.json({
        success: true,
        data: {
          organization: {
            id: org.id,
            name: org.name,
            description: org.description,
            domain: org.domain,
            domainVerified: org.domain_verified,
            isActive: org.is_active,
            isSuspended: org.is_suspended,
            createdAt: org.created_at,
            updatedAt: org.updated_at,
          },
          owner: {
            id: owner?.id,
            email: owner?.email,
            name: owner?.name || owner?.email,
          },
          subscription: {
            tier,
            status: subscription?.status || 'active',
            createdAt: subscription?.created_at,
          },
          metrics: {
            memberCount: members.length,
            daysActive,
            lastActivityAt: org.updated_at,
          },
          members: {
            total: members.length,
            list: members.slice(0, 10),
          },
          auditLogs: auditLogs.map((log) => ({
            action: log.action,
            resourceType: log.resource_type,
            createdAt: log.created_at,
            actor: log.actor_id,
          })),
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to fetch organization details',
      });
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(_req: Request, res: Response): Promise<void> {
    try {
      // Total organizations
      const [countResult1] = (await db('organizations').count('id as count')) as CountResult[];
      const totalOrgs = parseInt(countResult1?.count?.toString() || '0');

      // Active organizations
      const [countResult2] = (await db('organizations')
        .where('is_active', true)
        .where('is_suspended', false)
        .count('id as count')) as CountResult[];
      const activeOrgs = parseInt(countResult2?.count?.toString() || '0');

      // Suspended organizations
      const [countResult3] = (await db('organizations')
        .where('is_suspended', true)
        .count('id as count')) as CountResult[];
      const suspendedOrgs = parseInt(countResult3?.count?.toString() || '0');

      // Verified domains
      const [countResult4] = (await db('organizations')
        .where('domain_verified', true)
        .count('id as count')) as CountResult[];
      const verifiedDomains = parseInt(countResult4?.count?.toString() || '0');

      // Total users
      const [countResult5] = (await db('users').count('id as count')) as CountResult[];
      const totalUsers = parseInt(countResult5?.count?.toString() || '0');

      // System admins
      const [countResult6] = (await db('users')
        .where('system_role', 'SUPER_ADMIN')
        .count('id as count')) as CountResult[];
      const systemAdmins = parseInt(countResult6?.count?.toString() || '0');

      // Organizations by tier
      const tierDistribution = (await db('organizations')
        .select('subscription_tier')
        .count('id as count')
        .groupBy('subscription_tier')) as TierDistribution[];

      // Organizations created in last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [countResult7] = (await db('organizations')
        .where('created_at', '>=', weekAgo)
        .count('id as count')) as CountResult[];
      const newOrgsWeek = parseInt(countResult7?.count?.toString() || '0');

      // Organizations created in last 30 days
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [countResult8] = (await db('organizations')
        .where('created_at', '>=', monthAgo)
        .count('id as count')) as CountResult[];
      const newOrgsMonth = parseInt(countResult8?.count?.toString() || '0');

      // Average members per organization
      const avgMembersResult = (await db('users')
        .whereNotNull('organization_id')
        .count('id as count')
        .first()) as CountResult | undefined;

      const avgMembers =
        totalOrgs > 0
          ? Math.round(parseInt(avgMembersResult?.count?.toString() || '0') / totalOrgs)
          : 0;

      res.json({
        success: true,
        data: {
          organizations: {
            total: totalOrgs,
            active: activeOrgs,
            suspended: suspendedOrgs,
            withVerifiedDomain: verifiedDomains,
          },
          users: {
            total: totalUsers,
            systemAdmins: systemAdmins,
          },
          growth: {
            newOrgsLastWeek: newOrgsWeek,
            newOrgsLastMonth: newOrgsMonth,
          },
          distribution: {
            byTier: tierDistribution.map((tier) => ({
              tier: tier.subscription_tier || 'unknown',
              count: parseInt(tier.count?.toString() || '0'),
            })),
            averageMembersPerOrg: avgMembers,
          },
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to fetch metrics',
      });
    }
  }

  /**
   * Suspend organization
   */
  async suspendOrganization(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { reason } = req.body as { reason?: string };

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      await organizationService.suspendOrganization(organizationId, reason);

      res.json({
        success: true,
        message: 'Organization suspended successfully',
      });
    } catch (error: unknown) {
      res.status(400).json({
        error: (error as Error).message || 'Failed to suspend organization',
      });
    }
  }

  /**
   * Unsuspend organization
   */
  async unsuspendOrganization(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      await organizationService.unsuspendOrganization(organizationId);

      res.json({
        success: true,
        message: 'Organization unsuspended successfully',
      });
    } catch (error: unknown) {
      res.status(400).json({
        error: (error as Error).message || 'Failed to unsuspend organization',
      });
    }
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;

      let query = db('organization_audit_logs').where('organization_id', organizationId);

      if (action) {
        query = query.where('action', 'ilike', `%${action}%`);
      }

      if (startDate) {
        query = query.where('created_at', '>=', startDate);
      }

      if (endDate) {
        query = query.where('created_at', '<=', endDate);
      }

      // Get count
      const [countResult] = (await query.clone().count('id as count')) as CountResult[];
      const total = parseInt(countResult?.count?.toString() || '0');

      // Get paginated logs
      const logs = (await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)) as DbAuditLog[];

      // Enrich with actor info
      const enriched = await Promise.all(
        logs.map(async (log: DbAuditLog) => {
          const actor = log.actor_id
            ? ((await db('users').where('id', log.actor_id).select('email').first()) as
                { email: string } | undefined)
            : null;

          return {
            id: log.id,
            action: log.action,
            resourceType: log.resource_type,
            resourceId: log.resource_id,
            actor: actor?.email || 'Unknown',
            changes: log.changes,
            metadata: log.metadata,
            status: log.status,
            createdAt: log.created_at,
          };
        })
      );

      res.json({
        success: true,
        data: {
          logs: enriched,
          total: total,
          hasMore: offset + logs.length < total,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to fetch audit logs',
      });
    }
  }

  /**
   * Impersonate user/organization
   */
  async impersonate(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      const systemAdminId = req.user!.id;

      // Verify organization exists
      const org = (await db('organizations').where('id', organizationId).first()) as
        DbOrganization | undefined;
      if (!org) {
        res.status(404).json({
          error: 'Organization not found',
        });
        return;
      }

      // Create impersonation token (store in cache/memory for 1 hour)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require('crypto') as {
        randomBytes: (n: number) => { toString: (enc: string) => string };
      };
      const impersonationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store in database for validation
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uuid = require('uuid') as { v4: () => string };
      await db('admin_impersonation_tokens').insert({
        id: uuid.v4(),
        system_admin_id: systemAdminId,
        organization_id: organizationId,
        token: impersonationToken,
        expires_at: expiresAt,
        created_at: new Date(),
      });

      // Log the impersonation
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        actor_id: systemAdminId,
        action: 'admin_impersonation_started',
        resource_type: 'admin',
        metadata: { system_admin_id: systemAdminId },
        status: 'success',
        created_at: new Date(),
      });

      res.json({
        success: true,
        data: {
          impersonationToken,
          expiresAt,
          organizationId,
          message: 'You can now access this organization as a member. Token is valid for 1 hour.',
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to create impersonation token',
      });
    }
  }

  /**
   * Get organization feature overrides
   * Returns features with tier defaults, custom overrides, and effective values
   */
  async getOrganizationFeatures(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      // Get organization with tier and custom features
      const org = (await db('organizations')
        .where('id', organizationId)
        .select('id', 'name', 'subscription_tier', 'custom_features')
        .first()) as
        Pick<DbOrganization, 'id' | 'name' | 'subscription_tier' | 'custom_features'> | undefined;

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      // Get tier defaults
      const tier = await pricingService.getPricingTier(org.subscription_tier);
      const tierFeatures = tier.features;

      // Parse custom overrides
      const customFeatures: Record<string, boolean> = org.custom_features
        ? typeof org.custom_features === 'string'
          ? (JSON.parse(org.custom_features) as Record<string, boolean>)
          : org.custom_features
        : {};

      // Get effective features
      const effectiveFeatures = await pricingService.getEffectiveFeatures(organizationId);

      // Get feature descriptions for UI
      const featureDescriptions = pricingService.getFeatureDescriptions();

      // Build response with all info for each feature
      const features: Record<
        string,
        {
          name: string;
          description: string;
          category: string;
          tierValue: boolean;
          customValue: boolean | null;
          effectiveValue: boolean;
          isOverridden: boolean;
        }
      > = {};

      for (const [key, tierValue] of Object.entries(tierFeatures)) {
        const featureKey = key as keyof PricingTier['features'];
        const desc = featureDescriptions[featureKey];
        const customValue = customFeatures[key] !== undefined ? customFeatures[key] : null;

        features[key] = {
          name: desc?.name || key,
          description: desc?.description || '',
          category: desc?.category || 'Other',
          tierValue: tierValue as boolean,
          customValue,
          effectiveValue: effectiveFeatures[featureKey],
          isOverridden: customValue !== null,
        };
      }

      res.json({
        success: true,
        data: {
          organizationId,
          organizationName: org.name,
          tier: org.subscription_tier,
          tierDisplayName: tier.displayName,
          features,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to fetch organization features',
      });
    }
  }

  /**
   * Update organization feature overrides
   * Pass null to remove an override (reset to tier default)
   */
  async updateOrganizationFeatures(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { features } = req.body as { features?: Record<string, boolean | null> };

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      if (!features || typeof features !== 'object') {
        res.status(400).json({ error: 'Features object is required' });
        return;
      }

      // Get current organization
      const org = (await db('organizations')
        .where('id', organizationId)
        .select('id', 'subscription_tier', 'custom_features')
        .first()) as
        Pick<DbOrganization, 'id' | 'subscription_tier' | 'custom_features'> | undefined;

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      // Parse existing custom features
      const currentCustomFeatures: Record<string, boolean> = org.custom_features
        ? typeof org.custom_features === 'string'
          ? (JSON.parse(org.custom_features) as Record<string, boolean>)
          : org.custom_features
        : {};

      // Get valid feature names from tier
      const tier = await pricingService.getPricingTier(org.subscription_tier);
      const validFeatures = new Set(Object.keys(tier.features));

      // Apply updates
      const changes: { feature: string; from: boolean | null; to: boolean | null }[] = [];

      for (const [key, value] of Object.entries(features)) {
        if (!validFeatures.has(key)) {
          continue; // Skip invalid feature names
        }

        const oldValue: boolean | null =
          currentCustomFeatures[key] !== undefined ? currentCustomFeatures[key] : null;

        if (value === null) {
          // Remove override
          delete currentCustomFeatures[key];
          if (oldValue !== null) {
            changes.push({ feature: key, from: oldValue, to: null });
          }
        } else if (typeof value === 'boolean') {
          // Set override
          currentCustomFeatures[key] = value;
          if (oldValue !== value) {
            changes.push({ feature: key, from: oldValue, to: value });
          }
        }
      }

      // Update database
      await db('organizations')
        .where('id', organizationId)
        .update({
          custom_features: JSON.stringify(currentCustomFeatures),
          updated_at: new Date(),
        });

      // Log audit entry
      if (changes.length > 0) {
        await db('organization_audit_logs').insert({
          organization_id: organizationId,
          actor_id: req.user?.id || null,
          action: 'feature_overrides_updated',
          resource_type: 'organization',
          resource_id: organizationId,
          changes: JSON.stringify(changes),
          status: 'success',
          created_at: new Date(),
        });
      }

      res.json({
        success: true,
        message:
          changes.length > 0 ? `Updated ${changes.length} feature override(s)` : 'No changes made',
        changes,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to update organization features',
      });
    }
  }

  /**
   * Get organization limit overrides
   * Returns limits with tier defaults, custom overrides, and effective values
   */
  async getOrganizationLimits(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      // Get organization with tier and custom limits
      const org = (await db('organizations')
        .where('id', organizationId)
        .select('id', 'name', 'subscription_tier', 'custom_limits')
        .first()) as
        Pick<DbOrganization, 'id' | 'name' | 'subscription_tier' | 'custom_limits'> | undefined;

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      // Get tier defaults
      const tier = await pricingService.getPricingTier(org.subscription_tier);
      const tierLimits = tier.limits;

      // Parse custom overrides
      const customLimits: Record<string, number> = org.custom_limits
        ? typeof org.custom_limits === 'string'
          ? (JSON.parse(org.custom_limits) as Record<string, number>)
          : (org.custom_limits as unknown as Record<string, number>)
        : {};

      // Get effective limits
      const effectiveLimits = await pricingService.getEffectiveLimits(organizationId);

      // Get limit descriptions for UI
      const limitDescriptions = pricingService.getLimitDescriptions();

      // Build response with all info for each limit
      const limits: Record<
        string,
        {
          name: string;
          unit: string;
          tierValue: number;
          customValue: number | null;
          effectiveValue: number;
          isOverridden: boolean;
          isUnlimited: boolean;
        }
      > = {};

      for (const [key, tierValue] of Object.entries(tierLimits)) {
        const limitKey = key as keyof PricingTier['limits'];
        const desc = limitDescriptions[limitKey];
        const customValue: number | null =
          customLimits[key] !== undefined ? customLimits[key] : null;
        const effectiveValue = effectiveLimits[limitKey];

        limits[key] = {
          name: desc?.name || key,
          unit: desc?.unit || '',
          tierValue: tierValue,
          customValue,
          effectiveValue,
          isOverridden: customValue !== null,
          isUnlimited: effectiveValue === -1,
        };
      }

      res.json({
        success: true,
        data: {
          organizationId,
          organizationName: org.name,
          tier: org.subscription_tier,
          tierDisplayName: tier.displayName,
          limits,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to fetch organization limits',
      });
    }
  }

  /**
   * Update organization limit overrides
   * Pass null to remove an override (reset to tier default)
   */
  async updateOrganizationLimits(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { limits } = req.body as { limits?: Record<string, number | null> };

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      if (!limits || typeof limits !== 'object') {
        res.status(400).json({ error: 'Limits object is required' });
        return;
      }

      // Get current organization
      const org = (await db('organizations')
        .where('id', organizationId)
        .select('id', 'subscription_tier', 'custom_limits')
        .first()) as Pick<DbOrganization, 'id' | 'subscription_tier' | 'custom_limits'> | undefined;

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      // Parse existing custom limits
      const currentCustomLimits: Record<string, number> = org.custom_limits
        ? typeof org.custom_limits === 'string'
          ? (JSON.parse(org.custom_limits) as Record<string, number>)
          : (org.custom_limits as unknown as Record<string, number>)
        : {};

      // Get valid limit names from tier
      const tier = await pricingService.getPricingTier(org.subscription_tier);
      const validLimits = new Set(Object.keys(tier.limits));

      // Apply updates
      const changes: { limit: string; from: number | null; to: number | null }[] = [];

      for (const [key, value] of Object.entries(limits)) {
        if (!validLimits.has(key)) {
          continue; // Skip invalid limit names
        }

        const oldValue: number | null =
          currentCustomLimits[key] !== undefined ? currentCustomLimits[key] : null;

        if (value === null) {
          // Remove override
          delete currentCustomLimits[key];
          if (oldValue !== null) {
            changes.push({ limit: key, from: oldValue, to: null });
          }
        } else if (typeof value === 'number') {
          // Set override
          currentCustomLimits[key] = value;
          if (oldValue !== value) {
            changes.push({ limit: key, from: oldValue, to: value });
          }
        }
      }

      // Update database
      await db('organizations')
        .where('id', organizationId)
        .update({
          custom_limits: JSON.stringify(currentCustomLimits),
          updated_at: new Date(),
        });

      // Log audit entry
      if (changes.length > 0) {
        await db('organization_audit_logs').insert({
          organization_id: organizationId,
          actor_id: req.user?.id || null,
          action: 'limit_overrides_updated',
          resource_type: 'organization',
          resource_id: organizationId,
          changes: JSON.stringify(changes),
          status: 'success',
          created_at: new Date(),
        });
      }

      res.json({
        success: true,
        message:
          changes.length > 0 ? `Updated ${changes.length} limit override(s)` : 'No changes made',
        changes,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: (error as Error).message || 'Failed to update organization limits',
      });
    }
  }
}

export const adminController = new AdminController();
