/**
 * Transaction-Level Comparable Engine v2
 *
 * Pure TypeScript module with no side effects. Runs in both the API handler
 * (Cloudflare Workers) and in Vitest tests. Never imported by the browser
 * directly — the browser calls the API endpoint instead.
 *
 * Key invariant: resale price and price per sqm are NEVER inputs to the
 * similarity score. The ScoringInput type enforces this at compile time.
 */

import type { TransactionRow } from "./data-types";

// ---------------------------------------------------------------------------
// Weight constants (sum to 1.0)
// ---------------------------------------------------------------------------

export const BLOCK_WEIGHT = 0.25;
export const STREET_WEIGHT = 0.1;
export const TOWN_WEIGHT = 0.05;
export const FLAT_TYPE_WEIGHT = 0.2;
export const FLOOR_AREA_WEIGHT = 0.15;
export const STOREY_WEIGHT = 0.1;
export const LEASE_WEIGHT = 0.1;
export const RECENCY_WEIGHT = 0.05;

/** The set of weights that apply when the lease component is excluded. */
export const WEIGHTS_WITHOUT_LEASE = {
  block: BLOCK_WEIGHT,
  street: STREET_WEIGHT,
  town: TOWN_WEIGHT,
  flatType: FLAT_TYPE_WEIGHT,
  floorArea: FLOOR_AREA_WEIGHT,
  storey: STOREY_WEIGHT,
  recency: RECENCY_WEIGHT,
} as const;

export const LEASE_WEIGHT_SUM_EXCLUDING_LEASE =
  BLOCK_WEIGHT +
  STREET_WEIGHT +
  TOWN_WEIGHT +
  FLAT_TYPE_WEIGHT +
  FLOOR_AREA_WEIGHT +
  STOREY_WEIGHT +
  RECENCY_WEIGHT;
// Should equal 0.90

// ---------------------------------------------------------------------------
// Widening / fallback constants
// ---------------------------------------------------------------------------

export const MIN_COMPARABLES = 8;
export const MAX_COMPARABLES = 30;
export const LOW_SAMPLE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Similarity range constants
// ---------------------------------------------------------------------------

export const FLOOR_AREA_FLOOR_SQM = 50;
export const STOREY_MAX_RANGE = 25;
export const LEASE_MAX_RANGE_YEARS = 50;
export const RECENCY_MAX_MONTHS = 60;
export const MATCH_REASON_THRESHOLD = 0.9;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Price-free subset of a transaction row used as scoring input.
 *  resalePrice and pricePerSqm are intentionally absent — the TypeScript
 *  compiler rejects any attempt to read price fields during scoring. */
export type ScoringInput = {
  town: string;
  block: string;
  streetName: string;
  flatType: string;
  storeyMidpoint: number;
  floorAreaSqm: number;
  leaseCommenceDate: number | null;
  month: string;
};

export type CandidateListing = {
  town: string;
  block: string;
  streetName: string;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number;
  leaseCommenceYear: number | null;
  referenceMonth: string; // deterministic recency anchor (e.g. manifest maxMonth)
  nearestMrtDistance?: number; // meters, from walking_time_cache (optional)
};

export type ComparableTransaction = {
  transactionId: string;
  month: string;
  town: string;
  block: string;
  streetName: string;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number;
  leaseCommenceDate: number | null;
  resalePrice: number;
  pricePerSqm: number;
  similarity: number; // 0–1, higher = more similar
  matchReasons: string[]; // human-readable labels
};

export type SimilarityResult = {
  similarity: number;
  matchReasons: string[];
};

export type ListingComparableSet = {
  comparables: ComparableTransaction[];
  sameBlockCount: number;
  sameStreetCount: number;
  sameTownCount: number;
  newestComparableAgeMonths: number | null;
  widenedSearch: boolean;
  caveats: string[];
};

// Re-export TransactionRow from data-types for convenience
export type { TransactionRow } from "./data-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the midpoint of a storey range string like "07 TO 09" → 8.
 * Returns null if the range cannot be parsed.
 */
export function parseStoreyMidpoint(storeyRange: string): number | null {
  const match = storeyRange.match(/(\d+)\s*(?:TO|-)\s*(\d+)/i);
  if (match) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return (low + high) / 2;
    }
  }
  const single = storeyRange.match(/\d+/);
  return single ? Number(single[0]) : null;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Compute the age in months between two "YYYY-MM" strings.
 *  Returns a positive number if `referenceMonth` is later than `txMonth`. */
