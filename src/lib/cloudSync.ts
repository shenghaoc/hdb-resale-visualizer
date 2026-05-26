import { API_BASE_PATH } from "@/lib/constants";
import { parseShortlist } from "@/lib/shortlist";
import type { ShortlistItem } from "@/types/data";

/**
 * Client for the opt-in shortlist cloud-sync API (same-origin Worker, no CORS).
 * All responses are validated through {@link parseShortlist} so untrusted
 * network data never reaches the rest of the app unchecked.
 */
const SHORTLIST_ENDPOINT = `${API_BASE_PATH}/shortlist`;

/** Thrown when a sync code is unknown (HTTP 404) so callers can drop it. */
export class SyncCodeNotFoundError extends Error {
  constructor() {
    super("Unknown sync code");
    this.name = "SyncCodeNotFoundError";
  }
}

type PushResult = { syncCode: string; items: ShortlistItem[] };

/**
 * Push items to the cloud. With no `syncCode` the server mints one; with a
 * code it merges into the stored row. Returns the server's merged set.
 */
export async function pushShortlist(
  syncCode: string | null,
  items: ShortlistItem[],
): Promise<PushResult> {
  const response = await fetch(SHORTLIST_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(syncCode ? { syncCode, items } : { items }),
  });

  if (response.status === 404) {
    throw new SyncCodeNotFoundError();
  }
  if (!response.ok) {
    throw new Error(`Sync failed (${response.status})`);
  }

  const data = (await response.json()) as { syncCode?: unknown };
  const code = typeof data.syncCode === "string" ? data.syncCode : syncCode;
  if (!code) {
    throw new Error("Sync response missing code");
  }
  return { syncCode: code, items: parseShortlist((data as { items?: unknown }).items) };
}

/** Fetch the shortlist stored for a sync code. Throws if the code is unknown. */
export async function pullShortlist(syncCode: string): Promise<ShortlistItem[]> {
  const response = await fetch(`${SHORTLIST_ENDPOINT}/${encodeURIComponent(syncCode)}`, {
    headers: { accept: "application/json" },
  });

  if (response.status === 404) {
    throw new SyncCodeNotFoundError();
  }
  if (!response.ok) {
    throw new Error(`Sync failed (${response.status})`);
  }

  const data = (await response.json()) as { items?: unknown };
  return parseShortlist(data.items);
}
