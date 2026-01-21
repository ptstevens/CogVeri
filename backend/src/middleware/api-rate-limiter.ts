import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';

/**
 * API Rate Limiter Middleware
 * Enforces per-user API rate limits for UI usage.
 *
 * Note: All current API calls are from the frontend UI.
 * Future direct API access for enterprise will have separate limits.
 */

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
}

// Single rate limit config for all authenticated users
// UI usage patterns are similar regardless of subscription tier
// A single page load makes 5-10 API calls, so limits must accommodate normal usage
const USER_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 200,  // ~20 page loads per minute
  requestsPerHour: 3000,   // 2+ hours of active usage
  requestsPerDay: 20000,   // Full workday of heavy usage
};

// Conservative fallback for database errors
const FALLBACK_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 50,
  requestsPerHour: 500,
  requestsPerDay: 5000,
};

/**
 * Check if user is within rate limits
 */
async function checkRateLimit(
  userId: string,
  window: 'minute' | 'hour' | 'day'
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  resetAt: Date;
}> {
  try {
    const config = USER_RATE_LIMIT;

    // Calculate time window
    const now = new Date();
    let windowStart: Date;
    let resetAt: Date;

    switch (window) {
      case 'minute':
        windowStart = new Date(now.getTime() - 60 * 1000);
        resetAt = new Date(now.getTime() + 60 * 1000);
        break;
      case 'hour':
        windowStart = new Date(now.getTime() - 60 * 60 * 1000);
        resetAt = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'day':
        windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        resetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
    }

    // Count API calls for this user within the window
    const result = await db('api_metrics')
      .where('user_id', userId)
      .where('created_at', '>=', windowStart)
      .count('id as count')
      .first();

    const currentCount = parseInt(result?.count?.toString() || '0');
    const limitKey = `requestsPer${window.charAt(0).toUpperCase() + window.slice(1)}` as keyof RateLimitConfig;
    const limitValue = config[limitKey];

    return {
      allowed: currentCount < limitValue,
      current: currentCount,
      limit: limitValue,
      resetAt,
    };
  } catch (error) {
    logger.error(`Error checking rate limit for window ${window}:`, error);
    // On database error, use fallback limits but allow request
    const fallbackLimitKey = `requestsPer${window.charAt(0).toUpperCase() + window.slice(1)}` as keyof RateLimitConfig;
    const fallbackLimit = FALLBACK_RATE_LIMIT[fallbackLimitKey];

    return {
      allowed: true,
      current: 0,
      limit: fallbackLimit,
      resetAt: new Date(Date.now() + 60000),
    };
  }
}

/**
 * Log API call to metrics
 */
async function logApiCall(
  organizationId: string,
  userId: string,
  method: string,
  path: string,
  statusCode: number,
  responseTimeMs: number = 0
): Promise<void> {
  try {
    await db('api_metrics').insert({
      organization_id: organizationId,
      user_id: userId,
      method,
      endpoint: `${method} ${path}`,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      error: statusCode >= 400,
      created_at: new Date(),
    });
  } catch (error) {
    logger.error('Error logging API call:', error);
    // Don't throw - logging failure shouldn't break the request
  }
}

/**
 * API Rate Limiting Middleware
 * Enforces per-user rate limits on API calls
 */
export const apiRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.user?.org_id;
    const userId = req.user?.id;

    if (!userId) {
      // Skip rate limiting for unauthenticated requests
      return next();
    }

    // Check rate limit for the minute (strictest limit)
    const minuteLimit = await checkRateLimit(userId, 'minute');

    // Add standard rate limit headers
    res.setHeader('RateLimit-Limit', minuteLimit.limit.toString());
    res.setHeader('RateLimit-Remaining', Math.max(0, minuteLimit.limit - minuteLimit.current).toString());
    res.setHeader('RateLimit-Reset', Math.ceil(minuteLimit.resetAt.getTime() / 1000).toString());

    if (!minuteLimit.allowed) {
      logger.warn(
        `Rate limit exceeded for user ${userId}: ${minuteLimit.current}/${minuteLimit.limit} requests per minute`
      );

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API requests. Please try again later.',
        retryAfter: Math.ceil(
          (minuteLimit.resetAt.getTime() - Date.now()) / 1000
        ),
        resetAt: minuteLimit.resetAt,
      });
    }

    // Store original res.json to intercept response
    const originalJson = res.json;

    res.json = function (data: any) {
      // Log the API call after response
      if (organizationId) {
        logApiCall(
          organizationId,
          userId,
          req.method,
          req.path,
          res.statusCode
        ).catch((error) => {
          logger.error('Failed to log API call:', error);
        });
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    // Attach rate limit info to request
    (req as any).rateLimit = minuteLimit;

    next();
  } catch (error: any) {
    logger.error('Error in API rate limiter:', error);
    // On error, add warning header but allow request with degraded mode
    res.setHeader('X-Rate-Limit-Degraded', 'true');
    next();
  }
};

/**
 * Middleware to check if user has reached hourly quota
 * Less strict than minute limiter, used for warnings
 */
export const checkHourlyQuota = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next();
    }

    const hourlyLimit = await checkRateLimit(userId, 'hour');

    if (hourlyLimit.current > hourlyLimit.limit * 0.8) {
      res.setHeader(
        'X-Rate-Limit-Warning',
        `Approaching hourly limit: ${hourlyLimit.current}/${hourlyLimit.limit}`
      );
    }

    next();
  } catch (error) {
    logger.error('Error checking hourly quota:', error);
    next();
  }
};

/**
 * Get current rate limit status for a user
 */
export async function getRateLimitStatus(userId: string) {
  try {
    const minute = await checkRateLimit(userId, 'minute');
    const hour = await checkRateLimit(userId, 'hour');
    const day = await checkRateLimit(userId, 'day');

    return {
      userId,
      limits: {
        perMinute: {
          current: minute.current,
          limit: minute.limit,
          percentageUsed: Math.round((minute.current / minute.limit) * 100),
          resetAt: minute.resetAt,
        },
        perHour: {
          current: hour.current,
          limit: hour.limit,
          percentageUsed: Math.round((hour.current / hour.limit) * 100),
          resetAt: hour.resetAt,
        },
        perDay: {
          current: day.current,
          limit: day.limit,
          percentageUsed: Math.round((day.current / day.limit) * 100),
          resetAt: day.resetAt,
        },
      },
      config: USER_RATE_LIMIT,
    };
  } catch (error) {
    logger.error('Error getting rate limit status:', error);
    throw error;
  }
}
