import { LOW_SAMPLE_THRESHOLD } from "../../shared/comparable-engine";
import type { CaveatCode } from "../../shared/caveat-codes";
import type { ConfidenceAssessment } from "../../shared/confidence-system";

export type ComparableQualityTag = "strong" | "weak" | "widened" | "stale";

type ComparableSetQualityInput = {
  confidence: ConfidenceAssessment;
  widenedSearch: boolean;
  newestComparableAgeMonths: number | null;
  caveatCodes?: ReadonlyArray<CaveatCode>;
};

type BlockQualityInput = {
  transactionCount: number;
  latestMonth: string;
  referenceMonth?: string | null;
};

function hasLowSampleSignal(
  confidence: ConfidenceAssessment,
  caveatCodes: ReadonlyArray<CaveatCode>,
): boolean {
  return (
    confidence.input.comparableCount < LOW_SAMPLE_THRESHOLD ||
    caveatCodes.includes("LOW_SAMPLE") ||
    caveatCodes.includes("VERY_LOW_SAMPLE") ||
    caveatCodes.includes("NO_COMPARABLES")
  );
}

function monthsBetween(olderMonth: string, newerMonth: string): number {
  const olderYear = Number(olderMonth.slice(0, 4));
  const olderMon = Number(olderMonth.slice(5, 7));
  const newerYear = Number(newerMonth.slice(0, 4));
  const newerMon = Number(newerMonth.slice(5, 7));
  return (newerYear - olderYear) * 12 + (newerMon - olderMon);
}

export function getComparableSetQualityTag({
  confidence,
  widenedSearch,
  newestComparableAgeMonths,
  caveatCodes = [],
}: ComparableSetQualityInput): ComparableQualityTag {
  if (newestComparableAgeMonths != null && newestComparableAgeMonths > 12) {
    return "stale";
  }
  if (
    widenedSearch ||
    caveatCodes.includes("WIDENED_TO_STREET") ||
    caveatCodes.includes("WIDENED_TO_TOWN")
  ) {
    return "widened";
  }
  if (confidence.level !== "high" || hasLowSampleSignal(confidence, caveatCodes)) {
    return "weak";
  }
  return "strong";
}

export function getBlockDataQualityTag({
  transactionCount,
  latestMonth,
  referenceMonth,
}: BlockQualityInput): ComparableQualityTag {
  if (referenceMonth && monthsBetween(latestMonth, referenceMonth) > 12) {
    return "stale";
  }
  if (transactionCount < LOW_SAMPLE_THRESHOLD) {
    return "weak";
  }
  return "strong";
}
