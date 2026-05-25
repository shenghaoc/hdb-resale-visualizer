import { MAX_SHORTLIST_ITEMS } from "./shortlist-limits";
import type { ShortlistItem } from "./data-types";

/**
 * Merge two shortlists into one, deduplicating by `addressKey`.
 *
 * When the same `addressKey` appears in both inputs, the item with the newer
 * `addedAt` (ISO-8601, compared via Date.parse for timezone correctness) wins.
 * On an exact tie the first-seen item is kept (i.e. `a` takes precedence over
 * `b`). The result is ordered newest-first and capped at
 * {@link MAX_SHORTLIST_ITEMS}, keeping the most recently added items when over
 * the cap.
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
    if (!existing) {
      byKey.set(item.addressKey, item);
      continue;
    }
    const itemTime = item.addedAt ? Date.parse(item.addedAt) : 0;
    const existingTime = existing.addedAt ? Date.parse(existing.addedAt) : 0;
    if (itemTime > existingTime || (!itemTime && !existingTime)) {
      byKey.set(item.addressKey, item);
    }
  }

  return Array.from(byKey.values())
    .sort((left, right) => {
      const leftTime = left.addedAt ? Date.parse(left.addedAt) : 0;
      const rightTime = right.addedAt ? Date.parse(right.addedAt) : 0;
      return rightTime - leftTime;
    })
    .slice(0, MAX_SHORTLIST_ITEMS);
}
