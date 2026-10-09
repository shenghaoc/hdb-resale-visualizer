/** Synthetic native SQLite only. HTTP metadata below is explicitly emulated, never D1 billing proof. */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildArtifacts,
  toTransactionRow,
  type ResaleTransaction,
  type GeneratedArtifacts,
} from "./lib/pipeline";
import { D1Client } from "./lib/sync/d1";
import {
  assignStableTransactionIds,
  planTransactionDelta,
  transactionStatements,
  type StoredTransaction,
  type TransactionDelta,
} from "./lib/sync/incremental";
import {
  BLOCK_COLUMNS,
  buildPublicationBatch,
  mapBlockRow,
  planArtifactWrites,
  readPublishedArtifacts,
  writeIncrementalArtifactsToLocalD1,
} from "./lib/sync/store";
import {
  jsonInsertStatements,
  MAX_ATOMIC_BYTES,
  MAX_ATOMIC_STATEMENTS,
  MAX_FORECAST_WRITES,
} from "./lib/sync/statements";

const directory = mkdtempSync(path.join(tmpdir(), "hdb-d1-rehearsal-"));
const db = new DatabaseSync(path.join(directory, "rehearsal.sqlite"));
const originalFetch = globalThis.fetch;
const recordChanges: Record<string, number> = {};
let interrupt = false;
const client = () =>
  new D1Client({
    accountId: "synthetic",
    databaseId: "synthetic",
    apiToken: "synthetic",
    endpoint: "http://localhost",
  });
const geo = { type: "FeatureCollection" as const, features: [] };
const emptyDelta: TransactionDelta = {
  inserts: [],
  updates: [],
  affectedBlocks: new Set(),
  affectedTownTypes: new Set(),
};

