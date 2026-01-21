import { db } from '../config/database';
import { emailService } from './email.service';
import {
  logMemberInvited,
  logMemberRoleChanged,
  logMemberRemoved,
  logAuditAction,
  AuditActionType,
  AuditResourceType,
} from '../utils/audit-logger';
import {
  generateEmailTemplate,
  createInfoCard,
  BRAND_COLORS,
} from '../utils/email-templates';

// Use require for uuid to ensure CommonJS compatibility
const { v4: uuidv4 } = require('uuid');

/**
 * Organization Member Management Service
 *
 * Handles:
 * - Inviting users to organizations
 * - Changing user roles within organization
 * - Removing users from organization
 * - Listing organization members
 * - Managing member status (active, invited, pending)
 */

export interface OrganizationMember {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  orgRole: 'owner' | 'admin' | 'limited' | 'viewer';
  orgStatus: 'active' | 'inactive' | 'pending' | 'invited';
  joinedAt?: Date;
  invitedAt?: Date;
  lastActivityAt?: Date;
}

export interface InvitationResult {
  invitationId: string;
  email: string;
  status: 'sent' | 'pending';
  expiresAt: Date;
  invitedBy: string;
}

export interface RoleChangeResult {
  userId: string;
  email: string;
  previousRole: string;
  newRole: string;
  changedAt: Date;
}

export interface RemoveResult {
  userId: string;
  email: string;
  removedAt: Date;
  organizationId: string;
}

const INVITATION_EXPIRY_HOURS = 7 * 24; // 7 days

class OrganizationMemberService {
  /**
   * Get all members of an organization
   * @param status - Filter by status: 'active', 'inactive', or 'all' (default: 'all')
   */
  async getOrganizationMembers(
    organizationId: string,
    options: { limit?: number; offset?: number; status?: 'active' | 'inactive' | 'all' } = {}
  ): Promise<OrganizationMember[]> {
    const { limit = 100, offset = 0, status = 'all' } = options;

    try {
      // First try organization_members table (new multi-org model)
      let query = db('organization_members as om')
        .join('users as u', 'u.id', 'om.user_id')
        .where('om.organization_id', organizationId);

      // Filter by status if specified
      if (status === 'active') {
        query = query.where('om.status', 'active');
      } else if (status === 'inactive') {
        query = query.where('om.status', 'inactive');
      }
      // 'all' returns everything

      const members = await query
        .select(
          'u.id',
          'u.email',
          'u.name',
          'u.avatar_url as avatarUrl',
          'om.role as orgRole',
          'om.status as orgStatus',
          'om.joined_at as joinedAt',
          'u.created_at as createdAt'
        )
        .limit(limit)
        .offset(offset)
        .orderBy('om.joined_at', 'desc');

      // If we found members in organization_members, return them
      if (members.length > 0) {
        return members;
      }

      // Fallback to legacy users table (transition period)
      let legacyQuery = db('users')
        .where('organization_id', organizationId)
        .whereNotNull('org_role');

      // Filter by status if specified
      // Treat NULL org_status as 'active' (default state)
      if (status === 'active') {
        legacyQuery = legacyQuery.where(function() {
          this.where('org_status', 'active').orWhereNull('org_status');
        });
      } else if (status === 'inactive') {
        legacyQuery = legacyQuery.where('org_status', 'inactive');
      }

      const legacyMembers = await legacyQuery
        .select(
          'id',
          'email',
          'name',
          'avatar_url as avatarUrl',
          'org_role as orgRole',
          'org_status as orgStatus',
          'joined_organization_at as joinedAt',
          'created_at as createdAt'
        )
        .limit(limit)
        .offset(offset)
        .orderBy('created_at', 'desc');

      return legacyMembers;
    } catch (error: any) {
      throw new Error(`Failed to fetch organization members: ${error.message}`);
    }
  }

