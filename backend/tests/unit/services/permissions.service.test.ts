import { vi } from 'vitest';
import { permissionsService, ROLE_PERMISSIONS } from '../../../src/services/permissions-service';
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
      // Mock db response
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ org_role: 'admin' }),
      };
      (db as unknown as any).mockReturnValue(mockQuery);

      const role = await permissionsService.getUserRole(mockUserId, mockOrgId);

      expect(db).toHaveBeenCalledWith('users');
      expect(mockQuery.where).toHaveBeenCalledWith('id', mockUserId);
      expect(mockQuery.where).toHaveBeenCalledWith('organization_id', mockOrgId);
      expect(role).toBe('ADMIN');
    });

    it('should return null if user not found', async () => {
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(undefined),
      };
      (db as unknown as any).mockReturnValue(mockQuery);

      const role = await permissionsService.getUserRole(mockUserId, mockOrgId);
      expect(role).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should return true if user has the permission', async () => {
      // Mock user as OWNER
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ org_role: 'owner' }),
      };
      (db as unknown as any).mockReturnValue(mockQuery);

      // Owners have 'org:delete'
      const result = await permissionsService.hasPermission(mockUserId, mockOrgId, 'org:delete');
      expect(result).toBe(true);
    });

    it('should return false if user does NOT have the permission', async () => {
      // Mock user as MEMBER
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ org_role: 'member' }),
      };
      (db as unknown as any).mockReturnValue(mockQuery);

      // Members do NOT have 'org:delete'
      const result = await permissionsService.hasPermission(mockUserId, mockOrgId, 'org:delete');
      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true if user has higher or equal role (Hierarchy)', async () => {
      // User is ADMIN
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ org_role: 'admin' }),
      };
      (db as unknown as any).mockReturnValue(mockQuery);

      // ADMIN >= MEMBER ? Yes
      const result = await permissionsService.hasRole(mockUserId, mockOrgId, 'MEMBER');
      expect(result).toBe(true);
    });

    it('should return false if user has lower role', async () => {
      // User is MEMBER
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ org_role: 'member' }),
      };
      (db as unknown as any).mockReturnValue(mockQuery);

      // MEMBER >= ADMIN ? No
      const result = await permissionsService.hasRole(mockUserId, mockOrgId, 'ADMIN');
      expect(result).toBe(false);
    });
  });
});
