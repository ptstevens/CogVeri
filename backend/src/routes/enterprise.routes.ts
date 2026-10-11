/**
 * Enterprise Management Routes
 *
 * System admin-only routes for managing enterprise customers
 * with custom limits and features.
 */

import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin, setTargetOrgContext } from '../middleware/system-admin.middleware';
import {
  listEnterpriseOrganizations,
  getEnterpriseDetails,
  applyEnterprisePlan,
  updateEnterpriseConfig,
  removeEnterprisePlan,
  getEnterpriseTemplate,
  createEnterpriseInvoice,
  createEnterpriseSubscription,
  listOrganizationInvoices,
  voidEnterpriseInvoice,
  markInvoicePaid,
} from '../controllers/enterprise.controller';

const router = Router();

// All routes require enhanced authentication and system admin access
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

/**
 * GET /api/admin/enterprise/organizations
 * List all enterprise organizations
 * Note: No RLS context needed - queries organizations table directly
 */
router.get('/organizations', listEnterpriseOrganizations);

/**
 * GET /api/admin/enterprise/organizations/:organizationId
 * Get enterprise details for a specific organization
 */
router.get('/organizations/:organizationId', setTargetOrgContext(), getEnterpriseDetails);

/**
 * POST /api/admin/enterprise/apply
 * Apply enterprise plan to an organization
 *
 * Body:
 * {
 *   organizationId: string (required),
 *   customLimits: { maxMembers?: number, maxStorageGb?: number, ... },
 *   customFeatures: { ssoSaml?: boolean, auditLogs?: boolean, ... },
 *   enterpriseConfig: { contractValue?: number, billingContact?: string },
 *   notes: string,
 *   contractStartDate: ISO date string,
 *   contractEndDate: ISO date string
 * }
 */
router.post('/apply', applyEnterprisePlan);

/**
 * PATCH /api/admin/enterprise/organizations/:organizationId
 * Update enterprise configuration for an organization
 */
router.patch('/organizations/:organizationId', setTargetOrgContext(), updateEnterpriseConfig);

/**
 * DELETE /api/admin/enterprise/organizations/:organizationId
 * Remove enterprise status and revert to a standard tier
 *
 * Body:
 * {
 *   revertToTier: 'free' (defaults to 'free')
 * }
 */
router.delete('/organizations/:organizationId', setTargetOrgContext(), removeEnterprisePlan);

/**
 * GET /api/admin/enterprise/template
 * Get the enterprise limits/features template (all unlimited)
 */
router.get('/template', getEnterpriseTemplate);

// ============================================================
// ENTERPRISE INVOICING ROUTES
// ============================================================

/**
 * POST /api/admin/enterprise/invoice
 * Create and send an invoice to an enterprise customer
 *
 * Body:
 * {
 *   organizationId: string (required),
 *   description: string (required) - e.g., "CogVeri Enterprise - Annual License",
 *   amount: number (required) - Amount in cents (e.g., 999900 = $9,999.00),
 *   quantity: number (optional, default: 1),
 *   daysUntilDue: number (optional, default: 30),
 *   contractMonths: number (optional, default: 12),
 *   autoSend: boolean (optional, default: true),
 *   notes: string (optional)
 * }
 */
router.post('/invoice', createEnterpriseInvoice);

/**
 * POST /api/admin/enterprise/subscription
 * Create a recurring subscription with custom pricing
 *
 * Body:
 * {
 *   organizationId: string (required),
 *   description: string (required) - e.g., "50 seats",
 *   amount: number (required) - Amount per period in cents,
 *   interval: 'month' | 'year' (required),
 *   trialDays: number (optional, default: 0)
 * }
 */
router.post('/subscription', createEnterpriseSubscription);

/**
 * GET /api/admin/enterprise/invoices/:organizationId
 * List invoices for an organization
 */
router.get('/invoices/:organizationId', setTargetOrgContext(), listOrganizationInvoices);

/**
 * POST /api/admin/enterprise/invoices/:invoiceId/void
 * Void an unpaid invoice
 */
router.post('/invoices/:invoiceId/void', voidEnterpriseInvoice);

/**
 * POST /api/admin/enterprise/invoices/:invoiceId/mark-paid
 * Mark an invoice as paid (for offline/wire payments)
 */
router.post('/invoices/:invoiceId/mark-paid', markInvoicePaid);

export default router;
