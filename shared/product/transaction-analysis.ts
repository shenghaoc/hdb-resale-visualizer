import type { AddressDetailTransaction } from "../data-types";
import { parseStoreyMidpoint } from "../comparable-engine";

export function monthDiff(
  txMonth: string | undefined | null,
  referenceMonth: string | undefined | null,
): number {
  if (!txMonth || !referenceMonth || txMonth.length < 7 || referenceMonth.length < 7) return 0;
  const txYear = Number(txMonth.slice(0, 4));
  const txMon = Number(txMonth.slice(5, 7));
  const refYear = Number(referenceMonth.slice(0, 4));
  const refMon = Number(referenceMonth.slice(5, 7));
  if (Number.isNaN(txYear) || Number.isNaN(txMon) || Number.isNaN(refYear) || Number.isNaN(refMon))
    return 0;
  return (refYear - txYear) * 12 + (refMon - txMon);
}

export type TrendRangeKey = "2y" | "5y" | "10y" | "max";
export const TREND_RANGE_MONTHS: Record<TrendRangeKey, number | null> = {
  "2y": 24,
  "5y": 60,
  "10y": 120,
  max: null,
};

export type ComparableTolerances = { storey: number; sqm: number };

export type ComparableQuery = {
  flatType: string | null;
  storeyMidpoint: number | null;
  floorAreaSqm: number | null;
  tolerances?: ComparableTolerances;
};

const DEFAULT_TOLERANCES: ComparableTolerances = { storey: 3, sqm: 5 };

export function findComparableTransactions(
  transactions: ReadonlyArray<AddressDetailTransaction>,
  query: ComparableQuery,
): AddressDetailTransaction[] {
  const tolerances = query.tolerances ?? DEFAULT_TOLERANCES;
  return transactions.filter((tx) => {
    if (query.flatType && tx.flatType !== query.flatType) return false;
    if (query.storeyMidpoint != null) {
      const midpoint = parseStoreyMidpoint(tx.storeyRange);
      if (midpoint == null || Math.abs(midpoint - query.storeyMidpoint) > tolerances.storey) {
        return false;
      }
    }
    return (
      query.floorAreaSqm == null || Math.abs(tx.floorAreaSqm - query.floorAreaSqm) <= tolerances.sqm
    );
  });
}

export function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export const RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE = 6;
export const RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER = 1.5;
export const RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD = 20;

export type RecentTransactionOutlierDirection = "high" | "low";

export type RecentTransactionOutlier = {
  id: string;
  flatType: string;
  direction: RecentTransactionOutlierDirection;
  medianPrice: number;
  percentFromMedian: number;
};

