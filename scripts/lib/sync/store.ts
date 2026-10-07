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
import {
  PUBLICATION_OWNER_JSON_PATH,
  readPublicationState,
  stampPublicationMarker,
} from "../../../shared/publication-state";
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
    jsonOrNull(block.flatTypeCohorts),
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
  "flat_type_cohorts_json",
  "nearest_mrt_json",
  "nearby_mrts_json",
  "postal_code",
];

/**
 * Marks the stored manifest as "publication in progress" BEFORE any generated table is touched. The tables are
 * replaced through many separate D1 requests while the manifest keeps describing the previous generation, and
 * the Worker's public-data cache uses the manifest text to tell whether a response saw one generation. With the
 * marker in place the manifest text has already changed by the time the first table does, so the cache stores
 * nothing until the final manifest write removes the marker (see shared/publication-state.ts).
 *
 * Returns the owner token of this run: it now owns the marker, replacing any earlier run's. A run always owns
 * one. With no stored manifest (the first publication) or one that is not a JSON object, a placeholder manifest
 * that carries only the marker is written. The first publication uses a plain INSERT, so if another run created
 * the first manifest at the same moment this one fails here, before touching any table. The write is read back,
 * so a publication can never start unmarked.
 */
export async function markPublicationInProgress(db: D1Client, startedAt: string): Promise<string> {
  const rows = await db.query<{ json: string }>({
    sql: "SELECT json FROM manifest WHERE id = 1",
  });
  const owner = crypto.randomUUID();
  if (rows.length === 0) {
    console.log(
      "No stored manifest: this is the first publication; a placeholder manifest carries its marker.",
    );
    await db.execute("INSERT INTO manifest (id, json, updated_at) VALUES (1, ?, ?)", [
      await stampPublicationMarker(null, startedAt, owner),
      startedAt,
    ]);
  } else {
    const before = readPublicationState(rows[0].json);
    if (before.inProgress && before.reason === "unreadable")
      console.warn(
        "The stored manifest is not a JSON object; replacing it with a placeholder that carries the marker.",
      );
    await db.execute("UPDATE manifest SET json = ? WHERE id = 1", [
      await stampPublicationMarker(rows[0].json, startedAt, owner),
    ]);
  }
  await assertPublicationOwned(
    db,
    owner,
    "The publication marker could not be confirmed after writing it, so no table was touched.",
  );
  console.log("Publication marker set: the public cache stores nothing until this run completes.");
  return owner;
}

/** A run another run has superseded: it must stop, and leave the marker (and the cache bypass) to its owner. */
export class PublicationSupersededError extends Error {
  constructor(detail = "") {
    super(
      "Publication superseded: another sync-data run now owns the publication marker, so this run stops here " +
        "and leaves the marker (and the cache bypass) to that run. Make sure only one sync-data run is active, then re-run." +
        (detail ? ` ${detail}` : ""),
    );
    this.name = "PublicationSupersededError";
  }
}

/**
 * The condition every write of a marked publication carries, inside the statement itself, so a run that
 * another run has superseded cannot change a table at all. Checking ownership before a write is not enough:
 * a run that is paused (a sleeping laptop, a stalled connection) can resume after the owner has changed and
 * would otherwise append to, or delete from, the new owner's tables. The owner is a UUID this process
 * generated; it is validated before it is spliced into SQL.
 */
function ownerGuard(owner: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(owner)) throw new Error("Unexpected publication owner token.");
  return `(SELECT json_extract(manifest.json, '${PUBLICATION_OWNER_JSON_PATH}') FROM manifest WHERE manifest.id = 1) = '${owner}'`;
}

/** Throws unless this run still owns the marker. The owner is whichever run stamped it last. */
async function assertPublicationOwned(
  db: D1Client,
  owner: string,
  unconfirmed?: string,
): Promise<void> {
  const rows = await db.query<{ owner: string | null }>({
    sql: "SELECT json_extract(json, ?) AS owner FROM manifest WHERE id = 1",
    params: [PUBLICATION_OWNER_JSON_PATH],
  });
  if (rows[0]?.owner === owner) return;
  throw unconfirmed ? new Error(unconfirmed) : new PublicationSupersededError();
}

