import { describe, expect, it } from "vite-plus/test";
import {
  buildSearchProfileFromWizard,
  canContinueSearchProfileStep,
  canSubmitSearchProfileDraft,
  formatStationLabel,
  parseOptionalNumber,
  type SearchProfileWizardDraft,
} from "@/features/search-profile/searchProfileWizardLogic";

function makeDraft(overrides: Partial<SearchProfileWizardDraft> = {}): SearchProfileWizardDraft {
  return {
    mainFlatType: "4 ROOM",
    maxBudget: "700000",
    commuteAnchorLabel: "  CBD Office  ",
    commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
    maxCommute: "30",
    minLease: "70",
    age: "35",
    coApplicantAge: "33",
    cpfOABalance: "120000",
    monthlyIncome: "9000",
    ...overrides,
  };
}

describe("search profile wizard logic", () => {
  it("validates the welcome and flat-type steps", () => {
    expect(canContinueSearchProfileStep(0, makeDraft())).toBe(true);
    expect(canContinueSearchProfileStep(1, makeDraft({ mainFlatType: "" }))).toBe(false);
    expect(canContinueSearchProfileStep(1, makeDraft())).toBe(true);
  });

  it("allows an empty budget but rejects values outside the monetary range", () => {
    expect(canContinueSearchProfileStep(2, makeDraft({ maxBudget: "" }))).toBe(true);
    expect(canContinueSearchProfileStep(2, makeDraft({ maxBudget: "0" }))).toBe(false);
    expect(canContinueSearchProfileStep(2, makeDraft({ maxBudget: "10000001" }))).toBe(false);
    expect(canContinueSearchProfileStep(2, makeDraft({ maxBudget: "700000" }))).toBe(true);
  });

  it("requires a destination, station, and positive commute limit", () => {
    expect(canContinueSearchProfileStep(3, makeDraft({ commuteAnchorLabel: " " }))).toBe(false);
    expect(canContinueSearchProfileStep(3, makeDraft({ commuteAnchorMrt: "" }))).toBe(false);
    expect(canContinueSearchProfileStep(3, makeDraft({ maxCommute: "0" }))).toBe(false);
    expect(canContinueSearchProfileStep(3, makeDraft())).toBe(true);
  });

  it("requires a positive lease and validates optional affordability fields", () => {
    expect(canContinueSearchProfileStep(4, makeDraft({ minLease: "0" }))).toBe(false);
    expect(canContinueSearchProfileStep(4, makeDraft({ minLease: "70" }))).toBe(true);
    expect(canContinueSearchProfileStep(5, makeDraft({ age: "35.5", coApplicantAge: "" }))).toBe(
      false,
    );
    expect(canContinueSearchProfileStep(5, makeDraft({ age: "", coApplicantAge: "" }))).toBe(true);
    expect(canContinueSearchProfileStep(5, makeDraft({ cpfOABalance: "10000001" }))).toBe(false);
    expect(canContinueSearchProfileStep(6, makeDraft())).toBe(true);
  });

  it("uses the same complete-draft validation for submission", () => {
    expect(canSubmitSearchProfileDraft(makeDraft())).toBe(true);
    expect(canSubmitSearchProfileDraft(makeDraft({ commuteAnchorLabel: "" }))).toBe(false);
    expect(canSubmitSearchProfileDraft(makeDraft({ age: "20" }))).toBe(false);
  });

  it("builds the exact persisted profile defaults and trims the commute label", () => {
    expect(buildSearchProfileFromWizard(makeDraft())).toEqual({
      version: 1,
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: [],
      maxBudget: 700000,
      commuteAnchorLabel: "CBD Office",
      commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 10,
      minimumRemainingLeaseYears: 70,
      budgetStretchPercent: 5,
      showStretchOptions: true,
      showAllBlocks: false,
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
      age: null,
      coApplicantAge: null,
      cpfOABalance: null,
      monthlyIncome: null,
    });
    expect(draft).toEqual(before);
  });

  it("formats station labels like the existing wizard", () => {
    expect(formatStationLabel("RAFFLES PLACE MRT STATION")).toBe("Raffles Place");
  });
});
