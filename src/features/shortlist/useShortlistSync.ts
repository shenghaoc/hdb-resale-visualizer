import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { SYNC_CODE_STORAGE_KEY } from "@/shared/lib/constants";
import { mergeShortlists } from "@/features/shortlist/shortlist";
import {
  isRetriableSyncError,
  SyncCodeNotFoundError,
  SyncRateLimitedError,
  pullShortlist,
  pushShortlist,
} from "@/features/shortlist/cloudSync";
import {
  clearPendingShortlistPush,
  enqueuePendingShortlistPush,
  hasPendingShortlistPush,
  readPendingShortlistPush,
} from "@/features/shortlist/shortlistSyncQueue";
import type { ShortlistItem } from "@/types/data";
import { safeStorage } from "@/shared/lib/storage";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const SYNC_DEBOUNCE_MS = 1000;

/** Merge cloud items into local state without redundant re-renders. */
function mergeFromCloud(current: ShortlistItem[], cloud: ShortlistItem[]): ShortlistItem[] {
  const next = mergeShortlists(current, cloud);
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

function applyPushResult(
  itemsRef: MutableRefObject<ShortlistItem[]>,
  replaceItems: (items: ShortlistItem[]) => void,
  lastPushedRef: MutableRefObject<string | null>,
  snapshot: string,
  resultItems: ShortlistItem[],
): void {
  lastPushedRef.current = JSON.stringify(resultItems);
  if (JSON.stringify(itemsRef.current) === snapshot) {
    const nextItems = mergeFromCloud(itemsRef.current, resultItems);
    if (nextItems !== itemsRef.current) {
      replaceItems(nextItems);
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

export type UseShortlistSyncOptions = {
  items: ShortlistItem[];
  itemsRef: MutableRefObject<ShortlistItem[]>;
  replaceItems: (items: ShortlistItem[]) => void;
};

/**
 * Cloud-sync state machine for the shortlist: hydration, enable/link/disable,
 * debounced pushes, offline queue, and rate-limit retry.
 *
 * Feature-internal; public consumers use `useShortlist`, which composes this
 * with `useLocalShortlist`.
 */
export function useShortlistSync({
  items,
  itemsRef,
  replaceItems,
}: UseShortlistSyncOptions): ShortlistSync {
  const [syncCode, setSyncCode] = useState<string | null>(() =>
    safeStorage.getItem(SYNC_CODE_STORAGE_KEY),
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (syncCode ? "syncing" : "local"));
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
        applyPushResult(itemsRef, replaceItems, lastPushedRef, flushedSnapshot, result.items);
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
  }, [dropSyncCode, itemsRef, replaceItems, scheduleRateLimitRetry]);

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
        replaceItems(mergedItems);
        const result = await pushShortlist(syncCode, pushPayload);
        if (cancelled) return;
        readyRef.current = true;
        clearPendingShortlistPush();
        lastPushedRef.current = JSON.stringify(result.items);
        if (JSON.stringify(itemsRef.current) === mergedSnapshot) {
          const nextItems = mergeFromCloud(itemsRef.current, result.items);
          if (nextItems !== itemsRef.current) {
            replaceItems(nextItems);
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
  }, [syncCode, dropSyncCode, hydrationKey, itemsRef, replaceItems, scheduleRateLimitRetry]);

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
        applyPushResult(itemsRef, replaceItems, lastPushedRef, snapshot, result.items);
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
  }, [debouncedItems, syncCode, dropSyncCode, itemsRef, replaceItems, scheduleRateLimitRetry]);

  const enable = useCallback(async () => {
    setSyncStatus("syncing");
    const snapshot = JSON.stringify(itemsRef.current);
    try {
      const result = await pushShortlist(null, itemsRef.current);
      readyRef.current = true;
      clearPendingShortlistPush();
      applyPushResult(itemsRef, replaceItems, lastPushedRef, snapshot, result.items);
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
  }, [itemsRef, replaceItems, scheduleRateLimitRetry]);

  const link = useCallback(
    async (code: string) => {
      setSyncStatus("syncing");
      let pushPayload: ShortlistItem[] | null = null;
      try {
        const cloud = await pullShortlist(code);
        const mergedItems = mergeFromCloud(itemsRef.current, cloud);
        const mergedSnapshot = JSON.stringify(mergedItems);
        pushPayload = mergeShortlists(itemsRef.current, cloud);
        replaceItems(mergedItems);
        const result = await pushShortlist(code, pushPayload);
        readyRef.current = true;
        clearPendingShortlistPush();
        lastPushedRef.current = JSON.stringify(result.items);
        if (JSON.stringify(itemsRef.current) === mergedSnapshot) {
          const nextItems = mergeFromCloud(itemsRef.current, result.items);
          if (nextItems !== itemsRef.current) {
            replaceItems(nextItems);
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
    },
    [itemsRef, replaceItems, scheduleRateLimitRetry],
  );

  const disable = useCallback(() => {
    dropSyncCode("local");
  }, [dropSyncCode]);

  return useMemo<ShortlistSync>(
    () => ({ code: syncCode, status: syncStatus, enable, link, disable }),
    [syncCode, syncStatus, enable, link, disable],
  );
}
