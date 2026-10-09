import { DatabaseSync } from "node:sqlite";
import { copyFileSync } from "node:fs";
import { D1Client, type D1Statement } from "../lib/sync/d1";
import {
  planTransactionDelta,
  assignStableTransactionIds,
  type StoredTransaction,
} from "../lib/sync/incremental";
import { planArtifactWrites, readPublishedArtifacts } from "../lib/sync/store";
import { buildArtifacts, toTransactionRow, type ResaleTransaction } from "../lib/pipeline";
import { connect, save, SCRATCH } from "./common.mjs";
import { translate } from "./translate.ts";
copyFileSync(`${SCRATCH}/source.sqlite`, `${SCRATCH}/planner.sqlite`);
const sqlite = new DatabaseSync(`${SCRATCH}/planner.sqlite`);
const rawFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => {
  if (typeof init?.body !== "string") throw new Error("Expected local compiler JSON body");
  const statement = JSON.parse(init.body) as D1Statement;
  if (!statement.sql.startsWith("SELECT")) throw new Error("Compiler adapter is local read-only");
  const results = sqlite
    .prepare(statement.sql)
    .all(...((statement.params ?? []) as (string | number | null)[]));
  return new Response(
    JSON.stringify({
      success: true,
      result: [
        {
          success: true,
          results,
          meta: { rows_read: results.length, rows_written: 0, changes: 0, duration: 0 },
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
};
const adapter = () =>
  new D1Client({
    accountId: "local-compiler",
    databaseId: "local-compiler",
    apiToken: "local-compiler",
    endpoint: "http://localhost",
  });
const { client, connectionMs } = await connect();
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  connectionMs,
  branch: "br-wispy-boat-b34glczl",
  dataProvenance:
    "Real production corpus; synthetic benchmark preparation and +134 facts; no production cutover",
  preparationScope:
    "Only isolated benchmark: withhold 134 facts in four populated blocks; rebuild derived baseline with fixed tiny amenity context, retain real geocodes/MRT, then add synthetic facts in the same four real blocks",
};
const types: Record<string, string> = {};
let publishing = false;
try {
  for (const row of (
    await client.query(
      "SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public'",
    )
  ).rows)
    types[`${row.table_name}.${row.column_name}`] = row.udt_name;
  const originalManifest = JSON.parse(
    sqlite.prepare("SELECT json FROM manifest WHERE id=1").get()!.json as string,
  );
  const mrtRows = sqlite.prepare("SELECT * FROM mrt_geojson").all();
  const exits = JSON.parse(mrtRows.find((r) => r.kind === "exits")!.json as string);
  const stations = JSON.parse(mrtRows.find((r) => r.kind === "stations")!.json as string);
  const mrtExits = exits.features.map(
    (f: { properties: { STATION_NA: string }; geometry: { coordinates: number[] } }) => ({
      stationName: f.properties.STATION_NA,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }),
  );
  const geocodes = Object.fromEntries(
    sqlite
      .prepare("SELECT * FROM geocode_cache")
      .all()
      .map((r) => [
        r.cache_key,
        {
          lat: Number(r.lat),
          lng: Number(r.lng),
          postalCode: r.postal_code as string | null,
          displayName: r.display_name as string | null,
          searchValue: r.search_value as string,
        },
      ]),
  );
  const four = sqlite
    .prepare(
      "SELECT b.address_key FROM blocks b JOIN transactions t ON t.address_key=b.address_key WHERE b.latest_month=? GROUP BY b.address_key HAVING count(*)>=100 ORDER BY b.address_key LIMIT 4",
    )
    .all(originalManifest.dataWindow.maxMonth)
    .map((r) => String(r.address_key));
  if (four.length !== 4) throw new Error("Need four populated current real blocks");
  const removed = four.flatMap((key, i) =>
    sqlite
      .prepare("SELECT id FROM transactions WHERE address_key=? ORDER BY id DESC LIMIT ?")
      .all(key, i < 2 ? 34 : 33)
      .map((r) => Number(r.id)),
  );
  sqlite
    .prepare(`DELETE FROM transactions WHERE id IN (${removed.map(() => "?").join(",")})`)
    .run(...removed);
  const stored = sqlite
    .prepare("SELECT * FROM transactions ORDER BY id")
    .all() as StoredTransaction[];
  const maxBaselineId = Math.max(...stored.slice(-100).map((r) => r.id));
  const source: ResaleTransaction[] = stored.map((row) => ({
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
    flatModel: row.flat_model ?? "",
    remainingLease: "",
    pricePerSqm: Number((row.resale_price / row.floor_area_sqm).toFixed(2)),
    pricePerSqft: Number((row.resale_price / row.floor_area_sqm / 10.7639).toFixed(2)),
  }));
  const context = {
    propertyInfo: [],
    mrtExits,
    geocodes,
    schools: [{ name: "Benchmark fixed amenity", lat: 1.3, lng: 103.8, mainLevelCode: "PRIMARY" }],
    metadata: originalManifest.sources,
  };
  const baseline = buildArtifacts({ ...context, transactions: source });
  const emptyDelta = {
    inserts: [],
    updates: [],
    affectedBlocks: new Set<string>(),
    affectedTownTypes: new Set<string>(),
  };
  const preparePlan = await planArtifactWrites(
    adapter(),
    baseline,
    exits,
    stations,
    new Date().toISOString(),
    emptyDelta,
    { enforceBudget: false },
  );
  const prepared = preparePlan.statements.map((s) => translate(s, types));
  await client.query("BEGIN");
  publishing = true;
  await client.query("DELETE FROM transactions WHERE id=ANY($1::bigint[])", [removed]);
  for (const s of prepared) await client.query(s.sql, s.params);
  await client.query("UPDATE manifest SET json=$1::jsonb,updated_at=now() WHERE id=1", [
    JSON.stringify(baseline.manifest),
  ]);
  await client.query("COMMIT");
  publishing = false;
  for (const s of preparePlan.statements)
    sqlite.prepare(s.sql).run(...((s.params ?? []) as (string | number | null)[]));
  sqlite.prepare("UPDATE manifest SET json=? WHERE id=1").run(JSON.stringify(baseline.manifest));
  const previous = await readPublishedArtifacts(adapter(), JSON.stringify(baseline.manifest));
  if (!previous) throw new Error("Missing baseline artifacts");
  const seeds = four.map(
    (key) =>
      source
        .filter((row) => row.addressKey === key)
        .sort((a, b) => b.month.localeCompare(a.month))[0],
  );
  const additions = Array.from({ length: 134 }, (_, i) => {
    const row = seeds[i % 4],
      price = row.resalePrice + 60000 + Math.floor(i / 8) * 100;
    return {
      ...row,
      id: `new:${i}`,
      month: originalManifest.dataWindow.maxMonth,
      resalePrice: price,
      pricePerSqm: Number((price / row.floorAreaSqm).toFixed(2)),
      pricePerSqft: Number((price / row.floorAreaSqm / 10.7639).toFixed(2)),
    };
  });
  const incoming = [...source, ...additions];
  const delta = planTransactionDelta(
    stored,
    incoming.map(toTransactionRow).filter((r) => r !== null),
  );
  assignStableTransactionIds(incoming, stored, delta, toTransactionRow);
  const buildStart = performance.now();
  const candidate = buildArtifacts({
    ...context,
    transactions: incoming,
    incremental: { previous, delta },
  });
  const plan = await planArtifactWrites(
    adapter(),
    candidate,
    exits,
    stations,
    new Date().toISOString(),
    delta,
    { enforceBudget: false },
  );
  const statements = plan.statements.map((s) => translate(s, types));
  evidence.buildAndPlanMs = performance.now() - buildStart;
  evidence.changedRows = plan.changedRows;
  evidence.computation = candidate.computation;
  evidence.d1FormulaForecast = plan.forecastWriteUpperBound;
  const expected = JSON.stringify(previous.manifest),
    next = JSON.stringify(candidate.manifest);
  async function publish(fail: boolean) {
    const t = performance.now(),
      wireBefore = (client.connection.stream as import("node:net").Socket).bytesWritten;
    const counts: Record<string, number> = {};
    const sqlBefore = Number(
      (
        await client.query(
          "SELECT COALESCE(sum(total_exec_time),0) AS n FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())",
        )
      ).rows[0].n,
    );
    await client.query("BEGIN");
    publishing = true;
    try {
      const guard = await client.query(
        "SELECT json=$1::jsonb AS matches FROM manifest WHERE id=1 FOR UPDATE",
        [expected],
      );
      if (!guard.rows[0].matches) throw new Error("Stale publication blocked");
      for (const s of statements) {
        const result = await client.query(s.sql, s.params);
        const table = s.sql.match(/^(?:INSERT INTO|UPDATE) ([a-z_]+)/)![1];
        counts[table] = (counts[table] ?? 0) + (result.rowCount ?? 0);
      }
      if (fail) await client.query("SELECT 'injected-before-manifest'::integer");
      await client.query(
        "INSERT INTO manifest(id,json,updated_at) VALUES(1,$1::jsonb,now()) ON CONFLICT(id) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at",
        [next],
      );
      await client.query("COMMIT");
      publishing = false;
      const sqlAfter = Number(
        (
          await client.query(
            "SELECT COALESCE(sum(total_exec_time),0) AS n FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())",
          )
        ).rows[0].n,
      );
      return {
        success: true,
        wallMs: performance.now() - t,
        sqlMs: sqlAfter - sqlBefore,
        wireSentBytes:
          (client.connection.stream as import("node:net").Socket).bytesWritten - wireBefore,
        roundTrips: statements.length + 6,
        rows: counts,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      publishing = false;
      if (!fail) throw error;
      return {
        success: false,
        injected: true,
        wallMs: performance.now() - t,
        rowsBeforeRollback: counts,
      };
    }
  }
  const beforeSize = Number(
    (await client.query("SELECT pg_database_size(current_database()) AS n")).rows[0].n,
  );
  const failure = await publish(true);
  const stateAfterFailure = await client.query(
    "SELECT (SELECT count(*) FROM transactions) AS n,json=$1::jsonb AS manifest_matches FROM manifest WHERE id=1",
    [expected],
  );
  if (Number(stateAfterFailure.rows[0].n) !== 985399 || !stateAfterFailure.rows[0].manifest_matches)
    throw new Error("Injected rollback failed");
  evidence.failure = { ...failure, rollbackVerified: true };
  evidence.publication = await publish(false);
  const afterSize = Number(
    (await client.query("SELECT pg_database_size(current_database()) AS n")).rows[0].n,
  );
  const added = await client.query("SELECT * FROM transactions WHERE id>$1 ORDER BY id", [
    maxBaselineId,
  ]);
  const retry = planTransactionDelta(
    [...stored, ...added.rows.map((r) => ({ ...r, id: Number(r.id) }))],
    incoming.map(toTransactionRow).filter((r) => r !== null),
  );
  if (retry.inserts.length || retry.updates.length) throw new Error("Retry duplicates facts");
  for (const s of plan.statements)
    sqlite.prepare(s.sql).run(...((s.params ?? []) as (string | number | null)[]));
  sqlite.prepare("UPDATE manifest SET json=? WHERE id=1").run(next);
  const retryPlan = await planArtifactWrites(
    adapter(),
    candidate,
    exits,
    stations,
    new Date().toISOString(),
    retry,
    { enforceBudget: false },
  );
  if (retryPlan.statements.length) throw new Error("Retry changes derived data");
  evidence.retry = {
    transactionInserts: retry.inserts.length,
    transactionUpdates: retry.updates.length,
    derivedStatements: retryPlan.statements.length,
  };
  evidence.storageAfterPreparatoryChurn = {
    beforeSize,
    afterSize,
    deltaBytes: afterSize - beforeSize,
    note: "Includes failed transaction/MVCC dead tuples, not steady-state per-row growth",
  };
  evidence.statementCount = statements.length + 2;
  evidence.finishedAt = new Date().toISOString();
  save("publication", evidence);
  console.log(JSON.stringify(evidence));
} finally {
  if (publishing) await client.query("ROLLBACK").catch(() => {});
  await client.end();
  sqlite.close();
  globalThis.fetch = rawFetch;
}
