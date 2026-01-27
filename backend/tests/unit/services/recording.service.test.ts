/**
 * Unit tests for Recording Service
 *
 * Tests all public methods including:
 * - createRecording
 * - uploadRecording
 * - getRecordingById
 * - getRecordings
 * - deleteRecording
 * - getRecordingDownloadUrl
 * - getRecordingPlaybackUrl
 * - updateRecordingStatus
 * - getTaskRecordings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../src/config/database';
import {
  createMockRecording,
  createMockTask,
  createMockUser,
  createMockFile,
  createMockOrganization,
  createMockQueryBuilder,
} from '../../setup';

// Mock the storage service
vi.mock('../../../src/services/storage.service', () => ({
  default: {
    trackRecordingSize: vi.fn().mockResolvedValue(undefined),
    untrackRecordingSize: vi.fn().mockResolvedValue(undefined),
    getStorageMetrics: vi.fn().mockResolvedValue({
      total_bytes_used: BigInt(5000000000),
      max_bytes_allowed: BigInt(10737418240),
    }),
  },
}));

// Mock the email service
vi.mock('../../../src/services/email.service', () => ({
  emailService: {
    sendReviewNotification: vi.fn().mockResolvedValue(undefined),
    sendTaskAssignmentEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the file validation utility
vi.mock('../../../src/utils/file-validation', () => ({
  assertValidVideoFile: vi.fn().mockResolvedValue({
    detectedType: 'video/webm',
    extension: 'webm',
  }),
  validateVideoFile: vi.fn().mockResolvedValue({
    isValid: true,
    detectedType: 'video/webm',
    extension: 'webm',
  }),
}));

// Helper function to create proper chainable mock for Knex queries
const createChainableMock = (resolvedValue: any) => {
  const builder: any = {};
  const chainMethods = [
    'select', 'where', 'andWhere', 'orWhere', 'whereNull', 'whereNotNull',
    'orderBy', 'orderByRaw', 'limit', 'offset', 'leftJoin', 'rightJoin', 'innerJoin',
    'join', 'distinct', 'clone', 'groupBy', 'having', 'modify', 'with'
  ];
  chainMethods.forEach(method => {
    builder[method] = vi.fn().mockImplementation(() => builder);
  });
  // Terminal methods
  builder.first = vi.fn().mockResolvedValue(resolvedValue);
  builder.update = vi.fn().mockResolvedValue(1);
  builder.insert = vi.fn().mockResolvedValue([]);
  builder.del = vi.fn().mockResolvedValue(1);
  builder.delete = vi.fn().mockResolvedValue(1);
  builder.returning = vi.fn().mockResolvedValue([resolvedValue]);
  // Make thenable for await
  builder.then = vi.fn().mockImplementation((resolve: any) =>
    resolve(Array.isArray(resolvedValue) ? resolvedValue : [resolvedValue])
  );
  return builder;
};

describe('RecordingService', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '650e8400-e29b-41d4-a716-446655440001';
  const taskId = '750e8400-e29b-41d4-a716-446655440002';
  const recordingId = '850e8400-e29b-41d4-a716-446655440003';

  // We need to import the service after mocks are set up
  let recordingService: typeof import('../../../src/services/recording.service').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import the service to get fresh instance with mocks
    const module = await import('../../../src/services/recording.service');
    recordingService = module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('createRecording', () => {
    it('should create a recording with valid data', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        task_id: taskId,
        user_id: userId,
        organization_id: organizationId,
        status: 'initializing',
      });

      // Setup mock to return the created recording
      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRecording]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        task_id: taskId,
        duration_seconds: 300,
        has_audio: true,
        mime_type: 'video/webm',
        resolution: '1920x1080',
        frame_rate: 30,
        browser_info: 'Chrome 120',
      };

      const result = await recordingService.createRecording(userId, createDto, organizationId);

      expect(db).toHaveBeenCalledWith('recordings');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: taskId,
          user_id: userId,
          organization_id: organizationId,
          type: 'screen',
          status: 'initializing',
          mime_type: 'video/webm',
          duration_seconds: 300,
        })
      );
    });

    it('should parse resolution correctly', async () => {
      const mockRecording = createMockRecording({
        width: 1920,
        height: 1080,
      });

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRecording]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        task_id: taskId,
        duration_seconds: 300,
        has_audio: true,
        mime_type: 'video/webm',
        resolution: '1920x1080',
      };

      await recordingService.createRecording(userId, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1920,
          height: 1080,
        })
      );
    });

    it('should throw error when organization ID is missing', async () => {
      // Import and mock getAsyncContext to return no organization_id
      const asyncContext = await import('../../../src/middleware/asyncContext');
      vi.spyOn(asyncContext, 'getAsyncContext').mockReturnValue(null);

      const createDto = {
        task_id: taskId,
        duration_seconds: 300,
        has_audio: true,
        mime_type: 'video/webm',
      };

      await expect(
        recordingService.createRecording(userId, createDto, undefined as any)
      ).rejects.toThrow('Organization ID is required');

      vi.mocked(asyncContext.getAsyncContext).mockRestore();
    });

    it('should store metadata including has_audio and browser_info', async () => {
      const mockRecording = createMockRecording();

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRecording]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        task_id: taskId,
        duration_seconds: 300,
        has_audio: true,
        mime_type: 'video/webm',
        browser_info: 'Firefox 120',
      };

      await recordingService.createRecording(userId, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            browser_info: 'Firefox 120',
            has_audio: true,
          },
        })
      );
    });
  });

  describe('getRecordingById', () => {
    it('should return recording when found', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        organization_id: organizationId,
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockRecording),
          }),
        }),
      });

      const result = await recordingService.getRecordingById(recordingId, organizationId);

      expect(result).toEqual(mockRecording);
      expect(db).toHaveBeenCalledWith('recordings');
    });

    it('should return null when recording not found', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      const result = await recordingService.getRecordingById('nonexistent-id', organizationId);

      expect(result).toBeNull();
    });

    it('should scope query by organization ID when provided', async () => {
      const mockWhere = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      (db as any).mockReturnValue({
        where: mockWhere,
      });

      await recordingService.getRecordingById(recordingId, organizationId);

      expect(mockWhere).toHaveBeenCalledWith('id', recordingId);
    });
  });

  describe('getRecordings', () => {
    // Note: getRecordings signature is (filters?, pagination?, organizationId?)
    it('should return recordings with filters applied', async () => {
      const mockRecordings = [
        createMockRecording({ id: 'rec-1', status: 'completed' }),
        createMockRecording({ id: 'rec-2', status: 'completed' }),
      ];

      const mockChain = createChainableMock(mockRecordings);
      (db as any).mockReturnValue(mockChain);

      const result = await recordingService.getRecordings(
        { status: 'completed' },
        undefined,
        organizationId
      );

      expect(mockChain.where).toHaveBeenCalledWith('organization_id', organizationId);
      expect(mockChain.where).toHaveBeenCalledWith('status', 'completed');
    });

    it('should filter by task_id', async () => {
      const mockChain = createChainableMock([]);
      (db as any).mockReturnValue(mockChain);

      await recordingService.getRecordings(
        { task_id: taskId },
        undefined,
        organizationId
      );

      expect(mockChain.where).toHaveBeenCalledWith('task_id', taskId);
    });

    it('should filter by user_id', async () => {
      const mockChain = createChainableMock([]);
      (db as any).mockReturnValue(mockChain);

      await recordingService.getRecordings(
        { user_id: userId },
        undefined,
        organizationId
      );

      expect(mockChain.where).toHaveBeenCalledWith('user_id', userId);
    });

    it('should filter by type', async () => {
      const mockChain = createChainableMock([]);
      (db as any).mockReturnValue(mockChain);

      await recordingService.getRecordings(
        { type: 'screen_camera' },
        undefined,
        organizationId
      );

      expect(mockChain.where).toHaveBeenCalledWith('type', 'screen_camera');
    });

    it('should throw error when organization ID is missing', async () => {
      // Import and mock getAsyncContext to return no organization_id
      const asyncContext = await import('../../../src/middleware/asyncContext');
      vi.spyOn(asyncContext, 'getAsyncContext').mockReturnValue(null);

      await expect(
        recordingService.getRecordings({}, undefined, undefined as any)
      ).rejects.toThrow('Organization ID is required');

      vi.mocked(asyncContext.getAsyncContext).mockRestore();
    });

    it('should order by created_at and id descending (compound cursor pagination)', async () => {
      const mockChain = createChainableMock([]);
      (db as any).mockReturnValue(mockChain);

      await recordingService.getRecordings({}, undefined, organizationId);

      // Fix #9: Compound cursor pagination uses both created_at and id for stable ordering
      expect(mockChain.orderBy).toHaveBeenCalledWith([
        { column: 'created_at', order: 'desc' },
        { column: 'id', order: 'desc' },
      ]);
    });
  });

  describe('deleteRecording', () => {
    it('should soft delete recording and update status', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        user_id: userId,
        organization_id: organizationId,
        storage_provider: 'local',
        storage_key: 'test-file.webm',
      });

      // Mock getRecordingById
      const mockGetRecording = vi.fn().mockResolvedValue(mockRecording);
      vi.spyOn(recordingService, 'getRecordingById').mockImplementation(mockGetRecording);

      const mockUpdate = vi.fn().mockResolvedValue(1);

      // Mock transaction - the deleteRecording method uses trx inside db.transaction
      (db as any).transaction = vi.fn(async (callback: (trx: any) => Promise<void>) => {
        const trxBuilder = createMockQueryBuilder({ updateResult: 1 });
        trxBuilder.update = mockUpdate;
        const trx = vi.fn().mockReturnValue(trxBuilder);
        return await callback(trx);
      });

      await recordingService.deleteRecording(userId, recordingId, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
          file_url: null,
        })
      );
    });

    it('should throw NotFoundError when recording does not exist', async () => {
      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(null);

      await expect(
        recordingService.deleteRecording(userId, recordingId, organizationId)
      ).rejects.toThrow('Recording not found');
    });

    it('should throw error when user does not own the recording', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        user_id: 'different-user-id',
        organization_id: organizationId,
      });

      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(mockRecording);

      await expect(
        recordingService.deleteRecording(userId, recordingId, organizationId)
      ).rejects.toThrow('Unauthorized to delete this recording');
    });
  });

  describe('getRecordingDownloadUrl', () => {
    it('should return file_url for local storage', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        status: 'completed',
        storage_provider: 'local',
        file_url: '/uploads/recordings/test.webm',
      });

      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(mockRecording);

      const result = await recordingService.getRecordingDownloadUrl(recordingId);

      expect(result).toBe('/uploads/recordings/test.webm');
    });

    it('should throw NotFoundError when recording does not exist', async () => {
      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(null);

      await expect(
        recordingService.getRecordingDownloadUrl(recordingId)
      ).rejects.toThrow('Recording not found');
    });

    it('should throw error when recording is not completed', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        status: 'processing',
      });

      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(mockRecording);

      await expect(
        recordingService.getRecordingDownloadUrl(recordingId)
      ).rejects.toThrow('Recording is not ready for download');
    });

    it('should throw error when file_url is not available', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        status: 'completed',
        storage_provider: 'local',
        file_url: null,
      });

      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(mockRecording);

      await expect(
        recordingService.getRecordingDownloadUrl(recordingId)
      ).rejects.toThrow('Recording file not available');
    });
  });

  describe('getRecordingPlaybackUrl', () => {
    it('should return file_url for local storage', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        status: 'completed',
        storage_provider: 'local',
        file_url: '/uploads/recordings/test.webm',
      });

      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(mockRecording);

      const result = await recordingService.getRecordingPlaybackUrl(recordingId);

      expect(result).toBe('/uploads/recordings/test.webm');
    });

    it('should throw NotFoundError when recording does not exist', async () => {
      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(null);

      await expect(
        recordingService.getRecordingPlaybackUrl(recordingId)
      ).rejects.toThrow('Recording not found');
    });

    it('should throw error when recording is not completed', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        status: 'initializing',
      });

      vi.spyOn(recordingService, 'getRecordingById').mockResolvedValue(mockRecording);

      await expect(
        recordingService.getRecordingPlaybackUrl(recordingId)
      ).rejects.toThrow('Recording is not ready for playback');
    });
  });

  describe('updateRecordingStatus', () => {
    it('should update status to processing', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            update: mockUpdate,
          }),
        }),
      });

      await recordingService.updateRecordingStatus(recordingId, 'processing', undefined, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'processing',
          uploaded_at: expect.any(Date),
        })
      );
    });

    it('should update status to completed with processed_at', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            update: mockUpdate,
          }),
        }),
      });

      await recordingService.updateRecordingStatus(recordingId, 'completed', undefined, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          processed_at: expect.any(Date),
        })
      );
    });

    it('should update status to failed with error message', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            update: mockUpdate,
          }),
        }),
      });

      const errorMessage = 'Upload failed due to network error';
      await recordingService.updateRecordingStatus(recordingId, 'failed', errorMessage, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          processing_error: errorMessage,
        })
      );
    });
  });

  describe('getTaskRecordings', () => {
    it('should return recordings for a specific task', async () => {
      const mockRecordings = [
        createMockRecording({ id: 'rec-1', task_id: taskId }),
        createMockRecording({ id: 'rec-2', task_id: taskId }),
      ];

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockRecordings),
            }),
          }),
        }),
      });

      const result = await recordingService.getTaskRecordings(taskId, organizationId);

      expect(result).toHaveLength(2);
      expect(db).toHaveBeenCalledWith('recordings');
    });

    it('should exclude deleted recordings', async () => {
      const mockChain = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await recordingService.getTaskRecordings(taskId, organizationId);

      expect(mockChain.where).toHaveBeenCalledWith('status', '!=', 'deleted');
    });

    it('should throw error when organization ID is missing', async () => {
      // Import and mock getAsyncContext to return no organization_id
      const asyncContext = await import('../../../src/middleware/asyncContext');
      vi.spyOn(asyncContext, 'getAsyncContext').mockReturnValue(null);

      await expect(
        recordingService.getTaskRecordings(taskId, undefined as any)
      ).rejects.toThrow('Organization ID is required');

      vi.mocked(asyncContext.getAsyncContext).mockRestore();
    });

    it('should order by created_at descending', async () => {
      const mockChain = createChainableMock([]);
      (db as any).mockReturnValue(mockChain);

      await recordingService.getTaskRecordings(taskId, organizationId);

      expect(mockChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
  });

  describe('uploadRecording', () => {
    it('should throw NotFoundError when recording does not exist', async () => {
      // Mock db to return null (recording not found)
      const mockChain = createChainableMock(null);
      mockChain.first = vi.fn().mockResolvedValue(null);
      (db as any).mockReturnValue(mockChain);

      const mockFile = createMockFile();

      await expect(
        recordingService.uploadRecording(userId, recordingId, mockFile, organizationId)
      ).rejects.toThrow('Recording not found');
    });

    it('should throw error when user is not the owner', async () => {
      const mockRecording = createMockRecording({
        id: recordingId,
        user_id: 'different-user-id',
        organization_id: organizationId,
      });

      // Mock db to return recording with different user_id
      const mockChain = createChainableMock(mockRecording);
      mockChain.first = vi.fn().mockResolvedValue(mockRecording);
      (db as any).mockReturnValue(mockChain);

      const mockFile = createMockFile();

      await expect(
        recordingService.uploadRecording(userId, recordingId, mockFile, organizationId)
      ).rejects.toThrow('Unauthorized to upload to this recording');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockChain = createChainableMock(null);
      mockChain.first = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      (db as any).mockReturnValue(mockChain);

      await expect(
        recordingService.getRecordingById(recordingId, organizationId)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle empty resolution string', async () => {
      const mockRecording = createMockRecording();

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRecording]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        task_id: taskId,
        duration_seconds: 300,
        has_audio: true,
        mime_type: 'video/webm',
        resolution: '',
      };

      await recordingService.createRecording(userId, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          width: undefined,
          height: undefined,
        })
      );
    });

    it('should handle null user ID for anonymous recordings', async () => {
      const mockRecording = createMockRecording({
        user_id: null,
      });

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRecording]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        task_id: taskId,
        duration_seconds: 300,
        has_audio: true,
        mime_type: 'video/webm',
      };

      const result = await recordingService.createRecording(null, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: null,
        })
      );
    });

    it('should handle recordings without filters', async () => {
      // Use createChainableMock to ensure all required methods are available
      const mockChain = createChainableMock([]);
      (db as any).mockReturnValue(mockChain);

      // Note: getRecordings signature is (filters?, pagination?, organizationId?)
      await recordingService.getRecordings(undefined, undefined, organizationId);

      // Only organization filter should be applied
      expect(mockChain.where).toHaveBeenCalledWith('organization_id', organizationId);
    });
  });

  describe('Recording status transitions', () => {
    it('should allow transition from initializing to recording', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            update: mockUpdate,
          }),
        }),
      });

      await recordingService.updateRecordingStatus(recordingId, 'recording', undefined, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'recording',
        })
      );
    });

    it('should allow transition from recording to processing', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            update: mockUpdate,
          }),
        }),
      });

      await recordingService.updateRecordingStatus(recordingId, 'processing', undefined, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'processing',
        })
      );
    });

    it('should allow transition to deleted status', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            update: mockUpdate,
          }),
        }),
      });

      await recordingService.updateRecordingStatus(recordingId, 'deleted', undefined, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
        })
      );
    });
  });
});
