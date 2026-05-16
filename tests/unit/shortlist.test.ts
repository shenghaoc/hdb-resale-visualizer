import { describe, expect, it } from "vitest";
import { MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH, SHORTLIST_STORAGE_KEY } from "@/lib/constants";
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

  it("rejects oversized shortlist share payloads", () => {
    const oversizedPayload = "a".repeat(MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH + 1);
    expect(decodeShortlistFromUrl(oversizedPayload)).toEqual([]);
  });

  it("returns empty string when encoding oversized shortlist", () => {
    const createItems = (notesLen: number) => [
      {
        addressKey: "a",
        notes: "a".repeat(notesLen),
        targetPrice: 0,
        addedAt: "",
      },
    ];
    // Case 1: JSON length exceeds limit
    expect(encodeShortlistForUrl(createItems(MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH))).toBe("");
    // Case 2: Encoded length exceeds limit (but JSON length is under)
    expect(encodeShortlistForUrl(createItems(Math.floor(MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH * 0.8)))).toBe("");
  });

  it("returns empty array for invalid payloads", () => {
    expect(decodeShortlistFromUrl("not-base-64!")).toEqual([]);
    expect(decodeShortlistFromUrl(btoa("not-json"))).toEqual([]);
    expect(decodeShortlistFromUrl(btoa(JSON.stringify([{ invalid: "schema" }])))).toEqual([]);
  });

  it("loads both old and new shortlist note formats seamlessly", () => {
    const storage = new Map<string, string>();
    const shim = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    // Old format without new fields
    const oldFormatItem = {
      addressKey: "old-123",
      notes: "Just plain notes",
      targetPrice: null,
      addedAt: "2026-05-16T00:00:00.000Z",
    };

    // New format with some fields
    const newFormatItem = {
      addressKey: "new-456",
      notes: "Also some notes",
      pros: "Near MRT",
      cons: "Noisy",
      renovation: "Needs flooring",
      noise: "Highway nearby",
      transport: "Bus stop downstairs",
      offerCeiling: 800000,
      agentRemarks: "Good deal",
      targetPrice: 780000,
      addedAt: "2026-05-16T00:00:00.000Z",
    };

    storage.set(SHORTLIST_STORAGE_KEY, JSON.stringify([oldFormatItem, newFormatItem]));

    const loaded = loadShortlist(shim);
    expect(loaded).toHaveLength(2);

    // Old item should be normalized with undefined for new fields
    expect(loaded[0]).toEqual({
      ...oldFormatItem,
      pros: undefined,
      cons: undefined,
      renovation: undefined,
      noise: undefined,
      transport: undefined,
      offerCeiling: undefined,
      agentRemarks: undefined,
    });

    // New item should retain its fields
    expect(loaded[1]).toEqual(newFormatItem);
  });
});
