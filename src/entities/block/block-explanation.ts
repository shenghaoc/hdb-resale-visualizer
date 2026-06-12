import type { BlockSummary, ComparisonArtifact, FilterState } from "../../types/data";
import { MAX_LEASE_DURATION, getCurrentYear } from "../../shared/lib/constants";

const MEANINGFUL_VOLUME_MIN_TRANSACTIONS = 5;

export type BlockExplanationCode =
  | "high-transaction-volume"
  | "below-town-median-price"
  | "within-mrt-threshold"
  | "above-lease-threshold"
  | "within-budget";

export function buildBlockExplanation({
  block,
  comparison,
  filters,
  currentYear,
}: {
  block: BlockSummary;
  comparison: ComparisonArtifact | null;
  filters: FilterState;
  currentYear?: number;
}): BlockExplanationCode[] {
  const explanations: BlockExplanationCode[] = [];

  if (block.transactionCount >= MEANINGFUL_VOLUME_MIN_TRANSACTIONS) {
    explanations.push("high-transaction-volume");
  }

  if (comparison && comparison.percentileRanks.pricePercentile < 50) {
    explanations.push("below-town-median-price");
  }

  const nearestMrt = block.nearestMrt?.distanceMeters;
  if (filters.mrtMax != null && nearestMrt != null && nearestMrt <= filters.mrtMax) {
    explanations.push("within-mrt-threshold");
  }

  if (filters.remainingLeaseMin != null) {
    const resolvedYear = currentYear ?? getCurrentYear();
    const maxRemainingLeaseYears =
      MAX_LEASE_DURATION - (resolvedYear - block.leaseCommenceRange[1]);
    if (maxRemainingLeaseYears >= filters.remainingLeaseMin) {
      explanations.push("above-lease-threshold");
    }
  }

  if (filters.budgetMin != null || filters.budgetMax != null) {
    const withinMin = filters.budgetMin == null || block.medianPrice >= filters.budgetMin;
    const withinMax = filters.budgetMax == null || block.medianPrice <= filters.budgetMax;
    if (withinMin && withinMax) {
      explanations.push("within-budget");
    }
  }

  return explanations;
}
