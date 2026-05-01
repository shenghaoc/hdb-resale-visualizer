import { describe, expect, it } from "vitest";
import { SHORTLIST_STORAGE_KEY } from "@/lib/constants";
import {
  decodeShortlistFromUrl,
  encodeShortlistForUrl,
  loadShortlist,
  mergeShortlists,
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

  it("merges local and cloud shortlists, prioritizing later additions", () => {
    const local = [
      {
        addressKey: "a",
        notes: "local notes",
        targetPrice: 100,
        addedAt: "2026-04-20T00:00:00.000Z",
      },
      {
        addressKey: "b",
        notes: "only local",
        targetPrice: null,
        addedAt: "2026-04-20T00:00:00.000Z",
      },
    ];
    const cloud = [
      {
        addressKey: "a",
        notes: "cloud notes (later)",
        targetPrice: 200,
        addedAt: "2026-04-21T00:00:00.000Z",
      },
      {
        addressKey: "c",
        notes: "only cloud",
        targetPrice: 300,
        addedAt: "2026-04-21T00:00:00.000Z",
      },
    ];

    const merged = mergeShortlists(local, cloud);

    expect(merged).toHaveLength(3);
    expect(merged.find((i) => i.addressKey === "a")?.notes).toBe("cloud notes (later)");
    expect(merged.find((i) => i.addressKey === "b")?.notes).toBe("only local");
    expect(merged.find((i) => i.addressKey === "c")?.notes).toBe("only cloud");
  });
});
