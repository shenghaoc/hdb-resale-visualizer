import { describe, expect, it } from "vite-plus/test";
import {
  buildSearchProfileFromWizard,
  canContinueSearchProfileStep,
  canSubmitSearchProfileDraft,
  parseOptionalNumber,
  type SearchProfileWizardDraft,
} from "@/features/search-profile/searchProfileWizardLogic";

function makeDraft(overrides: Partial<SearchProfileWizardDraft> = {}): SearchProfileWizardDraft {
  return {
    mainFlatType: "4 ROOM",
    maxBudget: "700000",
    minLease: "70",
    age: "35",
    coApplicantAge: "33",
    cpfOABalance: "120000",
    monthlyIncome: "9000",
    ...overrides,
  };
}

describe("search profile wizard logic", () => {
  it("requires a flat type on the first step", () => {
    expect(canContinueSearchProfileStep(0, makeDraft({ mainFlatType: "" }))).toBe(false);
    expect(canContinueSearchProfileStep(0, makeDraft({ mainFlatType: "   " }))).toBe(false);
    expect(canContinueSearchProfileStep(0, makeDraft())).toBe(true);
  });

  it("allows an empty budget but rejects values outside the monetary range", () => {
    expect(canContinueSearchProfileStep(1, makeDraft({ maxBudget: "" }))).toBe(true);
    expect(canContinueSearchProfileStep(1, makeDraft({ maxBudget: "0" }))).toBe(false);
    expect(canContinueSearchProfileStep(1, makeDraft({ maxBudget: "10000001" }))).toBe(false);
    expect(canContinueSearchProfileStep(1, makeDraft({ maxBudget: "700000" }))).toBe(true);
  });

  it("requires a valid lease and validates optional affordability fields", () => {
    expect(canContinueSearchProfileStep(2, makeDraft({ minLease: "" }))).toBe(false);
    expect(canContinueSearchProfileStep(2, makeDraft({ minLease: "0" }))).toBe(false);
    expect(canContinueSearchProfileStep(2, makeDraft({ minLease: "70.5" }))).toBe(false);
    expect(canContinueSearchProfileStep(2, makeDraft({ minLease: "100" }))).toBe(false);
    expect(canContinueSearchProfileStep(2, makeDraft({ minLease: "70" }))).toBe(true);
    expect(canContinueSearchProfileStep(3, makeDraft({ age: "35.5", coApplicantAge: "" }))).toBe(
      false,
    );
    expect(canContinueSearchProfileStep(3, makeDraft({ age: "", coApplicantAge: "" }))).toBe(true);
    expect(canContinueSearchProfileStep(3, makeDraft({ cpfOABalance: "10000001" }))).toBe(false);
    expect(canContinueSearchProfileStep(4, makeDraft())).toBe(true);
  });

  it("uses the same complete-draft validation for submission", () => {
    expect(canSubmitSearchProfileDraft(makeDraft())).toBe(true);
    expect(canSubmitSearchProfileDraft(makeDraft({ minLease: "" }))).toBe(false);
    expect(canSubmitSearchProfileDraft(makeDraft({ age: "20" }))).toBe(false);
  });

  it("builds a v2 profile with no hidden stretch or exact MRT anchor", () => {
    expect(buildSearchProfileFromWizard(makeDraft())).toEqual({
      version: 2,
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: [],
      maxBudget: 700000,
      commuteAnchorLabel: "",
      commuteAnchorMrt: null,
      maxComfortableCommuteMinutes: null,
      commuteStretchMinutes: 0,
      minimumRemainingLeaseYears: 70,
      budgetStretchPercent: 0,
      showStretchOptions: false,
      showAllBlocks: true,
      age: 35,
      coApplicantAge: 33,
      cpfOABalance: 120000,
      monthlyIncome: 9000,
    });
  });

  it("turns empty optional inputs into null without mutating the draft", () => {
    const draft = makeDraft({
      maxBudget: "",
      age: "",
      coApplicantAge: "",
      cpfOABalance: "",
      monthlyIncome: "",
    });
    const before = { ...draft };

    expect(parseOptionalNumber(" ")).toBeNull();
    expect(buildSearchProfileFromWizard(draft)).toMatchObject({
      maxBudget: null,
      maxComfortableCommuteMinutes: null,
      age: null,
      coApplicantAge: null,
      cpfOABalance: null,
      monthlyIncome: null,
    });
    expect(draft).toEqual(before);
  });
});