export function monthsBetween(txMonth: string, referenceMonth: string): number {
  const txYear = Number(txMonth.slice(0, 4));
  const txMon = Number(txMonth.slice(5, 7));
  const refYear = Number(referenceMonth.slice(0, 4));
  const refMon = Number(referenceMonth.slice(5, 7));
  return (refYear - txYear) * 12 + (refMon - txMon);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute the similarity score between a candidate listing and a single
 * transaction. Resale price and price per sqm are never read — the
 * ScoringInput type enforces this at compile time.
 */
export function scoreSimilarity(candidate: CandidateListing, tx: ScoringInput): SimilarityResult {
  const candidateMidpoint = parseStoreyMidpoint(candidate.storeyRange);
  const hasLease = candidate.leaseCommenceYear != null && tx.leaseCommenceDate != null;

  // ---- Component scores ----
  const blockScore = tx.block === candidate.block ? 1 : 0;
  const streetScore = tx.streetName === candidate.streetName ? 1 : 0;
  const townScore = tx.town === candidate.town ? 1 : 0;
  const flatTypeScore = tx.flatType === candidate.flatType ? 1 : 0;

  const floorAreaDiff = Math.abs(tx.floorAreaSqm - candidate.floorAreaSqm);
  const floorAreaDenom = Math.max(candidate.floorAreaSqm, FLOOR_AREA_FLOOR_SQM);
  const floorAreaScore = 1 - clamp(floorAreaDiff / floorAreaDenom, 0, 1);

  let storeyScore = 0;
  if (candidateMidpoint != null) {
    const diff = Math.abs(tx.storeyMidpoint - candidateMidpoint);
    storeyScore = 1 - clamp(diff / STOREY_MAX_RANGE, 0, 1);
  }

  let leaseScore = 0;
  if (hasLease) {
    const diff = Math.abs(tx.leaseCommenceDate! - candidate.leaseCommenceYear!);
    leaseScore = 1 - clamp(diff / LEASE_MAX_RANGE_YEARS, 0, 1);
  }

  const ageInMonths = monthsBetween(tx.month, candidate.referenceMonth);
  const recencyScore = 1 - clamp(ageInMonths / RECENCY_MAX_MONTHS, 0, 1);

  // ---- Weighted sum ----
  // When lease data is missing for either side, exclude the lease component
  // and re-scale remaining weights to sum to 1.0.
  let similarity: number;
  if (hasLease) {
    similarity =
      BLOCK_WEIGHT * blockScore +
      STREET_WEIGHT * streetScore +
      TOWN_WEIGHT * townScore +
      FLAT_TYPE_WEIGHT * flatTypeScore +
      FLOOR_AREA_WEIGHT * floorAreaScore +
      STOREY_WEIGHT * storeyScore +
      LEASE_WEIGHT * leaseScore +
      RECENCY_WEIGHT * recencyScore;
  } else {
    const raw =
      BLOCK_WEIGHT * blockScore +
      STREET_WEIGHT * streetScore +
      TOWN_WEIGHT * townScore +
      FLAT_TYPE_WEIGHT * flatTypeScore +
      FLOOR_AREA_WEIGHT * floorAreaScore +
      STOREY_WEIGHT * storeyScore +
      RECENCY_WEIGHT * recencyScore;
    similarity = raw / LEASE_WEIGHT_SUM_EXCLUDING_LEASE;
  }

  // ---- Match reasons ----
  const matchReasons: string[] = [];

  if (blockScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Same block");
  }
  if (streetScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Same street");
  }
  if (townScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Same town");
  }
  if (flatTypeScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Same flat type");
  }
  if (floorAreaScore >= MATCH_REASON_THRESHOLD) {
    const diffRounded = Math.round(floorAreaDiff);
    matchReasons.push(`Similar floor area (±${diffRounded} sqm)`);
  }
  if (storeyScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Similar storey");
  }
  if (hasLease && leaseScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Similar lease");
  }
  if (recencyScore >= MATCH_REASON_THRESHOLD) {
    matchReasons.push("Recent transaction");
  }

  return { similarity, matchReasons };
}

// ---------------------------------------------------------------------------
// Comparable set builder
// ---------------------------------------------------------------------------

export type BuildComparableSetParams = {
  candidate: CandidateListing;
  /** Full TransactionRow array for same-block, same-flat-type scope. */
  sameBlockRows: TransactionRow[];
  /** Full TransactionRow array for same-street, same-flat-type scope. */
  sameStreetRows: TransactionRow[];
  /** Full TransactionRow array for same-town, same-flat-type scope. */
  sameTownRows: TransactionRow[];
};

function toScoringInput(row: TransactionRow): ScoringInput {
  return {
    town: row.town,
    block: row.block,
    streetName: row.streetName,
    flatType: row.flatType,
    storeyMidpoint: row.storeyMidpoint,
    floorAreaSqm: row.floorAreaSqm,
    leaseCommenceDate: row.leaseCommenceDate,
    month: row.month,
  };
}

function scoreAndRank(
  candidate: CandidateListing,
  rows: TransactionRow[],
  limit: number,
): ComparableTransaction[] {
  const scored = rows.map((row) => {
    const { similarity, matchReasons } = scoreSimilarity(candidate, toScoringInput(row));
    const result: ComparableTransaction = {
      transactionId: row.id,
      month: row.month,
      town: row.town,
      block: row.block,
      streetName: row.streetName,
      flatType: row.flatType,
      storeyRange: row.storeyRange,
      floorAreaSqm: row.floorAreaSqm,
      leaseCommenceDate: row.leaseCommenceDate,
      resalePrice: row.resalePrice,
      pricePerSqm: row.pricePerSqm,
      similarity,
      matchReasons,
    };
    return result;
  });

  // Sort by similarity descending, then by recency descending as tiebreaker
  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return b.month.localeCompare(a.month);
  });

  return scored.slice(0, limit);
}

