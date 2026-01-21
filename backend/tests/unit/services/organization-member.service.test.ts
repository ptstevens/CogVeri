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
  return { db: vi.fn(() => mKnex) };
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
      const dbMock = db as unknown as any;

      // Mock invitation
      const mockInvitation = {
        id: 'invite-123',
        organization_id: mockOrgId,
        email: mockEmail,
        role: 'member',
        status: 'pending',
        expires_at: new Date(Date.now() + 10000),
      };

      dbMock().where().first.mockResolvedValueOnce(mockInvitation); // Find invitation
      dbMock().where().first.mockResolvedValueOnce({ id: mockUserId, email: mockEmail }); // Find user
      dbMock().update.mockResolvedValueOnce(1); // Update user
      dbMock().update.mockResolvedValueOnce(1); // Update invitation
      dbMock().where().select().first.mockResolvedValueOnce({ name: 'Test Org' }); // Get org for email

      await organizationMemberService.acceptInvitation(mockToken, mockUserId);

      expect(logAuditAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'member_joined',
          actorId: mockUserId,
          organizationId: mockOrgId,
          resourceType: 'user',
          resourceId: mockUserId,
        })
      );
    });
  });

  describe('changeUserRole', () => {
    it('should log member role changed action', async () => {
      const dbMock = db as unknown as any;

      const mockMember = {
        id: mockUserId,
        email: mockEmail,
        org_role: 'member',
        first_name: 'Test',
      };

      dbMock().where().first.mockResolvedValueOnce(mockMember); // Get member
      dbMock().update.mockResolvedValueOnce(1); // Update role
      dbMock().where().select().first.mockResolvedValueOnce({ name: 'Test Org' }); // Get org for email

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
      const dbMock = db as unknown as any;

      const mockMember = {
        id: mockUserId,
        email: mockEmail,
        org_role: 'member',
        first_name: 'Test',
      };

      dbMock().where().first.mockResolvedValueOnce(mockMember); // Get member
      dbMock().update.mockResolvedValueOnce(1); // Update user (remove)
      dbMock().where().select().first.mockResolvedValueOnce({ name: 'Test Org' }); // Get org for email

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
      const dbMock = db as unknown as any;
      const mockInviteId = 'invite-123';

      const mockInvitation = {
        id: mockInviteId,
        organization_id: mockOrgId,
        email: mockEmail,
        status: 'pending',
      };

      dbMock().where().first.mockResolvedValueOnce(mockInvitation); // Find invitation
      dbMock().update.mockResolvedValueOnce(1); // Update invitation
      dbMock().where().select().first.mockResolvedValueOnce({ name: 'Test Org' }); // Get org
      dbMock()
        .where()
        .select()
        .first.mockResolvedValueOnce({ email: 'admin@test.com', first_name: 'Admin' }); // Get inviter

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
      const dbMock = db as unknown as any;
      const mockInviteId = 'invite-123';

      const mockInvitation = {
        id: mockInviteId,
        organization_id: mockOrgId,
        email: mockEmail,
        status: 'pending',
      };

      dbMock().where().first.mockResolvedValueOnce(mockInvitation); // Find invitation
      dbMock().update.mockResolvedValueOnce(1); // Update invitation (cancel)

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
