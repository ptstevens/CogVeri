import api from './api';

/**
 * Billing API client for Stripe integration
 */

// Types
export interface Subscription {
  id: string;
  status:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'canceled'
    | 'incomplete'
    | 'incomplete_expired'
    | 'unpaid';
  tier: 'free' | 'enterprise' | string; // string allows custom tiers added via admin
  tierDisplayName: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  nextInvoiceAmount: number | null;
  currency: string;
}

export interface UsageMetric {
  feature: string;
  label: string;
  current: number;
  limit: number;
  unit: string;
  percentageUsed: number;
}

export interface Usage {
  organizationId: string;
  tier: string;
  metrics: UsageMetric[];
  warningThreshold: number;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'draft' | 'uncollectible' | 'void';
  pdfUrl: string | null;
  hostedInvoiceUrl: string | null;
}

export interface PaymentMethod {
  id: string;
  type: 'card';
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface PricingTier {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  limits: {
    maxMembers: number;
    maxStorageGb: number;
    maxTasksPerMonth: number;
    maxVideosPerMonth: number;
    maxVideoLengthMinutes: number;
    maxExternalContributors: number;
    maxWorkspaces: number;
  };
  features: Record<string, boolean>;
  highlighted: boolean;
  ctaText: string;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface PortalSession {
  url: string;
}

export interface BillingContact {
  billingContact: {
    email: string;
    name: string;
  };
  subscriber: {
    id: string;
    email: string;
    name: string;
  };
  isDifferentFromSubscriber: boolean;
}

// API Functions
export const billingApi = {
  /**
   * Get the current subscription for the organization
   */
  getSubscription: async (): Promise<Subscription> => {
    const response = await api.get('/billing/subscription');
    return response.data.data;
  },

  /**
   * Get current usage stats for the organization
   */
  getUsage: async (): Promise<Usage> => {
    const response = await api.get('/billing/usage');
    return response.data.data;
  },

  /**
   * Get invoice history
   */
  getInvoices: async (
    limit = 12,
    startingAfter?: string
  ): Promise<{ invoices: Invoice[]; hasMore: boolean }> => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (startingAfter) {
      params.append('starting_after', startingAfter);
    }
    const response = await api.get(`/billing/invoices?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Get saved payment methods
   */
  getPaymentMethods: async (): Promise<PaymentMethod[]> => {
    const response = await api.get('/billing/payment-methods');
    return response.data.data;
  },

  /**
   * Get all pricing tiers
   */
  getPricingTiers: async (): Promise<PricingTier[]> => {
    const response = await api.get('/billing/tiers');
    return response.data.data.tiers;
  },

  /**
   * Create a checkout session for a new subscription
   * Accepts either priceId or tierName
   */
  createCheckout: async (params: {
    priceId?: string;
    tierName?: string;
    isAnnual?: boolean;
  }): Promise<CheckoutSession> => {
    const response = await api.post('/billing/checkout', params);
    return response.data.data;
  },

  /**
   * Create a Stripe billing portal session
   */
  createPortalSession: async (): Promise<PortalSession> => {
    const response = await api.post('/billing/portal');
    return response.data.data;
  },

  /**
   * Update subscription to a new tier
   */
  updateSubscription: async (tierName: string, isAnnual?: boolean): Promise<Subscription> => {
    const response = await api.patch('/billing/subscription', { tierName, isAnnual });
    return response.data.data;
  },

  /**
   * Cancel the current subscription
   */
  cancelSubscription: async (immediately = false): Promise<Subscription> => {
    const response = await api.delete('/billing/subscription', { data: { immediately } });
    return response.data.data;
  },

  /**
   * Reactivate a canceled subscription
   */
  reactivateSubscription: async (): Promise<Subscription> => {
    const response = await api.post('/billing/subscription/reactivate');
    return response.data.data;
  },

  /**
   * Sync subscription data from Stripe
   * Useful when tier/features don't match after upgrade
   */
  syncSubscription: async (): Promise<{ synced: boolean; message: string; tier: string }> => {
    const response = await api.post('/billing/sync');
    return response.data.data;
  },

  /**
   * Add a new payment method
   */
  addPaymentMethod: async (paymentMethodId: string): Promise<PaymentMethod> => {
    const response = await api.post('/billing/payment-methods', { paymentMethodId });
    return response.data.data;
  },

  /**
   * Remove a payment method
   */
  removePaymentMethod: async (paymentMethodId: string): Promise<void> => {
    await api.delete(`/billing/payment-methods/${paymentMethodId}`);
  },

  /**
   * Set a payment method as default
   */
  setDefaultPaymentMethod: async (paymentMethodId: string): Promise<PaymentMethod> => {
    const response = await api.patch(`/billing/payment-methods/${paymentMethodId}/default`);
    return response.data.data;
  },

  /**
   * Submit enterprise contact form
   */
  submitEnterpriseContact: async (data: {
    companyName: string;
    name: string;
    email: string;
    phone?: string;
    companySize: string;
    message: string;
  }): Promise<void> => {
    await api.post('/billing/enterprise-contact', data);
  },

  /**
   * Get billing contact for the organization
   */
  getBillingContact: async (): Promise<BillingContact> => {
    const response = await api.get('/billing/contact');
    return response.data.data;
  },

  /**
   * Update billing contact for the organization
   */
  updateBillingContact: async (data: {
    billingEmail: string;
    billingName: string;
  }): Promise<BillingContact> => {
    const response = await api.patch('/billing/contact', data);
    return response.data.data;
  },
};

export default billingApi;
