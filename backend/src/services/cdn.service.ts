/**
 * CDN Service
 * Manages CDN integration for video delivery.
 * Supports Cloudflare and other CDN providers.
 */

import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface SignedUrlOptions {
  expiresIn?: number; // seconds
  ipRestriction?: string;
  pathPrefix?: string;
}

export interface CacheInvalidationResult {
  success: boolean;
  purgedUrls: string[];
  errors?: string[];
}

interface CloudflareApiResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: Array<{ code: number; message: string }>;
  result?: unknown;
}

class CDNService {
  private enabled: boolean;
  private zoneId: string | undefined;
  private apiToken: string | undefined;
  private cdnDomain: string | undefined;
  private signingKey: string | undefined;

  constructor() {
    this.enabled = process.env.CDN_ENABLED === 'true';
    this.zoneId = process.env.CLOUDFLARE_ZONE_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.cdnDomain = process.env.CDN_DOMAIN;
    this.signingKey = process.env.CDN_SIGNING_KEY || process.env.JWT_SECRET;

    if (this.enabled) {
      logger.info('CDN service initialized', {
        domain: this.cdnDomain,
        hasZoneId: !!this.zoneId,
      });
    }
  }

  /**
   * Check if CDN is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get CDN domain
   */
  getDomain(): string | undefined {
    return this.cdnDomain;
  }

  /**
   * Generate a CDN URL for a resource
   */
  getCDNUrl(path: string): string {
    if (!this.enabled || !this.cdnDomain) {
      return path;
    }

    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `https://${this.cdnDomain}${normalizedPath}`;
  }

  /**
   * Generate a signed URL for secure content delivery
   * Uses HMAC-based token authentication
   */
  generateSignedUrl(
    path: string,
    options: SignedUrlOptions = {}
  ): string {
    const { expiresIn = 3600, ipRestriction } = options;

    if (!this.signingKey) {
      logger.warn('CDN signing key not configured, returning unsigned URL');
      return this.getCDNUrl(path);
    }

    const expiry = Math.floor(Date.now() / 1000) + expiresIn;

    // Build the token data
    const tokenData: Record<string, string | number> = {
      exp: expiry,
      path,
    };

    if (ipRestriction) {
      tokenData.ip = ipRestriction;
    }

    // Create HMAC signature
    const dataString = Object.entries(tokenData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const signature = crypto
      .createHmac('sha256', this.signingKey)
      .update(dataString)
      .digest('hex');

    // Build signed URL
    const baseUrl = this.getCDNUrl(path);
    const separator = baseUrl.includes('?') ? '&' : '?';

    return `${baseUrl}${separator}token=${signature}&exp=${expiry}`;
  }

  /**
   * Generate a signed URL for video streaming
   * Includes path prefix for all quality variants
   */
  generateVideoSignedUrl(
    recordingId: string,
    options: SignedUrlOptions = {}
  ): {
    baseUrl: string;
    signedUrl: string;
    expiresAt: Date;
  } {
    const path = `/recordings/${recordingId}`;
    const expiresIn = options.expiresIn || 24 * 60 * 60; // 24 hours default for video

    const signedUrl = this.generateSignedUrl(path, {
      ...options,
      expiresIn,
      pathPrefix: path, // Allow access to all files under this path
    });

    return {
      baseUrl: this.getCDNUrl(path),
      signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  /**
   * Invalidate CDN cache for specific URLs
   * Uses Cloudflare API for cache purging
   */
  async invalidateCache(urls: string[]): Promise<CacheInvalidationResult> {
    if (!this.enabled || !this.zoneId || !this.apiToken) {
      logger.warn('CDN cache invalidation not available');
      return {
        success: false,
        purgedUrls: [],
        errors: ['CDN not configured for cache invalidation'],
      };
    }

    try {
      // Cloudflare API endpoint for cache purge
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            files: urls,
          }),
        }
      );

      const result = await response.json() as CloudflareApiResponse;

      if (!response.ok) {
        throw new Error(result.errors?.[0]?.message || 'Cache purge failed');
      }

      logger.info('CDN cache invalidated', { purgedCount: urls.length });

      return {
        success: true,
        purgedUrls: urls,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('CDN cache invalidation failed', { error: errorMessage });

      return {
        success: false,
        purgedUrls: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Invalidate cache for a recording and all its variants
   */
  async invalidateRecordingCache(recordingId: string): Promise<CacheInvalidationResult> {
    if (!this.enabled || !this.cdnDomain) {
      return {
        success: false,
        purgedUrls: [],
        errors: ['CDN not enabled'],
      };
    }

    const basePath = `/recordings/${recordingId}`;
    const urls = [
      `https://${this.cdnDomain}${basePath}/*`, // All files under recording
    ];

    return this.invalidateCache(urls);
  }

  /**
   * Purge entire cache (use sparingly)
   */
  async purgeAllCache(): Promise<CacheInvalidationResult> {
    if (!this.enabled || !this.zoneId || !this.apiToken) {
      return {
        success: false,
        purgedUrls: [],
        errors: ['CDN not configured'],
      };
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            purge_everything: true,
          }),
        }
      );

      const result = await response.json() as CloudflareApiResponse;

      if (!response.ok) {
        throw new Error(result.errors?.[0]?.message || 'Cache purge failed');
      }

      logger.warn('CDN cache fully purged');

      return {
        success: true,
        purgedUrls: ['*'],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('CDN full cache purge failed', { error: errorMessage });

      return {
        success: false,
        purgedUrls: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Get cache status for a URL
   */
  async getCacheStatus(url: string): Promise<{
    cached: boolean;
    cacheControl?: string;
    age?: number;
  }> {
    try {
      const response = await fetch(url, { method: 'HEAD' });

      return {
        cached: response.headers.get('cf-cache-status') === 'HIT',
        cacheControl: response.headers.get('cache-control') || undefined,
        age: parseInt(response.headers.get('age') || '0', 10),
      };
    } catch {
      return { cached: false };
    }
  }

  /**
   * Verify a signed URL token
   */
  verifySignedUrl(token: string, expiry: number, path: string, ip?: string): boolean {
    if (!this.signingKey) {
      return false;
    }

    // Check expiry
    if (expiry < Math.floor(Date.now() / 1000)) {
      return false;
    }

    // Rebuild token data
    const tokenData: Record<string, string | number> = {
      exp: expiry,
      path,
    };

    if (ip) {
      tokenData.ip = ip;
    }

    const dataString = Object.entries(tokenData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const expectedSignature = crypto
      .createHmac('sha256', this.signingKey)
      .update(dataString)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedSignature)
    );
  }
}

export const cdnService = new CDNService();
export default cdnService;
