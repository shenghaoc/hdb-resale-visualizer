/**
 * Time-Adjusted Comparable Prices
 *
 * Pure TypeScript module with no side effects. Runs in both the API handler
 * (Cloudflare Workers) and in Vitest tests. Never imported by the browser
 * directly — the browser receives adjusted data from the API.
 *
 * Uses existing town × flat type × month median price per sqm from the
 * town_flat_type_trends D1 table (populated by the sync pipeline) to
 * compute a deterministic adjustment factor for older comparable
 * transactions. This is NOT a price forecast — it is a mechanical
 * restatement of observed historical data.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of transactions in a month for the median to be considered
 *  reliable. Months with fewer transactions are excluded from adjustment. */
export const MIN_TREND_SAMPLE_SIZE = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single data point from the town_flat_type_trends table. */
export type TrendPoint = {
  month: string;
  medianPricePerSqm: number;
  transactionCount: number;
};

/**
 * Lookup structure for town × flat type trend data.
 * Key format: `${town}__${flatType}` (e.g. "ANG MO KIO__4 ROOM").
 * Value: array of TrendPoint sorted by month ascending.
 */
export type TrendLookup = Map<string, TrendPoint[]>;

/** Result of time-adjusting a single comparable transaction. */
export type TimeAdjustmentResult = {
  /** The raw resale price (unchanged). */
  rawPrice: number;
  /** The raw price per sqm (unchanged). */
  rawPricePerSqm: number;
  /** Adjusted price = rawPrice × adjustmentFactor, or null if unavailable. */
  adjustedPrice: number | null;
  /** Adjusted ppsm = rawPricePerSqm × adjustmentFactor, or null if unavailable. */
  adjustedPricePerSqm: number | null;
  /** The computed adjustment factor, or null if unavailable. */
  adjustmentFactor: number | null;
  /** Human-readable label explaining the adjustment, or null. */
  adjustmentLabel: string | null;
};

/**
 * Extended comparable transaction with time adjustment fields.
 * Includes both raw and adjusted price representations.
 */
export type TimeAdjustedComparable = {
  /** Original resale price (always present). */
  rawResalePrice: number;
  /** Original price per sqm (always present). */
  rawPricePerSqm: number;
  /** Time-adjusted resale price, or null if adjustment unavailable. */
  adjustedResalePrice: number | null;
  /** Time-adjusted price per sqm, or null if adjustment unavailable. */
  adjustedPricePerSqm: number | null;
  /** The computed adjustment factor, or null. */
  adjustmentFactor: number | null;
  /** Human-readable label, e.g. "Adjusted from 2022-03 median", or null. */
  adjustmentLabel: string | null;
};

/**
 * Top-level response metadata for a time-adjusted comparable set.
 */
export type AdjustmentMeta = {
  /** Whether time adjustment was requested and applied to any comparable. */
  adjustmentApplied: boolean;
  /** Caveats specific to time adjustment. */
  adjustmentCaveats: string[];
};

// ---------------------------------------------------------------------------
// TrendLookup builder
// ---------------------------------------------------------------------------

/**
 * Build a TrendLookup map from raw trend rows (as returned by D1).
 * Rows are expected to have snake_case column names matching the
 * town_flat_type_trends table schema.
 */
export function buildTrendLookup(
  rows: {
    town: string;
    flat_type: string;
    month: string;
    median_price_per_sqm: number;
    transaction_count: number;
  }[],
): TrendLookup {
  const map: TrendLookup = new Map();
  for (const row of rows) {
    const key = `${row.town}__${row.flat_type}`;
    const list = map.get(key) ?? [];
    list.push({
      month: row.month,
      medianPricePerSqm: row.median_price_per_sqm,
      transactionCount: row.transaction_count,
    });
    map.set(key, list);
  }
  // Sort each list by month ascending (lexicographic sort works for YYYY-MM).
  for (const list of map.values()) {
    list.sort((a, b) => a.month.localeCompare(b.month));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Core adjustment logic
// ---------------------------------------------------------------------------

/**
 * Find the latest qualifying month in a sorted TrendPoint array.
 * Walks backwards from the end, skipping months with transaction count
 * below MIN_TREND_SAMPLE_SIZE. Returns null if no qualifying month exists.
 */
export function findLatestQualifyingMonth(
  points: TrendPoint[],
): TrendPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].transactionCount >= MIN_TREND_SAMPLE_SIZE) {
      return points[i];
    }
  }
  return null;
}

/**
 * Find the TrendPoint for a specific month in a sorted array.
 * Uses binary search for O(log n) lookup.
 * Returns null if the month is not found.
 */
export function findMonthPoint(
  points: TrendPoint[],
  targetMonth: string,
): TrendPoint | null {
  let lo = 0;
  let hi = points.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cmp = points[mid].month.localeCompare(targetMonth);
    if (cmp < 0) {
      lo = mid + 1;
    } else if (cmp > 0) {
      hi = mid - 1;
    } else {
      return points[mid];
    }
  }
  return null;
}

