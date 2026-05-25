/**
 * Server-side helpers for the opt-in shortlist sync endpoints
 * (functions/api/shortlist/*).
 *
 * Identity model: an anonymous, high-entropy "sync code" is the bearer secret.
 * It is generated here, returned to the client once, and stored client-side.
 * Server-side we persist only the SHA-256 hash of the code and look rows up by
 * that hash — the raw code is never written to D1 and never logged.
 */
import { z } from "zod";
import {
  MAX_ADDED_AT_LENGTH,
  MAX_ADDRESS_KEY_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_SHORTLIST_ITEMS,
  MAX_SYNC_BODY_BYTES,
  SYNC_CODE_BYTES,
  SYNC_CODE_PATTERN,
} from "../../shared/shortlist-limits";
import { mergeShortlists } from "../../shared/shortlist-merge";
import type { ShortlistItem } from "../../shared/data-types";

const note = z.string().max(MAX_NOTE_LENGTH);

const shortlistItemSchema = z
  .object({
    addressKey: z.string().min(1).max(MAX_ADDRESS_KEY_LENGTH),
    notes: note,
    pros: note.optional(),
    cons: note.optional(),
    renovation: note.optional(),
    noise: note.optional(),
    transport: note.optional(),
    offerCeiling: z.number().finite().optional(),
    agentRemarks: note.optional(),
    targetPrice: z.number().finite().nullable(),
    addedAt: z.string().min(1).max(MAX_ADDED_AT_LENGTH),
  })
  .strip();

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
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
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
      items.push(parsed.data);
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
  run: () => Promise<unknown>;
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
  const now = new Date().toISOString();

  try {
    if (!providedCode) {
      const syncCode = generateSyncCode();
      const codeHash = await hashSyncCode(syncCode);
      const merged = mergeShortlists(items, []);
      await db
        .prepare("INSERT INTO shortlists (code_hash, items_json, updated_at) VALUES (?, ?, ?)")
        .bind(codeHash, JSON.stringify(merged), now)
        .run();
      return { status: 200, body: { syncCode, items: merged } };
    }

    const codeHash = await hashSyncCode(providedCode);
    const row = await db
      .prepare("SELECT items_json FROM shortlists WHERE code_hash = ?")
      .bind(codeHash)
      .first<{ items_json: string }>();

    if (!row) {
      return { status: 404, body: { error: "Unknown sync code" } };
    }

    const merged = mergeShortlists(items, parseStoredItems(row.items_json));
    await db
      .prepare("UPDATE shortlists SET items_json = ?, updated_at = ? WHERE code_hash = ?")
      .bind(JSON.stringify(merged), now, codeHash)
      .run();

    return { status: 200, body: { syncCode: providedCode, items: merged } };
  } catch {
    return { status: 500, body: { error: "Shortlist sync failed" } };
  }
}

/**
 * Core logic for `GET /api/shortlist/:syncCode`. A malformed code and a
 * valid-but-missing code both return 404 to avoid leaking which is which.
 */
export async function handleShortlistGet(db: SyncDB, code: string | undefined): Promise<SyncResult> {
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
