import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { MAX_SHORTLIST_ITEMS } from "@/shared/lib/constants";
import {
  decodeShortlistFromUrl,
  loadShortlist,
  mergeImportedShortlistItems,
  restoreShortlistItem,
  saveShortlist,
  toggleShortlistItem,
  updateShortlistItem,
} from "@/features/shortlist/shortlist";
import type { ShortlistItem } from "@/types/data";
import { safeStorage } from "@/shared/lib/storage";

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

type LocalShortlistStore = {
  items: ShortlistItem[];
  isFull: boolean;
  toggle: (addressKey: string) => void;
  /**
   * Restores an item when capacity allows it.
   *
   * Returns true when the requested address is present after the operation,
   * including when it was already re-added through another surface.
   */
  restore: (item: ShortlistItem, index?: number) => boolean;
  update: (addressKey: string, patch: Partial<ShortlistItem>) => void;
  has: (addressKey: string) => boolean;
};

type LocalShortlistSyncAdapter = {
  itemsRef: MutableRefObject<ShortlistItem[]>;
  replaceItems: (items: ShortlistItem[]) => void;
};

export type UseLocalShortlistResult = LocalShortlistStore & LocalShortlistSyncAdapter;

/**
 * Browser-local shortlist store: load, URL import, persist, and mutate items.
 * Feature-internal; cloud-sync orchestration composes this via `replaceItems`.
 */
export function useLocalShortlist(): UseLocalShortlistResult {
  const [initialState] = useState(readInitialShortlist);
  const [items, setItems] = useState<ShortlistItem[]>(initialState.items);
  // Mirrors `items` for use inside async sync callbacks/effects without making
  // them depend on `items`. Mutations update it synchronously; the persistence
  // effect also reconciles it after React commits.
  const itemsRef = useRef(items);

  useEffect(() => {
    if (!initialState.shouldClearUrlParam) {
      return;
    }

    const newParams = new URLSearchParams(window.location.search);
    newParams.delete("shortlist");
    // Prefer toString() over .size — size is missing on older Safari/Chrome and
    // would falsily strip remaining unrelated query parameters.
    const remaining = newParams.toString();
    const newUrl = remaining
      ? `${window.location.pathname}?${remaining}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [initialState.shouldClearUrlParam]);

  useEffect(() => {
    itemsRef.current = items;
    saveShortlist(safeStorage, items);
  }, [items]);

  const replaceItems = useCallback((nextItems: ShortlistItem[]) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const toggle = useCallback((addressKey: string) => {
    const nextItems = toggleShortlistItem(itemsRef.current, addressKey);
    if (nextItems === itemsRef.current) {
      return;
    }

    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const restore = useCallback((item: ShortlistItem, index?: number) => {
    const currentItems = itemsRef.current;
    const nextItems = restoreShortlistItem(currentItems, item, index);
    if (nextItems === currentItems) {
      return currentItems.some((current) => current.addressKey === item.addressKey);
    }

    itemsRef.current = nextItems;
    setItems(nextItems);
    return true;
  }, []);

  const update = useCallback((addressKey: string, patch: Partial<ShortlistItem>) => {
    const nextItems = updateShortlistItem(itemsRef.current, addressKey, patch);
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const has = useCallback(
    (addressKey: string) => {
      return items.some((item) => item.addressKey === addressKey);
    },
    [items],
  );

  return {
    items,
    isFull: items.length >= MAX_SHORTLIST_ITEMS,
    toggle,
    restore,
    update,
    has,
    itemsRef,
    replaceItems,
  };
}
