/**
 * Platform-neutral search profile types and matching logic.
 *
 * Evaluates whether a block matches the three buyer preferences the product
 * actually collects: flat type, remaining lease, and maximum budget.
 *
 * Every function that depends on the current year takes it as an explicit
 * parameter so platform parity tests stay deterministic.
 */

import type { BlockSummary } from "../data-types";
import { getEffectiveMedianPrice } from "./filtering";
import { MAX_LEASE_DURATION } from "./lease";

// ── Types ────────────────────────────────────────────────────────────────

export type SearchProfile = {
  version: 3;
  mainFlatType: string;
  maxBudget: number | null;
  minimumRemainingLeaseYears: number | null;
  age: number | null;
  coApplicantAge: number | null;
  cpfOABalance: number | null;
  monthlyIncome: number | null;
};

export type MatchTier = "strong" | "weak";

export type DimensionMatch = "pass" | "fail" | "skip";

export type ProfileEvaluation = {
  tier: MatchTier;
  flatType: DimensionMatch;
  lease: DimensionMatch;
  budget: DimensionMatch;
};

// ── Internal helpers ─────────────────────────────────────────────────────

function evaluateFlatType(block: BlockSummary, mainFlatType: string): DimensionMatch {
  if (!mainFlatType) return "skip";
  if (block.flatTypes.includes(mainFlatType)) return "pass";
  return "fail";
}

export function computeRemainingLeaseYears(
  leaseCommenceRange: readonly [number, number],
  currentYear: number,
): number {
  return MAX_LEASE_DURATION - (currentYear - leaseCommenceRange[1]);
}

function evaluateLease(
  block: BlockSummary,
  minLease: number | null,
  currentYear: number,
): DimensionMatch {
  if (minLease === null) return "skip";
  const remaining = computeRemainingLeaseYears(block.leaseCommenceRange, currentYear);
  return remaining >= minLease ? "pass" : "fail";
}

function evaluateBudget(
  block: BlockSummary,
  mainFlatType: string,
  maxBudget: number | null,
): DimensionMatch {
  if (maxBudget === null) return "skip";
  const effectiveMedianPrice = getEffectiveMedianPrice(block, mainFlatType);
  return effectiveMedianPrice <= maxBudget ? "pass" : "fail";
}

function combineTier(
  flatType: DimensionMatch,
  lease: DimensionMatch,
  budget: DimensionMatch,
): MatchTier {
  return flatType === "fail" || lease === "fail" || budget === "fail" ? "weak" : "strong";
}

// ── Public API ───────────────────────────────────────────────────────────

export function createProfileEvaluator(
  profile: SearchProfile,
  currentYear: number,
): (block: BlockSummary) => ProfileEvaluation {
  const mainFlatType = (profile.mainFlatType ?? "").trim();
  const minLease = profile.minimumRemainingLeaseYears;
  const maxBudget = profile.maxBudget;

  return function evaluate(block: BlockSummary): ProfileEvaluation {
    const flatType = evaluateFlatType(block, mainFlatType);
    const lease = evaluateLease(block, minLease, currentYear);
    const budget = evaluateBudget(block, mainFlatType, maxBudget);
    const tier = combineTier(flatType, lease, budget);
    return { tier, flatType, lease, budget };
  };
}

export function evaluateBlockForProfile(
  block: BlockSummary,
  profile: SearchProfile,
  currentYear: number,
): ProfileEvaluation {
  const evaluate = createProfileEvaluator(profile, currentYear);
  return evaluate(block);
}

/**
 * Returns `true` when the two required setup preferences are populated:
 * main flat type and minimum remaining lease years. Budget and local-only
 * affordability inputs are optional.
 *
 * Accepts `Partial<SearchProfile> | null | undefined` so callers with
 * incomplete profile state (e.g. during wizard construction) can test
 * completeness without pre-validating each field.
 */
export function hasCompletedSearchProfile(
  profile: Partial<SearchProfile> | null | undefined,
): boolean {
  return Boolean(profile?.mainFlatType?.trim() && profile?.minimumRemainingLeaseYears != null);
}
