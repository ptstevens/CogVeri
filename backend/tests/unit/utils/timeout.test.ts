import { describe, it, expect, vi } from 'vitest';
import {
  withTimeout,
  TimeoutError,
  TIMEOUT_PRESETS,
  retryWithTimeout,
  createTimeoutWrapper,
} from '../../../src/utils/timeout';

describe('Timeout Utilities', () => {
  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const fastPromise = Promise.resolve('success');
      const result = await withTimeout(fastPromise, 1000, 'fast operation');
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError when promise exceeds timeout', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 500);
      });

      await expect(withTimeout(slowPromise, 100, 'slow operation')).rejects.toThrow(TimeoutError);
    });

    it('should include operation name and timeout in error message', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 500);
      });

      try {
        await withTimeout(slowPromise, 100, 'test operation');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as Error).message).toContain('test operation');
        expect((error as Error).message).toContain('100ms');
      }
    });

    it('should propagate original error when promise rejects', async () => {
      const failingPromise = Promise.reject(new Error('Original error'));

      await expect(withTimeout(failingPromise, 1000, 'failing operation')).rejects.toThrow(
        'Original error'
      );
    });

    it('should clear timeout after promise resolves', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const promise = Promise.resolve('done');
      await withTimeout(promise, 5000, 'test');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('TimeoutError', () => {
    it('should have correct name property', () => {
      const error = new TimeoutError('test', 1000);
      expect(error.name).toBe('TimeoutError');
    });

    it('should be instanceof Error', () => {
      const error = new TimeoutError('test', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('TIMEOUT_PRESETS', () => {
    it('should have expected preset values', () => {
      expect(TIMEOUT_PRESETS.CACHE).toBe(1000);
      expect(TIMEOUT_PRESETS.DATABASE).toBe(5000);
      expect(TIMEOUT_PRESETS.SERVICE).toBe(10000);
      expect(TIMEOUT_PRESETS.EXTERNAL_API).toBe(30000);
      expect(TIMEOUT_PRESETS.FILE_IO).toBe(60000);
      expect(TIMEOUT_PRESETS.LONG_RUNNING).toBe(300000);
    });
  });

  describe('createTimeoutWrapper', () => {
    it('should create wrapper with default timeout', async () => {
      const wrapper = createTimeoutWrapper(100, 'default operation');
      const fastPromise = Promise.resolve('success');

      const result = await wrapper(fastPromise);
      expect(result).toBe('success');
    });

    it('should allow overriding default timeout', async () => {
      const wrapper = createTimeoutWrapper(50, 'default operation');
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 100);
      });

      // With default timeout (50ms), should fail
      await expect(wrapper(slowPromise)).rejects.toThrow(TimeoutError);

      // With overridden timeout (200ms), should succeed
      const slowPromise2 = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 100);
      });
      const result = await wrapper(slowPromise2, 200);
      expect(result).toBe('success');
    });
  });

  describe('retryWithTimeout', () => {
    it('should succeed on first attempt if no error', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithTimeout(fn, {
        timeoutMs: 1000,
        operationName: 'test',
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure up to maxAttempts', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retryWithTimeout(fn, {
        maxAttempts: 3,
        timeoutMs: 1000,
        operationName: 'test',
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after maxAttempts exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(
        retryWithTimeout(fn, {
          maxAttempts: 2,
          timeoutMs: 1000,
          operationName: 'test',
        })
      ).rejects.toThrow('always fails');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback on each retry', async () => {
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      await retryWithTimeout(fn, {
        maxAttempts: 3,
        timeoutMs: 1000,
        operationName: 'test',
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
    });

    it('should respect delayMs between retries', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

      const start = Date.now();
      await retryWithTimeout(fn, {
        maxAttempts: 2,
        timeoutMs: 1000,
        delayMs: 100,
        operationName: 'test',
      });
      const elapsed = Date.now() - start;

      // Should have waited at least 100ms for the retry delay
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some timing variance
    });
  });
});
