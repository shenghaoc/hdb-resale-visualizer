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
import { MAX_LEASE_DURATION } from "./lease";

// ── Types ────────────────────────────────────────────────────────────────

export type SearchProfile = {
  version: 1;
  mainFlatType: string;
  alternativeFlatTypes: string[];
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

export type SearchProfilePatch = Partial<SearchProfile>;

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

function walkingDistanceToAnchor(block: BlockSummary, anchorMrt: string | null): number | null {
  if (anchorMrt) {
    const anchor =
      block.nearbyMrts?.find((m) => m.stationName === anchorMrt) ??
      (block.nearestMrt?.stationName === anchorMrt ? block.nearestMrt : null);
    return anchor?.distanceMeters ?? null;
  }
  // Proximity-to-nearest-MRT proxy only, not a true commute-time measurement.
  // Without a specific anchor MRT this dimension measures general MRT accessibility
  // rather than commute viability.
  return block.nearestMrt?.distanceMeters ?? null;
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
  maxBudget: number | null,
  stretchCeiling: number | null,
): DimensionMatch {
  if (maxBudget === null || stretchCeiling === null) return "skip";
  if (block.medianPrice <= maxBudget) return "pass";
  if (block.medianPrice <= stretchCeiling) return "stretch";
  return "fail";
}

function evaluateCommute(
  block: BlockSummary,
  anchorMrt: string | null,
  maxCommute: number | null,
  stretchCeiling: number | null,
): DimensionMatch {
  if (maxCommute === null || stretchCeiling === null) return "skip";
  const distanceMeters = walkingDistanceToAnchor(block, anchorMrt);
  // No measurable walking distance to the anchor (or nearest MRT when no anchor
  // is set): we can't verify the commute threshold from static data, so fail
  // rather than skip — silently ignoring the user's commute constraint would
  // let blocks far from the anchor be ranked as strong matches.
  if (distanceMeters === null) return "fail";
  const proxyMinutes = distanceMeters / WALKING_METERS_PER_MINUTE;
  if (proxyMinutes <= maxCommute) return "pass";
  if (proxyMinutes <= stretchCeiling) return "stretch";
  return "fail";
}

function combineTier(
  flatType: DimensionMatch,
  lease: DimensionMatch,
  budget: DimensionMatch,
  commute: DimensionMatch,
): MatchTier {
  if (flatType === "fail" || lease === "fail") return "weak";

  const softSignals: DimensionMatch[] = [];
  if (budget !== "skip") softSignals.push(budget);
  if (commute !== "skip") softSignals.push(commute);
  if (flatType === "stretch") softSignals.push("stretch");

  if (softSignals.length === 0) return "strong";

  let failCount = 0;
  let stretchCount = 0;
  let passCount = 0;

  for (const s of softSignals) {
    if (s === "fail") failCount++;
    else if (s === "stretch") stretchCount++;
    else if (s === "pass") passCount++;
  }

  if (failCount >= 2) return "weak";
  if (failCount === 1) return passCount >= 1 && stretchCount === 0 ? "stretch" : "weak";
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
    const budget = evaluateBudget(block, maxBudget, budgetStretchCeiling);
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

export function isProfileVisibilityActive(profile: SearchProfile): boolean {
  if (profile.showAllBlocks) return false;
  return Boolean(
    (profile.mainFlatType ?? "").trim() ||
    profile.minimumRemainingLeaseYears !== null ||
    profile.maxBudget !== null ||
    profile.maxComfortableCommuteMinutes !== null,
  );
}

export function applyProfileVisibility(
  blocks: BlockSummary[],
  profile: SearchProfile,
  currentYear: number,
): BlockSummary[] {
  if (!isProfileVisibilityActive(profile)) return blocks;

  const evaluate = createProfileEvaluator(profile, currentYear);

  return blocks.filter((block) => {
    const { tier } = evaluate(block);
    if (tier === "weak") return false;
    if (tier === "stretch" && !profile.showStretchOptions) return false;
    return true;
  });
}
