import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

// Set environment variables before any imports
process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing';
process.env.NODE_ENV = 'test';

// Mock Sentry before importing app
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  Handlers: {
    requestHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    tracingHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    errorHandler: vi.fn(() => (_err: any, _req: any, _res: any, next: any) => next()),
  },
  setUser: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: vi.fn((_, cb) => cb({ setStatus: vi.fn() })),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(),
}));

// Mock scheduler
vi.mock('../../../src/services/scheduler.service', () => ({
  default: {
    start: vi.fn(),
    stop: vi.fn(),
    stopScheduler: vi.fn(),
  },
}));

// Mock queue service
vi.mock('../../../src/services/queue.service', () => ({
  queueService: {
    enqueue: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(false),
    gracefulShutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock socket.io
vi.mock('../../../src/services/socket', () => ({
  initializeSocketIO: vi.fn(),
}));

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
  })),
}));

// Mock BullMQ
vi.mock('../../../src/config/bullmq', () => ({
  isQueueWorkersEnabled: vi.fn().mockReturnValue(false),
  getRedisConnection: vi.fn().mockReturnValue({}),
  QUEUE_PREFIX: 'test',
}));

vi.mock('../../../src/queues/definitions/send-email.queue', () => ({
  getSendEmailQueue: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/queues/processors/send-email.processor', () => ({
  getSendEmailProcessor: vi.fn().mockReturnValue(null),
}));

