import { MAX_LEASE_DURATION, getCurrentYear } from "./constants";
import {
  buildLeaseCommencementHistogram,
  filterTownFlatTrendsInRange,
  medianNumeric,
  rollupTownFlatTypesInRange,
  sumRollupVolume,
  type TrendMonthRange,
} from "./town-profile";
import type { BlockSummary, TownFlatTypeTrendPoint } from "../types/data";

export type TownCompareSnapshot = {
  town: string;
  blockCount: number;
  windowVolume: number;
  medianPrice: number | null;
  medianPricePerSqm: number | null;
  medianRemainingLeaseYears: number | null;
  /** Decade start year with the highest block count (e.g. 1990). */
  modalLeaseDecade: number | null;
  medianWalkSeconds: number | null;
  /** Volume-weighted median price 12 months prior to the window's latest month (null if not available). */
  yoyMedianPricePct: number | null;
};

export type CompareMetricKind =
  | "medianPrice"
  | "medianPricePerSqm"
  | "windowVolume"
  | "medianRemainingLeaseYears"
  | "medianWalkSeconds"
  | "blockCount";

export type DeltaTone = "better" | "worse" | "neutral";

export type MetricDelta = {
  /** Signed delta: (compare - primary). */
  delta: number;
  /** Percentage change relative to primary (null when primary is 0 or null). */
  pct: number | null;
  /** Tone evaluated from a buyer-friendly perspective. */
  tone: DeltaTone;
};

const SIGNIFICANT_THRESHOLDS: Record<CompareMetricKind, number> = {
  // Percent thresholds for ratio metrics:
  medianPrice: 0.05,
  medianPricePerSqm: 0.05,
  windowVolume: 0.2,
  blockCount: 0.2,
  // Absolute thresholds for unit metrics:
  medianRemainingLeaseYears: 5,
  medianWalkSeconds: 120,
};

/** Direction of "better" for each metric — true when lower compare value is better for a buyer. */
const LOWER_IS_BETTER: Record<CompareMetricKind, boolean> = {
  medianPrice: true,
  medianPricePerSqm: true,
  windowVolume: false,
  blockCount: false,
  medianRemainingLeaseYears: false,
  medianWalkSeconds: true,
};

function volumeWeightedMonthPrice(
  rows: readonly TownFlatTypeTrendPoint[],
  month: string,
): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const row of rows) {
    if (row.month !== month) continue;
    weightedSum += row.medianPrice * row.transactionCount;
    totalWeight += row.transactionCount;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function shiftMonthByYears(month: string, years: number): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [yearStr, monthStr] = month.split("-");
  const shiftedYear = Number(yearStr) + years;
  if (!Number.isFinite(shiftedYear)) return null;
  return `${String(shiftedYear).padStart(4, "0")}-${monthStr}`;
}

function pickModalLeaseDecade(
  blocks: ReadonlyArray<Pick<BlockSummary, "leaseCommenceRange">>,
): number | null {
  if (blocks.length === 0) return null;
  const buckets = buildLeaseCommencementHistogram(blocks);
  if (buckets.length === 0) return null;
  let best = buckets[0];
  for (const bucket of buckets) {
    if (
      bucket.blockCount > best.blockCount ||
      (bucket.blockCount === best.blockCount && bucket.decadeStart < best.decadeStart)
    ) {
      best = bucket;
    }
  }
  return best.decadeStart;
}

function computeYoyMedianPricePct(
  trends: readonly TownFlatTypeTrendPoint[],
  town: string,
  range: TrendMonthRange,
): number | null {
  const filtered = filterTownFlatTrendsInRange(trends, town, range);
  if (filtered.length === 0) return null;
  let latestMonth: string | null = null;
  for (const row of filtered) {
    if (!latestMonth || row.month > latestMonth) {
      latestMonth = row.month;
    }
  }
  if (!latestMonth) return null;
  const priorMonth = shiftMonthByYears(latestMonth, -1);
  if (!priorMonth) return null;
  const allRows = trends.filter((r) => r.town === town);
  const latestPrice = volumeWeightedMonthPrice(allRows, latestMonth);
  const priorPrice = volumeWeightedMonthPrice(allRows, priorMonth);
  if (latestPrice === null || priorPrice === null || priorPrice === 0) return null;
  return ((latestPrice - priorPrice) / priorPrice) * 100;
}

