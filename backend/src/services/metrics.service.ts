import { db } from '../config/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import NodeCache from 'node-cache';

/**
 * API Metrics Service
 * Tracks API usage, rate limiting, and feature-specific metrics
 */

export interface ApiMetricData {
  organizationId?: string;
  userId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
  ipAddress?: string;
  userAgent?: string;
  error?: boolean;
  errorMessage?: string;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

export interface UsageSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalDataTransferred: number;
}

class MetricsService {
  private cache = new NodeCache({ stdTTL: 300 }); // 5-minute default TTL

  /**
   * Record API metric
   */
  async recordApiMetric(data: ApiMetricData): Promise<void> {
    try {
      await db('api_metrics').insert({
        organization_id: data.organizationId || null,
        user_id: data.userId || null,
        endpoint: data.endpoint,
        method: data.method,
        status_code: data.statusCode,
        response_time_ms: data.responseTimeMs,
        request_size_bytes: data.requestSizeBytes || 0,
        response_size_bytes: data.responseSizeBytes || 0,
        ip_address: data.ipAddress || null,
        user_agent: data.userAgent || null,
        error: data.error || false,
        error_message: data.errorMessage || null,
        created_at: new Date(),
      });

      // Track feature usage only if organization context exists
      if (data.organizationId) {
        await this.trackFeatureUsage(data.organizationId, data.userId, data.endpoint);
      }
    } catch (error) {
      logger.error('Error recording API metric:', error);
      // Non-blocking error - don't fail the API request
    }
  }