/**
 * Compute a time-adjusted price for a single comparable transaction.
 *
 * Formula:
 *   adjustmentFactor = latestMedianPpsm / txMonthMedianPpsm
 *   adjustedPrice = Math.round(rawPrice * adjustmentFactor)
 *   adjustedPricePerSqm = +(rawPricePerSqm * adjustmentFactor).toFixed(2)
 *
 * Returns null adjustment when:
 * - No trend data exists for (town, flatType) at all.
 * - No data point exists for the transaction's specific month.
 * - The transaction month's sample count < MIN_TREND_SAMPLE_SIZE.
 * - No qualifying latest month exists (all months below threshold).
 * - The denominator median is zero (division guard — should never happen
 *   with real data, but enforced for safety).
 */
export function computeTimeAdjustment(
  town: string,
  flatType: string,
  txMonth: string,
  rawPrice: number,
  rawPricePerSqm: number,
  trendLookup: TrendLookup,
): TimeAdjustmentResult {
  const key = `${town}__${flatType}`;
  const points = trendLookup.get(key);

  // No trend data at all for this town × flat type.
  if (!points || points.length === 0) {
    return {
      rawPrice,
      rawPricePerSqm,
      adjustedPrice: null,
      adjustedPricePerSqm: null,
      adjustmentFactor: null,
      adjustmentLabel: null,
    };
  }

  // Find the transaction's specific month data point.
  const txPoint = findMonthPoint(points, txMonth);
  if (!txPoint) {
    // No data for this specific month.
    return {
      rawPrice,
      rawPricePerSqm,
      adjustedPrice: null,
      adjustedPricePerSqm: null,
      adjustmentFactor: null,
      adjustmentLabel: null,
    };
  }

  // Check sample size for the transaction month.
  if (txPoint.transactionCount < MIN_TREND_SAMPLE_SIZE) {
    return {
      rawPrice,
      rawPricePerSqm,
      adjustedPrice: null,
      adjustedPricePerSqm: null,
      adjustmentFactor: null,
      adjustmentLabel: null,
    };
  }

  // Find the latest qualifying month.
  const latestPoint = findLatestQualifyingMonth(points);
  if (!latestPoint) {
    // No qualifying latest month (all months below threshold).
    return {
      rawPrice,
      rawPricePerSqm,
      adjustedPrice: null,
      adjustedPricePerSqm: null,
      adjustmentFactor: null,
      adjustmentLabel: null,
    };
  }

  // Guard against zero denominator (should never happen with real data).
  if (txPoint.medianPricePerSqm === 0) {
    return {
      rawPrice,
      rawPricePerSqm,
      adjustedPrice: null,
      adjustedPricePerSqm: null,
      adjustmentFactor: null,
      adjustmentLabel: null,
    };
  }

  const adjustmentFactor = latestPoint.medianPricePerSqm / txPoint.medianPricePerSqm;

  const adjustedPrice = Math.round(rawPrice * adjustmentFactor);
  const adjustedPricePerSqm = Number(
    (rawPricePerSqm * adjustmentFactor).toFixed(2),
  );

  // Generate label.
  let adjustmentLabel: string;
  if (txPoint.month === latestPoint.month) {
    adjustmentLabel = "Already at latest period";
  } else {
    adjustmentLabel = `Adjusted from ${txPoint.month} median`;
  }

  return {
    rawPrice,
    rawPricePerSqm,
    adjustedPrice,
    adjustedPricePerSqm,
    adjustmentFactor,
    adjustmentLabel,
  };
}

/**
 * Compute time adjustments for an array of comparables and return both the
 * adjusted comparables and aggregate adjustment metadata.
 *
 * Each input comparable should have town, flatType, month, resalePrice,
 * and pricePerSqm fields. The function applies computeTimeAdjustment to
 * each entry and aggregates caveats.
 */
export function computeTimeAdjustments(
  comparables: {
    town: string;
    flatType: string;
    month: string;
    resalePrice: number;
    pricePerSqm: number;
  }[],
  trendLookup: TrendLookup,
): { adjustedComparables: TimeAdjustedComparable[]; meta: AdjustmentMeta } {
  const adjustedComparables: TimeAdjustedComparable[] = [];
  let adjustedCount = 0;

  for (const c of comparables) {
    const result = computeTimeAdjustment(
      c.town,
      c.flatType,
      c.month,
      c.resalePrice,
      c.pricePerSqm,
      trendLookup,
    );

    adjustedComparables.push({
      rawResalePrice: result.rawPrice,
      rawPricePerSqm: result.rawPricePerSqm,
      adjustedResalePrice: result.adjustedPrice,
      adjustedPricePerSqm: result.adjustedPricePerSqm,
      adjustmentFactor: result.adjustmentFactor,
      adjustmentLabel: result.adjustmentLabel,
    });

    if (result.adjustedPrice !== null) {
      adjustedCount++;
    }
  }

  const total = comparables.length;
  const skipped = total - adjustedCount;
  const adjustmentCaveats: string[] = [];

  if (adjustedCount > 0) {
    adjustmentCaveats.push(
      "Time adjustment applied using town × flat type historical medians. This is not a price forecast.",
    );
    if (skipped > 0) {
      adjustmentCaveats.push(
        `${skipped} of ${total} comparable transaction${total === 1 ? "" : "s"} could not be time-adjusted due to insufficient trend data.`,
      );
    }
  } else if (total > 0) {
    adjustmentCaveats.push(
      "No trend data available for this town and flat type — showing raw prices only.",
    );
  }

  return {
    adjustedComparables,
    meta: {
      adjustmentApplied: adjustedCount > 0,
      adjustmentCaveats,
    },
  };
}
