import { median } from "@/shared/lib/utils";
import type { BlockSummary } from "@/types/data";

export type ComparableRange = {
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  sampleSize: number;
  sourceMedian: number;
  deltaFromMedianPct: number;
};

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
