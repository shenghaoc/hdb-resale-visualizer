import { z } from "zod";
import {
  MAX_SHORTLIST_ITEMS,
  MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH,
  SHORTLIST_STORAGE_KEY,
} from "../../shared/lib/constants";
import { MAX_ADDRESS_KEY_LENGTH, MAX_NOTE_LENGTH } from "@shared/shortlist-limits";
import type { ShortlistItem } from "@/types/data";

export { mergeShortlists } from "@shared/shortlist-merge";

const shortlistDecisionStatuses = [
  "considering",
  "viewing booked",
  "offered",
  "rejected",
  "kiv",
  "dropped",
] as const;

const note = z.string().transform((s) => s.slice(0, MAX_NOTE_LENGTH));

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
    .min(1)
    .catch(() => new Date(0).toISOString()),
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

  const lower = value.toLowerCase();
  for (const status of shortlistDecisionStatuses) {
    if (status === lower) {
      return status;
    }
  }
  return undefined;
}

function normalizeShortlistItem(raw: z.infer<typeof shortlistItemSchema>): ShortlistItem {
  const notes = raw.notes ?? "";
  const suggestedOfferCeiling = normalizeNumber(raw.suggestedOfferCeiling, raw.offerCeiling);
  const buyerNotes = raw.buyerNotes ?? notes;
  const noiseNotes = raw.noiseNotes ?? raw.noise;
  const transportNotes = raw.transportNotes ?? raw.transport;

  return {
    ...raw,
    notes,
    suggestedOfferCeiling,
    buyerNotes,
    noiseNotes,
    transportNotes,
    decisionStatus: normalizeDecisionStatus(raw.decisionStatus),
  };
}

const shortlistSchema = z.array(z.unknown()).transform((arr) => {
  return arr
    .map((item) => {
      const parsed = shortlistItemSchema.safeParse(item);
      return parsed.success ? normalizeShortlistItem(parsed.data) : null;
    })
    .filter((item): item is ShortlistItem => item !== null);
});

export function parseShortlist(raw: unknown): ShortlistItem[] {
  const parsed = shortlistSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return [];
}

function bytesToBase64(bytes: Uint8Array) {
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(parts.join(""));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function encodeShortlistForUrl(items: ShortlistItem[]) {
  const json = JSON.stringify(items);
  if (json.length > MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH) {
    return "";
  }
  const encoded = bytesToBase64(new TextEncoder().encode(json));
  if (encoded.length > MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH) {
    return "";
  }
  return encoded;
}

export function decodeShortlistFromUrl(value: string) {
  if (value.length > MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH) {
    return [];
  }

  try {
    const decoded = new TextDecoder().decode(base64ToBytes(value));
    const parsed: unknown = JSON.parse(decoded);
    return parseShortlist(parsed);
  } catch {
    try {
      const parsed: unknown = JSON.parse(atob(value));
      return parseShortlist(parsed);
    } catch {
      return [];
    }
  }
}

export function loadShortlist(storage: Pick<Storage, "getItem">): ShortlistItem[] {
  const value = storage.getItem(SHORTLIST_STORAGE_KEY);
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return parseShortlist(parsed);
  } catch {
    return [];
  }
}

export function saveShortlist(storage: Pick<Storage, "setItem">, items: ShortlistItem[]) {
  storage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(items));
}

export function mergeImportedShortlistItems(
  existingItems: ShortlistItem[],
  importedItems: ShortlistItem[],
): ShortlistItem[] {
  const existingAddressKeys = new Set(existingItems.map((item) => item.addressKey));
  const mergedItems = [...existingItems];

  for (const item of importedItems) {
    if (mergedItems.length >= MAX_SHORTLIST_ITEMS) {
      break;
    }
    if (existingAddressKeys.has(item.addressKey)) {
      continue;
    }

    mergedItems.push(item);
    existingAddressKeys.add(item.addressKey);
  }

  return mergedItems;
}

export function toggleShortlistItem(items: ShortlistItem[], addressKey: string): ShortlistItem[] {
  const existing = items.find((item) => item.addressKey === addressKey);
  if (existing) {
    return items.filter((item) => item.addressKey !== addressKey);
  }

  // Refuse to add when at capacity instead of silently dropping the oldest item.
  if (items.length >= MAX_SHORTLIST_ITEMS) {
    return items;
  }

  return [
    ...items,
    {
      addressKey,
      notes: "",
      targetPrice: null,
      addedAt: new Date().toISOString(),
    },
  ];
}

export function restoreShortlistItem(
  items: ShortlistItem[],
  item: ShortlistItem,
  index = items.length,
): ShortlistItem[] {
  if (
    items.length >= MAX_SHORTLIST_ITEMS ||
    items.some((current) => current.addressKey === item.addressKey)
  ) {
    return items;
  }

  const insertionIndex = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, insertionIndex), item, ...items.slice(insertionIndex)];
}

/**
 * Patch a single shortlist item by address key.
 * Normalizes empty legacy free-text fields to `undefined` so they omit from JSON.
 */
export function updateShortlistItem(
  items: ShortlistItem[],
  addressKey: string,
  patch: Partial<ShortlistItem>,
): ShortlistItem[] {
  return items.map((item) => {
    if (item.addressKey !== addressKey) return item;
    const next = { ...item, ...patch };

    // Normalize empty strings and nulls to undefined to omit them from JSON serialization,
    // reducing the footprint in localStorage and shared URL payloads.
    if (next.pros === "") next.pros = undefined;
    if (next.cons === "") next.cons = undefined;
    if (next.renovation === "") next.renovation = undefined;
    if (next.noise === "") next.noise = undefined;
    if (next.transport === "") next.transport = undefined;
    if (next.agentRemarks === "") next.agentRemarks = undefined;

    return next;
  });
}
