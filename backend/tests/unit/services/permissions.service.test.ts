import { vi, describe, it, expect, beforeEach } from 'vitest';
import { permissionsService, ROLE_PERMISSIONS } from '../../../src/services/permissions.service';
import { db } from '../../../src/config/database';

// Mock the database
vi.mock('../../../src/config/database', () => ({
  db: vi.fn(),
}));

describe('PermissionsService', () => {
  const mockUserId = 'user-123';
  const mockOrgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserRole', () => {
    it('should return the user role from the database', async () => {
      // The implementation checks:
      // 1. users table for is_system_admin
      // 2. organization_members table for role
      const createMockQuery = (result: any) => ({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(result),
      });

      // First call: users table returns non-admin user
      // Second call: organization_members returns role
      let callCount = 0;
      (db as unknown as any).mockImplementation((table: string) => {
        callCount++;
        if (table === 'users') {
          return createMockQuery({ is_system_admin: false, org_role: null, organization_id: mockOrgId });
        }
        if (table === 'organization_members') {
          return createMockQuery({ role: 'admin' });
        }
        return createMockQuery(null);
      });

      const role = await permissionsService.getUserRole(mockUserId, mockOrgId);

      expect(db).toHaveBeenCalledWith('users');
      // Role is returned uppercased
      expect(role).toBe('ADMIN');
    });

    it('should return null if user not found', async () => {
      const createMockQuery = (result: any) => ({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(result),
      });

      (db as unknown as any).mockImplementation((table: string) => {
        if (table === 'users') {
          return createMockQuery(null);
        }
        return createMockQuery(null);
      });

      const role = await permissionsService.getUserRole(mockUserId, mockOrgId);
      expect(role).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should return true if user has the permission', async () => {
      // Mock user as OWNER via organization_members
      const createMockQuery = (result: any) => ({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(result),
      });

      (db as unknown as any).mockImplementation((table: string) => {
        if (table === 'users') {
          return createMockQuery({ is_system_admin: false, org_role: null, organization_id: mockOrgId });
        }
        if (table === 'organization_members') {
          return createMockQuery({ role: 'owner' });
        }
        return createMockQuery(null);
      });

      // Owners have 'org:delete'
      const result = await permissionsService.hasPermission(mockUserId, mockOrgId, 'org:delete');
      expect(result).toBe(true);
    });

    it('should return false if user does NOT have the permission', async () => {
      // Mock user as MEMBER via organization_members
      const createMockQuery = (result: any) => ({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(result),
      });

      (db as unknown as any).mockImplementation((table: string) => {
        if (table === 'users') {
          return createMockQuery({ is_system_admin: false, org_role: null, organization_id: mockOrgId });
        }
        if (table === 'organization_members') {
          return createMockQuery({ role: 'member' });
        }
        return createMockQuery(null);
      });

      // Members do NOT have 'org:delete'
      const result = await permissionsService.hasPermission(mockUserId, mockOrgId, 'org:delete');
      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true if user has higher or equal role (Hierarchy)', async () => {
      // User is ADMIN via organization_members
      const createMockQuery = (result: any) => ({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(result),
      });

      (db as unknown as any).mockImplementation((table: string) => {
        if (table === 'users') {
          return createMockQuery({ is_system_admin: false, org_role: null, organization_id: mockOrgId });
        }
        if (table === 'organization_members') {
          return createMockQuery({ role: 'admin' });
        }
        return createMockQuery(null);
      });

      // ADMIN >= VIEWER ? Yes (4 >= 1)
      const result = await permissionsService.hasRole(mockUserId, mockOrgId, 'VIEWER');
      expect(result).toBe(true);
    });

    it('should return false if user has lower role', async () => {
      // User is VIEWER via organization_members
      const createMockQuery = (result: any) => ({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(result),
      });

      (db as unknown as any).mockImplementation((table: string) => {
        if (table === 'users') {
          return createMockQuery({ is_system_admin: false, org_role: null, organization_id: mockOrgId });
        }
        if (table === 'organization_members') {
          return createMockQuery({ role: 'viewer' });
        }
        return createMockQuery(null);
      });

      // MEMBER >= ADMIN ? No
      const result = await permissionsService.hasRole(mockUserId, mockOrgId, 'ADMIN');
      expect(result).toBe(false);
    });
  });
});
