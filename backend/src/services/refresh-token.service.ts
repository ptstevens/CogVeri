import { createHash, randomUUID } from 'crypto';
import { db } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Refresh Token Service with Rotation and Reuse Detection
 *
 * Security features:
 * - Token rotation: New token issued on each refresh, old one invalidated
 * - Family tracking: All tokens in a rotation chain share a family ID
 * - Reuse detection: If a revoked token is used, entire family is invalidated
 * - Token hashing: Only hash stored in DB, actual token never persisted
 */

interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  parent_id: string | null;
  revoked: boolean;
  revoked_at: Date | null;
  revoked_reason: string | null;
  device_fingerprint: string | null;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: Date;
  created_at: Date;
  last_used_at: Date | null;
}

interface TokenMetadata {
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface CreateTokenResult {
  tokenId: string;
  familyId: string;
}

interface ValidateTokenResult {
  valid: boolean;
  userId?: string;
  tokenId?: string;
  familyId?: string;
  reason?: string;
}

class RefreshTokenService {
  private readonly TOKEN_EXPIRY_DAYS = 7;

  /**
   * Hash a token for storage (never store the actual token)
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create a new refresh token (for initial login)
   */
  async createToken(
    userId: string,
    token: string,
    metadata?: TokenMetadata
  ): Promise<CreateTokenResult> {
    const tokenHash = this.hashToken(token);
    const familyId = randomUUID();
    const tokenId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.TOKEN_EXPIRY_DAYS);

    try {
      await db('refresh_tokens').insert({
        id: tokenId,
        user_id: userId,
        token_hash: tokenHash,
        family_id: familyId,
        parent_id: null,
        revoked: false,
        device_fingerprint: metadata?.deviceFingerprint || null,
        ip_address: metadata?.ipAddress || null,
        user_agent: metadata?.userAgent?.substring(0, 500) || null,
        expires_at: expiresAt,
        created_at: new Date(),
      });

      logger.info(`Created refresh token for user ${userId}, family ${familyId}`);
      return { tokenId, familyId };
    } catch (error) {
      logger.error('Error creating refresh token:', error);
      throw error;
    }
  }

