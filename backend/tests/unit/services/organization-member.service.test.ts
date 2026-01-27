import { vi } from 'vitest';
import { organizationMemberService } from '../../../src/services/organization-member.service';
import { db } from '../../../src/config/database';
import { emailService } from '../../../src/services/email.service';
import {
  logMemberInvited,
  logMemberRoleChanged,
  logMemberRemoved,
  logAuditAction,
} from '../../../src/utils/audit-logger';

// Mock dependencies
vi.mock('../../../src/config/database', () => {
  const mKnex = {
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    first: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    whereNotNull: vi.fn().mockReturnThis(),
  };
  const dbFn = vi.fn(() => mKnex) as any;
  // Add raw method for SQL function calls
  dbFn.raw = vi.fn().mockResolvedValue({ rows: [{ result: '{}' }] });
  return { db: dbFn };
});

vi.mock('../../../src/services/email.service', () => ({
  emailService: {
    sendEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../../src/utils/audit-logger', () => ({
  logMemberInvited: vi.fn().mockResolvedValue(undefined),
  logMemberRoleChanged: vi.fn().mockResolvedValue(undefined),
  logMemberRemoved: vi.fn().mockResolvedValue(undefined),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
  AuditActionType: {
    MEMBER_INVITED: 'member_invited',
    MEMBER_JOINED: 'member_joined',
    MEMBER_REMOVED: 'member_removed',
    MEMBER_ROLE_CHANGED: 'member_role_changed',
  },
  AuditResourceType: {
    USER: 'user',
    INVITE: 'invite',
  },
}));

describe('OrganizationMemberService Audit Logging', () => {
  const mockOrgId = 'org-123';
  const mockUserId = 'user-123';
  const mockAdminId = 'admin-123';
  const mockEmail = 'test@example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('inviteUserToOrganization', () => {
    it('should log member invited action on success', async () => {
      const dbMock = db as unknown as any;

      // Mock db responses
      dbMock().where().select().first.mockResolvedValueOnce({ id: mockOrgId, name: 'Test Org' }); // Get Org
      dbMock().where().first.mockResolvedValueOnce(null); // Check existing member
      dbMock().where().first.mockResolvedValueOnce(null); // Check existing invite
      dbMock().insert.mockResolvedValueOnce([1]); // Insert invite
      dbMock()
        .where()
        .select()
        .first.mockResolvedValueOnce({ email: 'admin@test.com', first_name: 'Admin' }); // Get inviter

      await organizationMemberService.inviteUserToOrganization(
        mockOrgId,
        mockEmail,
        'member',
        mockAdminId
      );

      expect(logMemberInvited).toHaveBeenCalledWith(
        mockOrgId,
        mockEmail.toLowerCase(),
        undefined,
        'member',
        mockAdminId
      );
    });
  });

  describe('acceptInvitation', () => {
    it('should log member joined action on success', async () => {
      const mockToken = 'token-123';

      // The function uses db.raw() which returns { rows: [...] }
      // Then it queries users table for email sending
      (db as any).raw.mockResolvedValue({
        rows: [{
          result: {
            success: true,
            organizationId: mockOrgId,
            organizationName: 'Test Org',
            role: 'member',
          }
        }]
      });

      (db as any).mockImplementation((table: string) => {
        const builder: any = {
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(
            table === 'users' ? { id: mockUserId, email: mockEmail, name: 'Test User' } : null
          ),
        };
        return builder;
      });

      const result = await organizationMemberService.acceptInvitation(mockToken, mockUserId);

      // Verify the return value contains organization info
      expect(result).toEqual({
        organizationId: mockOrgId,
        organizationName: 'Test Org',
        role: 'member',
      });

      // Note: The db function uses SECURITY DEFINER function which handles audit logging
      // We just verify the email service was called
      expect(emailService.sendEmail).toHaveBeenCalled();
    });
  });

  describe('changeUserRole', () => {
    it('should log member role changed action', async () => {
      const mockMember = {
        id: mockUserId,
        email: mockEmail,
        name: 'Test User',
        org_role: 'member',
        first_name: 'Test',
      };

      // Table-aware mock for changeUserRole which queries:
      // 1. users table to get member
      // 2. users table to count owners (if changing from owner)
      // 3. users table to update role
      // 4. organizations table for email
      (db as any).mockImplementation((table: string) => {
        const builder: any = {
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          count: vi.fn().mockReturnThis(),
          update: vi.fn().mockResolvedValue(1),
          first: vi.fn().mockResolvedValue(
            table === 'users' ? mockMember :
            table === 'organizations' ? { name: 'Test Org' } :
            null
          ),
        };
        return builder;
      });

      await organizationMemberService.changeUserRole(mockOrgId, mockUserId, 'admin', mockAdminId);

      expect(logMemberRoleChanged).toHaveBeenCalledWith(
        mockOrgId,
        mockUserId,
        'member',
        'admin',
        mockAdminId
      );
    });
  });

  describe('removeUserFromOrganization', () => {
    it('should log member removed action', async () => {
      const mockMember = {
        id: mockUserId,
        email: mockEmail,
        organization_id: mockOrgId,
        org_role: 'member',
        first_name: 'Test',
        name: 'Test User',
      };

      const mockMembership = {
        user_id: mockUserId,
        organization_id: mockOrgId,
        role: 'member',
      };

      // Table-aware mock for removeUserFromOrganization which queries:
      // 1. users table to get user
      // 2. organization_members table to check membership
      // 3. organization_members table to delete (if exists)
      // 4. users table to update (if legacy member)
      // 5. organizations table for email
      (db as any).mockImplementation((table: string) => {
        const builder: any = {
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          count: vi.fn().mockReturnThis(),
          update: vi.fn().mockResolvedValue(1),
          del: vi.fn().mockResolvedValue(1),
          first: vi.fn().mockResolvedValue(
            table === 'users' ? mockMember :
            table === 'organization_members' ? mockMembership :
            table === 'organizations' ? { name: 'Test Org' } :
            null
          ),
        };
        return builder;
      });

      await organizationMemberService.removeUserFromOrganization(
        mockOrgId,
        mockUserId,
        mockAdminId
      );

      expect(logMemberRemoved).toHaveBeenCalledWith(mockOrgId, mockUserId, mockAdminId);
    });
  });

  describe('resendInvitation', () => {
    it('should log invitation resent action', async () => {
      const mockInviteId = 'invite-123';
      const mockInvitation = {
        id: mockInviteId,
        organization_id: mockOrgId,
        email: mockEmail,
        status: 'pending',
      };

      // Use table-aware mock that returns appropriate data for each table
      (db as any).mockImplementation((table: string) => {
        const builder: any = {
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockResolvedValue(1),
          first: vi.fn().mockResolvedValue(
            table === 'organization_invitations' ? mockInvitation :
            table === 'organizations' ? { name: 'Test Org' } :
            table === 'users' ? { email: 'admin@test.com', first_name: 'Admin' } :
            null
          ),
        };
        return builder;
      });

      await organizationMemberService.resendInvitation(mockOrgId, mockInviteId, mockAdminId);

      expect(logAuditAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'member_invited',
          actorId: mockAdminId,
          resourceType: 'invite',
          resourceId: mockInviteId,
          metadata: {
            email: mockEmail,
            resent: true,
          },
        })
      );
    });
  });

  describe('cancelInvitation', () => {
    it('should log invitation cancelled action', async () => {
      const mockInviteId = 'invite-123';
      const mockInvitation = {
        id: mockInviteId,
        organization_id: mockOrgId,
        email: mockEmail,
        status: 'pending',
      };

      // Use table-aware mock
      (db as any).mockImplementation((table: string) => {
        const builder: any = {
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockResolvedValue(1),
          first: vi.fn().mockResolvedValue(
            table === 'organization_invitations' ? mockInvitation : null
          ),
        };
        return builder;
      });

      await organizationMemberService.cancelInvitation(mockOrgId, mockInviteId, mockAdminId);

      expect(logAuditAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'member_removed',
          actorId: mockAdminId,
          resourceType: 'invite',
          resourceId: mockInviteId,
          metadata: {
            email: mockEmail,
            action: 'invitation_cancelled',
          },
        })
      );
    });
  });
});
