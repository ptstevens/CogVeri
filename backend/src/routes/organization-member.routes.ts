import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireTrialWriteAccess } from '../middleware/quota-enforcer';
import { organizationMemberService } from '../services/organization-member.service';
import { db } from '../config/database';

const router = Router();

/**
 * Get all members of an organization
 * GET /api/organizations/:organizationId/members
 *
 * Query: { limit=100, offset=0, status='all'|'active'|'inactive' }
 * Returns: { members: [], total, hasMore }
 */
router.get('/:organizationId/members', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = req.params.organizationId!;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = (req.query.status as 'active' | 'inactive' | 'all') || 'all';

    // Set RLS context to target organization for this operation
    await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

    // Check if user is member of organization
    const isMember = await organizationMemberService.getMember(organizationId, userId);
    if (!isMember) {
      res.status(403).json({
        error: 'You are not a member of this organization',
      });
      return;
    }

    // Get members with status filter
    const members = await organizationMemberService.getOrganizationMembers(organizationId, {
      limit,
      offset,
      status,
    });

    // Get total count for the specific status
    const total = await organizationMemberService.getMemberCount(
      organizationId,
      status === 'all' ? undefined : status
    );

    res.json({
      success: true,
      data: {
        members,
        total,
        hasMore: offset + members.length < total,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to fetch organization members',
    });
  }
});

/**
 * Get single member details
 * GET /api/organizations/:organizationId/members/:memberId
 */
router.get(
  '/:organizationId/members/:memberId',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const memberId = req.params.memberId!;
      const userId = req.user!.id;

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is member of organization
      const isMember = await organizationMemberService.getMember(organizationId, userId);
      if (!isMember) {
        res.status(403).json({
          error: 'You are not a member of this organization',
        });
        return;
      }

      // Get member
      const member = await organizationMemberService.getMember(organizationId, memberId);

      if (!member) {
        res.status(404).json({
          error: 'Member not found',
        });
        return;
      }

      res.json({
        success: true,
        data: member,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to fetch member',
      });
    }
  }
);

/**
 * Invite user to organization
 * POST /api/organizations/:organizationId/members/invite
 *
 * Body: { email, role='limited' }
 * Returns: { invitationId, email, status, expiresAt }
 */
router.post(
  '/:organizationId/members/invite',
  enhancedAuthenticate,
  requireTrialWriteAccess(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const { email, role = 'limited' } = req.body;
      const userId = req.user!.id;

      if (!email) {
        res.status(400).json({
          error: 'Missing required field: email',
        });
        return;
      }

      // Set RLS context to target organization for this operation
      // This is needed because the JWT token's org_id may differ from the target organization
      // (e.g., after creating a new org or when multi-org user is viewing a different org)
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can invite members',
        });
        return;
      }

      // Validate role
      const validRoles = ['owner', 'admin', 'limited', 'viewer', 'reviewer'];
      if (!validRoles.includes(role)) {
        res.status(400).json({
          error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
        return;
      }

      // Send invitation
      const result = await organizationMemberService.inviteUserToOrganization(
        organizationId,
        email,
        role,
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to invite user',
      });
    }
  }
);

/**
 * Accept organization invitation
 * POST /api/organizations/:organizationId/members/accept-invitation
 *
 * Body: { invitationToken }
 */
router.post(
  '/:organizationId/members/accept-invitation',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { invitationToken } = req.body;
      const userId = req.user!.id;

      if (!invitationToken) {
        res.status(400).json({
          error: 'Missing required field: invitationToken',
        });
        return;
      }

      // Accept invitation
      await organizationMemberService.acceptInvitation(invitationToken, userId);

      res.json({
        success: true,
        message: 'Invitation accepted successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to accept invitation',
      });
    }
  }
);

/**
 * Get pending invitations for organization
 * GET /api/organizations/:organizationId/members/invitations/pending
 */
router.get(
  '/:organizationId/members/invitations/pending',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const userId = req.user!.id;

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can view pending invitations',
        });
        return;
      }

      // Get pending invitations
      const invitations = await organizationMemberService.getPendingInvitations(organizationId);

      res.json({
        success: true,
        data: {
          invitations,
          total: invitations.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to fetch invitations',
      });
    }
  }
);

/**
 * Resend organization invitation
 * POST /api/organizations/:organizationId/members/invitations/:invitationId/resend
 */
router.post(
  '/:organizationId/members/invitations/:invitationId/resend',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const invitationId = req.params.invitationId!;
      const userId = req.user!.id;

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can resend invitations',
        });
        return;
      }

      // Resend invitation
      const result = await organizationMemberService.resendInvitation(
        organizationId,
        invitationId,
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to resend invitation',
      });
    }
  }
);

/**
 * Cancel pending invitation
 * DELETE /api/organizations/:organizationId/members/invitations/:invitationId
 */
router.delete(
  '/:organizationId/members/invitations/:invitationId',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const invitationId = req.params.invitationId!;
      const userId = req.user!.id;

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can cancel invitations',
        });
        return;
      }

      // Cancel invitation
      await organizationMemberService.cancelInvitation(organizationId, invitationId, userId);

      res.json({
        success: true,
        message: 'Invitation cancelled',
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to cancel invitation',
      });
    }
  }
);

