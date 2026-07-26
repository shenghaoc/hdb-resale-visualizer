import { z } from "zod";
import {
  LEGACY_SEARCH_PROFILE_STORAGE_KEY,
  LEGACY_SEARCH_PROFILE_V2_STORAGE_KEY,
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

const supportedSearchProfileFields = {
  mainFlatType: z.string().trim().catch(""),
  maxBudget: z.number().int().positive().nullable().catch(null),
  minimumRemainingLeaseYears: z.number().int().min(0).max(99).nullable().catch(null),
  age: applicantAgeSchema.catch(null),
  coApplicantAge: applicantAgeSchema.catch(null),
  cpfOABalance: monetarySchema.catch(null),
  monthlyIncome: monetarySchema.catch(null),
};

const searchProfileSchema = z.object({
  version: z.literal(3),
  ...supportedSearchProfileFields,
});
const legacySearchProfileV2Schema = z.object({
  version: z.literal(2),
  ...supportedSearchProfileFields,
});
const legacySearchProfileV1Schema = z.object({
  version: z.literal(1),
  ...supportedSearchProfileFields,
});

export const DEFAULT_SEARCH_PROFILE: SearchProfile = {
  version: 3,
  mainFlatType: "",
  maxBudget: null,
  minimumRemainingLeaseYears: null,
  age: null,
  coApplicantAge: null,
  cpfOABalance: null,
  monthlyIncome: null,
};

type SupportedSearchProfileFields = Omit<SearchProfile, "version">;

function toCurrentSearchProfile(data: SupportedSearchProfileFields): SearchProfile {
  return {
    version: 3,
    mainFlatType: data.mainFlatType,
    maxBudget: data.maxBudget,
    minimumRemainingLeaseYears: data.minimumRemainingLeaseYears,
    age: data.age,
    coApplicantAge: data.coApplicantAge,
    cpfOABalance: data.cpfOABalance,
    monthlyIncome: data.monthlyIncome,
  };
}

export function parseSearchProfile(raw: unknown): SearchProfile {
  const parsed = searchProfileSchema.safeParse(raw);
  if (parsed.success) return toCurrentSearchProfile(parsed.data);

  const legacyV2 = legacySearchProfileV2Schema.safeParse(raw);
  if (legacyV2.success) return toCurrentSearchProfile(legacyV2.data);

  const legacyV1 = legacySearchProfileV1Schema.safeParse(raw);
  return legacyV1.success ? toCurrentSearchProfile(legacyV1.data) : DEFAULT_SEARCH_PROFILE;
}

export function loadSearchProfile(): SearchProfile {
  const value = safeStorage.getItem(SEARCH_PROFILE_STORAGE_KEY);
  if (value) {
    try {
      const stored = JSON.parse(value) as unknown;
      const parsed = parseSearchProfile(stored);
      if (JSON.stringify(stored) !== JSON.stringify(parsed)) {
        saveSearchProfile(parsed);
      }
      return parsed;
    } catch {
      return DEFAULT_SEARCH_PROFILE;
    }
  }

  for (const legacyKey of [
    LEGACY_SEARCH_PROFILE_V2_STORAGE_KEY,
    LEGACY_SEARCH_PROFILE_STORAGE_KEY,
  ]) {
    const legacyValue = safeStorage.getItem(legacyKey);
    if (!legacyValue) continue;
    try {
      const migrated = parseSearchProfile(JSON.parse(legacyValue));
      saveSearchProfile(migrated);
      safeStorage.removeItem(legacyKey);
      return migrated;
    } catch {
      // A malformed older payload must not prevent fallback to another
      // supported legacy key.
    }
  }

  return DEFAULT_SEARCH_PROFILE;
}

export function saveSearchProfile(profile: SearchProfile): void {
  safeStorage.setItem(SEARCH_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}
