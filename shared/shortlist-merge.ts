import { MAX_SHORTLIST_ITEMS } from "./shortlist-limits";
import type { ShortlistItem } from "./data-types";

/**
 * Merge two shortlists into one, deduplicating by `addressKey`.
 *
 * When the same `addressKey` appears in both inputs, the item with the newer
 * `addedAt` (ISO-8601, lexicographically comparable) wins. On an exact tie the
 * first-seen item is kept (i.e. `a` takes precedence over `b`). The result is
 * ordered newest-first and capped at {@link MAX_SHORTLIST_ITEMS}, keeping the
 * most recently added items when over the cap.
 *
 * Shared by the browser (local/cloud reconciliation) and the Worker
 * (server-side merge of an incoming push with the stored row).
 */
export function mergeShortlists(a: ShortlistItem[], b: ShortlistItem[]): ShortlistItem[] {
  const byKey = new Map<string, ShortlistItem>();

  for (const item of a) {
    byKey.set(item.addressKey, item);
  }

  for (const item of b) {
    const existing = byKey.get(item.addressKey);
    if (!existing || item.addedAt > existing.addedAt) {
      byKey.set(item.addressKey, item);
    }
  }

  return Array.from(byKey.values())
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    .slice(0, MAX_SHORTLIST_ITEMS);
}
