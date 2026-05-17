import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import { evaluateBlockForProfile } from "@/lib/matchProfile";

export type TownRecommendation = {
  town: string;
  score: number;
  matchingBlocks: number;
  medianPrice: number | null;
  leasePassRate: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

export function buildTownRecommendations(
  blocks: readonly BlockSummary[],
  profile: SearchProfile,
  limit = 6,
): TownRecommendation[] {
  const byTown = new Map<string, BlockSummary[]>();
  for (const b of blocks) {
    const arr = byTown.get(b.town) ?? [];
    arr.push(b);
    byTown.set(b.town, arr);
  }

  const recs: TownRecommendation[] = [];
  for (const [town, townBlocks] of byTown.entries()) {
    const prices = townBlocks.map((b) => b.medianPrice).filter(Number.isFinite);
    const medianPrice = median(prices);

    let matchingBlocks = 0;
    let leasePassCount = 0;
    for (const block of townBlocks) {
      const evalResult = evaluateBlockForProfile(block, profile);
      if (evalResult.tier !== "weak") matchingBlocks += 1;
      if (profile.minimumRemainingLeaseYears == null || evalResult.tier !== "weak") leasePassCount += 1;
    }

    const leasePassRate = townBlocks.length > 0 ? leasePassCount / townBlocks.length : 0;

    const affordabilityScore =
      profile.maxBudget && medianPrice ? Math.max(0, 1 - Math.max(0, medianPrice - profile.maxBudget) / profile.maxBudget) : 0.5;
    const supplyScore = townBlocks.length > 0 ? matchingBlocks / townBlocks.length : 0;
    const leaseScore = leasePassRate;

    const score = affordabilityScore * 0.5 + leaseScore * 0.3 + supplyScore * 0.2;

    recs.push({ town, score, matchingBlocks, medianPrice, leasePassRate });
  }

  return recs.sort((a, b) => b.score - a.score || a.town.localeCompare(b.town)).slice(0, limit);
}
