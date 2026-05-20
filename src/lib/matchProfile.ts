import { MAX_LEASE_DURATION, getCurrentYear } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

export type MatchTier = "strong" | "good" | "stretch" | "weak";

export type DimensionMatch = "pass" | "stretch" | "fail" | "skip";

export type ProfileEvaluation = {
  tier: MatchTier;
  flatType: DimensionMatch;
  lease: DimensionMatch;
  budget: DimensionMatch;
  commute: DimensionMatch;
};

const WALKING_METERS_PER_MINUTE = 80;

function walkingDistanceToAnchor(block: BlockSummary, profile: SearchProfile): number | null {
  if (profile.commuteAnchorMrt) {
    const anchor =
      block.nearbyMrts?.find((m) => m.stationName === profile.commuteAnchorMrt) ??
      (block.nearestMrt?.stationName === profile.commuteAnchorMrt ? block.nearestMrt : null);
    return anchor?.distanceMeters ?? null;
  }
  return block.nearestMrt?.distanceMeters ?? null;
}

function evaluateFlatType(block: BlockSummary, profile: SearchProfile): DimensionMatch {
  const main = profile.mainFlatType.trim();
  if (!main) return "skip";
  if (block.flatTypes.includes(main)) return "pass";
  for (const alt of profile.alternativeFlatTypes) {
    if (alt && block.flatTypes.includes(alt)) return "stretch";
  }
  return "fail";
}

export function computeRemainingLeaseYears(
  leaseCommenceRange: readonly [number, number],
  currentYear: number = getCurrentYear(),
): number {
  return MAX_LEASE_DURATION - (currentYear - leaseCommenceRange[1]);
}

function evaluateLease(block: BlockSummary, profile: SearchProfile, currentYear: number): DimensionMatch {
  if (profile.minimumRemainingLeaseYears === null) return "skip";
  const remaining = computeRemainingLeaseYears(block.leaseCommenceRange, currentYear);
  return remaining >= profile.minimumRemainingLeaseYears ? "pass" : "fail";
}

function evaluateBudget(block: BlockSummary, profile: SearchProfile): DimensionMatch {
  if (profile.maxBudget === null) return "skip";
  if (block.medianPrice <= profile.maxBudget) return "pass";
  const stretchCeiling = profile.maxBudget * (1 + profile.budgetStretchPercent / 100);
  if (block.medianPrice <= stretchCeiling) return "stretch";
  return "fail";
}

function evaluateCommute(block: BlockSummary, profile: SearchProfile): DimensionMatch {
  if (profile.maxComfortableCommuteMinutes === null) return "skip";
  const distanceMeters = walkingDistanceToAnchor(block, profile);
  // If the anchor MRT is not in the block's nearby list, we can't evaluate commute
  if (distanceMeters === null) {
    return profile.commuteAnchorMrt ? "skip" : "fail";
  }
  const proxyMinutes = distanceMeters / WALKING_METERS_PER_MINUTE;
  if (proxyMinutes <= profile.maxComfortableCommuteMinutes) return "pass";
  const stretchCeiling = profile.maxComfortableCommuteMinutes + profile.commuteStretchMinutes;
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

  const failCount = softSignals.filter((s) => s === "fail").length;
  const stretchCount = softSignals.filter((s) => s === "stretch").length;
  const passCount = softSignals.filter((s) => s === "pass").length;

  if (failCount >= 2) return "weak";
  if (failCount === 1) return passCount >= 1 && stretchCount === 0 ? "stretch" : "weak";
  if (stretchCount === 0) return "strong";
  if (stretchCount === 1 && passCount >= 1) return "good";
  return "stretch";
}

export function evaluateBlockForProfile(
  block: BlockSummary,
  profile: SearchProfile,
  currentYear: number = getCurrentYear(),
): ProfileEvaluation {
  const flatType = evaluateFlatType(block, profile);
  const lease = evaluateLease(block, profile, currentYear);
  const budget = evaluateBudget(block, profile);
  const commute = evaluateCommute(block, profile);
  const tier = combineTier(flatType, lease, budget, commute);
  return { tier, flatType, lease, budget, commute };
}

export function isProfileVisibilityActive(profile: SearchProfile): boolean {
  if (profile.showAllBlocks) return false;
  return Boolean(
    profile.mainFlatType.trim() ||
      profile.minimumRemainingLeaseYears !== null ||
      profile.maxBudget !== null ||
      profile.maxComfortableCommuteMinutes !== null,
  );
}

export function applyProfileVisibility(
  blocks: BlockSummary[],
  profile: SearchProfile,
  currentYear: number = getCurrentYear(),
): BlockSummary[] {
  if (!isProfileVisibilityActive(profile)) return blocks;
  return blocks.filter((block) => {
    const { tier } = evaluateBlockForProfile(block, profile, currentYear);
    if (tier === "weak") return false;
    if (tier === "stretch" && !profile.showStretchOptions) return false;
    return true;
  });
}
