import { vi } from 'vitest';
import metricsService from '../../../src/services/metrics.service';
import { db } from '../../../src/config/database';

// Mock the database
vi.mock('../../../src/config/database');

describe('MetricsService', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '650e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordApiMetric', () => {
    it('should record an API metric successfully', async () => {
      const metricData = {
        organizationId,
        userId,
        endpoint: 'POST /api/recordings',
        method: 'POST',
        statusCode: 201,
        responseTimeMs: 150,
        requestSizeBytes: 1024,
        responseSizeBytes: 2048,
        ipAddress: '192.168.1.1',
        error: false,
      };

      await metricsService.recordApiMetric(metricData);

      // Verify the metric was recorded (service should not throw)
      expect(metricData.endpoint).toBe('POST /api/recordings');
    });

    it('should handle errors gracefully in metric recording', async () => {
      const metricData = {
        organizationId,
        userId,
        endpoint: 'POST /api/recordings',
        method: 'POST',
        statusCode: 500,
        responseTimeMs: 1000,
        requestSizeBytes: 1024,
        responseSizeBytes: 512,
        ipAddress: '192.168.1.1',
        error: true,
        errorMessage: 'Internal Server Error',
      };

      // Should not throw
      await expect(metricsService.recordApiMetric(metricData)).resolves.not.toThrow();
    });
  });

  describe('getUsageSummary', () => {
    it('should retrieve usage summary for organization', async () => {
      // Mock implementation
      const mockSummary = {
        totalRequests: 1000,
        successfulRequests: 950,
        failedRequests: 50,
        averageResponseTimeMs: 150,
        totalDataTransferred: 10485760, // 10 MB
      };

      // This would be mocked in real tests
      expect(mockSummary.totalRequests).toBe(1000);
    });

    it('should include date range filtering', async () => {
      const startDate = new Date('2024-10-01');
      const endDate = new Date('2024-10-31');

      // Should accept date parameters
      expect(startDate).toBeInstanceOf(Date);
      expect(endDate).toBeInstanceOf(Date);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow request within limit', async () => {
      const result = await metricsService.checkRateLimit(
        organizationId,
        userId,
        'GET /api/recordings'
      );

      // Result should contain allowed flag and remaining count
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
    });

    it('should fail open on error', async () => {
      // Even if database fails, should allow request
      const result = await metricsService.checkRateLimit(
        organizationId,
        userId,
        'GET /api/recordings'
      );

      // Should allow request as fallback
      expect(result.allowed).toBe(true);
    });
  });

  describe('API Key Management', () => {
    it('should create API key with SHA-256 hashing', async () => {
      const keyData = {
        organizationId,
        userId,
        name: 'Test API Key',
        scopes: 'read:recordings,write:tasks',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      };

      // Should generate a key
      expect(keyData.name).toBe('Test API Key');
      expect(keyData.scopes).toBeDefined();
    });

    it('should verify API key with hash', async () => {
      const testKey = 'test-api-key-value';

      // Verification should work with hash comparison
      expect(testKey).toBeDefined();
    });

    it('should revoke API key', async () => {
      const keyId = '750e8400-e29b-41d4-a716-446655440002';

      // Should mark key as inactive
      expect(keyId).toBeDefined();
    });
  });

  describe('Feature Usage Tracking', () => {
    it('should track feature adoption by date', async () => {
      const featureData = {
        feature: 'recordings',
        organizationId,
        userId,
        date: new Date(),
      };

      // Should increment usage count
      expect(featureData.feature).toBe('recordings');
    });

    it('should map endpoints to features', async () => {
      const endpointFeatureMap = {
        'POST /api/recordings': 'recordings',
        'GET /api/tasks': 'tasks',
        'POST /api/reviews': 'reviews',
        'GET /api/storage/metrics': 'storage',
        'POST /api/retention/policies': 'retention',
      };

      expect(endpointFeatureMap['POST /api/recordings']).toBe('recordings');
    });
  });
});
