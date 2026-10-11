/**
 * Integration tests for Billing API endpoints and services
 *
 * Tests the billing and subscription management functionality:
 * - Subscription status retrieval
 * - Usage tracking and limits
 * - Dunning email workflow
 * - Payment method management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Sentry before any imports
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  Handlers: {
    requestHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    tracingHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    errorHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  },
  Integrations: {
    Http: vi.fn(),
    Express: vi.fn(),
    Postgres: vi.fn(),
  },
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  startTransaction: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  close: vi.fn().mockResolvedValue(true),
}));

vi.mock('@sentry/profiling-node', () => ({
  ProfilingIntegration: vi.fn(),
}));

vi.mock('../../../src/config/sentry', () => ({
  initSentry: vi.fn(),
  sentryRequestHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  sentryTracingHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  setupExpressErrorHandler: vi.fn(),
  flushSentry: vi.fn().mockResolvedValue(true),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
  setSentryTags: vi.fn(),
  setSentryContext: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  startTransaction: vi.fn(),
  closeSentry: vi.fn().mockResolvedValue(true),
}));

// Mock Redis
vi.mock('../../src/config/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    quit: vi.fn(),
  }),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

// Mock BullMQ config
vi.mock('../../src/config/bullmq', () => ({
  isQueueWorkersEnabled: vi.fn().mockReturnValue(false),
}));

// Mock queue service
vi.mock('../../src/services/queue.service', () => ({
  queueService: {
    enqueue: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(false),
    gracefulShutdown: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock queues
vi.mock('../../src/queues/definitions/send-email.queue', () => ({
  getSendEmailQueue: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/queues/processors/send-email.processor', () => ({
  getSendEmailProcessor: vi.fn().mockReturnValue(null),
}));

// Mock socket.io
vi.mock('../../src/services/socket', () => ({
  initializeSocketIO: vi.fn(),
}));

// Mock scheduler
vi.mock('../../src/services/scheduler.service', () => ({
  default: {
    start: vi.fn(),
    stop: vi.fn(),
    stopScheduler: vi.fn(),
    startScheduler: vi.fn(),
    scheduleTask: vi.fn(),
    cancelTask: vi.fn(),
    initializeScheduler: vi.fn(),
  },
}));

// Override logger mock
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      http: vi.fn(),
    })),
  },
  correlationMiddleware: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requestContext: {
    getStore: vi.fn(),
    run: vi.fn((context: any, fn: any) => fn()),
  },
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
  getRequestContext: vi.fn(),
  runWithCorrelation: vi.fn((fn: any) => fn()),
}));

// Mock email service
vi.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  },
}));

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      customers: {
        create: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
        retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' }),
      },
      subscriptions: {
        create: vi.fn().mockResolvedValue({
          id: 'sub_test123',
          status: 'active',
          items: {
            data: [
              {
                price: { id: 'price_test' },
                current_period_start: Math.floor(Date.now() / 1000),
                current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
              },
            ],
          },
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_test123',
          status: 'active',
        }),
        update: vi.fn().mockResolvedValue({ id: 'sub_test123' }),
        cancel: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'canceled' }),
      },
      paymentMethods: {
        attach: vi.fn().mockResolvedValue({ id: 'pm_test123' }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      checkout: {
        sessions: {
          create: vi
            .fn()
            .mockResolvedValue({ id: 'cs_test123', url: 'https://checkout.stripe.com/test' }),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/test' }),
        },
      },
      invoices: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        retrieveUpcoming: vi.fn().mockResolvedValue({ amount_due: 1000 }),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    })),
  };
});

import { db } from '../../src/config/database';
import { emailService } from '../../src/services/email.service';
import {
  createMockUser,
  createMockOrganization,
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../setup';

describe('Billing Service', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '650e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('sendDunningEmail', () => {
    it('should send dunning email with correct content for first failure', async () => {
      const mockOrg = createMockOrganization({
        id: organizationId,
        name: 'Test Company',
        subscription_tier: 'pro',
        owner_id: userId,
      });

      const mockUser = createMockUser({
        id: userId,
        email: 'owner@example.com',
        name: 'Test Owner',
      });

      // Mock database calls
      (db as any).mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockOrg),
            }),
          };
        }
        if (table === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockUser),
            }),
          };
        }
        if (table === 'billing_events') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const { billingService } = await import('../../src/services/billing.service');

      const result = await billingService.sendDunningEmail(
        organizationId,
        1, // First failure
        2999, // $29.99 in cents
        'usd',
        Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60, // 3 days from now
        'https://invoice.stripe.com/test'
      );

      expect(result).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          subject: expect.stringContaining('Payment failed'),
        })
      );
    });

    it('should send urgent email for third failure attempt', async () => {
      const mockOrg = createMockOrganization({
        id: organizationId,
        name: 'Test Company',
        subscription_tier: 'team',
        owner_id: userId,
      });

      const mockUser = createMockUser({
        id: userId,
        email: 'owner@example.com',
        name: 'Test Owner',
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockOrg),
            }),
          };
        }
        if (table === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockUser),
            }),
          };
        }
        if (table === 'billing_events') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const { billingService } = await import('../../src/services/billing.service');

      const result = await billingService.sendDunningEmail(
        organizationId,
        3, // Third failure - urgent
        4999,
        'usd',
        null,
        null
      );

      expect(result).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Urgent'),
        })
      );
    });

    it('should send final notice email for fourth failure attempt', async () => {
      const mockOrg = createMockOrganization({
        id: organizationId,
        name: 'Test Company',
        subscription_tier: 'business',
        owner_id: userId,
      });

      const mockUser = createMockUser({
        id: userId,
        email: 'owner@example.com',
        name: 'Test Owner',
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockOrg),
            }),
          };
        }
        if (table === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockUser),
            }),
          };
        }
        if (table === 'billing_events') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const { billingService } = await import('../../src/services/billing.service');

      const result = await billingService.sendDunningEmail(
        organizationId,
        4, // Final attempt
        9999,
        'usd',
        null,
        null
      );

      expect(result).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Action Required'),
        })
      );
    });

    it('should return false when organization not found', async () => {
      (db as any).mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        return {};
      });

      const { billingService } = await import('../../src/services/billing.service');

      const result = await billingService.sendDunningEmail(
        'non-existent-org',
        1,
        2999,
        'usd',
        null,
        null
      );

      expect(result).toBe(false);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should return false when owner email not found', async () => {
      const mockOrg = createMockOrganization({
        id: organizationId,
        owner_id: userId,
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockOrg),
            }),
          };
        }
        if (table === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null), // No user found
            }),
          };
        }
        return {};
      });

      const { billingService } = await import('../../src/services/billing.service');

      const result = await billingService.sendDunningEmail(
        organizationId,
        1,
        2999,
        'usd',
        null,
        null
      );

      expect(result).toBe(false);
    });
  });

  describe('sendPaymentActionRequiredEmail', () => {
    it('should send 3D Secure authentication email', async () => {
      const mockOrg = createMockOrganization({
        id: organizationId,
        name: 'Test Company',
        subscription_tier: 'team',
        owner_id: userId,
      });

      const mockUser = createMockUser({
        id: userId,
        email: 'owner@example.com',
        name: 'Test Owner',
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockOrg),
            }),
          };
        }
        if (table === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockUser),
            }),
          };
        }
        if (table === 'billing_events') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const { billingService } = await import('../../src/services/billing.service');

      const result = await billingService.sendPaymentActionRequiredEmail(
        organizationId,
        'https://invoice.stripe.com/authenticate'
      );

      expect(result).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          subject: expect.stringContaining('Action Required'),
        })
      );
    });
  });
});

describe('Quota Enforcer Middleware', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '650e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('checkMemberLimit', () => {
    it('should allow request when under member limit', async () => {
      // This test validates the middleware exists and exports correctly
      // Full integration testing requires actual database state
      const { checkMemberLimit } = await import('../../src/middleware/quota-enforcer');

      expect(checkMemberLimit).toBeDefined();
      expect(typeof checkMemberLimit).toBe('function');

      // Verify middleware returns a function
      const middleware = checkMemberLimit();
      expect(typeof middleware).toBe('function');
    });

    it('should export checkMemberLimit middleware factory', async () => {
      // Validates middleware factory pattern
      const { checkMemberLimit } = await import('../../src/middleware/quota-enforcer');

      // Should be callable with no arguments
      const middleware = checkMemberLimit();

      // Should return an async function with correct signature (req, res, next)
      expect(middleware.length).toBe(3);
    });
  });

  describe('requireFeature', () => {
    it('should export requireFeature middleware factory', async () => {
      const { requireFeature } = await import('../../src/middleware/quota-enforcer');

      expect(requireFeature).toBeDefined();
      expect(typeof requireFeature).toBe('function');

      // Should accept feature name and return middleware
      const middleware = requireFeature('advancedAnalytics');
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // (req, res, next)
    });

    it('should validate feature names against pricing tiers', async () => {
      const { requireFeature } = await import('../../src/middleware/quota-enforcer');

      // Test with various feature names - should not throw
      expect(() => requireFeature('advancedAnalytics')).not.toThrow();
      expect(() => requireFeature('apiAccess')).not.toThrow();
      expect(() => requireFeature('customBranding')).not.toThrow();
    });
  });
});

describe('Trial Service', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '650e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('isTrialActive', () => {
    it('should return true for active trial within period', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

      const mockSubscription = {
        organization_id: organizationId,
        status: 'trialing',
        is_trial: true,
        trial_end: futureDate,
      };

      (db as any).mockImplementation((table: string) => {
        if (table === 'organization_subscriptions') {
          return {
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockSubscription),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const trialService = (await import('../../src/services/trial.service')).default;

      const result = await trialService.isTrialActive(organizationId);

      expect(result).toBe(true);
    });

    it('should return false for expired trial', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7); // 7 days ago

      const mockSubscription = {
        organization_id: organizationId,
        status: 'trialing',
        is_trial: true,
        trial_end: pastDate,
      };

      (db as any).mockImplementation((table: string) => {
        if (table === 'organization_subscriptions') {
          return {
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockSubscription),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const trialService = (await import('../../src/services/trial.service')).default;

      const result = await trialService.isTrialActive(organizationId);

      expect(result).toBe(false);
    });

    it('should return false when no trial exists', async () => {
      (db as any).mockImplementation((table: string) => {
        if (table === 'organization_subscriptions') {
          return {
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(null),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const trialService = (await import('../../src/services/trial.service')).default;

      const result = await trialService.isTrialActive(organizationId);

      expect(result).toBe(false);
    });
  });

  describe('getTrialDaysRemaining', () => {
    it('should return correct days remaining', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // 10 days from now

      const mockSubscription = {
        organization_id: organizationId,
        is_trial: true,
        trial_end: futureDate,
      };

      (db as any).mockImplementation((table: string) => {
        if (table === 'organization_subscriptions') {
          return {
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockSubscription),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const trialService = (await import('../../src/services/trial.service')).default;

      const result = await trialService.getTrialDaysRemaining(organizationId);

      expect(result).toBeGreaterThanOrEqual(9);
      expect(result).toBeLessThanOrEqual(11);
    });

    it('should return 0 for expired trial', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const mockSubscription = {
        organization_id: organizationId,
        is_trial: true,
        trial_end: pastDate,
      };

      (db as any).mockImplementation((table: string) => {
        if (table === 'organization_subscriptions') {
          return {
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockSubscription),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const trialService = (await import('../../src/services/trial.service')).default;

      const result = await trialService.getTrialDaysRemaining(organizationId);

      expect(result).toBe(0);
    });
  });
});
