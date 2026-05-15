export type DataConfidenceLevel = "high" | "medium" | "low";

const HIGH_CONFIDENCE_MIN_TXNS = 8;
const MEDIUM_CONFIDENCE_MIN_TXNS = 4;

export function getDataConfidenceLevel(recentTransactionCount: number): DataConfidenceLevel {
  if (recentTransactionCount >= HIGH_CONFIDENCE_MIN_TXNS) {
    return "high";
  }

  if (recentTransactionCount >= MEDIUM_CONFIDENCE_MIN_TXNS) {
    return "medium";
  }

  return "low";
}
