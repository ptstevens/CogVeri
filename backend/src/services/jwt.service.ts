import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
// import { prisma } from '../db/prisma'; // Not using Prisma - using Knex instead
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { refreshTokenService } from './refresh-token.service';

// Token expiry constants
const TOKEN_EXPIRY = {
  ACCESS_TOKEN: '1h',
  REFRESH_TOKEN: '7d',
  IMPERSONATION_TOKEN: '30m', // Reduced from 1h for security
} as const;

// JWT issuer and audience for validation
const JWT_ISSUER = 'cogveri';
const JWT_AUDIENCE = 'cogveri-api';

export interface JWTAccessPayload {
  userId: string;
  email: string;
  org_id: string;
  org_slug: string;
  org_role: string;
  organizations: Array<{ id: string; slug: string; role: string }>;
  impersonation_id?: string;
  impersonation_actor_id?: string;
  is_system_admin?: boolean;
  type: 'access';
}

export interface JWTRefreshPayload {
  userId: string;
  email: string;
  type: 'refresh';
  jti: string; // Unique token ID to prevent hash collisions
  // Cross-tenant access context (for sysadmin impersonation)
  crossTenantOrgId?: string;
  crossTenantRole?: 'owner' | 'admin';
}

export interface ImpersonationTokenPayload {
  userId: string;
  targetUserId: string;
  targetOrgId: string;
  actorUserId: string;
  impersonationId: string;
  type: 'impersonation';
}

export class JWTService {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private readonly accessTokenExpiry = TOKEN_EXPIRY.ACCESS_TOKEN;
  private readonly refreshTokenExpiry = TOKEN_EXPIRY.REFRESH_TOKEN;
  private readonly impersonationTokenExpiry = TOKEN_EXPIRY.IMPERSONATION_TOKEN;

