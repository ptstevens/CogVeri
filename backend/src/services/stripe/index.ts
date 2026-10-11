import Stripe from 'stripe';
import { stripeCustomerService } from './stripe-customer.service';
import { stripeSubscriptionService } from './stripe-subscription.service';
import { stripePaymentService } from './stripe-payment.service';
import { stripeInvoiceService } from './stripe-invoice.service';
import { stripeWebhookService } from './stripe-webhook.service';
import { stripePricingService } from './stripe-pricing.service';

/**
 * Stripe Service (Facade)
 *
 * This class provides backwards compatibility by delegating to the
 * individual service modules. New code should import the specific
 * services directly for better tree-shaking and clearer dependencies.
 *
 * @example
 * // Legacy usage (still supported)
 * import { stripeService } from './services/stripe';
 * await stripeService.createCustomer(...);
 *
 * // Recommended usage for new code
 * import { stripeCustomerService } from './services/stripe';
 * await stripeCustomerService.createCustomer(...);
 */
class StripeService {
  // ============================================================
  // CUSTOMER METHODS
  // ============================================================

  /**
   * Create a Stripe customer for an organization
   */
  async createCustomer(
    organizationId: string,
    email: string,
    name: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Customer> {
    return stripeCustomerService.createCustomer(organizationId, email, name, metadata);
  }

  /**
   * Get customer details from Stripe
   */
  async getCustomer(stripeCustomerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return stripeCustomerService.getCustomer(stripeCustomerId);
  }

  /**
   * Update customer details
   */
  async updateCustomer(
    stripeCustomerId: string,
    updates: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    return stripeCustomerService.updateCustomer(stripeCustomerId, updates);
  }

  // ============================================================
  // SUBSCRIPTION METHODS
  // ============================================================

  /**
   * Create a Checkout Session for new subscriptions
   */
  async createCheckoutSession(
    organizationId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    customerId?: string,
    trialDays?: number
  ): Promise<Stripe.Checkout.Session> {
    return stripeSubscriptionService.createCheckoutSession(
      organizationId,
      priceId,
      successUrl,
      cancelUrl,
      customerId,
      trialDays
    );
  }

  /**
   * Create a Billing Portal session for customer self-service
   */
  async createBillingPortalSession(
    stripeCustomerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    return stripeSubscriptionService.createBillingPortalSession(stripeCustomerId, returnUrl);
  }

  /**
   * Create a subscription directly (without checkout)
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    trialDays?: number,
    metadata?: Record<string, string>
  ): Promise<Stripe.Subscription> {
    return stripeSubscriptionService.createSubscription(customerId, priceId, trialDays, metadata);
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return stripeSubscriptionService.getSubscription(subscriptionId);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<Stripe.Subscription> {
    return stripeSubscriptionService.cancelSubscription(subscriptionId, immediately);
  }

  /**
   * Update subscription to a new price/plan
   */
  async updateSubscription(
    subscriptionId: string,
    newPriceId: string,
    prorationBehavior: 'create_prorations' | 'none' | 'always_invoice' = 'create_prorations'
  ): Promise<Stripe.Subscription> {
    return stripeSubscriptionService.updateSubscription(
      subscriptionId,
      newPriceId,
      prorationBehavior
    );
  }

  /**
   * Reactivate a canceled subscription (before period end)
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return stripeSubscriptionService.reactivateSubscription(subscriptionId);
  }

  /**
   * Create an enterprise subscription with custom pricing
   */
  async createEnterpriseSubscription(
    customerId: string,
    options: {
      amount: number;
      interval: 'month' | 'year';
      description: string;
      metadata?: Record<string, string>;
      trialDays?: number;
    }
  ): Promise<Stripe.Subscription> {
    return stripeSubscriptionService.createEnterpriseSubscription(customerId, options);
  }

  // ============================================================
  // PAYMENT METHOD METHODS
  // ============================================================

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
    setAsDefault: boolean = true
  ): Promise<Stripe.PaymentMethod> {
    return stripePaymentService.attachPaymentMethod(paymentMethodId, customerId, setAsDefault);
  }

