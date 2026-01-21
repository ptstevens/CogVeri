import { Router } from 'express';
import {
  getSubscription,
  getUsage,
  getBillingHistory,
  getInvoice,
  getUpcomingInvoice,
  createCheckoutSession,
  createPortalSession,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  getPaymentMethods,
  addPaymentMethod,
  setDefaultPaymentMethod,
  removePaymentMethod,
  getTiers,
  submitEnterpriseContact,
  getBillingContact,
  updateBillingContact,
  syncSubscription,
} from '../controllers/billing.controller';
import { enhancedAuthenticate, requireOrganization } from '../middleware/enhanced-auth.middleware';

const router = Router();

/**
 * GET /api/billing/tiers
 * Get all available pricing tiers
 * Public endpoint - no auth required
 */
router.get('/tiers', getTiers);

/**
 * All billing routes require authentication and organization context
 */

/**
 * GET /api/billing/subscription
 * Get current subscription details
 * Returns subscription info, tier details, and status
 */
router.get('/subscription', enhancedAuthenticate, requireOrganization, getSubscription);

/**
 * GET /api/billing/usage
 * Get current usage against tier limits
 * Returns member count, storage, tasks, videos usage with percentages
 */
router.get('/usage', enhancedAuthenticate, requireOrganization, getUsage);

/**
 * GET /api/billing/contact
 * Get billing contact for the organization
 * Returns billing contact email/name and subscriber (owner) info
 */
router.get('/contact', enhancedAuthenticate, requireOrganization, getBillingContact);

/**
 * PATCH /api/billing/contact
 * Update billing contact for the organization
 * Body: { billingEmail, billingName }
 * Requires OWNER or ADMIN role
 */
router.patch('/contact', enhancedAuthenticate, requireOrganization, updateBillingContact);

/**
 * GET /api/billing/invoices
 * List past invoices with pagination
 * Query params: limit (1-100), startingAfter (cursor)
 */
router.get('/invoices', enhancedAuthenticate, requireOrganization, getBillingHistory);

/**
 * GET /api/billing/invoices/:id
 * Get single invoice details
 * Returns full invoice with line items
 */
router.get('/invoices/:id', enhancedAuthenticate, requireOrganization, getInvoice);

/**
 * GET /api/billing/upcoming-invoice
 * Preview next invoice/charge
 * Returns null if no active subscription
 */
router.get('/upcoming-invoice', enhancedAuthenticate, requireOrganization, getUpcomingInvoice);

/**
 * POST /api/billing/checkout
 * Create Stripe checkout session for new subscription
 * Body: { priceId, successUrl, cancelUrl, billingCycle? }
 * Requires OWNER or ADMIN role
 */
router.post('/checkout', enhancedAuthenticate, requireOrganization, createCheckoutSession);

/**
 * POST /api/billing/portal
 * Create Stripe customer portal session
 * Body: { returnUrl }
 * Requires OWNER or ADMIN role
 */
router.post('/portal', enhancedAuthenticate, requireOrganization, createPortalSession);

/**
 * PATCH /api/billing/subscription
 * Update/change subscription tier
 * Body: { priceId, prorationBehavior? }
 * Requires OWNER or ADMIN role
 */
router.patch('/subscription', enhancedAuthenticate, requireOrganization, updateSubscription);

/**
 * DELETE /api/billing/subscription
 * Cancel subscription
 * Body: { cancelImmediately?, cancellationReason? }
 * Requires OWNER or ADMIN role
 */
router.delete('/subscription', enhancedAuthenticate, requireOrganization, cancelSubscription);

/**
 * POST /api/billing/subscription/reactivate
 * Reactivate a subscription scheduled for cancellation
 * Requires OWNER or ADMIN role
 */
router.post(
  '/subscription/reactivate',
  enhancedAuthenticate,
  requireOrganization,
  reactivateSubscription
);

/**
 * POST /api/billing/sync
 * Manually sync subscription data from Stripe
 * Useful when webhooks are delayed/misconfigured
 * Requires OWNER or ADMIN role
 */
router.post('/sync', enhancedAuthenticate, requireOrganization, syncSubscription);

/**
 * GET /api/billing/payment-methods
 * List payment methods for the organization
 */
router.get('/payment-methods', enhancedAuthenticate, requireOrganization, getPaymentMethods);

/**
 * POST /api/billing/payment-methods
 * Add new payment method (returns SetupIntent for client-side completion)
 * Requires OWNER or ADMIN role
 */
router.post('/payment-methods', enhancedAuthenticate, requireOrganization, addPaymentMethod);

/**
 * PATCH /api/billing/payment-methods/:id/default
 * Set a payment method as the default
 * Requires OWNER or ADMIN role
 */
router.patch(
  '/payment-methods/:id/default',
  enhancedAuthenticate,
  requireOrganization,
  setDefaultPaymentMethod
);

/**
 * DELETE /api/billing/payment-methods/:id
 * Remove a payment method
 * Requires OWNER or ADMIN role
 */
router.delete(
  '/payment-methods/:id',
  enhancedAuthenticate,
  requireOrganization,
  removePaymentMethod
);

/**
 * POST /api/billing/enterprise-contact
 * Submit enterprise contact form
 * Public endpoint - no auth required
 */
router.post('/enterprise-contact', submitEnterpriseContact);

export default router;
