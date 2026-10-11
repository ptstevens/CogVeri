import Stripe from 'stripe';

/**
 * Stripe Helper Utilities
 *
 * Provides consistent helper functions for working with Stripe objects.
 * These utilities should be used across all billing-related code to ensure
 * consistent behavior.
 */

/**
 * Extract current period from Stripe subscription
 * Handles different Stripe API versions where period info may be in different locations
 *
 * @param subscription - Stripe subscription object
 * @returns Object with currentPeriodStart and currentPeriodEnd timestamps (unix seconds)
 */
export function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  currentPeriodStart: number;
  currentPeriodEnd: number;
} {
  // In newer Stripe API versions (2022+), period is on subscription items
  const firstItem = subscription.items?.data?.[0];

  if (firstItem?.current_period_start && firstItem?.current_period_end) {
    return {
      currentPeriodStart: firstItem.current_period_start,
      currentPeriodEnd: firstItem.current_period_end,
    };
  }

  // Fallback for older API or edge cases
  const startDate = subscription.start_date || Math.floor(Date.now() / 1000);

  // Use cancel_at if available, otherwise estimate based on billing interval
  let endDate = subscription.cancel_at;

  if (!endDate) {
    // Estimate based on billing interval
    const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
    const intervalCount = subscription.items?.data?.[0]?.price?.recurring?.interval_count || 1;

    let secondsToAdd: number;
    switch (interval) {
      case 'day':
        secondsToAdd = 86400 * intervalCount;
        break;
      case 'week':
        secondsToAdd = 604800 * intervalCount;
        break;
      case 'month':
        secondsToAdd = 2592000 * intervalCount; // ~30 days
        break;
      case 'year':
        secondsToAdd = 31536000 * intervalCount; // 365 days
        break;
      default:
        secondsToAdd = 2592000; // Default to 30 days
    }

    endDate = startDate + secondsToAdd;
  }

  return {
    currentPeriodStart: startDate,
    currentPeriodEnd: endDate,
  };
}

/**
 * Get subscription ID from invoice
 * Handles different Stripe API versions where subscription may be in different locations
 *
 * @param invoice - Stripe invoice object
 * @returns Subscription ID or null if not found
 */
export function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // New API structure (2024+): parent.subscription_details.subscription
  if (invoice.parent?.subscription_details?.subscription) {
    const sub = invoice.parent.subscription_details.subscription;
    return typeof sub === 'string' ? sub : sub?.id || null;
  }

  // Fallback: Check lines for subscription reference
  const firstLine = invoice.lines?.data?.[0];
  if (firstLine?.subscription) {
    return typeof firstLine.subscription === 'string'
      ? firstLine.subscription
      : firstLine.subscription?.id || null;
  }

  // Legacy fallback: Direct subscription field (deprecated in newer API)
  // @ts-ignore - subscription field may not exist in newer types
  if (invoice.subscription) {
    // @ts-ignore
    return typeof invoice.subscription === 'string'
      ? // @ts-ignore
        invoice.subscription
      : // @ts-ignore
        invoice.subscription?.id || null;
  }

  return null;
}

/**
 * Extract customer ID from various Stripe objects
 * Handles both string IDs and expanded customer objects
 *
 * @param customerField - Customer field from Stripe object (string or Customer)
 * @returns Customer ID string or null
 */
export function getCustomerId(
  customerField: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customerField) {
    return null;
  }

  if (typeof customerField === 'string') {
    return customerField;
  }

  return customerField.id || null;
}

/**
 * Extract price ID from subscription
 *
 * @param subscription - Stripe subscription object
 * @returns Price ID or null
 */
export function getPriceIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id || null;
}

/**
 * Get billing interval from subscription
 *
 * @param subscription - Stripe subscription object
 * @returns Billing interval ('monthly' | 'yearly') or null
 */
export function getBillingInterval(subscription: Stripe.Subscription): 'monthly' | 'yearly' | null {
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  const intervalCount = subscription.items?.data?.[0]?.price?.recurring?.interval_count || 1;

  if (interval === 'month' && intervalCount === 1) {
    return 'monthly';
  }

  if (interval === 'year' && intervalCount === 1) {
    return 'yearly';
  }

  // Handle quarterly, semi-annual, etc. as custom
  return null;
}

/**
 * Check if a subscription is in a terminal state
 *
 * @param status - Stripe subscription status
 * @returns true if subscription is in a terminal state
 */
export function isTerminalSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return ['canceled', 'incomplete_expired'].includes(status);
}

/**
 * Check if a subscription requires action
 *
 * @param status - Stripe subscription status
 * @returns true if subscription needs attention
 */
export function subscriptionNeedsAttention(status: Stripe.Subscription.Status): boolean {
  return ['past_due', 'incomplete', 'unpaid'].includes(status);
}

/**
 * Format amount for display
 *
 * @param amount - Amount in cents
 * @param currency - Currency code (e.g., 'usd')
 * @returns Formatted amount string
 */
export function formatAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  return formatter.format(amount / 100);
}

/**
 * Convert Unix timestamp to Date
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Date object or null
 */
export function unixToDate(timestamp: number | null | undefined): Date | null {
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp * 1000);
}

/**
 * Convert Date to Unix timestamp
 *
 * @param date - Date object
 * @returns Unix timestamp in seconds
 */
export function dateToUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
