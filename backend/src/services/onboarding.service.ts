import { db } from '../config/database';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  OrganizationExistsError,
} from '../utils/AppError';
import { logger } from '../utils/logger';
import { jwtService } from './jwt.service';
import storageService from './storage.service';
import taskTemplateService from './task-template.service';
import pricingService from './pricing.service';

interface SignupWithOrgDto {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  organizationSlug?: string;
  invitationToken?: string;
}

interface CompleteOnboardingDto {
  userId: string;
  organizationId?: string;
  setupCompleted: boolean;
  preferences?: {
    theme?: 'light' | 'dark';
    notifications?: boolean;
    emailDigest?: 'daily' | 'weekly' | 'never';
  };
}

class OnboardingService {
  /**
   * Complete signup and create initial organization
   * This is a multi-step transaction:
   * 1. Verify user doesn't exist
   * 2. Create organization with auto-generated slug
   * 3. Create user account
   * 4. Add user as OWNER of organization
   * 5. Generate multi-org JWT token
   */
  async signupWithOrganization(data: SignupWithOrgDto): Promise<{
    user: any;
    organization: any;
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Check if user already exists
      const existingUser = await db('users').where('email', data.email.toLowerCase()).first();
      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }

      // Extract domain from email and check for existing organizations
      const emailDomain = this.extractDomain(data.email);
      if (emailDomain) {
        // Check if an organization with this domain already exists (verified domain OR matching owner email domain)
        const existingDomainOrg = await db('organizations')
          .where(function () {
            this.where('domain', emailDomain).orWhereRaw('LOWER(owner_email) LIKE ?', [
              `%@${emailDomain.toLowerCase()}`,
            ]);
          })
          .first();

        if (existingDomainOrg) {
          // Check if this is a multi-member plan
          const isMultiMember = pricingService.isMultiMemberTier(
            existingDomainOrg.subscription_tier || 'free'
          );

          if (isMultiMember) {
            // Block signup - user must request invitation from subscriber
            logger.info(
              `Blocked signup for ${data.email}: Organization ${existingDomainOrg.name} exists with multi-member plan`
            );

            // Get subscriber info for the error message
            const subscriberEmail =
              existingDomainOrg.subscriber_email || existingDomainOrg.owner_email;
            const owner = await db('users')
              .where('id', existingDomainOrg.owner_id)
              .select('name')
              .first();

            throw new OrganizationExistsError(existingDomainOrg.name, subscriberEmail, owner?.name);
          }
          // If it's an individual (free) plan, allow creating their own organization
          logger.info(
            `Allowing signup for ${data.email}: Existing org ${existingDomainOrg.name} is on individual plan`
          );
        }
      }

      // Validate organization slug if provided
      let orgSlug = data.organizationSlug;
      if (!orgSlug) {
        // Auto-generate slug from org name
        orgSlug = this.generateOrgSlug(data.organizationName);
      }

      // Check if organization slug is available
      const existingOrg = await db('organizations').where('slug', orgSlug).first();
      if (existingOrg) {
        throw new ConflictError(`Organization slug "${orgSlug}" is already taken`);
      }

      // Start transaction for atomicity
      const trx = await db.transaction();

