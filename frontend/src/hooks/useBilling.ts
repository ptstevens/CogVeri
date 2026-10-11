import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  billingApi,
  Subscription,
  Usage,
  Invoice,
  PaymentMethod,
  PricingTier,
  BillingContact,
} from '../services/billing.api';
import toast from 'react-hot-toast';

// Query Keys
export const billingKeys = {
  all: ['billing'] as const,
  subscription: () => [...billingKeys.all, 'subscription'] as const,
  usage: () => [...billingKeys.all, 'usage'] as const,
  invoices: (startingAfter?: string) =>
    [...billingKeys.all, 'invoices', { startingAfter }] as const,
  paymentMethods: () => [...billingKeys.all, 'payment-methods'] as const,
  tiers: () => [...billingKeys.all, 'tiers'] as const,
  contact: () => [...billingKeys.all, 'contact'] as const,
};

/**
 * Get current subscription
 */
export function useSubscription() {
  return useQuery<Subscription>({
    queryKey: billingKeys.subscription(),
    queryFn: billingApi.getSubscription,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Get current usage stats
 */
export function useUsage() {
  return useQuery<Usage>({
    queryKey: billingKeys.usage(),
    queryFn: billingApi.getUsage,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Get invoice history with pagination
 */
export function useInvoices(startingAfter?: string) {
  return useQuery<{ invoices: Invoice[]; hasMore: boolean }>({
    queryKey: billingKeys.invoices(startingAfter),
    queryFn: () => billingApi.getInvoices(12, startingAfter),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Get payment methods
 */
export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: billingKeys.paymentMethods(),
    queryFn: billingApi.getPaymentMethods,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Get all pricing tiers
 */
export function usePricingTiers() {
  return useQuery<PricingTier[]>({
    queryKey: billingKeys.tiers(),
    queryFn: billingApi.getPricingTiers,
    staleTime: 30 * 60 * 1000, // 30 minutes - tiers rarely change
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}

/**
 * Create checkout session and redirect to Stripe
 * Accepts either priceId or tierName
 */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: (params: { priceId?: string; tierName?: string; isAnnual?: boolean }) =>
      billingApi.createCheckout(params),
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create checkout session');
    },
  });
}

/**
 * Open Stripe billing portal
 */
export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: billingApi.createPortalSession,
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to open billing portal');
    },
  });
}

/**
 * Update subscription to a new tier
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tierName, isAnnual }: { tierName: string; isAnnual?: boolean }) =>
      billingApi.updateSubscription(tierName, isAnnual),
    onSuccess: (data) => {
      queryClient.setQueryData(billingKeys.subscription(), data);
      queryClient.invalidateQueries({ queryKey: billingKeys.usage() });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update subscription');
    },
  });
}

/**
 * Cancel subscription
 */
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (immediately: boolean = false) => billingApi.cancelSubscription(immediately),
    onSuccess: (data) => {
      queryClient.setQueryData(billingKeys.subscription(), data);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to cancel subscription');
    },
  });
}

/**
 * Reactivate canceled subscription
 */
export function useReactivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: billingApi.reactivateSubscription,
    onSuccess: (data) => {
      queryClient.setQueryData(billingKeys.subscription(), data);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to reactivate subscription');
    },
  });
}

/**
 * Sync subscription from Stripe
 * Use this when features don't match after upgrade
 */
export function useSyncSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: billingApi.syncSubscription,
    onSuccess: (_data) => {
      // Invalidate all billing queries to refresh data
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      // Also invalidate transcription access
      queryClient.invalidateQueries({ queryKey: ['transcription', 'feature-access'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to sync subscription');
    },
  });
}

/**
 * Add payment method
 */
export function useAddPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingApi.addPaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods() });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to add payment method');
    },
  });
}

/**
 * Remove payment method
 */
export function useRemovePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingApi.removePaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods() });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to remove payment method');
    },
  });
}

/**
 * Set default payment method
 */
export function useSetDefaultPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingApi.setDefaultPaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods() });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update default payment method');
    },
  });
}

/**
 * Submit enterprise contact form
 */
export function useSubmitEnterpriseContact() {
  return useMutation({
    mutationFn: billingApi.submitEnterpriseContact,
    onSuccess: () => {
      // Form submitted successfully - UI will show confirmation
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit. Please try again.');
    },
  });
}

/**
 * Get billing contact for the organization
 */
export function useBillingContact() {
  return useQuery<BillingContact>({
    queryKey: billingKeys.contact(),
    queryFn: billingApi.getBillingContact,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Update billing contact
 */
export function useUpdateBillingContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { billingEmail: string; billingName: string }) =>
      billingApi.updateBillingContact(data),
    onSuccess: (data) => {
      queryClient.setQueryData(billingKeys.contact(), data);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update billing contact');
    },
  });
}

/**
 * Helper to calculate trial days remaining
 */
export function getTrialDaysRemaining(subscription: Subscription | undefined): number | null {
  if (!subscription?.trialEnd) return null;
  if (subscription.status !== 'trialing') return null;

  const trialEnd = new Date(subscription.trialEnd);
  const now = new Date();
  const diffMs = trialEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Helper to check if organization is in read-only mode due to expired trial
 *
 * Read-only mode occurs when:
 * - Trial has expired (status is 'trialing' but past trialEnd date)
 * - Not on free tier (free tier is never in read-only mode)
 * - Not on active paid subscription
 */
export function isInReadOnlyMode(subscription: Subscription | undefined): boolean {
  if (!subscription) return false;

  // Free tier is never in read-only mode
  if (subscription.tier === 'free') return false;

  // Active paid subscription (not trial) is never in read-only mode
  if (subscription.status === 'active') return false;

  // Trial status but past the end date = read-only mode
  if (subscription.status === 'trialing' && subscription.trialEnd) {
    const trialEnd = new Date(subscription.trialEnd);
    return new Date() > trialEnd;
  }

  return false;
}

/**
 * Helper to format currency
 */
export function formatCurrency(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100); // Stripe amounts are in cents
}

/**
 * Helper to format date
 */
export function formatBillingDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
