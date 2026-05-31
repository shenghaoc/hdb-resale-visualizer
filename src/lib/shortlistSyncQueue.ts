import { z } from "zod";
import { parseShortlist } from "@/lib/shortlist";
import { safeStorage } from "@/lib/storage";
import type { ShortlistItem } from "@/types/data";

/** localStorage key for a single coalesced pending POST /api/shortlist write. */
export const SHORTLIST_SYNC_QUEUE_KEY = "hdb_resale_sync_queue_v1";

const pendingPushSchema = z.object({
  syncCode: z.string().nullable(),
  items: z.array(z.unknown()),
});

export type PendingShortlistPush = {
  /** `null` means mint a new sync code (enable flow). */
  syncCode: string | null;
  items: ShortlistItem[];
};

/** Read and validate the queued push, if any. */
export function readPendingShortlistPush(): PendingShortlistPush | null {
  const raw = safeStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = pendingPushSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    return {
      syncCode: parsed.data.syncCode,
      items: parseShortlist(parsed.data.items),
    };
  } catch {
    return null;
  }
}

/** Coalesce to the latest items — only the newest snapshot needs to reach D1. */
export function enqueuePendingShortlistPush(syncCode: string | null, items: ShortlistItem[]): void {
  safeStorage.setItem(
    SHORTLIST_SYNC_QUEUE_KEY,
    JSON.stringify({ syncCode, items } satisfies PendingShortlistPush),
  );
}

export function clearPendingShortlistPush(): void {
  safeStorage.removeItem(SHORTLIST_SYNC_QUEUE_KEY);
}

export function hasPendingShortlistPush(): boolean {
  return readPendingShortlistPush() !== null;
}
