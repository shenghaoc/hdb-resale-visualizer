import { describe, expect, it } from "vitest";
import {
  generateSyncCode,
  hashSyncCode,
  isValidSyncCode,
  parseStoredItems,
  shortlistPushSchema,
} from "../../functions/_lib/shortlist";
import { MAX_NOTE_LENGTH, MAX_SHORTLIST_ITEMS } from "../../shared/shortlist-limits";

function validItem(addressKey: string, addedAt = "2026-04-20T00:00:00.000Z") {
  return { addressKey, notes: "", targetPrice: null, addedAt };
}

describe("generateSyncCode", () => {
  it("produces a URL-safe code of the expected shape", () => {
    const code = generateSyncCode();
    expect(isValidSyncCode(code)).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code).toHaveLength(22); // 16 random bytes → base64url without padding
  });

  it("is effectively unique across many draws", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateSyncCode()));
    expect(codes.size).toBe(1000);
  });
});

describe("hashSyncCode", () => {
  it("is a deterministic 64-char hex digest", async () => {
    const hash = await hashSyncCode("abc123abc123abc1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashSyncCode("abc123abc123abc1")).toBe(hash);
  });

  it("differs for different codes", async () => {
    expect(await hashSyncCode("abc123abc123abc1")).not.toBe(await hashSyncCode("abc123abc123abc2"));
  });
});

describe("isValidSyncCode", () => {
  it("rejects malformed codes", () => {
    expect(isValidSyncCode("short")).toBe(false);
    expect(isValidSyncCode("has spaces here now")).toBe(false);
    expect(isValidSyncCode("has/slash/in/it/x")).toBe(false);
    expect(isValidSyncCode("x".repeat(200))).toBe(false);
  });
});

describe("shortlistPushSchema", () => {
  it("accepts a valid payload with and without a sync code", () => {
    expect(shortlistPushSchema.safeParse({ items: [validItem("a")] }).success).toBe(true);
    expect(
      shortlistPushSchema.safeParse({ syncCode: generateSyncCode(), items: [validItem("a")] }).success,
    ).toBe(true);
  });

  it("strips unknown item keys", () => {
    const parsed = shortlistPushSchema.parse({
      items: [{ ...validItem("a"), evil: "<script>", extra: 1 }],
    });
    expect(parsed.items[0]).not.toHaveProperty("evil");
    expect(parsed.items[0]).not.toHaveProperty("extra");
  });

  it("rejects more than MAX_SHORTLIST_ITEMS", () => {
    const items = Array.from({ length: MAX_SHORTLIST_ITEMS + 1 }, (_, i) => validItem(`k${i}`));
    expect(shortlistPushSchema.safeParse({ items }).success).toBe(false);
  });

  it("catches an oversized note instead of rejecting the item", () => {
    const items = [{ ...validItem("a"), notes: "x".repeat(MAX_NOTE_LENGTH + 1) }];
    const parsed = shortlistPushSchema.safeParse({ items });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0].notes).toBe("");
    }
  });

  it("rejects an empty addressKey and a malformed sync code", () => {
    expect(shortlistPushSchema.safeParse({ items: [validItem("")] }).success).toBe(false);
    expect(
      shortlistPushSchema.safeParse({ syncCode: "bad code", items: [validItem("a")] }).success,
    ).toBe(false);
  });
});

describe("parseStoredItems", () => {
  it("returns [] for invalid JSON or non-arrays", () => {
    expect(parseStoredItems("not json")).toEqual([]);
    expect(parseStoredItems('{"not":"array"}')).toEqual([]);
  });

  it("drops invalid entries but keeps valid ones", () => {
    const json = JSON.stringify([validItem("a"), { addressKey: 123 }, validItem("b")]);
    expect(parseStoredItems(json).map((i) => i.addressKey)).toEqual(["a", "b"]);
  });

  it("caps the stored list at MAX_SHORTLIST_ITEMS", () => {
    const json = JSON.stringify(
      Array.from({ length: MAX_SHORTLIST_ITEMS + 3 }, (_, i) => validItem(`k${i}`)),
    );
    expect(parseStoredItems(json)).toHaveLength(MAX_SHORTLIST_ITEMS);
  });

  it("migrates legacy offer-ceiling fields when parsing synced payloads", () => {
    const payload = {
      ...validItem("legacy-offer"),
      offerCeiling: 840000,
      targetPrice: 810000,
      notes: "legacy note",
    };

    const parsed = parseStoredItems(JSON.stringify([payload]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.askingPrice).toBe(810000);
    expect(parsed[0]?.suggestedOfferCeiling).toBe(840000);
    expect(parsed[0]?.buyerOpeningOffer).toBe(810000);
    expect(parsed[0]?.buyerNotes).toBe("legacy note");
  });
});
