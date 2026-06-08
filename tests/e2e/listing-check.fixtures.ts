import type { Page } from "@playwright/test";

/**
 * Deterministic fixtures + route mocks for the buyer listing-price-check E2E
 * suite.
 *
 * The listing-check panel calls the POST `/api/comparable-transactions`
 * endpoint, which is a Cloudflare Pages Function backed by D1. E2E runs against
 * `vite preview` (a static server), so that POST cannot be served from the
 * staged static fixtures the way the GET endpoints are. We therefore intercept
 * it with `page.route` and fulfill it with a controlled `ListingComparableSet`.
 * This keeps the tests deterministic and never touches a live D1 binding.
 *
 * The address-detail GET (`/api/details/bedok-106-lengkong-tiga`) is served by
 * the existing staged fixtures (`tests/fixtures/public-data/details/...`), so we
 * deep-link to that block to drive the panel without using the map.
 */

// ── Shape of the mocked /api/comparable-transactions response ────────────────
// Mirrors `ListingComparableSet` from `shared/comparable-engine.ts`. Declared
// locally so the E2E fixtures stay decoupled from app internals.

export type ComparableTx = {
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
  similarity: number;
  matchReasons: string[];
};

export type ComparableSet = {
  comparables: ComparableTx[];
  sameBlockCount: number;
  sameStreetCount: number;
  sameTownCount: number;
  newestComparableAgeMonths: number | null;
  widenedSearch: boolean;
  caveats: string[];
};

// The block we deep-link to. Matches the staged detail fixture
// `tests/fixtures/public-data/details/bedok-106-lengkong-tiga` and the
// block-summaries fixture (so the shortlist row can resolve after saving).
export const CHECK_ADDRESS_KEY = "bedok-106-lengkong-tiga";
const TOWN = "BEDOK";
const BLOCK = "106";
const STREET = "LENGKONG TIGA";
const FLAT_TYPE = "EXECUTIVE";
const FLOOR_AREA = 150;

// Match reasons drive the confidence "match" signal in the panel. Use strings
// the confidence engine recognises: "Same flat type", "Similar floor area …",
// "Similar storey".
const FULL_MATCH = ["Same flat type", "Similar floor area", "Similar storey"];

function makeComparable(
  index: number,
  month: string,
  storeyRange: string,
  resalePrice: number,
  similarity: number,
  matchReasons: string[],
): ComparableTx {
  return {
    transactionId: `cmp-${index}`,
    month,
    town: TOWN,
    block: BLOCK,
    streetName: STREET,
    flatType: FLAT_TYPE,
    storeyRange,
    floorAreaSqm: FLOOR_AREA,
    leaseCommenceDate: 1989,
    resalePrice,
    pricePerSqm: Math.round(resalePrice / FLOOR_AREA),
    similarity,
    matchReasons,
  };
}

/**
 * Eight same-block, recent comparables. Median resale price is 1,200,000, so an
 * asking price of 1,200,000 yields the "In line with market" verdict, and the
 * sample size + recency + scope + match signals produce a high confidence tier.
 */
export const highConfidenceSet: ComparableSet = {
  comparables: [
    makeComparable(1, "2025-12", "01 TO 03", 1_140_000, 0.95, FULL_MATCH),
    makeComparable(2, "2025-11", "04 TO 06", 1_160_000, 0.93, FULL_MATCH),
    makeComparable(3, "2025-10", "04 TO 06", 1_180_000, 0.92, FULL_MATCH),
    makeComparable(4, "2025-09", "07 TO 09", 1_200_000, 0.9, FULL_MATCH),
    makeComparable(5, "2025-08", "07 TO 09", 1_200_000, 0.9, FULL_MATCH),
    makeComparable(6, "2025-07", "10 TO 12", 1_220_000, 0.88, FULL_MATCH),
    makeComparable(7, "2025-06", "10 TO 12", 1_240_000, 0.86, FULL_MATCH),
    makeComparable(8, "2025-05", "01 TO 03", 1_260_000, 0.84, FULL_MATCH),
  ],
  sameBlockCount: 8,
  sameStreetCount: 8,
  sameTownCount: 24,
  newestComparableAgeMonths: 1,
  widenedSearch: false,
  caveats: [],
};

/** Caveat surfaced for the low-sample state (asserted by the E2E suite). */
export const LOW_SAMPLE_CAVEAT =
  "Only 2 comparable transactions were found — treat this verdict as directional only.";

/**
 * Two stale, widened comparables. A comparable count below 3 forces the
 * confidence tier to "Low" (see `OVERRIDE_MIN_COUNT` in the confidence engine),
 * giving us a deterministic low-confidence / low-sample state.
 */
export const lowSampleSet: ComparableSet = {
  comparables: [
    makeComparable(1, "2024-08", "04 TO 06", 1_100_000, 0.7, ["Same flat type"]),
    makeComparable(2, "2024-05", "07 TO 09", 1_200_000, 0.66, ["Same flat type"]),
  ],
  sameBlockCount: 2,
  sameStreetCount: 2,
  sameTownCount: 2,
  newestComparableAgeMonths: 10,
  widenedSearch: true,
  caveats: [LOW_SAMPLE_CAVEAT],
};

/**
 * Intercept the POST `/api/comparable-transactions` request (with or without
 * the `?adjust=time` query) and fulfill it with the supplied comparable set.
 */
export async function mockComparableTransactions(
  page: Page,
  set: ComparableSet,
): Promise<void> {
  await page.route("**/api/comparable-transactions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(set),
    });
  });
}

/**
 * Build a deep-link that opens the Check tab with a pre-selected block and the
 * given listing facts. The app auto-opens the Check panel when `checkAddress`
 * is present, so this is the deterministic way to reach the panel without the
 * map (the suggest fixture has no block-group suggestions, and the "sample
 * listing check" CTA depends on map scope being loaded).
 */
export function checkDeepLink(
  facts: {
    askingPrice?: number;
    floorAreaSqm?: number;
    flatType?: string;
    storeyRange?: string;
    leaseCommenceYear?: number;
  } = {},
): string {
  const params = new URLSearchParams({ checkAddress: CHECK_ADDRESS_KEY });
  if (facts.askingPrice != null) params.set("checkPrice", String(facts.askingPrice));
  if (facts.floorAreaSqm != null) params.set("checkSqm", String(facts.floorAreaSqm));
  if (facts.flatType) params.set("checkFlatType", facts.flatType);
  if (facts.storeyRange) params.set("checkStorey", facts.storeyRange);
  if (facts.leaseCommenceYear != null) params.set("checkLease", String(facts.leaseCommenceYear));
  return `/?${params.toString()}`;
}
