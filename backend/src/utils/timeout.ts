/**
 * Timeout utilities for protecting async operations from hanging indefinitely
 */

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout
 * If the promise doesn't resolve/reject within timeoutMs, it rejects with TimeoutError
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param operationName - Name of the operation (for error messages)
 * @returns The resolved value or throws TimeoutError/original error
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'fetchData'
 * );
 *
 * // With try/catch
 * try {
 *   const data = await withTimeout(externalApi.call(), 10000, 'External API');
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     // Handle timeout specifically
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'async operation'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Create a timeout wrapper with preset defaults
 * Useful when you want consistent timeout settings across multiple operations
 *
 * @example
 * ```typescript
 * const dbWithTimeout = createTimeoutWrapper(5000, 'Database query');
 * const result = await dbWithTimeout(db.query('SELECT * FROM users'));
 * ```
 */
export function createTimeoutWrapper(defaultTimeoutMs: number, defaultOperationName: string) {
  return function <T>(
    promise: Promise<T>,
    timeoutMs: number = defaultTimeoutMs,
    operationName: string = defaultOperationName
  ): Promise<T> {
    return withTimeout(promise, timeoutMs, operationName);
  };
}

/**
 * Common timeout presets for different operation types
 */
export const TIMEOUT_PRESETS = {
  /** Short operations like cache lookups - 1 second */
  CACHE: 1000,
  /** Database queries - 5 seconds */
  DATABASE: 5000,
  /** Internal service calls - 10 seconds */
  SERVICE: 10000,
  /** External API calls - 30 seconds */
  EXTERNAL_API: 30000,
  /** File operations - 60 seconds */
  FILE_IO: 60000,
  /** Long-running operations - 5 minutes */
  LONG_RUNNING: 300000,
} as const;

/**
 * Retry an async operation with timeout on each attempt
 *
 * @param fn - Function that returns a promise
 * @param options - Retry options
 * @returns The resolved value
 *
 * @example
 * ```typescript
 * const result = await retryWithTimeout(
 *   () => fetchFromApi(url),
 *   {
 *     maxAttempts: 3,
 *     timeoutMs: 5000,
 *     operationName: 'API fetch',
 *     delayMs: 1000,
 *   }
 * );
 * ```
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    timeoutMs: number;
    operationName?: string;
    delayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const {
    maxAttempts = 3,
    timeoutMs,
    operationName = 'async operation',
    delayMs = 0,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, operationName);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);

        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  throw lastError;
}
