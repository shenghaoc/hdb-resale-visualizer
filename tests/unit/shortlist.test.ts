import { describe, expect, it } from "vite-plus/test";
import {
  MAX_SHORTLIST_ITEMS,
  MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH,
  SHORTLIST_STORAGE_KEY,
} from "@/shared/lib/constants";
import { MAX_NOTE_LENGTH } from "@shared/shortlist-limits";
import {
  decodeShortlistFromUrl,
  encodeShortlistForUrl,
  loadShortlist,
  mergeImportedShortlistItems,
  restoreShortlistItem,
  saveShortlist,
  toggleShortlistItem,
} from "@/features/shortlist/shortlist";

describe("shortlist storage", () => {
  it("restores the exact item at a bounded original position", () => {
    const item = {
      addressKey: "restored",
      notes: "keep",
      buyerNotes: "exact buyer notes",
      askingPrice: 612345,
      targetPrice: 600000,
      addedAt: "2026-07-18T00:00:00.000Z",
    };
    const existing = [
      {
        addressKey: "existing",
        notes: "",
        targetPrice: null,
        addedAt: "2026-07-17T00:00:00.000Z",
      },
    ];

    const restored = restoreShortlistItem(existing, item, -10);

    expect(restored.map((entry) => entry.addressKey)).toEqual(["restored", "existing"]);
    expect(restored[0]).toBe(item);
  });

  it("does not duplicate an item or exceed the shortlist capacity while restoring", () => {
    const items = Array.from({ length: MAX_SHORTLIST_ITEMS }, (_, index) => ({
      addressKey: `saved-${index}`,
      notes: "",
      targetPrice: null,
      addedAt: "2026-07-17T00:00:00.000Z",
    }));

    expect(restoreShortlistItem(items, items[0]!, 0)).toBe(items);
    expect(
      restoreShortlistItem(
        items,
        {
          addressKey: "overflow",
          notes: "",
          targetPrice: null,
          addedAt: "2026-07-18T00:00:00.000Z",
        },
        0,
      ),
    ).toBe(items);
  });

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
    const decoded = decodeShortlistFromUrl(encoded);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      addressKey: items[0]?.addressKey,
      notes: items[0]?.notes,
      targetPrice: 800000,
      addedAt: items[0]?.addedAt,
      buyerNotes: items[0]?.notes,
    });
    expect(decoded[0]?.askingPrice).toBeUndefined();
    expect(decoded[0]?.buyerOpeningOffer).toBeUndefined();
    expect(decoded[0]?.suggestedOfferCeiling).toBeUndefined();
  });

  it("round-trips mixed legacy and migrated payloads through share links", () => {
    const items = [
      {
        addressKey: "legacy-1",
        notes: "Legacy format",
        targetPrice: 800000,
        addedAt: "2026-06-01T00:00:00.000Z",
        offerCeiling: 820000,
      },
      {
        addressKey: "new-2",
        notes: "Modern format",
        targetPrice: 760000,
        askingPrice: 770000,
        fairRangeLow: 700000,
        fairRangeMedian: 740000,
        fairRangeHigh: 780000,
        suggestedOfferCeiling: 785000,
        buyerOpeningOffer: 775000,
        valuationReceived: 745000,
        estimatedCov: 680000,
        viewingDate: "2026-05-20",
        decisionStatus: "offered" as const,
        buyerNotes: "Great offer already sent",
        addedAt: "2026-06-01T00:00:00.000Z",
      },
    ];

    const encoded = encodeShortlistForUrl(items);
    const decoded = decodeShortlistFromUrl(encoded);

    expect(decoded).toHaveLength(2);
    expect(decoded[0]?.askingPrice).toBeUndefined();
    expect(decoded[0]?.suggestedOfferCeiling).toBe(820000);
    expect(decoded[1]?.buyerOpeningOffer).toBe(775000);
    expect(decoded[1]?.fairRangeMedian).toBe(740000);
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
    expect(
      encodeShortlistForUrl(createItems(Math.floor(MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH * 0.8))),
    ).toBe("");
  });

  it("returns empty array for invalid payloads", () => {
    expect(decodeShortlistFromUrl("not-base-64!")).toEqual([]);
    expect(decodeShortlistFromUrl(btoa("not-json"))).toEqual([]);
    expect(decodeShortlistFromUrl(btoa(JSON.stringify([{ invalid: "schema" }])))).toEqual([]);
  });

  it("caps imported shortlist entries without dropping existing saved entries", () => {
    const existing = Array.from({ length: 19 }, (_, index) => ({
      addressKey: `saved-${index}`,
      notes: "",
      targetPrice: null,
      addedAt: "2026-01-01T00:00:00.000Z",
    }));
    const imported = [
      {
        addressKey: "saved-0",
        notes: "duplicate",
        targetPrice: null,
        addedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        addressKey: "imported-1",
        notes: "",
        targetPrice: null,
        addedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        addressKey: "imported-2",
        notes: "",
        targetPrice: null,
        addedAt: "2026-01-04T00:00:00.000Z",
      },
    ];

    const merged = mergeImportedShortlistItems(existing, imported);

    expect(merged).toHaveLength(20);
    expect(merged.slice(0, 19)).toEqual(existing);
    expect(merged[19]?.addressKey).toBe("imported-1");
    expect(merged.some((item) => item.addressKey === "imported-2")).toBe(false);
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

    expect(loaded[0]).toMatchObject({
      ...oldFormatItem,
      buyerNotes: oldFormatItem.notes,
    });
    expect(loaded[0].askingPrice).toBeUndefined();
    expect(loaded[0].fairRangeLow).toBeUndefined();
    expect(loaded[0].fairRangeMedian).toBeUndefined();
    expect(loaded[0].fairRangeHigh).toBeUndefined();
    expect(loaded[0].suggestedOfferCeiling).toBeUndefined();
    expect(loaded[0].buyerOpeningOffer).toBeUndefined();
    expect(loaded[0].valuationReceived).toBeUndefined();
    expect(loaded[0].estimatedCov).toBeUndefined();
    expect(loaded[0].viewingDate).toBeUndefined();
    expect(loaded[0].decisionStatus).toBeUndefined();
    expect(loaded[0].pros).toBeUndefined();
    expect(loaded[0].cons).toBeUndefined();
    expect(loaded[0].renovation).toBeUndefined();
    expect(loaded[0].noise).toBeUndefined();
    expect(loaded[0].transport).toBeUndefined();
    expect(loaded[0].offerCeiling).toBeUndefined();
    expect(loaded[0].noiseNotes).toBeUndefined();
    expect(loaded[0].transportNotes).toBeUndefined();
    expect(loaded[0].agentRemarks).toBeUndefined();

    // New item should retain its fields
    expect(loaded[1]).toMatchObject({
      ...newFormatItem,
      buyerNotes: newFormatItem.notes,
      noiseNotes: newFormatItem.noise,
      transportNotes: newFormatItem.transport,
    });
  });

  it("migrates legacy offer fields into the offer-board model", () => {
    const storage = new Map<string, string>();
    const shim = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    const legacyItem = {
      addressKey: "legacy-offer",
      notes: "Legacy shortlist",
      offerCeiling: 820000,
      targetPrice: 800000,
      addedAt: "2026-05-16T00:00:00.000Z",
    };

    storage.set(SHORTLIST_STORAGE_KEY, JSON.stringify([legacyItem]));
    const [loaded] = loadShortlist(shim);

    expect(loaded?.askingPrice).toBeUndefined();
    expect(loaded?.suggestedOfferCeiling).toBe(820000);
    expect(loaded?.buyerOpeningOffer).toBeUndefined();
    expect(loaded?.buyerNotes).toBe("Legacy shortlist");
  });

  it("drops malformed shortlist entries but keeps valid legacy/new items", () => {
    const storage = new Map<string, string>();
    const shim = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    storage.set(
      SHORTLIST_STORAGE_KEY,
      JSON.stringify([
        { addressKey: "", targetPrice: 800000, addedAt: "2026-05-16T00:00:00.000Z" },
        {
          addressKey: "good-old",
          notes: "Good legacy",
          targetPrice: 780000,
          addedAt: "2026-05-16T00:00:00.000Z",
        },
      ]),
    );

    const loaded = loadShortlist(shim);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.addressKey).toBe("good-old");
    expect(loaded[0]?.buyerOpeningOffer).toBeUndefined();
  });

  it("truncates oversized notes instead of erasing them", () => {
    const storage = new Map<string, string>();
    const shim = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    const longNote = "x".repeat(MAX_NOTE_LENGTH + 500);
    storage.set(
      SHORTLIST_STORAGE_KEY,
      JSON.stringify([
        {
          addressKey: "long-note",
          notes: longNote,
          buyerNotes: longNote,
          targetPrice: null,
          addedAt: "2026-06-01T00:00:00.000Z",
        },
      ]),
    );

    const loaded = loadShortlist(shim);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.notes).toHaveLength(MAX_NOTE_LENGTH);
    expect(loaded[0]?.buyerNotes).toHaveLength(MAX_NOTE_LENGTH);
  });
});
