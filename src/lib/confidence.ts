export type DataConfidenceLevel = "high" | "medium" | "low";
export type DataConfidenceLabelKey = `confidence.${DataConfidenceLevel}.label`;

// The 4/8 bands keep confidence coarse for the current recent-transaction window.
const HIGH_CONFIDENCE_MIN_TXNS = 8;
const MEDIUM_CONFIDENCE_MIN_TXNS = 4;

const DATA_CONFIDENCE_LABEL_KEYS = {
  high: "confidence.high.label",
  medium: "confidence.medium.label",
  low: "confidence.low.label",
} as const satisfies Record<DataConfidenceLevel, DataConfidenceLabelKey>;

export function getDataConfidenceLevel(recentTransactionCount: number): DataConfidenceLevel {
  if (recentTransactionCount >= HIGH_CONFIDENCE_MIN_TXNS) {
    return "high";
  }

  if (recentTransactionCount >= MEDIUM_CONFIDENCE_MIN_TXNS) {
    return "medium";
  }

  return "low";
}

export function getDataConfidenceLabelKey(recentTransactionCount: number): DataConfidenceLabelKey {
  return DATA_CONFIDENCE_LABEL_KEYS[getDataConfidenceLevel(recentTransactionCount)];
}
