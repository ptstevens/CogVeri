import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin, requirePrimaryAdmin, setTargetOrgContext, isPrimaryAdminEmail } from '../middleware/system-admin.middleware';
import { adminController } from '../controllers/admin.controller';
import { stripeSyncService } from '../services/stripe-sync.service';
import { organizationService } from '../services/organization.service';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// All admin routes require enhanced authentication + system admin check
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

/**
 * Get all organizations (system admin only)
 * GET /api/admin/organizations
 * Note: No RLS context needed - queries organizations table directly
 */
router.get('/organizations', (req, res) => adminController.getOrganizations(req, res));

/**
 * Create a new organization (system admin only)
 * POST /api/admin/organizations
 * Body: { name: string, ownerEmail: string, tier?: string }
 */
router.post('/organizations', (req, res) => adminController.createOrganization(req, res));

/**
 * Get organization details (system admin only)
 * GET /api/admin/organizations/:organizationId
 */
router.get('/organizations/:organizationId', setTargetOrgContext(), (req, res) =>
  adminController.getOrganizationDetails(req, res)
);

/**
 * Update organization tier (system admin only)
 * PUT /api/admin/organizations/:organizationId/tier
 * Body: { tier: string }
 */
router.put('/organizations/:organizationId/tier', setTargetOrgContext(), (req, res) =>
  adminController.updateOrganizationTier(req, res)
);

/**
 * Get admin dashboard metrics (system admin only)
 * GET /api/admin/metrics
 * Note: Aggregates across all orgs - no single org context
 */
router.get('/metrics', (req, res) => adminController.getSystemMetrics(req, res));

/**
 * Suspend organization (system admin only)
 * POST /api/admin/organizations/:organizationId/suspend
 */
router.post('/organizations/:organizationId/suspend', setTargetOrgContext(), (req, res) =>
  adminController.suspendOrganization(req, res)
);

/**
 * Unsuspend organization (system admin only)
 * POST /api/admin/organizations/:organizationId/unsuspend
 */
router.post('/organizations/:organizationId/unsuspend', setTargetOrgContext(), (req, res) =>
  adminController.unsuspendOrganization(req, res)
);

/**
 * Get organization audit logs (system admin only)
 * GET /api/admin/organizations/:organizationId/audit-logs
 */
router.get('/organizations/:organizationId/audit-logs', setTargetOrgContext(), (req, res) =>
  adminController.getAuditLogs(req, res)
);

/**
 * Admin impersonation - get impersonation token
 * POST /api/admin/impersonate/:organizationId
 */
router.post('/impersonate/:organizationId', setTargetOrgContext(), (req, res) =>
  adminController.impersonate(req, res)
);

/**
 * Sync organization subscription from Stripe (system admin only)
 * POST /api/admin/organizations/:organizationId/sync-stripe
 *
 * Syncs the subscription tier and status from Stripe to the local database.
 * Useful when webhooks fail or tier doesn't update after upgrade.
 */
router.post(
  '/organizations/:organizationId/sync-stripe',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, message: 'Organization ID required' });
        return;
      }
      const result = await stripeSyncService.syncOrganization(organizationId);

      if (result.synced) {
        res.json({
          success: true,
          message: result.changes.length > 0
            ? `Sync completed with changes: ${result.changes.join(', ')}`
            : 'Organization already in sync with Stripe',
          changes: result.changes,
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Sync failed',
          errors: result.errors,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Sync all organizations from Stripe (system admin only)
 * POST /api/admin/sync-stripe-all
 *
 * Syncs all organizations with Stripe subscriptions. Use with caution.
 * Note: No RLS context needed - queries across all orgs
 */
router.post('/sync-stripe-all', async (_req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const result = await stripeSyncService.syncAllOrganizations();
      res.json({
        success: true,
        total: result.total,
        synced: result.synced,
        errors: result.errors,
        details: result.details,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Get organization feature overrides (system admin only)
 * GET /api/admin/organizations/:organizationId/features
 *
 * Returns all features with their tier default, custom override, and effective values
 */
router.get('/organizations/:organizationId/features', setTargetOrgContext(), (req, res) =>
  adminController.getOrganizationFeatures(req, res)
);

/**
 * Update organization feature overrides (system admin only)
 * PUT /api/admin/organizations/:organizationId/features
 *
 * Body: { features: { [featureName]: boolean | null } }
 * Pass null to remove an override (reset to tier default)
 */
router.put('/organizations/:organizationId/features', setTargetOrgContext(), (req, res) =>
  adminController.updateOrganizationFeatures(req, res)
);

/**
 * Get organization limit overrides (system admin only)
 * GET /api/admin/organizations/:organizationId/limits
 *
 * Returns all limits with their tier default, custom override, and effective values
 */
router.get('/organizations/:organizationId/limits', setTargetOrgContext(), (req, res) =>
  adminController.getOrganizationLimits(req, res)
);

/**
 * Update organization limit overrides (system admin only)
 * PUT /api/admin/organizations/:organizationId/limits
 *
 * Body: { limits: { [limitName]: number | null } }
 * Pass null to remove an override (reset to tier default)
 */
router.put('/organizations/:organizationId/limits', setTargetOrgContext(), (req, res) =>
  adminController.updateOrganizationLimits(req, res)
);

/**
 * Delete organization (system admin only)
 * DELETE /api/admin/organizations/:organizationId
 *
 * WARNING: Permanently deletes organization and ALL associated data:
 * - All recordings and files
 * - All tasks and reviews
 * - All templates and settings
 * - Dedicated storage bucket
 */
router.delete(
  '/organizations/:organizationId',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, message: 'Organization ID required' });
        return;
      }

      // Get org info for response
      const org = await db('organizations').where('id', organizationId).first();
      if (!org) {
        res.status(404).json({ success: false, message: 'Organization not found' });
        return;
      }

      logger.info(`Organization deletion by system admin ${req.user?.id} for org ${organizationId} (${org.name})`);

      await organizationService.deleteOrganization(organizationId);

      logger.info(`Organization ${organizationId} (${org.name}) deleted by system admin ${req.user?.id}`);

      res.json({
        success: true,
        message: `Organization "${org.name}" and all associated data permanently deleted`,
      });
    } catch (error) {
      logger.error('Error deleting organization:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete organization',
      });
    }
  }
);

// ============================================================
// System Admin Management
// ============================================================

/**
 * Get all system admins (system admin only)
 * GET /api/admin/system-admins
 *
 * Returns list of all users with SUPER_ADMIN role
 * Note: This endpoint is visible to all system admins, but only the
 * primary admin (admin@cogveri.com) can grant/revoke SYSADMIN status.
 */
router.get('/system-admins', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const admins = await db('users')
      .where('system_role', 'SUPER_ADMIN')
      .select('id', 'email', 'name', 'system_role', 'system_admin_since', 'created_at')
      .orderBy('system_admin_since', 'asc');

    // Check if current user is the primary admin (can manage other admins)
    const canManageAdmins = isPrimaryAdminEmail(req.user?.email || '');

    res.json({
      success: true,
      canManageAdmins, // Frontend uses this to show/hide management UI
      admins: admins.map((admin) => ({
        ...admin,
        isPrimary: isPrimaryAdminEmail(admin.email), // Primary is identified by email, not order
      })),
    });
  } catch (error) {
    logger.error('Error getting system admins:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get system admins',
    });
  }
});