  /**
   * Get member count for organization
   * @param filter - Filter by status: 'active', 'inactive', 'pending', 'invited', or undefined for all
   */
  async getMemberCount(
    organizationId: string,
    filter?: 'active' | 'inactive' | 'pending' | 'invited'
  ): Promise<number> {
    try {
      // First try organization_members table (new multi-org model)
      let query = db('organization_members').where('organization_id', organizationId);

      if (filter) {
        query = query.where('status', filter);
      }

      const result = await query.count('id as count').first();
      const count = parseInt(String(result?.count ?? 0), 10);

      // If count > 0, return it; otherwise fall back to legacy table
      if (count > 0) {
        return count;
      }

      // Fallback to legacy users table (transition period)
      let legacyQuery = db('users').where('organization_id', organizationId).whereNotNull('org_role');

      // Treat NULL org_status as 'active' (default state)
      if (filter === 'active') {
        legacyQuery = legacyQuery.where(function() {
          this.where('org_status', 'active').orWhereNull('org_status');
        });
      } else if (filter) {
        legacyQuery = legacyQuery.where('org_status', filter);
      }

      const legacyResult = await legacyQuery.count('id as count').first();
      return parseInt(String(legacyResult?.count ?? 0), 10);
    } catch (error: any) {
      throw new Error(`Failed to count organization members: ${error.message}`);
    }
  }

  /**
   * Get single member details
   */
  async getMember(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    try {
      // First check organization_members table (new multi-org model)
      const membership = await db('organization_members as om')
        .join('users as u', 'u.id', 'om.user_id')
        .where('om.organization_id', organizationId)
        .where('om.user_id', userId)
        .where('om.status', 'active')
        .select(
          'u.id',
          'u.email',
          'u.name',
          'u.avatar_url as avatarUrl',
          'om.role as orgRole',
          'om.status as orgStatus',
          'om.joined_at as joinedAt',
          'u.created_at as createdAt'
        )
        .first();

      if (membership) {
        return membership;
      }

      // Fallback to legacy users table (transition period)
      const legacyMember = await db('users')
        .where('organization_id', organizationId)
        .where('id', userId)
        .select(
          'id',
          'email',
          'name',
          'avatar_url as avatarUrl',
          'org_role as orgRole',
          'org_status as orgStatus',
          'joined_organization_at as joinedAt',
          'created_at as createdAt'
        )
        .first();

      return legacyMember || null;
    } catch (error: any) {
      throw new Error(`Failed to fetch organization member: ${error.message}`);
    }
  }