  constructor() {
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET environment variables must be configured');
    }
    this.accessTokenSecret = process.env.JWT_SECRET;
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET;
  }

  /**
   * Generate access token with organization context
   */
  async generateAccessToken(
    userId: string,
    organizationId?: string | null,
    impersonationData?: { impersonationId: string; actorUserId: string },
    crossTenantAccess?: {
      targetOrgId: string;
      grantRole: 'owner' | 'admin';
    }
  ): Promise<string> {
    try {
      // Fetch user details from database
      const user = await db('users').where('id', userId).first();
      if (!user) {
        throw new Error('User not found');
      }

      // Handle sysadmin cross-tenant access (impersonation without becoming another user)
      // This allows sysadmins to access other orgs while maintaining their own identity
      if (crossTenantAccess && user.is_system_admin) {
        const targetOrg = await db('organizations')
          .where('id', crossTenantAccess.targetOrgId)
          .first();

        if (!targetOrg) {
          throw new Error('Target organization not found');
        }

        const payload: JWTAccessPayload = {
          userId,
          email: user.email,
          org_id: crossTenantAccess.targetOrgId,
          org_slug: targetOrg.slug || '',
          org_role: crossTenantAccess.grantRole, // Override role for cross-tenant access
          organizations: [], // Empty - sysadmin has no actual memberships in target org
          is_system_admin: true,
          type: 'access',
          ...(impersonationData && {
            impersonation_id: impersonationData.impersonationId,
            impersonation_actor_id: impersonationData.actorUserId,
          }),
        };

        const token = jwt.sign(payload, this.accessTokenSecret, {
          expiresIn: this.accessTokenExpiry,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });

        return token;
      }

      // Fetch ALL user's organizations from organization_members table
      const memberships = await db('organization_members as om')
        .join('organizations as o', 'o.id', 'om.organization_id')
        .where('om.user_id', userId)
        .where('om.status', 'active')
        .where('o.is_active', true)
        .select('o.id', 'o.slug', 'om.role');

      // Build organizations array for the token
      const organizations = memberships.map(m => ({
        id: m.id,
        slug: m.slug || '',
        role: m.role,
      }));

      // If no memberships found, fall back to legacy users table (transition period)
      if (organizations.length === 0 && user.organization_id) {
        const legacyOrg = await db('organizations')
          .where('id', user.organization_id)
          .where('is_active', true)
          .first();
        
        if (legacyOrg) {
          organizations.push({
            id: legacyOrg.id,
            slug: legacyOrg.slug || '',
            role: user.org_role || 'limited',
          });
        }
      }

      // Determine active organization
      let activeOrgId = organizationId || user.current_organization_id || '';
      let activeOrgSlug = '';
      let activeOrgRole = 'limited';

      if (activeOrgId) {
        const activeOrg = organizations.find(m => m.id === activeOrgId);
        if (activeOrg) {
          activeOrgSlug = activeOrg.slug;
          activeOrgRole = activeOrg.role;
        } else {
          // Requested org not found, default to first available
          const firstOrg = organizations[0];
          if (firstOrg) {
            activeOrgId = firstOrg.id;
            activeOrgSlug = firstOrg.slug;
            activeOrgRole = firstOrg.role;
          }
        }
      } else {
        // No org specified, use first available
        const firstOrg = organizations[0];
        if (firstOrg) {
          activeOrgId = firstOrg.id;
          activeOrgSlug = firstOrg.slug;
          activeOrgRole = firstOrg.role;
        }
      }

      const payload: JWTAccessPayload = {
        userId,
        email: user.email,
        org_id: activeOrgId,
        org_slug: activeOrgSlug,
        org_role: activeOrgRole,
        organizations, // Now populated with all user's organizations!
        is_system_admin: user.is_system_admin || false,
        type: 'access',
        ...(impersonationData && {
          impersonation_id: impersonationData.impersonationId,
          impersonation_actor_id: impersonationData.actorUserId,
        }),
      };

      const token = jwt.sign(payload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      return token;
    } catch (error) {
      logger.error('Error generating access token:', error);
      throw error;
    }
  }

  /**
   * Generate refresh token with rotation support
   *
   * @param userId - User ID
   * @param metadata - Optional device/session metadata
   * @returns Object containing token and family ID
   */
  async generateRefreshToken(
    userId: string,
    metadata?: { deviceFingerprint?: string; ipAddress?: string; userAgent?: string },
    crossTenantAccess?: { targetOrgId: string; grantRole: 'owner' | 'admin' }
  ): Promise<{ token: string; familyId: string }> {
    try {
      const payload: JWTRefreshPayload = {
        userId,
        email: '',
        type: 'refresh',
        jti: randomUUID(), // Unique token ID to prevent hash collisions
        // Include cross-tenant context if provided (for sysadmin impersonation)
        ...(crossTenantAccess && {
          crossTenantOrgId: crossTenantAccess.targetOrgId,
          crossTenantRole: crossTenantAccess.grantRole,
        }),
      };

      const token = jwt.sign(payload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      // Store token in database for rotation tracking
      const { familyId } = await refreshTokenService.createToken(userId, token, metadata);

      return { token, familyId };
    } catch (error) {
      logger.error('Error generating refresh token:', error);
      throw error;
    }
  }

  /**
   * Rotate refresh token (issue new one, invalidate old one)
   * This is the core security mechanism for refresh token rotation.
   *
   * @param oldToken - The current refresh token
   * @param metadata - Optional device/session metadata
   * @returns New token and user info, or null if rotation failed
   */
  async rotateRefreshToken(
    oldToken: string,
    metadata?: { deviceFingerprint?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ token: string; userId: string; familyId: string } | null> {
    try {
      // First verify the JWT signature
      let decoded: JWTRefreshPayload;
      try {
        decoded = jwt.verify(oldToken, this.refreshTokenSecret, {
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        }) as JWTRefreshPayload;
      } catch {
        // Token is invalid or expired at JWT level
        logger.warn('Refresh token rotation failed: invalid JWT');
        return null;
      }

      if (decoded.type !== 'refresh') {
        logger.warn('Refresh token rotation failed: wrong token type');
        return null;
      }

      // Generate new token with unique jti to prevent hash collisions
      const newPayload: JWTRefreshPayload = {
        userId: decoded.userId,
        email: decoded.email,
        type: 'refresh',
        jti: randomUUID(),
      };

      const newToken = jwt.sign(newPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      // Rotate in database (this handles reuse detection)
      const result = await refreshTokenService.rotateToken(oldToken, newToken, metadata);

      if (!result) {
        // Rotation failed (token not found, already revoked, or reuse detected)
        return null;
      }

      return {
        token: newToken,
        userId: result.userId,
        familyId: result.familyId,
      };
    } catch (error) {
      logger.error('Error rotating refresh token:', error);
      return null;
    }
  }

  /**
   * Revoke a refresh token (for logout)
   */
  async revokeRefreshToken(token: string): Promise<boolean> {
    return refreshTokenService.revokeToken(token);
  }

  /**
   * Revoke all refresh tokens for a user (for security events)
   */
  async revokeAllUserTokens(userId: string, reason: string = 'manual'): Promise<number> {
    return refreshTokenService.revokeAllUserTokens(userId, reason);
  }

  /**
   * Generate impersonation token for admin impersonation
   * Records the impersonation session in the database for audit trail
   */
  async generateImpersonationToken(
    targetUserId: string,
    targetOrgId: string,
    actorUserId: string
  ): Promise<{ token: string; impersonationId: string }> {
    try {
      // Generate a unique token value for the JWT
      const tokenValue = randomUUID();

      // Calculate expiry time (same as JWT expiry)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes

      // Create impersonation record in database for audit trail
      const [impersonationRecord] = await db('admin_impersonation_tokens')
        .insert({
          system_admin_id: actorUserId,
          organization_id: targetOrgId,
          token: tokenValue, // Store token value for lookup
          expires_at: expiresAt,
        })
        .returning('id');

      const impersonationId = impersonationRecord.id;

      const payload: ImpersonationTokenPayload = {
        userId: targetUserId,
        targetUserId,
        targetOrgId,
        actorUserId,
        impersonationId,
        type: 'impersonation',
      };

      const token = jwt.sign(payload, this.accessTokenSecret, {
        expiresIn: this.impersonationTokenExpiry,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      logger.info('Impersonation token created', {
        impersonationId,
        actorUserId,
        targetOrgId,
        expiresAt,
      });

      return { token, impersonationId };
    } catch (error) {
      logger.error('Error generating impersonation token:', error);
      throw error;
    }
  }

  /**
   * Verify access token with issuer/audience validation
   */
  verifyAccessToken(token: string): JWTAccessPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JWTAccessPayload;
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.error('Error verifying access token:', error);
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify refresh token with issuer/audience validation
   */
  verifyRefreshToken(token: string): JWTRefreshPayload {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JWTRefreshPayload;
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.error('Error verifying refresh token:', error);
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Verify impersonation token with issuer/audience validation
   */
  verifyImpersonationToken(token: string): ImpersonationTokenPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as ImpersonationTokenPayload;
      if (decoded.type !== 'impersonation') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.error('Error verifying impersonation token:', error);
      throw new Error('Invalid or expired impersonation token');
    }
  }

  /**
   * Switch active organization without re-login
   */
  async switchOrganization(
    userId: string,
    targetOrgId: string,
    crossTenantAccess?: { isSystemAdmin: boolean; currentOrgId?: string }
  ): Promise<string> {
    try {
      // Check if user is a sysadmin with active cross-tenant access
      if (crossTenantAccess?.isSystemAdmin) {
        // Verify the target org exists
        const targetOrg = await db('organizations')
          .where('id', targetOrgId)
          .where('is_active', true)
          .first();

        if (!targetOrg) {
          throw new Error('Organization not found or inactive');
        }

        // Sysadmins with cross-tenant access can switch to any org
        // Generate token with cross-tenant access preserved
        return this.generateAccessToken(
          userId,
          null,
          {
            impersonationId: 'cross-tenant-switch',
            actorUserId: userId,
          },
          {
            targetOrgId,
            grantRole: 'owner',
          }
        );
      }

      // SECURITY: For regular users, verify they are a member of the target organization
      // Check organization_members table first (new model)
      let membership = await db('organization_members')
        .where('user_id', userId)
        .where('organization_id', targetOrgId)
        .where('status', 'active')
        .first();

      // Fall back to legacy users table if no membership found (transition period)
      if (!membership) {
        const legacyMembership = await db('users')
          .where('id', userId)
          .where('organization_id', targetOrgId)
          .whereNotNull('org_role')
          .whereIn('org_status', ['active', 'pending'])
          .first();

        if (!legacyMembership) {
          logger.warn(`Security: User ${userId} attempted to switch to unauthorized organization ${targetOrgId}`);
          throw new Error('User is not a member of this organization');
        }
      }

      // Update user's current organization in the database
      await db('users')
        .where('id', userId)
        .update({
          current_organization_id: targetOrgId,
          updated_at: new Date(),
        });

      // Generate new access token with target org as active
      return this.generateAccessToken(userId, targetOrgId);
    } catch (error) {
      logger.error('Error switching organization:', error);
      throw error;
    }
  }

  /**
   * Validate user has required role in organization
   */
  async validateUserRole(
    userId: string,
    organizationId: string,
    requiredRoles: string[]
  ): Promise<boolean> {
    try {
      // SECURITY: Query database for actual user membership and role
      // First check organization_members table (new multi-org model)
      const orgMembership = await db('organization_members')
        .where('user_id', userId)
        .where('organization_id', organizationId)
        .where('status', 'active')
        .select('role')
        .first();

      let userRole: string | null = null;

      if (orgMembership) {
        userRole = orgMembership.role;
      } else {
        // Fallback to legacy users table (transition period)
        const legacyMembership = await db('users')
          .where('id', userId)
          .where('organization_id', organizationId)
          .whereNotNull('org_role')
          .whereIn('org_status', ['active', 'pending'])
          .select('org_role')
          .first();

        if (legacyMembership) {
          userRole = legacyMembership.org_role;
        }
      }

      if (!userRole) {
        logger.warn(`Security: User ${userId} failed role validation - not a member of organization ${organizationId}`);
        return false;
      }

      // Normalize role comparison (handle case sensitivity)
      const normalizedUserRole = userRole.toUpperCase();
      const normalizedRequiredRoles = requiredRoles.map(r => r.toUpperCase());

      const hasRole = normalizedRequiredRoles.includes(normalizedUserRole);

      if (!hasRole) {
        logger.warn(`Security: User ${userId} has role ${normalizedUserRole} but requires one of [${normalizedRequiredRoles.join(', ')}]`);
      }

      return hasRole;
    } catch (error) {
      logger.error('Error validating user role:', error);
      return false;
    }
  }

  /**
   * Extract user ID from token without verification (for debugging)
   */
  decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Error decoding token:', error);
      return null;
    }
  }
}

export const jwtService = new JWTService();
