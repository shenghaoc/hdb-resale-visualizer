import { z } from "zod";
import { MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH, SHORTLIST_STORAGE_KEY } from "@/lib/constants";
import type { ShortlistItem } from "@/types/data";

const shortlistItemSchema = z.object({
  addressKey: z.string(),
  notes: z.string().catch(""),
  targetPrice: z.number().nullable().catch(null),
  addedAt: z.string().min(1).catch(() => new Date(0).toISOString()),
});

const shortlistSchema = z.array(z.unknown()).transform((arr) => {
  return arr
    .map((item) => {
      const parsed = shortlistItemSchema.safeParse(item);
      return parsed.success ? parsed.data : null;
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

export function toggleShortlistItem(items: ShortlistItem[], addressKey: string): ShortlistItem[] {
  const existing = items.find((item) => item.addressKey === addressKey);
  if (existing) {
    return items.filter((item) => item.addressKey !== addressKey);
  }

  return [
    ...items,
    {
      addressKey,
      notes: "",
      targetPrice: null,
      addedAt: new Date().toISOString(),
    },
  ].slice(-4);
}
