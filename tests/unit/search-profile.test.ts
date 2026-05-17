import { describe, expect, it } from "vitest";
import { DEFAULT_SEARCH_PROFILE, hasCompletedSearchProfile, parseSearchProfile } from "@/lib/searchProfile";

describe("search profile", () => {
  it("falls back to defaults for invalid payload", () => {
    expect(parseSearchProfile({ foo: "bar" })).toEqual(DEFAULT_SEARCH_PROFILE);
  });

  it("detects completion when required fields exist", () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      maxBudget: 700000,
      commuteAnchorLabel: "Raffles Place",
      maxComfortableCommuteMinutes: 30,
      minimumRemainingLeaseYears: 70,
    };
    expect(hasCompletedSearchProfile(profile)).toBe(true);
  });
});
