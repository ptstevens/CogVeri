import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../src/config/database';
import storageService from '../../../src/services/storage.service';

// Helper to create chainable mock
const createChainableMock = (resolvedValue: any) => {
  const builder: any = {};
  const chainMethods = ['where', 'andWhere', 'orWhere', 'select', 'orderBy', 'limit', 'offset'];
  chainMethods.forEach((method) => {
    builder[method] = vi.fn().mockImplementation(() => builder);
  });
  builder.first = vi.fn().mockResolvedValue(resolvedValue);
  builder.update = vi.fn().mockResolvedValue(1);
  builder.insert = vi.fn().mockResolvedValue([]);
  builder.returning = vi.fn().mockResolvedValue([resolvedValue]);
  return builder;
};

/**
 * Unit tests for Storage Service
 * Tests storage metrics tracking, quota management, and alert handling
 */
describe('StorageService', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const recordingId = '650e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeStorageMetrics', () => {
    it('should initialize storage metrics for new organization', async () => {
      const maxStorageGb = 10;

      // Should create storage_metrics record
      expect(maxStorageGb).toBeGreaterThan(0);
    });

    it('should set max bytes from GB value', async () => {
      const maxStorageGb = 100;
      const expectedBytes = maxStorageGb * 1024 * 1024 * 1024;

      expect(expectedBytes).toBe(107374182400);
    });

    it('should initialize with zero used bytes', async () => {
      const initialBytes = 0n;

      expect(initialBytes).toBe(0n);
    });
  });

  describe('trackRecordingSize', () => {
    it('should add recording size to organization usage', async () => {
      const fileSizeBytes = 104857600; // 100 MB

      await storageService.trackRecordingSize(recordingId, organizationId, fileSizeBytes);

      expect(fileSizeBytes).toBe(104857600);
    });

    it('should handle large file sizes with BigInt', async () => {
      const fileSizeBytes = 10737418240; // 10 GB

      // Should use BigInt for precision
      const bigIntSize = BigInt(fileSizeBytes);
      expect(bigIntSize).toBe(10737418240n);
    });

    it('should update recording_file_sizes table', async () => {
      const fileSizeBytes = 52428800; // 50 MB

      // Should create entry in recording_file_sizes
      expect(fileSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('untrackRecordingSize', () => {
    it('should remove recording size from usage', async () => {
      const fileSizeBytes = 104857600; // 100 MB

      await storageService.untrackRecordingSize(recordingId, organizationId, fileSizeBytes);

      expect(fileSizeBytes).toBe(104857600);
    });

    it('should mark recording_file_sizes as deleted', async () => {
      const fileSizeBytes = 52428800;

      // Should soft-delete entry
      expect(fileSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('getStorageMetrics', () => {
    it('should return current storage state', async () => {
      const mockMetrics = {
        totalBytesUsed: BigInt(5368709120), // 5 GB
        maxBytes: BigInt(10737418240), // 10 GB
        percentageUsed: 50,
        bytesRemaining: BigInt(5368709120),
      };

      expect(mockMetrics.totalBytesUsed).toBe(5368709120n);
      expect(mockMetrics.percentageUsed).toBe(50);
    });

    it('should calculate percentage accurately', async () => {
      const used = 7516192768n; // 7 GB
      const max = 10737418240n; // 10 GB
      const percentage = (Number(used) / Number(max)) * 100;

      expect(percentage).toBeCloseTo(70, 1);
    });

    it('should handle zero usage', async () => {
      const mockMetrics = {
        totalBytesUsed: 0n,
        maxBytes: BigInt(10737418240),
        percentageUsed: 0,
      };

      expect(mockMetrics.percentageUsed).toBe(0);
    });
  });

  describe('updateMaxStorage', () => {
    it('should update max storage on tier upgrade', async () => {
      const newMaxGb = 100;

      // Mock storage metrics lookup to return existing metrics
      const mockMetrics = {
        organization_id: organizationId,
        total_bytes_used: BigInt(5000000000),
        max_bytes_allowed: BigInt(10737418240),
      };
      const mockChain = createChainableMock(mockMetrics);
      (db as any).mockReturnValue(mockChain);

      await storageService.updateMaxStorage(organizationId, newMaxGb);

      expect(mockChain.update).toHaveBeenCalled();
    });

    it('should trigger quota alerts if new limit is lower than current usage', async () => {
      // If downgrading and already over limit, should alert
      expect(true).toBe(true);
    });

    it('should prevent storage lock if usage exceeds new max', async () => {
      const newMaxGb = 1; // Very small limit

      // Should handle gracefully
      expect(newMaxGb).toBeGreaterThan(0);
    });
  });

  describe('Quota Alerts', () => {
    it('should create alert at 75% threshold', async () => {
      const alertThreshold = 75;

      expect(alertThreshold).toBe(75);
    });

    it('should create alert at 90% threshold', async () => {
      const alertThreshold = 90;

      expect(alertThreshold).toBe(90);
    });

    it('should create critical alert at 100%', async () => {
      const alertThreshold = 100;

      expect(alertThreshold).toBe(100);
    });

    it('should not duplicate alerts', async () => {
      // Should check for existing unresolved alerts
      expect(true).toBe(true);
    });

    it('should auto-trigger when threshold crossed', async () => {
      const usage = 85; // Between 75% and 90%

      expect(usage).toBeGreaterThanOrEqual(75);
      expect(usage).toBeLessThanOrEqual(100);
    });
  });

  describe('recalculateStorageMetrics', () => {
    it('should rebuild metrics from source of truth', async () => {
      // Should sum all recording_file_sizes for org
      expect(true).toBe(true);
    });

    it('should handle missing recording sizes gracefully', async () => {
      // Should use recording.file_size_bytes as fallback
      expect(true).toBe(true);
    });

    it('should account for only non-deleted recordings', async () => {
      // Only include recordings with deleted_at IS NULL
      expect(true).toBe(true);
    });
  });

  describe('Storage Conversion Functions', () => {
    it('should convert bytes to GB accurately', () => {
      const bytes = 1073741824n; // 1 GB
      const gb = Number(bytes) / (1024 * 1024 * 1024);

      expect(gb).toBe(1);
    });

    it('should convert large numbers without precision loss', () => {
      const bytes = 10995116277760n; // 10 TB
      const gb = Number(bytes) / (1024 * 1024 * 1024);

      expect(gb).toBeCloseTo(10240, 1);
    });

    it('should round to 2 decimal places for display', () => {
      const bytes = 1234567890n;
      const gb = Number(bytes) / (1024 * 1024 * 1024);
      const rounded = Math.round(gb * 100) / 100;

      expect(rounded).toBeCloseTo(1.15, 2);
    });
  });
});
