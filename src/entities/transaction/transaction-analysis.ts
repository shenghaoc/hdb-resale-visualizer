import type { AddressDetailTransaction, AddressTrendPoint } from "@/types/data";

// Moved to shared/comparable-engine.ts so the sync pipeline can use it
// without importing from src/. Re-export for backwards compatibility.
import { parseStoreyMidpoint } from "@shared/comparable-engine";
export { parseStoreyMidpoint };

export {
  assessAskingPrice,
  findComparableTransactions,
  monthDiff,
  summarizeComparables,
  detectRecentTransactionOutliers,
  RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER,
  RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD,
  RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE,
  type RecentTransactionOutlier,
  type AskingPriceAssessment,
  type ComparableQuery,
  type ComparableSummary,
  type ComparableTolerances,
  type TrendRangeKey,
} from "@shared/product";
import { TREND_RANGE_MONTHS } from "@shared/product";
import type { TrendRangeKey } from "@shared/product";

export type BlockTrajectory = {
  currentMedian: number;
  currentMonth: string;
  yoyDeltaPct: number | null;
  yoyDelta: number | null;
  peakMonth: string;
  peakPrice: number;
  peakToCurrentPct: number;
  direction: "up" | "down" | "flat";
};

const YOY_STABILITY_THRESHOLD_PCT = 1.5;

export function computeBlockTrajectory(
  monthlyTrend: ReadonlyArray<AddressTrendPoint>,
): BlockTrajectory | null {
  if (monthlyTrend.length === 0) return null;

  const sorted = [...monthlyTrend].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  if (!latest || !Number.isFinite(latest.medianPrice)) return null;

  let peak: AddressTrendPoint | undefined;
  for (const point of sorted) {
    if (Number.isFinite(point.medianPrice)) {
      if (!peak || point.medianPrice > peak.medianPrice) {
        peak = point;
      }
    }
  }
  if (!peak) return null;

  // Robust YoY: Find the point closest to exactly 12 months ago
  // within a window of [8, 16] months ago.
  let yoyAnchor: AddressTrendPoint | null = null;
  let minDistanceTo12 = Infinity;

  const latestY = Number(latest.month.slice(0, 4));
  const latestM = Number(latest.month.slice(5, 7));

  for (const point of sorted) {
    if (point.month === latest.month) continue;
    const y = Number(point.month.slice(0, 4));
    const m = Number(point.month.slice(5, 7));
    const distanceInMonths = (latestY - y) * 12 + (latestM - m);

    if (distanceInMonths >= 8 && distanceInMonths <= 16) {
      const offTarget = Math.abs(distanceInMonths - 12);
      if (offTarget < minDistanceTo12) {
        minDistanceTo12 = offTarget;
        yoyAnchor = point;
      }
    }
  }

  const yoyDelta = yoyAnchor ? latest.medianPrice - yoyAnchor.medianPrice : null;
  const yoyDeltaPct =
    yoyAnchor && yoyAnchor.medianPrice > 0 ? (yoyDelta! / yoyAnchor.medianPrice) * 100 : null;

  const peakToCurrentPct =
    peak.medianPrice > 0 ? ((latest.medianPrice - peak.medianPrice) / peak.medianPrice) * 100 : 0;

  let direction: BlockTrajectory["direction"] = "flat";
  if (yoyDeltaPct != null) {
    if (yoyDeltaPct >= YOY_STABILITY_THRESHOLD_PCT) direction = "up";
    else if (yoyDeltaPct <= -YOY_STABILITY_THRESHOLD_PCT) direction = "down";
  }

  return {
    currentMedian: latest.medianPrice,
    currentMonth: latest.month,
    yoyDelta,
    yoyDeltaPct,
    peakMonth: peak.month,
    peakPrice: peak.medianPrice,
    peakToCurrentPct,
    direction,
  };
}

export function sliceTrendByRange(
  monthlyTrend: ReadonlyArray<AddressTrendPoint>,
  range: TrendRangeKey,
): AddressTrendPoint[] {
  const months = TREND_RANGE_MONTHS[range];
  if (months == null) return [...monthlyTrend];
  return monthlyTrend.slice(-months);
}

export function buildTrendEnvelope(
  monthlyTrend: ReadonlyArray<AddressTrendPoint>,
  transactions: ReadonlyArray<AddressDetailTransaction>,
): Map<string, { min: number; max: number }> {
  const byMonth = new Map<string, number[]>();
  for (const tx of transactions) {
    const bucket = byMonth.get(tx.month) ?? [];
    bucket.push(tx.resalePrice);
    byMonth.set(tx.month, bucket);
  }
  const envelope = new Map<string, { min: number; max: number }>();
  for (const point of monthlyTrend) {
    const prices = byMonth.get(point.month);
    if (prices && prices.length > 0) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < prices.length; i++) {
        const p = prices[i];
        if (p != null && !Number.isNaN(p)) {
          if (p < min) min = p;
          if (p > max) max = p;
        }
      }
      if (min <= max) {
        envelope.set(point.month, { min, max });
      }
    }
  }
  return envelope;
}
