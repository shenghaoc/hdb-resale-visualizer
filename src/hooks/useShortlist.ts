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
import {
  isRetriableSyncError,
  SyncCodeNotFoundError,
  SyncRateLimitedError,
  pullShortlist,
  pushShortlist,
} from "@/lib/cloudSync";
import {
  clearPendingShortlistPush,
  enqueuePendingShortlistPush,
  hasPendingShortlistPush,
  readPendingShortlistPush,
} from "@/lib/shortlistSyncQueue";
import type { ShortlistItem } from "@/types/data";
import { safeStorage } from "@/lib/storage";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const SYNC_DEBOUNCE_MS = 1000;

/** Merge cloud items into local state without redundant re-renders. */
function mergeFromCloud(current: ShortlistItem[], cloud: ShortlistItem[]): ShortlistItem[] {
  const next = mergeShortlists(current, cloud);
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

/** Keep itemsRef in sync with React state for async sync callbacks. */
function applyItems(
  itemsRef: { current: ShortlistItem[] },
  setItems: (value: ShortlistItem[]) => void,
  next: ShortlistItem[],
): void {
  itemsRef.current = next;
  setItems(next);
}

function applyPushResult(
  itemsRef: { current: ShortlistItem[] },
  setItems: (value: ShortlistItem[]) => void,
  lastPushedRef: { current: string | null },
  snapshot: string,
  resultItems: ShortlistItem[],
): void {
  lastPushedRef.current = JSON.stringify(resultItems);
  if (JSON.stringify(itemsRef.current) === snapshot) {
    const nextItems = mergeFromCloud(itemsRef.current, resultItems);
    if (nextItems !== itemsRef.current) {
      applyItems(itemsRef, setItems, nextItems);
    }
  }
}

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
  const flushInFlightRef = useRef(false);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPendingPushRef = useRef<() => void>(() => {});
  const [hydrationKey, setHydrationKey] = useState(0);

  const scheduleRateLimitRetry = useCallback((retryAfterSec: number) => {
    if (rateLimitTimerRef.current) {
      clearTimeout(rateLimitTimerRef.current);
    }
    rateLimitTimerRef.current = setTimeout(() => {
      rateLimitTimerRef.current = null;
      flushPendingPushRef.current();
    }, retryAfterSec * 1000);
  }, []);

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
    clearPendingShortlistPush();
    if (rateLimitTimerRef.current) {
      clearTimeout(rateLimitTimerRef.current);
      rateLimitTimerRef.current = null;
    }
    readyRef.current = false;
    lastPushedRef.current = null;
    setSyncCode(null);
    setSyncStatus(status);
  }, []);

  const flushPendingPush = useCallback(() => {
    if (flushInFlightRef.current || !navigator.onLine) {
      return;
    }

    const pending = readPendingShortlistPush();
    if (!pending) {
      return;
    }

    // When the queue targets an existing code but hydration hasn't finished yet,
    // defer to the hydration effect which will pull, merge, and push the
    // authoritative payload (clearing the queue itself on success).
    if (pending.syncCode !== null && !readyRef.current) {
      return;
    }

    flushInFlightRef.current = true;
    const flushedSnapshot = JSON.stringify(pending.items);
    setSyncStatus("syncing");
    void pushShortlist(pending.syncCode, pending.items)
      .then((result) => {
        // Only clear if the queue wasn't overwritten with newer data while in flight.
        const current = readPendingShortlistPush();
        if (!current || JSON.stringify(current.items) === flushedSnapshot) {
          clearPendingShortlistPush();
        } else {
          // Newer data was enqueued during the push — re-flush once .finally()
          // resets flushInFlightRef (setTimeout defers to the next macrotask).
          setTimeout(() => flushPendingPushRef.current(), 0);
        }
        if (pending.syncCode === null) {
          safeStorage.setItem(SYNC_CODE_STORAGE_KEY, result.syncCode);
          setSyncCode(result.syncCode);
          readyRef.current = true;
        }
        applyPushResult(itemsRef, setItems, lastPushedRef, flushedSnapshot, result.items);
        setSyncStatus("synced");
      })
      .catch((error: unknown) => {
        if (error instanceof SyncCodeNotFoundError) {
          clearPendingShortlistPush();
          dropSyncCode("local");
          return;
        }
        if (error instanceof SyncRateLimitedError) {
          scheduleRateLimitRetry(error.retryAfterSec);
          setSyncStatus("synced");
          return;
        }
        if (isRetriableSyncError(error)) {
          setSyncStatus("synced");
          return;
        }
        setSyncStatus("error");
      })
      .finally(() => {
        flushInFlightRef.current = false;
      });
  }, [dropSyncCode, scheduleRateLimitRetry]);

  useEffect(() => {
    flushPendingPushRef.current = flushPendingPush;
  }, [flushPendingPush]);

  useEffect(() => {
    const onOnline = () => {
      setHydrationKey((key) => key + 1);
      // When a stored code still hasn't completed its initial pull (syncCode set,
      // readyRef false), the hydration effect re-runs on this reconnect and
      // re-pushes the merged payload, clearing the queue itself. Flushing here as
      // well would push to the same code concurrently, so only flush directly
      // when hydration won't (no code yet — the enable() mint path — or already
      // hydrated).
      if (readyRef.current || !syncCode) {
        flushPendingPush();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushPendingPush, syncCode]);

  useEffect(() => {
    if (!navigator.onLine || !hasPendingShortlistPush()) {
      return;
    }
    const timer = setTimeout(() => flushPendingPush(), 0);
    return () => clearTimeout(timer);
  }, [flushPendingPush]);

  useEffect(
    () => () => {
      if (rateLimitTimerRef.current) {
        clearTimeout(rateLimitTimerRef.current);
      }
    },
    [],
  );

  // Initial hydration for a stored code: pull → merge → push merged, once.
  useEffect(() => {
    if (!syncCode || readyRef.current) {
      return;
    }

    let cancelled = false;
    setSyncStatus("syncing");
    void (async () => {
      let pushPayload: ShortlistItem[] | null = null;
      try {
        const cloud = await pullShortlist(syncCode);
        if (cancelled) return;
        const mergedItems = mergeFromCloud(itemsRef.current, cloud);
        const mergedSnapshot = JSON.stringify(mergedItems);
        pushPayload = mergeShortlists(itemsRef.current, cloud);
        applyItems(itemsRef, setItems, mergedItems);
        const result = await pushShortlist(syncCode, pushPayload);
        if (cancelled) return;
        readyRef.current = true;
        clearPendingShortlistPush();
        lastPushedRef.current = JSON.stringify(result.items);
        if (JSON.stringify(itemsRef.current) === mergedSnapshot) {
          const nextItems = mergeFromCloud(itemsRef.current, result.items);
          if (nextItems !== itemsRef.current) {
            applyItems(itemsRef, setItems, nextItems);
          }
        }
        setSyncStatus("synced");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof SyncCodeNotFoundError) {
          dropSyncCode("local");
        } else if (pushPayload !== null) {
          if (error instanceof SyncRateLimitedError) {
            enqueuePendingShortlistPush(syncCode, pushPayload);
            readyRef.current = true;
            scheduleRateLimitRetry(error.retryAfterSec);
            setSyncStatus("synced");
          } else if (isRetriableSyncError(error)) {
            enqueuePendingShortlistPush(syncCode, pushPayload);
            readyRef.current = true;
            setSyncStatus("synced");
          } else {
            setSyncStatus("error");
          }
        } else if (isRetriableSyncError(error)) {
          setSyncStatus("synced");
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
  }, [syncCode, dropSyncCode, hydrationKey, scheduleRateLimitRetry]);

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
      .then((result) => {
        if (cancelled) return;
        clearPendingShortlistPush();
        applyPushResult(itemsRef, setItems, lastPushedRef, snapshot, result.items);
        setSyncStatus("synced");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof SyncCodeNotFoundError) {
          dropSyncCode("local");
        } else if (error instanceof SyncRateLimitedError) {
          enqueuePendingShortlistPush(syncCode, debouncedItems);
          scheduleRateLimitRetry(error.retryAfterSec);
          setSyncStatus("synced");
        } else if (isRetriableSyncError(error)) {
          enqueuePendingShortlistPush(syncCode, debouncedItems);
          setSyncStatus("synced");
        } else {
          setSyncStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedItems, syncCode, dropSyncCode, scheduleRateLimitRetry]);

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
    const snapshot = JSON.stringify(itemsRef.current);
    try {
      const result = await pushShortlist(null, itemsRef.current);
      readyRef.current = true;
      clearPendingShortlistPush();
      applyPushResult(itemsRef, setItems, lastPushedRef, snapshot, result.items);
      safeStorage.setItem(SYNC_CODE_STORAGE_KEY, result.syncCode);
      setSyncCode(result.syncCode);
      setSyncStatus("synced");
    } catch (error) {
      if (error instanceof SyncRateLimitedError) {
        enqueuePendingShortlistPush(null, itemsRef.current);
        scheduleRateLimitRetry(error.retryAfterSec);
        setSyncStatus("synced");
        return;
      }
      if (isRetriableSyncError(error)) {
        enqueuePendingShortlistPush(null, itemsRef.current);
        setSyncStatus("synced");
        return;
      }
      setSyncStatus("error");
      throw error;
    }
  }, [scheduleRateLimitRetry]);

  const link = useCallback(async (code: string) => {
    setSyncStatus("syncing");
    let pushPayload: ShortlistItem[] | null = null;
    try {
      const cloud = await pullShortlist(code);
      const mergedItems = mergeFromCloud(itemsRef.current, cloud);
      const mergedSnapshot = JSON.stringify(mergedItems);
      pushPayload = mergeShortlists(itemsRef.current, cloud);
      applyItems(itemsRef, setItems, mergedItems);
      const result = await pushShortlist(code, pushPayload);
      readyRef.current = true;
      clearPendingShortlistPush();
      lastPushedRef.current = JSON.stringify(result.items);
      if (JSON.stringify(itemsRef.current) === mergedSnapshot) {
        const nextItems = mergeFromCloud(itemsRef.current, result.items);
        if (nextItems !== itemsRef.current) {
          applyItems(itemsRef, setItems, nextItems);
        }
      }
      safeStorage.setItem(SYNC_CODE_STORAGE_KEY, code);
      setSyncCode(code);
      setSyncStatus("synced");
    } catch (error) {
      if (pushPayload !== null) {
        if (error instanceof SyncRateLimitedError) {
          enqueuePendingShortlistPush(code, pushPayload);
          readyRef.current = true;
          safeStorage.setItem(SYNC_CODE_STORAGE_KEY, code);
          setSyncCode(code);
          scheduleRateLimitRetry(error.retryAfterSec);
          setSyncStatus("synced");
          return;
        }
        if (isRetriableSyncError(error)) {
          enqueuePendingShortlistPush(code, pushPayload);
          readyRef.current = true;
          safeStorage.setItem(SYNC_CODE_STORAGE_KEY, code);
          setSyncCode(code);
          setSyncStatus("synced");
          return;
        }
      }
      // pushPayload === null means the pull failed before we could establish the
      // link (e.g. offline). Unlike a push failure, there is nothing to queue —
      // we never confirmed the code exists and have no merged payload — so
      // surface the failure to the caller (ShortlistSyncSection shows an error)
      // instead of resolving as if the link succeeded.
      setSyncStatus("error");
      throw error;
    }
  }, [scheduleRateLimitRetry]);

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
