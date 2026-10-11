import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stripe Subscription Service Unit Tests
 *
 * Tests checkout session creation, subscription retrieval,
 * cancellation, and reactivation flows with mocked Stripe client.
 */

// Mock Stripe client
const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  subscriptions: {
    retrieve: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(),
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
};

vi.mock('../../src/services/stripe/stripe-client', () => ({
  getStripeClient: vi.fn(() => mockStripe),
  isStripeEnabled: vi.fn(() => true),
  TRIAL_PERIOD_DAYS: 14,
}));

import { stripeSubscriptionService } from '../../src/services/stripe/stripe-subscription.service';

const service = stripeSubscriptionService as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Checkout Session ─────────────────────────────────────────────────────────

describe('createCheckoutSession', () => {
  it('creates a checkout session with correct params', async () => {
    const mockSession = { id: 'cs_test_123', url: 'https://checkout.stripe.com/...' };
    mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

    const result = await service.createCheckoutSession(
      'org-123',
      'price_monthly_pro',
      'https://cogveri.com/billing/success',
      'https://cogveri.com/billing/cancel'
    );

    expect(result.id).toBe('cs_test_123');
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_monthly_pro', quantity: 1 }],
        metadata: { organization_id: 'org-123' },
        subscription_data: expect.objectContaining({
          trial_period_days: 14,
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('checkout_org-123_price_monthly_pro'),
      })
    );
  });

  it('uses existing customer ID when provided', async () => {
    mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_456' });

    await service.createCheckoutSession(
      'org-123',
      'price_pro',
      'https://cogveri.com/success',
      'https://cogveri.com/cancel',
      'cus_existing_789'
    );

    const callArgs = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(callArgs.customer).toBe('cus_existing_789');
    expect(callArgs.customer_creation).toBeUndefined();
  });

  it('creates customer when no existing customer', async () => {
    mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_789' });

    await service.createCheckoutSession(
      'org-new',
      'price_pro',
      'https://cogveri.com/success',
      'https://cogveri.com/cancel'
    );

    const callArgs = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(callArgs.customer).toBeUndefined();
    expect(callArgs.customer_creation).toBe('always');
  });
});

// ─── Subscription Retrieval ───────────────────────────────────────────────────

describe('getSubscription', () => {
  it('retrieves a subscription by ID', async () => {
    const mockSub = {
      id: 'sub_test_123',
      status: 'active',
      current_period_end: 1700000000,
      items: { data: [{ price: { id: 'price_pro' } }] },
    };
    mockStripe.subscriptions.retrieve.mockResolvedValue(mockSub);

    const result = await service.getSubscription('sub_test_123');

    expect(result.status).toBe('active');
    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
      'sub_test_123',
      expect.objectContaining({
        expand: expect.arrayContaining(['default_payment_method']),
      })
    );
  });
});

// ─── Subscription Cancellation ────────────────────────────────────────────────

describe('cancelSubscription', () => {
  it('cancels at period end by default', async () => {
    const mockSub = { id: 'sub_test_123', cancel_at_period_end: true };
    mockStripe.subscriptions.update.mockResolvedValue(mockSub);

    const result = await service.cancelSubscription('sub_test_123');

    expect(result.cancel_at_period_end).toBe(true);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      cancel_at_period_end: true,
    });
  });
});

// ─── Billing Portal ───────────────────────────────────────────────────────────

describe('createBillingPortalSession', () => {
  it('creates a portal session for a customer', async () => {
    const mockPortal = { id: 'bps_test', url: 'https://billing.stripe.com/...' };
    mockStripe.billingPortal.sessions.create.mockResolvedValue(mockPortal);

    const result = await service.createBillingPortalSession(
      'cus_123',
      'https://cogveri.com/settings/billing'
    );

    expect(result.url).toContain('stripe.com');
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://cogveri.com/settings/billing',
    });
  });
});
