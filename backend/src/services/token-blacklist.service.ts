import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';

/**
 * Token Blacklist Service
 *
 * Provides JWT token revocation functionality using Redis.
 * When a user logs out or their token needs to be invalidated,
 * the token is added to a blacklist in Redis with a TTL matching
 * the token's expiration time.
 *
 * This approach is efficient because:
 * 1. Blacklist entries auto-expire when the token would have expired anyway
 * 2. Redis provides O(1) lookup time for checking blacklisted tokens
 * 3. Memory usage is minimal as entries are automatically cleaned up
 */

const BLACKLIST_PREFIX = 'token:blacklist:';

class TokenBlacklistService {
  /**
   * Add a token to the blacklist
   * @param token - The JWT token to blacklist
   * @returns true if successfully blacklisted, false otherwise
   */
  async blacklistToken(token: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        logger.warn('Token blacklist: Redis unavailable, token not blacklisted');
        return false;
      }

      // Decode token to get expiration time (don't verify - it might be expired)
      const decoded = jwt.decode(token) as { exp?: number; jti?: string } | null;

      if (!decoded || !decoded.exp) {
        logger.warn('Token blacklist: Cannot decode token or no expiration');
        return false;
      }

      // Calculate TTL (time until token expires)
      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;

      // If token is already expired, no need to blacklist
      if (ttl <= 0) {
        logger.debug('Token blacklist: Token already expired, no need to blacklist');
        return true;
      }

      // Use JTI (JWT ID) if available, otherwise hash the token
      const tokenKey = decoded.jti || this.hashToken(token);
      const key = `${BLACKLIST_PREFIX}${tokenKey}`;

      // Store with TTL matching token expiration
      await redis.setex(key, ttl, '1');

      logger.info(`Token blacklisted successfully (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error('Token blacklist error:', error);
      return false;
    }
  }

  /**
   * Check if a token is blacklisted
   * @param token - The JWT token to check
   * @returns true if blacklisted, false if not blacklisted or Redis unavailable
   */
  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        // If Redis is unavailable, allow the request (fail open for availability)
        // The JWT signature will still be verified by the auth middleware
        return false;
      }

      const decoded = jwt.decode(token) as { jti?: string } | null;
      const tokenKey = decoded?.jti || this.hashToken(token);
      const key = `${BLACKLIST_PREFIX}${tokenKey}`;

      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Token blacklist check error:', error);
      // Fail open - if we can't check, allow the request
      return false;
    }
  }

  /**
   * Blacklist all tokens for a user (e.g., on password change)
   * This stores a timestamp - any token issued before this time is invalid
   * @param userId - The user ID to invalidate tokens for
   * @param ttlSeconds - How long to keep this invalidation (default: 7 days)
   */
  async invalidateAllUserTokens(userId: string, ttlSeconds: number = 604800): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        logger.warn('Token blacklist: Redis unavailable, user tokens not invalidated');
        return false;
      }

      const key = `${BLACKLIST_PREFIX}user:${userId}:invalidated_at`;
      const now = Math.floor(Date.now() / 1000);

      await redis.setex(key, ttlSeconds, now.toString());

      logger.info(`All tokens invalidated for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Invalidate user tokens error:', error);
      return false;
    }
  }

  /**
   * Check if a token was issued before user's invalidation timestamp
   * @param userId - The user ID
   * @param tokenIssuedAt - The token's iat (issued at) claim
   */
  async isTokenInvalidatedForUser(userId: string, tokenIssuedAt: number): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return false;
      }

      const key = `${BLACKLIST_PREFIX}user:${userId}:invalidated_at`;
      const invalidatedAt = await redis.get(key);

      if (!invalidatedAt) {
        return false;
      }

      // If token was issued before invalidation, it's invalid
      return tokenIssuedAt < parseInt(invalidatedAt, 10);
    } catch (error) {
      logger.error('Check user token invalidation error:', error);
      return false;
    }
  }

  /**
   * Simple hash function to create a key from the token
   * Using a hash is faster than storing the full token and prevents
   * the Redis key from being excessively long
   */
  private hashToken(token: string): string {
    // Use a simple checksum-like approach for the key
    // This is not cryptographically secure but sufficient for keying
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get blacklist statistics
   */
  async getStats(): Promise<{ count: number } | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return null;
      }

      const keys = await redis.keys(`${BLACKLIST_PREFIX}*`);
      return { count: keys.length };
    } catch (error) {
      logger.error('Token blacklist stats error:', error);
      return null;
    }
  }
}

export const tokenBlacklistService = new TokenBlacklistService();
