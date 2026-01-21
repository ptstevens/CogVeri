import { db } from '../config/database';
import { logger } from '../utils/logger';
import { emailService } from './email.service';

interface ProvisioningResult {
  userId: string;
  organizationId: string;
  email: string;
  domain: string;
  role: string;
  autoProvisioned: boolean;
  message: string;
}

interface DomainMatch {
  organizationId: string;
  organizationName: string;
  domain: string;
  autoProvisionEnabled: boolean;
  ownerId: string;
  ownerEmail: string;
}

class AutoProvisioningService {
  /**
   * Check if a user's email domain matches any verified organization domains
   */
  async findMatchingOrganization(email: string): Promise<DomainMatch | null> {
    try {
      logger.info(`🔍 Checking for organization matching email: ${email}`);

      // Extract domain from email
      const domain = this.extractDomain(email);
      if (!domain) {
        logger.warn(`Could not extract domain from email: ${email}`);
        return null;
      }

      // Find organization with matching verified domain
      const organization = await db('organizations')
        .where('domain', domain)
        .andWhere('domain_verified', true)
        .andWhere('is_active', true)
        .first();

      if (!organization) {
        logger.info(
          `No verified organization found for domain: ${domain}`
        );
        return null;
      }

      // Fetch owner info for notifications
      const owner = await db('users')
        .where('id', organization.owner_id)
        .first();

      logger.info(
        `✅ Found matching organization: ${organization.name} (${organization.id})`
      );

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        domain: organization.domain,
        autoProvisionEnabled: organization.auto_provision_enabled,
        ownerId: organization.owner_id,
        ownerEmail: owner?.email || ''
      };
    } catch (error) {
      logger.error('Error finding matching organization:', error);
      throw error;
    }
  }

  /**
   * Auto-provision a user to an organization based on domain match
   * Returns provisioning details
   */
  async provisionUserToOrganization(
    userId: string,
    email: string,
    organizationId: string,
    organizationName: string,
    domain: string,
    role: string = 'limited'
  ): Promise<ProvisioningResult> {
    try {
      logger.info(
        `👤 Auto-provisioning user ${email} to organization ${organizationId}`
      );

      // Check if user is already in organization
      const existingMembership = await db('users')
        .where('id', userId)
        .andWhere('organization_id', organizationId)
        .first();

      if (existingMembership) {
        logger.info(`User already member of organization ${organizationId}`);
        return {
          userId,
          organizationId,
          email,
          domain,
          role: existingMembership.org_role || 'limited',
          autoProvisioned: false,
          message: `User already member of ${organizationName}`
        };
      }

      // Update user with organization details
      const now = new Date();
      await db('users')
        .where('id', userId)
        .update({
          organization_id: organizationId,
          current_organization_id: organizationId,
          org_role: role,
          org_status: 'active',
          joined_organization_at: now,
          invited_at: now
        });

      logger.info(
        `✅ User ${email} successfully auto-provisioned to ${organizationName}`
      );

      // Send notification email to user
      try {
        const user = await db('users').where('id', userId).first();
        await this.sendProvisioningNotification(
          user,
          organizationName,
          domain
        );
      } catch (emailError) {
        logger.warn(
          `Failed to send provisioning notification email: ${emailError}`
        );
        // Don't fail the provisioning if email fails
      }

      // Send notification to organization owner
      try {
        const organization = await db('organizations')
          .where('id', organizationId)
          .first();
        const owner = await db('users')
          .where('id', organization.owner_id)
          .first();
        const user = await db('users').where('id', userId).first();
        await this.sendOwnerNotification(user, owner, organizationName);
      } catch (emailError) {
        logger.warn(
          `Failed to send owner notification email: ${emailError}`
        );
        // Don't fail the provisioning if email fails
      }

      return {
        userId,
        organizationId,
        email,
        domain,
        role,
        autoProvisioned: true,
        message: `Successfully auto-provisioned to ${organizationName}`
      };
    } catch (error) {
      logger.error('Error provisioning user to organization:', error);
      throw error;
    }
  }

  /**
   * Handle signup flow: check for matching organization and auto-provision if found
   * Returns organization details if user should be auto-provisioned
   */
  async handleSignupProvisioning(
    userId: string,
    email: string
  ): Promise<ProvisioningResult | null> {
    try {
      logger.info(`📋 Handling signup provisioning for: ${email}`);

      // Find matching organization
      const match = await this.findMatchingOrganization(email);
      if (!match) {
        logger.info(`No matching organization for ${email}, user can create new org`);
        return null;
      }

      // Check if auto-provisioning is enabled for this organization
      if (!match.autoProvisionEnabled) {
        logger.info(
          `Auto-provisioning disabled for organization ${match.organizationId}`
        );
        return null;
      }

      // Provision user to organization
      const result = await this.provisionUserToOrganization(
        userId,
        email,
        match.organizationId,
        match.organizationName,
        match.domain,
        'limited'
      );

      return result;
    } catch (error) {
      logger.error('Error handling signup provisioning:', error);
      // Don't throw - allow signup to continue even if auto-provisioning fails
      return null;
    }
  }

  /**
   * Get users in an organization who should be provisioned
   * Useful for batch provisioning or audit
   */
  async getOrganizationUsers(organizationId: string): Promise<any[]> {
    try {
      logger.info(`Fetching users for organization: ${organizationId}`);

      const users = await db('users')
        .where('organization_id', organizationId)
        .select([
          'id',
          'email',
          'name',
          'org_role',
          'org_status',
          'joined_organization_at',
          'invited_at'
        ])
        .orderBy('joined_organization_at', 'desc');

      return users;
    } catch (error) {
      logger.error('Error fetching organization users:', error);
      throw error;
    }
  }

  /**
   * Count of users provisioned to organization
   */
  async getOrganizationUserCount(organizationId: string): Promise<number> {
    try {
      const count = await db('users')
        .where('organization_id', organizationId)
        .where('org_status', 'active')
        .count('id as count')
        .first();

      return parseInt(count?.count?.toString() || '0');
    } catch (error) {
      logger.error('Error counting organization users:', error);
      throw error;
    }
  }

  /**
   * Batch provision users from a list of emails
   * Useful for importing team members
   */
  async batchProvisionUsers(
    organizationId: string,
    emails: string[],
    role: string = 'limited'
  ): Promise<{
    successful: ProvisioningResult[];
    failed: { email: string; error: string }[];
  }> {
    try {
      logger.info(
        `📦 Batch provisioning ${emails.length} users to organization ${organizationId}`
      );

      const successful: ProvisioningResult[] = [];
      const failed: { email: string; error: string }[] = [];

      // Verify organization exists
      const organization = await db('organizations')
        .where('id', organizationId)
        .first();

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      // Process each email
      for (const email of emails) {
        try {
          // Check if user already exists
          let user = await db('users').where('email', email).first();

          if (!user) {
            // Create new user
            const [userId] = await db('users').insert({
              email,
              name: email.split('@')[0], // Use part before @ as placeholder name
              password: null, // Will need to be set during first login
              org_role: role,
              org_status: 'invited',
              organization_id: organizationId,
              invited_at: new Date(),
              is_active: true
            });
            user = { id: userId, email };
          }

          // Provision to organization
          if (!user.organization_id) {
            const result = await this.provisionUserToOrganization(
              user.id,
              email,
              organizationId,
              organization.name,
              organization.domain,
              role
            );
            successful.push(result);
          } else {
            successful.push({
              userId: user.id,
              organizationId,
              email,
              domain: organization.domain,
              role: user.org_role || role,
              autoProvisioned: false,
              message: `User already provisioned to organization`
            });
          }
        } catch (error: any) {
          logger.warn(`Failed to provision ${email}:`, error.message);
          failed.push({
            email,
            error: error.message || 'Unknown error'
          });
        }
      }

      logger.info(
        `✅ Batch provisioning completed: ${successful.length} successful, ${failed.length} failed`
      );

      return { successful, failed };
    } catch (error) {
      logger.error('Error in batch provisioning:', error);
      throw error;
    }
  }

  /**
   * Remove user from organization (deprovision)
   */
  async deprovisionUser(userId: string, organizationId: string): Promise<void> {
    try {
      logger.info(
        `🗑️  Removing user ${userId} from organization ${organizationId}`
      );

      // Check if this is the last owner of the organization
      const organization = await db('organizations')
        .where('id', organizationId)
        .first();

      if (organization.owner_id === userId) {
        logger.warn(
          `Cannot remove owner from organization ${organizationId}. Transfer ownership first.`
        );
        throw new Error(
          'Cannot remove organization owner. Please transfer ownership first.'
        );
      }

      // Remove user from organization
      await db('users')
        .where('id', userId)
        .andWhere('organization_id', organizationId)
        .update({
          organization_id: null,
          current_organization_id: null,
          org_role: null,
          org_status: 'inactive'
        });

      logger.info(
        `✅ User ${userId} removed from organization ${organizationId}`
      );

      // Send notification email
      try {
        const user = await db('users').where('id', userId).first();
        await this.sendDeprovisioningNotification(user, organization.name);
      } catch (emailError) {
        logger.warn(`Failed to send deprovisioning notification: ${emailError}`);
      }
    } catch (error) {
      logger.error('Error removing user from organization:', error);
      throw error;
    }
  }

  /**
   * Toggle auto-provisioning for organization
   */
  async toggleAutoProvisioning(
    organizationId: string,
    enabled: boolean
  ): Promise<void> {
    try {
      logger.info(
        `🔄 Setting auto-provisioning to ${enabled ? 'enabled' : 'disabled'} for org ${organizationId}`
      );

      await db('organizations')
        .where('id', organizationId)
        .update({
          auto_provision_enabled: enabled,
          updated_at: new Date()
        });

      logger.info(
        `✅ Auto-provisioning ${enabled ? 'enabled' : 'disabled'} for ${organizationId}`
      );
    } catch (error) {
      logger.error('Error toggling auto-provisioning:', error);
      throw error;
    }
  }

  /**
   * Helper: Extract domain from email
   */
  private extractDomain(email: string): string | null {
    const match = email.match(/@(.+)$/);
    return match ? match[1]!.toLowerCase() : null;
  }

  /**
   * Helper: Send provisioning notification to user
   */
  private async sendProvisioningNotification(
    user: any,
    organizationName: string,
    domain: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background-color: #D1FAE5; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10B981; }
          .button { display: inline-block; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${organizationName}!</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name || user.email},</p>

            <p>Great news! Based on your email domain <strong>${domain}</strong>, you've been automatically added to the organization <strong>${organizationName}</strong> on CogVeri.</p>

            <div class="highlight">
              <h3>What's Next?</h3>
              <ul>
                <li>Complete your profile information</li>
                <li>Review your organization's settings</li>
                <li>Start collaborating with your team</li>
              </ul>
            </div>

            <p>Your role in this organization is <strong>Member</strong>. You can participate in recordings and reviews.</p>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">
                Go to CogVeri
              </a>
            </p>

            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              If you did not expect to be added to this organization, please contact your organization administrator.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: user.email,
      subject: `Welcome to ${organizationName}!`,
      html
    });
  }

  /**
   * Helper: Send notification to organization owner about new member
   */
  private async sendOwnerNotification(
    user: any,
    owner: any,
    organizationName: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .user-info { background-color: white; padding: 15px; border-radius: 6px; border-left: 4px solid #4F46E5; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Team Member Added</h1>
          </div>
          <div class="content">
            <p>Hi ${owner.name || owner.email},</p>

            <p>A new user has been automatically added to your organization <strong>${organizationName}</strong>:</p>

            <div class="user-info">
              <p><strong>Name:</strong> ${user.name || 'Not provided'}</p>
              <p><strong>Email:</strong> ${user.email}</p>
              <p><strong>Role:</strong> Member</p>
              <p><strong>Date Added:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <p>This user's email domain matched your organization's verified domain, so they were automatically provisioned.</p>

            <p>If you want to disable auto-provisioning or manage team members, you can do so in your organization settings.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: owner.email,
      subject: `New team member added to ${organizationName}`,
      html
    });
  }

  /**
   * Helper: Send notification when user is removed from organization
   */
  private async sendDeprovisioningNotification(
    user: any,
    organizationName: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #6B7280; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Organization Access Removed</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name || user.email},</p>

            <p>Your access to the organization <strong>${organizationName}</strong> has been removed.</p>

            <p>If you have questions about this change, please contact your organization administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: user.email,
      subject: `Access removed from ${organizationName}`,
      html
    });
  }
}

export const autoProvisioningService = new AutoProvisioningService();
