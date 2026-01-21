import Stripe from 'stripe';
import { logger } from '../utils/logger';

/**
 * Stripe Configuration
 *
 * Initializes the Stripe SDK and exports price IDs for each tier.
 *
 * Environment Variables Required:
 * - STRIPE_SECRET_KEY: Stripe secret key (sk_live_... or sk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret (whsec_...)
 * - STRIPE_PRICE_TEAM_MONTHLY: Price ID for Team monthly ($25/mo)
 * - STRIPE_PRICE_TEAM_YEARLY: Price ID for Team yearly ($240/yr)
 * - STRIPE_PRICE_PRO_MONTHLY: Price ID for Pro monthly ($65/mo)
 * - STRIPE_PRICE_PRO_YEARLY: Price ID for Pro yearly ($624/yr)
 * - STRIPE_PRICE_BUSINESS_MONTHLY: Price ID for Business monthly ($125/mo)
 * - STRIPE_PRICE_BUSINESS_YEARLY: Price ID for Business yearly ($1200/yr)
 */

// Validate required environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  logger.warn('STRIPE_SECRET_KEY is not set - billing features will be disabled');
}

// Initialize Stripe client
export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
      appInfo: {
        name: 'CogVeri',
        version: '1.0.0',
      },
    })
  : null;

// Webhook secret for verifying Stripe webhooks
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Trial period configuration
export const TRIAL_PERIOD_DAYS = 14;

// Grace period for failed payments before subscription is suspended
export const GRACE_PERIOD_DAYS = 7;

/**
 * Stripe Price IDs for each tier
 * These should be configured in Stripe Dashboard and set via environment variables
 */
export interface TierPriceIds {
  monthly: string | null;
  yearly: string | null;
}

export interface StripePriceConfig {
  free: TierPriceIds;
  team: TierPriceIds;
  pro: TierPriceIds;
  business: TierPriceIds;
  enterprise: TierPriceIds;
}

export const STRIPE_PRICE_IDS: StripePriceConfig = {
  free: {
    monthly: null, // Free tier has no price
    yearly: null,
  },
  team: {
    monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || null,
    yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || null,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || null,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || null,
  },
  business: {
    monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || null,
    yearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY || null,
  },
  enterprise: {
    monthly: null, // Enterprise has custom pricing
    yearly: null,
  },
};

/**
 * Map of price IDs back to tier names
 * Used when processing webhook events
 */
export const PRICE_ID_TO_TIER: Map<string, { tier: string; interval: 'monthly' | 'yearly' }> = new Map();

// Populate the reverse mapping
Object.entries(STRIPE_PRICE_IDS).forEach(([tierName, prices]) => {
  if (prices.monthly) {
    PRICE_ID_TO_TIER.set(prices.monthly, { tier: tierName, interval: 'monthly' });
  }
  if (prices.yearly) {
    PRICE_ID_TO_TIER.set(prices.yearly, { tier: tierName, interval: 'yearly' });
  }
});

/**
 * Get price ID for a given tier name and billing interval
 * @param tierName - The tier name (team, pro, business)
 * @param interval - Billing interval (monthly or yearly)
 * @returns Price ID or null if not configured
 */
export function getPriceIdByTier(
  tierName: string,
  interval: 'monthly' | 'yearly' = 'monthly'
): string | null {
  const normalizedTier = tierName.toLowerCase();
  const tierPrices = STRIPE_PRICE_IDS[normalizedTier as keyof StripePriceConfig];

  if (!tierPrices) {
    logger.warn(`No price configuration found for tier: ${tierName}`);
    return null;
  }

  return tierPrices[interval];
}

/**
 * Get tier name from a Stripe price ID
 * @param priceId - Stripe price ID
 * @returns Tier info or null if not found
 */
export function getTierByPriceId(priceId: string): { tier: string; interval: 'monthly' | 'yearly' } | null {
  return PRICE_ID_TO_TIER.get(priceId) || null;
}

/**
 * Check if a tier requires payment (not free)
 * @param tierName - The tier name
 * @returns true if the tier requires payment
 */
export function isPaidTier(tierName: string): boolean {
  const normalizedTier = tierName.toLowerCase();
  return normalizedTier !== 'free' && normalizedTier !== 'enterprise';
}

/**
 * Get all configured price IDs for a tier
 * @param tierName - The tier name
 * @returns Object with monthly and yearly price IDs
 */
export function getTierPrices(tierName: string): TierPriceIds {
  const normalizedTier = tierName.toLowerCase();
  return STRIPE_PRICE_IDS[normalizedTier as keyof StripePriceConfig] || { monthly: null, yearly: null };
}

/**
 * Validate that required Stripe configuration is present
 * @returns Object with validation status and missing configs
 */
export function validateStripeConfig(): {
  valid: boolean;
  stripeEnabled: boolean;
  missingConfigs: string[];
} {
  const missingConfigs: string[] = [];

  if (!STRIPE_SECRET_KEY) {
    missingConfigs.push('STRIPE_SECRET_KEY');
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    missingConfigs.push('STRIPE_WEBHOOK_SECRET');
  }

  // Note: Paid tier price IDs are now configured dynamically via admin panel
  // No default paid tiers to validate - enterprise is "Contact Sales"

  return {
    valid: missingConfigs.length === 0,
    stripeEnabled: !!STRIPE_SECRET_KEY,
    missingConfigs,
  };
}

/**
 * Check if Stripe is enabled and configured
 */
export function isStripeEnabled(): boolean {
  return stripe !== null;
}

// Log configuration status on module load
const config = validateStripeConfig();
if (!config.stripeEnabled) {
  logger.warn('Stripe is not enabled - billing features will be unavailable');
} else if (!config.valid) {
  logger.warn('Stripe configuration incomplete. Missing:', { missingConfigs: config.missingConfigs });
} else {
  logger.info('Stripe configuration validated successfully');
}

export default stripe;
