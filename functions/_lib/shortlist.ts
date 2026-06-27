/**
 * Server-side helpers for the opt-in shortlist sync endpoints
 * (functions/api/shortlist/*).
 *
 * Identity model: an anonymous, high-entropy "sync code" is the bearer secret.
 * It is generated here, returned to the client once, and stored client-side.
 * Server-side we persist only the SHA-256 hash of the code and look rows up by
 * that hash — the raw code is never written to D1 and never logged.
 *
 * Data retention: when a user calls `sync.disable()` the localStorage key is
 * cleared but the D1 row is intentionally left in place — there is no DELETE
 * endpoint because the identity model (anonymous bearer secret) has no way to
 * authenticate a removal request. Abandoned rows are purged by the scheduled
 * cleanup in worker/index.ts once `updated_at` exceeds SHORTLIST_RETENTION_DAYS.
 */
import { z } from "zod";
import {
  MAX_ADDED_AT_LENGTH,
  MAX_ADDRESS_KEY_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_SHORTLIST_ITEMS,
  MAX_SYNC_BODY_BYTES,
  SHORTLIST_RETENTION_MS,
  SYNC_CODE_BYTES,
  SYNC_CODE_PATTERN,
} from "../../shared/shortlist-limits";
import type { ShortlistItem } from "../../shared/data-types";

const note = z.string().transform((s) => s.slice(0, MAX_NOTE_LENGTH));

const shortlistDecisionStatuses = [
  "considering",
  "viewing booked",
  "offered",
  "rejected",
  "kiv",
  "dropped",
] as const;

const shortlistItemSchema = z.object({
  addressKey: z.string().min(1).max(MAX_ADDRESS_KEY_LENGTH),
  notes: note.catch(""),
  pros: note.optional().catch(undefined),
  cons: note.optional().catch(undefined),
  renovation: note.optional().catch(undefined),
  noise: note.optional().catch(undefined),
  transport: note.optional().catch(undefined),
  offerCeiling: z.number().finite().optional().catch(undefined),
  suggestedOfferCeiling: z.number().finite().optional().catch(undefined),
  askingPrice: z.number().finite().optional().catch(undefined),
  fairRangeLow: z.number().finite().optional().catch(undefined),
  fairRangeMedian: z.number().finite().optional().catch(undefined),
  fairRangeHigh: z.number().finite().optional().catch(undefined),
  buyerOpeningOffer: z.number().finite().optional().catch(undefined),
  valuationReceived: z.number().finite().optional().catch(undefined),
  estimatedCov: z.number().finite().optional().catch(undefined),
  viewingDate: z.string().optional().catch(undefined),
  decisionStatus: z.enum(shortlistDecisionStatuses).optional().catch(undefined),
  noiseNotes: note.optional().catch(undefined),
  transportNotes: note.optional().catch(undefined),
  buyerNotes: note.optional().catch(undefined),
  agentRemarks: note.optional().catch(undefined),
  targetPrice: z.number().finite().nullable().catch(null),
  addedAt: z
    .string()
    .datetime({ offset: true })
    .max(MAX_ADDED_AT_LENGTH)
    .catch(() => Temporal.Now.instant().toString({ fractionalSecondDigits: 3 })),
});

function normalizeNumber(
  value: number | undefined,
  fallback: number | null | undefined,
): number | undefined {
  if (Number.isFinite(value)) {
    return value;
  }
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }
  return undefined;
}

function normalizeDecisionStatus(
  value: string | undefined,
): (typeof shortlistDecisionStatuses)[number] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.toLowerCase();
  for (const status of shortlistDecisionStatuses) {
    if (status === normalized) {
      return status;
    }
  }
  return undefined;
}

function normalizeShortlistItem(raw: z.infer<typeof shortlistItemSchema>): ShortlistItem {
  const notes = raw.notes ?? "";
  const suggestedOfferCeiling = normalizeNumber(raw.suggestedOfferCeiling, raw.offerCeiling);

  return {
    ...(raw as ShortlistItem),
    notes,
    suggestedOfferCeiling,
    buyerNotes: raw.buyerNotes ?? notes,
    noiseNotes: raw.noiseNotes ?? raw.noise,
    transportNotes: raw.transportNotes ?? raw.transport,
    decisionStatus: normalizeDecisionStatus(raw.decisionStatus),
  };
}

const shortlistItemsSchema = z.array(shortlistItemSchema).max(MAX_SHORTLIST_ITEMS);

/** Validated body of `POST /api/shortlist`. */
export const shortlistPushSchema = z.object({
  syncCode: z.string().regex(SYNC_CODE_PATTERN).optional(),
  items: shortlistItemsSchema,
});

export type ShortlistPushBody = z.infer<typeof shortlistPushSchema>;

