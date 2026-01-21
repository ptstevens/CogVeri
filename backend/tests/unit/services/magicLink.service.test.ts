/**
 * Unit tests for Magic Link Service
 *
 * Tests all public methods including:
 * - createMagicLink (link generation)
 * - validateToken (validation and expiration)
 * - claimTask
 * - getTaskByToken
 * - revokeToken
 * - getExternalContributors
 * - getContributorAnalytics
 * - Usage limits
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../../../src/config/database';
import {
  createMockTask,
  createMockUser,
  createMockMagicLink,
  createMockExternalContributor,
  createMockOrganization,
} from '../../setup';

// Mock the email service
vi.mock('../../../src/services/email.service', () => ({
  emailService: {
    sendEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the config
vi.mock('../../../src/utils/config', () => ({
  getMagicLinkUrl: vi.fn((token: string, orgId: string) =>
    `https://app.example.com/tasks/external?token=${token}&org=${orgId}`
  ),
}));

describe('MagicLinkService', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const taskId = '750e8400-e29b-41d4-a716-446655440002';
  const contributorId = 'a50e8400-e29b-41d4-a716-446655440005';
  const userId = '650e8400-e29b-41d4-a716-446655440001';

  let magicLinkService: typeof import('../../../src/services/magicLink.service').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/magicLink.service');
    magicLinkService = module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('createMagicLink', () => {
    it('should create a magic link for a valid task', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        title: 'Test Task',
      });

      const mockContributor = createMockExternalContributor({
        id: contributorId,
        email: 'external@example.com',
        organization_id: organizationId,
      });

      // Mock task lookup
      const mockFirst = vi.fn().mockResolvedValue(mockTask);
      const mockContributorFirst = vi.fn().mockResolvedValue(null); // New contributor
      const mockContributorInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockContributor]),
      });
      const mockTokenFirst = vi.fn().mockResolvedValue(null); // Token doesn't exist
      const mockTokenInsert = vi.fn().mockResolvedValue([]);
      const mockTaskUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                first: mockFirst,
                update: mockTaskUpdate,
              }),
            };
          case 'task_access_tokens':
            return {
              where: vi.fn().mockReturnValue({
                first: mockTokenFirst,
              }),
              insert: mockTokenInsert,
            };
          case 'external_contributors':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  first: mockContributorFirst,
                }),
              }),
              insert: mockContributorInsert,
            };
          default:
            return {};
        }
      });

      const result = await magicLinkService.createMagicLink({
        taskId,
        email: 'external@example.com',
        expiresInDays: 30,
      }, organizationId);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('url');
      expect(result.token).toHaveLength(64); // 32 bytes hex = 64 chars
    });

    it('should throw NotFoundError when task does not exist', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        magicLinkService.createMagicLink({
          taskId: 'nonexistent-task',
          email: 'external@example.com',
          expiresInDays: 30,
        }, organizationId)
      ).rejects.toThrow('Task not found');
    });

    it('should throw UnauthorizedError when task belongs to different organization', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: 'different-org-id',
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockTask),
        }),
      });

      await expect(
        magicLinkService.createMagicLink({
          taskId,
          email: 'external@example.com',
          expiresInDays: 30,
        }, organizationId)
      ).rejects.toThrow('Task does not belong to this organization');
    });

    it('should calculate expiry date correctly', async () => {
      const mockTask = createMockTask({ id: taskId, organization_id: organizationId });
      const mockContributor = createMockExternalContributor();
      let insertedToken: any = null;

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockTask),
                update: vi.fn().mockResolvedValue(1),
              }),
            };
          case 'task_access_tokens':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
              insert: vi.fn((data: any) => {
                insertedToken = data;
                return Promise.resolve([]);
              }),
            };
          case 'external_contributors':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockContributor),
                }),
                increment: vi.fn().mockReturnValue({
                  update: vi.fn().mockResolvedValue(1),
                }),
              }),
            };
          default:
            return {};
        }
      });

      const expiresInDays = 14;
      await magicLinkService.createMagicLink({
        taskId,
        email: 'external@example.com',
        expiresInDays,
      }, organizationId);

      const now = new Date();
      const expectedExpiry = new Date(now);
      expectedExpiry.setDate(expectedExpiry.getDate() + expiresInDays);

      expect(insertedToken).not.toBeNull();
      const tokenExpiry = new Date(insertedToken.expires_at);
      // Should be within 1 second of expected
      expect(Math.abs(tokenExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });

    it('should increment tasks_assigned for existing contributor', async () => {
      const mockTask = createMockTask({ id: taskId, organization_id: organizationId });
      const mockContributor = createMockExternalContributor({
        id: contributorId,
        total_tasks_assigned: 5,
      });

      const mockIncrement = vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue(1),
      });

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockTask),
                update: vi.fn().mockResolvedValue(1),
              }),
            };
          case 'task_access_tokens':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
              insert: vi.fn().mockResolvedValue([]),
            };
          case 'external_contributors':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockContributor),
                }),
                increment: mockIncrement,
              }),
            };
          default:
            return {};
        }
      });

      await magicLinkService.createMagicLink({
        taskId,
        email: 'external@example.com',
        expiresInDays: 30,
      }, organizationId);

      expect(mockIncrement).toHaveBeenCalledWith('total_tasks_assigned', 1);
    });

    it('should store max_uses when provided', async () => {
      const mockTask = createMockTask({ id: taskId, organization_id: organizationId });
      const mockContributor = createMockExternalContributor();
      let insertedToken: any = null;

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockTask),
                update: vi.fn().mockResolvedValue(1),
              }),
            };
          case 'task_access_tokens':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
              insert: vi.fn((data: any) => {
                insertedToken = data;
                return Promise.resolve([]);
              }),
            };
          case 'external_contributors':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockContributor),
                }),
                increment: vi.fn().mockReturnValue({
                  update: vi.fn().mockResolvedValue(1),
                }),
              }),
            };
          default:
            return {};
        }
      });

      await magicLinkService.createMagicLink({
        taskId,
        email: 'external@example.com',
        expiresInDays: 30,
        maxUses: 5,
      }, organizationId);

      expect(insertedToken).not.toBeNull();
      expect(insertedToken.max_uses).toBe(5);
    });
  });

  describe('validateToken', () => {
    it('should return valid:true for a valid token', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const mockMagicLink = createMockMagicLink({
        token,
        task_id: taskId,
        email: 'external@example.com',
        contributor_id: contributorId,
        organization_id: organizationId,
        is_revoked: false,
        current_uses: 0,
        max_uses: null,
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'task_access_tokens') {
          return {
            where: vi.fn().mockReturnValue({
              andWhere: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockMagicLink),
              }),
              update: vi.fn().mockResolvedValue(1),
            }),
          };
        }
        if (table === 'task_access_logs') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const result = await magicLinkService.validateToken(token, '192.168.1.1', 'Chrome', organizationId);

      expect(result.valid).toBe(true);
      expect(result.taskId).toBe(taskId);
      expect(result.email).toBe('external@example.com');
      expect(result.organizationId).toBe(organizationId);
    });

    it('should return valid:false for non-existent token', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      const result = await magicLinkService.validateToken('nonexistent-token', undefined, undefined, organizationId);

      expect(result.valid).toBe(false);
    });

    it('should return valid:false for revoked token', async () => {
      const mockMagicLink = createMockMagicLink({
        is_revoked: true,
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockMagicLink),
          }),
        }),
      });

      const result = await magicLinkService.validateToken('revoked-token', undefined, undefined, organizationId);

      expect(result.valid).toBe(false);
    });

    it('should return valid:false for expired token', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

      const mockMagicLink = createMockMagicLink({
        expires_at: expiredDate,
        is_revoked: false,
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockMagicLink),
          }),
        }),
      });

      const result = await magicLinkService.validateToken('expired-token', undefined, undefined, organizationId);

      expect(result.valid).toBe(false);
    });

    it('should return valid:false when max uses exceeded', async () => {
      const mockMagicLink = createMockMagicLink({
        max_uses: 5,
        current_uses: 5,
        is_revoked: false,
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockMagicLink),
          }),
        }),
      });

      const result = await magicLinkService.validateToken('maxed-token', undefined, undefined, organizationId);

      expect(result.valid).toBe(false);
    });

    it('should increment current_uses on valid access', async () => {
      const mockMagicLink = createMockMagicLink({
        id: 'token-id',
        current_uses: 2,
        max_uses: 10,
        is_revoked: false,
      });

      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockImplementation((table: string) => {
        if (table === 'task_access_tokens') {
          return {
            where: vi.fn().mockReturnValue({
              andWhere: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockMagicLink),
              }),
              update: mockUpdate,
            }),
          };
        }
        if (table === 'task_access_logs') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      await magicLinkService.validateToken('valid-token', '192.168.1.1', 'Chrome', organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          current_uses: 3,
          last_used_at: expect.any(Date),
        })
      );
    });

    it('should log access when validating', async () => {
      const mockMagicLink = createMockMagicLink({
        id: 'token-id',
        is_revoked: false,
      });

      const mockInsertLog = vi.fn().mockResolvedValue([]);

      (db as any).mockImplementation((table: string) => {
        if (table === 'task_access_tokens') {
          return {
            where: vi.fn().mockReturnValue({
              andWhere: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockMagicLink),
              }),
              update: vi.fn().mockResolvedValue(1),
            }),
          };
        }
        if (table === 'task_access_logs') {
          return {
            insert: mockInsertLog,
          };
        }
        return {};
      });

      await magicLinkService.validateToken('valid-token', '192.168.1.1', 'Chrome', organizationId);

      expect(mockInsertLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'viewed',
          ip_address: '192.168.1.1',
          user_agent: 'Chrome',
        })
      );
    });
  });

  describe('claimTask', () => {
    it('should claim task with valid token and matching email', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const mockMagicLink = createMockMagicLink({
        token,
        email: 'external@example.com',
        contributor_id: contributorId,
        task_id: taskId,
        organization_id: organizationId,
        is_revoked: false,
      });

      const mockContributor = createMockExternalContributor({
        id: contributorId,
        organization_id: organizationId,
      });

      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        claimed_at: null,
      });

      // Create chainable mock builder
      const createChainableMock = (resolvedValue: any) => {
        const builder: any = {};
        builder.where = vi.fn().mockImplementation(() => builder);
        builder.andWhere = vi.fn().mockImplementation(() => builder);
        builder.orWhere = vi.fn().mockImplementation(() => builder);
        builder.leftJoin = vi.fn().mockImplementation(() => builder);
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.first = vi.fn().mockResolvedValue(resolvedValue);
        builder.update = vi.fn().mockResolvedValue(1);
        builder.insert = vi.fn().mockResolvedValue([]);
        return builder;
      };

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'task_access_tokens':
            return createChainableMock(mockMagicLink);
          case 'external_contributors':
            return createChainableMock(mockContributor);
          case 'tasks':
            return createChainableMock(mockTask);
          case 'task_access_logs':
            return createChainableMock(null);
          default:
            return createChainableMock(null);
        }
      });

      const result = await magicLinkService.claimTask({
        token,
        firstName: 'John',
        lastName: 'Doe',
        email: 'external@example.com',
      }, '192.168.1.1', 'Chrome', organizationId);

      expect(result).toHaveProperty('task');
      expect(result).toHaveProperty('contributor');
    });

    it('should throw UnauthorizedError for invalid token', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        magicLinkService.claimTask({
          token: 'invalid-token',
          firstName: 'John',
          lastName: 'Doe',
          email: 'external@example.com',
        }, undefined, undefined, organizationId)
      ).rejects.toThrow('Invalid or expired link');
    });

    it('should throw BadRequestError for mismatched email', async () => {
      const mockMagicLink = createMockMagicLink({
        email: 'correct@example.com',
        task_id: taskId,
        is_revoked: false,
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'task_access_tokens') {
          return {
            where: vi.fn().mockReturnValue({
              andWhere: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockMagicLink),
              }),
              update: vi.fn().mockResolvedValue(1),
            }),
          };
        }
        if (table === 'task_access_logs') {
          return {
            insert: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      await expect(
        magicLinkService.claimTask({
          token: 'valid-token',
          firstName: 'John',
          lastName: 'Doe',
          email: 'wrong@example.com',
        }, undefined, undefined, organizationId)
      ).rejects.toThrow('Email does not match the invitation');
    });

    it('should update contributor name if not already set', async () => {
      const mockMagicLink = createMockMagicLink({
        email: 'external@example.com',
        contributor_id: contributorId,
        task_id: taskId,
        organization_id: organizationId,
        is_revoked: false,
      });

      const mockContributor = createMockExternalContributor({
        id: contributorId,
        first_name: null,
        last_name: null,
        organization_id: organizationId,
      });

      const mockContributorUpdate = vi.fn().mockResolvedValue(1);

      // Create chainable mock builder
      const createChainableMock = (resolvedValue: any, updateFn?: any) => {
        const builder: any = {};
        builder.where = vi.fn().mockImplementation(() => builder);
        builder.andWhere = vi.fn().mockImplementation(() => builder);
        builder.orWhere = vi.fn().mockImplementation(() => builder);
        builder.leftJoin = vi.fn().mockImplementation(() => builder);
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.first = vi.fn().mockResolvedValue(resolvedValue);
        builder.update = updateFn || vi.fn().mockResolvedValue(1);
        builder.insert = vi.fn().mockResolvedValue([]);
        return builder;
      };

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'task_access_tokens':
            return createChainableMock(mockMagicLink);
          case 'external_contributors':
            return createChainableMock(mockContributor, mockContributorUpdate);
          case 'tasks':
            return createChainableMock(createMockTask({ claimed_at: null }));
          case 'task_access_logs':
            return createChainableMock(null);
          default:
            return createChainableMock(null);
        }
      });

      await magicLinkService.claimTask({
        token: 'valid-token',
        firstName: 'John',
        lastName: 'Doe',
        email: 'external@example.com',
      }, undefined, undefined, organizationId);

      expect(mockContributorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'John',
          last_name: 'Doe',
        })
      );
    });
  });

  describe('getTaskByToken', () => {
    it('should return task details for valid token', async () => {
      const mockMagicLink = createMockMagicLink({
        task_id: taskId,
        email: 'external@example.com',
        organization_id: organizationId,
        is_revoked: false,
      });

      const mockTask = createMockTask({
        id: taskId,
        title: 'Test Task',
      });

      // Create chainable mock builder
      const createChainableMock = (resolvedValue: any) => {
        const builder: any = {};
        builder.where = vi.fn().mockImplementation(() => builder);
        builder.andWhere = vi.fn().mockImplementation(() => builder);
        builder.orWhere = vi.fn().mockImplementation(() => builder);
        builder.leftJoin = vi.fn().mockImplementation(() => builder);
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.first = vi.fn().mockResolvedValue(resolvedValue);
        builder.update = vi.fn().mockResolvedValue(1);
        builder.insert = vi.fn().mockResolvedValue([]);
        return builder;
      };

      (db as any).mockImplementation((table: string) => {
        if (table === 'task_access_tokens') {
          return createChainableMock(mockMagicLink);
        }
        if (table === 'tasks') {
          return createChainableMock(mockTask);
        }
        return createChainableMock(null);
      });

      const result = await magicLinkService.getTaskByToken('valid-token', organizationId);

      expect(result).toHaveProperty('task');
      expect(result).toHaveProperty('tokenInfo');
      expect(result.tokenInfo.email).toBe('external@example.com');
    });

    it('should throw NotFoundError for invalid token', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        magicLinkService.getTaskByToken('invalid-token', organizationId)
      ).rejects.toThrow('Invalid link');
    });

    it('should throw UnauthorizedError for expired token', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      const mockMagicLink = createMockMagicLink({
        expires_at: expiredDate,
        is_revoked: false,
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockMagicLink),
          }),
        }),
      });

      await expect(
        magicLinkService.getTaskByToken('expired-token', organizationId)
      ).rejects.toThrow('This link has expired');
    });

    it('should throw UnauthorizedError for revoked token', async () => {
      const mockMagicLink = createMockMagicLink({
        is_revoked: true,
      });

      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockMagicLink),
          }),
        }),
      });

      await expect(
        magicLinkService.getTaskByToken('revoked-token', organizationId)
      ).rejects.toThrow('This link has expired');
    });
  });

  describe('revokeToken', () => {
    it('should revoke all tokens for a task when user is creator', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: userId,
        organization_id: organizationId,
      });

      const mockUser = createMockUser({ id: userId, role: 'employee' });

      const mockUpdate = vi.fn().mockResolvedValue(1);

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockTask),
              }),
            };
          case 'users':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockUser),
              }),
            };
          case 'memberships':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  whereIn: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null), // Not org admin
                  }),
                }),
              }),
            };
          case 'task_access_tokens':
            return {
              where: vi.fn().mockReturnValue({
                update: mockUpdate,
              }),
            };
          default:
            return {};
        }
      });

      await magicLinkService.revokeToken(taskId, userId, organizationId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          is_revoked: true,
        })
      );
    });

    it('should throw NotFoundError when task does not exist', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        magicLinkService.revokeToken('nonexistent-task', userId, organizationId)
      ).rejects.toThrow('Task not found');
    });

    it('should throw UnauthorizedError when user is not authorized', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: 'other-user',
        organization_id: organizationId,
      });

      const mockUser = createMockUser({ id: userId, role: 'employee' });

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockTask),
              }),
            };
          case 'users':
            return {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockUser),
              }),
            };
          case 'memberships':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  whereIn: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null),
                  }),
                }),
              }),
            };
          default:
            return {};
        }
      });

      await expect(
        magicLinkService.revokeToken(taskId, userId, organizationId)
      ).rejects.toThrow('You do not have permission to revoke this link');
    });
  });

  describe('getExternalContributors', () => {
    it('should return contributors for organization', async () => {
      const mockContributors = [
        createMockExternalContributor({ id: 'c1', email: 'contrib1@example.com' }),
        createMockExternalContributor({ id: 'c2', email: 'contrib2@example.com' }),
      ];

      (db as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockContributors),
            }),
          }),
        }),
      });

      const result = await magicLinkService.getExternalContributors(organizationId);

      expect(result).toHaveLength(2);
    });

    it('should filter by search term', async () => {
      const mockContributors = [
        createMockExternalContributor({ id: 'c1', email: 'john@example.com', first_name: 'John' }),
      ];

      // Create chainable mock builder that handles callback-style where
      // The builder must be thenable (have .then()) so await works on it
      const builder: any = {};
      const chainMethods = ['select', 'andWhere', 'orWhere', 'orderBy', 'clone', 'count', 'limit'];
      chainMethods.forEach(method => {
        builder[method] = vi.fn().mockImplementation(() => builder);
      });
      // where can accept a callback function (for grouped conditions)
      builder.where = vi.fn().mockImplementation((arg: any) => {
        if (typeof arg === 'function') {
          arg(builder); // Pass builder to callback
        }
        return builder;
      });
      builder.first = vi.fn().mockResolvedValue({ count: 1 });
      // Make the builder thenable so 'await query' returns the mock value
      builder.then = vi.fn().mockImplementation((resolve: any) => resolve(mockContributors));

      (db as any).mockReturnValue(builder);

      await magicLinkService.getExternalContributors(organizationId, 'john');

      // Should apply search filter
      expect(db).toHaveBeenCalledWith('external_contributors');
    });

    it('should respect limit parameter', async () => {
      const mockLimit = vi.fn().mockResolvedValue([]);

      (db as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: mockLimit,
            }),
          }),
        }),
      });

      await magicLinkService.getExternalContributors(organizationId, undefined, 10);

      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe('getContributorAnalytics', () => {
    it('should return analytics for valid contributor', async () => {
      const mockContributor = createMockExternalContributor({
        id: contributorId,
        total_tasks_assigned: 10,
        total_tasks_completed: 8,
        total_tasks_rejected: 1,
      });

      const mockTasks = [createMockTask(), createMockTask()];
      const mockLogs = [];

      (db as any).mockImplementation((table: string) => {
        switch (table) {
          case 'external_contributors':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockContributor),
                }),
              }),
            };
          case 'tasks':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(mockTasks),
                }),
              }),
            };
          case 'task_access_logs':
            return {
              where: vi.fn().mockReturnValue({
                andWhere: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue(mockLogs),
                  }),
                }),
              }),
            };
          default:
            return {};
        }
      });

      const result = await magicLinkService.getContributorAnalytics(organizationId, contributorId);

      expect(result).toHaveProperty('contributor');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('tasks');
      expect(result.stats.completionRate).toBe(80); // 8/10 * 100
    });

    it('should throw NotFoundError for non-existent contributor', async () => {
      (db as any).mockReturnValue({
        where: vi.fn().mockReturnValue({
          andWhere: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        magicLinkService.getContributorAnalytics(organizationId, 'nonexistent-contributor')
      ).rejects.toThrow('Contributor not found in this organization');
    });
  });
});
