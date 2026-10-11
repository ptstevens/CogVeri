import { useState, useEffect } from 'react';

/**
 * Debounce a value by delaying updates until the specified delay has passed
 * without any new values being set.
 *
 * @param value The value to debounce
 * @param delay Delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
