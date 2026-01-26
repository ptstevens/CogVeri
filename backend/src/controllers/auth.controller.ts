import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError, UnauthorizedError, NotFoundError, OrganizationExistsError } from '../utils/AppError';
import { logger } from '../utils/logger';
import userService from '../services/user.service';
import { jwtService } from '../services/jwt.service';
import { db } from '../config/database';
import { googleOAuthService } from '../services/google-oauth.service';
import { invitationService } from '../services/invitation.service';
import { organizationMemberService } from '../services/organization-member.service';
import { tokenBlacklistService } from '../services/token-blacklist.service';
import trialService from '../services/trial.service';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
} from '../utils/cookie';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(1, 'Name is required'),
  organizationName: z.string().min(1, 'Organization name is required'),
  department: z.string().optional(),
  selectedTier: z.enum(['free', 'enterprise']).optional().default('free'),
});;

const refreshSchema = z.object({
  // refreshToken in body is optional - we prefer HttpOnly cookie
  // Kept for backward compatibility during migration
  refreshToken: z.string().optional(),
});

const registerForInvitationSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(1, 'Name is required'),
  invitationToken: z.string().min(1, 'Invitation token is required'),
});

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user by email
    const user = await userService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if user is deactivated
    if (user.org_status === 'inactive') {
      throw new UnauthorizedError('Your account has been deactivated. Please contact your organization administrator.');
    }

    // Validate password
    const isValidPassword = await userService.validatePassword(password, user.password);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Fetch user's organizations for token
    const organizations = await db('organizations')
      .select('organizations.id', 'organizations.name')
      .join('users', 'users.organization_id', '=', 'organizations.id')
      .where('users.id', user.id)
      .where('organizations.is_active', true);

    // Use the first organization or default
    const primaryOrg = organizations[0];
    const orgId = primaryOrg?.id;

    // Generate tokens using JWTService
    const token = await jwtService.generateAccessToken(user.id, orgId);
    const { token: refreshToken } = await jwtService.generateRefreshToken(user.id);

    // Set refresh token as HttpOnly cookie (XSS protection)
    setRefreshTokenCookie(res, refreshToken);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Only return access token in body - refresh token is in HttpOnly cookie
    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};

