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
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
  SEARCH_PROFILE_STORAGE_KEY,
} from "@/shared/lib/constants";

describe("search profile", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to defaults for invalid payload", () => {
    expect(parseSearchProfile({ foo: "bar" })).toEqual(DEFAULT_SEARCH_PROFILE);
  });

  it("detects completion when required fields exist", () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      maxBudget: null,
      minimumRemainingLeaseYears: 70,
    };
    expect(hasCompletedSearchProfile(profile)).toBe(true);
  });

  it("does not require an MRT anchor or walk preference for completion", () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      minimumRemainingLeaseYears: 70,
    };
    expect(hasCompletedSearchProfile(profile)).toBe(true);
  });

  it("requires a minimum lease for completion", () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
    };
    expect(hasCompletedSearchProfile(profile)).toBe(false);
  });

  it("defaults financial inputs locally and keeps profile constraints non-filtering", () => {
    expect(DEFAULT_SEARCH_PROFILE.age).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.coApplicantAge).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.cpfOABalance).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.monthlyIncome).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.budgetStretchPercent).toBe(0);
    expect(DEFAULT_SEARCH_PROFILE.commuteStretchMinutes).toBe(0);
    expect(DEFAULT_SEARCH_PROFILE.showStretchOptions).toBe(false);
    expect(DEFAULT_SEARCH_PROFILE.showAllBlocks).toBe(true);
  });

  it("migrates v1 data without reinterpreting commute minutes as walking", () => {
    const migrated = parseSearchProfile({
      version: 1,
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: ["5 ROOM"],
      maxBudget: 700_000,
      commuteAnchorLabel: "CBD Office",
      commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 10,
      minimumRemainingLeaseYears: 70,
      budgetStretchPercent: 5,
      showStretchOptions: true,
      showAllBlocks: false,
      age: 38,
      coApplicantAge: 36,
      cpfOABalance: 120_000,
      monthlyIncome: 9_500,
    });

    expect(migrated).toMatchObject({
      version: 2,
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: [],
      maxBudget: 700_000,
      minimumRemainingLeaseYears: 70,
      age: 38,
      coApplicantAge: 36,
      cpfOABalance: 120_000,
      monthlyIncome: 9_500,
      commuteAnchorLabel: "",
      commuteAnchorMrt: null,
      maxComfortableCommuteMinutes: null,
      commuteStretchMinutes: 0,
      budgetStretchPercent: 0,
      showStretchOptions: false,
      showAllBlocks: true,
    });
  });

  it("normalizes retired hidden recommendation fields from existing v2 data", () => {
    const parsed = parseSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: ["5 ROOM"],
      maxBudget: 700_000,
      commuteAnchorLabel: "CBD Office",
      commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 10,
      minimumRemainingLeaseYears: 70,
      budgetStretchPercent: 5,
      showStretchOptions: true,
      showAllBlocks: false,
      age: 38,
      cpfOABalance: 120_000,
      monthlyIncome: 9_500,
    });

    expect(parsed).toMatchObject({
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: [],
      maxBudget: 700_000,
      minimumRemainingLeaseYears: 70,
      age: 38,
      cpfOABalance: 120_000,
      monthlyIncome: 9_500,
      commuteAnchorLabel: "",
      commuteAnchorMrt: null,
      maxComfortableCommuteMinutes: null,
      commuteStretchMinutes: 0,
      budgetStretchPercent: 0,
      showStretchOptions: false,
      showAllBlocks: true,
    });
  });

  it("moves a stored v1 profile to the v2 key", () => {
    window.localStorage.setItem(
      LEGACY_SEARCH_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        mainFlatType: "4 ROOM",
        minimumRemainingLeaseYears: 70,
        maxComfortableCommuteMinutes: 30,
      }),
    );

    const migrated = loadSearchProfile();

    expect(migrated.version).toBe(2);
    expect(migrated.maxComfortableCommuteMinutes).toBeNull();
    expect(window.localStorage.getItem(LEGACY_SEARCH_PROFILE_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SEARCH_PROFILE_STORAGE_KEY) ?? "{}")).toEqual(
      migrated,
    );
  });

  it("round-trips valid CPF and age fields through parseSearchProfile", () => {
    const parsed = parseSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      age: 38,
      coApplicantAge: 36,
      cpfOABalance: 120_000,
      monthlyIncome: 9_500,
    });
    expect(parsed.age).toBe(38);
    expect(parsed.coApplicantAge).toBe(36);
    expect(parsed.cpfOABalance).toBe(120_000);
    expect(parsed.monthlyIncome).toBe(9_500);
  });

  it("rejects applicant ages outside 21–80", () => {
    expect(applicantAgeSchema.safeParse(SEARCH_PROFILE_MIN_APPLICANT_AGE - 1).success).toBe(false);
    expect(applicantAgeSchema.safeParse(SEARCH_PROFILE_MAX_APPLICANT_AGE + 1).success).toBe(false);
    expect(applicantAgeSchema.safeParse(35.5).success).toBe(false);
    expect(applicantAgeSchema.safeParse(35).success).toBe(true);
    expect(applicantAgeSchema.safeParse(null).success).toBe(true);
  });

  it("rejects monetary values outside 0–10_000_000", () => {
    expect(monetarySchema.safeParse(-1).success).toBe(false);
    expect(monetarySchema.safeParse(SEARCH_PROFILE_MAX_MONETARY_VALUE + 1).success).toBe(false);
    expect(monetarySchema.safeParse(0).success).toBe(true);
    expect(monetarySchema.safeParse(SEARCH_PROFILE_MAX_MONETARY_VALUE).success).toBe(true);
    expect(monetarySchema.safeParse(null).success).toBe(true);
  });

  it("surfaces a clear error path on out-of-range values", () => {
    const issues = applicantAgeSchema.safeParse(100);
    expect(issues.success).toBe(false);
    if (!issues.success) {
      expect(issues.error.issues[0]?.code).toBe("too_big");
    }
  });
});
