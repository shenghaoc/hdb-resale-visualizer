/**
 * Web adapter for search profile matching.
 *
 * Re-exports the platform-neutral matching logic from `shared/product/search-profile`
 * and adds the `getCurrentYear()` convenience default so existing web callers
 * do not need to pass the year explicitly.
 */

import { getCurrentYear } from "@/shared/lib/constants";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

export type { MatchTier, DimensionMatch, ProfileEvaluation } from "@shared/product/search-profile";

import {
  computeRemainingLeaseYears as _computeRemainingLeaseYears,
  createProfileEvaluator as _createProfileEvaluator,
  evaluateBlockForProfile as _evaluateBlockForProfile,
  isProfileVisibilityActive,
  applyProfileVisibility as _applyProfileVisibility,
} from "@shared/product/search-profile";

export { isProfileVisibilityActive };

export function computeRemainingLeaseYears(
  leaseCommenceRange: readonly [number, number],
  currentYear: number = getCurrentYear(),
): number {
  return _computeRemainingLeaseYears(leaseCommenceRange, currentYear);
}

export function createProfileEvaluator(
  profile: SearchProfile,
  currentYear: number = getCurrentYear(),
): (block: BlockSummary) => import("@shared/product/search-profile").ProfileEvaluation {
  return _createProfileEvaluator(profile, currentYear);
}

export function evaluateBlockForProfile(
  block: BlockSummary,
  profile: SearchProfile,
  currentYear: number = getCurrentYear(),
): import("@shared/product/search-profile").ProfileEvaluation {
  return _evaluateBlockForProfile(block, profile, currentYear);
}

export function applyProfileVisibility(
  blocks: BlockSummary[],
  profile: SearchProfile,
  currentYear: number = getCurrentYear(),
): BlockSummary[] {
  return _applyProfileVisibility(blocks, profile, currentYear);
}