  /**
   * Track feature-specific usage
   */
  private async trackFeatureUsage(
    organizationId: string,
    userId: string | undefined,
    endpoint: string
  ): Promise<void> {
    try {
      const featureMap: Record<string, string> = {
        '/recordings': 'recordings',
        '/tasks': 'tasks',
        '/reviews': 'reviews',
        '/organizations': 'organizations',
        '/users': 'users',
        '/dashboard': 'dashboard',
        '/storage': 'storage',
        '/retention': 'retention',
      };

      let featureName = 'api_calls';
      for (const [path, feature] of Object.entries(featureMap)) {
        if (endpoint.includes(path)) {
          featureName = feature;
          break;
        }
      }

      const today = new Date().toISOString().split('T')[0];

      // Upsert feature usage
      const existing = await db('feature_usage')
        .where('organization_id', organizationId)
        .andWhere('user_id', userId || null)
        .andWhere('feature_name', featureName)
        .andWhere('date', today)
        .first();

      if (existing) {
        await db('feature_usage')
          .where('id', existing.id)
          .increment('usage_count', 1)
          .update({ updated_at: new Date() });
      } else {
        await db('feature_usage').insert({
          organization_id: organizationId,
          user_id: userId || null,
          feature_name: featureName,
          usage_count: 1,
          date: today,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    } catch (error) {
      logger.error('Error tracking feature usage:', error);
      // Non-blocking error
    }
  }

  /**
   * Get API usage summary for organization
   */
  async getUsageSummary(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageSummary> {
    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
      const end = endDate || new Date();

      const metrics = await db('api_metrics')
        .where('organization_id', organizationId)
        .andWhere('created_at', '>=', start)
        .andWhere('created_at', '<=', end)
        .select('*');

      if (metrics.length === 0) {
        return {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          totalDataTransferred: 0,
        };
      }

      const successful = metrics.filter((m: any) => m.status_code >= 200 && m.status_code < 300);
      const failed = metrics.filter((m: any) => m.status_code >= 400);
      const avgTime =
        metrics.reduce((sum: number, m: any) => sum + m.response_time_ms, 0) / metrics.length;
      const totalData = metrics.reduce(
        (sum: number, m: any) => sum + (m.response_size_bytes || 0),
        0
      );

      return {
        totalRequests: metrics.length,
        successfulRequests: successful.length,
        failedRequests: failed.length,
        averageResponseTime: Math.round(avgTime),
        totalDataTransferred: totalData,
      };
    } catch (error) {
      logger.error('Error getting usage summary:', error);
      throw error;
    }
  }

  /**
   * Get usage by endpoint
   */
  async getUsageByEndpoint(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<
    Array<{
      endpoint: string;
      method: string;
      count: number;
      avgResponseTime: number;
      errorCount: number;
    }>
  > {
    try {
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days
      const end = endDate || new Date();

      const results = await db('api_metrics')
        .where('organization_id', organizationId)
        .andWhere('created_at', '>=', start)
        .andWhere('created_at', '<=', end)
        .groupBy('endpoint', 'method')
        .select(
          'endpoint',
          'method',
          db.raw('count(*) as count'),
          db.raw('round(avg(response_time_ms)::numeric) as avg_response_time'),
          db.raw('count(case when error = true then 1 end) as error_count')
        )
        .orderBy('count', 'desc');

      return results.map((r: any) => ({
        endpoint: r.endpoint,
        method: r.method,
        count: parseInt(r.count, 10),
        avgResponseTime: parseInt(r.avg_response_time, 10),
        errorCount: parseInt(r.error_count, 10),
      }));
    } catch (error) {
      logger.error('Error getting usage by endpoint:', error);
      throw error;
    }
  }

  /**
   * Get usage by user
   */
  async getUsageByUser(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 10
  ): Promise<
    Array<{
      userId: string;
      requestCount: number;
      errorCount: number;
      avgResponseTime: number;
      totalDataTransferred: number;
    }>
  > {
    try {
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate || new Date();

      const results = await db('api_metrics')
        .where('organization_id', organizationId)
        .where('user_id', '!=', null)
        .andWhere('created_at', '>=', start)
        .andWhere('created_at', '<=', end)
        .groupBy('user_id')
        .select(
          'user_id',
          db.raw('count(*) as request_count'),
          db.raw('count(case when error = true then 1 end) as error_count'),
          db.raw('round(avg(response_time_ms)::numeric) as avg_response_time'),
          db.raw('sum(response_size_bytes) as total_data_transferred')
        )
        .orderBy('request_count', 'desc')
        .limit(limit);

      return results.map((r: any) => ({
        userId: r.user_id,
        requestCount: parseInt(r.request_count, 10),
        errorCount: parseInt(r.error_count, 10),
        avgResponseTime: parseInt(r.avg_response_time, 10),
        totalDataTransferred: parseInt(r.total_data_transferred || 0, 10),
      }));
    } catch (error) {
      logger.error('Error getting usage by user:', error);
      throw error;
    }
  }

  /**
   * Calculate and store aggregated usage summary
   */
  async calculateUsageSummary(
    organizationId: string,
    period: 'hourly' | 'daily' | 'monthly' = 'daily'
  ): Promise<void> {
    try {
      const now = new Date();
      let periodStart: Date;
      let periodEnd: Date;

      switch (period) {
        case 'hourly':
          periodStart = new Date(now.getTime() - 60 * 60 * 1000);
          periodStart.setMinutes(0, 0, 0);
          periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
          break;
        case 'daily':
          periodStart = new Date(now);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
      }

      // Get metrics for the period
      const metrics = await db('api_metrics')
        .where('organization_id', organizationId)
        .andWhere('created_at', '>=', periodStart)
        .andWhere('created_at', '<', periodEnd)
        .select('*');

      if (metrics.length === 0) {
        return; // No metrics to summarize
      }

      // Calculate aggregations
      const successful = metrics.filter((m: any) => m.status_code >= 200 && m.status_code < 300);
      const failed = metrics.filter((m: any) => m.status_code >= 400);
      const avgTime = Math.round(
        metrics.reduce((sum: number, m: any) => sum + m.response_time_ms, 0) / metrics.length
      );
      const slowest = Math.max(...metrics.map((m: any) => m.response_time_ms));
      const fastest = Math.min(...metrics.map((m: any) => m.response_time_ms));

      // Build endpoint breakdown
      const endpointMap: Record<string, { count: number; avgTime: number }> = {};
      for (const metric of metrics) {
        const key = `${metric.method} ${metric.endpoint}`;
        if (!endpointMap[key]) {
          endpointMap[key] = { count: 0, avgTime: 0 };
        }
        endpointMap[key].count++;
      }
      // Calculate average time per endpoint
      for (const endpoint of Object.keys(endpointMap)) {
        const endpointMetrics = metrics.filter(
          (m: any) => `${m.method} ${m.endpoint}` === endpoint
        );
        endpointMap[endpoint]!.avgTime = Math.round(
          endpointMetrics.reduce((sum: number, m: any) => sum + m.response_time_ms, 0) /
            endpointMetrics.length
        );
      }

      // Insert or update summary
      const existing = await db('api_usage_summary')
        .where('organization_id', organizationId)
        .whereNull('user_id')
        .andWhere('period', period)
        .andWhere('period_start', periodStart)
        .first();

      const summaryData = {
        organization_id: organizationId,
        user_id: null,
        period,
        period_start: periodStart,
        period_end: periodEnd,
        total_requests: metrics.length,
        successful_requests: successful.length,
        failed_requests: failed.length,
        total_request_bytes: metrics.reduce(
          (sum: number, m: any) => sum + (m.request_size_bytes || 0),
          0
        ),
        total_response_bytes: metrics.reduce(
          (sum: number, m: any) => sum + (m.response_size_bytes || 0),
          0
        ),
        average_response_time_ms: avgTime,
        slowest_response_time_ms: slowest,
        fastest_response_time_ms: fastest,
        endpoint_breakdown: JSON.stringify(endpointMap),
        updated_at: new Date(),
      };

      if (existing) {
        await db('api_usage_summary').where('id', existing.id).update(summaryData);
      } else {
        await db('api_usage_summary').insert({
          ...summaryData,
          calculated_at: new Date(),
        });
      }

      logger.info(`Usage summary calculated for organization ${organizationId} (${period})`);
    } catch (error) {
      logger.error('Error calculating usage summary:', error);
      // Non-blocking error
    }
  }

  /**
   * Check if organization has exceeded rate limit
   */
  async checkRateLimit(
    organizationId: string,
    userId: string | undefined,
    _endpoint: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    rateLimitHeader: string;
  }> {
    try {
      // Get rate limit config for organization
      const config = await this.getRateLimitConfig(organizationId);
      if (!config) {
        // No config = no rate limiting
        return {
          allowed: true,
          remaining: config?.requests_per_minute || 60,
          resetAt: new Date(Date.now() + 60 * 1000),
          rateLimitHeader: '60',
        };
      }

      // Count requests in last minute
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentCount = await db('api_metrics')
        .where('organization_id', organizationId)
        .where(userId ? db.raw('user_id = ?', [userId]) : db.raw('1=1'))
        .andWhere('created_at', '>=', oneMinuteAgo)
        .count('* as count')
        .then((rows: any[]) => rows[0]?.count || 0);

      const limit = config.requests_per_minute;
      const allowed = recentCount < limit;
      const remaining = Math.max(0, limit - recentCount);
      const resetAt = new Date(oneMinuteAgo.getTime() + 60 * 1000);

      return {
        allowed,
        remaining,
        resetAt,
        rateLimitHeader: `${remaining}, reset=${Math.floor(resetAt.getTime() / 1000)}`,
      };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      // Fail open on error - don't block requests
      return {
        allowed: true,
        remaining: 60,
        resetAt: new Date(Date.now() + 60 * 1000),
        rateLimitHeader: '60',
      };
    }
  }

  /**
   * Record rate limit violation
   */
  async recordRateLimitViolation(
    organizationId: string,
    userId: string | undefined,
    endpoint: string,
    violationType: 'minute' | 'hour' | 'day' | 'burst',
    limitExceeded: number,
    currentCount: number,
    limit: number,
    ipAddress?: string
  ): Promise<void> {
    try {
      await db('rate_limit_violations').insert({
        organization_id: organizationId,
        user_id: userId || null,
        endpoint,
        violation_type: violationType,
        limit_exceeded: limitExceeded,
        current_count: currentCount,
        limit,
        ip_address: ipAddress || null,
        action_taken: limitExceeded <= 10 ? 'throttled' : 'blocked',
        created_at: new Date(),
      });

      logger.warn(
        `Rate limit violation: org=${organizationId}, user=${userId}, endpoint=${endpoint}, type=${violationType}`
      );
    } catch (error) {
      logger.error('Error recording rate limit violation:', error);
      // Non-blocking error
    }
  }

  /**
   * Get rate limit configuration for organization
   */
  private async getRateLimitConfig(organizationId: string): Promise<any> {
    try {
      // Check cache first
      const cacheKey = `ratelimit:${organizationId}`;
      const cached = this.cache.get<any>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get organization tier
      const org = await db('organizations').where('id', organizationId).first();
      if (!org) return null;

      // Get rate limit rules for tier
      const rules = await db('rate_limit_rules')
        .where('organization_id', organizationId)
        .andWhere('tier', org.subscription_tier)
        .andWhere('is_active', true)
        .first();

      // Cache the result for 5 minutes
      if (rules) {
        this.cache.set(cacheKey, rules);
      }

      return rules;
    } catch (error) {
      logger.error('Error getting rate limit config:', error);
      return null;
    }
  }

  /**
   * Invalidate rate limit config cache for an organization
   */
  invalidateRateLimitCache(organizationId: string): void {
    const cacheKey = `ratelimit:${organizationId}`;
    this.cache.del(cacheKey);
    logger.debug(`Rate limit cache invalidated for organization ${organizationId}`);
  }

  /**
   * Get organization with caching
   */
  async getOrganizationWithCache(organizationId: string): Promise<any> {
    try {
      const cacheKey = `org:${organizationId}`;
      const cached = this.cache.get<any>(cacheKey);
      if (cached) {
        return cached;
      }

      const org = await db('organizations').where('id', organizationId).first();
      if (org) {
        this.cache.set(cacheKey, org);
      }
      return org;
    } catch (error) {
      logger.error('Error getting organization with cache:', error);
      return null;
    }
  }

  /**
   * Get user with caching
   */
  async getUserWithCache(userId: string): Promise<any> {
    try {
      const cacheKey = `user:${userId}`;
      const cached = this.cache.get<any>(cacheKey);
      if (cached) {
        return cached;
      }

      const user = await db('users')
        .where('id', userId)
        .select('id', 'email', 'name', 'role', 'created_at')
        .first();
      if (user) {
        this.cache.set(cacheKey, user);
      }
      return user;
    } catch (error) {
      logger.error('Error getting user with cache:', error);
      return null;
    }
  }

  /**
   * Invalidate organization cache
   */
  invalidateOrganizationCache(organizationId: string): void {
    const cacheKey = `org:${organizationId}`;
    this.cache.del(cacheKey);
    logger.debug(`Organization cache invalidated for ${organizationId}`);
  }

  /**
   * Invalidate user cache
   */
  invalidateUserCache(userId: string): void {
    const cacheKey = `user:${userId}`;
    this.cache.del(cacheKey);
    logger.debug(`User cache invalidated for ${userId}`);
  }

  /**
   * Create API key for organization
   */
  async createApiKey(
    organizationId: string,
    userId: string,
    name: string,
    scopes?: string,
    expiresAt?: Date
  ): Promise<{
    id: string;
    keyPrefix: string;
    keyFull: string; // Only returned on creation
  }> {
    try {
      // Generate API key (32 random bytes, base64 encoded)
      const keyBytes = crypto.randomBytes(32);
      const keyFull = keyBytes.toString('base64');
      const keyPrefix = keyFull.substring(0, 20);
      const keyHash = crypto.createHash('sha256').update(keyFull).digest('hex');

      const [apiKey] = await db('api_keys')
        .insert({
          organization_id: organizationId,
          user_id: userId,
          name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          scopes: scopes || null,
          expires_at: expiresAt || null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`API key created: ${apiKey.id} for organization ${organizationId}`);

      return {
        id: apiKey.id,
        keyPrefix,
        keyFull, // Only returned on creation
      };
    } catch (error) {
      logger.error('Error creating API key:', error);
      throw error;
    }
  }

  /**
   * Verify API key
   */
  async verifyApiKey(keyValue: string): Promise<{
    organizationId: string;
    userId: string;
    scopes: string[];
  } | null> {
    try {
      const keyHash = crypto.createHash('sha256').update(keyValue).digest('hex');

      const apiKey = await db('api_keys')
        .where('key_hash', keyHash)
        .andWhere('is_active', true)
        .first();

      if (!apiKey) {
        return null;
      }

      // Check if expired
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return null;
      }

      // Update last used and usage count
      await db('api_keys')
        .where('id', apiKey.id)
        .update({
          last_used_at: new Date(),
          usage_count: db.raw('usage_count + 1'),
        });

      return {
        organizationId: apiKey.organization_id,
        userId: apiKey.user_id,
        scopes: apiKey.scopes ? apiKey.scopes.split(',').map((s: string) => s.trim()) : [],
      };
    } catch (error) {
      logger.error('Error verifying API key:', error);
      return null;
    }
  }

  /**
   * Get organization API keys
   */
  async getApiKeys(organizationId: string): Promise<
    Array<{
      id: string;
      name: string;
      keyPrefix: string;
      isActive: boolean;
      lastUsedAt: Date | null;
      usageCount: number;
      expiresAt: Date | null;
      createdAt: Date;
    }>
  > {
    try {
      const keys = await db('api_keys')
        .where('organization_id', organizationId)
        .select('*')
        .orderBy('created_at', 'desc');

      return keys.map((k: any) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.key_prefix,
        isActive: k.is_active,
        lastUsedAt: k.last_used_at,
        usageCount: k.usage_count,
        expiresAt: k.expires_at,
        createdAt: k.created_at,
      }));
    } catch (error) {
      logger.error('Error getting API keys:', error);
      throw error;
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(organizationId: string, keyId: string): Promise<void> {
    try {
      await db('api_keys').where('id', keyId).andWhere('organization_id', organizationId).update({
        is_active: false,
        updated_at: new Date(),
      });

      logger.info(`API key revoked: ${keyId}`);
    } catch (error) {
      logger.error('Error revoking API key:', error);
      throw error;
    }
  }

  /**
   * Get feature usage stats
   */
  async getFeatureUsageStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<
    Array<{
      featureName: string;
      totalUsage: number;
      uniqueUsers: number;
      avgUsagePerUser: number;
    }>
  > {
    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate || new Date();

      const startDateStr = start.toISOString().split('T')[0] ?? '';
      const endDateStr = end.toISOString().split('T')[0] ?? '';
      const results = await db('feature_usage')
        .where('organization_id', organizationId)
        .andWhere('date', '>=', startDateStr)
        .andWhere('date', '<=', endDateStr)
        .groupBy('feature_name')
        .select(
          'feature_name',
          db.raw('sum(usage_count) as total_usage'),
          db.raw('count(distinct user_id) as unique_users')
        );

      return results.map((r: any) => ({
        featureName: r.feature_name,
        totalUsage: parseInt(r.total_usage || 0, 10),
        uniqueUsers: parseInt(r.unique_users || 0, 10),
        avgUsagePerUser: Math.round(
          parseInt(r.total_usage || 0, 10) / parseInt(r.unique_users || 1, 10)
        ),
      }));
    } catch (error) {
      logger.error('Error getting feature usage stats:', error);
      throw error;
    }
  }
}

export default new MetricsService();