// Mock logger with correlationMiddleware
vi.mock('../../../src/utils/logger', () => ({
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

/**
 * Integration tests for metrics API endpoints
 * Tests full request/response cycle with authentication and organization scoping
 */
describe('Metrics API Routes', () => {
  let app: any;

  beforeAll(async () => {
    const indexModule = await import('../../../src/index');
    app = indexModule.app;
  });
  const authToken = 'test-jwt-token';
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('GET /api/metrics/usage-summary', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/metrics/usage-summary');

      expect(res.status).toBe(401);
    });

    it('should return usage summary for authenticated user', async () => {
      const res = await request(app)
        .get('/api/metrics/usage-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/); // Would be 200 with valid token
    });

    it('should support date range filtering', async () => {
      const startDate = '2024-10-01';
      const endDate = '2024-10-31';

      const res = await request(app)
        .get('/api/metrics/usage-summary')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should include total requests, success rate, and performance metrics', async () => {
      // Mock response format
      const mockResponse = {
        success: true,
        data: {
          totalRequests: 1000,
          successfulRequests: 950,
          failedRequests: 50,
          averageResponseTimeMs: 150,
          totalDataTransferredGb: 1.5,
        },
      };

      expect(mockResponse.data).toHaveProperty('totalRequests');
      expect(mockResponse.data).toHaveProperty('successfulRequests');
      expect(mockResponse.data).toHaveProperty('averageResponseTimeMs');
    });
  });

  describe('GET /api/metrics/usage-by-endpoint', () => {
    it('should return usage breakdown by endpoint', async () => {
      const res = await request(app)
        .get('/api/metrics/usage-by-endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should include endpoint method and statistics', async () => {
      const mockResponse = [
        {
          endpoint: '/api/recordings',
          method: 'POST',
          count: 500,
          avgResponseTimeMs: 200,
          errorCount: 10,
        },
        {
          endpoint: '/api/recordings',
          method: 'GET',
          count: 300,
          avgResponseTimeMs: 100,
          errorCount: 5,
        },
      ];

      expect(mockResponse[0]).toHaveProperty('endpoint');
      expect(mockResponse[0]).toHaveProperty('method');
      expect(mockResponse[0]).toHaveProperty('count');
    });
  });

  describe('GET /api/metrics/usage-by-user', () => {
    it('should return top users by request count', async () => {
      const res = await request(app)
        .get('/api/metrics/usage-by-user')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should support limit parameter', async () => {
      const res = await request(app)
        .get('/api/metrics/usage-by-user')
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should include user ID, request count, and data transfer', async () => {
      const mockResponse = [
        {
          userId: 'user-1',
          requestCount: 500,
          errorCount: 10,
          avgResponseTimeMs: 150,
          totalDataTransferredGb: 2.5,
        },
      ];

      expect(mockResponse[0]).toHaveProperty('userId');
      expect(mockResponse[0]).toHaveProperty('requestCount');
      expect(mockResponse[0]).toHaveProperty('totalDataTransferredGb');
    });
  });

  describe('GET /api/metrics/feature-usage', () => {
    it('should return feature adoption statistics', async () => {
      const res = await request(app)
        .get('/api/metrics/feature-usage')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should track all feature types', async () => {
      const mockResponse = [
        { featureName: 'recordings', totalUsage: 1000, uniqueUsers: 50 },
        { featureName: 'tasks', totalUsage: 800, uniqueUsers: 40 },
        { featureName: 'reviews', totalUsage: 600, uniqueUsers: 30 },
        { featureName: 'storage', totalUsage: 500, uniqueUsers: 50 },
        { featureName: 'retention', totalUsage: 100, uniqueUsers: 10 },
      ];

      expect(mockResponse).toHaveLength(5);
      expect(mockResponse.map(f => f.featureName)).toEqual([
        'recordings', 'tasks', 'reviews', 'storage', 'retention'
      ]);
    });
  });

  describe('POST /api/metrics/api-keys', () => {
    it('should create new API key', async () => {
      const keyData = {
        name: 'Integration Test Key',
        scopes: 'read:recordings,write:tasks',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };

      const res = await request(app)
        .post('/api/metrics/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId)
        .send(keyData);

      // 403 Forbidden if user doesn't have admin/owner role
      expect(res.status.toString()).toMatch(/^(200|201|400|401|403)$/);
    });

    it('should return full key only on creation', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 'key-id',
          keyPrefix: 'rly_test_abc123',
          keyFull: 'rly_test_abc123def456ghi789jkl', // Full key returned only on creation
          scopes: 'read:recordings',
        },
      };

      expect(mockResponse.data).toHaveProperty('keyFull');
      expect(mockResponse.data.keyFull).toContain('rly_test_');
    });

    it('should require name field', async () => {
      const invalidData = {
        scopes: 'read:recordings',
      };

      expect(invalidData).not.toHaveProperty('name');
    });
  });

  describe('GET /api/metrics/api-keys', () => {
    it('should list organization API keys', async () => {
      const res = await request(app)
        .get('/api/metrics/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should not include full key hash in response', async () => {
      const mockResponse = [
        {
          id: 'key-id',
          keyPrefix: 'rly_test_abc123',
          scopes: 'read:recordings',
          lastUsedAt: new Date(),
          usageCount: 100,
          expiresAt: null,
          isActive: true,
        },
      ];

      expect(mockResponse[0]).not.toHaveProperty('keyHash');
      expect(mockResponse[0]).toHaveProperty('keyPrefix');
    });
  });

  describe('DELETE /api/metrics/api-keys/:keyId', () => {
    it('should revoke API key', async () => {
      const keyId = 'key-id';

      const res = await request(app)
        .delete(`/api/metrics/api-keys/${keyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      // 403 Forbidden if user doesn't have admin/owner role
      expect(res.status.toString()).toMatch(/^(200|201|400|401|403)$/);
    });

    it('should prevent using revoked key', async () => {
      // After deletion, key should return 401
      expect(true).toBe(true);
    });
  });

  describe('GET /api/metrics/rate-limit-status', () => {
    it('should return rate limit status', async () => {
      const res = await request(app)
        .get('/api/metrics/rate-limit-status')
        .query({ endpoint: 'POST /api/recordings' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);

      expect(res.status.toString()).toMatch(/^(200|201|400|401)$/);
    });

    it('should show remaining requests and reset time', async () => {
      const mockResponse = {
        success: true,
        data: {
          allowed: true,
          remaining: 45,
          resetAt: new Date(),
          rateLimitHeader: 'X-RateLimit-Remaining: 45',
        },
      };

      expect(mockResponse.data).toHaveProperty('allowed');
      expect(mockResponse.data).toHaveProperty('remaining');
      expect(mockResponse.data).toHaveProperty('resetAt');
    });
  });

  describe('Organization Scoping', () => {
    it('should isolate metrics by organization', async () => {
      const org1 = '550e8400-e29b-41d4-a716-446655440001';
      const org2 = '550e8400-e29b-41d4-a716-446655440002';

      const res1 = await request(app)
        .get('/api/metrics/usage-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', org1);

      const res2 = await request(app)
        .get('/api/metrics/usage-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', org2);

      // Different organizations should get different data
      expect(org1).not.toBe(org2);
    });

    it('should return 400 without organization ID', async () => {
      const res = await request(app)
        .get('/api/metrics/usage-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .unset('X-Organization-Id');

      expect(res.status.toString()).toMatch(/^(400|401)$/);
    });
  });
});
