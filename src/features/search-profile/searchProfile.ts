import { z } from "zod";
import {
  LEGACY_SEARCH_PROFILE_STORAGE_KEY,
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
  SEARCH_PROFILE_STORAGE_KEY,
} from "@/shared/lib/constants";
import { safeStorage } from "@/shared/lib/storage";
import type { SearchProfile } from "@/types/searchProfile";

// Re-exported from shared product core for cross-platform reuse.
export { hasCompletedSearchProfile } from "@shared/product/search-profile";

export const applicantAgeSchema = z
  .number()
  .int()
  .min(SEARCH_PROFILE_MIN_APPLICANT_AGE)
  .max(SEARCH_PROFILE_MAX_APPLICANT_AGE)
  .nullable();
export const monetarySchema = z.number().min(0).max(SEARCH_PROFILE_MAX_MONETARY_VALUE).nullable();

const searchProfileSchema = z.object({
  version: z.literal(2),
  mainFlatType: z.string().trim().catch(""),
  alternativeFlatTypes: z.array(z.string()).catch([]),
  maxBudget: z.number().int().positive().nullable().catch(null),
  commuteAnchorLabel: z.string().trim().catch(""),
  commuteAnchorMrt: z.string().trim().min(1).nullable().catch(null),
  maxComfortableCommuteMinutes: z.number().int().positive().nullable().catch(null),
  commuteStretchMinutes: z.number().int().min(0).max(60).catch(0),
  minimumRemainingLeaseYears: z.number().int().min(0).max(99).nullable().catch(null),
  budgetStretchPercent: z.number().int().min(0).max(30).catch(0),
  showStretchOptions: z.boolean().catch(false),
  showAllBlocks: z.boolean().catch(true),
  age: applicantAgeSchema.catch(null),
  coApplicantAge: applicantAgeSchema.catch(null),
  cpfOABalance: monetarySchema.catch(null),
  monthlyIncome: monetarySchema.catch(null),
});

const legacySearchProfileSchema = z.object({
  version: z.literal(1),
  mainFlatType: z.string().trim().catch(""),
  alternativeFlatTypes: z.array(z.string()).catch([]),
  maxBudget: z.number().int().positive().nullable().catch(null),
  minimumRemainingLeaseYears: z.number().int().min(0).max(99).nullable().catch(null),
  age: applicantAgeSchema.catch(null),
  coApplicantAge: applicantAgeSchema.catch(null),
  cpfOABalance: monetarySchema.catch(null),
  monthlyIncome: monetarySchema.catch(null),
});

export const DEFAULT_SEARCH_PROFILE: SearchProfile = {
  version: 2,
  mainFlatType: "",
  alternativeFlatTypes: [],
  maxBudget: null,
  commuteAnchorLabel: "",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: null,
  commuteStretchMinutes: 0,
  minimumRemainingLeaseYears: null,
  budgetStretchPercent: 0,
  showStretchOptions: false,
  showAllBlocks: true,
  age: null,
  coApplicantAge: null,
  cpfOABalance: null,
  monthlyIncome: null,
};

export function parseSearchProfile(raw: unknown): SearchProfile {
  const parsed = searchProfileSchema.safeParse(raw);
  if (parsed.success) {
    return {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: parsed.data.mainFlatType,
      maxBudget: parsed.data.maxBudget,
      minimumRemainingLeaseYears: parsed.data.minimumRemainingLeaseYears,
      age: parsed.data.age,
      coApplicantAge: parsed.data.coApplicantAge,
      cpfOABalance: parsed.data.cpfOABalance,
      monthlyIncome: parsed.data.monthlyIncome,
    };
  }

  const legacy = legacySearchProfileSchema.safeParse(raw);
  if (!legacy.success) return DEFAULT_SEARCH_PROFILE;

  return {
    ...DEFAULT_SEARCH_PROFILE,
    mainFlatType: legacy.data.mainFlatType,
    maxBudget: legacy.data.maxBudget,
    minimumRemainingLeaseYears: legacy.data.minimumRemainingLeaseYears,
    age: legacy.data.age,
    coApplicantAge: legacy.data.coApplicantAge,
    cpfOABalance: legacy.data.cpfOABalance,
    monthlyIncome: legacy.data.monthlyIncome,
  };
}

export function loadSearchProfile(): SearchProfile {
  const value = safeStorage.getItem(SEARCH_PROFILE_STORAGE_KEY);
  if (value) {
    try {
      return parseSearchProfile(JSON.parse(value));
    } catch {
      return DEFAULT_SEARCH_PROFILE;
    }
  }

  const legacyValue = safeStorage.getItem(LEGACY_SEARCH_PROFILE_STORAGE_KEY);
  if (!legacyValue) return DEFAULT_SEARCH_PROFILE;
  try {
    const migrated = parseSearchProfile(JSON.parse(legacyValue));
    saveSearchProfile(migrated);
    safeStorage.removeItem(LEGACY_SEARCH_PROFILE_STORAGE_KEY);
    return migrated;
  } catch {
    return DEFAULT_SEARCH_PROFILE;
  }
}

export function saveSearchProfile(profile: SearchProfile): void {
  safeStorage.setItem(SEARCH_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}
