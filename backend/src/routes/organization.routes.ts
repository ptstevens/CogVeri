/**
 * Organization Routes v2
 *
 * Clean routing layer that delegates all business logic to OrganizationController.
 * This file handles only route definitions and middleware attachment.
 */

import express from 'express';
import { enhancedAuthenticate, requireRole } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';
import { organizationController } from '../controllers/organization.controller';

const router = express.Router();

// GET /api/organizations/user - List user's organizations
router.get(
  '/user',
  enhancedAuthenticate,
  organizationController.getUserOrganizations.bind(organizationController)
);

// GET /api/organizations - List organizations from user context
router.get(
  '/',
  enhancedAuthenticate,
  organizationController.listOrganizations.bind(organizationController)
);

// GET /api/organizations/:id - Get specific organization
router.get(
  '/:id',
  enhancedAuthenticate,
  organizationController.getOrganization.bind(organizationController)
);

// POST /api/organizations - Create organization
router.post(
  '/',
  enhancedAuthenticate,
  organizationController.createOrganization.bind(organizationController)
);

// PATCH /api/organizations/:id - Update organization (OWNER/ADMIN only)
router.patch(
  '/:id',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  organizationController.updateOrganization.bind(organizationController)
);

// DELETE /api/organizations/:id - Delete organization (SYSTEM ADMIN only)
// WARNING: Permanently deletes all data including recordings, files, bucket, billing
router.delete(
  '/:id',
  enhancedAuthenticate,
  requireSystemAdmin,
  organizationController.deleteOrganization.bind(organizationController)
);

// NOTE: Member management endpoints (GET/PATCH/DELETE /:id/members) are handled by
// organizationMemberRoutes in organization-member.routes.ts - DO NOT add them here!

// GET /api/organizations/:id/settings - Get organization settings (OWNER/ADMIN only)
router.get(
  '/:id/settings',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  organizationController.getOrganizationSettings.bind(organizationController)
);

// GET /api/organizations/:id/quota-status - Get quota usage
router.get(
  '/:id/quota-status',
  enhancedAuthenticate,
  organizationController.getQuotaStatus.bind(organizationController)
);

// GET /api/organizations/:id/rate-limit-status - Get API rate limit usage
router.get(
  '/:id/rate-limit-status',
  enhancedAuthenticate,
  organizationController.getRateLimitStatus.bind(organizationController)
);

export default router;
