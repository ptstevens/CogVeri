/**
 * Stripe Service (Re-export for backwards compatibility)
 *
 * This file is maintained for backwards compatibility.
 * New code should import directly from './stripe' directory.
 *
 * @example
 * // Legacy (still works)
 * import { stripeService } from './stripe.service';
 *
 * // Recommended for new code
 * import { stripeService } from './stripe';
 * // Or import specific services
 * import { stripeCustomerService, stripeSubscriptionService } from './stripe';
 */

export {
  stripeService,
  stripeCustomerService,
  stripeSubscriptionService,
  stripePaymentService,
  stripeInvoiceService,
  stripeWebhookService,
  stripePricingService,
  getStripeClient,
  stripe,
  STRIPE_WEBHOOK_SECRET,
  TRIAL_PERIOD_DAYS,
  getPriceIdByTier,
  getTierByPriceId,
  isStripeEnabled,
  Stripe,
} from './stripe';

export { stripeService as default } from './stripe';
