/**
 * The public-read boundary.
 *
 * Every read behind the public API routes, the OG cards, the sitemap and the SEO rewrite is one of these
 * operations, named for the data it returns. Callers never see SQL and never learn which database answered:
 * `worker/public-read-backend.ts` picks the implementation for each request (`worker/public-data-d1.ts` or
 * `worker/public-data-neon.ts`), and `tests/unit/public-data-parity.test.ts` runs every operation against
 * both over the same data.
 *
 * Rows keep the public tables' column names, and shaping them into API JSON stays with the routes, so a
 * response cannot depend on which backend produced its rows. Private shortlist storage is not part of this
 * boundary: it always uses the D1 binding directly.
 */
import type { BlockRow } from "./d1";
import type { SearchRequest } from "./search";
import type { LabelledNearbyPlaces, NearbyPlacesRequest } from "../../shared/nearby-places";

export type { BlockRow };

export type TownFlatTypeTrendRow = {
  town: string;
  flat_type: string;
  month: string;
  median_price: number;
  median_price_per_sqm: number;
  transaction_count: number;
};

/** The trend columns the comparable time adjustment uses. */
export type TrendHistoryRow = Omit<TownFlatTypeTrendRow, "median_price">;

export type TownBlockPriceRow = { town: string; median_price: number; transaction_count: number };

/** The transactions a comparable search reads, from the narrowest scope to the widest. */
export type TransactionScope =
  | { kind: "block"; town: string; block: string; flatType: string }
  | { kind: "street"; streetName: string; flatType: string }
  | { kind: "town"; town: string; flatType: string };

/** A `transactions` row as stored. `id` is a number on D1 and a string on Neon (PostgreSQL `bigint`). */
export type TransactionRecord = Record<string, unknown>;

/** Each scope read returns at most this many transactions, newest first. */
export const RECENT_TRANSACTIONS_LIMIT = 150;

/**
 * Names that start with `query` (`prefix`), or that contain it without starting with it (`substring`),
 * ignoring ASCII case. Each match returns at most 20 rows.
 */
export type NameMatch = { query: string; position: "prefix" | "substring" };

export type PublicData = {
  /** The stored manifest, exactly as stored (its text identifies the publication), or `null` if none. */
  manifestJson: () => Promise<string | null>;
  /** Every block, by median price and then transaction count, both descending. */
  allBlocks: () => Promise<BlockRow[]>;
  /** The blocks of one town (its canonical upper-case name), in the `allBlocks` order. */
  townBlocks: (town: string) => Promise<BlockRow[]>;
  block: (addressKey: string) => Promise<BlockRow | null>;
  /** Every block's key and town, in no particular order (the sitemap). */
  blockIndex: () => Promise<{ address_key: string; town: string }[]>;
  /** The median price and transaction count of every block in either town (the comparison card). */
  townBlockPrices: (townA: string, townB: string) => Promise<TownBlockPriceRow[]>;
  /** A block's transaction history document (`/api/details`), or `null`. */
  blockDetailJson: (addressKey: string) => Promise<string | null>;
  /** A block's amenity comparison document (`/api/comparisons`), or `null`. */
  blockComparisonJson: (addressKey: string) => Promise<string | null>;
  mrtGeoJson: (kind: "stations" | "exits") => Promise<string | null>;
  /**
   * Additive PostGIS search; intentionally unavailable on D1 rollback. ONE statement returns the places together
   * with the identity of the publication they were read from, so the shared cache can label the answer without
   * reading the manifest around it (`worker/public-data-cache.ts`: `AtomicRead`).
   */
  nearbyPlaces?: (request: NearbyPlacesRequest) => Promise<LabelledNearbyPlaces>;
  /** Every trend point, by town, flat type and month in byte order. */
  townFlatTypeTrends: () => Promise<TownFlatTypeTrendRow[]>;
  /** Whether there is at least one block and every block carries flat-type cohort metadata. */
  flatTypeCohortsComplete: () => Promise<boolean>;
  /**
   * The blocks that pass a validated search, by address key in byte order, at most one more than
   * `SEARCH_RESULT_LIMIT` so the route can tell that it truncated. `useFlatTypeCohorts` and the result's
   * `usedFlatTypeCohorts` follow `buildSearchQuery`'s `supportsFlatTypeCohorts` (`functions/_lib/search.ts`);
   * they differ when the cohort column disappeared after the caller checked for it.
   */
  searchBlocks: (
    request: SearchRequest,
    useFlatTypeCohorts: boolean,
  ) => Promise<{ rows: BlockRow[]; usedFlatTypeCohorts: boolean }>;
  /** Distinct matching towns, in byte order. */
  townsMatching: (match: NameMatch) => Promise<{ town: string }[]>;
  /** Distinct matching streets, in byte order. */
  streetsMatching: (match: NameMatch) => Promise<{ street_name: string }[]>;
  /** Blocks whose `<block> <street>` label matches, in the `allBlocks` order. */
  blocksMatching: (
    match: NameMatch,
  ) => Promise<{ address_key: string; block: string; street_name: string }[]>;
  /** Distinct postal codes that start with `query`, in byte order, at most 20. */
  postalCodesStartingWith: (query: string) => Promise<{ postal_code: string }[]>;
  countTransactions: (scope: TransactionScope) => Promise<number>;
  /** A scope's newest transactions, at most `RECENT_TRANSACTIONS_LIMIT`. Equal months keep stored order. */
  recentTransactions: (scope: TransactionScope) => Promise<TransactionRecord[]>;
  /** The whole trend history of each town and flat type pair; nothing for no pairs. */
  trendHistory: (
    pairs: readonly { town: string; flatType: string }[],
  ) => Promise<TrendHistoryRow[]>;
};

/** What a public route receives. It has no `env`: the data comes only through `publicData`. */
export type PublicRouteContext = {
  request: Request;
  params: Record<string, string | string[]>;
  publicData: PublicData;
};

export type PublicRouteHandler = (context: PublicRouteContext) => Promise<Response>;

/** The `LIKE … ESCAPE '\'` patterns for a {@link NameMatch} query; both SQL implementations use them. */
export function likePatterns(query: string): { prefix: string; contains: string } {
  // Single-pass character-class escape: avoids the ordering hazard of chained replaces (backslash must go
  // first) that CodeQL flags as incomplete escaping (js/incomplete-sanitization).
  const escaped = query.replace(/[\\%_]/g, (match) => `\\${match}`);
  return { prefix: `${escaped}%`, contains: `%${escaped}%` };
}
