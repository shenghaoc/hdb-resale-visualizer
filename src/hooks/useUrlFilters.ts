import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";
import { clampFilterRanges, parseFilters, serializeFilters } from "@/shared/lib/queryState";
import type { FilterState } from "@/types/data";

export function useUrlFilters() {
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_FILTERS;
    }

    return {
      ...DEFAULT_FILTERS,
      ...parseFilters(window.location.search),
    };
  });

  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the initial mount — the URL already reflects the current filters.
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const nextSearch = serializeFilters(filters);
    window.history.replaceState({}, "", `${window.location.pathname}${nextSearch}`);
  }, [filters]);

  const patchFilters = useCallback((patch: Partial<FilterState>) => {
    startTransition(() => {
      // Clamp on every write, not just on URL restore: a number typed straight
      // into a filter field would otherwise reach the API unbounded.
      setFilters((current) => clampFilterRanges({ ...current, ...patch }));
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return { filters, patchFilters, resetFilters };
}
