import { startTransition, useCallback, useEffect, useState } from "react";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import type { FilterState } from "@/types/data";

type UrlFilterActions = {
  clearSelectedArtifacts: () => void;
};

export function useUrlFilters({ clearSelectedArtifacts }: UrlFilterActions) {
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

  const patchFilters = useCallback(
    (patch: Partial<FilterState>) => {
      if ("selectedAddressKey" in patch && !patch.selectedAddressKey) {
        clearSelectedArtifacts();
      }

      startTransition(() => {
        setFilters((current) => ({ ...current, ...patch }));
      });
    },
    [clearSelectedArtifacts],
  );

  const resetFilters = useCallback(() => {
    clearSelectedArtifacts();
    setFilters(DEFAULT_FILTERS);
  }, [clearSelectedArtifacts]);

  return { filters, patchFilters, resetFilters };
}