function computeNewestAge(
  comparables: ComparableTransaction[],
  referenceMonth: string,
): number | null {
  if (comparables.length === 0) return null;
  let newest = comparables[0].month;
  for (const c of comparables) {
    if (c.month > newest) newest = c.month;
  }
  return monthsBetween(newest, referenceMonth);
}

/**
 * Orchestrate the three widening passes and return a ListingComparableSet.
 *
 * Pass 1: same block + same flat type
 * Pass 2: same street + same flat type (triggered when pass 1 < MIN_COMPARABLES)
 * Pass 3: same town + same flat type (triggered when pass 2 < MIN_COMPARABLES)
 *
 * When no pass reaches MIN_COMPARABLES but some passes have data, the
 * narrowest pass with any data is used (even if below threshold).
 */
export function buildComparableSet(params: BuildComparableSetParams): ListingComparableSet {
  const { candidate, sameBlockRows, sameStreetRows, sameTownRows } = params;

  const sameBlockCount = sameBlockRows.length;
  const sameStreetCount = sameStreetRows.length;
  const sameTownCount = sameTownRows.length;

  const hasBlockData = sameBlockRows.length > 0;
  const hasStreetData = sameStreetRows.length > 0;
  const hasTownData = sameTownRows.length > 0;

  const anyPassReachesThreshold =
    sameBlockRows.length >= MIN_COMPARABLES ||
    sameStreetRows.length >= MIN_COMPARABLES ||
    sameTownRows.length >= MIN_COMPARABLES;

  const caveats: string[] = [];
  let widenedSearch = false;
  let comparables: ComparableTransaction[] = [];

  if (!hasBlockData && !hasStreetData && !hasTownData) {
    // No data at all
    caveats.push("No comparable transactions found for this listing.");
  } else if (anyPassReachesThreshold) {
    // Standard widening: use the narrowest pass that meets MIN_COMPARABLES
    if (sameBlockRows.length >= MIN_COMPARABLES) {
      comparables = scoreAndRank(candidate, sameBlockRows, MAX_COMPARABLES);
    } else if (sameStreetRows.length >= MIN_COMPARABLES) {
      widenedSearch = true;
      caveats.push(
        "Few comparable transactions in the same block — search widened to the same street.",
      );
      comparables = scoreAndRank(candidate, sameStreetRows, MAX_COMPARABLES);
    } else {
      widenedSearch = true;
      caveats.push(
        "Few comparable transactions in the same block — search widened to the same street.",
        "Few comparable transactions on the same street — search widened to the entire town.",
      );
      comparables = scoreAndRank(candidate, sameTownRows, MAX_COMPARABLES);
    }
  } else {
    // No pass reaches threshold — use narrowest pass with any data
    if (hasBlockData) {
      comparables = scoreAndRank(candidate, sameBlockRows, MAX_COMPARABLES);
    } else if (hasStreetData) {
      widenedSearch = true;
      caveats.push(
        "Few comparable transactions in the same block — search widened to the same street.",
      );
      comparables = scoreAndRank(candidate, sameStreetRows, MAX_COMPARABLES);
    } else {
      widenedSearch = true;
      caveats.push(
        "Few comparable transactions in the same block — search widened to the same street.",
        "Few comparable transactions on the same street — search widened to the entire town.",
      );
      comparables = scoreAndRank(candidate, sameTownRows, MAX_COMPARABLES);
    }
  }

  // Low-sample caveat (independent of widening)
  if (comparables.length > 0 && comparables.length < LOW_SAMPLE_THRESHOLD) {
    caveats.push(
      `Only ${comparables.length} comparable transaction${comparables.length === 1 ? "" : "s"} found — this assessment is directional only.`,
    );
  }

  const newestComparableAgeMonths = computeNewestAge(comparables, candidate.referenceMonth);

  return {
    comparables,
    sameBlockCount,
    sameStreetCount,
    sameTownCount,
    newestComparableAgeMonths,
    widenedSearch,
    caveats,
  };
}
