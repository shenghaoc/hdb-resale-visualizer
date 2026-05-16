import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_SHORTLIST_ITEMS } from "@/lib/constants";
import {
  decodeShortlistFromUrl,
  loadShortlist,
  mergeImportedShortlistItems,
  saveShortlist,
  toggleShortlistItem,
} from "@/lib/shortlist";
import type { ShortlistItem } from "@/types/data";
import { safeStorage } from "@/lib/storage";

type InitialShortlistState = {
  items: ShortlistItem[];
  shouldClearUrlParam: boolean;
};

function readInitialShortlist(): InitialShortlistState {
  if (typeof window === "undefined") {
    return {
      items: [],
      shouldClearUrlParam: false,
    };
  }

  const savedItems = loadShortlist(safeStorage);

  try {
    const params = new URLSearchParams(window.location.search);
    const shortlistParam = params.get("shortlist");
    if (shortlistParam) {
      const parsed = decodeShortlistFromUrl(shortlistParam);
      if (parsed.length > 0) {
        return {
          items: mergeImportedShortlistItems(savedItems, parsed),
          shouldClearUrlParam: true,
        };
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return {
    items: savedItems,
    shouldClearUrlParam: false,
  };
}

export function useShortlist() {
  const [initialState] = useState(readInitialShortlist);
  const [items, setItems] = useState<ShortlistItem[]>(initialState.items);

  useEffect(() => {
    if (!initialState.shouldClearUrlParam) {
      return;
    }

    const newParams = new URLSearchParams(window.location.search);
    newParams.delete("shortlist");
    const newUrl = newParams.size ? `${window.location.pathname}?${newParams.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [initialState.shouldClearUrlParam]);

  useEffect(() => {
    saveShortlist(safeStorage, items);
  }, [items]);

  const toggle = useCallback((addressKey: string) => {
    setItems((current) => toggleShortlistItem(current, addressKey));
  }, []);

  const update = useCallback((addressKey: string, patch: Partial<ShortlistItem>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.addressKey !== addressKey) return item;
        const next = { ...item, ...patch };

        // Normalize empty strings and nulls to undefined to omit them from JSON serialization,
        // reducing the footprint in localStorage and shared URL payloads.
        if (next.pros === "") next.pros = undefined;
        if (next.cons === "") next.cons = undefined;
        if (next.renovation === "") next.renovation = undefined;
        if (next.noise === "") next.noise = undefined;
        if (next.transport === "") next.transport = undefined;
        if (next.agentRemarks === "") next.agentRemarks = undefined;

        return next;
      }),
    );
  }, []);

  const has = useCallback((addressKey: string) => {
    return items.some((item) => item.addressKey === addressKey);
  }, [items]);

  return useMemo(
    () => ({
      items,
      isFull: items.length >= MAX_SHORTLIST_ITEMS,
      toggle,
      update,
      has,
    }),
    [items, toggle, update, has],
  );
}
