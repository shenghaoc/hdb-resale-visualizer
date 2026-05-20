import type { BlockSummary } from "@/types/data";

export type ComparableRange = {
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  sampleSize: number;
  sourceMedian: number;
  deltaFromMedianPct: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeComparableRange(
  source: BlockSummary,
  similar: ReadonlyArray<BlockSummary>,
): ComparableRange | null {
  if (similar.length === 0) return null;

  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  const prices: number[] = [];
  for (const block of similar) {
    const price = block.medianPrice;
    if (price < minPrice) minPrice = price;
    if (price > maxPrice) maxPrice = price;
    prices.push(price);
  }

  const medianPrice = median(prices);
  const deltaFromMedianPct =
    medianPrice > 0 ? ((source.medianPrice - medianPrice) / medianPrice) * 100 : 0;

  return {
    minPrice,
    maxPrice,
    medianPrice,
    sampleSize: similar.length,
    sourceMedian: source.medianPrice,
    deltaFromMedianPct,
  };
}
