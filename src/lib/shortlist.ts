import { SHORTLIST_STORAGE_KEY } from "@/lib/constants";
import type { ShortlistItem } from "@/types/data";

function isShortlistItem(value: unknown): value is ShortlistItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.addressKey === "string" &&
    typeof record.notes === "string" &&
    (record.targetPrice === null || typeof record.targetPrice === "number") &&
    typeof record.addedAt === "string"
  );
}

export function parseShortlist(raw: unknown): ShortlistItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isShortlistItem);
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