export async function writeArtifactsToD1(
  db: D1Client,
  artifacts: GeneratedArtifacts,
  mrtExitsGeoJson: MrtExitsGeoJson,
  mrtStationsGeoJson: MrtStationFeatureCollection,
  updatedAt: string,
): Promise<void> {
  console.log("Writing artifacts to D1...");

  // From here until the final manifest write the generated tables are mid-replacement. If this run aborts, the
  // marker deliberately stays: the tables may be half replaced, and only a completed publication clears it.
  const owner = await markPublicationInProgress(db, updatedAt);
  try {
    await replaceGeneratedTables(
      db,
      artifacts,
      mrtExitsGeoJson,
      mrtStationsGeoJson,
      updatedAt,
      owner,
    );
  } catch (error) {
    // A superseded run already says whose marker it is; any other failure strands this run's marker.
    if (!(error instanceof PublicationSupersededError))
      console.error(
        "Publication aborted after the marker was stamped: the D1 tables may be partially replaced and the public " +
          "cache stays bypassed. Run sync-data again until it completes; an unfinished publication never counts as " +
          "already synced.",
      );
    throw error;
  }
}

async function replaceGeneratedTables(
  db: D1Client,
  artifacts: GeneratedArtifacts,
  mrtExitsGeoJson: MrtExitsGeoJson,
  mrtStationsGeoJson: MrtStationFeatureCollection,
  updatedAt: string,
  owner: string,
): Promise<void> {
  // Another run stamping its own marker supersedes this one; stop at the next phase boundary rather than keep
  // writing under (or, at the end, clear) a marker this run no longer owns.
  const stillOwner = () => assertPublicationOwned(db, owner);
  // Every write below is also conditional on that ownership, atomically, so a run that is superseded while it
  // is paused or mid-request writes nothing. The ownership checks only stop it sooner.
  const guard = ownerGuard(owner);

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
    guard,
  });

  // Block details — truncate and reinsert. JSON blob per address_key.
  await stillOwner();
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
    guard,
  });

  // Comparisons — optional, truncate and reinsert.
  await stillOwner();
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
      guard,
    });
  } else {
    await db.truncate("comparisons", guard);
  }

  // Town × flat-type trends — normalized rows.
  await stillOwner();
  await db.batchInsert({
    table: "town_flat_type_trends",
    columns: [
      "town",
      "flat_type",
      "month",
      "median_price",
      "median_price_per_sqm",
      "transaction_count",
    ],
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
    guard,
  });

  // MRT GeoJSON — two rows keyed by kind.
  await stillOwner();
  for (const [kind, geoJson] of [
    ["exits", mrtExitsGeoJson],
    ["stations", mrtStationsGeoJson],
  ] as const)
    await db.execute(
      `INSERT OR REPLACE INTO mrt_geojson (kind, json, updated_at) SELECT ?, ?, ? WHERE ${guard}`,
      [kind, JSON.stringify(geoJson), updatedAt],
    );

  // Transactions — full normalized table for the comparable engine v2.
  await stillOwner();
  if (artifacts.transactions && artifacts.transactions.length > 0) {
    await insertTransactions(db, artifacts.transactions, { guard, checkpoint: stillOwner });
  } else {
    await db.truncate("transactions", guard);
  }

  // Manifest — written last so a matching timestamp implies a successful sync. The new document replaces the
  // whole row, so this single statement also removes the publication marker; nothing else may clear it. The
  // write is conditional on still owning the marker: a run that another run superseded must not declare the
  // publication complete (that would let the cache store the other run's half-written tables).
  const manifestJson = JSON.stringify(artifacts.manifest);
  await db.execute(
    "UPDATE manifest SET json = ?, updated_at = ? WHERE id = 1 AND json_extract(json, ?) = ?",
    [manifestJson, updatedAt, PUBLICATION_OWNER_JSON_PATH, owner],
  );
  // The statement does nothing unless this run still owns the marker, and the REST client does not report how
  // many rows it changed, so read the manifest back to learn which happened.
  const stored = await db.query<{ json: string }>({
    sql: "SELECT json FROM manifest WHERE id = 1",
  });
  if (stored[0]?.json !== manifestJson)
    throw new PublicationSupersededError("The new manifest was not written.");

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
  // A marked manifest means a publication started and never finished, so the tables may be half replaced and
  // its timestamp no longer implies a successful sync. Report "unknown" so the next run publishes again.
  const publication = readPublicationState(rows[0].json);
  if (publication.inProgress) {
    console.warn(
      publication.reason === "marker"
        ? `The stored manifest carries an unfinished publication marker (started ${publication.startedAt ?? "at an unknown time"}); treating it as not synced.`
        : "The stored manifest is not a JSON object; treating it as not synced.",
    );
    return null;
  }
  // readPublicationState has just parsed this text as a JSON object.
  const parsed = JSON.parse(rows[0].json) as { sources?: { lastUpdatedAt?: string } };
  return parsed.sources?.lastUpdatedAt ?? null;
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
  options: {
    /** Makes every statement conditional on this SQL expression; see `D1Client.batchInsert`. */
    guard?: string;
    /** Called every few batches of this long phase (about half the publication), e.g. to notice a superseded run. */
    checkpoint?: () => Promise<void>;
  } = {},
): Promise<void> {
  const { guard, checkpoint } = options;
  console.log(`Writing ${transactions.length} transactions to D1...`);

  if (transactions.length === 0) {
    await db.truncate("transactions", guard);
    console.log("Transactions write complete (truncated).");
    return;
  }

  // Dynamically calculate the max rows per INSERT to stay under the
  // 100-bound-param limit. Adapts automatically if columns are added/removed.
  const ROWS_PER_INSERT = Math.max(1, Math.floor(100 / TX_COLUMNS.length));
  // D1 batch endpoint allows up to 100 statements per request.
  const MAX_BATCH_STMTS = 100;
  const placeholders = `(${TX_COLUMNS.map(() => "?").join(",")})`;
  // Guarded writes take their rows from a VALUES subquery so the condition can sit between data and write.
  const sqlPrefix = guard
    ? `INSERT INTO transactions (${TX_COLUMNS.join(",")}) SELECT ${TX_COLUMNS.map((_, index) => `column${index + 1}`).join(",")} FROM (VALUES `
    : `INSERT INTO transactions (${TX_COLUMNS.join(",")}) VALUES `;
  const sqlSuffix = guard ? `) WHERE ${guard}` : "";

  // Phase 1: DELETE to clear the table (single statement, batched with first
  // INSERT batch to avoid an empty-table window).
  let firstBatch = true;
  let batchesWritten = 0;
  const CHECKPOINT_EVERY_BATCHES = 25;

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
    const sql =
      sqlPrefix + Array.from({ length: chunk.length }, () => placeholders).join(",") + sqlSuffix;
    statements.push({ sql, params });

    // Flush when we hit the batch statement limit or end of data
    if (statements.length >= MAX_BATCH_STMTS || i + ROWS_PER_INSERT >= transactions.length) {
      const batch = firstBatch
        ? [{ sql: `DELETE FROM transactions${guard ? ` WHERE ${guard}` : ""}` }, ...statements]
        : statements;

      await db.query(batch);
      firstBatch = false;
      statements.length = 0;
      batchesWritten += 1;
      if (checkpoint && batchesWritten % CHECKPOINT_EVERY_BATCHES === 0) await checkpoint();
    }
  }

  console.log("Transactions write complete.");
}
