import { describe, expect, it } from "vite-plus/test";
import { CHECKLIST_STORAGE_KEY } from "@/shared/lib/constants";
import {
  loadChecklistState,
  saveChecklistState,
  toggleChecklistItem,
  parseChecklistState,
} from "@/features/listing-check/checklist";

describe("checklist storage", () => {
  it("loads and saves checklist entries", () => {
    const storage = new Map<string, string>();
    const shim = {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    };

    let state = loadChecklistState(shim);
    expect(state).toEqual({});

    state = toggleChecklistItem(state, "bedok-108-lengkong-tiga", "ethnicQuota");
    saveChecklistState(shim, state);

    expect(storage.has(CHECKLIST_STORAGE_KEY)).toBe(true);
    expect(loadChecklistState(shim)).toEqual({
      "bedok-108-lengkong-tiga": ["ethnicQuota"],
    });

    // Toggle again to remove
    state = toggleChecklistItem(state, "bedok-108-lengkong-tiga", "ethnicQuota");
    saveChecklistState(shim, state);
    expect(loadChecklistState(shim)).toEqual({});
  });

  it("parses and normalizes checklist state correctly", () => {
    // Valid
    expect(
      parseChecklistState({
        "block-1": ["noise", "remainingLease"],
        "block-2": ["nearbyAmenities"],
      }),
    ).toEqual({
      "block-1": ["noise", "remainingLease"],
      "block-2": ["nearbyAmenities"],
    });

    // Invalid item IDs are stripped
    expect(
      parseChecklistState({
        "block-1": ["noise", "invalid-item", "remainingLease"],
      }),
    ).toEqual({
      "block-1": ["noise", "remainingLease"],
    });

    // Malformed entries are dropped without wiping valid saved blocks
    expect(
      parseChecklistState({
        "block-1": ["noise"],
        "block-2": 42,
      }),
    ).toEqual({
      "block-1": ["noise"],
    });

    // Invalid format returns empty object
    expect(parseChecklistState(null)).toEqual({});
    expect(parseChecklistState("not an object")).toEqual({});
    expect(parseChecklistState([])).toEqual({});
  });
});
