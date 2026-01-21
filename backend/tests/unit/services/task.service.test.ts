/**
 * Unit tests for Task Service
 *
 * Tests all public methods including:
 * - createTask (CRUD)
 * - getTasks (with filters and pagination)
 * - getTaskById
 * - updateTask
 * - deleteTask
 * - getTaskStatistics
 * - updateTaskProgress
 * - Permission checks
 * - Status transitions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../src/config/database';
import {
  createMockTask,
  createMockUser,
  createMockOrganization,
  createMockQueryBuilder,
  createMockDbWithTables,
} from '../../setup';

describe('TaskService', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '650e8400-e29b-41d4-a716-446655440001';
  const adminUserId = '650e8400-e29b-41d4-a716-446655440099';
  const taskId = '750e8400-e29b-41d4-a716-446655440002';

  let taskService: typeof import('../../../src/services/task.service').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/task.service');
    taskService = module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('createTask', () => {
    it('should create a task with valid data', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        created_by: userId,
        status: 'assigned',
      });

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        title: 'Test Task',
        description: 'Test description',
        type: 'recording' as const,
        priority: 'medium' as const,
        assigned_to: userId,
      };

      const result = await taskService.createTask(userId, createDto, organizationId);

      expect(db).toHaveBeenCalledWith('tasks');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Task',
          description: 'Test description',
          type: 'recording',
          priority: 'medium',
          organization_id: organizationId,
          created_by: userId,
          status: 'assigned',
        })
      );
    });

    it('should default priority to medium if not provided', async () => {
      const mockTask = createMockTask({ priority: 'medium' });

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        title: 'Test Task',
        type: 'recording' as const,
      };

      await taskService.createTask(userId, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'medium',
        })
      );
    });

    it('should convert empty string assigned_to to null', async () => {
      const mockTask = createMockTask({ assigned_to: null });

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        title: 'Test Task',
        type: 'recording' as const,
        assigned_to: '',
      };

      await taskService.createTask(userId, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          assigned_to: null,
        })
      );
    });

    it('should convert empty string due_date to null', async () => {
      const mockTask = createMockTask({ due_date: null });

      const mockInsert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      });

      (db as any).mockReturnValue({
        insert: mockInsert,
      });

      const createDto = {
        title: 'Test Task',
        type: 'recording' as const,
        due_date: '' as any,
      };

      await taskService.createTask(userId, createDto, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          due_date: null,
        })
      );
    });

    it('should throw error when organization ID is missing', async () => {
      // Import and mock getAsyncContext to return no organization_id
      const asyncContext = await import('../../../src/middleware/asyncContext');
      vi.spyOn(asyncContext, 'getAsyncContext').mockReturnValue(null);

      const createDto = {
        title: 'Test Task',
        type: 'recording' as const,
      };

      await expect(
        taskService.createTask(userId, createDto, undefined as any)
      ).rejects.toThrow('Organization ID is required');

      // Restore the spy so other tests aren't affected
      vi.mocked(asyncContext.getAsyncContext).mockRestore();
    });

    it('should create notification when task is assigned to different user', async () => {
      const assigneeId = 'different-user-id';
      const mockTask = createMockTask({
        assigned_to: assigneeId,
        created_by: userId,
      });

      const mockInsertTask = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      });

      const mockInsertNotification = vi.fn().mockResolvedValue([]);

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return { insert: mockInsertTask };
        }
        if (table === 'notifications') {
          return { insert: mockInsertNotification };
        }
        return {};
      });

      const createDto = {
        title: 'Test Task',
        type: 'recording' as const,
        assigned_to: assigneeId,
      };

      await taskService.createTask(userId, createDto, organizationId);

      expect(mockInsertNotification).toHaveBeenCalled();
    });

    it('should not create notification when self-assigned', async () => {
      const mockTask = createMockTask({
        assigned_to: userId,
        created_by: userId,
      });

      const mockInsertTask = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      });

      let notificationInsertCalled = false;

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return { insert: mockInsertTask };
        }
        if (table === 'notifications') {
          notificationInsertCalled = true;
          return { insert: vi.fn().mockResolvedValue([]) };
        }
        return {};
      });

      const createDto = {
        title: 'Test Task',
        type: 'recording' as const,
        assigned_to: userId,
      };

      await taskService.createTask(userId, createDto, organizationId);

      expect(notificationInsertCalled).toBe(false);
    });
  });

  describe('getTasks', () => {
    it('should return tasks with pagination', async () => {
      const mockTasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
      ];

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockTasks),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTasks(userId, 'OWNER', {}, { limit: 10 }, organizationId);

      expect(result.tasks).toHaveLength(2);
      expect(mockChain.limit).toHaveBeenCalledWith(11); // limit + 1 for pagination check
    });

    it('should apply status filter', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'OWNER', { status: 'completed' }, {}, organizationId);

      expect(mockChain.where).toHaveBeenCalledWith('tasks.status', 'completed');
    });

    it('should apply type filter', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'OWNER', { type: 'live_demo' }, {}, organizationId);

      expect(mockChain.where).toHaveBeenCalledWith('tasks.type', 'live_demo');
    });

    it('should apply priority filter', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'OWNER', { priority: 'urgent' }, {}, organizationId);

      expect(mockChain.where).toHaveBeenCalledWith('tasks.priority', 'urgent');
    });

    it('should limit visibility for non-admin users', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'MEMBER', {}, {}, organizationId);

      // Should have visibility filter for non-admin
      expect(mockChain.where).toHaveBeenCalled();
    });

    it('should not limit visibility for OWNER role', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'OWNER', {}, {}, organizationId);

      // OWNER should see all tasks in organization
      expect(mockChain.where).toHaveBeenCalledWith('tasks.organization_id', organizationId);
    });

    it('should not limit visibility for ADMIN role', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'ADMIN', {}, {}, organizationId);

      expect(mockChain.where).toHaveBeenCalledWith('tasks.organization_id', organizationId);
    });

    it('should handle cursor-based pagination', async () => {
      const cursor = '2024-01-01T00:00:00.000Z';
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'OWNER', {}, { cursor }, organizationId);

      expect(mockChain.where).toHaveBeenCalledWith('tasks.created_at', '<', cursor);
    });

    it('should cap limit at 100 (performance fix #7)', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTasks(userId, 'OWNER', {}, { limit: 1000 }, organizationId);

      expect(mockChain.limit).toHaveBeenCalledWith(101); // 100 (MAX_TASKS_PER_PAGE) + 1
    });

    it('should return nextCursor when more results exist', async () => {
      const mockTasks = Array(51).fill(null).map((_, i) =>
        createMockTask({ id: `task-${i}`, created_at: new Date(`2024-01-${String(i + 1).padStart(2, '0')}`) })
      );

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockTasks),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTasks(userId, 'OWNER', {}, { limit: 50 }, organizationId);

      expect(result.tasks).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('getTaskById', () => {
    it('should return task when found', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        created_by: userId,
      });

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTask),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTaskById(taskId, userId, 'OWNER', organizationId);

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundError when task not found', async () => {
      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      (db as any).mockReturnValue(mockChain);

      await expect(
        taskService.getTaskById(taskId, userId, 'OWNER', organizationId)
      ).rejects.toThrow('Task not found');
    });

    it('should allow access for task creator', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        created_by: userId,
        assigned_to: 'other-user',
        reviewed_by: 'another-user',
      });

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTask),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTaskById(taskId, userId, 'MEMBER', organizationId);

      expect(result).toEqual(mockTask);
    });

    it('should allow access for assignee', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        created_by: 'other-user',
        assigned_to: userId,
      });

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTask),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTaskById(taskId, userId, 'MEMBER', organizationId);

      expect(result).toEqual(mockTask);
    });

    it('should allow access for reviewer', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        created_by: 'other-user',
        assigned_to: 'another-user',
        reviewed_by: userId,
      });

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTask),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTaskById(taskId, userId, 'MEMBER', organizationId);

      expect(result).toEqual(mockTask);
    });

    it('should deny access for unrelated MEMBER', async () => {
      const mockTask = createMockTask({
        id: taskId,
        organization_id: organizationId,
        created_by: 'other-user',
        assigned_to: 'another-user',
        reviewed_by: 'third-user',
      });

      const mockChain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTask),
      };

      (db as any).mockReturnValue(mockChain);

      await expect(
        taskService.getTaskById(taskId, userId, 'MEMBER', organizationId)
      ).rejects.toThrow('Task not found');
    });
  });

  describe('updateTask', () => {
    it('should update task with valid data', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: userId,
        status: 'assigned',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const updatedTask = { ...mockTask, title: 'Updated Title' };
      const mockBuilder = createMockQueryBuilder({
        updateReturningResult: [updatedTask],
      });

      (db as any).mockReturnValue(mockBuilder);

      const updateDto = { title: 'Updated Title' };

      const result = await taskService.updateTask(taskId, userId, 'OWNER', updateDto, organizationId);

      expect(mockBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
        })
      );
    });

    it('should set completed_at when status changes to completed', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: userId,
        status: 'in_progress',
        reviewed_by: 'reviewer-id',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const mockUpdateCompleted = vi.fn().mockResolvedValue(1);

      let callCount = 0;
      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          callCount++;
          if (callCount === 1) {
            // First call: main update
            return createMockQueryBuilder({
              updateReturningResult: [{ ...mockTask, status: 'completed' }],
            });
          }
          // Subsequent calls: completed_at update
          const builder = createMockQueryBuilder();
          builder.update = mockUpdateCompleted;
          return builder;
        }
        if (table === 'notifications') {
          return createMockQueryBuilder({ insertResult: [] });
        }
        return createMockQueryBuilder();
      });

      await taskService.updateTask(taskId, userId, 'OWNER', { status: 'completed' }, organizationId);

      expect(mockUpdateCompleted).toHaveBeenCalledWith({ completed_at: expect.any(Date) });
    });

    it('should create notification when assignee changes', async () => {
      const newAssignee = 'new-assignee-id';
      const mockTask = createMockTask({
        id: taskId,
        created_by: userId,
        assigned_to: 'old-assignee-id',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const mockInsertNotification = vi.fn().mockResolvedValue([]);
      const notificationBuilder = createMockQueryBuilder();
      notificationBuilder.insert = mockInsertNotification;

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return createMockQueryBuilder({
            updateReturningResult: [{ ...mockTask, assigned_to: newAssignee }],
          });
        }
        if (table === 'notifications') {
          return notificationBuilder;
        }
        return createMockQueryBuilder();
      });

      await taskService.updateTask(taskId, userId, 'OWNER', { assigned_to: newAssignee }, organizationId);

      expect(mockInsertNotification).toHaveBeenCalled();
    });

    it('should throw error when non-admin tries to update unrelated task', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: 'other-user',
        assigned_to: 'another-user',
        reviewed_by: 'third-user',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      await expect(
        taskService.updateTask(taskId, userId, 'MEMBER', { title: 'New Title' }, organizationId)
      ).rejects.toThrow('You do not have permission to update this task');
    });

    it('should allow assignee to update task', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: 'other-user',
        assigned_to: userId,
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const mockBuilder = createMockQueryBuilder({
        updateReturningResult: [mockTask],
      });

      (db as any).mockReturnValue(mockBuilder);

      await taskService.updateTask(taskId, userId, 'MEMBER', { status: 'in_progress' }, organizationId);

      expect(mockBuilder.update).toHaveBeenCalled();
    });

    it('should convert empty strings to null for UUID fields', async () => {
      const mockTask = createMockTask({ id: taskId, created_by: userId });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const mockBuilder = createMockQueryBuilder({
        updateReturningResult: [mockTask],
      });

      (db as any).mockReturnValue(mockBuilder);

      await taskService.updateTask(taskId, userId, 'OWNER', { assigned_to: '', reviewed_by: '  ' }, organizationId);

      expect(mockBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          assigned_to: null,
          reviewed_by: null,
        })
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete task when user is creator', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: userId,
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const mockDel = vi.fn().mockResolvedValue(1);

      // Create a chainable query builder for transaction
      const createChainableBuilder = () => {
        const builder: any = {};
        builder.where = vi.fn().mockImplementation(() => builder);
        builder.whereIn = vi.fn().mockImplementation(() => builder);
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.del = mockDel;
        builder.delete = mockDel;
        builder.first = vi.fn().mockResolvedValue(null);
        return builder;
      };

      (db as any).mockReturnValue(createChainableBuilder());

      (db as any).transaction = vi.fn(async (callback: any) => {
        const trx = (table: string) => createChainableBuilder();
        return await callback(trx);
      });

      await taskService.deleteTask(taskId, userId, 'MEMBER', organizationId);

      // Transaction should have been called
      expect((db as any).transaction).toHaveBeenCalled();
    });

    it('should delete task when user is OWNER', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: 'other-user',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      // Create a chainable query builder for transaction
      const createChainableBuilder = () => {
        const builder: any = {};
        builder.where = vi.fn().mockImplementation(() => builder);
        builder.whereIn = vi.fn().mockImplementation(() => builder);
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.del = vi.fn().mockResolvedValue(1);
        builder.delete = vi.fn().mockResolvedValue(1);
        builder.first = vi.fn().mockResolvedValue(null);
        return builder;
      };

      (db as any).transaction = vi.fn(async (callback: any) => {
        const trx = (table: string) => createChainableBuilder();
        return await callback(trx);
      });

      await taskService.deleteTask(taskId, userId, 'OWNER', organizationId);

      expect((db as any).transaction).toHaveBeenCalled();
    });

    it('should throw error when non-creator non-admin tries to delete', async () => {
      const mockTask = createMockTask({
        id: taskId,
        created_by: 'other-user',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      await expect(
        taskService.deleteTask(taskId, userId, 'MEMBER', organizationId)
      ).rejects.toThrow('You do not have permission to delete this task');
    });
  });

  describe('getTaskStatistics', () => {
    it('should return task statistics for organization', async () => {
      const mockStats = {
        total: '100',
        pending: '20',
        in_progress: '30',
        completed: '40',
        reviewed: '5',
        overdue: '5',
      };

      const mockChain = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockStats),
      };

      (db as any).mockReturnValue(mockChain);

      const result = await taskService.getTaskStatistics(userId, 'OWNER', organizationId);

      expect(result).toEqual(mockStats);
    });

    it('should filter by user for non-admin roles', async () => {
      const mockStats = { total: '10' };

      const mockChain = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockStats),
      };

      (db as any).mockReturnValue(mockChain);

      await taskService.getTaskStatistics(userId, 'MEMBER', organizationId);

      // Should have visibility filter
      expect(mockChain.where).toHaveBeenCalled();
    });
  });

  describe('updateTaskProgress', () => {
    it('should update progress when user is assignee', async () => {
      const mockTask = createMockTask({
        id: taskId,
        assigned_to: userId,
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const tasksBuilder = createMockQueryBuilder({
        updateReturningResult: [mockTask],
      });
      const mockInsert = vi.fn().mockResolvedValue([]);
      const activityBuilder = createMockQueryBuilder();
      activityBuilder.insert = mockInsert;

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return tasksBuilder;
        }
        if (table === 'activity_logs') {
          return activityBuilder;
        }
        return createMockQueryBuilder();
      });

      await taskService.updateTaskProgress(taskId, userId, 'MEMBER', { status: 'in_progress' }, organizationId);

      expect(tasksBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'in_progress',
        })
      );
    });

    it('should set completed_at when status is completed', async () => {
      const mockTask = createMockTask({
        id: taskId,
        assigned_to: userId,
        status: 'in_progress',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const tasksBuilder = createMockQueryBuilder({
        updateReturningResult: [mockTask],
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return tasksBuilder;
        }
        return createMockQueryBuilder({ insertResult: [] });
      });

      await taskService.updateTaskProgress(taskId, userId, 'MEMBER', { status: 'completed' }, organizationId);

      expect(tasksBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(Date),
        })
      );
    });

    it('should throw error when non-assignee tries to update', async () => {
      const mockTask = createMockTask({
        id: taskId,
        assigned_to: 'other-user',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      await expect(
        taskService.updateTaskProgress(taskId, userId, 'MEMBER', { status: 'in_progress' }, organizationId)
      ).rejects.toThrow('Only the assigned user can update task progress');
    });

    it('should allow ADMIN to update any task progress', async () => {
      const mockTask = createMockTask({
        id: taskId,
        assigned_to: 'other-user',
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const tasksBuilder = createMockQueryBuilder({
        updateReturningResult: [mockTask],
      });

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return tasksBuilder;
        }
        return createMockQueryBuilder({ insertResult: [] });
      });

      await taskService.updateTaskProgress(taskId, userId, 'ADMIN', { status: 'in_progress' }, organizationId);

      expect(tasksBuilder.update).toHaveBeenCalled();
    });

    it('should log activity when progress is updated', async () => {
      const mockTask = createMockTask({
        id: taskId,
        assigned_to: userId,
      });

      vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

      const mockInsert = vi.fn().mockResolvedValue([]);
      const activityBuilder = createMockQueryBuilder();
      activityBuilder.insert = mockInsert;

      (db as any).mockImplementation((table: string) => {
        if (table === 'tasks') {
          return createMockQueryBuilder({
            updateReturningResult: [mockTask],
          });
        }
        if (table === 'activity_logs') {
          return activityBuilder;
        }
        return createMockQueryBuilder();
      });

      await taskService.updateTaskProgress(taskId, userId, 'MEMBER', { actual_duration: 30 }, organizationId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          action: 'updated_task_progress',
          entity_type: 'task',
          entity_id: taskId,
        })
      );
    });
  });

  describe('Status transitions', () => {
    const transitions = [
      { from: 'draft', to: 'assigned' },
      { from: 'assigned', to: 'in_progress' },
      { from: 'in_progress', to: 'submitted' },
      { from: 'submitted', to: 'in_review' },
      { from: 'in_review', to: 'completed' },
      { from: 'in_review', to: 'rejected' },
    ];

    transitions.forEach(({ from, to }) => {
      it(`should allow transition from ${from} to ${to}`, async () => {
        const mockTask = createMockTask({
          id: taskId,
          created_by: userId,
          status: from,
        });

        vi.spyOn(taskService, 'getTaskById').mockResolvedValue(mockTask);

        const tasksBuilder = createMockQueryBuilder({
          updateReturningResult: [{ ...mockTask, status: to }],
        });

        (db as any).mockImplementation((table: string) => {
          if (table === 'tasks') {
            return tasksBuilder;
          }
          return createMockQueryBuilder({ insertResult: [] });
        });

        const result = await taskService.updateTask(taskId, userId, 'OWNER', { status: to }, organizationId);

        expect(tasksBuilder.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: to,
          })
        );
      });
    });
  });
});
