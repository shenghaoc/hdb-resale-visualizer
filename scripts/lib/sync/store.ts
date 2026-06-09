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
import type { TransactionRow } from "../schemas";

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
  // Suggest prefix indexes (migration 0005) live on `blocks` and require no sync changes.
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

  // Transactions — full normalized table for the comparable engine v2.
  if (artifacts.transactions && artifacts.transactions.length > 0) {
    await insertTransactions(db, artifacts.transactions);
  } else {
    await db.truncate("transactions");
  }

  // Manifest — written last so a matching timestamp implies a successful sync.
  await db.execute(
    "INSERT OR REPLACE INTO manifest (id, json, updated_at) VALUES (1, ?, ?)",
    [JSON.stringify(artifacts.manifest), updatedAt],
  );

  console.log(
    `D1 write complete: ${artifacts.blockSummaries.length} blocks, ${detailRows.length} details, ${artifacts.townFlatTypeTrend.length} trend points, ${artifacts.transactions?.length ?? 0} transactions.`,
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

const TX_COLUMNS = [
  "month",
  "town",
  "block",
  "street_name",
  "address_key",
  "flat_type",
  "storey_range",
  "floor_area_sqm",
  "lease_commence_year",
  "resale_price",
  "flat_model",
];

function mapTxRow(row: TransactionRow): unknown[] {
  return [
    row.month,
    row.town,
    row.block,
    row.street_name,
    row.address_key,
    row.flat_type,
    row.storey_range,
    row.floor_area_sqm,
    row.lease_commence_year,
    row.resale_price,
    row.flat_model,
  ];
}

/**
 * Truncate and re-insert the full transactions table. Called during sync after
 * all block details are built, using the *full* sorted transaction array (not
 * the 20-row capped slice stored in block_details).
 *
 * Uses batched multi-row INSERTs packed into D1 batch API calls to stay under
 * the 100-bound-param per-statement limit (ROWS_PER_INSERT is computed
 * dynamically from the column count) while minimising HTTP round-trips (up
 * to 100 INSERTs per batch call).
 *
 * TODO: At production scale (~1M transactions), this still issues ~1.4k D1
 * HTTP requests per sync (~20–30 min wall time). A future D1 bulk-import API
 * or raw-SQL endpoint without param limits would reduce this to a single
 * request. Tracked as follow-up — not blocking merge.
 */
export async function insertTransactions(
  db: D1Client,
  transactions: TransactionRow[],
): Promise<void> {
  console.log(`Writing ${transactions.length} transactions to D1...`);

  if (transactions.length === 0) {
    await db.truncate("transactions");
    console.log("Transactions write complete (truncated).");
    return;
  }

  // Dynamically calculate the max rows per INSERT to stay under the
  // 100-bound-param limit. Adapts automatically if columns are added/removed.
  const ROWS_PER_INSERT = Math.max(1, Math.floor(100 / TX_COLUMNS.length));
  // D1 batch endpoint allows up to 100 statements per request.
  const MAX_BATCH_STMTS = 100;
  const placeholders = `(${TX_COLUMNS.map(() => "?").join(",")})`;
  const sqlPrefix = `INSERT INTO transactions (${TX_COLUMNS.join(",")}) VALUES `;

  // Phase 1: DELETE to clear the table (single statement, batched with first
  // INSERT batch to avoid an empty-table window).
  let firstBatch = true;

  // Build INSERT statements: each has ROWS_PER_INSERT rows.
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  for (let i = 0; i < transactions.length; i += ROWS_PER_INSERT) {
    const chunk = transactions.slice(i, i + ROWS_PER_INSERT);
    const params: unknown[] = [];
    for (const row of chunk) {
      const values = mapTxRow(row);
      if (values.length !== TX_COLUMNS.length) {
        throw new Error(
          `insertTransactions: row provided ${values.length} values for ${TX_COLUMNS.length} columns`,
        );
      }
      params.push(...values);
    }
    const sql = sqlPrefix + new Array(chunk.length).fill(placeholders).join(",");
    statements.push({ sql, params });

    // Flush when we hit the batch statement limit or end of data
    if (statements.length >= MAX_BATCH_STMTS || i + ROWS_PER_INSERT >= transactions.length) {
      const batch = firstBatch
        ? [{ sql: "DELETE FROM transactions" }, ...statements]
        : statements;

      await db.query(batch);
      firstBatch = false;
      statements.length = 0;
    }
  }

  console.log("Transactions write complete.");
}
