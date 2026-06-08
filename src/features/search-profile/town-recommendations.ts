import { getCurrentYear } from "@/shared/lib/constants";
import { evaluateBlockForProfile, type MatchTier } from "./matchProfile";
import { median } from "@/shared/lib/utils";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

export type TownRecommendation = {
  town: string;
  totalBlocks: number;
  strongCount: number;
  goodCount: number;
  stretchCount: number;
  matchShare: number;
  medianPrice: number;
};

export type BuildTownRecommendationsOptions = {
  limit?: number;
  minBlocksPerTown?: number;
};

const TIER_WEIGHT: Record<MatchTier, number> = {
  strong: 1,
  good: 0.7,
  stretch: 0.4,
  weak: 0,
};

export function buildTownRecommendations(
  profile: SearchProfile,
  blocks: ReadonlyArray<BlockSummary>,
  options: BuildTownRecommendationsOptions = {},
): TownRecommendation[] {
  const { limit = 4, minBlocksPerTown = 3 } = options;
  if (blocks.length === 0) return [];

  const currentYear = getCurrentYear();
  const grouped = new Map<
    string,
    {
      total: number;
      strong: number;
      good: number;
      stretch: number;
      weighted: number;
      prices: number[];
    }
  >();

  for (const block of blocks) {
    let bucket = grouped.get(block.town);
    if (!bucket) {
      bucket = { total: 0, strong: 0, good: 0, stretch: 0, weighted: 0, prices: [] };
      grouped.set(block.town, bucket);
    }
    bucket.total += 1;
    bucket.prices.push(block.medianPrice);
    const { tier } = evaluateBlockForProfile(block, profile, currentYear);
    bucket.weighted += TIER_WEIGHT[tier];
    if (tier === "strong") bucket.strong += 1;
    else if (tier === "good") bucket.good += 1;
    else if (tier === "stretch") bucket.stretch += 1;
  }

  const recommendations: TownRecommendation[] = [];
  for (const [town, bucket] of grouped) {
    if (bucket.total < minBlocksPerTown) continue;
    if (bucket.strong + bucket.good + bucket.stretch === 0) continue;
    recommendations.push({
      town,
      totalBlocks: bucket.total,
      strongCount: bucket.strong,
      goodCount: bucket.good,
      stretchCount: bucket.stretch,
      matchShare: bucket.weighted / bucket.total,
      medianPrice: median(bucket.prices),
    });
  }

  recommendations.sort((a, b) => {
    if (b.matchShare !== a.matchShare) return b.matchShare - a.matchShare;
    if (b.strongCount !== a.strongCount) return b.strongCount - a.strongCount;
    if (a.medianPrice !== b.medianPrice) return a.medianPrice - b.medianPrice;
    return a.town < b.town ? -1 : 1;
  });

  return recommendations.slice(0, limit);
}
