import { useEffect, useState } from "react";

/**
 * Debounce a value by `delay` ms. Returns the debounced value.
 * Useful for search inputs that trigger expensive filtering.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
