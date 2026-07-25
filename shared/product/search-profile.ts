/**
 * Platform-neutral search profile types and matching logic.
 *
 * Evaluates how well a block matches a buyer's search profile across four
 * dimensions: flat type, remaining lease, budget, and commute.
 *
 * Every function that depends on the current year takes it as an explicit
 * parameter so platform parity tests stay deterministic.
 */

import type { BlockSummary } from "../data-types";
import { getEffectiveMedianPrice } from "./filtering";
import { MAX_LEASE_DURATION } from "./lease";

// ── Types ────────────────────────────────────────────────────────────────

export type SearchProfile = {
  version: 2;
  mainFlatType: string;
  alternativeFlatTypes: readonly string[];
  maxBudget: number | null;
  commuteAnchorLabel: string;
  commuteAnchorMrt: string | null;
  maxComfortableCommuteMinutes: number | null;
  commuteStretchMinutes: number;
  minimumRemainingLeaseYears: number | null;
  budgetStretchPercent: number;
  showStretchOptions: boolean;
  showAllBlocks: boolean;
  age: number | null;
  coApplicantAge: number | null;
  cpfOABalance: number | null;
  monthlyIncome: number | null;
};

export type MatchTier = "strong" | "good" | "stretch" | "weak";

export type DimensionMatch = "pass" | "stretch" | "fail" | "skip";

export type ProfileEvaluation = {
  tier: MatchTier;
  flatType: DimensionMatch;
  lease: DimensionMatch;
  budget: DimensionMatch;
  commute: DimensionMatch;
};

// ── Constants ────────────────────────────────────────────────────────────

const WALKING_METERS_PER_MINUTE = 80;

// ── Internal helpers ─────────────────────────────────────────────────────

function mrtAccessForProfile(block: BlockSummary, anchorMrt: string | null) {
  if (anchorMrt) {
    return (
      block.nearbyMrts?.find((m) => m.stationName === anchorMrt) ??
      (block.nearestMrt?.stationName === anchorMrt ? block.nearestMrt : null)
    );
  }
  return block.nearestMrt;
}

function walkingMinutesToMrt(block: BlockSummary, anchorMrt: string | null): number | null {
  const mrt = mrtAccessForProfile(block, anchorMrt);
  if (!mrt) return null;

  if (Number.isFinite(mrt.walkingTimeSeconds) && mrt.walkingTimeSeconds >= 0) {
    return mrt.walkingTimeSeconds / 60;
  }
  if (Number.isFinite(mrt.distanceMeters) && mrt.distanceMeters >= 0) {
    return mrt.distanceMeters / WALKING_METERS_PER_MINUTE;
  }
  return null;
}

function evaluateFlatType(
  block: BlockSummary,
  mainFlatType: string,
  alternativeFlatTypes: readonly string[],
): DimensionMatch {
  if (!mainFlatType) return "skip";
  if (block.flatTypes.includes(mainFlatType)) return "pass";
  for (const alt of alternativeFlatTypes) {
    if (alt && block.flatTypes.includes(alt)) return "stretch";
  }
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
  stretchCeiling: number | null,
): DimensionMatch {
  if (maxBudget === null || stretchCeiling === null) return "skip";
  const effectiveMedianPrice = getEffectiveMedianPrice(block, mainFlatType);
  if (effectiveMedianPrice <= maxBudget) return "pass";
  if (effectiveMedianPrice <= stretchCeiling) return "stretch";
  return "fail";
}

function evaluateCommute(
  block: BlockSummary,
  anchorMrt: string | null,
  maxCommute: number | null,
  stretchCeiling: number | null,
): DimensionMatch {
  if (maxCommute === null || stretchCeiling === null) return "skip";
  const walkingMinutes = walkingMinutesToMrt(block, anchorMrt);
  // No measurable walk to the anchor (or nearest MRT when no legacy anchor is
  // set): fail instead of silently ignoring the buyer's explicit maximum.
  if (walkingMinutes === null) return "fail";
  if (walkingMinutes <= maxCommute) return "pass";
  if (walkingMinutes <= stretchCeiling) return "stretch";
  return "fail";
}

function combineTier(
  flatType: DimensionMatch,
  lease: DimensionMatch,
  budget: DimensionMatch,
  commute: DimensionMatch,
): MatchTier {
  if (flatType === "fail" || lease === "fail" || budget === "fail" || commute === "fail") {
    return "weak";
  }

  const softSignals: DimensionMatch[] = [];
  if (budget !== "skip") softSignals.push(budget);
  if (commute !== "skip") softSignals.push(commute);
  if (flatType === "stretch") softSignals.push("stretch");

  if (softSignals.length === 0) return "strong";

  let stretchCount = 0;
  let passCount = 0;

  for (const s of softSignals) {
    if (s === "stretch") stretchCount++;
    else if (s === "pass") passCount++;
  }

  if (stretchCount === 0) return "strong";
  if (stretchCount === 1 && passCount >= 1) return "good";
  return "stretch";
}

// ── Public API ───────────────────────────────────────────────────────────

export function createProfileEvaluator(
  profile: SearchProfile,
  currentYear: number,
): (block: BlockSummary) => ProfileEvaluation {
  const mainFlatType = (profile.mainFlatType ?? "").trim();
  const alternativeFlatTypes = profile.alternativeFlatTypes ?? [];
  const minLease = profile.minimumRemainingLeaseYears;

  const maxBudget = profile.maxBudget;
  const budgetStretchPercent = profile.budgetStretchPercent ?? 0;
  const budgetStretchCeiling =
    maxBudget !== null ? maxBudget * (1 + budgetStretchPercent / 100) : null;

  const maxCommute = profile.maxComfortableCommuteMinutes;
  const commuteStretchMinutes = profile.commuteStretchMinutes ?? 0;
  const commuteStretchCeiling = maxCommute !== null ? maxCommute + commuteStretchMinutes : null;

  const anchorMrt = profile.commuteAnchorMrt;

  return function evaluate(block: BlockSummary): ProfileEvaluation {
    const flatType = evaluateFlatType(block, mainFlatType, alternativeFlatTypes);
    const lease = evaluateLease(block, minLease, currentYear);
    const budget = evaluateBudget(block, mainFlatType, maxBudget, budgetStretchCeiling);
    const commute = evaluateCommute(block, anchorMrt, maxCommute, commuteStretchCeiling);
    const tier = combineTier(flatType, lease, budget, commute);
    return { tier, flatType, lease, budget, commute };
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
 * main flat type and minimum remaining lease years. Budget, nearest-MRT walk,
 * and local-only affordability inputs are optional.
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