/**
 * Grant system admin role to a user (PRIMARY ADMIN ONLY)
 * POST /api/admin/system-admins
 *
 * IMPORTANT: Only admin@cogveri.com can grant SYSADMIN status
 *
 * Body: { userId: string } or { email: string }
 */
router.post('/system-admins', requirePrimaryAdmin, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, email } = req.body;

    if (!userId && !email) {
      res.status(400).json({ success: false, message: 'userId or email is required' });
      return;
    }

    // Find user
    let user;
    if (userId) {
      user = await db('users').where('id', userId).first();
    } else {
      user = await db('users').where('email', email.toLowerCase()).first();
    }

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Check if already admin
    if (user.system_role === 'SUPER_ADMIN') {
      res.status(400).json({ success: false, message: 'User is already a system admin' });
      return;
    }

    // Grant admin role - also set is_system_admin for backwards compatibility
    await db('users')
      .where('id', user.id)
      .update({
        system_role: 'SUPER_ADMIN',
        is_system_admin: true,
        system_admin_since: new Date(),
        updated_at: new Date(),
      });

    logger.info(`System admin granted to user ${user.id} (${user.email}) by primary admin ${req.user?.id} (${req.user?.email})`);

    res.json({
      success: true,
      message: `System admin role granted to ${user.email}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    logger.error('Error granting system admin:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to grant system admin',
    });
  }
});

/**
 * Revoke system admin role from a user (PRIMARY ADMIN ONLY)
 * DELETE /api/admin/system-admins/:userId
 *
 * IMPORTANT: Only admin@cogveri.com can revoke SYSADMIN status
 *
 * Note: Cannot revoke from primary admin (admin@cogveri.com) or yourself
 */
router.delete('/system-admins/:userId', requirePrimaryAdmin, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = req.params.userId;

    // Cannot revoke from yourself
    if (targetUserId === req.user?.id) {
      res.status(400).json({ success: false, message: 'Cannot revoke system admin from yourself' });
      return;
    }

    // Find target user
    const user = await db('users').where('id', targetUserId).first();
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Check if user is admin
    if (user.system_role !== 'SUPER_ADMIN') {
      res.status(400).json({ success: false, message: 'User is not a system admin' });
      return;
    }

    // Check if trying to revoke from primary admin (identified by email)
    if (isPrimaryAdminEmail(user.email)) {
      res.status(400).json({
        success: false,
        message: 'Cannot revoke system admin from the primary admin',
      });
      return;
    }

    // Revoke admin role - also clear is_system_admin for backwards compatibility
    await db('users')
      .where('id', targetUserId)
      .update({
        system_role: null,
        is_system_admin: false,
        system_admin_since: null,
        updated_at: new Date(),
      });

    logger.info(`System admin revoked from user ${targetUserId} (${user.email}) by primary admin ${req.user?.id} (${req.user?.email})`);

    res.json({
      success: true,
      message: `System admin role revoked from ${user.email}`,
    });
  } catch (error) {
    logger.error('Error revoking system admin:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to revoke system admin',
    });
  }
});

export default router;
