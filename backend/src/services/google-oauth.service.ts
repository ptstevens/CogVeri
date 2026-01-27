import { OAuth2Client } from 'google-auth-library';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { jwtService } from './jwt.service';
import { OrganizationExistsError } from '../utils/AppError';
import pricingService from './pricing.service';
import { organizationMemberService } from './organization-member.service';
import { invitationService } from './invitation.service';

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string; // Hosted domain - present for Google Workspace accounts
}

interface OAuthStateData {
  mode: 'login' | 'signup';
  organizationName?: string;
  returnUrl?: string;
}

class GoogleOAuthService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate the Google OAuth authorization URL
   */
  getAuthUrl(state: OAuthStateData): string {
    // Encode state data to pass through OAuth flow
    const stateString = Buffer.from(JSON.stringify(state)).toString('base64');

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid',
    ];

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: stateString,
      prompt: 'select_account', // Always show account selector
    });

    logger.info('Generated Google OAuth URL');
    return url;
  }

  /**
   * Exchange authorization code for tokens and get user info
   */
  async handleCallback(code: string): Promise<GoogleUserInfo> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Get user info from Google
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch user info from Google');
      }

      const userInfo = (await response.json()) as GoogleUserInfo;
      logger.info(`Google OAuth: Retrieved user info for ${userInfo.email}`);

      return userInfo;
    } catch (error) {
      logger.error('Google OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Parse the state parameter from OAuth callback
   */
  parseState(stateString: string): OAuthStateData {
    try {
      const decoded = Buffer.from(stateString, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return { mode: 'login' };
    }
  }

  /**
   * Find or create user from Google OAuth data
   * Handles both login and signup flows
   * If returnUrl contains an invitation token, creates user without organization
   */
  async findOrCreateUser(
    googleUser: GoogleUserInfo,
    mode: 'login' | 'signup',
    organizationName?: string,
    returnUrl?: string
  ): Promise<{
    user: any;
    organization: any | null;
    isNewUser: boolean;
    accessToken: string;
    refreshToken: string;
  }> {
    // Check if this is an invitation signup (returnUrl contains invitation token)
    const isInvitationSignup = returnUrl?.includes('join-organization') && returnUrl?.includes('token=');
    if (isInvitationSignup) {
      logger.info(`Google OAuth: Invitation signup detected from returnUrl`);
    }
    // Check if user already exists
    let user = await db('users')
      .where('email', googleUser.email.toLowerCase())
      .first();

    let organization = null;
    let isNewUser = false;

    if (user) {
      // Existing user
      logger.info(`Google OAuth: Existing user login - ${user.email}`);

      // Update Google-specific fields if not set
      if (!user.google_id) {
        await db('users')
          .where('id', user.id)
          .update({
            google_id: googleUser.id,
            avatar_url: user.avatar_url || googleUser.picture,
            updated_at: new Date(),
          });
      }

      // Check if this is an invitation acceptance (existing user joining new org)
      if (isInvitationSignup) {
        logger.info(`Google OAuth: Existing user accepting invitation`);

        // Extract invitation token from returnUrl
        const tokenMatch = returnUrl!.match(/token=([^&]+)/);
        const invitationToken = tokenMatch ? tokenMatch[1] : null;

        if (invitationToken) {
          // Validate the invitation
          const validationResult = await invitationService.validateInvitationToken(invitationToken);

          if (validationResult.valid) {
            // Check email matches invitation
            if (googleUser.email.toLowerCase() === validationResult.invitation?.email.toLowerCase()) {
              // Accept the invitation
              try {
                const acceptResult = await organizationMemberService.acceptInvitation(invitationToken, user.id);
                logger.info(`Google OAuth: Existing user ${user.email} joined organization via invitation`);

                // Use the returned organization data directly (more reliable than querying user.organization_id)
                organization = await db('organizations').where('id', acceptResult.organizationId).first();
                // Refresh user data
                user = await db('users').where('id', user.id).first();
              } catch (inviteError: any) {
                logger.error(`Google OAuth: Failed to accept invitation for existing user: ${inviteError.message}`);
                // Continue with normal login flow if invitation acceptance fails
              }
            } else {
              logger.warn(`Google OAuth: Email mismatch - invitation for ${validationResult.invitation?.email}, user is ${googleUser.email}`);
            }
          } else {
            logger.warn(`Google OAuth: Invalid invitation token for existing user: ${validationResult.error}`);
          }
        }
      }

      // Get user's organization if not already set by invitation acceptance
      if (!organization && user.organization_id) {
        organization = await db('organizations')
          .where('id', user.organization_id)
          .first();
      }
    } else {
      // New user - create account
      // Allow signup if mode is 'signup' OR if this is an invitation flow
      // (invitation flows should work even if state parsing failed and defaulted to 'login')
      if (mode === 'login' && !isInvitationSignup) {
        // User tried to login but doesn't have an account (and this isn't an invitation flow)
        throw new Error('NO_ACCOUNT');
      }

      isNewUser = true;
      logger.info(`Google OAuth: Creating new user - ${googleUser.email}${isInvitationSignup ? ' (via invitation)' : ''}`);

      // Check for existing organization with matching domain
      const emailDomain = this.extractDomainForOrgMatch(googleUser.email);
      if (emailDomain) {
        const existingDomainOrg = await db('organizations')
          .where(function() {
            this.where('domain', emailDomain)
              .orWhereRaw('LOWER(owner_email) LIKE ?', [`%@${emailDomain.toLowerCase()}`]);
          })
          .first();

        if (existingDomainOrg) {
          // Check if this is a multi-member plan
          const isMultiMember = pricingService.isMultiMemberTier(existingDomainOrg.subscription_tier || 'free');
          // Domain must be VERIFIED to be considered "claimed"
          const isDomainClaimed = existingDomainOrg.domain_verified === true;

          if (isMultiMember && isDomainClaimed) {
            // Domain is claimed by a paid org - block signup
            logger.info(`Blocked Google OAuth signup for ${googleUser.email}: Domain claimed by ${existingDomainOrg.name} (verified)`);

            // Get subscriber info for the error message
            const subscriberEmail = existingDomainOrg.subscriber_email || existingDomainOrg.owner_email;
            const owner = await db('users')
              .where('id', existingDomainOrg.owner_id)
              .select('name')
              .first();

            throw new OrganizationExistsError(
              existingDomainOrg.name,
              subscriberEmail,
              owner?.name
            );
          }
          // Allow signup if: free tier, OR paid but domain not verified/claimed
          logger.info(`Allowing Google OAuth signup for ${googleUser.email}: Org ${existingDomainOrg.name} exists but domain not claimed (verified: ${isDomainClaimed})`);
        }
      }

      // Determine organization name and type based on Google account type
      // hd (hosted domain) is ONLY present for Google Workspace accounts
      const isWorkspaceAccount = !!googleUser.hd;
      let orgName: string;
      let orgDomain: string | null = null;

      if (organizationName?.trim()) {
        // User explicitly provided an org name
        orgName = organizationName.trim();
      } else if (isWorkspaceAccount && googleUser.hd) {
        // Google Workspace account - use domain-based name
        orgName = this.formatDomainAsOrgName(googleUser.hd) || `${googleUser.name}'s Workspace`;
        orgDomain = googleUser.hd.toLowerCase();
        logger.info(`Google OAuth: Workspace account detected - domain: ${googleUser.hd}`);
      } else {
        // Personal Gmail account - use user's name
        orgName = `${googleUser.name}'s Workspace`;
        logger.info(`Google OAuth: Personal account detected (no hosted domain)`);
      }

      // Start transaction
      const trx = await db.transaction();

      try {
        if (isInvitationSignup) {
          // INVITATION SIGNUP: Create user and accept invitation in one transaction
          logger.info(`Google OAuth: Processing invitation signup`);

          // Extract invitation token from returnUrl
          const tokenMatch = returnUrl!.match(/token=([^&]+)/);
          const invitationToken = tokenMatch ? tokenMatch[1] : null;

          if (!invitationToken) {
            await trx.rollback();
            throw new Error('Invalid invitation URL - no token found');
          }

          // Validate the invitation
          const validationResult = await invitationService.validateInvitationToken(invitationToken);

          if (!validationResult.valid) {
            await trx.rollback();
            throw new Error(validationResult.error || 'Invalid invitation');
          }

          // Check email matches invitation
          if (googleUser.email.toLowerCase() !== validationResult.invitation?.email.toLowerCase()) {
            await trx.rollback();
            throw new Error(`This invitation was sent to ${validationResult.invitation?.email}, but you signed in with ${googleUser.email}`);
          }

          // Create user WITHOUT organization first
          [user] = await trx('users')
            .insert({
              email: googleUser.email.toLowerCase(),
              password: null, // No password for OAuth users
              name: googleUser.name,
              google_id: googleUser.id,
              avatar_url: googleUser.picture,
              role: 'employee',
              auth_provider: 'google',
              organization_id: null,
              org_role: null,
              org_status: null,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning('*');

          await trx.commit();

          // Now accept the invitation (outside transaction - it has its own)
          try {
            const acceptResult = await organizationMemberService.acceptInvitation(invitationToken, user.id);
            logger.info(`Google OAuth: User ${user.email} joined organization via invitation`);

            // Use the returned organization data directly (more reliable than querying user.organization_id)
            organization = await db('organizations').where('id', acceptResult.organizationId).first();
            // Refresh user data
            user = await db('users').where('id', user.id).first();
          } catch (inviteError: any) {
            logger.error(`Google OAuth: Failed to accept invitation: ${inviteError.message}`);
            // User was created but invitation failed - they'll need to accept manually
            // Don't throw - let them continue to the join page
          }
        } else {
          // NORMAL SIGNUP: Create organization and user as owner
          [organization] = await trx('organizations')
            .insert({
              name: orgName,
              domain: orgDomain, // Set domain for Workspace accounts (enables future domain matching)
              owner_email: googleUser.email.toLowerCase(),
              subscriber_email: googleUser.email.toLowerCase(), // Billing contact = owner initially
              subscriber_email_verified_at: new Date(), // Already verified via Google OAuth
              subscription_tier: 'free',
              max_users: 1, // Free tier = individual account
              max_storage_gb: 5, // Free tier storage
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning('*');

          logger.info(`Google OAuth: Created ${isWorkspaceAccount ? 'workspace' : 'personal'} organization: ${organization.name}${orgDomain ? ` (domain: ${orgDomain})` : ''}`);

          // Create user as owner of their organization
          [user] = await trx('users')
            .insert({
              email: googleUser.email.toLowerCase(),
              password: null, // No password for OAuth users
              name: googleUser.name,
              google_id: googleUser.id,
              avatar_url: googleUser.picture,
              role: 'employee',
              auth_provider: 'google',
              organization_id: organization.id,
              org_role: 'owner',
              org_status: 'active',
              joined_organization_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning('*');

          // Update organization owner_id
          await trx('organizations')
            .where('id', organization.id)
            .update({ owner_id: user.id });

          // Add owner to organization_members table (new multi-org model)
          const membershipNow = new Date();
          await trx('organization_members').insert({
            user_id: user.id,
            organization_id: organization.id,
            role: 'owner',
            status: 'active',
            joined_at: membershipNow,
            created_at: membershipNow,
            updated_at: membershipNow,
          });

          // Create audit log
          await trx('organization_audit_logs').insert({
            organization_id: organization.id,
            actor_id: user.id,
            action: 'organization_created_via_google',
            resource_type: 'organization',
            resource_id: organization.id,
            changes: {
              auth_provider: 'google',
              google_id: googleUser.id,
            },
            created_at: new Date(),
          });

          await trx.commit();

          // Provision default templates for new organization
          try {
            const taskTemplateService = (await import('./task-template.service')).default;
            await taskTemplateService.provisionDefaultTemplates(organization.id, user.id);
            logger.info(`Default templates provisioned for organization ${organization.id}`);
          } catch (templateError) {
            logger.error('Failed to provision default templates:', templateError);
          }
        }
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    }

    // Generate JWT tokens
    const accessToken = await jwtService.generateAccessToken(
      user.id,
      organization?.id || null
    );
    const { token: refreshToken } = await jwtService.generateRefreshToken(user.id);

    // Remove sensitive data
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: {
        ...userWithoutPassword,
        org_id: organization?.id,
        org_name: organization?.name,
        org_role: isNewUser ? 'owner' : (await this.getUserOrgRole(user.id, organization?.id)),
      },
      organization,
      isNewUser,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Get user's role in an organization
   */
  private async getUserOrgRole(userId: string, orgId: string | null): Promise<string | null> {
    if (!orgId) return null;
    const user = await db('users')
      .where('id', userId)
      .where('organization_id', orgId)
      .first();
    return user?.org_role || null;
  }

  /**
   * Format a domain name as a proper organization name
   * Returns null if the domain is a generic email provider
   */
  private formatDomainAsOrgName(domain: string): string | null {
    const genericDomains = [
      'gmail.com',
      'googlemail.com',
      'yahoo.com',
      'yahoo.co.uk',
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
      'yandex.com',
      'mail.com',
      'gmx.com',
      'fastmail.com',
    ];

    const lowerDomain = domain.toLowerCase();
    if (genericDomains.includes(lowerDomain)) {
      return null;
    }

    // Extract company name from domain (e.g., "acme.com" -> "Acme")
    const domainParts = lowerDomain.split('.');
    const companyName = domainParts[0];

    // Capitalize and handle hyphenated/underscored names
    // e.g., "my-company" -> "My Company"
    if (!companyName) {
      return null;
    }
    return companyName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Extract domain from email for organization matching
   * Returns null for common public email domains that shouldn't trigger org matching
   */
  private extractDomainForOrgMatch(email: string): string | null {
    const parts = email.toLowerCase().split('@');
    if (parts.length !== 2 || !parts[1]) return null;

    const domain = parts[1];
    
    // Skip common public email domains - these shouldn't trigger org matching
    const publicDomains = [
      'gmail.com', 'googlemail.com',
      'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
      'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
      'icloud.com', 'me.com', 'mac.com',
      'aol.com',
      'protonmail.com', 'proton.me',
      'zoho.com',
      'mail.com', 'email.com',
      'yandex.com', 'yandex.ru',
      'qq.com', '163.com', '126.com',
    ];
    
    if (publicDomains.includes(domain)) {
      return null;
    }

    return domain ?? null;
  }
}

export const googleOAuthService = new GoogleOAuthService();
export default googleOAuthService;