  /**
   * Invite user to organization by email
   * Creates invitation record, sends email with join link
   */
  async inviteUserToOrganization(
    organizationId: string,
    inviteEmail: string,
    role: string = 'limited',
    invitedByUserId: string
  ): Promise<InvitationResult> {
    const inviteEmail_lower = inviteEmail.toLowerCase();

    try {
      // Get organization details
      const org = await db('organizations')
        .where('id', organizationId)
        .select('id', 'name')
        .first();

      if (!org) {
        throw new Error('Organization not found');
      }

      // Check if user already exists in this organization
      const existingMember = await db('users')
        .where('organization_id', organizationId)
        .where('email', inviteEmail_lower)
        .first();

      if (existingMember) {
        throw new Error(`User is already a member of ${org.name}`);
      }

      // Check if email already has pending invitation
      const existingInvitation = await db('organization_invitations')
        .where('organization_id', organizationId)
        .where('email', inviteEmail_lower)
        .where('status', 'pending')
        .first();

      if (existingInvitation) {
        throw new Error(`Invitation already pending for ${inviteEmail}`);
      }

      // Create invitation record
      const invitationId = uuidv4();
      const invitationToken = this.generateInvitationToken();
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

      await db('organization_invitations').insert({
        id: invitationId,
        organization_id: organizationId,
        email: inviteEmail_lower,
        role: role,
        invitation_token: invitationToken,
        invited_by: invitedByUserId,
        status: 'pending',
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Get inviter info for email
      const inviter = await db('users')
        .where('id', invitedByUserId)
        .select('email', 'name')
        .first();

      // Send invitation email
      const inviteLink = `${process.env.FRONTEND_URL}/auth/join-organization?token=${invitationToken}`;
      const inviterName = inviter.name || inviter.email;

      const inviteHtml = generateEmailTemplate({
        title: `You're Invited to Join ${org.name}!`,
        preheader: `${inviterName} has invited you to collaborate on CogVeri`,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi there! 👋</p>

          <p><strong>${inviterName}</strong> has invited you to join their team on CogVeri.</p>

          ${createInfoCard(`
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding: 10px 0;">
                  <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">ORGANIZATION</p>
                  <p style="margin: 0; font-size: 20px; font-weight: 600; color: ${BRAND_COLORS.text};">${org.name}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-top: 1px solid #E5E7EB;">
                  <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">YOUR ROLE</p>
                  <p style="margin: 0; font-size: 16px; font-weight: 500; color: ${BRAND_COLORS.primary};">${role.charAt(0).toUpperCase() + role.slice(1)}</p>
                </td>
              </tr>
            </table>
          `)}

          <p style="margin-top: 25px;">As a member, you'll be able to:</p>
          <ul style="margin: 15px 0; padding-left: 20px; color: ${BRAND_COLORS.text};">
            <li style="margin-bottom: 8px;">📹 Record and submit screen demonstrations</li>
            <li style="margin-bottom: 8px;">✅ Collaborate with your team on tasks</li>
            <li style="margin-bottom: 8px;">📊 Track progress and manage workflows</li>
          </ul>
        `,
        ctaButton: {
          text: 'Accept Invitation',
          url: inviteLink,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
            ⏰ This invitation expires in <strong>7 days</strong>.<br>
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: inviteEmail_lower,
        subject: `🎉 You're invited to join ${org.name} on CogVeri`,
        html: inviteHtml,
      });

      // Log the invitation
      await logMemberInvited(
        organizationId,
        inviteEmail_lower,
        undefined, // inviteeId not known yet
        role,
        invitedByUserId
      );

      return {
        invitationId,
        email: inviteEmail_lower,
        status: 'sent',
        expiresAt,
        invitedBy: inviter.email,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Accept organization invitation
   * Called by user when clicking invitation link
   *
   * Uses a SECURITY DEFINER PostgreSQL function to bypass RLS,
   * allowing the invitation acceptance to work even when called
   * from public (unauthenticated) registration endpoints.
   */
  async acceptInvitation(invitationToken: string, userId: string): Promise<void> {
    try {
      // Use the SECURITY DEFINER function to bypass RLS for invitation acceptance
      // This function validates, creates membership, updates invitation, and logs audit
      // See migration 077_create_public_invitation_functions.ts
      const result = await db.raw(
        'SELECT public.accept_invitation_for_user(?, ?::uuid) as result',
        [invitationToken, userId]
      );

      const data = result.rows[0]?.result;

      if (!data || !data.success) {
        throw new Error(data?.error || 'Failed to accept invitation');
      }

      // Get user details for welcome email (this is safe, users table doesn't have org RLS)
      const user = await db('users').where('id', userId).first();
      const userName = user?.name || user?.email?.split('@')[0] || 'there';
      const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;

      // Send welcome email
      const welcomeHtml = generateEmailTemplate({
        title: `Welcome to ${data.organizationName}!`,
        preheader: `You're now part of the team. Let's get started!`,
        headerColor: BRAND_COLORS.success,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${userName}! 🎉</p>

          <p>Congratulations! You've successfully joined <strong>${data.organizationName}</strong> on CogVeri.</p>

          ${createInfoCard(`
            <div style="text-align: center; padding: 10px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">YOU'VE JOINED</p>
              <p style="margin: 0; font-size: 24px; font-weight: 700; color: ${BRAND_COLORS.primary};">${data.organizationName}</p>
              <p style="margin: 10px 0 0 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">as <strong style="color: ${BRAND_COLORS.text};">${data.role.charAt(0).toUpperCase() + data.role.slice(1)}</strong></p>
            </div>
          `, BRAND_COLORS.success)}

          <p style="margin-top: 25px;"><strong>Here's what you can do next:</strong></p>
          <ol style="margin: 15px 0; padding-left: 20px; color: ${BRAND_COLORS.text};">
            <li style="margin-bottom: 10px;">
              <strong>Explore the Dashboard</strong><br>
              <span style="color: ${BRAND_COLORS.textMuted};">See your tasks and team activity</span>
            </li>
            <li style="margin-bottom: 10px;">
              <strong>Check Your Tasks</strong><br>
              <span style="color: ${BRAND_COLORS.textMuted};">View any assigned recordings or demonstrations</span>
            </li>
            <li style="margin-bottom: 10px;">
              <strong>Update Your Profile</strong><br>
              <span style="color: ${BRAND_COLORS.textMuted};">Add your photo and details</span>
            </li>
          </ol>
        `,
        ctaButton: {
          text: 'Go to Dashboard',
          url: dashboardUrl,
          color: BRAND_COLORS.success,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
            Need help getting started? Check out our <a href="${process.env.FRONTEND_URL}/help" style="color: ${BRAND_COLORS.primary};">help center</a> or contact your team admin.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: user.email,
        subject: `🎊 Welcome to ${data.organizationName}!`,
        html: welcomeHtml,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Resend organization invitation
   */
  async resendInvitation(
    organizationId: string,
    invitationId: string,
    initiatedByUserId: string
  ): Promise<InvitationResult> {
    try {
      const invitation = await db('organization_invitations')
        .where('id', invitationId)
        .where('organization_id', organizationId)
        .first();

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw new Error('Can only resend pending invitations');
      }

      // Generate new token
      const newToken = this.generateInvitationToken();
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

      // Update invitation
      await db('organization_invitations').where('id', invitationId).update({
        invitation_token: newToken,
        expires_at: expiresAt,
        updated_at: new Date(),
      });

      // Get org details
      const org = await db('organizations').where('id', organizationId).select('name').first();

      // Get inviter info
      const inviter = await db('users')
        .where('id', initiatedByUserId)
        .select('email', 'name')
        .first();

      // Send email
      const inviteLink = `${process.env.FRONTEND_URL}/auth/join-organization?token=${newToken}`;
      const inviterName = inviter.name || inviter.email;

      const reminderHtml = generateEmailTemplate({
        title: `Reminder: Join ${org.name}`,
        preheader: `Don't miss your chance to join ${org.name} on CogVeri!`,
        headerColor: BRAND_COLORS.warning,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi there! 👋</p>

          <p>Just a friendly reminder that <strong>${inviterName}</strong> invited you to join <strong>${org.name}</strong> on CogVeri.</p>

          ${createInfoCard(`
            <div style="text-align: center; padding: 15px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.warning}; font-size: 14px; font-weight: 600;">⏳ DON'T MISS OUT!</p>
              <p style="margin: 0; font-size: 18px; color: ${BRAND_COLORS.text};">Your invitation is still waiting</p>
              <p style="margin: 10px 0 0 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">Expires in 7 days</p>
            </div>
          `, BRAND_COLORS.warning)}

          <p style="margin-top: 25px;">Join now to start collaborating with your team!</p>
        `,
        ctaButton: {
          text: 'Accept Invitation Now',
          url: inviteLink,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
            If you're not interested, you can simply ignore this email.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: invitation.email,
        subject: `⏰ Reminder: Your invitation to join ${org.name} is waiting`,
        html: reminderHtml,
      });

      // Log the resend (using generic logAuditAction as there isn't a specific helper for resend)
      await logAuditAction({
        organizationId,
        actorId: initiatedByUserId,
        action: AuditActionType.MEMBER_INVITED, // Re-using member_invited or could add INVITATION_RESENT
        resourceType: AuditResourceType.INVITE,
        resourceId: invitationId,
        metadata: {
          email: invitation.email,
          resent: true,
        },
        status: 'success',
      });

      return {
        invitationId,
        email: invitation.email,
        status: 'sent',
        expiresAt,
        invitedBy: inviter.email,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cancel pending invitation
   */
  async cancelInvitation(
    organizationId: string,
    invitationId: string,
    initiatedByUserId: string
  ): Promise<void> {
    try {
      const invitation = await db('organization_invitations')
        .where('id', invitationId)
        .where('organization_id', organizationId)
        .first();

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw new Error('Can only cancel pending invitations');
      }

      // Cancel invitation
      await db('organization_invitations').where('id', invitationId).update({
        status: 'cancelled',
        cancelled_at: new Date(),
        updated_at: new Date(),
      });

      // Log the cancellation
      await logAuditAction({
        organizationId,
        actorId: initiatedByUserId,
        action: AuditActionType.MEMBER_REMOVED, // Or create INVITATION_CANCELLED
        resourceType: AuditResourceType.INVITE,
        resourceId: invitationId,
        metadata: {
          email: invitation.email,
          action: 'invitation_cancelled',
        },
        status: 'success',
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Change user role within organization
   * Can only be done by organization admin or owner
   */
  async changeUserRole(
    organizationId: string,
    userId: string,
    newRole: 'owner' | 'admin' | 'limited' | 'viewer',
    changedByUserId: string
  ): Promise<RoleChangeResult> {
    try {
      // Get current member
      const member = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .first();

      if (!member) {
        throw new Error('User is not a member of this organization');
      }

      // Prevent removing last owner
      if (member.org_role === 'owner' && newRole !== 'owner') {
        const ownerCount = await db('users')
          .where('organization_id', organizationId)
          .where('org_role', 'owner')
          .count('id as count')
          .first();

        if (Number(ownerCount?.count ?? 0) <= 1) {
          throw new Error('Cannot remove last owner of organization');
        }
      }

      const previousRole = member.org_role;

      // Update role
      await db('users').where('id', userId).update({
        org_role: newRole,
        updated_at: new Date(),
      });

      // Log the change
      await logMemberRoleChanged(organizationId, userId, previousRole, newRole, changedByUserId);

      // Send notification email if role changed
      if (previousRole !== newRole) {
        const org = await db('organizations').where('id', organizationId).select('name').first();
        const memberName = member.name || member.email.split('@')[0];
        const previousRoleDisplay = previousRole.charAt(0).toUpperCase() + previousRole.slice(1);
        const newRoleDisplay = newRole.charAt(0).toUpperCase() + newRole.slice(1);

        const roleChangeHtml = generateEmailTemplate({
          title: 'Your Role Has Been Updated',
          preheader: `Your role in ${org.name} has changed to ${newRoleDisplay}`,
          content: `
            <p style="font-size: 18px; margin-bottom: 20px;">Hi ${memberName}!</p>

            <p>Your role in <strong>${org.name}</strong> has been updated.</p>

            ${createInfoCard(`
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 15px; width: 45%;">
                    <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 12px;">PREVIOUS ROLE</p>
                    <p style="margin: 0; font-size: 18px; color: ${BRAND_COLORS.textMuted}; text-decoration: line-through;">${previousRoleDisplay}</p>
                  </td>
                  <td style="text-align: center; padding: 15px; width: 10%;">
                    <span style="font-size: 24px;">→</span>
                  </td>
                  <td style="text-align: center; padding: 15px; width: 45%;">
                    <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 12px;">NEW ROLE</p>
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.primary};">${newRoleDisplay}</p>
                  </td>
                </tr>
              </table>
            `)}

            <p style="margin-top: 25px;">This change may affect your permissions and access levels within the organization. If you have any questions about your new role, please contact your organization administrator.</p>
          `,
          ctaButton: {
            text: 'View Dashboard',
            url: `${process.env.FRONTEND_URL}/dashboard`,
          },
          footer: `
            <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
              This notification was sent because your role was changed in ${org.name}.
            </p>
          `,
        });

        await emailService.sendEmail({
          to: member.email,
          subject: `📋 Your role in ${org.name} has been updated`,
          html: roleChangeHtml,
        });
      }

      return {
        userId,
        email: member.email,
        previousRole,
        newRole,
        changedAt: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(
    organizationId: string,
    userId: string,
    removedByUserId: string
  ): Promise<RemoveResult> {
    try {
      // Get user details
      const user = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .first();

      if (!user) {
        throw new Error('User is not a member of this organization');
      }

      // Prevent removing last owner
      if (user.org_role === 'owner') {
        const ownerCount = await db('users')
          .where('organization_id', organizationId)
          .where('org_role', 'owner')
          .count('id as count')
          .first();

        if (Number(ownerCount?.count ?? 0) <= 1) {
          throw new Error('Cannot remove last owner of organization');
        }
      }

      // Remove from organization
      await db('users').where('id', userId).update({
        organization_id: null,
        current_organization_id: null,
        org_role: null,
        org_status: null,
        joined_organization_at: null,
      });

      // Log the removal
      await logMemberRemoved(organizationId, userId, removedByUserId);

      // Send notification email
      const org = await db('organizations').where('id', organizationId).select('name').first();
      const userName = user.name || user.email.split('@')[0];

      const removalHtml = generateEmailTemplate({
        title: 'Organization Access Removed',
        preheader: `Your access to ${org.name} has been removed`,
        headerColor: '#64748B', // Slate gray for neutral/removal
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${userName},</p>

          <p>We wanted to let you know that you have been removed from <strong>${org.name}</strong> on CogVeri.</p>

          ${createInfoCard(`
            <div style="text-align: center; padding: 10px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">ACCESS REMOVED FROM</p>
              <p style="margin: 0; font-size: 20px; font-weight: 600; color: ${BRAND_COLORS.text};">${org.name}</p>
            </div>
          `, '#64748B')}

          <p style="margin-top: 25px;"><strong>What this means:</strong></p>
          <ul style="margin: 15px 0; padding-left: 20px; color: ${BRAND_COLORS.text};">
            <li style="margin-bottom: 8px;">You can no longer access this organization's dashboard</li>
            <li style="margin-bottom: 8px;">Any pending tasks have been reassigned</li>
            <li style="margin-bottom: 8px;">Your account is still active for other organizations</li>
          </ul>

          <p style="color: ${BRAND_COLORS.textMuted};">If you believe this was a mistake or have any questions, please contact the organization administrator directly.</p>
        `,
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
            This is an automated notification from CogVeri.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: user.email,
        subject: `You've been removed from ${org.name}`,
        html: removalHtml,
      });

      return {
        userId,
        email: user.email,
        removedAt: new Date(),
        organizationId,
      };
    } catch (error) {
      throw error;
    }
  }


  /**
   * Transfer organization ownership to another member
   * This is an atomic operation that:
   * 1. Promotes the new owner to 'owner' role
   * 2. Demotes the current owner to 'admin' role
   * Only the current owner can initiate this transfer.
   */
  async transferOwnership(
    organizationId: string,
    newOwnerId: string,
    currentOwnerId: string
  ): Promise<{ success: boolean; newOwner: { id: string; email: string }; previousOwner: { id: string; email: string } }> {
    const trx = await db.transaction();

    try {
      // Verify current user is an owner
      const currentOwner = await trx('users')
        .where('id', currentOwnerId)
        .where('organization_id', organizationId)
        .first();

      if (!currentOwner || currentOwner.org_role !== 'owner') {
        throw new Error('Only owners can transfer ownership');
      }

      // Verify new owner is a member of the organization
      const newOwner = await trx('users')
        .where('id', newOwnerId)
        .where('organization_id', organizationId)
        .first();

      if (!newOwner) {
        throw new Error('Target user is not a member of this organization');
      }

      if (newOwner.org_role === 'owner') {
        throw new Error('Target user is already an owner');
      }

      // Promote new owner
      await trx('users')
        .where('id', newOwnerId)
        .update({
          org_role: 'owner',
          updated_at: new Date(),
        });

      // Demote current owner to admin
      await trx('users')
        .where('id', currentOwnerId)
        .update({
          org_role: 'admin',
          updated_at: new Date(),
        });

      // Update organization owner_id reference
      await trx('organizations')
        .where('id', organizationId)
        .update({
          owner_id: newOwnerId,
          updated_at: new Date(),
        });

      await trx.commit();

      // Log the ownership transfer (using role changed for both)
      await logMemberRoleChanged(organizationId, newOwnerId, newOwner.org_role, 'owner', currentOwnerId);
      await logMemberRoleChanged(organizationId, currentOwnerId, 'owner', 'admin', currentOwnerId);

      // Send notification emails
      const org = await db('organizations').where('id', organizationId).select('name').first();
      const newOwnerName = newOwner.name || newOwner.email.split('@')[0];
      const previousOwnerName = currentOwner.name || currentOwner.email.split('@')[0];

      // Email to new owner
      const newOwnerHtml = generateEmailTemplate({
        title: 'You Are Now the Organization Owner',
        preheader: `Ownership of ${org.name} has been transferred to you`,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${newOwnerName}!</p>
          <p><strong>${previousOwnerName}</strong> has transferred ownership of <strong>${org.name}</strong> to you.</p>
          ${createInfoCard(`
            <div style="text-align: center; padding: 10px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">YOUR NEW ROLE</p>
              <p style="margin: 0; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.primary};">Owner</p>
            </div>
          `)}
          <p style="margin-top: 25px;"><strong>As the owner, you can:</strong></p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li>Manage all organization settings</li>
            <li>Add, remove, and change member roles</li>
            <li>Transfer ownership to another member</li>
            <li>Delete the organization</li>
          </ul>
        `,
        ctaButton: {
          text: 'View Organization',
          url: `${process.env.FRONTEND_URL}/settings/organization`,
        },
      });

      await emailService.sendEmail({
        to: newOwner.email,
        subject: `You are now the owner of ${org.name}`,
        html: newOwnerHtml,
      });

      // Email to previous owner
      const previousOwnerHtml = generateEmailTemplate({
        title: 'Ownership Transferred',
        preheader: `You have transferred ownership of ${org.name}`,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${previousOwnerName},</p>
          <p>You have successfully transferred ownership of <strong>${org.name}</strong> to <strong>${newOwnerName}</strong>.</p>
          ${createInfoCard(`
            <div style="text-align: center; padding: 10px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">YOUR NEW ROLE</p>
              <p style="margin: 0; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.primary};">Admin</p>
            </div>
          `)}
          <p style="margin-top: 25px;">You still have full administrative access to manage members and settings.</p>
        `,
        ctaButton: {
          text: 'View Organization',
          url: `${process.env.FRONTEND_URL}/settings/organization`,
        },
      });

      await emailService.sendEmail({
        to: currentOwner.email,
        subject: `Ownership of ${org.name} transferred`,
        html: previousOwnerHtml,
      });

      return {
        success: true,
        newOwner: { id: newOwnerId, email: newOwner.email },
        previousOwner: { id: currentOwnerId, email: currentOwner.email },
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get pending invitations for organization
   */
  async getPendingInvitations(organizationId: string): Promise<any[]> {
    try {
      const invitations = await db('organization_invitations')
        .where('organization_id', organizationId)
        .where('status', 'pending')
        .select(
          'id',
          'email',
          'role',
          'invited_by',
          'created_at as invitedAt',
          'expires_at as expiresAt'
        )
        .orderBy('created_at', 'desc');

      return invitations;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch pending invitations: ${errorMessage}`);
    }
  }

  /**
   * Check if user has specific role in organization
   */
  async userHasRole(
    organizationId: string,
    userId: string,
    requiredRole: string
  ): Promise<boolean> {
    try {
      const user = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .first();

      if (!user) return false;

      // Role hierarchy: owner > admin > member > viewer
      const roleHierarchy: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
      const userRoleLevel = roleHierarchy[user.org_role as string] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
      return userRoleLevel >= requiredRoleLevel;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if user is owner of organization
   */
  async isOrganizationOwner(organizationId: string, userId: string): Promise<boolean> {
    try {
      const owner = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .where('org_role', 'owner')
        .first();

      return !!owner;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user is admin or owner of organization
   */
  async isOrganizationAdmin(organizationId: string, userId: string): Promise<boolean> {
    try {
      // First check organization_members table (new multi-org model)
      const membership = await db('organization_members')
        .where('user_id', userId)
        .where('organization_id', organizationId)
        .whereIn('role', ['owner', 'admin'])
        .where('status', 'active')
        .first();

      if (membership) {
        return true;
      }

      // Fallback to legacy users table (transition period)
      const legacyAdmin = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .whereIn('org_role', ['owner', 'admin'])
        .first();

      return !!legacyAdmin;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update pending invitation role
   */
  async updateInvitationRole(
    organizationId: string,
    invitationId: string,
    newRole: 'owner' | 'admin' | 'limited' | 'viewer',
    changedByUserId: string
  ): Promise<{ invitationId: string; email: string; role: string }> {
    try {
      const invitation = await db('organization_invitations')
        .where('id', invitationId)
        .where('organization_id', organizationId)
        .first();

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw new Error('Can only update role for pending invitations');
      }

      const previousRole = invitation.role;

      // Update invitation role
      await db('organization_invitations').where('id', invitationId).update({
        role: newRole,
        updated_at: new Date(),
      });

      // Log the change
      await logAuditAction({
        organizationId,
        actorId: changedByUserId,
        action: AuditActionType.MEMBER_PERMISSIONS_UPDATED,
        resourceType: AuditResourceType.INVITE,
        resourceId: invitationId,
        metadata: {
          email: invitation.email,
          previousRole,
          newRole,
          action: 'invitation_role_updated',
        },
        status: 'success',
      });

      return {
        invitationId,
        email: invitation.email,
        role: newRole,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Deactivate a member (soft delete)
   * Sets org_status to 'inactive' - user loses access but data is preserved
   */
  async deactivateMember(
    organizationId: string,
    userId: string,
    deactivatedByUserId: string
  ): Promise<{ userId: string; email: string; status: string }> {
    try {
      // Cannot deactivate self
      if (userId === deactivatedByUserId) {
        throw new Error('Cannot deactivate yourself');
      }

      // Get member details
      const member = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .first();

      if (!member) {
        throw new Error('User is not a member of this organization');
      }

      if (member.org_status === 'inactive') {
        throw new Error('User is already inactive');
      }

      // Prevent deactivating last owner
      if (member.org_role === 'owner') {
        const ownerCount = await db('users')
          .where('organization_id', organizationId)
          .where('org_role', 'owner')
          .where('org_status', 'active')
          .count('id as count')
          .first();

        if (Number(ownerCount?.count ?? 0) <= 1) {
          throw new Error('Cannot deactivate the last active owner');
        }
      }

      // Deactivate user
      await db('users').where('id', userId).update({
        org_status: 'inactive',
        updated_at: new Date(),
      });

      // Log the deactivation
      await logAuditAction({
        organizationId,
        actorId: deactivatedByUserId,
        action: AuditActionType.MEMBER_REMOVED,
        resourceType: AuditResourceType.USER,
        resourceId: userId,
        metadata: {
          email: member.email,
          action: 'member_deactivated',
          previousStatus: member.org_status,
        },
        status: 'success',
      });

      // Send notification email
      const org = await db('organizations').where('id', organizationId).select('name').first();
      const userName = member.name || member.email.split('@')[0];

      const deactivationHtml = generateEmailTemplate({
        title: 'Account Access Suspended',
        preheader: `Your access to ${org.name} has been suspended`,
        headerColor: BRAND_COLORS.warning,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${userName},</p>

          <p>Your access to <strong>${org.name}</strong> on CogVeri has been suspended by an administrator.</p>

          ${createInfoCard(`
            <div style="text-align: center; padding: 10px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">ACCESS SUSPENDED</p>
              <p style="margin: 0; font-size: 20px; font-weight: 600; color: ${BRAND_COLORS.warning};">${org.name}</p>
            </div>
          `, BRAND_COLORS.warning)}

          <p style="margin-top: 25px;"><strong>What this means:</strong></p>
          <ul style="margin: 15px 0; padding-left: 20px; color: ${BRAND_COLORS.text};">
            <li style="margin-bottom: 8px;">You can no longer access this organization's dashboard</li>
            <li style="margin-bottom: 8px;">Your data and work history are preserved</li>
            <li style="margin-bottom: 8px;">An administrator can reactivate your access at any time</li>
          </ul>

          <p style="color: ${BRAND_COLORS.textMuted};">If you believe this was a mistake, please contact your organization administrator.</p>
        `,
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
            This is an automated notification from CogVeri.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: member.email,
        subject: `⚠️ Your access to ${org.name} has been suspended`,
        html: deactivationHtml,
      });

      return {
        userId,
        email: member.email,
        status: 'inactive',
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reactivate an inactive member
   * Sets org_status back to 'active'
   */
  async reactivateMember(
    organizationId: string,
    userId: string,
    reactivatedByUserId: string
  ): Promise<{ userId: string; email: string; status: string }> {
    try {
      // Get member details
      const member = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .first();

      if (!member) {
        throw new Error('User is not a member of this organization');
      }

      if (member.org_status === 'active') {
        throw new Error('User is already active');
      }

      // Reactivate user
      await db('users').where('id', userId).update({
        org_status: 'active',
        updated_at: new Date(),
      });

      // Log the reactivation
      await logAuditAction({
        organizationId,
        actorId: reactivatedByUserId,
        action: AuditActionType.MEMBER_JOINED,
        resourceType: AuditResourceType.USER,
        resourceId: userId,
        metadata: {
          email: member.email,
          action: 'member_reactivated',
          previousStatus: member.org_status,
        },
        status: 'success',
      });

      // Send notification email
      const org = await db('organizations').where('id', organizationId).select('name').first();
      const userName = member.name || member.email.split('@')[0];

      const reactivationHtml = generateEmailTemplate({
        title: 'Account Access Restored',
        preheader: `Your access to ${org.name} has been restored`,
        headerColor: BRAND_COLORS.success,
        content: `
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${userName}! 🎉</p>

          <p>Great news! Your access to <strong>${org.name}</strong> on CogVeri has been restored.</p>

          ${createInfoCard(`
            <div style="text-align: center; padding: 10px 0;">
              <p style="margin: 0 0 5px 0; color: ${BRAND_COLORS.textMuted}; font-size: 14px;">ACCESS RESTORED</p>
              <p style="margin: 0; font-size: 20px; font-weight: 600; color: ${BRAND_COLORS.success};">${org.name}</p>
            </div>
          `, BRAND_COLORS.success)}

          <p style="margin-top: 25px;">You can now access the dashboard and continue working with your team.</p>
        `,
        ctaButton: {
          text: 'Go to Dashboard',
          url: `${process.env.FRONTEND_URL}/dashboard`,
          color: BRAND_COLORS.success,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; margin: 0;">
            Welcome back to CogVeri!
          </p>
        `,
      });

      await emailService.sendEmail({
        to: member.email,
        subject: `✅ Your access to ${org.name} has been restored`,
        html: reactivationHtml,
      });

      return {
        userId,
        email: member.email,
        status: 'active',
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate invitation token
   */
  private generateInvitationToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}

export const organizationMemberService = new OrganizationMemberService();
export default organizationMemberService;
