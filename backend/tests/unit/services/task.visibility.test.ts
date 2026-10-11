import { vi } from 'vitest';
import taskService from '../../../src/services/task.service';
import { db } from '../../../src/config/database';

// Mock the database
vi.mock('../../../src/config/database', () => {
  const mockQueryBuilder: any = {
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    first: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((callback: any) => Promise.resolve([]).then(callback)),
  };
  return {
    db: vi.fn(() => mockQueryBuilder),
  };
});

describe('TaskService Visibility', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = db();
  });

  it('should NOT filter by user for ADMIN role with scope=all', async () => {
    const userId = 'user-123';
    const userRole = 'ADMIN';
    const orgId = 'org-123';

    // Admin must explicitly request scope: 'all' to see all org tasks
    await taskService.getTasks(userId, userRole, { scope: 'all' }, {}, orgId);

    // Verify organization filter is applied
    expect(mockDb.where).toHaveBeenCalledWith('tasks.organization_id', orgId);

    const whereCalls = (mockDb.where as any).mock.calls;
    // We want to ensure NO function was passed to where() (which represents the complex user filter)
    const functionArgs = whereCalls.filter((call) => typeof call[0] === 'function');
    expect(functionArgs.length).toBe(0);
  });

  it('should NOT filter by user for OWNER role with scope=all', async () => {
    const userId = 'user-123';
    const userRole = 'OWNER';
    const orgId = 'org-123';

    // Owner must explicitly request scope: 'all' to see all org tasks
    await taskService.getTasks(userId, userRole, { scope: 'all' }, {}, orgId);

    const whereCalls = (mockDb.where as any).mock.calls;
    const functionArgs = whereCalls.filter((call) => typeof call[0] === 'function');
    expect(functionArgs.length).toBe(0);
  });

  it('should filter by user for REVIEWER role', async () => {
    const userId = 'user-123';
    const userRole = 'REVIEWER';
    const orgId = 'org-123';

    await taskService.getTasks(userId, userRole, {}, {}, orgId);

    const whereCalls = (mockDb.where as any).mock.calls;
    // Must contain a function call for the complex AND ( ... OR ... OR ... ) logic
    const functionArgs = whereCalls.filter((call) => typeof call[0] === 'function');
    expect(functionArgs.length).toBeGreaterThan(0);
  });

  it('should filter by user for MEMBER role', async () => {
    const userId = 'user-123';
    const userRole = 'MEMBER';
    const orgId = 'org-123';

    await taskService.getTasks(userId, userRole, {}, {}, orgId);

    const whereCalls = (mockDb.where as any).mock.calls;
    const functionArgs = whereCalls.filter((call) => typeof call[0] === 'function');
    expect(functionArgs.length).toBeGreaterThan(0);
  });
});