function computeMedianRemainingLease(
  blocks: ReadonlyArray<Pick<BlockSummary, "leaseCommenceRange">>,
  currentYear: number,
): number | null {
  if (blocks.length === 0) return null;
  const years: number[] = [];
  for (const block of blocks) {
    const upper = block.leaseCommenceRange[1];
    const remaining = MAX_LEASE_DURATION - (currentYear - upper);
    if (Number.isFinite(remaining)) {
      years.push(remaining);
    }
  }
  return medianNumeric(years);
}

function computeMedianWalkSeconds(
  blocks: ReadonlyArray<Pick<BlockSummary, "nearestMrt">>,
): number | null {
  const values: number[] = [];
  for (const block of blocks) {
    const walk = block.nearestMrt?.walkingTimeSeconds;
    if (typeof walk === "number" && Number.isFinite(walk)) {
      values.push(walk);
    }
  }
  return medianNumeric(values);
}

export type BuildTownCompareSnapshotArgs = {
  town: string;
  blocks: ReadonlyArray<BlockSummary>;
  trends: ReadonlyArray<TownFlatTypeTrendPoint>;
  range: TrendMonthRange;
  currentYear?: number;
};

export function buildTownCompareSnapshot(args: BuildTownCompareSnapshotArgs): TownCompareSnapshot {
  const { town, blocks, trends, range, currentYear = getCurrentYear() } = args;
  const rollups = rollupTownFlatTypesInRange(trends, town, range);
  const windowVolume = sumRollupVolume(rollups);

  // Use a single loop to avoid multiple intermediate array allocations from .map().filter()
  const blockMedianPrices: number[] = [];
  const blockMedianSqm: number[] = [];
  for (const b of blocks) {
    if (Number.isFinite(b.medianPrice)) {
      blockMedianPrices.push(b.medianPrice);
    }
    if (Number.isFinite(b.pricePerSqmMedian)) {
      blockMedianSqm.push(b.pricePerSqmMedian);
    }
  }

  return {
    town,
    blockCount: blocks.length,
    windowVolume,
    medianPrice: medianNumeric(blockMedianPrices),
    medianPricePerSqm: medianNumeric(blockMedianSqm),
    medianRemainingLeaseYears: computeMedianRemainingLease(blocks, currentYear),
    modalLeaseDecade: pickModalLeaseDecade(blocks),
    medianWalkSeconds: computeMedianWalkSeconds(blocks),
    yoyMedianPricePct: computeYoyMedianPricePct(trends, town, range),
  };
}

export function computeMetricDelta(
  kind: CompareMetricKind,
  primary: number | null,
  compare: number | null,
): MetricDelta | null {
  if (primary === null || compare === null) return null;
  const delta = compare - primary;
  const pct = primary === 0 ? (compare === 0 ? 0 : null) : (delta / primary) * 100;
  const threshold = SIGNIFICANT_THRESHOLDS[kind];
  const lowerIsBetter = LOWER_IS_BETTER[kind];

  let isSignificant: boolean;
  if (kind === "medianRemainingLeaseYears" || kind === "medianWalkSeconds") {
    isSignificant = Math.abs(delta) >= threshold;
  } else if (primary === 0) {
    isSignificant = compare !== 0;
  } else {
    isSignificant = pct !== null && Math.abs(pct) >= threshold * 100;
  }

  let tone: DeltaTone;
  if (!isSignificant) {
    tone = "neutral";
  } else if (delta === 0) {
    tone = "neutral";
  } else {
    const compareIsLower = delta < 0;
    const compareIsBetter = lowerIsBetter ? compareIsLower : !compareIsLower;
    tone = compareIsBetter ? "better" : "worse";
  }

  return { delta, pct, tone };
}