  /**
   * Detach a payment method from a customer
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return stripePaymentService.detachPaymentMethod(paymentMethodId);
  }

  /**
   * List payment methods for a customer
   */
  async listPaymentMethods(
    customerId: string,
    type: 'card' | 'us_bank_account' = 'card'
  ): Promise<Stripe.PaymentMethod[]> {
    return stripePaymentService.listPaymentMethods(customerId, type);
  }

  /**
   * Create a setup intent for collecting payment details
   */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    return stripePaymentService.createSetupIntent(customerId);
  }

  // ============================================================
  // INVOICE METHODS
  // ============================================================

  /**
   * List invoices for a customer
   */
  async listInvoices(customerId: string, limit: number = 10): Promise<Stripe.Invoice[]> {
    return stripeInvoiceService.listInvoices(customerId, limit);
  }

  /**
   * Get upcoming invoice for a customer
   */
  async getUpcomingInvoice(
    customerId: string,
    subscriptionId?: string
  ): Promise<Stripe.Invoice | null> {
    return stripeInvoiceService.getUpcomingInvoice(customerId, subscriptionId);
  }

  /**
   * Get a specific invoice
   */
  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return stripeInvoiceService.getInvoice(invoiceId);
  }

  /**
   * Preview invoice for a subscription update
   */
  async previewSubscriptionUpdate(
    customerId: string,
    subscriptionId: string,
    newPriceId: string
  ): Promise<Stripe.Invoice> {
    return stripeInvoiceService.previewSubscriptionUpdate(customerId, subscriptionId, newPriceId);
  }

  /**
   * Retry a failed invoice payment
   */
  async retryInvoicePayment(invoiceId: string): Promise<Stripe.Invoice> {
    return stripeInvoiceService.retryInvoicePayment(invoiceId);
  }

  /**
   * Create an enterprise invoice for custom pricing
   */
  async createEnterpriseInvoice(
    customerId: string,
    options: {
      description: string;
      amount: number;
      quantity?: number;
      daysUntilDue?: number;
      metadata?: Record<string, string>;
      autoSend?: boolean;
      contractMonths?: number;
    }
  ): Promise<Stripe.Invoice> {
    return stripeInvoiceService.createEnterpriseInvoice(customerId, options);
  }

  /**
   * Void/cancel an unpaid invoice
   */
  async voidInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return stripeInvoiceService.voidInvoice(invoiceId);
  }

  /**
   * Mark invoice as paid (for manual/offline payments)
   */
  async markInvoicePaid(invoiceId: string): Promise<Stripe.Invoice> {
    return stripeInvoiceService.markInvoicePaid(invoiceId);
  }

  // ============================================================
  // WEBHOOK METHODS
  // ============================================================

  /**
   * Verify a Stripe webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    return stripeWebhookService.verifyWebhookSignature(payload, signature);
  }

  // ============================================================
  // PRICING METHODS
  // ============================================================

  /**
   * Get price by tier name
   */
  getPriceIdForTier(tierName: string, interval: 'monthly' | 'yearly' = 'monthly'): string | null {
    return stripePricingService.getPriceIdForTier(tierName, interval);
  }

  /**
   * Get tier info from price ID
   */
  getTierFromPriceId(priceId: string): { tier: string; interval: 'monthly' | 'yearly' } | null {
    return stripePricingService.getTierFromPriceId(priceId);
  }
}

// Create singleton instance for backwards compatibility
export const stripeService = new StripeService();
export default stripeService;

// Export individual services for new code
export { stripeCustomerService } from './stripe-customer.service';
export { stripeSubscriptionService } from './stripe-subscription.service';
export { stripePaymentService } from './stripe-payment.service';
export { stripeInvoiceService } from './stripe-invoice.service';
export { stripeWebhookService } from './stripe-webhook.service';
export { stripePricingService } from './stripe-pricing.service';
export { stripeTierService } from './stripe-tier.service';

// Re-export client utilities
export {
  getStripeClient,
  stripe,
  STRIPE_WEBHOOK_SECRET,
  TRIAL_PERIOD_DAYS,
  getPriceIdByTier,
  getTierByPriceId,
  isStripeEnabled,
  Stripe,
} from './stripe-client';