// This replaces fetch for this process only; no HTTP connection is opened.
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init?.body as string) as {
    sql?: string;
    params?: unknown[];
    batch?: { sql: string; params?: unknown[] }[];
  };
  const statements = body.batch ?? [{ sql: body.sql!, params: body.params }];
  db.exec("BEGIN");
  const changes: Record<string, number> = {};
  try {
    const result = statements.map((statement, index) => {
      if (interrupt && body.batch && index === 2) throw new Error("injected atomic interruption");
      const prepared = db.prepare(statement.sql);
      const mutation = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(statement.sql);
      const results = prepared.all(...((statement.params ?? []) as (string | number | null)[]));
      const changed = mutation
        ? Number((db.prepare("SELECT changes() AS n").get() as { n: number }).n)
        : 0;
      const table = statement.sql.match(/\b(?:INTO|UPDATE)\s+([a-z_]+)/i)?.[1];
      if (table) changes[table] = (changes[table] ?? 0) + changed;
      return {
        success: true,
        results,
        meta: {
          rows_read: results.length,
          ...(mutation ? {} : { rows_written: 0 }),
          changes: changed,
          duration: 0,
        },
      };
    });
    db.exec("COMMIT");
    for (const [table, count] of Object.entries(changes))
      recordChanges[table] = (recordChanges[table] ?? 0) + count;
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

function seedArtifacts(artifacts: GeneratedArtifacts) {
  const tables: { table: string; columns: string[]; rows: unknown[][] }[] = [
    { table: "blocks", columns: BLOCK_COLUMNS, rows: artifacts.blockSummaries.map(mapBlockRow) },
    {
      table: "block_details",
      columns: ["address_key", "json"],
      rows: Object.entries(artifacts.details).map(([key, value]) => [key, JSON.stringify(value)]),
    },
    {
      table: "comparisons",
      columns: ["address_key", "json"],
      rows: Object.entries(artifacts.comparisons ?? {}).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    },
    {
      table: "town_flat_type_trends",
      columns: [
        "town",
        "flat_type",
        "month",
        "median_price",
        "median_price_per_sqm",
        "transaction_count",
      ],
      rows: artifacts.townFlatTypeTrend.map((row) => [
        row.town,
        row.flatType,
        row.month,
        row.medianPrice,
        row.medianPricePerSqm,
        row.transactionCount,
      ]),
    },
    {
      table: "mrt_geojson",
      columns: ["kind", "json", "updated_at"],
      rows: [
        ["exits", JSON.stringify(geo), "baseline"],
        ["stations", JSON.stringify(geo), "baseline"],
      ],
    },
    {
      table: "manifest",
      columns: ["id", "json", "updated_at"],
      rows: [[1, JSON.stringify(artifacts.manifest), "baseline"]],
    },
  ];
  db.exec("BEGIN");
  for (const table of tables)
    for (const statement of jsonInsertStatements(table.table, table.columns, table.rows))
      db.prepare(statement.sql).run(...(statement.params as string[]));
  db.exec("COMMIT");
}

async function rehearsalPlan(
  artifacts: GeneratedArtifacts,
  delta: TransactionDelta,
  label: string,
) {
  const plan = await planArtifactWrites(client(), artifacts, geo, geo, label, delta, {
    enforceBudget: false,
  });
  const manifestRow = db.prepare("SELECT json FROM manifest WHERE id=1").get() as { json: string };
  const batch = buildPublicationBatch(plan.statements, artifacts.manifest, label, manifestRow.json);
  const encodedBytes = new TextEncoder().encode(JSON.stringify({ batch })).byteLength;
  return {
    ...plan,
    statements: plan.statements.length + 2,
    encodedBytes,
    withinLocalSafetyCaps:
      plan.statements.length + 2 <= MAX_ATOMIC_STATEMENTS &&
      encodedBytes < MAX_ATOMIC_BYTES &&
      plan.forecastWriteUpperBound <= MAX_FORECAST_WRITES,
    computation: artifacts.computation,
  };
}

const quietLog = console.log;
console.log = () => {}; // Publisher ledger is emulated; only the clearly labeled final evidence is printed.
try {
  for (const migration of readdirSync("migrations").sort())
    db.exec(readFileSync(path.join("migrations", migration), "utf8"));
  db.exec(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<985399)
    INSERT INTO transactions(id,month,town,block,street_name,address_key,flat_type,storey_range,floor_area_sqm,lease_commence_year,resale_price,flat_model)
    SELECT i,printf('%04d-%02d',2010+((i*47+(i/9700)*71)%200)/12,1+(i*47+(i/9700)*71)%200%12),'TOWN '||((i%9700)%28),''||(i%9700),'STREET '||(i%9700),'block-'||(i%9700),'TYPE '||(((i/200)+(i/9700))%8),'01 TO 03',90,1980,500000+(i%1000),'MODEL' FROM n`);
  const previous = db
    .prepare("SELECT * FROM transactions ORDER BY id")
    .all() as StoredTransaction[];
  const source: ResaleTransaction[] = previous.map((row) => ({
    id: `d1:${String(row.id).padStart(16, "0")}`,
    month: row.month,
    town: row.town,
    block: row.block,
    streetName: row.street_name,
    addressKey: row.address_key,
    flatType: row.flat_type,
    storeyRange: row.storey_range,
    floorAreaSqm: row.floor_area_sqm,
    leaseCommenceDate: row.lease_commence_year ?? 0,
    resalePrice: row.resale_price,
    flatModel: row.flat_model,
    remainingLease: "53 years",
    pricePerSqm: Number((row.resale_price / row.floor_area_sqm).toFixed(2)),
    pricePerSqft: Number((row.resale_price / row.floor_area_sqm / 10.7639).toFixed(2)),
  }));
  const geocodes = Object.fromEntries(
    Array.from({ length: 9700 }, (_, index) => [
      `block-${index}`,
      { lat: 1.3, lng: 103.8, postalCode: null, displayName: null, searchValue: `${index} STREET` },
    ]),
  );
  const input = {
    transactions: source,
    geocodes,
    propertyInfo: [],
    mrtExits: [],
    parks: [{ name: "Synthetic park", lat: 1.3, lng: 103.8 }],
    metadata: { lastUpdatedAt: "synthetic-baseline" },
  };
  const start = performance.now();
  const baseline = buildArtifacts(input);
  baseline.transactions = undefined;
  seedArtifacts(baseline);
  const additions = Array.from({ length: 134 }, (_, index) => ({
    ...source[index % 4],
    month: "2026-08",
    resalePrice: 550000 + index,
    pricePerSqm: Number(((550000 + index) / 90).toFixed(2)),
    pricePerSqft: Number(((550000 + index) / 90 / 10.7639).toFixed(2)),
  }));
  const incoming = [...source, ...additions];
  const delta = planTransactionDelta(previous, [
    ...previous,
    ...additions.map((row) => toTransactionRow(row)!),
  ]);
  assignStableTransactionIds(additions, previous, delta, toTransactionRow);
  const next = buildArtifacts({
    ...input,
    transactions: incoming,
    incremental: { previous: baseline, delta },
  });
  next.transactions = undefined;
  const nextPlan = await rehearsalPlan(next, delta, "delta");
  interrupt = true;
  let rollbackVerified = false;
  try {
    await writeIncrementalArtifactsToLocalD1(client(), next, geo, geo, "delta", {
      delta,
      manifestJson: JSON.stringify(baseline.manifest),
    });
  } catch {
    rollbackVerified =
      (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n === 985399;
  }
  interrupt = false;
  if (!rollbackVerified) throw new Error("Atomic interruption did not preserve baseline");
  await writeIncrementalArtifactsToLocalD1(client(), next, geo, geo, "delta", {
    delta,
    manifestJson: JSON.stringify(baseline.manifest),
  });
  const deltaRecordChanges = { ...recordChanges };
  const afterCount = (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number })
    .n;
  const retry = planTransactionDelta(
    [...previous, ...delta.inserts],
    [...previous, ...delta.inserts],
  );
  if (afterCount !== 985533 || deltaRecordChanges.transactions !== 134 || retry.inserts.length)
    throw new Error("Delta/retry invariant failed");
  const published = (await readPublishedArtifacts(client(), JSON.stringify(next.manifest)))!;
  const reordered = buildArtifacts({
    ...input,
    transactions: [...incoming].reverse(),
    incremental: { previous: published, delta: emptyDelta },
  });
  reordered.transactions = undefined;
  const reorderPlan = await rehearsalPlan(reordered, emptyDelta, "reordered");
  if (Object.values(reorderPlan.changedRows).some((count) => count !== 0))
    throw new Error("Reordered source changed published products");
  const changedParks = [{ name: "Changed synthetic park", lat: 1.4, lng: 103.8 }];
  const contextWorst = buildArtifacts({
    ...input,
    transactions: incoming,
    parks: changedParks,
    incremental: { previous: published, delta: emptyDelta },
  });
  contextWorst.transactions = undefined;
  const contextPlan = await rehearsalPlan(contextWorst, emptyDelta, "context");
  const currentStored = [...previous, ...delta.inserts];
  const monthAddition = { ...incoming[0], id: "next-month", month: "2026-09" };
  const monthDelta = planTransactionDelta(currentStored, [
    ...currentStored,
    toTransactionRow(monthAddition)!,
  ]);
  assignStableTransactionIds([monthAddition], currentStored, monthDelta, toTransactionRow);
  const monthWorst = buildArtifacts({
    ...input,
    transactions: [...incoming, monthAddition],
    incremental: { previous: published, delta: monthDelta },
  });
  monthWorst.transactions = undefined;
  const monthPlan = await rehearsalPlan(monthWorst, monthDelta, "month");
  const simultaneous = buildArtifacts({
    ...input,
    transactions: [...incoming, monthAddition],
    parks: changedParks,
    incremental: { previous: published, delta: monthDelta },
  });
  simultaneous.transactions = undefined;
  const simultaneousPlan = await rehearsalPlan(simultaneous, monthDelta, "simultaneous");
  let simultaneousRejectedBeforeWrites = false;
  const changesBeforeRejection = JSON.stringify(recordChanges);
  try {
    await writeIncrementalArtifactsToLocalD1(client(), simultaneous, geo, geo, "simultaneous", {
      delta: monthDelta,
      manifestJson: JSON.stringify(next.manifest),
    });
  } catch (error) {
    simultaneousRejectedBeforeWrites =
      error instanceof Error &&
      error.message.includes("write safety budget") &&
      JSON.stringify(recordChanges) === changesBeforeRejection;
  }
  if (!simultaneousRejectedBeforeWrites)
    throw new Error("Combined context/month preflight did not fail safely");
  // Execute the context worst case against the same full SQLite baseline, then roll it back.
  // These are measured native record changes/time, never remote index billing or quota proof.
  const contextStatements = (
    await planArtifactWrites(client(), contextWorst, geo, geo, "context", emptyDelta)
  ).statements;
  const contextStart = performance.now();
  const contextChanges: Record<string, number> = {};
  db.exec("BEGIN");
  try {
    for (const statement of contextStatements) {
      db.prepare(statement.sql).all(...(statement.params as (string | number | null)[]));
      const table = statement.sql.match(/\b(?:INTO|UPDATE)\s+([a-z_]+)/i)?.[1];
      if (table)
        contextChanges[table] =
          (contextChanges[table] ?? 0) +
          Number((db.prepare("SELECT changes() AS n").get() as { n: number }).n);
    }
  } finally {
    db.exec("ROLLBACK");
  }
  const contextExecutionMs = Math.round(performance.now() - contextStart);
  const monthBefore = { ...recordChanges };
  const monthStart = performance.now();
  await writeIncrementalArtifactsToLocalD1(client(), monthWorst, geo, geo, "month", {
    delta: monthDelta,
    manifestJson: JSON.stringify(next.manifest),
  });
  const monthExecutionMs = Math.round(performance.now() - monthStart);
  const monthChanges = Object.fromEntries(
    Object.entries(recordChanges).map(([table, count]) => [
      table,
      count - (monthBefore[table] ?? 0),
    ]),
  );
  const explain = (sql: string, params: (string | number)[] = []) =>
    db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  const pageCount = (db.prepare("PRAGMA page_count").get() as { page_count: number }).page_count;
  const pageSize = (db.prepare("PRAGMA page_size").get() as { page_size: number }).page_size;
  const runtimeQueries = {
    blocks: {
      sql: "SELECT * FROM blocks ORDER BY median_price DESC, transaction_count DESC",
      params: [],
    },
    trends: {
      sql: "SELECT town,flat_type,month,median_price,median_price_per_sqm,transaction_count FROM town_flat_type_trends ORDER BY town,flat_type,month",
      params: [],
    },
    searchUnfiltered: {
      sql: "SELECT blocks.* FROM blocks ORDER BY address_key LIMIT ?",
      params: [2001],
    },
    searchTown: {
      sql: "SELECT blocks.* FROM blocks WHERE town=? ORDER BY address_key LIMIT ?",
      params: ["TOWN 1", 2001],
    },
    searchCohortReadiness: {
      sql: "SELECT COUNT(*) AS total_count,COUNT(NULLIF(TRIM(flat_type_cohorts_json),'')) AS populated_count FROM blocks",
      params: [],
    },
    searchTypeBudget: {
      sql: "SELECT blocks.* FROM blocks WHERE EXISTS (SELECT 1 FROM json_each(blocks.flat_types_json) WHERE json_each.value=? COLLATE NOCASE) AND COALESCE(CAST(json_extract(blocks.median_price_by_flat_type_json,?) AS INTEGER),blocks.median_price)<=? ORDER BY address_key LIMIT ?",
      params: ["TYPE 0", '$."TYPE 0"', 600000, 2001],
    },
    comparableBlockCount: {
      sql: "SELECT COUNT(*) AS cnt FROM transactions WHERE town=? AND block=? AND flat_type=?",
      params: ["TOWN 1", "1", "TYPE 0"],
    },
    comparableStreet: {
      sql: "SELECT * FROM transactions WHERE street_name=? AND flat_type=? ORDER BY month DESC LIMIT 150",
      params: ["STREET 1", "TYPE 0"],
    },
    comparableTown: {
      sql: "SELECT * FROM transactions WHERE town=? AND flat_type=? ORDER BY month DESC LIMIT 150",
      params: ["TOWN 1", "TYPE 0"],
    },
    dictionaryPage: {
      sql: "SELECT town,street_name,address_key,block,postal_code FROM blocks WHERE address_key>? ORDER BY address_key LIMIT ?",
      params: ["", 5000],
    },
  };
  const runtimeEvidence = Object.fromEntries(
    Object.entries(runtimeQueries).map(([name, query]) => {
      const started = performance.now();
      const rows = db.prepare(query.sql).all(...query.params);
      return [
        name,
        {
          ...query,
          rowsReturned: rows.length,
          nativeSqliteDurationMs: Number((performance.now() - started).toFixed(3)),
          exactD1RowsRead: null,
          plan: explain(query.sql, query.params),
        },
      ];
    }),
  );
  const report = {
    provenance: "synthetic-native-sqlite-and-emulated-http-NOT-remote-D1",
    dataset:
      "Deterministic synthetic historical cardinalities only; 8 fictional types, 28 towns, 200 observed months, 9700 blocks. Not actual Aug28/29 or current production rows.",
    counts: {
      beforeTransactions: 985399,
      afterTransactions: afterCount,
      blocks: baseline.blockSummaries.length,
      trends: baseline.townFlatTypeTrend.length,
      details: Object.keys(baseline.details).length,
      comparisons: Object.keys(baseline.comparisons ?? {}).length,
    },
    delta: {
      transactionInserts: 134,
      insertStatements: transactionStatements(delta).length,
      affectedBlocks: delta.affectedBlocks.size,
      affectedTownTypes: delta.affectedTownTypes.size,
      retryInserts: retry.inserts.length,
      rollbackVerified,
      ...nextPlan,
      sqliteRecordChangesExcludingIndexes: deltaRecordChanges,
    },
    reorder: reorderPlan,
    worstCase: {
      simultaneousContextAndWindow: {
        ...simultaneousPlan,
        rejectedBeforeWrites: simultaneousRejectedBeforeWrites,
      },
      contextChange: {
        ...contextPlan,
        sqliteRecordChangesExcludingIndexes: contextChanges,
        sqliteExecutionMs: contextExecutionMs,
        publication: "native candidate statements rolled back; manifest not advanced",
      },
      monthAndWindowChange: {
        ...monthPlan,
        sqliteRecordChangesExcludingIndexes: monthChanges,
        sqliteExecutionMs: monthExecutionMs,
        afterTransactions: 985534,
        publication: "native local atomic publication",
      },
    },
    elapsedBuildPlanPublishMs: Math.round(performance.now() - start),
    sqliteStorageBytes: pageCount * pageSize,
    d1Metrics: { rowsRead: null, rowsWritten: null, durationMs: null, accountHeadroom: null },
    runtimeEvidence,
    transactionIndexes: db
      .prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='transactions'")
      .all(),
    plans: {
      snapshot: explain(
        "SELECT * FROM transactions WHERE id>? ORDER BY id LIMIT ?",
        [900000, 5000],
      ),
      comparable: explain(
        "SELECT * FROM transactions WHERE town=? AND block=? AND flat_type=? ORDER BY month DESC LIMIT 100",
        ["TOWN 1", "1", "TYPE 0"],
      ),
      blocks: explain("SELECT * FROM blocks ORDER BY median_price DESC,transaction_count DESC"),
      trends: explain("SELECT * FROM town_flat_type_trends ORDER BY town,flat_type,month"),
      suggestPrefix: explain(
        "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? LIMIT 20",
        ["STREET 1%"],
      ),
      oldSuggestSubstring: explain(
        "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? LIMIT 20",
        ["%STREET 1%"],
      ),
      dictionary: explain(
        "SELECT town,street_name,address_key,block,postal_code FROM blocks WHERE address_key > ? ORDER BY address_key LIMIT ?",
        ["block-100", 5000],
      ),
      patch: explain(
        "UPDATE comparisons SET json=json_extract(patch.value,'$[1]') FROM json_each(?) AS patch WHERE comparisons.address_key=json_extract(patch.value,'$[0]')",
        [JSON.stringify([["block-1", "{}"]])],
      ),
    },
    limitations: [
      "Native SQLite record changes exclude index maintenance; forecasts are not D1 billable metadata",
      "HTTP metadata is deliberately emulated for adapter execution; real remote D1 metrics remain UNKNOWN",
      "Remote REST atomicity, batch body/time limits, account headroom and actual production source/storage are unproven",
    ],
  };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
  quietLog(JSON.stringify(report, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  console.log = quietLog;
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
