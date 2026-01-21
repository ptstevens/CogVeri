import { db } from '../config/database';
import { logger } from '../utils/logger';

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'CREATOR' | 'REVIEWER' | 'VIEWER' | 'MEMBER';
  invitedBy: string;
  expiresAt?: Date;
}

export class InvitationService {
  /**
   * Create new invitation for a user to join organization
   */
  async createInvitation(input: CreateInvitationInput): Promise<{ token: string; id: string }> {
    try {
      // TODO: Create invitation in database
      const token = `inv_${Date.now()}`;
      const id = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.info(`Invitation created for ${input.email} to org ${input.organizationId}`);
      return { token, id };
    } catch (error) {
      logger.error('Error creating invitation:', error);
      throw error;
    }
  }

  /**
   * Accept invitation and create organization membership
   */
  async acceptInvitation(_token: string, userId: string): Promise<void> {
    try {
      // TODO: Get invitation from database, verify email, create membership
      logger.info(`User ${userId} accepted invitation`);
    } catch (error) {
      logger.error('Error accepting invitation:', error);
      throw error;
    }
  }

  /**
   * Reject invitation
   */
  async rejectInvitation(token: string): Promise<void> {
    try {
      // TODO: Update invitation status in database
      logger.info(`Invitation ${token} rejected`);
    } catch (error) {
      logger.error('Error rejecting invitation:', error);
      throw error;
    }
  }

  /**
   * Revoke pending invitation (admin action)
   */
  async revokeInvitation(invitationId: string, revokedBy: string): Promise<void> {
    try {
      // TODO: Update invitation status in database
      logger.info(`Invitation ${invitationId} revoked by ${revokedBy}`);
    } catch (error) {
      logger.error('Error revoking invitation:', error);
      throw error;
    }
  }

  /**
   * Get all invitations for an organization
   */
  async getOrganizationInvitations(_organizationId: string, _status?: string): Promise<Record<string, unknown>[]> {
    try {
      // TODO: Get invitations from database
      return [];
    } catch (error) {
      logger.error('Error getting organization invitations:', error);
      throw error;
    }
  }

  /**
   * Get pending invitations for a user by email
   */
  async getUserInvitations(_email: string): Promise<Record<string, unknown>[]> {
    try {
      // TODO: Get invitations from database
      return [];
    } catch (error) {
      logger.error('Error getting user invitations:', error);
      throw error;
    }
  }

  /**
   * Validate invitation token and return details
   *
   * Uses a SECURITY DEFINER PostgreSQL function to bypass RLS,
   * allowing public (unauthenticated) access to invitation validation.
   * This is the proper pattern for handling RLS with public endpoints.
   */
  async validateInvitationToken(token: string): Promise<{
    valid: boolean;
    error?: string;
    invitation?: {
      id: string;
      email: string;
      role: string;
      expiresAt: Date;
    };
    organizationId?: string;
    organizationName?: string;
  }> {
    try {
      // Use the SECURITY DEFINER function to bypass RLS for public validation
      // This function is defined in migration 077_create_public_invitation_functions.ts
      const result = await db.raw(
        'SELECT public.validate_invitation_token(?) as result',
        [token]
      );

      const data = result.rows[0]?.result;

      if (!data) {
        return {
          valid: false,
          error: 'Error validating invitation',
        };
      }

      // The function returns JSON with camelCase keys matching our interface
      return {
        valid: data.valid,
        error: data.error,
        invitation: data.invitation ? {
          id: data.invitation.id,
          email: data.invitation.email,
          role: data.invitation.role,
          expiresAt: new Date(data.invitation.expiresAt),
        } : undefined,
        organizationId: data.organizationId,
        organizationName: data.organizationName,
      };
    } catch (error) {
      logger.error('Error validating invitation token:', error);
      return {
        valid: false,
        error: 'Error validating invitation',
      };
    }
  }

  /**
   * Send invitation email (placeholder for actual email integration)
   */
  async sendInvitationEmail(
    email: string,
    orgName: string,
    token: string,
    invitedBy: string
  ): Promise<void> {
    try {
      const invitationUrl = `${process.env.FRONTEND_URL}/invitations/${token}`;

      logger.info(`Email placeholder: Sending invitation to ${email}`);
      logger.info(`Organization: ${orgName}`);
      logger.info(`Invitation URL: ${invitationUrl}`);
      logger.info(`Invited by: ${invitedBy}`);

      // TODO: Integrate with actual email service (SendGrid, Resend, etc.)
      // await emailService.send({
      //   to: email,
      //   template: 'org-invitation',
      //   data: {
      //     orgName,
      //     invitationUrl,
      //     invitedBy,
      //   },
      // });
    } catch (error) {
      logger.error('Error sending invitation email:', error);
      throw error;
    }
  }
}

export const invitationService = new InvitationService();
