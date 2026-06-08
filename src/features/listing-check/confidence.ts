import {
  computeConfidence,
  type ConfidenceLevel,
  type ConfidenceInput,
} from "../../../shared/confidence-system";

export type DataConfidenceLevel = ConfidenceLevel;
export type DataConfidenceLabelKey = `confidence.${DataConfidenceLevel}.label`;

const DATA_CONFIDENCE_LABEL_KEYS = {
  high: "confidence.high.label",
  medium: "confidence.medium.label",
  low: "confidence.low.label",
} as const satisfies Record<DataConfidenceLevel, DataConfidenceLabelKey>;

export function getDataConfidenceLevel(recentTransactionCount: number): DataConfidenceLevel {
  const input: ConfidenceInput = {
    comparableCount: recentTransactionCount,
    sameBlockCount: recentTransactionCount,
    sameStreetCount: 0,
    sameTownCount: 0,
    newestComparableAgeMonths: null,
    flatTypeMatchCount: recentTransactionCount,
    floorAreaMatchCount: recentTransactionCount,
    storeyMatchCount: recentTransactionCount,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
  };

  return computeConfidence(input).level;
}

export function getDataConfidenceLabelKey(recentTransactionCount: number): DataConfidenceLabelKey {
  return DATA_CONFIDENCE_LABEL_KEYS[getDataConfidenceLevel(recentTransactionCount)];
}
