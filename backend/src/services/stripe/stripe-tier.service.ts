import Stripe from 'stripe';
import { getStripeClient, isStripeEnabled } from './stripe-client';
import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { tierAuditService } from '../tier-audit.service';

interface TierPriceInfo {
  productId: string;
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
}

interface SyncResult {
  synced: boolean;
  productId: string | null;
  priceIdMonthly: string | null;
  priceIdYearly: string | null;
  changes: string[];
  errors: string[];
}

/**
 * Stripe Tier Service
 *
 * Manages Stripe Products and Prices for pricing tiers.
 * Handles auto-sync when tiers are created, updated, or archived.
 */
class StripeTierService {
  /**
   * Create a Stripe Product and Prices for a new tier
   */
  async createStripeProductAndPrices(tier: {
    name: string;
    displayName: string;
    description?: string;
    monthlyPrice: number; // in cents
    yearlyPrice: number; // in cents
  }): Promise<TierPriceInfo> {
    if (!isStripeEnabled()) {
      logger.warn('Stripe not enabled, skipping product creation');
      return {
        productId: '',
        monthlyPriceId: null,
        yearlyPriceId: null,
      };
    }

    const stripe = getStripeClient();

    try {
      logger.info(`Creating Stripe product for tier: ${tier.name}`);

      // Create the product
      const product = await stripe.products.create({
        name: tier.displayName,
        description: tier.description || `${tier.displayName} subscription plan`,
        metadata: {
          tier_name: tier.name,
          created_by: 'cogveri_admin',
        },
      });

      let monthlyPriceId: string | null = null;
      let yearlyPriceId: string | null = null;

      // Create monthly price if > 0
      if (tier.monthlyPrice > 0) {
        const monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: tier.monthlyPrice,
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
          metadata: {
            tier_name: tier.name,
            interval: 'monthly',
          },
        });
        monthlyPriceId = monthlyPrice.id;
      }

