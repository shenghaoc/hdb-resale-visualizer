import { useMemo } from "react";
import { useLocalShortlist } from "@/features/shortlist/useLocalShortlist";
import { useShortlistSync } from "@/features/shortlist/useShortlistSync";

export type { ShortlistSync, SyncStatus } from "@/features/shortlist/useShortlistSync";

/**
 * Public shortlist hook: composes browser-local store with cloud-sync
 * orchestration. Public surface is unchanged from the pre-extraction API.
 */
export function useShortlist() {
  const local = useLocalShortlist();

  const sync = useShortlistSync({
    items: local.items,
    itemsRef: local.itemsRef,
    replaceItems: local.replaceItems,
  });

  return useMemo(
    () => ({
      items: local.items,
      isFull: local.isFull,
      toggle: local.toggle,
      restore: local.restore,
      update: local.update,
      has: local.has,
      sync,
    }),
    [local.items, local.isFull, local.toggle, local.restore, local.update, local.has, sync],
  );
}
