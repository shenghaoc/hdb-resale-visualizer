import { MAX_LEASE_DURATION, getCurrentYear } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

export type MatchTier = "strong" | "good" | "stretch" | "weak";

export type BlockProfileEvaluation = {
  visible: boolean;
  tier: MatchTier;
};

function computeRemainingLease(block: BlockSummary): number {
  return MAX_LEASE_DURATION - (getCurrentYear() - block.leaseCommenceRange[1]);
}

function computeCommuteMinutesProxy(block: BlockSummary): number | null {
  const meters = block.nearestMrt?.distanceMeters;
  if (meters == null) return null;
  return Math.round(meters / 100);
}

export function evaluateBlockForProfile(block: BlockSummary, profile: SearchProfile): BlockProfileEvaluation {
  const remainingLease = computeRemainingLease(block);
  const minLease = profile.minimumRemainingLeaseYears;
  const budget = profile.maxBudget;
  const targetCommute = profile.maxComfortableCommuteMinutes;

  const leasePass = minLease === null ? true : remainingLease >= minLease;
  const budgetPass = budget === null ? true : block.medianPrice <= budget;
  const budgetStretchMax = budget === null ? null : budget * (1 + profile.budgetStretchPercent / 100);
  const budgetStretchPass = budgetStretchMax === null ? false : block.medianPrice <= budgetStretchMax;

  const commuteProxy = computeCommuteMinutesProxy(block);
  const commutePass = targetCommute === null || commuteProxy === null ? true : commuteProxy <= targetCommute;
  const commuteStretchPass =
    targetCommute === null || commuteProxy === null
      ? false
      : commuteProxy <= targetCommute + profile.commuteStretchMinutes;

  if (leasePass && budgetPass && commutePass) return { visible: true, tier: "strong" };
  if (leasePass && (budgetPass || commutePass)) return { visible: true, tier: "good" };

  const isStretch =
    leasePass &&
    ((profile.showStretchOptions && budgetStretchPass) ||
      (profile.showStretchOptions && commuteStretchPass));

  if (isStretch) return { visible: true, tier: "stretch" };
  if (profile.showAllBlocks) return { visible: true, tier: "weak" };
  return { visible: false, tier: "weak" };
}

export function applyProfileVisibility(blocks: BlockSummary[], profile: SearchProfile): BlockSummary[] {
  return blocks.filter((block) => evaluateBlockForProfile(block, profile).visible);
}
