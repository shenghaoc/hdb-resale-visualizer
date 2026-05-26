/**
 * Persists the artifacts produced by `buildArtifacts()` into D1. Replaces the
 * old `writer.ts` which serialized the same shapes to JSON files under
 * `public/data/`.
 *
 * Generated artifacts are fully overwritten on each run (truncate + insert).
 * Persistent caches (geocode, walking time) are written via the dedicated
 * cache modules and are never truncated here.
 */
import type { BlockSummary } from "../../../shared/data-types";
import type { D1Client } from "./d1";
import type { GeneratedArtifacts, MrtStationFeatureCollection } from "../pipeline";

type MrtExitsGeoJson = { type: "FeatureCollection"; features: unknown[] };

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function mapBlockRow(block: BlockSummary): unknown[] {
  return [
    block.addressKey,
    block.town,
    block.block,
    block.streetName,
    block.displayName ?? null,
    block.coordinates.lat,
    block.coordinates.lng,
    block.medianPrice,
    block.pricePerSqmMedian,
    block.transactionCount,
    block.floorAreaRange[0],
    block.floorAreaRange[1],
    block.leaseCommenceRange[0],
    block.latestMonth,
    block.availableDateRange[0],
    block.availableDateRange[1],
    JSON.stringify(block.flatTypes),
    JSON.stringify(block.flatModels),
    jsonOrNull(block.medianPriceByFlatType),
    jsonOrNull(block.medianPricePerSqmByFlatType),
    jsonOrNull(block.nearestMrt),
    jsonOrNull(block.nearbyMrts),
    block.postalCode ?? null,
  ];
}

const BLOCK_COLUMNS = [
  "address_key",
  "town",
  "block",
  "street_name",
  "display_name",
  "lat",
  "lng",
  "median_price",
  "price_per_sqm_median",
  "transaction_count",
  "floor_area_min",
  "floor_area_max",
  "lease_commence_year",
  "latest_month",
  "available_min_month",
  "available_max_month",
  "flat_types_json",
  "flat_models_json",
  "median_price_by_flat_type_json",
  "median_price_per_sqm_by_flat_type_json",
  "nearest_mrt_json",
  "nearby_mrts_json",
  "postal_code",
];

export async function writeArtifactsToD1(
  db: D1Client,
  artifacts: GeneratedArtifacts,
  mrtExitsGeoJson: MrtExitsGeoJson,
  mrtStationsGeoJson: MrtStationFeatureCollection,
  updatedAt: string,
): Promise<void> {
  console.log("Writing artifacts to D1...");

  // NOTE: the `shortlists` table (migration 0003) is intentionally absent here.
  // It holds opt-in, runtime user state written only by the Worker
  // (functions/api/shortlist/*). The sync pipeline must never truncate or
  // rewrite it, or it would wipe users' cloud-backed shortlists.

  // Blocks — truncate and reinsert. ~10k rows.
  // preDelete batches DELETE with the first INSERT chunk to avoid a window
  // where the table is empty if the process is interrupted.
  await db.batchInsert<BlockSummary>({
    table: "blocks",
    columns: BLOCK_COLUMNS,
    rows: artifacts.blockSummaries,
    mapRow: mapBlockRow,
    preDelete: true,
  });

  // Block details — truncate and reinsert. JSON blob per address_key.
  const detailRows = Object.entries(artifacts.details).map(([key, detail]) => ({
    key,
    json: JSON.stringify(detail),
  }));
  await db.batchInsert({
    table: "block_details",
    columns: ["address_key", "json"],
    rows: detailRows,
    mapRow: (row) => [row.key, row.json],
    preDelete: true,
  });

  // Comparisons — optional, truncate and reinsert.
  if (artifacts.comparisons) {
    const comparisonRows = Object.entries(artifacts.comparisons).map(([key, comparison]) => ({
      key,
      json: JSON.stringify(comparison),
    }));
    await db.batchInsert({
      table: "comparisons",
      columns: ["address_key", "json"],
      rows: comparisonRows,
      mapRow: (row) => [row.key, row.json],
      preDelete: true,
    });
  } else {
    await db.truncate("comparisons");
  }

  // Town × flat-type trends — normalized rows.
  await db.batchInsert({
    table: "town_flat_type_trends",
    columns: ["town", "flat_type", "month", "median_price", "median_price_per_sqm", "transaction_count"],
    rows: artifacts.townFlatTypeTrend,
    mapRow: (point) => [
      point.town,
      point.flatType,
      point.month,
      point.medianPrice,
      point.medianPricePerSqm,
      point.transactionCount,
    ],
    preDelete: true,
  });

  // MRT GeoJSON — two rows keyed by kind.
  await db.execute(
    "INSERT OR REPLACE INTO mrt_geojson (kind, json, updated_at) VALUES (?, ?, ?)",
    ["exits", JSON.stringify(mrtExitsGeoJson), updatedAt],
  );
  await db.execute(
    "INSERT OR REPLACE INTO mrt_geojson (kind, json, updated_at) VALUES (?, ?, ?)",
    ["stations", JSON.stringify(mrtStationsGeoJson), updatedAt],
  );

  // Manifest — written last so a matching timestamp implies a successful sync.
  await db.execute(
    "INSERT OR REPLACE INTO manifest (id, json, updated_at) VALUES (1, ?, ?)",
    [JSON.stringify(artifacts.manifest), updatedAt],
  );

  console.log(
    `D1 write complete: ${artifacts.blockSummaries.length} blocks, ${detailRows.length} details, ${artifacts.townFlatTypeTrend.length} trend points.`,
  );
}

export async function readManifestUpdatedAt(db: D1Client): Promise<string | null> {
  const rows = await db.query<{ json: string }>({
    sql: "SELECT json FROM manifest WHERE id = 1",
  });
  if (rows.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(rows[0].json) as { sources?: { lastUpdatedAt?: string } };
    return parsed.sources?.lastUpdatedAt ?? null;
  } catch {
    return null;
  }
}
