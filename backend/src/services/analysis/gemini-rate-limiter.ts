/**
 * Gemini API Rate Limiter
 *
 * Tracks token usage and enforces rate limits to prevent exceeding Google's API quotas.
 * Uses a sliding window approach to track tokens per minute.
 *
 * Gemini API Limits (as of Jan 2025):
 * - Free tier: 15 RPM, 1M TPM, 1500 RPD
 * - Pay-as-you-go: 1000 RPM, 4M TPM
 *
 * This limiter is conservative to leave headroom for other services.
 */

import { logger } from '../../utils/logger';

interface TokenWindow {
  timestamp: number;
  tokens: number;
}

interface RateLimitConfig {
  tokensPerMinute: number;
  requestsPerMinute: number;
  minDelayBetweenRequests: number; // milliseconds
}

// Default conservative limits (leaves 20% headroom)
const DEFAULT_CONFIG: RateLimitConfig = {
  tokensPerMinute: parseInt(process.env.GEMINI_TOKENS_PER_MINUTE || '800000', 10), // 800K of 1M limit
  requestsPerMinute: parseInt(process.env.GEMINI_REQUESTS_PER_MINUTE || '50', 10), // 50 of ~100 limit
  minDelayBetweenRequests: parseInt(process.env.GEMINI_MIN_DELAY_MS || '500', 10), // 500ms between calls
};

class GeminiRateLimiter {
  private tokenWindows: TokenWindow[] = [];
  private requestTimestamps: number[] = [];
  private lastRequestTime = 0;
  private config: RateLimitConfig;
  private waitingQueue: Array<{
    resolve: () => void;
    estimatedTokens: number;
  }> = [];
  private isProcessingQueue = false;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('Gemini rate limiter initialized', {
      tokensPerMinute: this.config.tokensPerMinute,
      requestsPerMinute: this.config.requestsPerMinute,
      minDelayMs: this.config.minDelayBetweenRequests,
    });
  }

  /**
   * Wait for rate limit clearance before making a Gemini API call
   * @param estimatedTokens - Estimated tokens for this request (input + output)
   */
  async waitForCapacity(estimatedTokens: number = 10000): Promise<void> {
    return new Promise((resolve) => {
      this.waitingQueue.push({ resolve, estimatedTokens });
      this.processQueue();
    });
  }

  /**
   * Record tokens used after a Gemini API call completes
   * @param tokensUsed - Actual tokens consumed (from API response)
   */
  recordUsage(tokensUsed: number): void {
    const now = Date.now();
    this.tokenWindows.push({ timestamp: now, tokens: tokensUsed });
    this.requestTimestamps.push(now);
    this.lastRequestTime = now;

    // Log high usage
    const currentUsage = this.getCurrentTokenUsage();
    const usagePercent = (currentUsage / this.config.tokensPerMinute) * 100;
    if (usagePercent > 70) {
      logger.warn('Gemini token usage high', {
        currentTokens: currentUsage,
        limit: this.config.tokensPerMinute,
        usagePercent: usagePercent.toFixed(1),
      });
    }
  }

  /**
   * Get current token usage in the sliding window
   */
  getCurrentTokenUsage(): number {
    this.cleanOldEntries();
    return this.tokenWindows.reduce((sum, w) => sum + w.tokens, 0);
  }

  /**
   * Get current requests in the sliding window
   */
  getCurrentRequestCount(): number {
    this.cleanOldEntries();
    return this.requestTimestamps.length;
  }

  /**
   * Get rate limiter status for monitoring
   */
  getStatus(): {
    tokensUsed: number;
    tokensLimit: number;
    requestsUsed: number;
    requestsLimit: number;
    queueLength: number;
  } {
    return {
      tokensUsed: this.getCurrentTokenUsage(),
      tokensLimit: this.config.tokensPerMinute,
      requestsUsed: this.getCurrentRequestCount(),
      requestsLimit: this.config.requestsPerMinute,
      queueLength: this.waitingQueue.length,
    };
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.waitingQueue.length > 0) {
      const next = this.waitingQueue[0];
      if (!next) break;

      const delay = this.calculateDelay(next.estimatedTokens);

      if (delay > 0) {
        await this.sleep(delay);
      }

      // Double-check after delay
      const finalDelay = this.calculateDelay(next.estimatedTokens);
      if (finalDelay > 0) {
        await this.sleep(finalDelay);
      }

      this.waitingQueue.shift();
      next.resolve();
    }

    this.isProcessingQueue = false;
  }

  private calculateDelay(estimatedTokens: number): number {
    this.cleanOldEntries();
    const now = Date.now();
    let delay = 0;

    // 1. Check minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.minDelayBetweenRequests) {
      delay = Math.max(delay, this.config.minDelayBetweenRequests - timeSinceLastRequest);
    }

    // 2. Check requests per minute
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      const oldestRequest = this.requestTimestamps[0];
      if (oldestRequest !== undefined) {
        const waitUntil = oldestRequest + 60000;
        delay = Math.max(delay, waitUntil - now);
      }
    }

    // 3. Check tokens per minute
    const currentTokens = this.tokenWindows.reduce((sum, w) => sum + w.tokens, 0);
    if (currentTokens + estimatedTokens > this.config.tokensPerMinute) {
      // Find when enough tokens will be freed
      let tokensToFree = currentTokens + estimatedTokens - this.config.tokensPerMinute;
      for (const window of this.tokenWindows) {
        const waitUntil = window.timestamp + 60000;
        if (waitUntil > now) {
          delay = Math.max(delay, waitUntil - now);
          tokensToFree -= window.tokens;
          if (tokensToFree <= 0) break;
        }
      }
    }

    if (delay > 0) {
      logger.debug('Gemini rate limiter delaying request', {
        delayMs: delay,
        currentTokens,
        estimatedTokens,
        requestCount: this.requestTimestamps.length,
      });
    }

    return delay;
  }

  private cleanOldEntries(): void {
    const cutoff = Date.now() - 60000; // 1 minute window
    this.tokenWindows = this.tokenWindows.filter((w) => w.timestamp > cutoff);
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const geminiRateLimiter = new GeminiRateLimiter();
