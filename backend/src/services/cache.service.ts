import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Cache Service - Provides a unified interface for caching
 * Implements fallback behavior when Redis is unavailable
 * Uses strategic TTLs (Time-To-Live) for different data types
 *
 * PERFORMANCE NOTES:
 * - Uses SCAN instead of KEYS for pattern operations (non-blocking)
 * - Supports batch operations for bulk updates
 * - Implements circuit breaker pattern for Redis failures
 */

// =============================================================================
// CACHE TTL CONSTANTS
// =============================================================================

/**
 * Standard TTL values in seconds for different cache durations
 */
export const CACHE_TTLS = {
  /** Very short-lived cache for rapidly changing data (30 seconds) */
  VERY_SHORT: 30,
  /** Short-lived cache for frequently changing data (1 minute) */
  SHORT: 60,
  /** Medium-lived cache for moderately stable data (5 minutes) */
  MEDIUM: 300,
  /** Long-lived cache for stable data (1 hour) */
  LONG: 3600,
  /** Very long-lived cache for rarely changing data (6 hours) */
  VERY_LONG: 21600,
  /** Pricing data cache (24 hours) */
  PRICING: 86400,
  /** Static configuration cache (1 week) */
  STATIC: 604800,
} as const;

export type CacheTTL = (typeof CACHE_TTLS)[keyof typeof CACHE_TTLS];

// =============================================================================
// CACHE KEY GENERATORS
// =============================================================================

/**
 * Cache key generators for type-safe, consistent key naming
 * Each function returns a properly namespaced cache key
 */
export const CACHE_KEYS = {
  // Organization-related keys
  ORG_SETTINGS: (orgId: string) => `org:${orgId}:settings`,
  ORG_MEMBERS: (orgId: string) => `org:${orgId}:members`,
  ORG_STATS: (orgId: string) => `org:${orgId}:stats`,
  ORG_SUBSCRIPTION: (orgId: string) => `org:${orgId}:subscription`,
  ORG_USAGE: (orgId: string, period?: string) =>
    period ? `org:${orgId}:usage:${period}` : `org:${orgId}:usage`,

  // User-related keys
  USER_PROFILE: (userId: string) => `user:${userId}:profile`,
  USER_PERMISSIONS: (userId: string) => `user:${userId}:permissions`,
  USER_PREFERENCES: (userId: string) => `user:${userId}:preferences`,
  USER_ORG_ROLE: (userId: string, orgId: string) => `user:${userId}:org:${orgId}:role`,
  USER_SESSIONS: (userId: string) => `user:${userId}:sessions`,

  // Task-related keys
  TASK: (taskId: string) => `task:${taskId}`,
  TASK_LIST: (orgId: string, page?: number) =>
    page !== undefined ? `org:${orgId}:tasks:page:${page}` : `org:${orgId}:tasks`,
  TASK_RECORDINGS: (taskId: string) => `task:${taskId}:recordings`,
  TASK_TEMPLATE: (templateId: string) => `template:${templateId}`,
  TASK_TEMPLATES: (orgId: string) => `org:${orgId}:templates`,

  // Recording-related keys
  RECORDING: (recordingId: string) => `recording:${recordingId}`,
  RECORDING_ANALYSIS: (recordingId: string) => `recording:${recordingId}:analysis`,
  RECORDING_TRANSCRIPTION: (recordingId: string) => `recording:${recordingId}:transcription`,
  RECORDING_URL: (recordingId: string, type: 'playback' | 'download') =>
    `recording:${recordingId}:url:${type}`,

  // Dashboard-related keys
  DASHBOARD: (orgId: string, userId?: string) =>
    userId ? `dashboard:${orgId}:user:${userId}` : `dashboard:${orgId}`,
  DASHBOARD_METRICS: (orgId: string, period: string) => `dashboard:${orgId}:metrics:${period}`,
  DASHBOARD_RECENT: (orgId: string) => `dashboard:${orgId}:recent`,

  // Pricing and subscription keys
  PRICING_DATA: () => 'pricing:tiers',
  PRICING_FEATURES: () => 'pricing:features',
  SUBSCRIPTION_PLANS: () => 'subscription:plans',

  // Analytics keys
  ANALYTICS: (orgId: string, reportType: string, period: string) =>
    `analytics:${orgId}:${reportType}:${period}`,

  // Rate limiting keys
  RATE_LIMIT: (identifier: string, endpoint: string) => `ratelimit:${identifier}:${endpoint}`,
  RATE_LIMIT_GLOBAL: (identifier: string) => `ratelimit:${identifier}:global`,

  // Magic link keys
  MAGIC_LINK: (token: string) => `magiclink:${token}`,
  MAGIC_LINK_RATE: (email: string) => `magiclink:rate:${email}`,

  // Session and auth keys
  SESSION: (sessionId: string) => `session:${sessionId}`,
  REFRESH_TOKEN: (tokenId: string) => `refresh:${tokenId}`,
  TOKEN_BLACKLIST: (jti: string) => `blacklist:${jti}`,

  // Notification keys
  NOTIFICATION_PREFS: (userId: string) => `notifications:${userId}:prefs`,
  NOTIFICATION_UNREAD: (userId: string) => `notifications:${userId}:unread`,

  // Search and filter keys
  SEARCH_RESULTS: (orgId: string, queryHash: string) => `search:${orgId}:${queryHash}`,
  FILTER_OPTIONS: (orgId: string, filterType: string) => `filters:${orgId}:${filterType}`,
} as const;

