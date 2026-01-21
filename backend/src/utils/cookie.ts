import { Response, Request } from 'express';

/**
 * Cookie utility for secure HttpOnly refresh token handling
 *
 * Security benefits:
 * - HttpOnly: Prevents XSS attacks from accessing the refresh token
 * - Secure: Only sent over HTTPS in production
 * - SameSite=None: Required for cross-subdomain cookies (cogveri.com ↔ api.cogveri.com)
 * - Path restricted to auth endpoints only
 * - Domain set to .cogveri.com for cross-subdomain sharing
 */

const REFRESH_TOKEN_COOKIE_NAME = 'cogveri_refresh_token';

// Cookie configuration based on environment
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Get cookie options based on environment
 *
 * For cross-subdomain setups (frontend on cogveri.com, API on api.cogveri.com):
 * - SameSite must be 'none' (with Secure=true) to allow cross-origin requests
 * - Domain must be '.cogveri.com' to share cookies across subdomains
 */
function getCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
  domain?: string;
} {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  if (isProduction) {
    // Production: cross-subdomain cookie configuration
    // SameSite=None requires Secure=true
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api/auth',
      maxAge,
      // Use COOKIE_DOMAIN env var or default to .cogveri.com for subdomain sharing
      domain: process.env.COOKIE_DOMAIN || '.cogveri.com',
    };
  }

  // Development: simpler configuration
  return {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge,
  };
}

/**
 * Set the refresh token as an HttpOnly cookie
 *
 * @param res - Express response object
 * @param token - Refresh token to store
 */
export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, getCookieOptions());
}

/**
 * Clear the refresh token cookie on logout
 *
 * @param res - Express response object
 */
export function clearRefreshTokenCookie(res: Response): void {
  if (isProduction) {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api/auth',
      domain: process.env.COOKIE_DOMAIN || '.cogveri.com',
    });
  } else {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
    });
  }
}

/**
 * Get the refresh token from the cookie
 *
 * @param req - Express request object
 * @returns The refresh token or null if not present
 */
export function getRefreshTokenFromCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[REFRESH_TOKEN_COOKIE_NAME] ?? null;
}

/**
 * Check if a refresh token cookie exists
 *
 * @param req - Express request object
 * @returns True if the cookie exists
 */
export function hasRefreshTokenCookie(req: Request): boolean {
  return !!req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
}