/**
 * Update pending invitation role
 * PUT /api/organizations/:organizationId/members/invitations/:invitationId/role
 *
 * Body: { role: 'owner' | 'admin' | 'limited' | 'viewer' }
 */
router.put(
  '/:organizationId/members/invitations/:invitationId/role',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const invitationId = req.params.invitationId!;
      const { role } = req.body;
      const userId = req.user!.id;

      if (!role || !['owner', 'admin', 'limited', 'viewer'].includes(role)) {
        res.status(400).json({
          error: 'Valid role required (owner, admin, limited, viewer)',
        });
        return;
      }

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can update invitation roles',
        });
        return;
      }

      // Update invitation role
      const result = await organizationMemberService.updateInvitationRole(
        organizationId,
        invitationId,
        role,
        userId
      );

      res.json({
        success: true,
        data: result,
        message: 'Invitation role updated',
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to update invitation role',
      });
    }
  }
);

/**
 * Update member status (activate/deactivate)
 * PUT /api/organizations/:organizationId/members/:memberId/status
 *
 * Body: { status: 'active' | 'inactive' }
 */
router.put(
  '/:organizationId/members/:memberId/status',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const memberId = req.params.memberId!;
      const { status } = req.body;
      const userId = req.user!.id;

      if (!status || !['active', 'inactive'].includes(status)) {
        res.status(400).json({
          error: 'Valid status required (active or inactive)',
        });
        return;
      }

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can change member status',
        });
        return;
      }

      let result;
      if (status === 'inactive') {
        result = await organizationMemberService.deactivateMember(organizationId, memberId, userId);
      } else {
        result = await organizationMemberService.reactivateMember(organizationId, memberId, userId);
      }

      res.json({
        success: true,
        data: result,
        message: status === 'inactive' ? 'Member deactivated' : 'Member reactivated',
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to update member status',
      });
    }
  }
);

/**
 * Change user role in organization
 * PUT /api/organizations/:organizationId/members/:memberId/role
 *
 * Body: { role }
 * Returns: { userId, email, previousRole, newRole, changedAt }
 */
router.put(
  '/:organizationId/members/:memberId/role',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const memberId = req.params.memberId!;
      const { role } = req.body;
      const userId = req.user!.id;

      if (!role) {
        res.status(400).json({
          error: 'Missing required field: role',
        });
        return;
      }

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can change member roles',
        });
        return;
      }

      // Validate role
      const validRoles = ['owner', 'admin', 'limited', 'viewer', 'reviewer'];
      if (!validRoles.includes(role)) {
        res.status(400).json({
          error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
        return;
      }

      // Prevent demoting yourself
      if (memberId === userId && role !== 'owner') {
        res.status(400).json({
          error: 'Cannot change your own role',
        });
        return;
      }

      // Change role
      const result = await organizationMemberService.changeUserRole(
        organizationId,
        memberId,
        role as 'owner' | 'admin' | 'limited' | 'viewer',
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to change member role',
      });
    }
  }
);

/**
 * Remove user from organization
 * DELETE /api/organizations/:organizationId/members/:memberId
 */
router.delete(
  '/:organizationId/members/:memberId',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const memberId = req.params.memberId!;
      const userId = req.user!.id;

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can remove members',
        });
        return;
      }

      // Prevent removing yourself
      if (memberId === userId) {
        res.status(400).json({
          error: 'Cannot remove yourself from organization. Transfer ownership first.',
        });
        return;
      }

      // Remove member
      const result = await organizationMemberService.removeUserFromOrganization(
        organizationId,
        memberId,
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to remove member',
      });
    }
  }
);

/**
 * Transfer organization ownership to another member
 * POST /api/organizations/:organizationId/members/:memberId/transfer-ownership
 *
 * Only the current owner can transfer ownership.
 * This promotes the target user to owner and demotes the current owner to admin.
 */
router.post(
  '/:organizationId/members/:memberId/transfer-ownership',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId!;
      const newOwnerId = req.params.memberId!;
      const currentUserId = req.user!.id;

      // Set RLS context to target organization for this operation
      await db.raw('SELECT set_current_org(?::uuid)', [organizationId]);

      // Verify current user is an owner (done in service, but check here for better error message)
      const currentUser = await organizationMemberService.getMember(organizationId, currentUserId);
      if (!currentUser || currentUser.orgRole !== 'owner') {
        res.status(403).json({
          error: 'Only organization owners can transfer ownership',
        });
        return;
      }

      // Cannot transfer to yourself
      if (newOwnerId === currentUserId) {
        res.status(400).json({
          error: 'Cannot transfer ownership to yourself',
        });
        return;
      }

      // Transfer ownership
      const result = await organizationMemberService.transferOwnership(
        organizationId,
        newOwnerId,
        currentUserId
      );

      res.json({
        success: true,
        data: result,
        message: `Ownership transferred to ${result.newOwner.email}`,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Failed to transfer ownership',
      });
    }
  }
);

export default router;
