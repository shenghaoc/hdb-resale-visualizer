/**
 * Shared helpers for Pages Functions backed by the D1 binding `DB`.
 *
 * All endpoints under `functions/api/*` import from here. Keep this module
 * dependency-free (no Node imports) so it runs in the Workers runtime.
 */

type JsonValue = unknown;

const CACHE_HEADERS = {
  // Cache at the edge for an hour; clients refresh per-load.
  // Sync runs at most daily, so an hour of staleness is acceptable and
  // dramatically reduces D1 read volume.
  "cache-control": "public, max-age=60, s-maxage=3600",
  "content-type": "application/json; charset=utf-8",
};

export function jsonResponse(body: JsonValue, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...CACHE_HEADERS, ...(init.headers ?? {}) },
  });
}

export function notFound(message = "Not Found"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function serverError(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Reconstructs the `BlockSummary` shape from a row of the `blocks` table.
 * Keys, ordering, and null/undefined choices match the original artifact
 * JSON contract enforced by `blockSummarySchema` in `src/lib/dataSchemas.ts`.
 */
type BlockRow = {
  address_key: string;
  town: string;
  block: string;
  street_name: string;
  display_name: string | null;
  lat: number;
  lng: number;
  median_price: number;
  price_per_sqm_median: number;
  transaction_count: number;
  floor_area_min: number;
  floor_area_max: number;
  lease_commence_year: number;
  latest_month: string;
  available_min_month: string;
  available_max_month: string;
  flat_types_json: string;
  flat_models_json: string;
  median_price_by_flat_type_json: string | null;
  median_price_per_sqm_by_flat_type_json: string | null;
  nearest_mrt_json: string | null;
  nearby_mrts_json: string | null;
  postal_code: string | null;
};

function parseJsonOr<T>(value: string | null, fallback: T): T {
  if (value === null || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    console.error(
      `parseJsonOr: failed to parse JSON, using fallback — ${typeof value === "string" ? value.slice(0, 200) : typeof value}`,
    );
    return fallback;
  }
}

export function rowToBlockSummary(row: BlockRow) {
  return {
    addressKey: row.address_key,
    town: row.town,
    block: row.block,
    streetName: row.street_name,
    displayName: row.display_name,
    coordinates: { lat: row.lat, lng: row.lng },
    medianPrice: row.median_price,
    pricePerSqmMedian: row.price_per_sqm_median,
    transactionCount: row.transaction_count,
    floorAreaRange: [row.floor_area_min, row.floor_area_max],
    leaseCommenceRange: [row.lease_commence_year, row.lease_commence_year],
    latestMonth: row.latest_month,
    availableDateRange: [row.available_min_month, row.available_max_month],
    flatTypes: parseJsonOr<string[]>(row.flat_types_json, []),
    flatModels: parseJsonOr<string[]>(row.flat_models_json, []),
    medianPriceByFlatType: parseJsonOr<Record<string, number> | undefined>(
      row.median_price_by_flat_type_json,
      undefined,
    ),
    medianPricePerSqmByFlatType: parseJsonOr<Record<string, number> | undefined>(
      row.median_price_per_sqm_by_flat_type_json,
      undefined,
    ),
    nearestMrt: parseJsonOr<unknown>(row.nearest_mrt_json, null),
    nearbyMrts: parseJsonOr<unknown[]>(row.nearby_mrts_json, []),
    postalCode: row.postal_code,
  };
}

export { type BlockRow };

/** Columns required by `rowToBlockSummary` (excludes large per-flat-type JSON blobs). */
export const BLOCK_SUMMARY_SELECT_SQL =
  "address_key, town, block, street_name, display_name, lat, lng, median_price, price_per_sqm_median, transaction_count, floor_area_min, floor_area_max, lease_commence_year, latest_month, available_min_month, available_max_month, flat_types_json, flat_models_json, NULL AS median_price_by_flat_type_json, NULL AS median_price_per_sqm_by_flat_type_json, nearest_mrt_json, nearby_mrts_json, postal_code";

/**
 * Inverse of `townToFilename` in `shared/geo.ts`. Town filenames are
 * lowercase with `-` separators; the canonical town stored in D1 is uppercase
 * with spaces. Convert the URL slug back to the stored form.
 */
export function townFilenameToCanonical(filename: string): string {
  return filename.replace(/-/g, " ").toUpperCase();
}
