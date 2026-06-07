import { z } from "zod";
import { parseShortlist } from "@/features/shortlist/shortlist";
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

/**
 * Cheap presence check for the queue gate — avoids the JSON parse + Zod
 * validation of {@link readPendingShortlistPush}. Callers that act on a hit
 * (e.g. `flushPendingPush`) re-read and re-validate before using the payload,
 * so a corrupt entry here only costs a no-op flush attempt.
 */
export function hasPendingShortlistPush(): boolean {
  return safeStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY) !== null;
}
