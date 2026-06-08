import { describe, expect, it } from "vitest";
import {
  applicantAgeSchema,
  DEFAULT_SEARCH_PROFILE,
  hasCompletedSearchProfile,
  monetarySchema,
  parseSearchProfile,
} from "@/features/search-profile/searchProfile";
import {
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
} from "@/shared/lib/constants";

describe("search profile", () => {
  it("falls back to defaults for invalid payload", () => {
    expect(parseSearchProfile({ foo: "bar" })).toEqual(DEFAULT_SEARCH_PROFILE);
  });

  it("detects completion when required fields exist", () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      maxBudget: null,
      commuteAnchorLabel: "Raffles Place",
      commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
      maxComfortableCommuteMinutes: 30,
      minimumRemainingLeaseYears: 70,
    };
    expect(hasCompletedSearchProfile(profile)).toBe(true);
  });

  it("requires preferred MRT station for completion", () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      commuteAnchorLabel: "Raffles Place",
      maxComfortableCommuteMinutes: 30,
      minimumRemainingLeaseYears: 70,
    };
    expect(hasCompletedSearchProfile(profile)).toBe(false);
  });

  it("defaults the new CPF and age fields to null", () => {
    expect(DEFAULT_SEARCH_PROFILE.age).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.coApplicantAge).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.cpfOABalance).toBeNull();
    expect(DEFAULT_SEARCH_PROFILE.monthlyIncome).toBeNull();
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
