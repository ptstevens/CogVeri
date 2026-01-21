import Stripe from 'stripe';
import {
  stripe,
  STRIPE_WEBHOOK_SECRET,
  TRIAL_PERIOD_DAYS,
  getPriceIdByTier,
  getTierByPriceId,
  isStripeEnabled,
} from '../../config/stripe';
import { ServiceUnavailableError } from '../../utils/AppError';

/**
 * Shared Stripe client utilities
 *
 * Provides the initialized Stripe client and configuration constants
 * used across all stripe service modules.
 */

/**
 * Get the Stripe client, throwing if not configured
 */
export function getStripeClient(): Stripe {
  if (!isStripeEnabled() || !stripe) {
    throw new ServiceUnavailableError('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  }
  return stripe;
}

// Re-export commonly used items for convenience
export {
  stripe,
  STRIPE_WEBHOOK_SECRET,
  TRIAL_PERIOD_DAYS,
  getPriceIdByTier,
  getTierByPriceId,
  isStripeEnabled,
};

// Re-export Stripe types that are commonly used
export { Stripe };
