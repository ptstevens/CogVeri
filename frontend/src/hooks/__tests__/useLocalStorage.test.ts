import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../useLocalStorage';

describe('useLocalStorage', () => {
  // Create a mock localStorage
  let mockStorage: Record<string, string> = {};

  const localStorageMock = {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
    clear: vi.fn(() => {
      mockStorage = {};
    }),
  };

  beforeEach(() => {
    mockStorage = {};
    vi.clearAllMocks();

    // Override the localStorage mock from setup.ts with our functional mock
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    mockStorage = {};
  });

  describe('Initial value', () => {
    it('returns initial value when localStorage is empty', () => {
      const { result } = renderHook(() => useLocalStorage('testKey', 'initial'));
      expect(result.current[0]).toBe('initial');
    });

    it('returns stored value when localStorage has value', () => {
      mockStorage['existingKey'] = JSON.stringify('stored value');

      const { result } = renderHook(() => useLocalStorage('existingKey', 'initial'));
      expect(result.current[0]).toBe('stored value');
    });

    it('returns initial value when localStorage throws error on read', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useLocalStorage('errorKey', 'fallback'));

      expect(result.current[0]).toBe('fallback');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles different data types as initial value', () => {
      const { result: stringResult } = renderHook(() => useLocalStorage('string', 'text'));
      expect(stringResult.current[0]).toBe('text');

      const { result: numberResult } = renderHook(() => useLocalStorage('number', 42));
      expect(numberResult.current[0]).toBe(42);

      const { result: boolResult } = renderHook(() => useLocalStorage('bool', true));
      expect(boolResult.current[0]).toBe(true);

      const { result: objResult } = renderHook(() => useLocalStorage('obj', { foo: 'bar' }));
      expect(objResult.current[0]).toEqual({ foo: 'bar' });

      const { result: arrResult } = renderHook(() => useLocalStorage('arr', [1, 2, 3]));
      expect(arrResult.current[0]).toEqual([1, 2, 3]);
    });
  });

  describe('setValue', () => {
    it('updates state value', () => {
      const { result } = renderHook(() => useLocalStorage('key', 'initial'));

      act(() => {
        result.current[1]('updated');
      });

      expect(result.current[0]).toBe('updated');
    });

    it('persists value to localStorage', () => {
      const { result } = renderHook(() => useLocalStorage('persistKey', 'initial'));

      act(() => {
        result.current[1]('persisted');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'persistKey',
        JSON.stringify('persisted')
      );
    });

    it('accepts function updater', () => {
      const { result } = renderHook(() => useLocalStorage('counterKey', 0));

      act(() => {
        result.current[1]((prev) => prev + 1);
      });

      expect(result.current[0]).toBe(1);

      act(() => {
        result.current[1]((prev) => prev + 10);
      });

      expect(result.current[0]).toBe(11);
    });

    it('handles complex objects', () => {
      const { result } = renderHook(() => useLocalStorage('complexKey', { nested: { value: 1 } }));

      act(() => {
        result.current[1]({ nested: { value: 2 }, newField: 'added' } as any);
      });

      expect(result.current[0]).toEqual({ nested: { value: 2 }, newField: 'added' });
    });

    it('handles arrays', () => {
      const { result } = renderHook(() => useLocalStorage('arrayKey', [1, 2]));

      act(() => {
        result.current[1]((prev) => [...prev, 3]);
      });

      expect(result.current[0]).toEqual([1, 2, 3]);
    });

    it('handles errors during setItem gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });

      const { result } = renderHook(() => useLocalStorage('errorKey', 'initial'));

      act(() => {
        result.current[1]('will fail');
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('dispatches custom event after setting value', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const { result } = renderHook(() => useLocalStorage('eventKey', 'initial'));

      act(() => {
        result.current[1]('updated');
      });

      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
      const event = dispatchSpy.mock.calls[0][0] as Event;
      expect(event.type).toBe('local-storage');

      dispatchSpy.mockRestore();
    });
  });

  describe('removeValue', () => {
    it('removes value from localStorage', () => {
      mockStorage['removeKey'] = JSON.stringify('value to remove');
      const { result } = renderHook(() => useLocalStorage('removeKey', 'default'));

      expect(result.current[0]).toBe('value to remove');

      act(() => {
        result.current[2]();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('removeKey');
    });

    it('resets state to initial value', () => {
      mockStorage['resetKey'] = JSON.stringify('stored');
      const { result } = renderHook(() => useLocalStorage('resetKey', 'initial'));

      expect(result.current[0]).toBe('stored');

      act(() => {
        result.current[2]();
      });

      expect(result.current[0]).toBe('initial');
    });

    it('dispatches custom event after removing', () => {
      mockStorage['eventRemoveKey'] = JSON.stringify('value');
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const { result } = renderHook(() => useLocalStorage('eventRemoveKey', 'default'));

      act(() => {
        result.current[2]();
      });

      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
      dispatchSpy.mockRestore();
    });

    it('handles errors during removeItem gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('Remove error');
      });

      const { result } = renderHook(() => useLocalStorage('errorRemoveKey', 'initial'));

      act(() => {
        result.current[2]();
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Storage event listener', () => {
    it('updates state when storage event is fired from another tab', () => {
      const { result } = renderHook(() => useLocalStorage('crossTabKey', 'initial'));

      act(() => {
        // Simulate storage event from another tab
        const event = new StorageEvent('storage', {
          key: 'crossTabKey',
          newValue: JSON.stringify('from other tab'),
        });
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('from other tab');
    });

    it('resets to initial value when storage event has null newValue', () => {
      mockStorage['nullKey'] = JSON.stringify('stored');
      const { result } = renderHook(() => useLocalStorage('nullKey', 'initial'));

      expect(result.current[0]).toBe('stored');

      act(() => {
        const event = new StorageEvent('storage', {
          key: 'nullKey',
          newValue: null,
        });
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('initial');
    });

    it('ignores storage events for different keys', () => {
      const { result } = renderHook(() => useLocalStorage('myKey', 'initial'));

      act(() => {
        const event = new StorageEvent('storage', {
          key: 'otherKey',
          newValue: JSON.stringify('other value'),
        });
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('initial');
    });

    it('handles invalid JSON in storage event gracefully', () => {
      const { result } = renderHook(() => useLocalStorage('jsonKey', 'initial'));

      act(() => {
        const event = new StorageEvent('storage', {
          key: 'jsonKey',
          newValue: 'invalid json {{{',
        });
        window.dispatchEvent(event);
      });

      // Should fall back to initial value on parse error
      expect(result.current[0]).toBe('initial');
    });

    it('cleans up event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useLocalStorage('cleanupKey', 'initial'));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('local-storage', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Custom local-storage event', () => {
    it('syncs value when local-storage event is fired', () => {
      const { result } = renderHook(() => useLocalStorage('syncKey', 'initial'));

      // Manually set localStorage and fire custom event
      act(() => {
        mockStorage['syncKey'] = JSON.stringify('synced value');
        window.dispatchEvent(new Event('local-storage'));
      });

      expect(result.current[0]).toBe('synced value');
    });
  });

  describe('Multiple hooks with same key', () => {
    it('both hooks read same initial value', () => {
      mockStorage['sharedKey'] = JSON.stringify('shared');

      const { result: result1 } = renderHook(() => useLocalStorage('sharedKey', 'default1'));
      const { result: result2 } = renderHook(() => useLocalStorage('sharedKey', 'default2'));

      expect(result1.current[0]).toBe('shared');
      expect(result2.current[0]).toBe('shared');
    });
  });

  describe('Edge cases', () => {
    it('handles empty string key', () => {
      const { result } = renderHook(() => useLocalStorage('', 'default'));

      act(() => {
        result.current[1]('new value');
      });

      expect(result.current[0]).toBe('new value');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('', JSON.stringify('new value'));
    });

    it('handles null as stored value', () => {
      mockStorage['nullValueKey'] = JSON.stringify(null);
      const { result } = renderHook(() => useLocalStorage('nullValueKey', 'default'));
      expect(result.current[0]).toBeNull();
    });

    it('handles undefined as stored value', () => {
      mockStorage['undefinedKey'] = JSON.stringify(undefined);
      // JSON.stringify(undefined) returns undefined, not a string
      // So this tests the fallback behavior
      const { result } = renderHook(() => useLocalStorage('undefinedKey', 'default'));
      // undefined stringifies to undefined, which fails JSON.parse
      expect(result.current[0]).toBe('default');
    });

    it('handles special characters in key', () => {
      const specialKey = 'key/with\\special:chars?&=';
      const { result } = renderHook(() => useLocalStorage(specialKey, 'value'));

      act(() => {
        result.current[1]('updated');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(specialKey, JSON.stringify('updated'));
    });

    it('handles very long values', () => {
      const longValue = 'x'.repeat(10000);
      const { result } = renderHook(() => useLocalStorage('longKey', ''));

      act(() => {
        result.current[1](longValue);
      });

      expect(result.current[0]).toBe(longValue);
    });
  });
});