export const logout = async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract token from authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // Blacklist the token to prevent reuse
      const blacklisted = await tokenBlacklistService.blacklistToken(token);
      if (blacklisted) {
        logger.info(`Token blacklisted for user ${req.user?.id}`);
      } else {
        logger.warn(`Failed to blacklist token for user ${req.user?.id}`);
      }
    }

    // Clear the refresh token HttpOnly cookie
    clearRefreshTokenCookie(res);

    logger.info(`User ${req.user?.id} logged out`);

    res.json({
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = refreshSchema.parse(req.body);

    // Prefer HttpOnly cookie, fall back to body for backward compatibility
    const refreshToken = getRefreshTokenFromCookie(req) || body.refreshToken;

    if (!refreshToken) {
      // No refresh token is a normal "no session" case, not an error
      // Return 401 directly without logging as error
      res.status(401).json({
        error: 'No active session',
        code: 'NO_SESSION'
      });
      return;
    }

    try {
      const decoded = jwtService.verifyRefreshToken(refreshToken);

      // Fetch actual user from database
      const user = await userService.findById(decoded.userId);

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Check if user is deactivated
      if (user.org_status === 'inactive') {
        throw new UnauthorizedError('Your account has been deactivated');
      }

      // Use user's organization_id directly (can be null for users without org)
      const orgId = user.organization_id || null;

      const token = await jwtService.generateAccessToken(user.id, orgId);
      const { token: newRefreshToken } = await jwtService.generateRefreshToken(user.id);

      // Set new refresh token as HttpOnly cookie
      setRefreshTokenCookie(res, newRefreshToken);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      // Only return access token in body - refresh token is in HttpOnly cookie
      res.json({
        token,
        user: userWithoutPassword,
      });
    } catch (tokenError) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, name, department, organizationName, selectedTier } = registerSchema.parse(req.body);

    // ====== DOMAIN CHECK: Block signup if org exists with multi-member plan ======
    const emailDomain = extractDomainForOrgCheck(email);
    if (emailDomain) {
      const existingDomainOrg = await db('organizations')
        .where(function() {
          this.where('domain', emailDomain)
            .orWhereRaw('LOWER(owner_email) LIKE ?', [`%@${emailDomain.toLowerCase()}`]);
        })
        .first();

      if (existingDomainOrg) {
        // Check if this is a multi-member plan (pro, team, business, enterprise)
        const tier = existingDomainOrg.subscription_tier || 'free';
        const isMultiMember = ['enterprise'].includes(tier);
        // Domain must be VERIFIED to be considered "claimed"
        const isDomainClaimed = existingDomainOrg.domain_verified === true;

        if (isMultiMember && isDomainClaimed) {
          // Domain is claimed by a paid org - block signup
          logger.info(`Blocked signup for ${email}: Domain claimed by ${existingDomainOrg.name} (${tier} plan, verified)`);

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
        logger.info(`Allowing signup for ${email}: Org ${existingDomainOrg.name} exists but domain not claimed (tier: ${tier}, verified: ${isDomainClaimed})`);
      }
    }
    // ====== END DOMAIN CHECK ======

    // ====== TRIAL DOMAIN CHECK: Prevent same corporate domain from starting multiple trials ======
    // Only check if user selected a paid tier (which requires a trial)
    if (selectedTier !== 'free') {
      const trialEligibility = await trialService.checkDomainTrialEligibility(email);
      if (!trialEligibility.eligible && trialEligibility.reason === 'DOMAIN_TRIAL_USED') {
        // Domain has already used a trial - block registration for paid tiers
        logger.info(`Blocked signup for ${email}: Domain already used trial with org "${trialEligibility.existingOrgName}"`);
        throw new BadRequestError(
          `A free trial has already been used for this email domain. ` +
          `Please contact ${trialEligibility.existingOrgName} to join their organization, ` +
          `or select the Free plan to continue.`
        );
      }
    }
    // ====== END TRIAL DOMAIN CHECK ======

    // Wrap user + organization creation in a transaction for atomicity
    const { user, organization } = await db.transaction(async (trx) => {
      // Create user with proper password hashing via userService
      const newUser = await userService.createUser(
        {
          email,
          password,
          name,
          department,
          role: 'employee',
        },
        trx // Pass transaction to userService
      );

      // Create organization for the new user
      // Always start with 'free' tier - trial will upgrade temporarily
      const newOrganization = await trx('organizations')
        .insert({
          id: require('uuid').v4(),
          name: organizationName,
          owner_id: newUser.id,
          is_active: true,
          subscription_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*')
        .then((rows: any[]) => rows[0]);

      // Store domain info for future matching (if columns exist)
      if (emailDomain) {
        try {
          await trx('organizations')
            .where('id', newOrganization.id)
            .update({
              domain: emailDomain,
              owner_email: email.toLowerCase(),
            });
        } catch (e) {
          // Columns might not exist in older schema - continue anyway
          logger.warn('Could not set domain/owner_email on organization:', e);
        }
      }

      const membershipNow = new Date();

      // Associate user with the organization (legacy table)
      await trx('users').where('id', newUser.id).update({
        organization_id: newOrganization.id,
        org_role: 'owner',
        org_status: 'active',
        joined_organization_at: membershipNow,
        updated_at: membershipNow,
      });

      // Add owner to organization_members table (new multi-org model)
      await trx('organization_members').insert({
        user_id: newUser.id,
        organization_id: newOrganization.id,
        role: 'owner',
        status: 'active',
        joined_at: membershipNow,
        created_at: membershipNow,
        updated_at: membershipNow,
      });

      return { user: newUser, organization: newOrganization };
    });

    logger.info(
      `Organization created: ${organizationName} (ID: ${organization.id}, Owner: ${user.email})`
    );

    // Start trial if user selected a paid tier
    let trialInfo = null;
    if (selectedTier !== 'free') {
      try {
        const trial = await trialService.startTrial(organization.id, selectedTier);
        trialInfo = {
          tier: trial.tier,
          status: trial.status,
          trialEnd: trial.trialEnd,
          daysRemaining: trial.daysRemaining,
        };
        logger.info(`Trial started for ${organizationName}: ${selectedTier} tier, ends ${trial.trialEnd.toISOString()}`);
      } catch (trialError) {
        // Log but don't fail registration if trial start fails
        logger.error(`Failed to start trial for ${organizationName}:`, trialError);
        // Continue with free tier
      }
    }

    // Generate tokens
    const token = await jwtService.generateAccessToken(user.id, organization.id);
    const { token: refreshToken } = await jwtService.generateRefreshToken(user.id);

    // Set refresh token as HttpOnly cookie (XSS protection)
    setRefreshTokenCookie(res, refreshToken);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Only return access token in body - refresh token is in HttpOnly cookie
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: userWithoutPassword,
      trial: trialInfo,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};;

// Helper: Extract domain from email, excluding public domains
function extractDomainForOrgCheck(email: string): string | null {
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2) return null;

  const domain = parts[1]!;
  const publicDomains = [
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'protonmail.com', 'proton.me',
    'zoho.com', 'mail.com', 'email.com',
    'yandex.com', 'yandex.ru', 'qq.com', '163.com', '126.com',
  ];

  return publicDomains.includes(domain) ? null : domain;
}

export const getMe = async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const user = await userService.findById(req.user.id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const loginWithImpersonationToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new BadRequestError('Impersonation token is required');
    }

    // 1. Verify token in database
    const tokenRecord = await db('admin_impersonation_tokens')
      .where('token', token)
      .where('expires_at', '>', new Date())
      .first();

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid or expired impersonation token');
    }

    // 2. Get system admin details
    const systemAdmin = await db('users').where('id', tokenRecord.system_admin_id).first();
    if (!systemAdmin) {
      throw new UnauthorizedError('System admin not found');
    }

    // Verify the user is actually a system admin
    if (!systemAdmin.is_system_admin) {
      throw new UnauthorizedError('User is not a system admin');
    }

    // 3. Get target organization details for logging
    const targetOrg = await db('organizations')
      .where('id', tokenRecord.organization_id)
      .first();

    if (!targetOrg) {
      throw new NotFoundError('Target organization not found');
    }

    // 4. Generate JWT with cross-tenant access (sysadmin keeps their own identity)
    // This allows the sysadmin to access the target org without appearing in user lists
    const accessToken = await jwtService.generateAccessToken(
      systemAdmin.id, // Keep sysadmin's ID - they maintain their own identity
      null, // Don't use default org lookup
      {
        impersonationId: tokenRecord.id,
        actorUserId: systemAdmin.id,
      },
      {
        // Cross-tenant access: grant owner-level access to target org
        targetOrgId: tokenRecord.organization_id,
        grantRole: 'owner',
      }
    );

    const { token: refreshToken } = await jwtService.generateRefreshToken(systemAdmin.id);

    // 5. Cleanup used token to prevent replay
    await db('admin_impersonation_tokens').where('id', tokenRecord.id).del();

    // 6. Log the successful cross-tenant access
    await db('organization_audit_logs').insert({
      organization_id: tokenRecord.organization_id,
      actor_id: systemAdmin.id,
      action: 'admin_cross_tenant_access',
      resource_type: 'auth',
      metadata: { 
        sysadmin_email: systemAdmin.email,
        target_org_id: tokenRecord.organization_id,
        target_org_name: targetOrg.name,
      },
      status: 'success',
      created_at: new Date(),
    });

    logger.info(
      `Sysadmin ${systemAdmin.email} accessed organization "${targetOrg.name}" (${tokenRecord.organization_id}) via cross-tenant access`
    );

    // 7. Return auth response with sysadmin info (not target org owner)
    const { password: _, ...userWithoutPassword } = systemAdmin;

    res.json({
      message: 'Cross-tenant access successful',
      token: accessToken,
      refreshToken,
      user: userWithoutPassword,
      isImpersonating: true,
      targetOrganization: {
        id: targetOrg.id,
        name: targetOrg.name,
        slug: targetOrg.slug,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate Google OAuth flow
 * Redirects user to Google's consent page
 */
export const googleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Get mode and optional org name from query params
    const mode = (req.query.mode as 'login' | 'signup') || 'login';
    const organizationName = req.query.org as string | undefined;
    const returnUrl = req.query.returnUrl as string | undefined;

    const authUrl = googleOAuthService.getAuthUrl({
      mode,
      organizationName,
      returnUrl,
    });

    logger.info(`Google OAuth: Redirecting to Google for ${mode}`);
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Google OAuth initiation error:', error);
    next(error);
  }
};

/**
 * Handle Google OAuth callback
 * Exchanges code for tokens, creates/finds user, redirects to frontend
 */
export const googleCallback = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const { code, state, error: googleError } = req.query;

    // Frontend URL for redirects
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Handle Google OAuth errors
    if (googleError) {
      logger.error(`Google OAuth error: ${googleError}`);
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed&message=${encodeURIComponent(String(googleError))}`);
    }

    if (!code) {
      logger.error('Google OAuth: No code received');
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed&message=No+authorization+code+received`);
    }

    // Parse state to get mode and other data
    const stateData = state ? googleOAuthService.parseState(String(state)) : { mode: 'login' as const };

    try {
      // Exchange code for user info
      const googleUser = await googleOAuthService.handleCallback(String(code));

      // Find or create user
      // Pass returnUrl so it can detect invitation signups and skip org creation
      const result = await googleOAuthService.findOrCreateUser(
        googleUser,
        stateData.mode,
        stateData.organizationName,
        stateData.returnUrl
      );

      // Determine redirect URL
      // If user has an organization (invitation was accepted), go to dashboard
      // Otherwise, keep the original returnUrl (which might be the join page)
      let redirectUrl = stateData.returnUrl || '/dashboard';
      if (result.organization && stateData.returnUrl?.includes('join-organization')) {
        // Invitation was successfully accepted during OAuth, go to dashboard
        redirectUrl = '/dashboard';
        logger.info('Google OAuth: Invitation accepted, redirecting to dashboard');
      }

      // Set refresh token as HttpOnly cookie (XSS protection)
      setRefreshTokenCookie(res, result.refreshToken);

      // Build success URL with access token only
      // Refresh token is in HttpOnly cookie, not URL (security improvement)
      const successUrl = new URL(`${frontendUrl}/auth/callback`);
      successUrl.searchParams.set('token', result.accessToken);
      successUrl.searchParams.set('returnUrl', redirectUrl);
      if (result.isNewUser) {
        successUrl.searchParams.set('isNewUser', 'true');
      }

      logger.info(`Google OAuth: Successfully authenticated ${googleUser.email} (new user: ${result.isNewUser})`);
      return res.redirect(successUrl.toString());

    } catch (oauthError: any) {
      // Handle specific errors
      if (oauthError.message === 'NO_ACCOUNT') {
        logger.info('Google OAuth: User tried to login but has no account');
        return res.redirect(
          `${frontendUrl}/login?error=no_account&message=${encodeURIComponent('No account found with this Google email. Please sign up first.')}`
        );
      }

      // Handle OrganizationExistsError - redirect to register page with organization info
      if (oauthError instanceof OrganizationExistsError && oauthError.data) {
        logger.info(`Google OAuth: Organization exists error - ${oauthError.data.organizationName}`);
        const errorUrl = new URL(`${frontendUrl}/register`);
        errorUrl.searchParams.set('error', 'organization_exists');
        errorUrl.searchParams.set('errorCode', 'ORGANIZATION_EXISTS_MULTI_MEMBER');
        errorUrl.searchParams.set('orgName', oauthError.data.organizationName);
        errorUrl.searchParams.set('subscriberEmail', oauthError.data.subscriberEmail);
        errorUrl.searchParams.set('subscriberName', oauthError.data.subscriberName || 'the account administrator');
        errorUrl.searchParams.set('message', encodeURIComponent(oauthError.message));
        return res.redirect(errorUrl.toString());
      }

      logger.error('Google OAuth callback error:', oauthError);
      return res.redirect(
        `${frontendUrl}/login?error=google_auth_failed&message=${encodeURIComponent(oauthError.message || 'Authentication failed')}`
      );
    }
  } catch (error) {
    logger.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/login?error=google_auth_failed&message=An+unexpected+error+occurred`);
  }
};

/**
 * Register a new user via invitation token
 * Creates user account and automatically joins the organization
 * POST /api/auth/register-for-invitation
 *
 * Body: { email, password, name, invitationToken }
 * Returns: { token, refreshToken, user, organization }
 */
export const registerForInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, name, invitationToken } = registerForInvitationSchema.parse(req.body);

    // 1. Validate the invitation token
    const validationResult = await invitationService.validateInvitationToken(invitationToken);

    if (!validationResult.valid) {
      throw new BadRequestError(validationResult.error || 'Invalid invitation token');
    }

    // 2. Check that email matches the invitation email
    if (email.toLowerCase() !== validationResult.invitation?.email.toLowerCase()) {
      throw new BadRequestError(
        `Email must match the invited email address (${validationResult.invitation?.email})`
      );
    }

    // 3. Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestError(
        'An account with this email already exists. Please sign in instead.'
      );
    }

    // 4. Create the user WITHOUT an organization (they'll join via invitation)
    const user = await userService.createUser({
      email: email.toLowerCase(),
      password,
      name,
      role: 'employee',
    });

    logger.info(`User created via invitation: ${user.email}`);

    // 5. Accept the invitation - this will add user to the organization
    await organizationMemberService.acceptInvitation(invitationToken, user.id);

    logger.info(`User ${user.email} joined organization ${validationResult.organizationId} via invitation`);

    // 6. Fetch the updated user with organization info
    const updatedUser = await db('users')
      .where('id', user.id)
      .first();

    // 7. Generate tokens
    const token = await jwtService.generateAccessToken(user.id, validationResult.organizationId);
    const { token: refreshToken } = await jwtService.generateRefreshToken(user.id);

    // Set refresh token as HttpOnly cookie (XSS protection)
    setRefreshTokenCookie(res, refreshToken);

    // 8. Get organization details for response
    const organization = await db('organizations')
      .where('id', validationResult.organizationId)
      .select('id', 'name')
      .first();

    // Remove password from response
    const { password: _, ...userWithoutPassword } = updatedUser;

    // Only return access token in body - refresh token is in HttpOnly cookie
    res.status(201).json({
      message: 'Registration successful! You have joined the organization.',
      token,
      user: userWithoutPassword,
      organization: {
        id: organization.id,
        name: organization.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};


const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    await userService.changePassword(userId, currentPassword, newPassword);

    res.json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};
