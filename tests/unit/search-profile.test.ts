import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  applicantAgeSchema,
  DEFAULT_SEARCH_PROFILE,
  hasCompletedSearchProfile,
  loadSearchProfile,
  monetarySchema,
  parseSearchProfile,
} from "@/features/search-profile/searchProfile";
import {
  LEGACY_SEARCH_PROFILE_STORAGE_KEY,
  LEGACY_SEARCH_PROFILE_V2_STORAGE_KEY,
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
  SEARCH_PROFILE_STORAGE_KEY,
} from "@/shared/lib/constants";

const retainedProfileFields = {
  mainFlatType: "4 ROOM",
  maxBudget: 700_000,
  minimumRemainingLeaseYears: 70,
  age: 38,
  coApplicantAge: 36,
  cpfOABalance: 120_000,
  monthlyIncome: 9_500,
};

describe("search profile", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to v3 defaults for an invalid payload", () => {
    expect(parseSearchProfile({ foo: "bar" })).toEqual(DEFAULT_SEARCH_PROFILE);
    expect(DEFAULT_SEARCH_PROFILE.version).toBe(3);
  });

  it("detects completion from the two required visible preferences", () => {
    expect(
      hasCompletedSearchProfile({
        ...DEFAULT_SEARCH_PROFILE,
        mainFlatType: "4 ROOM",
        minimumRemainingLeaseYears: 70,
      }),
    ).toBe(true);
    expect(
      hasCompletedSearchProfile({
        ...DEFAULT_SEARCH_PROFILE,
        mainFlatType: "4 ROOM",
      }),
    ).toBe(false);
  });

  it("round-trips every field in the current v3 contract", () => {
    expect(parseSearchProfile({ version: 3, ...retainedProfileFields })).toEqual({
      version: 3,
      ...retainedProfileFields,
    });
  });

  it("migrates v2 while dropping retired commute and hidden recommendation fields", () => {
    const migrated = parseSearchProfile({
      version: 2,
      ...retainedProfileFields,
      alternativeFlatTypes: ["5 ROOM"],
      commuteAnchorLabel: "CBD Office",
      commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 10,
      budgetStretchPercent: 5,
      showStretchOptions: true,
      showAllBlocks: false,
    });

    expect(migrated).toEqual({ version: 3, ...retainedProfileFields });
    expect(migrated).not.toHaveProperty("commuteAnchorLabel");
    expect(migrated).not.toHaveProperty("commuteAnchorMrt");
    expect(migrated).not.toHaveProperty("maxComfortableCommuteMinutes");
    expect(migrated).not.toHaveProperty("commuteStretchMinutes");
    expect(migrated).not.toHaveProperty("alternativeFlatTypes");
    expect(migrated).not.toHaveProperty("budgetStretchPercent");
    expect(migrated).not.toHaveProperty("showStretchOptions");
    expect(migrated).not.toHaveProperty("showAllBlocks");
  });

  it("migrates v1 while preserving supported finance fields", () => {
    expect(
      parseSearchProfile({
        version: 1,
        ...retainedProfileFields,
        commuteAnchorLabel: "Legacy office",
        maxComfortableCommuteMinutes: 45,
      }),
    ).toEqual({ version: 3, ...retainedProfileFields });
  });

  it("normalizes retired fields out of an existing v3 storage payload", () => {
    window.localStorage.setItem(
      SEARCH_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        ...retainedProfileFields,
        commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
      }),
    );

    const loaded = loadSearchProfile();

    expect(loaded).toEqual({ version: 3, ...retainedProfileFields });
    expect(JSON.parse(window.localStorage.getItem(SEARCH_PROFILE_STORAGE_KEY) ?? "{}")).toEqual(
      loaded,
    );
  });

  it("moves a stored v2 profile to the v3 key", () => {
    window.localStorage.setItem(
      LEGACY_SEARCH_PROFILE_V2_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        ...retainedProfileFields,
        commuteAnchorLabel: "CBD Office",
        maxComfortableCommuteMinutes: 30,
      }),
    );

    const migrated = loadSearchProfile();

    expect(migrated).toEqual({ version: 3, ...retainedProfileFields });
    expect(window.localStorage.getItem(LEGACY_SEARCH_PROFILE_V2_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SEARCH_PROFILE_STORAGE_KEY) ?? "{}")).toEqual(
      migrated,
    );
  });

  it("moves a stored v1 profile to the v3 key", () => {
    window.localStorage.setItem(
      LEGACY_SEARCH_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        ...retainedProfileFields,
        maxComfortableCommuteMinutes: 30,
      }),
    );

    const migrated = loadSearchProfile();

    expect(migrated.version).toBe(3);
    expect(window.localStorage.getItem(LEGACY_SEARCH_PROFILE_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SEARCH_PROFILE_STORAGE_KEY) ?? "{}")).toEqual(
      migrated,
    );
  });

  it("rejects applicant ages outside 21–80", () => {
    expect(applicantAgeSchema.safeParse(SEARCH_PROFILE_MIN_APPLICANT_AGE - 1).success).toBe(false);
    expect(applicantAgeSchema.safeParse(SEARCH_PROFILE_MAX_APPLICANT_AGE + 1).success).toBe(false);
    expect(applicantAgeSchema.safeParse(35.5).success).toBe(false);
    expect(applicantAgeSchema.safeParse(35).success).toBe(true);
    expect(applicantAgeSchema.safeParse(null).success).toBe(true);
  });

  it("rejects monetary values outside 0–10,000,000", () => {
    expect(monetarySchema.safeParse(-1).success).toBe(false);
    expect(monetarySchema.safeParse(SEARCH_PROFILE_MAX_MONETARY_VALUE + 1).success).toBe(false);
    expect(monetarySchema.safeParse(0).success).toBe(true);
    expect(monetarySchema.safeParse(SEARCH_PROFILE_MAX_MONETARY_VALUE).success).toBe(true);
    expect(monetarySchema.safeParse(null).success).toBe(true);
  });
});
