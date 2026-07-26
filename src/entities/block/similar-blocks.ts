import type { BlockSummary } from "../../types/data";
import { canonicalFlatType } from "@shared/filter-options";
import {
  resolveEffectiveMedianPrice,
  resolveEffectivePricePerSqmMedian,
} from "@shared/product/filtering";

export type RankSimilarBlocksOptions = {
  /** Maximum number of results to return. Defaults to 6. */
  limit?: number;
  /** When set, require and compare the same canonical flat type. */
  flatType?: string;
  /**
   * Drop the price and $/sqm terms from the score. Use this when the ranked set
   * will itself be used as a price benchmark: peers chosen for having a similar
   * price make any price comparison circular, so every block looks average.
   */
  ignorePriceProximity?: boolean;
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
 * Price/sqm          0.10  — pricePerSqmMedian; exponential decay; 20% difference → ~0.37
 * Lease commence     0.05  — exponential decay; 5-yr gap → ~0.37
 * MRT distance       0.05  — exponential decay; 300 m gap → ~0.37 (neutral 0.5 if data absent)
 */
export function scoreSimilarity(
  source: BlockSummary,
  candidate: BlockSummary,
  sourceSet?: Set<string>,
  flatType = "",
  ignorePriceProximity = false,
): number {
  // ── Same-town bonus ──────────────────────────────────────────────────────
  const townScore = source.town === candidate.town ? 0.3 : 0;

  // ── Flat-type overlap (Jaccard) ──────────────────────────────────────────
  const canonicalSelectedFlatType = flatType ? canonicalFlatType(flatType) : "";
  const effectiveSourceSet = canonicalSelectedFlatType
    ? new Set([canonicalSelectedFlatType])
    : (sourceSet ?? new Set(source.flatTypes.map(canonicalFlatType)));
  const candidateSet = new Set(candidate.flatTypes.map(canonicalFlatType));
  let intersection = 0;
  for (const t of candidateSet) {
    if (effectiveSourceSet.has(t)) {
      intersection++;
    }
  }
  if (intersection === 0) return 0; // No overlap at all — not similar
  const unionSize = effectiveSourceSet.size + candidateSet.size - intersection;
  const flatTypeScore = (intersection / unionSize) * 0.25;

  // ── Price similarity ─────────────────────────────────────────────────────
  const sourcePriceResolution = resolveEffectiveMedianPrice(source, canonicalSelectedFlatType);
  const candidatePriceResolution = resolveEffectiveMedianPrice(
    candidate,
    canonicalSelectedFlatType,
  );
  const sourcePpsmResolution = resolveEffectivePricePerSqmMedian(source, canonicalSelectedFlatType);
  const candidatePpsmResolution = resolveEffectivePricePerSqmMedian(
    candidate,
    canonicalSelectedFlatType,
  );
  if (
    canonicalSelectedFlatType &&
    (!sourcePriceResolution.isTypeSpecific ||
      !candidatePriceResolution.isTypeSpecific ||
      !sourcePpsmResolution.isTypeSpecific ||
      !candidatePpsmResolution.isTypeSpecific)
  ) {
    return 0;
  }
  const sourcePrice = sourcePriceResolution.value;
  const candidatePrice = candidatePriceResolution.value;
  const priceDiffFraction =
    sourcePrice > 0 ? Math.abs(candidatePrice - sourcePrice) / sourcePrice : 0;
  const priceScore = ignorePriceProximity ? 0 : Math.exp(-5 * priceDiffFraction) * 0.25;

  // ── Price-per-sqm similarity ──────────────────────────────────────────────
  const sourcePpsm = sourcePpsmResolution.value;
  const candidatePpsm = candidatePpsmResolution.value;
  const psmDiffFraction = sourcePpsm > 0 ? Math.abs(candidatePpsm - sourcePpsm) / sourcePpsm : 0;
  const psmScore = ignorePriceProximity ? 0 : Math.exp(-5 * psmDiffFraction) * 0.1;

  // ── Lease-commence similarity ─────────────────────────────────────────────
  const sourceMidLease = (source.leaseCommenceRange[0] + source.leaseCommenceRange[1]) / 2;
  const candidateMidLease = (candidate.leaseCommenceRange[0] + candidate.leaseCommenceRange[1]) / 2;
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
  const { limit = 6, flatType = "", ignorePriceProximity = false } = options;

  type Scored = { block: BlockSummary; score: number };
  const scored: Scored[] = [];
  const sourceSet = new Set(source.flatTypes.map(canonicalFlatType));

  for (const candidate of candidates) {
    if (candidate.addressKey === source.addressKey) continue;
    const score = scoreSimilarity(source, candidate, sourceSet, flatType, ignorePriceProximity);
    if (score > 0) {
      scored.push({ block: candidate, score });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.block.addressKey < b.block.addressKey
        ? -1
        : a.block.addressKey > b.block.addressKey
          ? 1
          : 0),
  );
  return scored.slice(0, limit).map((s) => s.block);
}
