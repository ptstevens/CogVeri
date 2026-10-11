import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { logger } from '../utils/logger';

// Create different rate limiters for different endpoints
// General limiter - generous for normal UI usage
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute (down from 15)
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200'), // 200 per minute (up from 100 per 15 min)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for authenticated users - they have tier-based limits
  skip: (req) => !!(req as any).user?.id,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`, {
      type: 'rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// Stricter rate limiter for auth endpoints (login, register)
// Relaxed in development for easier testing
// Increased from 5 to 10 to reduce false positives while still protecting against brute force
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 10, // 100 in dev, 10 in prod
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

// More lenient rate limiter for token refresh
// Refresh is called automatically by the frontend, so needs higher limits
// Increased from 30 to 50 to handle retry storms gracefully
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 50, // 50 in prod
  message: 'Too many refresh attempts, please try again later.',
  skipSuccessfulRequests: true, // Only count failures
});

/**
 * SECURITY: Baseline rate limiter for ALL authenticated users
 * This provides a safety net even if tier-based API limits are bypassed
 *
 * Uses user ID as key (not IP) to prevent shared IP issues and
 * ensure per-user limits are enforced
 */
export const authenticatedRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: parseInt(process.env.AUTHENTICATED_RATE_LIMIT || '500'), // 500 requests per minute baseline
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  // Only apply to authenticated users
  skip: (req: Request) => !(req as any).user?.id,
  // Use user ID as key, not IP address
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip;
    return `auth:${userId}`;
  },
  handler: (req, res) => {
    const userId = (req as any).user?.id;
    logger.warn(`Authenticated rate limit exceeded for user ${userId}`, {
      type: 'authenticated_rate_limit_exceeded',
      userId,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'You are making too many requests. Please slow down.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * SECURITY: IP-based rate limiter for authenticated users
 * Prevents compromised accounts from being weaponized for DDoS attacks
 * This is an additional security layer on top of per-user limits
 */
export const authenticatedIpRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 1000, // 1000 requests per minute per IP
  message: 'Too many requests from this IP, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  // Only apply to authenticated users
  skip: (req: Request) => !(req as any).user?.id,
  // Use IP address as key
  keyGenerator: (req: Request) => `auth-ip:${req.ip || 'unknown'}`,
  handler: (req, res) => {
    const userId = (req as any).user?.id;
    logger.warn(`Authenticated IP rate limit exceeded`, {
      type: 'authenticated_ip_rate_limit_exceeded',
      userId,
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP address. Please slow down.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// Rate limiter for file uploads
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: 'Upload limit exceeded, please try again later.',
});

/**
 * Strict rate limiter for public magic link endpoints
 * These are unauthenticated and vulnerable to brute-force token enumeration
 *
 * ★ Security: Aggressive limiting prevents:
 * - Token enumeration attacks
 * - Brute-force guessing of 64-char tokens
 * - DoS on public endpoints
 */
export const magicLinkRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: process.env.NODE_ENV === 'development' ? 60 : 10, // 10 requests/minute in prod
  message: 'Too many requests to this endpoint, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP + token path for more granular limiting
  keyGenerator: (req) => {
    const token = req.params.token || 'no-token';
    return `${req.ip}-${token.substring(0, 8)}`;
  },
  handler: (req, res) => {
    logger.warn(`Magic link rate limit exceeded`, {
      type: 'magic_link_rate_limit',
      ip: req.ip,
      path: req.path,
      tokenPrefix: req.params.token?.substring(0, 8),
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait before trying again.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Skip successful requests to allow legitimate users through
  skipSuccessfulRequests: false,
});

/**
 * Even stricter rate limiter for token validation specifically
 * Prevents timing attacks and enumeration
 */
export const tokenValidationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'development' ? 30 : 5, // 5 validation attempts per minute
  message: 'Too many validation attempts, please try again later.',
  standardHeaders: true,
  handler: (req, res) => {
    logger.warn(`Token validation rate limit exceeded`, {
      type: 'token_validation_rate_limit',
      ip: req.ip,
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many validation attempts. Please wait before trying again.',
    });
  },
});