  /**
   * Rotate a refresh token (issue new one, revoke old one)
   * This is the core of the security mechanism.
   */
  async rotateToken(
    oldToken: string,
    newToken: string,
    metadata?: TokenMetadata
  ): Promise<{ tokenId: string; familyId: string; userId: string } | null> {
    const oldTokenHash = this.hashToken(oldToken);
    const newTokenHash = this.hashToken(newToken);

    try {
      // Find the old token
      const oldTokenRecord = await db('refresh_tokens')
        .where('token_hash', oldTokenHash)
        .first() as RefreshTokenRecord | undefined;

      if (!oldTokenRecord) {
        logger.warn('Token rotation failed: token not found');
        return null;
      }

      // CRITICAL: Check if token was already revoked (reuse attack detection)
      if (oldTokenRecord.revoked) {
        logger.error(
          `SECURITY: Token reuse detected for user ${oldTokenRecord.user_id}, family ${oldTokenRecord.family_id}. ` +
          `Invalidating entire token family.`
        );

        // Invalidate the entire token family
        await this.invalidateFamily(oldTokenRecord.family_id, 'reuse_detected');
        return null;
      }

      // Check if token is expired
      if (new Date(oldTokenRecord.expires_at) < new Date()) {
        logger.warn(`Token rotation failed: token expired for user ${oldTokenRecord.user_id}`);
        // Revoke the expired token
        await db('refresh_tokens')
          .where('id', oldTokenRecord.id)
          .update({
            revoked: true,
            revoked_at: new Date(),
            revoked_reason: 'expired',
          });
        return null;
      }

      // Create new token and revoke old one in a transaction
      const newTokenId = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.TOKEN_EXPIRY_DAYS);

      await db.transaction(async (trx) => {
        // Revoke old token
        await trx('refresh_tokens')
          .where('id', oldTokenRecord.id)
          .update({
            revoked: true,
            revoked_at: new Date(),
            revoked_reason: 'rotation',
            last_used_at: new Date(),
          });

        // Create new token in same family
        await trx('refresh_tokens').insert({
          id: newTokenId,
          user_id: oldTokenRecord.user_id,
          token_hash: newTokenHash,
          family_id: oldTokenRecord.family_id,
          parent_id: oldTokenRecord.id,
          revoked: false,
          device_fingerprint: metadata?.deviceFingerprint || oldTokenRecord.device_fingerprint,
          ip_address: metadata?.ipAddress || oldTokenRecord.ip_address,
          user_agent: metadata?.userAgent?.substring(0, 500) || oldTokenRecord.user_agent,
          expires_at: expiresAt,
          created_at: new Date(),
        });
      });

      logger.info(
        `Rotated refresh token for user ${oldTokenRecord.user_id}, family ${oldTokenRecord.family_id}`
      );

      return {
        tokenId: newTokenId,
        familyId: oldTokenRecord.family_id,
        userId: oldTokenRecord.user_id,
      };
    } catch (error) {
      logger.error('Error rotating refresh token:', error);
      throw error;
    }
  }

  /**
   * Validate a refresh token without rotating it
   * Used to check if a token is still valid.
   */
  async validateToken(token: string): Promise<ValidateTokenResult> {
    const tokenHash = this.hashToken(token);

    try {
      const tokenRecord = await db('refresh_tokens')
        .where('token_hash', tokenHash)
        .first() as RefreshTokenRecord | undefined;

      if (!tokenRecord) {
        return { valid: false, reason: 'not_found' };
      }

      // CRITICAL: Check for reuse attack
      if (tokenRecord.revoked) {
        logger.error(
          `SECURITY: Attempted use of revoked token for user ${tokenRecord.user_id}, ` +
          `family ${tokenRecord.family_id}. Invalidating family.`
        );
        await this.invalidateFamily(tokenRecord.family_id, 'reuse_detected');
        return { valid: false, reason: 'reuse_detected' };
      }

      // Check expiry
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return { valid: false, reason: 'expired' };
      }

      return {
        valid: true,
        userId: tokenRecord.user_id,
        tokenId: tokenRecord.id,
        familyId: tokenRecord.family_id,
      };
    } catch (error) {
      logger.error('Error validating refresh token:', error);
      return { valid: false, reason: 'error' };
    }
  }

  /**
   * Revoke a specific token (e.g., on logout)
   */
  async revokeToken(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    try {
      const updated = await db('refresh_tokens')
        .where('token_hash', tokenHash)
        .where('revoked', false)
        .update({
          revoked: true,
          revoked_at: new Date(),
          revoked_reason: 'logout',
        });

      return updated > 0;
    } catch (error) {
      logger.error('Error revoking refresh token:', error);
      return false;
    }
  }

  /**
   * Invalidate an entire token family (e.g., on reuse detection or password change)
   */
  async invalidateFamily(familyId: string, reason: string): Promise<number> {
    try {
      const updated = await db('refresh_tokens')
        .where('family_id', familyId)
        .where('revoked', false)
        .update({
          revoked: true,
          revoked_at: new Date(),
          revoked_reason: reason,
        });

      logger.info(`Invalidated ${updated} tokens in family ${familyId}, reason: ${reason}`);
      return updated;
    } catch (error) {
      logger.error('Error invalidating token family:', error);
      throw error;
    }
  }

  /**
   * Revoke all tokens for a user (e.g., on password change or security concern)
   */
  async revokeAllUserTokens(userId: string, reason: string = 'manual'): Promise<number> {
    try {
      const updated = await db('refresh_tokens')
        .where('user_id', userId)
        .where('revoked', false)
        .update({
          revoked: true,
          revoked_at: new Date(),
          revoked_reason: reason,
        });

      logger.info(`Revoked ${updated} refresh tokens for user ${userId}, reason: ${reason}`);
      return updated;
    } catch (error) {
      logger.error('Error revoking all user tokens:', error);
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Array<{
    id: string;
    device: string | null;
    ip: string | null;
    createdAt: Date;
    lastUsedAt: Date | null;
  }>> {
    try {
      const tokens = await db('refresh_tokens')
        .where('user_id', userId)
        .where('revoked', false)
        .where('expires_at', '>', new Date())
        .select('id', 'device_fingerprint', 'ip_address', 'user_agent', 'created_at', 'last_used_at')
        .orderBy('created_at', 'desc');

      return tokens.map((t) => ({
        id: t.id,
        device: t.device_fingerprint || t.user_agent,
        ip: t.ip_address,
        createdAt: t.created_at,
        lastUsedAt: t.last_used_at,
      }));
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired and old revoked tokens
   * Should be called periodically (e.g., daily cron job)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      // Delete tokens that:
      // 1. Expired more than 7 days ago, OR
      // 2. Were revoked more than 24 hours ago
      const deleted = await db('refresh_tokens')
        .where((builder) => {
          builder
            .where('expires_at', '<', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
            .orWhere((subBuilder) => {
              subBuilder
                .where('revoked', true)
                .where('revoked_at', '<', new Date(Date.now() - 24 * 60 * 60 * 1000));
            });
        })
        .delete();

      logger.info(`Cleaned up ${deleted} expired/revoked refresh tokens`);
      return deleted;
    } catch (error) {
      logger.error('Error cleaning up refresh tokens:', error);
      return 0;
    }
  }
}

export const refreshTokenService = new RefreshTokenService();
