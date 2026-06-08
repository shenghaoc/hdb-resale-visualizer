import { LOW_SAMPLE_THRESHOLD } from "@shared/comparable-engine";
import type { CaveatCode } from "@shared/caveat-codes";
import type { ConfidenceAssessment } from "@shared/confidence-system";
import { monthsBetween } from "@/shared/lib/dataQuality";

export type ComparableQualityTag = "strong" | "weak" | "widened" | "stale";

/**
 * Explicit i18n keys for each quality tag, so adding a new tag forces a matching
 * message entry at compile time instead of failing silently at runtime.
 */
export const QUALITY_LABEL_KEYS: Record<ComparableQualityTag, string> = {
  strong: "quality.strong",
  weak: "quality.weak",
  widened: "quality.widened",
  stale: "quality.stale",
};

export const QUALITY_HINT_KEYS: Record<ComparableQualityTag, string> = {
  strong: "quality.hint.strong",
  weak: "quality.hint.weak",
  widened: "quality.hint.widened",
  stale: "quality.hint.stale",
};

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

export function getComparableSetQualityTag({
  confidence,
  widenedSearch,
  newestComparableAgeMonths,
  caveatCodes = [],
}: ComparableSetQualityInput): ComparableQualityTag {
  if (
    (newestComparableAgeMonths != null && newestComparableAgeMonths > 12) ||
    caveatCodes.includes("STALE_DATA")
  ) {
    return "stale";
  }
  if (
    widenedSearch ||
    caveatCodes.includes("WIDENED_TO_STREET") ||
    caveatCodes.includes("WIDENED_TO_TOWN")
  ) {
    return "widened";
  }
  // Weak means low confidence or a low-sample signal — medium confidence with
  // adequate evidence still counts as strong, matching the feature design/copy.
  if (confidence.level === "low" || hasLowSampleSignal(confidence, caveatCodes)) {
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
