import { getCurrentYear } from "@/shared/lib/constants";
import { createProfileEvaluator } from "./matchProfile";
import { median } from "@/shared/lib/utils";
import { getEffectiveMedianPrice } from "@shared/product/filtering";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

export type TownRecommendation = {
  town: string;
  totalBlocks: number;
  matchingBlocks: number;
  matchShare: number;
  medianPrice: number;
};

export type BuildTownRecommendationsOptions = {
  limit?: number;
  minBlocksPerTown?: number;
};

export function buildTownRecommendations(
  profile: SearchProfile,
  blocks: ReadonlyArray<BlockSummary>,
  options: BuildTownRecommendationsOptions = {},
): TownRecommendation[] {
  const { limit = 4, minBlocksPerTown = 3 } = options;
  if (blocks.length === 0) return [];

  const currentYear = getCurrentYear();

  const evaluate = createProfileEvaluator(profile, currentYear);

  const grouped = new Map<
    string,
    {
      total: number;
      matching: number;
      prices: number[];
    }
  >();

  for (const block of blocks) {
    let bucket = grouped.get(block.town);
    if (!bucket) {
      bucket = { total: 0, matching: 0, prices: [] };
      grouped.set(block.town, bucket);
    }
    bucket.total += 1;
    const { tier } = evaluate(block);
    if (tier === "strong") {
      bucket.matching += 1;
      bucket.prices.push(getEffectiveMedianPrice(block, profile.mainFlatType));
    }
  }

  const recommendations: TownRecommendation[] = [];
  for (const [town, bucket] of grouped) {
    if (bucket.total < minBlocksPerTown) continue;
    if (bucket.matching === 0) continue;
    recommendations.push({
      town,
      totalBlocks: bucket.total,
      matchingBlocks: bucket.matching,
      matchShare: bucket.matching / bucket.total,
      medianPrice: median(bucket.prices),
    });
  }

  recommendations.sort((a, b) => {
    if (b.matchShare !== a.matchShare) return b.matchShare - a.matchShare;
    if (b.matchingBlocks !== a.matchingBlocks) return b.matchingBlocks - a.matchingBlocks;
    if (a.medianPrice !== b.medianPrice) return a.medianPrice - b.medianPrice;
    return a.town < b.town ? -1 : 1;
  });

  return recommendations.slice(0, limit);
}
