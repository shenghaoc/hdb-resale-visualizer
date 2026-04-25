import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decodeShortlistFromUrl,
  loadShortlist,
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

  try {
    const params = new URLSearchParams(window.location.search);
    const shortlistParam = params.get("shortlist");
    if (shortlistParam) {
      const parsed = decodeShortlistFromUrl(shortlistParam);
      if (parsed.length > 0) {
        return {
          items: parsed,
          shouldClearUrlParam: true,
        };
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return {
    items: loadShortlist(safeStorage),
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
      current.map((item) =>
        item.addressKey === addressKey
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  }, []);

  const has = useCallback((addressKey: string) => {
    return items.some((item) => item.addressKey === addressKey);
  }, [items]);

  return useMemo(
    () => ({
      items,
      toggle,
      update,
      has,
    }),
    [items, toggle, update, has],
  );
}
