import { z } from "zod";
import {
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
  SEARCH_PROFILE_STORAGE_KEY,
  SEARCH_PROFILE_WIZARD_DISMISSED_STORAGE_KEY,
} from "@/lib/constants";
import { safeStorage } from "@/lib/storage";
import type { SearchProfile } from "@/types/searchProfile";

export const applicantAgeSchema = z
  .number()
  .int()
  .min(SEARCH_PROFILE_MIN_APPLICANT_AGE)
  .max(SEARCH_PROFILE_MAX_APPLICANT_AGE)
  .nullable();
export const monetarySchema = z
  .number()
  .min(0)
  .max(SEARCH_PROFILE_MAX_MONETARY_VALUE)
  .nullable();

export const searchProfileSchema = z.object({
  version: z.literal(1).catch(1),
  mainFlatType: z.string().trim().catch(""),
  alternativeFlatTypes: z.array(z.string()).catch([]),
  maxBudget: z.number().int().positive().nullable().catch(null),
  commuteAnchorLabel: z.string().trim().catch(""),
  commuteAnchorMrt: z.string().trim().min(1).nullable().catch(null),
  maxComfortableCommuteMinutes: z.number().int().positive().nullable().catch(null),
  commuteStretchMinutes: z.number().int().min(0).max(60).catch(10),
  minimumRemainingLeaseYears: z.number().int().min(0).max(99).nullable().catch(null),
  budgetStretchPercent: z.number().int().min(0).max(30).catch(5),
  showStretchOptions: z.boolean().catch(true),
  showAllBlocks: z.boolean().catch(false),
  age: applicantAgeSchema.catch(null),
  coApplicantAge: applicantAgeSchema.catch(null),
  cpfOABalance: monetarySchema.catch(null),
  monthlyIncome: monetarySchema.catch(null),
});

export const DEFAULT_SEARCH_PROFILE: SearchProfile = {
  version: 1,
  mainFlatType: "",
  alternativeFlatTypes: [],
  maxBudget: null,
  commuteAnchorLabel: "",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: null,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: null,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
  age: null,
  coApplicantAge: null,
  cpfOABalance: null,
  monthlyIncome: null,
};

export function parseSearchProfile(raw: unknown): SearchProfile {
  const parsed = searchProfileSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_SEARCH_PROFILE;
  return { ...DEFAULT_SEARCH_PROFILE, ...parsed.data };
}

export function loadSearchProfile(): SearchProfile {
  const value = safeStorage.getItem(SEARCH_PROFILE_STORAGE_KEY);
  if (!value) return DEFAULT_SEARCH_PROFILE;
  try {
    return parseSearchProfile(JSON.parse(value));
  } catch {
    return DEFAULT_SEARCH_PROFILE;
  }
}

export function saveSearchProfile(profile: SearchProfile): void {
  safeStorage.setItem(SEARCH_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function loadSearchProfileWizardDismissed(): boolean {
  return safeStorage.getItem(SEARCH_PROFILE_WIZARD_DISMISSED_STORAGE_KEY) === "1";
}

export function saveSearchProfileWizardDismissed(isDismissed: boolean): void {
  safeStorage.setItem(SEARCH_PROFILE_WIZARD_DISMISSED_STORAGE_KEY, isDismissed ? "1" : "0");
}

export function hasCompletedSearchProfile(profile: SearchProfile): boolean {
  return Boolean(
    profile.mainFlatType.trim() &&
      profile.commuteAnchorLabel.trim() &&
      profile.commuteAnchorMrt?.trim() &&
      profile.maxComfortableCommuteMinutes !== null &&
      profile.minimumRemainingLeaseYears !== null,
  );
}
