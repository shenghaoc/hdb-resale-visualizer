import type { BlockSummary, TownFlatTypeTrendPoint } from "../../types/data";

/** YYYY-MM month window (lexicographic order matches chronological order). */
export type TrendMonthRange = { start: string; end: string };

export type TownFlatTypeRollup = {
  flatType: string;
  windowTransactionVolume: number;
  latestMonth: string | null;
  latestMedianPrice: number | null;
  latestMedianPricePerSqm: number | null;
};

export type LeaseCommenceDecadeBucket = {
  /** Start year of decade bucket (e.g. 1990 → 1990s). */
  decadeStart: number;
  /** Compact label suitable for charts. */
  decadeLabel: string;
  blockCount: number;
};

export function clampMonthToDataWindow(
  month: string,
  dataWindow: { minMonth: string; maxMonth: string },
): string {
  if (month < dataWindow.minMonth) return dataWindow.minMonth;
  if (month > dataWindow.maxMonth) return dataWindow.maxMonth;
  return month;
}

export function resolveTrendMonthRange(
  dataWindow: { minMonth: string; maxMonth: string },
  startMonth: string | null,
  endMonth: string | null,
): TrendMonthRange {
  const rawStart = startMonth ?? dataWindow.minMonth;
  const rawEnd = endMonth ?? dataWindow.maxMonth;
  const start = clampMonthToDataWindow(rawStart, dataWindow);
  const end = clampMonthToDataWindow(rawEnd, dataWindow);
  if (start <= end) {
    return { start, end };
  }
  return { start: dataWindow.minMonth, end: dataWindow.maxMonth };
}

export function medianNumeric(values: readonly number[]): number | null {
  const n = values.length;
  if (n === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted.at(mid) ?? null;
  }
  const lower = sorted.at(mid - 1);
  const upper = sorted.at(mid);
  if (lower === undefined || upper === undefined) return null;
  return (lower + upper) / 2;
}

export function filterTownFlatTrendsInRange(
  trends: readonly TownFlatTypeTrendPoint[],
  town: string,
  range: TrendMonthRange,
): TownFlatTypeTrendPoint[] {
  const rows: TownFlatTypeTrendPoint[] = [];
  for (const row of trends) {
    if (row.town !== town) continue;
    if (row.month < range.start || row.month > range.end) continue;
    rows.push(row);
  }
  return rows;
}

function groupTownFlatTrendsByFlatType(
  points: readonly TownFlatTypeTrendPoint[],
): Map<string, TownFlatTypeTrendPoint[]> {
  const byType = new Map<string, TownFlatTypeTrendPoint[]>();
  for (const row of points) {
    const list = byType.get(row.flatType) ?? [];
    list.push(row);
    byType.set(row.flatType, list);
  }
  return byType;
}

function rollupTownFlatTypeGroup(points: TownFlatTypeTrendPoint[]): TownFlatTypeRollup {
  const first = points[0];
  if (!first) {
    throw new RangeError("rollupTownFlatTypeGroup: empty group");
  }
  let latestMonth = first.month;
  let latest = first;
  let volume = 0;
  for (const p of points) {
    volume += p.transactionCount;
    if (p.month > latestMonth) {
      latestMonth = p.month;
      latest = p;
    }
  }
  return {
    flatType: first.flatType,
    windowTransactionVolume: volume,
    latestMonth,
    latestMedianPrice: latest.medianPrice ?? null,
    latestMedianPricePerSqm: latest.medianPricePerSqm ?? null,
  };
}

export function rollupTownFlatTypesInRange(
  trends: readonly TownFlatTypeTrendPoint[],
  town: string,
  range: TrendMonthRange,
): TownFlatTypeRollup[] {
  const filtered = filterTownFlatTrendsInRange(trends, town, range);
  const byType = groupTownFlatTrendsByFlatType(filtered);
  return [...byType.values()]
    .map((group) => rollupTownFlatTypeGroup(group))
    .sort((a, b) => a.flatType.localeCompare(b.flatType));
}

export function sumRollupVolume(rollups: readonly TownFlatTypeRollup[]): number {
  return rollups.reduce((sum, row) => sum + row.windowTransactionVolume, 0);
}

/** Volume-weighted mean of latest monthly median $/sqm (one value per flat type). */
export function volumeWeightedMeanLatestMedianPricePerSqm(
  rollups: readonly TownFlatTypeRollup[],
): number | null {
  let weight = 0;
  let sum = 0;
  for (const row of rollups) {
    if (row.latestMedianPricePerSqm === null || row.windowTransactionVolume <= 0) continue;
    sum += row.latestMedianPricePerSqm * row.windowTransactionVolume;
    weight += row.windowTransactionVolume;
  }
  if (weight === 0) {
    return null;
  }
  return sum / weight;
}

/** Buckets lease commence **upper bound year** (`leaseCommenceRange[1]`) into decades. */
export function buildLeaseCommencementHistogram(
  blocks: readonly Pick<BlockSummary, "leaseCommenceRange">[],
): LeaseCommenceDecadeBucket[] {
  const counts = new Map<number, number>();
  for (const block of blocks) {
    const yearUpper = block.leaseCommenceRange[1];
    const decadeStart = Math.floor(yearUpper / 10) * 10;
    counts.set(decadeStart, (counts.get(decadeStart) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([decadeStart, blockCount]) => ({
      decadeStart,
      decadeLabel: `${decadeStart}s`,
      blockCount,
    }));
}

export function pickTopBlocksByTransactionCount(
  blocks: readonly BlockSummary[],
  limit: number,
): BlockSummary[] {
  if (limit <= 0) return [];
  return [...blocks]
    .sort((a, b) => {
      if (b.transactionCount !== a.transactionCount) return b.transactionCount - a.transactionCount;
      return a.addressKey.localeCompare(b.addressKey);
    })
    .slice(0, limit);
}

export function pickBlocksBelowTownMedian(
  blocks: readonly BlockSummary[],
  limit: number,
): { townMedian: number | null; blocks: BlockSummary[] } {
  if (blocks.length === 0) {
    return { townMedian: null, blocks: [] };
  }
  const townMedian = medianNumeric(blocks.map((b) => b.medianPrice));
  if (townMedian === null) {
    return { townMedian, blocks: [] };
  }
  if (limit <= 0) {
    return { townMedian, blocks: [] };
  }
  const belowMedianBlocks = [...blocks]
    .filter((b) => b.medianPrice < townMedian)
    .sort((a, b) => {
      if (a.medianPrice !== b.medianPrice) return a.medianPrice - b.medianPrice;
      return a.addressKey.localeCompare(b.addressKey);
    })
    .slice(0, limit);
  return { townMedian, blocks: belowMedianBlocks };
}
