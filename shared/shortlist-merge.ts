import { MAX_SHORTLIST_ITEMS } from "./shortlist-limits";
import type { ShortlistItem } from "./data-types";
import { parseIsoInstantMilliseconds } from "./isoDateTime";

function addedAtMs(iso?: string): number {
  if (!iso) return 0;
  return parseIsoInstantMilliseconds(iso) ?? 0;
}

/**
 * Merge two shortlists into one, deduplicating by `addressKey`.
 *
 * When the same `addressKey` appears in both inputs, the item with the newer
 * `addedAt` (ISO-8601, compared as epoch milliseconds for timezone correctness) wins.
 * On an exact tie the first-seen item is kept (i.e. `a` takes precedence over
 * `b`). The result is ordered newest-first and capped at
 * {@link MAX_SHORTLIST_ITEMS}, keeping the most recently added items when over
 * the cap.
 *
 * Shared by the browser for local/cloud reconciliation. The Worker push
 * handler does a direct overwrite — server-side merging was removed to
 * prevent deleted items from being resurrected.
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
    const itemTime = addedAtMs(item.addedAt);
    const existingTime = addedAtMs(existing.addedAt);
    if (itemTime > existingTime) {
      byKey.set(item.addressKey, item);
    }
  }

  return Array.from(byKey.values())
    .sort((left, right) => {
      const leftTime = addedAtMs(left.addedAt);
      const rightTime = addedAtMs(right.addedAt);
      return rightTime - leftTime;
    })
    .slice(0, MAX_SHORTLIST_ITEMS);
}