      // Create yearly price if > 0
      if (tier.yearlyPrice > 0) {
        const yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: tier.yearlyPrice,
          currency: 'usd',
          recurring: {
            interval: 'year',
          },
          metadata: {
            tier_name: tier.name,
            interval: 'yearly',
          },
        });
        yearlyPriceId = yearlyPrice.id;
      }

      logger.info(`Stripe product created: ${product.id} for tier: ${tier.name}`, {
        productId: product.id,
        monthlyPriceId,
        yearlyPriceId,
      });

      return {
        productId: product.id,
        monthlyPriceId,
        yearlyPriceId,
      };
    } catch (error) {
      logger.error(`Error creating Stripe product for tier ${tier.name}:`, error);
      throw error;
    }
  }

  /**
   * Create a new price for an existing product
   * Used when price changes (Stripe prices are immutable)
   */
  async createNewPrice(
    productId: string,
    amount: number, // in cents
    interval: 'month' | 'year',
    tierName: string,
    archiveOldPriceId?: string
  ): Promise<string> {
    if (!isStripeEnabled()) {
      throw new Error('Stripe not enabled');
    }

    const stripe = getStripeClient();

    try {
      // Create new price
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: amount,
        currency: 'usd',
        recurring: {
          interval,
        },
        metadata: {
          tier_name: tierName,
          interval: interval === 'month' ? 'monthly' : 'yearly',
        },
      });

      // Archive old price if provided
      if (archiveOldPriceId) {
        await this.archivePrice(archiveOldPriceId);
      }

      logger.info(`New Stripe price created: ${price.id}`, {
        productId,
        priceId: price.id,
        amount,
        interval,
      });

      return price.id;
    } catch (error) {
      logger.error('Error creating new Stripe price:', error);
      throw error;
    }
  }

  /**
   * Archive a Stripe price
   */
  async archivePrice(priceId: string): Promise<void> {
    if (!isStripeEnabled() || !priceId) {
      return;
    }

    const stripe = getStripeClient();

    try {
      await stripe.prices.update(priceId, { active: false });
      logger.info(`Stripe price archived: ${priceId}`);
    } catch (error) {
      logger.error(`Error archiving Stripe price ${priceId}:`, error);
      // Don't throw - archive is best effort
    }
  }

  /**
   * Archive a Stripe product and its prices
   */
  async archiveProduct(productId: string): Promise<void> {
    if (!isStripeEnabled() || !productId) {
      return;
    }

    const stripe = getStripeClient();

    try {
      // Archive the product (makes it invisible in Stripe dashboard)
      await stripe.products.update(productId, { active: false });
      logger.info(`Stripe product archived: ${productId}`);
    } catch (error) {
      logger.error(`Error archiving Stripe product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Reactivate an archived Stripe product
   */
  async reactivateProduct(productId: string): Promise<void> {
    if (!isStripeEnabled() || !productId) {
      return;
    }

    const stripe = getStripeClient();

    try {
      await stripe.products.update(productId, { active: true });
      logger.info(`Stripe product reactivated: ${productId}`);
    } catch (error) {
      logger.error(`Error reactivating Stripe product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Get Stripe product details
   */
  async getStripeProduct(productId: string): Promise<Stripe.Product | null> {
    if (!isStripeEnabled() || !productId) {
      return null;
    }

    const stripe = getStripeClient();

    try {
      const product = await stripe.products.retrieve(productId);
      return product;
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Sync a single tier to Stripe
   * Creates product/prices if missing, updates if needed
   */
  async syncTierToStripe(tierName: string, actorId?: string): Promise<SyncResult> {
    const result: SyncResult = {
      synced: false,
      productId: null,
      priceIdMonthly: null,
      priceIdYearly: null,
      changes: [],
      errors: [],
    };

    if (!isStripeEnabled()) {
      result.errors.push('Stripe not enabled');
      return result;
    }

    try {
      // Get tier from database
      const tier = await db('pricing_tiers').where('name', tierName).first();

      if (!tier) {
        result.errors.push(`Tier "${tierName}" not found`);
        return result;
      }

      // Skip free tier or already archived tiers
      if (tier.monthly_price === 0 && tier.yearly_price === 0) {
        result.synced = true;
        result.changes.push('Free tier - no Stripe product needed');
        return result;
      }

      const stripe = getStripeClient();

      // Check if product exists
      let productId = tier.stripe_product_id;
      let product: Stripe.Product | null = null;

      if (productId) {
        product = await this.getStripeProduct(productId);
      }

      // Create product if missing
      if (!product) {
        const newProduct = await stripe.products.create({
          name: tier.display_name,
          description: tier.description || `${tier.display_name} subscription plan`,
          metadata: {
            tier_name: tier.name,
            created_by: 'cogveri_admin',
          },
        });
        productId = newProduct.id;
        result.changes.push(`Created Stripe product: ${productId}`);
      }

      result.productId = productId;

      // Check/create monthly price
      if (tier.monthly_price > 0) {
        if (!tier.stripe_price_id_monthly) {
          const monthlyPrice = await stripe.prices.create({
            product: productId!,
            unit_amount: tier.monthly_price,
            currency: 'usd',
            recurring: { interval: 'month' },
            metadata: { tier_name: tier.name, interval: 'monthly' },
          });
          result.priceIdMonthly = monthlyPrice.id;
          result.changes.push(`Created monthly price: ${monthlyPrice.id}`);
        } else {
          result.priceIdMonthly = tier.stripe_price_id_monthly;
        }
      }

      // Check/create yearly price
      if (tier.yearly_price > 0) {
        if (!tier.stripe_price_id_yearly) {
          const yearlyPrice = await stripe.prices.create({
            product: productId!,
            unit_amount: tier.yearly_price,
            currency: 'usd',
            recurring: { interval: 'year' },
            metadata: { tier_name: tier.name, interval: 'yearly' },
          });
          result.priceIdYearly = yearlyPrice.id;
          result.changes.push(`Created yearly price: ${yearlyPrice.id}`);
        } else {
          result.priceIdYearly = tier.stripe_price_id_yearly;
        }
      }

      // Update database with Stripe IDs if changed
      if (result.changes.length > 0) {
        await db('pricing_tiers').where('name', tierName).update({
          stripe_product_id: result.productId,
          stripe_price_id_monthly: result.priceIdMonthly,
          stripe_price_id_yearly: result.priceIdYearly,
          updated_at: new Date(),
        });

        // Log audit
        await tierAuditService.logTierAction({
          tierName,
          action: 'stripe_synced',
          actorId,
          stripeDetails: {
            productId: result.productId || undefined,
            priceIdMonthly: result.priceIdMonthly || undefined,
            priceIdYearly: result.priceIdYearly || undefined,
          },
        });
      }

      result.synced = true;
      return result;
    } catch (error) {
      logger.error(`Error syncing tier ${tierName} to Stripe:`, error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Sync all active tiers to Stripe
   */
  async syncAllTiersToStripe(actorId?: string): Promise<{
    total: number;
    synced: number;
    errors: Array<{ tier: string; error: string }>;
    details: Array<{ tier: string; changes: string[] }>;
  }> {
    const result = {
      total: 0,
      synced: 0,
      errors: [] as Array<{ tier: string; error: string }>,
      details: [] as Array<{ tier: string; changes: string[] }>,
    };

    try {
      // Get all active, non-free tiers
      const tiers = await db('pricing_tiers')
        .where('is_active', true)
        .where(function (this: ReturnType<typeof db>) {
          this.where('monthly_price', '>', 0).orWhere('yearly_price', '>', 0);
        })
        .select('name');

      result.total = tiers.length;

      for (const tier of tiers) {
        const syncResult = await this.syncTierToStripe(tier.name, actorId);

        if (syncResult.synced) {
          result.synced++;
          if (syncResult.changes.length > 0) {
            result.details.push({
              tier: tier.name,
              changes: syncResult.changes,
            });
          }
        } else {
          result.errors.push({
            tier: tier.name,
            error: syncResult.errors.join(', '),
          });
        }
      }

      logger.info('Stripe sync completed', {
        total: result.total,
        synced: result.synced,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error('Error syncing all tiers to Stripe:', error);
      throw error;
    }
  }

  /**
   * Handle price change for a tier
   * Creates new prices and archives old ones
   */
  async handlePriceChange(
    tierName: string,
    newMonthlyPrice: number,
    newYearlyPrice: number,
    actorId?: string
  ): Promise<{
    monthlyPriceId: string | null;
    yearlyPriceId: string | null;
  }> {
    if (!isStripeEnabled()) {
      return { monthlyPriceId: null, yearlyPriceId: null };
    }

    const tier = await db('pricing_tiers').where('name', tierName).first();

    if (!tier || !tier.stripe_product_id) {
      throw new Error(`Tier "${tierName}" not found or has no Stripe product`);
    }

    let monthlyPriceId = tier.stripe_price_id_monthly;
    let yearlyPriceId = tier.stripe_price_id_yearly;
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    // Handle monthly price change
    if (newMonthlyPrice !== tier.monthly_price) {
      if (newMonthlyPrice > 0) {
        monthlyPriceId = await this.createNewPrice(
          tier.stripe_product_id,
          newMonthlyPrice,
          'month',
          tierName,
          tier.stripe_price_id_monthly
        );
        changes.monthlyPrice = {
          from: tier.monthly_price,
          to: newMonthlyPrice,
        };
      } else if (tier.stripe_price_id_monthly) {
        // Archive the price if new price is 0
        await this.archivePrice(tier.stripe_price_id_monthly);
        monthlyPriceId = null;
        changes.monthlyPrice = {
          from: tier.monthly_price,
          to: 0,
        };
      }
    }

    // Handle yearly price change
    if (newYearlyPrice !== tier.yearly_price) {
      if (newYearlyPrice > 0) {
        yearlyPriceId = await this.createNewPrice(
          tier.stripe_product_id,
          newYearlyPrice,
          'year',
          tierName,
          tier.stripe_price_id_yearly
        );
        changes.yearlyPrice = {
          from: tier.yearly_price,
          to: newYearlyPrice,
        };
      } else if (tier.stripe_price_id_yearly) {
        await this.archivePrice(tier.stripe_price_id_yearly);
        yearlyPriceId = null;
        changes.yearlyPrice = {
          from: tier.yearly_price,
          to: 0,
        };
      }
    }

    // Log audit if there were changes
    if (Object.keys(changes).length > 0) {
      await tierAuditService.logTierAction({
        tierName,
        action: 'price_changed',
        actorId,
        changes,
        stripeDetails: {
          productId: tier.stripe_product_id,
          priceIdMonthly: monthlyPriceId || undefined,
          priceIdYearly: yearlyPriceId || undefined,
        },
      });
    }

    return { monthlyPriceId, yearlyPriceId };
  }
}

export const stripeTierService = new StripeTierService();
export default stripeTierService;
