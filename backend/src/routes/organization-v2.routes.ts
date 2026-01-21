import express from 'express';
import {
  enhancedAuthenticate,
  requireRole,
} from '../middleware/enhanced-auth.middleware';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { getFullQuotaStatus } from '../utils/quota-enforcement';
import { getRateLimitStatus } from '../middleware/api-rate-limiter';
import { organizationService } from '../services/organization.service';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';

const router = express.Router();

/**
 * GET /api/organizations/user
 * List all organizations the user is a member of
 * Uses organization_members table with fallback to legacy users.organization_id
 */
router.get('/user', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Query organization_members table for user's memberships
    let organizations = await db('organizations as o')
      .join('organization_members as om', 'om.organization_id', '=', 'o.id')
      .where('om.user_id', req.user.id)
      .where('om.status', 'active')
      .where('o.is_active', true)
      .select(
        'o.id',
        'o.name',
        'o.slug',
        'o.subscription_tier',
        'o.owner_id',
        'o.created_at',
        'om.role',
        'om.joined_at'
      );

    // Fallback to legacy users.organization_id if no memberships found (transition period)
    if (organizations.length === 0) {
      const legacyOrgs = await db('organizations')
        .select('organizations.*')
        .join('users', 'users.organization_id', '=', 'organizations.id')
        .where('users.id', req.user.id)
        .where('organizations.is_active', true);

      organizations = legacyOrgs.map((org: any) => ({
        ...org,
        role: 'limited', // Default role for legacy data
        joined_at: null,
      }));
    }

    // Format response
    const formattedOrgs = organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug || org.name.toLowerCase().replace(/\s+/g, '-'),
      tier: (org.subscription_tier || 'free') as 'free' | 'enterprise' | string,
      ownerId: org.owner_id,
      role: org.role,
      joinedAt: org.joined_at,
      created_at: org.created_at?.toISOString() || new Date().toISOString(),
    }));

    res.json(formattedOrgs);
  } catch (error) {
    logger.error('Error listing user organizations:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

/**
 * GET /api/organizations
 * List all organizations the user is a member of
 */
router.get('/', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // TODO: Get organizations from database
    const organizations = (req.user.organizations || []).map((org: any) => ({
      id: org.id,
      name: 'Organization',
      slug: org.slug,
      role: org.role,
      createdAt: new Date(),
    }));

    res.json({ data: organizations });
  } catch (error) {
    logger.error('Error listing organizations:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

/**
 * GET /api/organizations/:id
 * Get specific organization details
 */
router.get('/:id', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Verify user is member of this org or is system admin
    if (req.user.org_id !== req.params.id && !req.user.is_system_admin) {
      res.status(403).json({ error: 'You are not a member of this organization' });
      return;
    }

    // Fetch organization details from database
    const org = await db('organizations').where('id', req.params.id).first();

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug || org.name.toLowerCase().replace(/\s+/g, '-'),
      domain: org.domain,
      createdAt: org.created_at?.toISOString() || new Date().toISOString(),
      subscriptionTier: org.subscription_tier,
      isActive: org.is_active,
    });
  } catch (error) {
    logger.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

/**
 * POST /api/organizations
 * Create new organization
 */
router.post('/', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, slug } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: 'Name and slug are required' });
      return;
    }

    // TODO: Check if slug exists and create organization in database
    const orgId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    res.status(201).json({
      id: orgId,
      name,
      slug,
      createdAt: new Date(),
    });
  } catch (error) {
    logger.error('Error creating organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * PATCH /api/organizations/:id
 * Update organization (OWNER/ADMIN only)
 */
router.patch('/:id', enhancedAuthenticate, requireRole('OWNER', 'ADMIN'), async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Verify org context
    if (req.user.org_id !== req.params.id) {
      res.status(403).json({ error: 'Cannot update other organizations' });
      return;
    }

    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // TODO: Update organization in database
    res.json({
      id: req.params.id,
      name,
      slug: 'org-slug',
      createdAt: new Date(),
    });
  } catch (error) {
    logger.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

/**
 * DELETE /api/organizations/:id
 * Delete organization (SYSTEM ADMIN only)
 * WARNING: This permanently deletes all organization data including:
 * - All recordings and their files
 * - All tasks and reviews
 * - All templates and settings
 * - Dedicated storage bucket
 * - Billing/subscription data
 */
router.delete('/:id', enhancedAuthenticate, requireSystemAdmin, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const organizationId = req.params.id;
    if (!organizationId) {
      res.status(400).json({ error: 'Organization ID required' });
      return;
    }

    // Get org info for logging
    const org = await db('organizations').where('id', organizationId).first();
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    logger.info(`Organization deletion requested by system admin ${req.user.id} for org ${organizationId} (${org.name})`);

    // Perform full deletion (recordings, files, bucket, all data)
    await organizationService.deleteOrganization(organizationId);

    logger.info(`Organization ${organizationId} (${org.name}) successfully deleted by system admin ${req.user.id}`);

    res.json({
      success: true,
      message: `Organization "${org.name}" and all associated data permanently deleted`
    });
  } catch (error) {
    logger.error('Error deleting organization:', error);
    res.status(500).json({
      error: 'Failed to delete organization',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// NOTE: Member management endpoints (GET/PATCH/DELETE /:id/members) are handled by
// organizationMemberRoutes in organization-member.routes.ts - DO NOT add them here!

/**
 * GET /api/organizations/:id/settings
 * Get organization settings (OWNER/ADMIN only)
 */
router.get('/:id/settings', enhancedAuthenticate, requireRole('OWNER', 'ADMIN'), async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (req.user.org_id !== req.params.id) {
      res.status(403).json({ error: 'Cannot view settings for other organizations' });
      return;
    }

    // TODO: Get organization settings from database

    res.json({
      id: req.params.id,
      name: 'Organization',
      slug: 'org-slug',
      createdAt: new Date(),
      subscription: {
        plan: 'free',
        status: 'active',
        storageLimit: 5368709120, // 5GB
        storageUsed: 0,
        usersLimit: 5,
        usersCount: 1,
      },
    });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/organizations/:id/quota-status
 * Get organization quota usage and limits
 */
router.get('/:id/quota-status', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Verify user is member of this org
    if (req.user.org_id !== req.params.id && !req.user.is_system_admin) {
      res.status(403).json({ error: 'You are not a member of this organization' });
      return;
    }

    const quotaStatus = await getFullQuotaStatus(req.params.id!);

    res.json({
      success: true,
      data: quotaStatus,
    });
  } catch (error) {
    logger.error('Error fetching quota status:', error);
    res.status(500).json({ error: 'Failed to fetch quota status' });
  }
});

/**
 * GET /api/organizations/:id/rate-limit-status
 * Get organization API rate limit usage
 */
router.get('/:id/rate-limit-status', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Verify user is member of this org or is admin
    if (req.user.org_id !== req.params.id && !req.user.is_system_admin) {
      res.status(403).json({ error: 'You are not a member of this organization' });
      return;
    }

    const rateLimitStatus = await getRateLimitStatus(req.params.id!);

    res.json({
      success: true,
      data: rateLimitStatus,
    });
  } catch (error) {
    logger.error('Error fetching rate limit status:', error);
    res.status(500).json({ error: 'Failed to fetch rate limit status' });
  }
});

export default router;
