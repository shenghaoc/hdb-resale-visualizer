import { describe, expect, it } from "vitest";
import { mergeShortlists } from "@/features/shortlist/shortlist";
import { MAX_SHORTLIST_ITEMS } from "@/lib/constants";
import type { ShortlistItem } from "@/types/data";

function item(addressKey: string, addedAt: string, notes = ""): ShortlistItem {
  return { addressKey, notes, targetPrice: null, addedAt };
}

describe("mergeShortlists", () => {
  it("dedupes by addressKey, keeping the newer addedAt", () => {
    const local = [item("a", "2026-04-20T00:00:00.000Z", "old")];
    const cloud = [item("a", "2026-04-21T00:00:00.000Z", "new")];

    const merged = mergeShortlists(local, cloud);

    expect(merged).toHaveLength(1);
    expect(merged[0].notes).toBe("new");
  });

  it("keeps the local item when the local copy is newer", () => {
    const local = [item("a", "2026-04-22T00:00:00.000Z", "local-new")];
    const cloud = [item("a", "2026-04-21T00:00:00.000Z", "cloud-old")];

    expect(mergeShortlists(local, cloud)[0].notes).toBe("local-new");
  });

  it("unions distinct keys and orders newest-first", () => {
    const local = [item("a", "2026-04-20T00:00:00.000Z"), item("b", "2026-04-23T00:00:00.000Z")];
    const cloud = [item("c", "2026-04-22T00:00:00.000Z")];

    const merged = mergeShortlists(local, cloud);

    expect(merged.map((i) => i.addressKey)).toEqual(["b", "c", "a"]);
  });

  it("keeps the first-seen item on an addedAt tie (local wins)", () => {
    const local = [item("a", "2026-04-20T00:00:00.000Z", "local")];
    const cloud = [item("a", "2026-04-20T00:00:00.000Z", "cloud")];

    expect(mergeShortlists(local, cloud)[0].notes).toBe("local");
  });

  it("treats missing or invalid addedAt as oldest", () => {
    const local = [item("a", "2026-04-20T00:00:00.000Z")];
    const cloud = [{ addressKey: "b", notes: "", targetPrice: null } as ShortlistItem];

    const merged = mergeShortlists(local, cloud);

    expect(merged.map((i) => i.addressKey)).toEqual(["a", "b"]);
  });

  it("caps at MAX_SHORTLIST_ITEMS, keeping the most recent", () => {
    const many = Array.from({ length: MAX_SHORTLIST_ITEMS + 5 }, (_, index) =>
      item(`k${index}`, `2026-04-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );

    const merged = mergeShortlists(many, []);

    expect(merged).toHaveLength(MAX_SHORTLIST_ITEMS);
    // Newest first; the 5 oldest keys must be dropped.
    expect(merged[0].addressKey).toBe(`k${MAX_SHORTLIST_ITEMS + 4}`);
    expect(merged.some((i) => i.addressKey === "k0")).toBe(false);
  });
});
