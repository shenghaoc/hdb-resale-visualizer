import {
  computeAffordabilityVerdict,
  computeLoanTenureYears,
  maxAffordablePrice,
  maxLoanFor,
  COMFORTABLE_AFFORDABILITY_RATIO,
  type AffordabilityStatus,
  type AffordabilityVerdict,
} from "@shared/product/affordability";
import {
  isBlockAgeEligible as isBlockAgeEligibleForYear,
  minRequiredRemainingLease,
  remainingLeaseYears,
} from "@shared/product/lease";
import type { AffordabilityMode, BlockSummary } from "@/types/data";
import { getCurrentYear } from "./constants";

export {
  computeAffordabilityVerdict,
  computeLoanTenureYears,
  maxAffordablePrice,
  maxLoanFor,
  minRequiredRemainingLease,
  remainingLeaseYears,
  COMFORTABLE_AFFORDABILITY_RATIO,
  type AffordabilityStatus,
  type AffordabilityVerdict,
};

export type AffordabilityProfile = {
  monthlyIncome: number | null;
  cpfOABalance: number | null;
  age: number | null;
  coApplicantAge: number | null;
};

/**
 * Web adapter for the shared lease-to-95 helper. The shared helper requires an
 * explicit year so platform parity tests can stay deterministic; the web app
 * keeps its existing convenience API by resolving the current year lazily.
 */
export function isBlockAgeEligible(block: BlockSummary, age: number): boolean {
  return isBlockAgeEligibleForYear(block, age, getCurrentYear());
}

// ── Phase 3: filter + sort helpers ─────────────────────────────────────

/**
 * Profile completeness gate for affordability filter and sort. Mirrors the
 * per-card pill gate but extends to CPF + age so the verdict is meaningful
 * (income alone with no CPF yields a zero ceiling that would flag every
 * block as "over").
 */
export function isAffordabilityProfileComplete(profile: AffordabilityProfile): boolean {
  return profile.monthlyIncome !== null && profile.cpfOABalance !== null && profile.age !== null;
}

/**
 * Stable string fingerprint of the inputs that affect affordability ceilings.
 * Used as the cache key so a profile edit invalidates verdicts in one step.
 */
export function affordabilityProfileFingerprint(profile: AffordabilityProfile): string {
  return `${profile.cpfOABalance ?? ""}|${profile.monthlyIncome ?? ""}|${profile.age ?? ""}|${profile.coApplicantAge ?? ""}`;
}

let lastProfileRef: AffordabilityProfile | null = null;
let verdictCache = new WeakMap<BlockSummary, AffordabilityStatus>();
let verdictCacheFingerprint = "";

function getAffordabilityStatusCached(
  block: BlockSummary,
  profile: AffordabilityProfile,
): AffordabilityStatus {
  // The profile reference is stable across a filter pass, so skip the
  // fingerprint string build unless the reference actually changes.
  if (profile !== lastProfileRef) {
    const fingerprint = affordabilityProfileFingerprint(profile);
    if (fingerprint !== verdictCacheFingerprint) {
      verdictCache = new WeakMap<BlockSummary, AffordabilityStatus>();
      verdictCacheFingerprint = fingerprint;
    }
    lastProfileRef = profile;
  }
  const cached = verdictCache.get(block);
  if (cached !== undefined) {
    return cached;
  }
  const { status } = computeAffordabilityVerdict(profile, block.medianPrice);
  verdictCache.set(block, status);
  return status;
}

/**
 * Predicate for the affordability filter. Returns true (i.e. pass) when:
 *  - mode is off ("");
 *  - the profile is incomplete (filter is disabled — never silently hide);
 *  - the verdict status matches the active mode.
 *
 * "comfortable" mode keeps only comfortable blocks. "stretch" mode keeps
 * both comfortable + stretch (= everything except over/unknown).
 */
export function passesAffordabilityMode(
  block: BlockSummary,
  profile: AffordabilityProfile,
  mode: AffordabilityMode,
): boolean {
  if (mode === "") return true;
  if (!isAffordabilityProfileComplete(profile)) return true;
  const status = getAffordabilityStatusCached(block, profile);
  if (mode === "comfortable") return status === "comfortable";
  return status === "comfortable" || status === "stretch";
}

/**
 * Signed dollar gap between the affordability ceiling and the block's median
 * price. Positive ⇒ block is under the ceiling; negative ⇒ over. Returns
 * null when the profile is incomplete — null means "don't rank", not zero.
 */
export function affordabilityHeadroom(
  block: BlockSummary,
  profile: AffordabilityProfile,
): number | null {
  if (!isAffordabilityProfileComplete(profile)) return null;
  const ceiling = maxAffordablePrice(profile);
  return ceiling - block.medianPrice;
}

/** Test-only: drop the affordability verdict cache. */
export function resetAffordabilityCacheForTests(): void {
  lastProfileRef = null;
  verdictCache = new WeakMap<BlockSummary, AffordabilityStatus>();
  verdictCacheFingerprint = "";
}
