import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_SHORTLIST_ITEMS, SYNC_CODE_STORAGE_KEY } from "@/lib/constants";
import {
  decodeShortlistFromUrl,
  loadShortlist,
  mergeImportedShortlistItems,
  mergeShortlists,
  saveShortlist,
  toggleShortlistItem,
} from "@/lib/shortlist";
import { SyncCodeNotFoundError, pullShortlist, pushShortlist } from "@/lib/cloudSync";
import type { ShortlistItem } from "@/types/data";
import { safeStorage } from "@/lib/storage";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const SYNC_DEBOUNCE_MS = 1000;

export type SyncStatus = "local" | "syncing" | "synced" | "error";

export type ShortlistSync = {
  /** Active sync code, or null when sync is off. */
  code: string | null;
  status: SyncStatus;
  /** Turn on sync: mint a code and back up the current shortlist. */
  enable: () => Promise<void>;
  /** Link an existing code: pull, merge, then keep syncing. */
  link: (code: string) => Promise<void>;
  /** Turn off sync on this device (local data is untouched). */
  disable: () => void;
};

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
  // Mirrors `items` for use inside async sync callbacks/effects without making
  // them depend on `items`. Updated in the persistence effect below.
  const itemsRef = useRef(items);

  const [syncCode, setSyncCode] = useState<string | null>(() =>
    safeStorage.getItem(SYNC_CODE_STORAGE_KEY),
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    safeStorage.getItem(SYNC_CODE_STORAGE_KEY) ? "syncing" : "local",
  );
  const debouncedItems = useDebouncedValue(items, SYNC_DEBOUNCE_MS);
  // JSON of the last successfully pushed set — skips redundant pushes.
  const lastPushedRef = useRef<string | null>(null);
  // Gates the debounced push until the initial pull/merge has completed, so we
  // never clobber cloud data with stale local state on sign-in/reload.
  const readyRef = useRef(false);

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
    itemsRef.current = items;
    saveShortlist(safeStorage, items);
  }, [items]);

  const dropSyncCode = useCallback((status: SyncStatus) => {
    safeStorage.removeItem(SYNC_CODE_STORAGE_KEY);
    readyRef.current = false;
    lastPushedRef.current = null;
    setSyncCode(null);
    setSyncStatus(status);
  }, []);

  // Initial hydration for a stored code: pull → merge → push merged, once.
  useEffect(() => {
    if (!syncCode || readyRef.current) {
      return;
    }

    let cancelled = false;
    setSyncStatus("syncing");
    void (async () => {
      try {
        const cloud = await pullShortlist(syncCode);
        if (cancelled) return;
        const merged = mergeShortlists(itemsRef.current, cloud);
        const result = await pushShortlist(syncCode, merged);
        if (cancelled) return;
        readyRef.current = true;
        lastPushedRef.current = JSON.stringify(result.items);
        setItems(result.items);
        setSyncStatus("synced");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof SyncCodeNotFoundError) {
          dropSyncCode("local");
        } else {
          // Leave readyRef false so we don't push (and risk clobbering) until a
          // future reload retries the pull. Local use is unaffected.
          setSyncStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syncCode, dropSyncCode]);

  // Debounced push of subsequent local changes while a code is active.
  useEffect(() => {
    if (!syncCode || !readyRef.current) {
      return;
    }
    const snapshot = JSON.stringify(debouncedItems);
    if (snapshot === lastPushedRef.current) {
      return;
    }

    let cancelled = false;
    setSyncStatus("syncing");
    void pushShortlist(syncCode, debouncedItems)
      .then(() => {
        if (cancelled) return;
        lastPushedRef.current = snapshot;
        setSyncStatus("synced");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof SyncCodeNotFoundError) {
          dropSyncCode("local");
        } else {
          setSyncStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedItems, syncCode, dropSyncCode]);

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

  const enable = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const result = await pushShortlist(null, itemsRef.current);
      readyRef.current = true;
      lastPushedRef.current = JSON.stringify(result.items);
      setItems(result.items);
      safeStorage.setItem(SYNC_CODE_STORAGE_KEY, result.syncCode);
      setSyncCode(result.syncCode);
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      throw error;
    }
  }, []);

  const link = useCallback(async (code: string) => {
    setSyncStatus("syncing");
    try {
      const cloud = await pullShortlist(code);
      const merged = mergeShortlists(itemsRef.current, cloud);
      const result = await pushShortlist(code, merged);
      readyRef.current = true;
      lastPushedRef.current = JSON.stringify(result.items);
      setItems(result.items);
      safeStorage.setItem(SYNC_CODE_STORAGE_KEY, code);
      setSyncCode(code);
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      throw error;
    }
  }, []);

  const disable = useCallback(() => {
    dropSyncCode("local");
  }, [dropSyncCode]);

  const sync = useMemo<ShortlistSync>(
    () => ({ code: syncCode, status: syncStatus, enable, link, disable }),
    [syncCode, syncStatus, enable, link, disable],
  );

  return useMemo(
    () => ({
      items,
      isFull: items.length >= MAX_SHORTLIST_ITEMS,
      toggle,
      update,
      has,
      sync,
    }),
    [items, toggle, update, has, sync],
  );
}
