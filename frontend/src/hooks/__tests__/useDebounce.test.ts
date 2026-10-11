import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial value', () => {
    it('returns the initial value immediately', () => {
      const { result } = renderHook(() => useDebounce('initial', 500));
      expect(result.current).toBe('initial');
    });

    it('returns initial value for number', () => {
      const { result } = renderHook(() => useDebounce(42, 500));
      expect(result.current).toBe(42);
    });

    it('returns initial value for object', () => {
      const initialObj = { foo: 'bar' };
      const { result } = renderHook(() => useDebounce(initialObj, 500));
      expect(result.current).toEqual({ foo: 'bar' });
    });

    it('returns initial value for array', () => {
      const initialArr = [1, 2, 3];
      const { result } = renderHook(() => useDebounce(initialArr, 500));
      expect(result.current).toEqual([1, 2, 3]);
    });

    it('returns initial value for boolean', () => {
      const { result } = renderHook(() => useDebounce(true, 500));
      expect(result.current).toBe(true);
    });

    it('returns initial value for null', () => {
      const { result } = renderHook(() => useDebounce(null, 500));
      expect(result.current).toBeNull();
    });

    it('returns initial value for undefined', () => {
      const { result } = renderHook(() => useDebounce(undefined, 500));
      expect(result.current).toBeUndefined();
    });
  });

  describe('Debouncing behavior', () => {
    it('does not update immediately when value changes', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      rerender({ value: 'updated', delay: 500 });

      // Value should still be the initial value
      expect(result.current).toBe('initial');
    });

    it('updates after the delay has passed', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      rerender({ value: 'updated', delay: 500 });

      // Advance timers by the delay
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe('updated');
    });

    it('does not update before the delay completes', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      rerender({ value: 'updated', delay: 500 });

      // Advance by less than the delay
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(result.current).toBe('initial');
    });

    it('resets timer when value changes again before delay', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      // First update
      rerender({ value: 'first update', delay: 500 });

      // Wait some time but not full delay
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Second update (should reset the timer)
      rerender({ value: 'second update', delay: 500 });

      // After 300ms more (600ms total from first update, but only 300ms from second)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should still be initial because timer was reset
      expect(result.current).toBe('initial');

      // Wait remaining 200ms
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current).toBe('second update');
    });

    it('handles rapid successive updates', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'v0', delay: 500 },
      });

      // Rapid updates
      rerender({ value: 'v1', delay: 500 });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender({ value: 'v2', delay: 500 });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender({ value: 'v3', delay: 500 });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender({ value: 'v4', delay: 500 });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender({ value: 'final', delay: 500 });

      // At this point, result should still be the initial value
      expect(result.current).toBe('v0');

      // Wait for full delay from last update
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe('final');
    });
  });

  describe('Delay parameter', () => {
    it('works with 0ms delay', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 0 },
      });

      rerender({ value: 'updated', delay: 0 });

      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(result.current).toBe('updated');
    });

    it('works with very short delay (10ms)', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 10 },
      });

      rerender({ value: 'updated', delay: 10 });

      act(() => {
        vi.advanceTimersByTime(5);
      });
      expect(result.current).toBe('initial');

      act(() => {
        vi.advanceTimersByTime(5);
      });

      expect(result.current).toBe('updated');
    });

    it('works with long delay (5000ms)', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 5000 },
      });

      rerender({ value: 'updated', delay: 5000 });

      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(result.current).toBe('initial');

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(result.current).toBe('updated');
    });

    it('handles delay change', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      // Change both value and delay
      rerender({ value: 'updated', delay: 1000 });

      // Old delay would have triggered
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current).toBe('initial');

      // Wait for new delay
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('Cleanup', () => {
    it('clears timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      rerender({ value: 'updated', delay: 500 });
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('does not update after unmount', () => {
      const { result, unmount, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 500 } }
      );

      rerender({ value: 'updated', delay: 500 });

      // Unmount before delay completes
      const lastResult = result.current;
      unmount();

      // Advance timers
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Result reference should still be the old value
      expect(lastResult).toBe('initial');
    });
  });

  describe('Type preservation', () => {
    it('preserves string type', () => {
      const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
        initialProps: { value: 'test' },
      });

      rerender({ value: 'new test' });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(typeof result.current).toBe('string');
    });

    it('preserves number type', () => {
      const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
        initialProps: { value: 123 },
      });

      rerender({ value: 456 });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(typeof result.current).toBe('number');
      expect(result.current).toBe(456);
    });

    it('preserves object reference until debounce', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };

      const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
        initialProps: { value: obj1 },
      });

      expect(result.current).toBe(obj1);

      rerender({ value: obj2 });
      expect(result.current).toBe(obj1);
    });
  });

  describe('Edge cases', () => {
    it('handles same value updates', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'same', delay: 500 },
      });

      rerender({ value: 'same', delay: 500 });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe('same');
    });

    it('handles empty string', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      });

      rerender({ value: '', delay: 500 });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe('');
    });

    it('handles falsy values correctly', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 1 as number | null, delay: 500 },
      });

      rerender({ value: 0, delay: 500 });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe(0);

      rerender({ value: null, delay: 500 });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBeNull();
    });
  });
});