/** True when `code` matches the expected sync-code shape. */
export function isValidSyncCode(code: string): boolean {
  return SYNC_CODE_PATTERN.test(code);
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint a fresh, high-entropy, URL-safe sync code (128 bits of entropy). */
export function generateSyncCode(): string {
  const bytes = new Uint8Array(SYNC_CODE_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 hex of a sync code — the only form ever persisted server-side. */
export async function hashSyncCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse a stored `items_json` blob defensively. Invalid entries are dropped
 * rather than throwing, so a single bad row can never 500 a read.
 */
export function parseStoredItems(itemsJson: string): ShortlistItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(itemsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: ShortlistItem[] = [];
  for (const entry of raw) {
    const parsed = shortlistItemSchema.safeParse(entry);
    if (parsed.success) {
      items.push(normalizeShortlistItem(parsed.data));
    }
  }
  return items.slice(0, MAX_SHORTLIST_ITEMS);
}

/**
 * Minimal structural view of the D1 surface the handlers touch. Defined here
 * (rather than depending on the ambient `D1Database`) so the request-free sync
 * logic can be unit-tested with an in-memory fake.
 */
type SyncStatement = {
  bind: (...args: unknown[]) => SyncStatement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<{ meta?: { changes?: number } }>;
};
export type SyncDB = { prepare: (sql: string) => SyncStatement };

export type SyncResult = { status: number; body: Record<string, unknown> };

/**
 * Core logic for `POST /api/shortlist`, decoupled from the Worker request so it
 * is directly testable. `bodyText` is the raw request body.
 */
export async function handleShortlistPush(db: SyncDB, bodyText: string): Promise<SyncResult> {
  if (bodyText.length > MAX_SYNC_BODY_BYTES) {
    return { status: 413, body: { error: "Payload too large" } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const parsed = shortlistPushSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid shortlist payload" } };
  }

  const { syncCode: providedCode, items } = parsed.data;
  const now = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });

  try {
    if (!providedCode) {
      const syncCode = generateSyncCode();
      const codeHash = await hashSyncCode(syncCode);
      await db
        .prepare(
          "INSERT INTO shortlists (code_hash, items_json, updated_at, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(codeHash, JSON.stringify(items), now, now)
        .run();
      return { status: 200, body: { syncCode, items } };
    }

    const codeHash = await hashSyncCode(providedCode);
    const row = await db
      .prepare("SELECT items_json FROM shortlists WHERE code_hash = ?")
      .bind(codeHash)
      .first<{ items_json: string }>();

    if (!row) {
      return { status: 404, body: { error: "Unknown sync code" } };
    }

    // Store the client's items directly — no server-side merge. Merging on
    // the server would resurrect items the client intentionally deleted. The
    // client handles merging when pulling before pushing (hydration/link).
    await db
      .prepare("UPDATE shortlists SET items_json = ?, updated_at = ? WHERE code_hash = ?")
      .bind(JSON.stringify(items), now, codeHash)
      .run();

    return { status: 200, body: { syncCode: providedCode, items } };
  } catch {
    return { status: 500, body: { error: "Shortlist sync failed" } };
  }
}

/**
 * Core logic for `GET /api/shortlist/:syncCode`. A malformed code and a
 * valid-but-missing code both return 404 to avoid leaking which is which.
 */
export async function handleShortlistGet(
  db: SyncDB,
  code: string | undefined,
): Promise<SyncResult> {
  if (!code || !isValidSyncCode(code)) {
    return { status: 404, body: { error: "Unknown sync code" } };
  }

  try {
    const codeHash = await hashSyncCode(code);
    const row = await db
      .prepare("SELECT items_json FROM shortlists WHERE code_hash = ?")
      .bind(codeHash)
      .first<{ items_json: string }>();

    if (!row) {
      return { status: 404, body: { error: "Unknown sync code" } };
    }

    return { status: 200, body: { items: parseStoredItems(row.items_json) } };
  } catch {
    return { status: 500, body: { error: "Shortlist lookup failed" } };
  }
}

/** ISO cutoff for rows eligible for TTL purge at `now`. */
export function shortlistRetentionCutoff(now: Temporal.Instant = Temporal.Now.instant()): string {
  return now.subtract({ milliseconds: SHORTLIST_RETENTION_MS }).toString();
}

/**
 * Delete shortlist rows untouched since before the retention cutoff.
 * Returns the number of rows removed (0 when none match).
 */
export async function purgeStaleShortlists(
  db: SyncDB,
  now: Temporal.Instant = Temporal.Now.instant(),
): Promise<number> {
  const cutoff = shortlistRetentionCutoff(now);
  const pageSize = 1000;
  let total = 0;
  while (true) {
    const result = await db
      .prepare(
        "DELETE FROM shortlists WHERE code_hash IN (SELECT code_hash FROM shortlists WHERE updated_at < ? LIMIT ?)",
      )
      .bind(cutoff, pageSize)
      .run();
    const changes =
      (result as { meta?: { changes?: number } } | null | undefined)?.meta?.changes ?? 0;
    total += changes;
    if (changes < pageSize) break;
  }
  return total;
}