export function detectRecentTransactionOutliers(
  transactions: ReadonlyArray<AddressDetailTransaction>,
): Map<string, RecentTransactionOutlier> {
  const byFlatType = new Map<string, AddressDetailTransaction[]>();
  for (const tx of transactions) {
    const bucket = byFlatType.get(tx.flatType) ?? [];
    bucket.push(tx);
    byFlatType.set(tx.flatType, bucket);
  }

  const outliers = new Map<string, RecentTransactionOutlier>();

  for (const [flatType, group] of byFlatType) {
    if (group.length < RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE) continue;
    const prices = group.map((tx) => tx.resalePrice).sort((a, b) => a - b);
    const medianPrice = percentile(prices, 0.5);
    if (!Number.isFinite(medianPrice) || medianPrice <= 0) continue;

    const q1 = percentile(prices, 0.25);
    const q3 = percentile(prices, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - iqr * RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER;
    const upperFence = q3 + iqr * RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER;

    for (const tx of group) {
      const percentFromMedian = ((tx.resalePrice - medianPrice) / medianPrice) * 100;
      const isHigh =
        tx.resalePrice > upperFence &&
        percentFromMedian >= RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD;
      const isLow =
        tx.resalePrice < lowerFence &&
        percentFromMedian <= -RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD;
      if (!isHigh && !isLow) continue;

      outliers.set(tx.id, {
        id: tx.id,
        flatType,
        direction: isHigh ? "high" : "low",
        medianPrice,
        percentFromMedian,
      });
    }
  }

  return outliers;
}

export type ComparableSummary = {
  count: number;
  medianPrice: number;
  medianPricePerSqm: number;
  p25Price: number;
  p75Price: number;
  minPrice: number;
  maxPrice: number;
  latestMonth: string | null;
};

export function summarizeComparables(
  comparables: ReadonlyArray<AddressDetailTransaction>,
): ComparableSummary | null {
  if (comparables.length === 0) return null;
  const prices = comparables.map((tx) => tx.resalePrice);
  const pricePerSqm = comparables.map((tx) => tx.pricePerSqm);
  let latestMonth: string | null = null;

  for (const comparable of comparables) {
    if (!latestMonth || comparable.month > latestMonth) latestMonth = comparable.month;
  }

  prices.sort((a, b) => a - b);
  pricePerSqm.sort((a, b) => a - b);

  return {
    count: comparables.length,
    medianPrice: percentile(prices, 0.5),
    medianPricePerSqm: percentile(pricePerSqm, 0.5),
    p25Price: percentile(prices, 0.25),
    p75Price: percentile(prices, 0.75),
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    latestMonth,
  };
}

export type AskingPriceAssessment = {
  comparableCount: number;
  summary: ComparableSummary;
  deltaVsMedian: number;
  deltaVsMedianPct: number;
  deltaVsP75: number;
  deltaVsP75Pct: number;
  deltaVsMax: number;
  deltaVsMaxPct: number;
  percentileAmongComparables: number;
  askingPricePerSqm: number | null;
  pricePerSqmDeltaPct: number | null;
  verdict: "well_below" | "below" | "fair" | "above" | "well_above";
};

export function assessAskingPrice(params: {
  askingPrice: number;
  floorAreaSqm: number | null;
  comparables: ReadonlyArray<AddressDetailTransaction>;
}): AskingPriceAssessment | null {
  const summary = summarizeComparables(params.comparables);
  if (!summary) return null;

  const deltaVsMedian = params.askingPrice - summary.medianPrice;
  const deltaVsP75 = params.askingPrice - summary.p75Price;
  const deltaVsMax = params.askingPrice - summary.maxPrice;

  let belowCount = 0;
  for (const comparable of params.comparables) {
    if (comparable.resalePrice < params.askingPrice) belowCount++;
  }

  const askingPricePerSqm =
    params.floorAreaSqm && params.floorAreaSqm > 0
      ? params.askingPrice / params.floorAreaSqm
      : null;
  const pricePerSqmDeltaPct =
    askingPricePerSqm != null && summary.medianPricePerSqm > 0
      ? ((askingPricePerSqm - summary.medianPricePerSqm) / summary.medianPricePerSqm) * 100
      : null;

  const pctVsMedian = summary.medianPrice > 0 ? (deltaVsMedian / summary.medianPrice) * 100 : 0;
  let verdict: AskingPriceAssessment["verdict"];
  if (pctVsMedian <= -10) verdict = "well_below";
  else if (pctVsMedian < -3) verdict = "below";
  else if (pctVsMedian <= 3) verdict = "fair";
  else if (pctVsMedian < 10) verdict = "above";
  else verdict = "well_above";

  return {
    comparableCount: params.comparables.length,
    summary,
    deltaVsMedian,
    deltaVsMedianPct: pctVsMedian,
    deltaVsP75,
    deltaVsP75Pct: summary.p75Price > 0 ? (deltaVsP75 / summary.p75Price) * 100 : 0,
    deltaVsMax,
    deltaVsMaxPct: summary.maxPrice > 0 ? (deltaVsMax / summary.maxPrice) * 100 : 0,
    percentileAmongComparables: (belowCount / params.comparables.length) * 100,
    askingPricePerSqm,
    pricePerSqmDeltaPct,
    verdict,
  };
}
