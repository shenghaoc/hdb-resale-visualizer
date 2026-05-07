import { startTransition, useCallback, useEffect, useState } from "react";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { parseFilters, serializeFilters } from "@/lib/queryState";
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

  useEffect(() => {
    const nextSearch = serializeFilters(filters);
    window.history.replaceState({}, "", `${window.location.pathname}${nextSearch}`);
  }, [filters]);

  const patchFilters = useCallback((patch: Partial<FilterState>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...patch }));
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return { filters, patchFilters, resetFilters };
}
