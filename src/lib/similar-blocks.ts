import type { BlockSummary } from "@/types/data";

export type RankSimilarBlocksOptions = {
  /** Maximum number of results to return. Defaults to 6. */
  limit?: number;
};

/**
 * Score a pair of blocks for similarity. Each dimension contributes an
 * independent, normalised weight; the total max score is 1.0.
 *
 * Weights
 * -------
 * Same town          0.30  — binary
 * Flat-type overlap  0.25  — Jaccard similarity of flat-type sets
 * Price              0.25  — exponential decay; 20% difference → ~0.37
 * Price/sqm (proxy)  0.10  — estimated from medianPrice / mid(floorAreaRange)
 * Lease commence     0.05  — exponential decay; 5-yr gap → ~0.37
 * MRT distance       0.05  — exponential decay; 300 m gap → ~0.37 (neutral 0.5 if data absent)
 */
export function scoreSimilarity(source: BlockSummary, candidate: BlockSummary): number {
  // ── Same-town bonus ──────────────────────────────────────────────────────
  const townScore = source.town === candidate.town ? 0.3 : 0;

  // ── Flat-type overlap (Jaccard) ──────────────────────────────────────────
  const sourceSet = new Set(source.flatTypes);
  const intersection = candidate.flatTypes.filter((t) => sourceSet.has(t)).length;
  if (intersection === 0) return 0; // No overlap at all — not similar
  const unionSize = new Set([...source.flatTypes, ...candidate.flatTypes]).size;
  const flatTypeScore = unionSize > 0 ? (intersection / unionSize) * 0.25 : 0;

  // ── Price similarity ─────────────────────────────────────────────────────
  const priceDiffFraction =
    source.medianPrice > 0
      ? Math.abs(candidate.medianPrice - source.medianPrice) / source.medianPrice
      : 0;
  const priceScore = Math.exp(-5 * priceDiffFraction) * 0.25;

  // ── Price-per-sqm similarity (estimated) ─────────────────────────────────
  const sourceMidArea = (source.floorAreaRange[0] + source.floorAreaRange[1]) / 2;
  const candidateMidArea = (candidate.floorAreaRange[0] + candidate.floorAreaRange[1]) / 2;
  const sourcePsm = sourceMidArea > 0 ? source.medianPrice / sourceMidArea : 0;
  const candidatePsm = candidateMidArea > 0 ? candidate.medianPrice / candidateMidArea : 0;
  const psmDiffFraction = sourcePsm > 0 ? Math.abs(candidatePsm - sourcePsm) / sourcePsm : 0;
  const psmScore = Math.exp(-5 * psmDiffFraction) * 0.1;

  // ── Lease-commence similarity ─────────────────────────────────────────────
  const sourceMidLease = (source.leaseCommenceRange[0] + source.leaseCommenceRange[1]) / 2;
  const candidateMidLease =
    (candidate.leaseCommenceRange[0] + candidate.leaseCommenceRange[1]) / 2;
  const leaseDiffYears = Math.abs(candidateMidLease - sourceMidLease);
  const leaseScore = Math.exp(-leaseDiffYears / 5) * 0.05;

  // ── MRT-distance similarity ───────────────────────────────────────────────
  let mrtScore = 0.5 * 0.05; // neutral when data is absent
  const sourceMrt = source.nearestMrt?.distanceMeters;
  const candidateMrt = candidate.nearestMrt?.distanceMeters;
  if (sourceMrt != null && candidateMrt != null) {
    mrtScore = Math.exp(-Math.abs(candidateMrt - sourceMrt) / 300) * 0.05;
  }

  return townScore + flatTypeScore + priceScore + psmScore + leaseScore + mrtScore;
}

/**
 * Rank blocks by similarity to `source` and return the top results.
 *
 * Pure function — no side effects, no API calls.
 */
export function rankSimilarBlocks(
  source: BlockSummary,
  candidates: ReadonlyArray<BlockSummary>,
  options: RankSimilarBlocksOptions = {},
): BlockSummary[] {
  const { limit = 6 } = options;

  type Scored = { block: BlockSummary; score: number };
  const scored: Scored[] = [];

  for (const candidate of candidates) {
    if (candidate.addressKey === source.addressKey) continue;
    const score = scoreSimilarity(source, candidate);
    if (score > 0) {
      scored.push({ block: candidate, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.block.addressKey.localeCompare(b.block.addressKey));
  return scored.slice(0, limit).map((s) => s.block);
}
