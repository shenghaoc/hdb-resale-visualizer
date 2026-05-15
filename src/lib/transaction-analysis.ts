import type {
  AddressDetailTransaction,
  AddressTrendPoint,
} from "@/types/data";

export type TrendRangeKey = "2y" | "5y" | "10y" | "max";

export const TREND_RANGE_MONTHS: Record<TrendRangeKey, number | null> = {
  "2y": 24,
  "5y": 60,
  "10y": 120,
  max: null,
};

export function parseStoreyMidpoint(storeyRange: string): number | null {
  const match = storeyRange.match(/(\d+)\s*(?:TO|-)\s*(\d+)/i);
  if (match) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return (low + high) / 2;
    }
  }
  const single = storeyRange.match(/\d+/);
  return single ? Number(single[0]) : null;
}

export type ComparableTolerances = {
  storey: number;
  sqm: number;
};

export const DEFAULT_TOLERANCES: ComparableTolerances = {
  storey: 3,
  sqm: 5,
};

export type ComparableQuery = {
  flatType: string | null;
  storeyMidpoint: number | null;
  floorAreaSqm: number | null;
  tolerances?: ComparableTolerances;
};

export function findComparableTransactions(
  transactions: ReadonlyArray<AddressDetailTransaction>,
  query: ComparableQuery,
): AddressDetailTransaction[] {
  const tol = query.tolerances ?? DEFAULT_TOLERANCES;
  return transactions.filter((tx) => {
    if (query.flatType && tx.flatType !== query.flatType) return false;
    if (query.storeyMidpoint != null) {
      const mid = parseStoreyMidpoint(tx.storeyRange);
      if (mid == null || Math.abs(mid - query.storeyMidpoint) > tol.storey) {
        return false;
      }
    }
    if (query.floorAreaSqm != null) {
      if (Math.abs(tx.floorAreaSqm - query.floorAreaSqm) > tol.sqm) return false;
    }
    return true;
  });
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
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
    const q1 = percentile(prices, 0.25);
    const q3 = percentile(prices, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - iqr * RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER;
    const upperFence = q3 + iqr * RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER;

    for (const tx of group) {
      if (!Number.isFinite(medianPrice) || medianPrice <= 0) continue;
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

export function summarizeComparables(
  comparables: ReadonlyArray<AddressDetailTransaction>,
): ComparableSummary | null {
  if (comparables.length === 0) return null;
  const prices = new Array<number>(comparables.length);
  const psm = new Array<number>(comparables.length);
  let latestMonth: string | null = null;

  for (let i = 0; i < comparables.length; i++) {
    const t = comparables[i];
    prices[i] = t.resalePrice;
    psm[i] = t.pricePerSqm;
    if (!latestMonth || t.month > latestMonth) {
      latestMonth = t.month;
    }
  }

  prices.sort((a, b) => a - b);
  psm.sort((a, b) => a - b);

  return {
    count: comparables.length,
    medianPrice: percentile(prices, 0.5),
    medianPricePerSqm: percentile(psm, 0.5),
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
  for (const t of params.comparables) {
    if (t.resalePrice < params.askingPrice) {
      belowCount++;
    }
  }
  const percentileAmongComparables = (belowCount / params.comparables.length) * 100;

  const askingPricePerSqm =
    params.floorAreaSqm && params.floorAreaSqm > 0
      ? params.askingPrice / params.floorAreaSqm
      : null;
  const pricePerSqmDeltaPct =
    askingPricePerSqm != null && summary.medianPricePerSqm > 0
      ? ((askingPricePerSqm - summary.medianPricePerSqm) /
          summary.medianPricePerSqm) *
        100
      : null;

  const pctVsMedian = (deltaVsMedian / summary.medianPrice) * 100;
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
    deltaVsP75Pct: (deltaVsP75 / summary.p75Price) * 100,
    deltaVsMax,
    deltaVsMaxPct: (deltaVsMax / summary.maxPrice) * 100,
    percentileAmongComparables,
    askingPricePerSqm,
    pricePerSqmDeltaPct,
    verdict,
  };
}

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

export const YOY_STABILITY_THRESHOLD_PCT = 1.5;

export function computeBlockTrajectory(
  monthlyTrend: ReadonlyArray<AddressTrendPoint>,
): BlockTrajectory | null {
  if (monthlyTrend.length === 0) return null;

  const sorted = [...monthlyTrend].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  if (!latest || !Number.isFinite(latest.medianPrice)) return null;

  let peak = sorted[0];
  for (const point of sorted) {
    if (point.medianPrice > peak.medianPrice) peak = point;
  }

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
    yoyAnchor && yoyAnchor.medianPrice > 0
      ? (yoyDelta! / yoyAnchor.medianPrice) * 100
      : null;

  const peakToCurrentPct =
    peak.medianPrice > 0
      ? ((latest.medianPrice - peak.medianPrice) / peak.medianPrice) * 100
      : 0;

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
      envelope.set(point.month, {
        min: Math.min(...prices),
        max: Math.max(...prices),
      });
    }
  }
  return envelope;
}
