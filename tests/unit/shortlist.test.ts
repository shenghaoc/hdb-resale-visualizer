import { describe, expect, it } from "vitest";
import { SHORTLIST_STORAGE_KEY } from "@/lib/constants";
import { loadShortlist, saveShortlist, toggleShortlistItem } from "@/lib/shortlist";

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
});
