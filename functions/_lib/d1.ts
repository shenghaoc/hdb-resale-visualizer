/**
 * Shared helpers for Pages Functions backed by the D1 binding `DB`.
 *
 * All endpoints under `functions/api/*` import from here. Keep this module
 * dependency-free (no Node imports) so it runs in the Workers runtime.
 */

import type { NearestMrt } from "../../shared/data-types";

type JsonValue = unknown;

const CACHE_HEADERS = {
  // Cache at the edge for an hour; clients refresh per-load.
  // Sync runs at most daily, so an hour of staleness is acceptable and
  // dramatically reduces D1 read volume.
  "cache-control": "public, max-age=60, s-maxage=3600",
  "content-type": "application/json; charset=utf-8",
};

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries()) as Record<string, string>;
  }
  if (Array.isArray(headers)) {
    const entries: Record<string, string> = {};
    for (const [key, value] of headers) {
      entries[key] = value;
    }
    return entries;
  }
  return headers as Record<string, string>;
}

export function jsonResponse(body: JsonValue, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...CACHE_HEADERS, ...headersToRecord(init.headers) },
  });
}

/**
 * JSON response for per-user runtime data (the opt-in shortlist sync).
 * Unlike {@link jsonResponse}, this is never cached at the edge or shared —
 * the payload is private to a single sync code.
 */
export function privateJsonResponse(body: JsonValue, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
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
 * Read a request body with a byte-size limit. Returns the decoded string on
 * success, or a `Response` (400/411/413) on failure.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string | Response> {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return privateJsonResponse({ error: "Length Required" }, { status: 411 });
  }
  const declared = Number(contentLength);
  if (!Number.isInteger(declared) || declared < 0 || declared > maxBytes) {
    return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return privateJsonResponse({ error: "Bad Request" }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return privateJsonResponse({ error: "Failed to read request body" }, { status: 400 });
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(buffer);
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
    nearestMrt: parseJsonOr<NearestMrt | null>(row.nearest_mrt_json, null),
    nearbyMrts: parseJsonOr<NearestMrt[]>(row.nearby_mrts_json, []),
    postalCode: row.postal_code,
  };
}

export { type BlockRow };

/** Columns required by `rowToBlockSummary` (excludes large per-flat-type JSON blobs). */
export const BLOCK_SUMMARY_SELECT_SQL =
  "address_key, town, block, street_name, display_name, lat, lng, median_price, price_per_sqm_median, transaction_count, floor_area_min, floor_area_max, lease_commence_year, latest_month, available_min_month, available_max_month, flat_types_json, flat_models_json, median_price_by_flat_type_json, median_price_per_sqm_by_flat_type_json, nearest_mrt_json, nearby_mrts_json, postal_code";

export { townFilenameToCanonical } from "../../shared/geo";

/** Prefix indexes for `/api/suggest` — see migration `0005_suggest_indexes.sql`. */
