/**
 * Gemini API Retry Utility
 *
 * Provides exponential backoff retry logic for handling transient errors
 * like 429 rate limits and 503 service unavailable.
 */

import { logger } from './logger';

/**
 * Errors that should trigger a retry
 */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 60000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  addJitter?: boolean;
  /** Context for logging */
  context?: string;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  addJitter: true,
  context: 'Gemini API',
};

/**
 * Check if an error is retryable (rate limit or transient server error)
 */
function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorObj = error as Record<string, unknown>;

  // Check for status code in various error formats
  const statusCode =
    errorObj.status ||
    errorObj.statusCode ||
    (errorObj.response as Record<string, unknown>)?.status ||
    (errorObj.error as Record<string, unknown>)?.status;

  if (typeof statusCode === 'number' && RETRYABLE_STATUS_CODES.includes(statusCode)) {
    return true;
  }

  // Check error message for rate limit indicators
  const errorMessage = String(errorObj.message || errorObj.toString() || '');
  if (
    errorMessage.includes('429') ||
    errorMessage.includes('Too Many Requests') ||
    errorMessage.includes('Resource exhausted') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('quota exceeded') ||
    errorMessage.includes('503') ||
    errorMessage.includes('Service Unavailable')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: Required<RetryConfig>): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter (±25% randomization) to prevent thundering herd
  if (config.addJitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry on transient errors
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => model.generateContent([...]),
 *   { maxRetries: 5, context: 'rubric generation' }
 * );
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!isRetryableError(error)) {
        logger.debug(`${finalConfig.context}: Non-retryable error, throwing immediately`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Check if we have retries left
      if (attempt >= finalConfig.maxRetries) {
        logger.error(`${finalConfig.context}: All ${finalConfig.maxRetries} retries exhausted`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Calculate delay for next attempt
      const delayMs = calculateDelay(attempt, finalConfig);

      logger.warn(
        `${finalConfig.context}: Retryable error, attempt ${attempt + 1}/${finalConfig.maxRetries + 1}`,
        {
          error: error instanceof Error ? error.message : String(error),
          nextRetryIn: `${delayMs}ms`,
          attempt: attempt + 1,
          maxRetries: finalConfig.maxRetries,
        }
      );

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This shouldn't be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrapper specifically for Gemini API calls with sensible defaults
 */
export async function retryGeminiCall<T>(fn: () => Promise<T>, context: string): Promise<T> {
  return retryWithBackoff(fn, {
    maxRetries: 5,
    initialDelayMs: 2000, // Start with 2 second delay
    maxDelayMs: 120000, // Max 2 minute delay
    backoffMultiplier: 2, // Double each time: 2s, 4s, 8s, 16s, 32s
    addJitter: true,
    context: `Gemini API (${context})`,
  });
}
