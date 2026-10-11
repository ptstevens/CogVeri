import { getPriceIdByTier, getTierByPriceId } from './stripe-client';

/**
 * Stripe Pricing Service
 *
 * Handles price and product management utilities:
 * - Mapping tier names to price IDs
 * - Mapping price IDs back to tier info
 */
class StripePricingService {
  /**
   * Get price by tier name
   * @param tierName - Tier name (pro, team, business)
   * @param interval - Billing interval (monthly, yearly)
   */
  getPriceIdForTier(tierName: string, interval: 'monthly' | 'yearly' = 'monthly'): string | null {
    return getPriceIdByTier(tierName, interval);
  }

  /**
   * Get tier info from price ID
   * @param priceId - Stripe price ID
   */
  getTierFromPriceId(priceId: string): { tier: string; interval: 'monthly' | 'yearly' } | null {
    return getTierByPriceId(priceId);
  }
}

export const stripePricingService = new StripePricingService();
export default stripePricingService;
