import type { BlockFlatTypeCohort, NearestMrt, BlockSummary } from "./data-types";

export type BlockRow = {
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
  flat_type_cohorts_json?: string | null;
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

export function rowToBlockSummary(row: BlockRow): BlockSummary {
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
    flatTypeCohorts: parseJsonOr<Record<string, BlockFlatTypeCohort> | undefined>(
      row.flat_type_cohorts_json ?? null,
      undefined,
    ),
    nearestMrt: parseJsonOr<NearestMrt | null>(row.nearest_mrt_json, null),
    nearbyMrts: parseJsonOr<NearestMrt[]>(row.nearby_mrts_json, []),
    postalCode: row.postal_code,
  };
}
