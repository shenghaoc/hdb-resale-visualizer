import {
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
} from "@/shared/lib/constants";
import type { SearchProfile } from "@/types/searchProfile";

export type SearchProfileWizardDraft = {
  mainFlatType: string;
  maxBudget: string;
  minLease: string;
  age: string;
  coApplicantAge: string;
  cpfOABalance: string;
  monthlyIncome: string;
};

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
  if (step === 0) return draft.mainFlatType.trim().length > 0;
  if (step === 1) {
    return isOptionalInRange(draft.maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE);
  }
  if (step === 2) {
    return draft.minLease.trim().length > 0 && isOptionalIntegerInRange(draft.minLease, 1, 99);
  }
  if (step === 3) {
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
  if (step === 4) return true;
  return false;
}

export function canSubmitSearchProfileDraft(draft: SearchProfileWizardDraft): boolean {
  return (
    draft.mainFlatType.trim().length > 0 &&
    isOptionalInRange(draft.maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
    isOptionalIntegerInRange(draft.minLease, 1, 99) &&
    draft.minLease.trim().length > 0 &&
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
    version: 3,
    mainFlatType: draft.mainFlatType.trim(),
    maxBudget: parseOptionalNumber(draft.maxBudget),
    minimumRemainingLeaseYears: Number(draft.minLease),
    age: parseOptionalNumber(draft.age),
    coApplicantAge: parseOptionalNumber(draft.coApplicantAge),
    cpfOABalance: parseOptionalNumber(draft.cpfOABalance),
    monthlyIncome: parseOptionalNumber(draft.monthlyIncome),
  };
}
