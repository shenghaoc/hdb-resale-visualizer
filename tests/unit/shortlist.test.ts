import { describe, expect, it } from "vitest";
import { SHORTLIST_STORAGE_KEY } from "@/lib/constants";
import {
  decodeShortlistFromUrl,
  encodeShortlistForUrl,
  loadShortlist,
  saveShortlist,
  toggleShortlistItem,
} from "@/lib/shortlist";

describe("shortlist storage", () => {
  it("loads and saves shortlist entries", () => {
    const storage = new Map<string, string>();
    const shim = {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    };

    const next = toggleShortlistItem([], "abc-123");
    saveShortlist(shim, next);

    expect(storage.has(SHORTLIST_STORAGE_KEY)).toBe(true);
    expect(loadShortlist(shim)).toHaveLength(1);
    expect(loadShortlist(shim)[0]?.addressKey).toBe("abc-123");
  });

  it("round-trips unicode notes through share links", () => {
    const items = [
      {
        addressKey: "abc-123",
        notes: "近地铁 🚇 and bright unit",
        targetPrice: 800000,
        addedAt: "2026-04-20T00:00:00.000Z",
      },
    ];

    const encoded = encodeShortlistForUrl(items);
    expect(decodeShortlistFromUrl(encoded)).toEqual(items);
  });
});
