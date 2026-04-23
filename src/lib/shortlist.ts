import { SHORTLIST_STORAGE_KEY } from "@/lib/constants";
import type { ShortlistItem } from "@/types/data";

type LegacyShortlistItem = {
  addressKey: string;
  notes?: unknown;
  targetPrice?: unknown;
  addedAt?: unknown;
};

function isLegacyShortlistItem(value: unknown): value is LegacyShortlistItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.addressKey === "string";
}

export function parseShortlist(raw: unknown): ShortlistItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isLegacyShortlistItem)
    .map((item) => ({
      addressKey: item.addressKey,
      notes: typeof item.notes === "string" ? item.notes : "",
      targetPrice: typeof item.targetPrice === "number" ? item.targetPrice : null,
      addedAt:
        typeof item.addedAt === "string" && item.addedAt.length > 0
          ? item.addedAt
          : new Date(0).toISOString(),
    }));
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function encodeShortlistForUrl(items: ShortlistItem[]) {
  const json = JSON.stringify(items);
  return bytesToBase64(new TextEncoder().encode(json));
}

export function decodeShortlistFromUrl(value: string) {
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