// =============================================================================
// CACHE KEY INVALIDATION PATTERNS
// =============================================================================

/**
 * Invalidation patterns for bulk cache clearing
 * Uses Redis glob patterns for SCAN operations
 */
export const CACHE_INVALIDATION_PATTERNS = {
  /** All keys for an organization */
  ORG_ALL: (orgId: string) => `org:${orgId}:*`,
  /** All user-related keys */
  USER_ALL: (userId: string) => `user:${userId}:*`,
  /** All task-related keys */
  TASK_ALL: (taskId: string) => `task:${taskId}:*`,
  /** All recording-related keys */
  RECORDING_ALL: (recordingId: string) => `recording:${recordingId}:*`,
  /** All dashboard keys for an org */
  DASHBOARD_ALL: (orgId: string) => `dashboard:${orgId}:*`,
  /** All analytics keys for an org */
  ANALYTICS_ALL: (orgId: string) => `analytics:${orgId}:*`,
  /** All rate limit keys for an identifier */
  RATE_LIMIT_ALL: (identifier: string) => `ratelimit:${identifier}:*`,
  /** All notification keys for a user */
  NOTIFICATIONS_ALL: (userId: string) => `notifications:${userId}:*`,
  /** All search results for an org */
  SEARCH_ALL: (orgId: string) => `search:${orgId}:*`,
  /** All pricing-related keys */
  PRICING_ALL: () => 'pricing:*',
  /** All subscription-related keys */
  SUBSCRIPTION_ALL: () => 'subscription:*',
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a cache key from parts with proper namespace separation
 *
 * @param parts - Key parts to join with colons
 * @returns Formatted cache key
 *
 * @example
 * generateKey('org', orgId, 'settings') // => 'org:abc123:settings'
 * generateKey('user', userId, 'permissions') // => 'user:xyz789:permissions'
 */
export function generateKey(...parts: (string | number)[]): string {
  return parts.map(String).join(':');
}

/**
 * Generate a hash for complex query objects (useful for search result caching)
 *
 * @param obj - Object to hash
 * @returns Short hash string suitable for cache keys
 */
export function generateQueryHash(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// =============================================================================
// INTERNAL CONSTANTS
// =============================================================================

/**
 * Maximum keys to delete in a single batch to avoid blocking
 */
const DELETE_BATCH_SIZE = 100;

/**
 * Default scan count per iteration
 */
const SCAN_COUNT = 100;

// =============================================================================
// CACHE SERVICE CLASS
// =============================================================================

class CacheService {
  private circuitOpen = false;
  private circuitOpenTime = 0;
  private readonly circuitResetMs = 30000; // 30 seconds

  /**
   * Check if circuit breaker allows operations
   */
  private isCircuitClosed(): boolean {
    if (!this.circuitOpen) {
      return true;
    }

    // Check if enough time has passed to try again
    if (Date.now() - this.circuitOpenTime > this.circuitResetMs) {
      this.circuitOpen = false;
      logger.info('Cache circuit breaker reset, attempting reconnection');
      return true;
    }

    return false;
  }

  /**
   * Open the circuit breaker after repeated failures
   */
  private openCircuit(): void {
    if (!this.circuitOpen) {
      this.circuitOpen = true;
      this.circuitOpenTime = Date.now();
      logger.warn('Cache circuit breaker opened due to Redis failures');
    }
  }

  // ===========================================================================
  // CORE CRUD OPERATIONS
  // ===========================================================================

  /**
   * Set a cache key with TTL (Time-To-Live)
   * @param key - Cache key
   * @param value - Value to cache (will be JSON stringified)
   * @param ttlSeconds - Time to live in seconds (default: 300s = 5 minutes)
   */
  async set<T>(key: string, value: T, ttlSeconds: number = CACHE_TTLS.MEDIUM): Promise<void> {
    if (!this.isCircuitClosed()) {
      return;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        logger.debug(`Cache miss (Redis unavailable): ${key}`);
        return;
      }

      const serialized = JSON.stringify(value);

      if (ttlSeconds > 0) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }

      logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      this.openCircuit();
    }
  }

  /**
   * Set multiple cache keys at once (more efficient than individual sets)
   * @param entries - Array of { key, value, ttlSeconds } objects
   */
  async mset<T>(
    entries: Array<{ key: string; value: T; ttlSeconds?: number }>
  ): Promise<void> {
    if (!this.isCircuitClosed() || entries.length === 0) {
      return;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }

      // Use pipeline for batch operations
      const pipeline = redis.pipeline();

      for (const entry of entries) {
        const serialized = JSON.stringify(entry.value);
        const ttl = entry.ttlSeconds ?? CACHE_TTLS.MEDIUM;

        if (ttl > 0) {
          pipeline.setex(entry.key, ttl, serialized);
        } else {
          pipeline.set(entry.key, serialized);
        }
      }

      await pipeline.exec();
      logger.debug(`Cache mset: ${entries.length} keys`);
    } catch (error) {
      logger.error('Cache mset error:', error);
      this.openCircuit();
    }
  }

  /**
   * Get a cached value
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isCircuitClosed()) {
      return null;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        logger.debug(`Cache miss (Redis unavailable): ${key}`);
        return null;
      }

      const value = await redis.get(key);

      if (value === null) {
        logger.debug(`Cache miss: ${key}`);
        return null;
      }

      logger.debug(`Cache hit: ${key}`);
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      this.openCircuit();
      return null;
    }
  }

  /**
   * Get multiple cached values at once
   * @param keys - Array of cache keys
   * @returns Map of key to value (missing keys are not included)
   */
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    if (!this.isCircuitClosed() || keys.length === 0) {
      return result;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return result;
      }

      const values = await redis.mget(...keys);

      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        const key = keys[i];
        if (value !== null && value !== undefined && key !== undefined) {
          try {
            result.set(key, JSON.parse(value) as T);
          } catch {
            // Skip invalid JSON
          }
        }
      }

      logger.debug(`Cache mget: ${result.size}/${keys.length} hits`);
      return result;
    } catch (error) {
      logger.error('Cache mget error:', error);
      this.openCircuit();
      return result;
    }
  }

  /**
   * Delete a cache key
   * @param key - Cache key
   */
  async delete(key: string): Promise<void> {
    if (!this.isCircuitClosed()) {
      return;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }

      await redis.del(key);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      this.openCircuit();
    }
  }

  /**
   * Delete multiple cache keys with a pattern
   * PERFORMANCE FIX: Uses SCAN instead of KEYS to avoid blocking Redis
   *
   * @param pattern - Redis glob pattern (e.g., "dashboard:*")
   * @returns Number of keys deleted
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isCircuitClosed()) {
      return 0;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return 0;
      }

      let totalDeleted = 0;
      let cursor = '0';

      // Use SCAN to iterate through keys without blocking Redis
      do {
        // SCAN returns [cursor, keys]
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          SCAN_COUNT
        );

        cursor = nextCursor;

        if (keys.length > 0) {
          // Delete in batches to avoid blocking
          for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
            const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
            const deleted = await redis.del(...batch);
            totalDeleted += deleted;
          }
        }
      } while (cursor !== '0');

      if (totalDeleted > 0) {
        logger.debug(`Cache deleted ${totalDeleted} keys matching pattern: ${pattern}`);
      }

      return totalDeleted;
    } catch (error) {
      logger.error(`Cache delete pattern error for pattern ${pattern}:`, error);
      this.openCircuit();
      return 0;
    }
  }

  /**
   * Delete multiple specific keys
   * @param keys - Array of keys to delete
   */
  async deleteMany(keys: string[]): Promise<number> {
    if (!this.isCircuitClosed() || keys.length === 0) {
      return 0;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return 0;
      }

      // Delete in batches
      let totalDeleted = 0;
      for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
        const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
        const deleted = await redis.del(...batch);
        totalDeleted += deleted;
      }

      logger.debug(`Cache deleted ${totalDeleted}/${keys.length} keys`);
      return totalDeleted;
    } catch (error) {
      logger.error('Cache deleteMany error:', error);
      this.openCircuit();
      return 0;
    }
  }

  // ===========================================================================
  // CACHE-ASIDE PATTERN HELPERS
  // ===========================================================================

  /**
   * Cache-aside pattern - Get from cache or compute and store
   *
   * @param key - Cache key
   * @param fetchFn - Async function to compute the value if not cached
   * @param ttlSeconds - Time to live in seconds
   * @returns Cached or computed value
   *
   * @example
   * const settings = await cacheService.cacheAside(
   *   CACHE_KEYS.ORG_SETTINGS(orgId),
   *   CACHE_TTLS.MEDIUM,
   *   () => db.getOrgSettings(orgId)
   * );
   */
  async cacheAside<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute if not cached
    logger.debug(`Cache miss, computing: ${key}`);

    try {
      const value = await fetchFn();

      // Store in cache (don't await - fire and forget)
      this.set(key, value, ttlSeconds).catch(err => {
        logger.error(`Failed to cache computed value for ${key}:`, err);
      });

      return value;
    } catch (error) {
      logger.error(`Cache cacheAside compute error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Alias for cacheAside - legacy method name for backward compatibility
   */
  async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    ttlSeconds: number = CACHE_TTLS.MEDIUM
  ): Promise<T> {
    return this.cacheAside(key, ttlSeconds, compute);
  }

  /**
   * Batch cache-aside pattern - Get multiple values from cache or compute missing ones
   *
   * @param keys - Array of cache keys
   * @param ttlSeconds - Time to live in seconds
   * @param fetchFn - Function to fetch values for keys not in cache
   * @returns Map of key to value
   *
   * @example
   * const recordings = await cacheService.cacheAsideBatch(
   *   recordingIds.map(id => CACHE_KEYS.RECORDING(id)),
   *   CACHE_TTLS.MEDIUM,
   *   async (missingKeys) => {
   *     const ids = missingKeys.map(k => k.split(':')[1]);
   *     const records = await db.getRecordings(ids);
   *     return new Map(records.map(r => [CACHE_KEYS.RECORDING(r.id), r]));
   *   }
   * );
   */
  async cacheAsideBatch<T>(
    keys: string[],
    ttlSeconds: number,
    fetchFn: (missingKeys: string[]) => Promise<Map<string, T>>
  ): Promise<Map<string, T>> {
    if (keys.length === 0) {
      return new Map();
    }

    // Try to get all from cache first
    const cached = await this.mget<T>(keys);

    // Find missing keys
    const missingKeys = keys.filter(k => !cached.has(k));

    if (missingKeys.length === 0) {
      return cached;
    }

    // Fetch missing values
    logger.debug(`Cache batch miss: ${missingKeys.length}/${keys.length} keys`);

    try {
      const fetched = await fetchFn(missingKeys);

      // Store fetched values in cache (fire and forget)
      if (fetched.size > 0) {
        const entries = Array.from(fetched.entries()).map(([key, value]) => ({
          key,
          value,
          ttlSeconds,
        }));
        this.mset(entries).catch(err => {
          logger.error('Failed to cache batch computed values:', err);
        });
      }

      // Merge cached and fetched values
      for (const [key, value] of fetched) {
        cached.set(key, value);
      }

      return cached;
    } catch (error) {
      logger.error('Cache cacheAsideBatch compute error:', error);
      // Return what we have from cache
      return cached;
    }
  }

  // ===========================================================================
  // INVALIDATION HELPERS
  // ===========================================================================

  /**
   * Invalidate cache keys matching a pattern
   *
   * @param pattern - Redis glob pattern
   * @returns Number of keys invalidated
   *
   * @example
   * // Invalidate all org-related cache
   * await cacheService.invalidatePattern(CACHE_INVALIDATION_PATTERNS.ORG_ALL(orgId));
   */
  async invalidatePattern(pattern: string): Promise<number> {
    return this.deletePattern(pattern);
  }

  /**
   * Invalidate multiple related cache keys at once
   *
   * @param keys - Array of specific keys to invalidate
   * @param patterns - Array of patterns to invalidate
   *
   * @example
   * await cacheService.invalidateRelated(
   *   [CACHE_KEYS.ORG_SETTINGS(orgId)],
   *   [CACHE_INVALIDATION_PATTERNS.DASHBOARD_ALL(orgId)]
   * );
   */
  async invalidateRelated(keys: string[], patterns: string[] = []): Promise<void> {
    const deletePromises: Promise<number | void>[] = [];

    // Delete specific keys
    if (keys.length > 0) {
      deletePromises.push(this.deleteMany(keys));
    }

    // Delete pattern-matched keys
    for (const pattern of patterns) {
      deletePromises.push(this.deletePattern(pattern));
    }

    await Promise.all(deletePromises);
  }

  /**
   * Invalidate all cache related to an organization
   *
   * @param orgId - Organization ID
   */
  async invalidateOrganization(orgId: string): Promise<void> {
    await Promise.all([
      this.deletePattern(CACHE_INVALIDATION_PATTERNS.ORG_ALL(orgId)),
      this.deletePattern(CACHE_INVALIDATION_PATTERNS.DASHBOARD_ALL(orgId)),
      this.deletePattern(CACHE_INVALIDATION_PATTERNS.ANALYTICS_ALL(orgId)),
      this.deletePattern(CACHE_INVALIDATION_PATTERNS.SEARCH_ALL(orgId)),
    ]);
  }

  /**
   * Invalidate all cache related to a user
   *
   * @param userId - User ID
   */
  async invalidateUser(userId: string): Promise<void> {
    await Promise.all([
      this.deletePattern(CACHE_INVALIDATION_PATTERNS.USER_ALL(userId)),
      this.deletePattern(CACHE_INVALIDATION_PATTERNS.NOTIFICATIONS_ALL(userId)),
    ]);
  }

  // ===========================================================================
  // COUNTER AND UTILITY OPERATIONS
  // ===========================================================================

  /**
   * Increment a counter (useful for rate limiting)
   * @param key - Cache key
   * @param ttlSeconds - TTL for new keys
   * @returns New counter value
   */
  async increment(key: string, ttlSeconds: number = CACHE_TTLS.SHORT): Promise<number> {
    if (!this.isCircuitClosed()) {
      return 0;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return 0;
      }

      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds);

      const results = await pipeline.exec();
      const count = (results?.[0]?.[1] as number) || 0;

      return count;
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      this.openCircuit();
      return 0;
    }
  }

  /**
   * Decrement a counter
   * @param key - Cache key
   * @returns New counter value
   */
  async decrement(key: string): Promise<number> {
    if (!this.isCircuitClosed()) {
      return 0;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return 0;
      }

      const result = await redis.decr(key);
      return result;
    } catch (error) {
      logger.error(`Cache decrement error for key ${key}:`, error);
      this.openCircuit();
      return 0;
    }
  }

  /**
   * Check if a key exists
   * @param key - Cache key
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isCircuitClosed()) {
      return false;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return false;
      }

      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      this.openCircuit();
      return false;
    }
  }

  /**
   * Set TTL on existing key
   * @param key - Cache key
   * @param ttlSeconds - New TTL
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isCircuitClosed()) {
      return false;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return false;
      }

      const result = await redis.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      this.openCircuit();
      return false;
    }
  }

  /**
   * Get the remaining TTL of a key
   * @param key - Cache key
   * @returns TTL in seconds, -2 if key doesn't exist, -1 if no TTL
   */
  async ttl(key: string): Promise<number> {
    if (!this.isCircuitClosed()) {
      return -2;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return -2;
      }

      return await redis.ttl(key);
    } catch (error) {
      logger.error(`Cache ttl error for key ${key}:`, error);
      this.openCircuit();
      return -2;
    }
  }

  // ===========================================================================
  // ADMINISTRATIVE OPERATIONS
  // ===========================================================================

  /**
   * Clear all cache (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (!this.isCircuitClosed()) {
      return;
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }

      await redis.flushdb();
      logger.info('Cache flushed (all keys deleted)');
    } catch (error) {
      logger.error('Cache flush error:', error);
      this.openCircuit();
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    keys: number;
    memory: string;
    circuitOpen: boolean;
    hitRate?: string;
  } | null> {
    if (!this.isCircuitClosed()) {
      return { keys: 0, memory: 'N/A (circuit open)', circuitOpen: true };
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return null;
      }

      const [info, keys, statsInfo] = await Promise.all([
        redis.info('memory'),
        redis.dbsize(),
        redis.info('stats'),
      ]);

      const memoryLine = info.split('\n').find(line => line.startsWith('used_memory_human'));
      const memory = memoryLine ? (memoryLine.split(':')[1]?.trim() ?? 'N/A') : 'N/A';

      // Calculate hit rate from stats
      const hitsLine = statsInfo.split('\n').find(line => line.startsWith('keyspace_hits'));
      const missesLine = statsInfo.split('\n').find(line => line.startsWith('keyspace_misses'));
      const hits = parseInt(hitsLine?.split(':')[1] ?? '0', 10);
      const misses = parseInt(missesLine?.split(':')[1] ?? '0', 10);
      const total = hits + misses;
      const hitRate = total > 0 ? `${((hits / total) * 100).toFixed(2)}%` : 'N/A';

      return {
        keys,
        memory,
        circuitOpen: this.circuitOpen,
        hitRate,
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      this.openCircuit();
      return null;
    }
  }

  /**
   * Health check - returns true if Redis is available and responding
   */
  async isHealthy(): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return false;
      }

      const result = await redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitStatus(): { isOpen: boolean; openedAt: number | null; resetsIn: number | null } {
    if (!this.circuitOpen) {
      return { isOpen: false, openedAt: null, resetsIn: null };
    }

    const elapsed = Date.now() - this.circuitOpenTime;
    const resetsIn = Math.max(0, this.circuitResetMs - elapsed);

    return {
      isOpen: true,
      openedAt: this.circuitOpenTime,
      resetsIn,
    };
  }
}

// =============================================================================
// STANDALONE HELPER FUNCTIONS
// =============================================================================

/**
 * Standalone cache-aside function for use without the service instance
 *
 * @param key - Cache key
 * @param ttl - TTL in seconds
 * @param fetchFn - Function to fetch data if not cached
 * @returns Cached or fetched value
 */
export async function cacheAside<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  return cacheService.cacheAside(key, ttl, fetchFn);
}

/**
 * Standalone pattern invalidation function
 *
 * @param pattern - Redis glob pattern
 * @returns Number of keys invalidated
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  return cacheService.invalidatePattern(pattern);
}

// =============================================================================
// EXPORTS
// =============================================================================

export const cacheService = new CacheService();
