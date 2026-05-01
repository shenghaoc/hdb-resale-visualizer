import { useCallback, useEffect, useMemo, useState } from "react";
import { hasCloudSyncConfig, pullShortlistFromCloud, signInWithPassword, syncShortlistToCloud, type AuthSession } from "@/lib/cloudSync";
import {
  decodeShortlistFromUrl,
  loadShortlist,
  mergeShortlists,
  saveShortlist,
  toggleShortlistItem,
} from "@/lib/shortlist";
import type { ShortlistItem } from "@/types/data";
import { safeStorage } from "@/lib/storage";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string>("Local only");
  const [initialState] = useState(readInitialShortlist);
  const [items, setItems] = useState<ShortlistItem[]>(initialState.items);
  const debouncedItems = useDebouncedValue(items, 1000);

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

  useEffect(() => {
    if (!session) {
      return;
    }

    void syncShortlistToCloud(session, debouncedItems)
      .then(() => setCloudStatus("Synced to cloud"))
      .catch((error) =>
        setCloudStatus(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`),
      );
  }, [debouncedItems, session]);

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

  const signIn = useCallback(async (email: string, password: string) => {
    const nextSession = await signInWithPassword(email, password);
    setSession(nextSession);
    const cloud = await pullShortlistFromCloud(nextSession);
    const merged = mergeShortlists(items, cloud ?? []);

    setItems(merged);
    await syncShortlistToCloud(nextSession, merged);
    setCloudStatus(`Connected as ${nextSession.email}`);
  }, [items]);

  const signOut = useCallback(() => {
    setSession(null);
    setCloudStatus("Local only");
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
      signIn,
      signOut,
      session,
      cloudStatus,
      hasCloudSyncConfig,
    }),
    [items, toggle, update, has, signIn, signOut, session, cloudStatus],
  );
}
