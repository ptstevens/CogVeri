import { db } from '../config/database';
import { logger } from '../utils/logger';
import { jwtService } from './jwt.service';
import { organizationMemberService } from './organization-member.service';
import { invitationService } from './invitation.service';

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI =
  process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';
const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT || 'common'; // 'common' or specific tenant ID

const AUTHORITY = `https://login.microsoftonline.com/${MICROSOFT_TENANT}`;
const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  officeLocation?: string;
}

interface OAuthStateData {
  mode: 'login' | 'signup';
  organizationName?: string;
  returnUrl?: string;
}

class MicrosoftOAuthService {
  /**
   * Returns true only if Microsoft OAuth is configured
   */
  isConfigured(): boolean {
    return !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
  }

  /**
   * Generate the Microsoft OAuth2 authorization URL (PKCE-less, server-side flow)
   */
  getAuthUrl(state: OAuthStateData): string {
    if (!this.isConfigured()) {
      throw new Error('Microsoft OAuth is not configured');
    }

    const stateString = Buffer.from(JSON.stringify(state)).toString('base64url');
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: MICROSOFT_REDIRECT_URI,
      scope: SCOPES.join(' '),
      response_mode: 'query',
      state: stateString,
      prompt: 'select_account',
    });

    return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens and fetch user profile
   */
  async handleCallback(code: string): Promise<MicrosoftUserInfo> {
    if (!this.isConfigured()) throw new Error('Microsoft OAuth is not configured');

    // Exchange code for tokens
    const tokenRes = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID!,
        client_secret: MICROSOFT_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: MICROSOFT_REDIRECT_URI,
        scope: SCOPES.join(' '),
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      logger.error('Microsoft OAuth token exchange failed:', err);
      throw new Error('Failed to exchange Microsoft authorization code');
    }

    const tokens = (await tokenRes.json()) as { access_token: string };

    // Fetch user profile from Graph API
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      throw new Error('Failed to fetch Microsoft user profile');
    }

    const profile = (await profileRes.json()) as MicrosoftUserInfo;
    logger.info(`Microsoft OAuth: Retrieved profile for ${profile.mail || profile.userPrincipalName}`);

    return profile;
  }

  /**
   * Parse the state parameter from the OAuth callback
   */
  parseState(stateString: string): OAuthStateData {
    try {
      const decoded = Buffer.from(stateString, 'base64url').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return { mode: 'login' };
    }
  }

  /**
   * Resolve the canonical email for a Microsoft user.
   * UPN may be the primary address; `mail` is preferred when present.
   */
  private resolveEmail(profile: MicrosoftUserInfo): string {
    const email = profile.mail ?? profile.userPrincipalName;
    // Strip Azure guest-account suffixes like user_example.com#EXT#@tenant.onmicrosoft.com
    return email.includes('#EXT#') ? profile.userPrincipalName.split('#EXT#')[0]!.replace(/_/, '@') : email;
  }

  /**
   * Find or create a CogVeri user from a Microsoft profile.
   * Mirrors google-oauth.service.ts logic.
   */
  async findOrCreateUser(
    profile: MicrosoftUserInfo,
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
    const email = this.resolveEmail(profile).toLowerCase();
    const isInvitationSignup =
      returnUrl?.includes('join-organization') && returnUrl?.includes('token=');

    let user = await db('users').where('email', email).first();
    let organization: any = null;
    let isNewUser = false;

    if (user) {
      // ── Existing user ──────────────────────────────────────────────────────
      logger.info(`Microsoft OAuth: Existing user login — ${email}`);

      // Persist Microsoft ID if not already stored
      if (!user.microsoft_id) {
        await db('users').where('id', user.id).update({
          microsoft_id: profile.id,
          updated_at: new Date(),
        });
      }

      // Handle invitation acceptance for existing users
      if (isInvitationSignup) {
        const tokenMatch = returnUrl!.match(/token=([^&]+)/);
        const invToken = tokenMatch?.[1];
        if (invToken) {
          const validation = await invitationService.validateInvitationToken(invToken);
          if (validation.valid && validation.invitation?.email.toLowerCase() === email) {
            try {
              const accept = await organizationMemberService.acceptInvitation(invToken, user.id);
              organization = await db('organizations').where('id', accept.organizationId).first();
              user = await db('users').where('id', user.id).first();
            } catch (e: any) {
              logger.error(`Microsoft OAuth: Invitation acceptance failed — ${e.message}`);
            }
          }
        }
      }

      if (!organization && user.organization_id) {
        organization = await db('organizations').where('id', user.organization_id).first();
      }
    } else {
      // ── New user ───────────────────────────────────────────────────────────
      if (mode === 'login' && !isInvitationSignup) {
        throw new Error('NO_ACCOUNT');
      }

      isNewUser = true;
      logger.info(`Microsoft OAuth: Creating new user — ${email}`);

      const displayName = profile.displayName || `${profile.givenName || ''} ${profile.surname || ''}`.trim() || email;
      const emailDomain = email.split('@')[1] ?? '';
      const isEnterpriseEmail = emailDomain ? !this.isPersonalEmailDomain(emailDomain) : false;
      const orgName =
        organizationName?.trim() ||
        (isEnterpriseEmail ? this.domainToOrgName(emailDomain) : `${displayName}'s Workspace`);

      const trx = await db.transaction();
      try {
        if (isInvitationSignup) {
          const tokenMatch = returnUrl!.match(/token=([^&]+)/);
          const invToken = tokenMatch?.[1];
          if (!invToken) { await trx.rollback(); throw new Error('Invalid invitation URL'); }

          const validation = await invitationService.validateInvitationToken(invToken);
          if (!validation.valid) { await trx.rollback(); throw new Error(validation.error || 'Invalid invitation'); }
          if (validation.invitation?.email.toLowerCase() !== email) {
            await trx.rollback();
            throw new Error(`Invitation was sent to ${validation.invitation?.email}, but you signed in with ${email}`);
          }

          [user] = await trx('users').insert({
            email,
            password: null,
            name: displayName,
            microsoft_id: profile.id,
            role: 'employee',
            auth_provider: 'microsoft',
            organization_id: null,
            org_role: null,
            org_status: null,
            created_at: new Date(),
            updated_at: new Date(),
          }).returning('*');

          await trx.commit();

          try {
            const accept = await organizationMemberService.acceptInvitation(invToken, user.id);
            organization = await db('organizations').where('id', accept.organizationId).first();
            user = await db('users').where('id', user.id).first();
          } catch (e: any) {
            logger.error(`Microsoft OAuth: Post-creation invitation acceptance failed — ${e.message}`);
          }
        } else {
          // Normal signup — create org + user
          [organization] = await trx('organizations').insert({
            name: orgName,
            domain: isEnterpriseEmail ? emailDomain : null,
            owner_email: email,
            subscriber_email: email,
            subscriber_email_verified_at: new Date(),
            subscription_tier: 'free',
            max_users: 1,
            max_storage_gb: 5,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          }).returning('*');

          [user] = await trx('users').insert({
            email,
            password: null,
            name: displayName,
            microsoft_id: profile.id,
            role: 'employee',
            auth_provider: 'microsoft',
            organization_id: organization.id,
            org_role: 'owner',
            org_status: 'active',
            joined_organization_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          }).returning('*');

          await trx('organizations').where('id', organization.id).update({ owner_id: user.id });

          const now = new Date();
          await trx('organization_members').insert({
            user_id: user.id,
            organization_id: organization.id,
            role: 'owner',
            status: 'active',
            joined_at: now,
            created_at: now,
            updated_at: now,
          });

          await trx.commit();

          // Provision default templates
          try {
            const taskTemplateService = (await import('./task-template.service')).default;
            await taskTemplateService.provisionDefaultTemplates(organization.id, user.id);
          } catch (e) {
            logger.error('Microsoft OAuth: Failed to provision default templates', e);
          }
        }
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    }

    const accessToken = await jwtService.generateAccessToken(user.id, organization?.id || null);
    const { token: refreshToken } = await jwtService.generateRefreshToken(user.id);
    const { password: _pw, ...safeUser } = user;

    return {
      user: {
        ...safeUser,
        org_id: organization?.id,
        org_name: organization?.name,
        org_role: isNewUser ? 'owner' : await this.getUserOrgRole(user.id, organization?.id),
      },
      organization,
      isNewUser,
      accessToken,
      refreshToken,
    };
  }

  private async getUserOrgRole(userId: string, orgId: string | null): Promise<string | null> {
    if (!orgId) return null;
    const u = await db('users').where('id', userId).where('organization_id', orgId).first();
    return u?.org_role || null;
  }

  private isPersonalEmailDomain(domain: string): boolean {
    const personal = [
      'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com',
      'hotmail.co.uk','outlook.com','live.com','msn.com','icloud.com','me.com',
      'mac.com','aol.com','protonmail.com','proton.me','zoho.com','mail.com',
      'gmx.com','fastmail.com',
    ];
    return personal.includes(domain.toLowerCase());
  }

  private domainToOrgName(domain: string): string {
    const name = domain.split('.')[0] || domain;
    return name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

export const microsoftOAuthService = new MicrosoftOAuthService();
export default microsoftOAuthService;