      try {
        // 1. Create organization
        const [organization] = await trx('organizations')
          .insert({
            name: data.organizationName,
            slug: orgSlug,
            owner_email: data.email.toLowerCase(),
            subscription_tier: 'free',
            max_members: 3,
            max_recordings_gb: 10,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        logger.info(`Organization created: ${organization.id} (${orgSlug})`);

        // 2. Create user
        const hashedPassword = await this.hashPassword(data.password);
        const [user] = await trx('users')
          .insert({
            email: data.email.toLowerCase(),
            password: hashedPassword,
            name: data.name,
            role: 'user',
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        logger.info(`User created: ${user.id} (${user.email})`);

        // 3. Add user as OWNER of organization
        const [_membership] = await trx('memberships')
          .insert({
            user_id: user.id,
            organization_id: organization.id,
            role: 'OWNER',
            joined_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        // 4. Create audit log entry
        await trx('audit_logs').insert({
          organization_id: organization.id,
          actor_id: user.id,
          action: 'organization_created',
          object_type: 'organization',
          object_id: organization.id,
          changes: {
            created: {
              name: organization.name,
              slug: organization.slug,
              subscription_tier: 'free',
            },
          },
          created_at: new Date(),
        });

        await trx.commit();

        // 5. Initialize storage metrics for the organization
        try {
          const maxStorageGb = 10; // Free tier limit
          await storageService.initializeStorageMetrics(organization.id, maxStorageGb);
          logger.info(`Storage metrics initialized for organization ${organization.id}`);
        } catch (storageError) {
          logger.error('Failed to initialize storage metrics:', storageError);
          // Continue despite storage initialization error - organization is created
        }

        // 6. Provision default templates for the organization
        try {
          await taskTemplateService.provisionDefaultTemplates(organization.id, user.id);
          logger.info(`Default templates provisioned for organization ${organization.id}`);
        } catch (templateError) {
          logger.error('Failed to provision default templates:', templateError);
          // Continue despite template provisioning error - organization is created
        }

        // 7. Generate enhanced JWT with organization context
        const accessToken = await jwtService.generateAccessToken(user.id, organization.id);
        const { token: refreshToken } = await jwtService.generateRefreshToken(user.id);

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        return {
          user: {
            ...userWithoutPassword,
            org_id: organization.id,
            org_slug: organization.slug,
            org_role: 'owner',
          },
          organization,
          accessToken,
          refreshToken,
        };
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error during signup with organization:', error);
      throw error;
    }
  }

  /**
   * Join organization via invitation token
   */
  async joinOrganizationViaInvitation(
    token: string,
    userId: string,
    userEmail: string
  ): Promise<{
    organization: any;
    membership: any;
    accessToken: string;
  }> {
    try {
      // Get the invitation
      const invitation = await db('invitations').where('token', token).first();

      if (!invitation) {
        throw new NotFoundError('Invitation not found');
      }

      // Validate invitation
      if (invitation.status !== 'PENDING') {
        throw new BadRequestError(`Invitation has already been ${invitation.status.toLowerCase()}`);
      }

      if (new Date(invitation.expires_at) < new Date()) {
        throw new BadRequestError('Invitation has expired');
      }

      if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new BadRequestError('Email does not match invitation');
      }

      // Check if user is already a member
      const existingMembership = await db('memberships')
        .where('user_id', userId)
        .andWhere('organization_id', invitation.organization_id)
        .first();

      if (existingMembership) {
        throw new ConflictError('You are already a member of this organization');
      }

      // Start transaction
      const trx = await db.transaction();

      try {
        // 1. Create membership
        const [membership] = await trx('memberships')
          .insert({
            user_id: userId,
            organization_id: invitation.organization_id,
            role: invitation.role,
            joined_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        // 2. Update invitation status
        await trx('invitations').where('id', invitation.id).update({
          status: 'ACCEPTED',
          accepted_at: new Date(),
          updated_at: new Date(),
        });

        // 3. Get organization
        const organization = await trx('organizations')
          .where('id', invitation.organization_id)
          .first();

        // 4. Create audit log
        await trx('audit_logs').insert({
          organization_id: invitation.organization_id,
          actor_id: userId,
          action: 'member_joined',
          object_type: 'membership',
          object_id: membership.id,
          changes: {
            role: invitation.role,
            joined_via: 'invitation',
          },
          created_at: new Date(),
        });

        await trx.commit();

        // Generate access token for the new organization
        const accessToken = await jwtService.generateAccessToken(
          userId,
          invitation.organization_id
        );

        logger.info(
          `User ${userId} joined organization ${invitation.organization_id} via invitation`
        );

        return {
          organization,
          membership,
          accessToken,
        };
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error joining organization via invitation:', error);
      throw error;
    }
  }

  /**
   * Complete onboarding setup for a user
   */
  async completeOnboarding(data: CompleteOnboardingDto): Promise<void> {
    try {
      // Update user onboarding status
      await db('users')
        .where('id', data.userId)
        .update({
          onboarding_completed: data.setupCompleted,
          onboarding_completed_at: data.setupCompleted ? new Date() : null,
          preferences: data.preferences ? JSON.stringify(data.preferences) : null,
          updated_at: new Date(),
        });

      if (data.organizationId) {
        // Create audit log for onboarding completion
        await db('audit_logs').insert({
          organization_id: data.organizationId,
          actor_id: data.userId,
          action: 'onboarding_completed',
          object_type: 'user',
          object_id: data.userId,
          changes: {
            onboarding_completed: data.setupCompleted,
            preferences: data.preferences,
          },
          created_at: new Date(),
        });
      }

      logger.info(`Onboarding completed for user ${data.userId}`);
    } catch (error) {
      logger.error('Error completing onboarding:', error);
      throw error;
    }
  }

  /**
   * Get onboarding status for user
   */
  async getOnboardingStatus(userId: string): Promise<{
    user: any;
    organizations: any[];
    onboardingCompleted: boolean;
    currentOrganization?: any;
  }> {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Get all organizations user belongs to
      const organizations = await db('organizations')
        .innerJoin('memberships', 'organizations.id', 'memberships.organization_id')
        .select('organizations.*', 'memberships.role')
        .where('memberships.user_id', userId);

      // Get current organization (default to first or from user settings)
      let currentOrganization = organizations[0];
      if (user.current_organization_id) {
        currentOrganization = organizations.find((org) => org.id === user.current_organization_id);
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          onboardingCompleted: user.onboarding_completed,
          preferences: user.preferences ? JSON.parse(user.preferences) : null,
        },
        organizations,
        onboardingCompleted: user.onboarding_completed,
        currentOrganization,
      };
    } catch (error) {
      logger.error('Error getting onboarding status:', error);
      throw error;
    }
  }

  /**
   * Generate organization slug from name
   * Example: "My Company" -> "my-company"
   */
  private generateOrgSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  /**
   * Extract domain from email address
   * Returns null for common public email domains (gmail, yahoo, etc.)
   * as we don't want to match organizations by those domains
   */
  private extractDomain(email: string): string | null {
    const parts = email.toLowerCase().split('@');
    const domain = parts[1];
    if (parts.length !== 2 || !domain) return null;

    // Skip common public email domains - these shouldn't trigger org matching
    const publicDomains = [
      'gmail.com',
      'googlemail.com',
      'yahoo.com',
      'yahoo.co.uk',
      'yahoo.fr',
      'yahoo.de',
      'hotmail.com',
      'hotmail.co.uk',
      'outlook.com',
      'live.com',
      'msn.com',
      'icloud.com',
      'me.com',
      'mac.com',
      'aol.com',
      'protonmail.com',
      'proton.me',
      'zoho.com',
      'mail.com',
      'email.com',
      'yandex.com',
      'yandex.ru',
      'qq.com',
      '163.com',
      '126.com',
    ];

    if (publicDomains.includes(domain)) {
      return null;
    }

    return domain;
  }

  /**
   * Hash password (placeholder - use bcrypt in production)
   */
  private async hashPassword(password: string): Promise<string> {
    // TODO: Implement proper bcrypt hashing
    // For now, this is a placeholder
    return password;
  }
}

export default new OnboardingService();
