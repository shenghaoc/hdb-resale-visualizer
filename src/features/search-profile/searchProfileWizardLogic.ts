import {
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
} from "@/shared/lib/constants";
import type { SearchProfile } from "@/types/searchProfile";

export type SearchProfileWizardDraft = {
  mainFlatType: string;
  maxBudget: string;
  commuteAnchorMrt: string;
  maxCommute: string;
  minLease: string;
  age: string;
  coApplicantAge: string;
  cpfOABalance: string;
  monthlyIncome: string;
};

export function formatStationLabel(stationName: string): string {
  return stationName
    .replace(/ MRT STATION$/u, "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseOptionalNumber(value: string): number | null {
  return value.trim() !== "" ? Number(value) : null;
}

function isOptionalInRange(value: string, min: number, max: number): boolean {
  return value.trim().length === 0 || (Number(value) >= min && Number(value) <= max);
}

function isOptionalIntegerInRange(value: string, min: number, max: number): boolean {
  return (
    value.trim().length === 0 ||
    (Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max)
  );
}

export function canContinueSearchProfileStep(
  step: number,
  draft: SearchProfileWizardDraft,
): boolean {
  if (step === 0) return true;
  if (step === 1) return draft.mainFlatType.length > 0;
  if (step === 2) {
    return isOptionalInRange(draft.maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE);
  }
  if (step === 3) {
    // Matching only uses the MRT station + walk-time threshold. Free-text
    // destinations are not geocoded, so they must not gate progress.
    return draft.commuteAnchorMrt.length > 0 && Number(draft.maxCommute) > 0;
  }
  if (step === 4) return Number(draft.minLease) > 0;
  if (step === 5) {
    return (
      isOptionalIntegerInRange(
        draft.age,
        SEARCH_PROFILE_MIN_APPLICANT_AGE,
        SEARCH_PROFILE_MAX_APPLICANT_AGE,
      ) &&
      isOptionalIntegerInRange(
        draft.coApplicantAge,
        SEARCH_PROFILE_MIN_APPLICANT_AGE,
        SEARCH_PROFILE_MAX_APPLICANT_AGE,
      ) &&
      isOptionalInRange(draft.cpfOABalance, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
      isOptionalInRange(draft.monthlyIncome, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE)
    );
  }
  if (step === 6) return true;
  return false;
}

export function canSubmitSearchProfileDraft(draft: SearchProfileWizardDraft): boolean {
  return (
    draft.mainFlatType.length > 0 &&
    isOptionalInRange(draft.maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
    draft.commuteAnchorMrt.length > 0 &&
    Number(draft.maxCommute) > 0 &&
    Number(draft.minLease) > 0 &&
    isOptionalIntegerInRange(
      draft.age,
      SEARCH_PROFILE_MIN_APPLICANT_AGE,
      SEARCH_PROFILE_MAX_APPLICANT_AGE,
    ) &&
    isOptionalIntegerInRange(
      draft.coApplicantAge,
      SEARCH_PROFILE_MIN_APPLICANT_AGE,
      SEARCH_PROFILE_MAX_APPLICANT_AGE,
    ) &&
    isOptionalInRange(draft.cpfOABalance, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
    isOptionalInRange(draft.monthlyIncome, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE)
  );
}

export function buildSearchProfileFromWizard(draft: SearchProfileWizardDraft): SearchProfile {
  return {
    version: 1,
    mainFlatType: draft.mainFlatType,
    alternativeFlatTypes: [],
    maxBudget: parseOptionalNumber(draft.maxBudget),
    // Display-only label derived from the station the matcher actually uses.
    commuteAnchorLabel: formatStationLabel(draft.commuteAnchorMrt),
    commuteAnchorMrt: draft.commuteAnchorMrt,
    maxComfortableCommuteMinutes: Number(draft.maxCommute),
    commuteStretchMinutes: 5,
    minimumRemainingLeaseYears: Number(draft.minLease),
    budgetStretchPercent: 5,
    showStretchOptions: true,
    showAllBlocks: false,
    age: parseOptionalNumber(draft.age),
    coApplicantAge: parseOptionalNumber(draft.coApplicantAge),
    cpfOABalance: parseOptionalNumber(draft.cpfOABalance),
    monthlyIncome: parseOptionalNumber(draft.monthlyIncome),
  };
}
