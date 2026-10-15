import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { runSyncNeon } from "../../scripts/sync-neon";
import { NEON_REFRESH_BRANCH, NeonSessionGuard, type PgQuery } from "../../scripts/lib/sync/neon";
import { resetUpstreamThrottleForTests } from "../../scripts/lib/sync/rate-limits";
import {
  FakeClock,
  MUTATING_SQL,
  addressKeys,
  createRefreshDatabase,
  inventory,
  manifestState,
  pgliteSession,
  refreshDependencies,
  resaleRows,
  searchValueFor,
  seedBaseline,
  settledReceipt,
  tableCounts,
  type Inventory,
  type OneMapFake,
  type SessionHooks,
  type SqlEvent,
} from "../helpers/neonRefreshHarness";

/**
 * The real `runSyncNeon`, end to end, on real PostgreSQL (PGlite). Upstream datasets and OneMap are deterministic
 * fakes that advance the run's clock as slow requests would; the PGlite session enforces
 * `idle_in_transaction_session_timeout` against that clock (see `pgliteSession`). Behaviour PGlite cannot show
 * (the server's own timer, a second concurrent session) is covered by tests/integration/neon-refresh-postgres.test.ts.
 */

const MINUTE = 60_000;

beforeEach(() => {
  // Real OneMap pacing applies to every HTTP attempt; 1 ms keeps these runs fast.
  vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1");
});

afterEach(() => {
  resetUpstreamThrottleForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type Counts = Record<string, number>;
/** The parts of the run receipt (`--report`) these tests read. */
type Report = {
  success?: boolean;
  outcome?: string;
  publication: { outcome?: string; statements?: number; changedRows?: Counts } | null;
  changedRows: Counts;
  transactionBoundaries: Record<string, unknown>;
  phasesMs: Counts;
  sideEffects: { database: string };
  unresolved: Counts;
  oneMap: {
    limits: Counts;
    httpAttempts: Counts;
    budgetRefusals: Counts;
    successfulOperations: Counts;
    blockGeocoding: Counts;
    amenityGeocoding: Counts;
    routing: Counts;
  } & Record<string, unknown>;
};

async function scenario(
  options: {
    rows?: Record<string, string>[];
    /** Addresses with a cached geocode in the baseline; defaults to all of them. */
    geocoded?: (keys: string[]) => string[];
    oneMap?: OneMapFake;
    upstreamMs?: number;
    inventories?: Inventory[];
    hooks?: SessionHooks;
    onUpstream?: (db: PGlite, datasetId: string) => Promise<void> | void;
    schoolRows?: Record<string, string>[];
  } = {},
) {
  const db = await createRefreshDatabase();
  const rows = options.rows ?? resaleRows(20);
  const keys = addressKeys(rows);
  await seedBaseline(db, options.geocoded ? options.geocoded(keys) : keys);
  const clock = new FakeClock();
  const dir = mkdtempSync(path.join(tmpdir(), "neon-refresh-"));
  const usage = path.join(dir, "usage.json");
  writeFileSync(usage, JSON.stringify(settledReceipt(clock)));
  const events: SqlEvent[] = [];
  const run = async (mode: "--plan" | "--apply", extra: string[] = [], runRows = rows) => {
    const client = pgliteSession(db, clock, events, options.hooks);
    const harness = refreshDependencies({
      client,
      clock,
      rows: runRows,
      oneMap: options.oneMap,
      upstreamMs: options.upstreamMs,
      inventories: options.inventories,
      schoolRows: options.schoolRows,
      onUpstream: options.onUpstream ? (id) => options.onUpstream!(db, id) : undefined,
    });
    // OneMap is faked at the HTTP layer: the real helpers, retries, pacing and budget all run.
    vi.stubGlobal("fetch", harness.fetch);
    const report = path.join(dir, `report-${events.length}.json`);
    const argv = [
      mode,
      "--reconcile-manual",
      "--branch",
      NEON_REFRESH_BRANCH,
      "--usage-before",
      usage,
      "--report",
      report,
      ...extra,
    ];
    const firstEvent = events.length;
    let error: unknown;
    try {
      await runSyncNeon(argv, harness.deps);
    } catch (caught) {
      error = caught;
    }
    // A run refused before connecting writes no receipt; an empty object keeps assertions meaningful.
    let receipt = {} as Report;
    try {
      receipt = JSON.parse(readFileSync(report, "utf8")) as Report;
    } catch {
      // A run refused before connecting writes no receipt.
    }
    return {
      error,
      receipt,
      record: harness.record,
      client,
      events: events.slice(firstEvent),
    };
  };
  return { db, clock, keys, rows, run };
}

/** Each transaction in the order it ran, with the statements sent inside it. */
function transactions(events: SqlEvent[]) {
  const result: { begin: string; statements: SqlEvent[]; end: string }[] = [];
  let current: { begin: string; statements: SqlEvent[] } | null = null;
  for (const event of events) {
    if (/^\s*BEGIN\b/i.test(event.sql)) current = { begin: event.sql, statements: [event] };
    else if (current) {
      current.statements.push(event);
      if (/^\s*(COMMIT|ROLLBACK)\b/i.test(event.sql)) {
        result.push({ ...current, end: event.sql });
        current = null;
      }
    }
  }
  return result;
}

describe("transaction boundaries", () => {
  it("holds no transaction while slow upstream and OneMap work runs far past the 120 s idle limit", async () => {
    const { run, clock, keys } = await scenario({
      // Two block addresses lack a geocode, so OneMap Search and routing both have work to do.
      geocoded: (all) => all.slice(0, 3),
      upstreamMs: 121_000,
      oneMap: { token: "fixture-token", requestMs: 121_000 },
    });
    const started = clock.now;
    const result = await run("--apply", [
      "--onemap-search-budget",
      "5",
      "--onemap-routing-budget",
      "4",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.client.idleTimedOut()).toBe(false);
    // The simulated external work far exceeds the idle-in-transaction timeout ...
    expect(clock.now - started).toBeGreaterThan(20 * MINUTE);
    expect(result.record.searches).toHaveLength(keys.length - 3);
    expect(result.record.routes).toBe(4);
    // ... yet the clock never moved while any transaction was open: no external request ran inside one.
    const runTransactions = transactions(result.events);
    expect(runTransactions.map((tx) => tx.begin)).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "BEGIN",
    ]);
    for (const tx of runTransactions)
      expect(new Set(tx.statements.map((event) => event.at)).size).toBe(1);
    expect(result.events.find((event) => event.sql.startsWith("SET idle_in"))?.sql).toBe(
      "SET idle_in_transaction_session_timeout=120000",
    );
    expect(result.receipt.transactionBoundaries).toMatchObject({
      preparationOutsideTransaction: true,
      idleInTransactionTimeoutMs: 120_000,
    });
    expect(Object.keys(result.receipt.phasesMs)).toEqual([
      "baselineSnapshot",
      "preparationWithoutDatabase",
      "planningSnapshot",
      "publication",
    ]);
  });

  it("control: the session ends a transaction left idle past the timeout, as the old boundary would have", async () => {
    const db = await createRefreshDatabase();
    const clock = new FakeClock();
    const session = pgliteSession(db, clock, []);
    await session.query("SET idle_in_transaction_session_timeout=120000");
    await session.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await session.query("SELECT 1");
    clock.advance(121_000); // one slow OneMap request inside the snapshot
    await expect(session.query("SELECT 1")).rejects.toThrow("idle-in-transaction timeout");
    expect(session.idleTimedOut()).toBe(true);
  });

  it("the session guard refuses network-bound work inside a transaction and blocks queries during it", async () => {
    const sent: string[] = [];
    const guard = new NeonSessionGuard((async (sql: string) => {
      sent.push(sql);
      return { rows: [], rowCount: 0 };
    }) as PgQuery);
    await guard.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await expect(guard.withoutDatabase("OneMap work", async () => "ran")).rejects.toThrow(
      "transaction is open",
    );
    await guard.query("COMMIT");
    await expect(
      guard.withoutDatabase("OneMap work", () => guard.query("SELECT json FROM manifest")),
    ).rejects.toThrow("Database access is closed during OneMap work");
    expect(sent).toEqual(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT"]);
    // A lost COMMIT reply still ends the transaction from the guard's point of view.
    const failing = new NeonSessionGuard((async (sql: string) => {
      if (sql === "COMMIT") throw new Error("connection lost");
      return { rows: [], rowCount: 0 };
    }) as PgQuery);
    await failing.query("BEGIN");
    await expect(failing.query("COMMIT")).rejects.toThrow("connection lost");
    expect(failing.inTransaction).toBe(false);
  });
});

describe("plan mode side effects", () => {
  it("never mutates the database and makes no OneMap request without an explicit budget", async () => {
    const { run, db } = await scenario({
      geocoded: (all) => all.slice(0, 3),
      oneMap: { token: "fixture-token" },
    });
    const countsBefore = await tableCounts(db);
    const manifestBefore = await manifestState(db);
    const result = await run("--plan");
    expect(result.error).toBeUndefined();
    expect(result.events.filter((event) => MUTATING_SQL.test(event.sql))).toEqual([]);
    expect(transactions(result.events).every((tx) => tx.begin.includes("READ ONLY"))).toBe(true);
    expect(await tableCounts(db)).toEqual(countsBefore);
    expect(await manifestState(db)).toEqual(manifestBefore);
    expect(result.record).toMatchObject({ tokenRequests: 0, searches: [], routes: 0 });
    expect(result.receipt.publication).toBeNull();
    expect(result.receipt.sideEffects.database).toMatch(/read-only snapshots only/);
    expect(result.receipt.oneMap).toMatchObject({
      tokenStatus: "not-requested",
      limits: { auth: 0, search: 0, routing: 0 },
      httpAttempts: { auth: 0, search: 0, routing: 0 },
      budgetRefusals: { auth: 0, search: 0, routing: 0 },
      blockGeocoding: { candidates: 2, started: 0, deferredByBudget: 2 },
    });
    // Ordinary upstream reads still happen: planning needs the official datasets.
    expect(result.record.upstreamCalls.length).toBeGreaterThan(0);
  });

  it("spends OneMap quota in plan only within an explicit budget, and keeps nothing", async () => {
    const { run, db } = await scenario({
      geocoded: (all) => all.slice(0, 3),
      oneMap: { email: "operator@example.com" },
    });
    const countsBefore = await tableCounts(db);
    const result = await run("--plan", ["--onemap-search-budget", "1"]);
    expect(result.error).toBeUndefined();
    expect(result.record.tokenRequests).toBe(1);
    expect(result.record.searches).toHaveLength(1);
    expect(result.receipt.oneMap.blockGeocoding).toMatchObject({
      candidates: 2,
      started: 1,
      resolved: 1,
      deferredByBudget: 1,
    });
    expect(result.receipt.oneMap.httpAttempts).toEqual({ auth: 1, search: 1, routing: 0 });
    expect(result.receipt.oneMap.successfulOperations).toEqual({ auth: 1, search: 1, routing: 0 });
    expect(result.events.filter((event) => MUTATING_SQL.test(event.sql))).toEqual([]);
    expect(await tableCounts(db)).toEqual(countsBefore);
  });
});

describe("changes during preparation", () => {
  it("refuses to plan when the stored publication changes while preparation runs", async () => {
    let wrote = false;
    const { run, db } = await scenario({
      onUpstream: async (handle, datasetId) => {
        // Another writer publishes while the amenity sources download (no run transaction is open then).
        if (datasetId.startsWith("d_688b") && !wrote) {
          wrote = true;
          await handle.query(
            "UPDATE manifest SET json = json || '{\"concurrent\":true}'::jsonb, updated_at = now() WHERE id = 1",
          );
        }
      },
    });
    const countsBefore = await tableCounts(db);
    const result = await run("--apply");
    expect(wrote).toBe(true);
    expect(String(result.error)).toMatch("stored publication changed during preparation");
    expect(result.receipt.outcome).toBe("stale-preparation-nothing-written");
    expect(result.events.filter((event) => MUTATING_SQL.test(event.sql))).toEqual([]);
    expect(await tableCounts(db)).toEqual(countsBefore);
  });

  it("detects a republish that leaves the manifest JSON identical (updated_at alone changed)", async () => {
    const { run, db } = await scenario({
      onUpstream: async (handle, datasetId) => {
        if (datasetId.startsWith("d_688b"))
          await handle.query("UPDATE manifest SET updated_at = updated_at + interval '1 second'");
      },
    });
    const countsBefore = await tableCounts(db);
    const result = await run("--apply");
    expect(String(result.error)).toMatch("stored publication changed during preparation");
    expect(await tableCounts(db)).toEqual(countsBefore);
  });

  it("refuses when the upstream inventory changes while preparation runs", async () => {
    const { run, db } = await scenario({
      inventories: [inventory(), inventory("2026-10-15T09:00:00+08:00")],
    });
    const countsBefore = await tableCounts(db);
    const result = await run("--apply");
    expect(String(result.error)).toMatch("Source inventory changed during preparation");
    expect(result.events.filter((event) => MUTATING_SQL.test(event.sql))).toEqual([]);
    expect(await tableCounts(db)).toEqual(countsBefore);
  });

  it("re-checks the version under FOR UPDATE, so a publication between planning and writing is refused", async () => {
    const handle: { db?: PGlite } = {};
    const setup = await scenario({
      hooks: {
        beforeQuery: async (sql) => {
          // The publication's own transaction begins with a bare BEGIN; another writer commits just before it.
          if (sql === "BEGIN")
            await handle.db!.query("UPDATE manifest SET updated_at = now() + interval '1 minute'");
        },
      },
    });
    handle.db = setup.db;
    const { db } = setup;
    const countsBefore = await tableCounts(db);
    const result = await setup.run("--apply");
    expect(String(result.error)).toMatch("Stale Neon publication baseline");
    const publication = transactions(result.events).at(-1)!;
    expect(publication.statements[1].sql).toContain("updated_at=$2::timestamptz");
    expect(publication.statements[1].sql).toContain("FOR UPDATE");
    expect(publication.end).toBe("ROLLBACK");
    expect(await tableCounts(db)).toEqual(countsBefore);
  });
});

describe("OneMap budgets and missing results", () => {
  it("without OneMap credentials requests nothing and publishes no block it cannot locate", async () => {
    const { run, db } = await scenario({ geocoded: (all) => all.slice(0, 3) });
    const result = await run("--apply", [
      "--onemap-search-budget",
      "5",
      "--onemap-routing-budget",
      "5",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.record).toMatchObject({ tokenRequests: 0, searches: [], routes: 0 });
    expect(result.receipt.oneMap).toMatchObject({
      credentialMode: "none",
      tokenStatus: "not-configured",
      blockGeocoding: { candidates: 2, started: 0, notAttemptedWithoutToken: 2 },
      httpAttempts: { auth: 0, search: 0, routing: 0 },
    });
    expect(result.receipt.unresolved.blockAddressesWithoutCoordinates).toBe(2);
    expect((await tableCounts(db)).blocks).toBe(3);
    expect((await tableCounts(db)).walking_time_cache).toBe(0);
  });

  it("counts unsuccessful lookups as failures, never as results", async () => {
    const [noMatch, failing] = addressKeys(resaleRows(20)).slice(3).map(searchValueFor);
    const again = await scenario({
      geocoded: (all) => all.slice(0, 3),
      oneMap: { token: "fixture-token", notFound: new Set([noMatch]), failing: new Set([failing]) },
    });
    const result = await again.run("--apply", ["--onemap-search-budget", "5"]);
    expect(result.error).toBeUndefined();
    // HTTP 400 is not retried: one attempt each.
    expect(result.record.searches.sort()).toEqual([noMatch, failing].sort());
    expect(result.receipt.oneMap.blockGeocoding).toMatchObject({
      candidates: 2,
      started: 2,
      resolved: 0,
      noResult: 1,
      failed: 1,
      refusedByBudget: 0,
    });
    expect(result.receipt.oneMap.httpAttempts.search).toBe(2);
    // A lookup that found nothing still completed; the rejected one did not.
    expect(result.receipt.oneMap.successfulOperations.search).toBe(1);
    expect(result.receipt.unresolved.blockAddressesWithoutCoordinates).toBe(2);
    expect((await tableCounts(again.db)).blocks).toBe(3);
    expect((await tableCounts(again.db)).geocode_cache).toBe(3);
  });

  it("defers what an exhausted search budget cannot cover and reports it", async () => {
    const { run, db } = await scenario({
      geocoded: (all) => all.slice(0, 3),
      oneMap: { token: "fixture-token" },
      schoolRows: [
        { school_name: "FIXTURE PRIMARY", postal_code: "460101", mainlevel_code: "PRIMARY" },
      ],
    });
    const result = await run("--apply", ["--onemap-search-budget", "1"]);
    expect(result.error).toBeUndefined();
    expect(result.record.searches).toHaveLength(1);
    expect(result.receipt.oneMap.blockGeocoding).toMatchObject({
      candidates: 2,
      started: 1,
      resolved: 1,
      deferredByBudget: 1,
    });
    // The amenity geocode came after the block lookup had spent the budget: skipped and counted, not requested.
    expect(result.receipt.oneMap.amenityGeocoding).toMatchObject({
      candidates: 1,
      started: 0,
      deferredByBudget: 1,
    });
    expect(result.receipt.unresolved).toMatchObject({
      blockAddressesWithoutCoordinates: 1,
      amenitiesWithoutCoordinates: 1,
    });
    expect(result.receipt.oneMap).toMatchObject({
      limits: { search: 1 },
      httpAttempts: { auth: 0, search: 1, routing: 0 },
      budgetRefusals: { auth: 0, search: 0, routing: 0 },
    });
    expect((await tableCounts(db)).blocks).toBe(4);
  });

  it("counts every HTTP attempt: a retried lookup spends two attempts and both lookups succeed", async () => {
    const [first, second] = addressKeys(resaleRows(20)).slice(3).map(searchValueFor);
    const { run, db } = await scenario({
      geocoded: (all) => all.slice(0, 3),
      oneMap: { token: "fixture-token", transient: new Set([first]) },
    });
    const result = await run("--apply", ["--onemap-search-budget", "3"]);
    expect(result.error).toBeUndefined();
    // The fake OneMap received three physical attempts: 503, its retry, and the second lookup.
    expect(result.record.searches.sort()).toEqual([first, first, second].sort());
    expect(result.receipt.oneMap).toMatchObject({
      httpAttempts: { auth: 0, search: 3, routing: 0 },
      budgetRefusals: { auth: 0, search: 0, routing: 0 },
      successfulOperations: { search: 2 },
      blockGeocoding: { started: 2, resolved: 2, failed: 0, refusedByBudget: 0 },
    });
    expect((await tableCounts(db)).blocks).toBe(5);
  });

  it("stops a retry the budget cannot cover: the refused attempt is never sent", async () => {
    const [first, second] = addressKeys(resaleRows(20)).slice(3).map(searchValueFor);
    const { run, db } = await scenario({
      geocoded: (all) => all.slice(0, 3),
      oneMap: { token: "fixture-token", transient: new Set([first]) },
    });
    // Two attempts for two lookups; the first lookup's 503 needs a third for its retry.
    const result = await run("--apply", ["--onemap-search-budget", "2"]);
    expect(result.error).toBeUndefined();
    expect(result.record.searches.sort()).toEqual([first, second].sort());
    expect(result.receipt.oneMap).toMatchObject({
      httpAttempts: { search: 2 },
      budgetRefusals: { search: 1 },
      successfulOperations: { search: 1 },
      blockGeocoding: { started: 2, resolved: 1, refusedByBudget: 1, failed: 0 },
    });
    // The refused lookup stays unresolved and counts toward the geocode-failure guard; nothing is invented.
    expect(result.receipt.unresolved.blockAddressesWithoutCoordinates).toBe(1);
    expect((await tableCounts(db)).blocks).toBe(4);
  });

  it("routes only the budget from an empty routing cache and reports every unrouted pair", async () => {
    const { run, db } = await scenario({ oneMap: { token: "fixture-token" } });
    const result = await run("--apply", ["--onemap-routing-budget", "3"]);
    expect(result.error).toBeUndefined();
    expect(result.record.routes).toBe(3);
    // Five blocks × three nearest stations, all uncached.
    expect(result.receipt.oneMap.routing).toMatchObject({
      missingPairs: 15,
      started: 3,
      routed: 3,
      deferredByBudget: 12,
      refusedByBudget: 0,
    });
    expect(result.receipt.oneMap.httpAttempts.routing).toBe(3);
    expect(result.receipt.oneMap.successfulOperations.routing).toBe(3);
    expect(result.receipt.unresolved.walkingPairsWithoutRoute).toBe(12);
    expect((await tableCounts(db)).walking_time_cache).toBe(3);
  });

  it("rejects budgets above the per-run maximum before any network or database activity", async () => {
    const { run } = await scenario({ oneMap: { token: "fixture-token" } });
    const result = await run("--apply", ["--onemap-routing-budget", "29190"]);
    expect(String(result.error)).toMatch(/whole number|per-run maximum/);
    expect(result.record.upstreamCalls).toEqual([]);
    expect(result.events).toEqual([]);
    const overCap = await run("--apply", ["--onemap-routing-budget", "600"]);
    expect(String(overCap.error)).toMatch("per-run maximum of 600 HTTP attempts");
    expect(overCap.record.upstreamCalls).toEqual([]);
  });
});

describe("publication", () => {
  it("writes data and then the manifest, last, in one transaction guarded by the publication version", async () => {
    const { run } = await scenario();
    const result = await run("--apply");
    expect(result.error).toBeUndefined();
    const publication = transactions(result.events).at(-1)!;
    expect(publication.begin).toBe("BEGIN");
    expect(publication.end).toBe("COMMIT");
    const sent = publication.statements.slice(1, -1).map((event) => event.sql);
    expect(sent[0]).toMatch(
      /^SELECT json=\$1::jsonb AND updated_at=\$2::timestamptz .* FOR UPDATE$/,
    );
    expect(sent.at(-1)).toMatch(/^UPDATE manifest SET json=\$1::jsonb,updated_at=\$2 WHERE id=1$/);
    expect(sent.slice(1, -1).every((sql) => MUTATING_SQL.test(sql))).toBe(true);
    expect(sent.slice(1, -1).some((sql) => sql.startsWith("UPDATE manifest"))).toBe(false);
    // Nothing outside that transaction mutates.
    const outside = result.events.filter(
      (event) => !publication.statements.includes(event) && MUTATING_SQL.test(event.sql),
    );
    expect(outside).toEqual([]);
  });

  it("leaves no partial generation when publication fails after its data statements", async () => {
    const { run, db } = await scenario({
      hooks: {
        beforeQuery: (sql) => {
          if (sql.startsWith("UPDATE manifest"))
            throw new Error("injected failure before manifest");
        },
      },
    });
    const countsBefore = await tableCounts(db);
    const manifestBefore = await manifestState(db);
    const result = await run("--apply");
    expect(String(result.error)).toMatch("injected failure before manifest");
    // Data statements had run inside the transaction before the failure ...
    const publication = transactions(result.events).at(-1)!;
    expect(publication.statements.some((event) => event.sql.startsWith("INSERT"))).toBe(true);
    expect(publication.end).toBe("ROLLBACK");
    // ... and none of them survived.
    expect(await tableCounts(db)).toEqual(countsBefore);
    expect(await manifestState(db)).toEqual(manifestBefore);
  });

  it("rewrites no data on an identical rerun, then publishes only a real delta", async () => {
    const { run, db, rows } = await scenario();
    expect((await run("--apply")).error).toBeUndefined();
    const countsAfterFirst = await tableCounts(db);
    const rowsAfterFirst = await db.query("SELECT * FROM transactions ORDER BY id");
    // The unreviewed path has no replay marker (that belongs to the reviewed reconciliation path): an identical
    // rerun plans zero data statements, so its publication touches the manifest alone.
    const rerun = await run("--apply");
    expect(rerun.error).toBeUndefined();
    expect(rerun.receipt.changedRows).toEqual({
      transactions: 0,
      blocks: 0,
      block_details: 0,
      comparisons: 0,
      town_flat_type_trends: 0,
      mrt_geojson: 0,
    });
    expect(rerun.receipt.publication).toMatchObject({
      statements: 2,
      changedRows: { manifest: 1 },
    });
    const rerunWrites = rerun.events.filter((event) => MUTATING_SQL.test(event.sql));
    expect(rerunWrites.map((event) => event.sql.split(" ").slice(0, 2).join(" "))).toEqual([
      "UPDATE manifest",
    ]);
    expect(await tableCounts(db)).toEqual(countsAfterFirst);
    expect((await db.query("SELECT * FROM transactions ORDER BY id")).rows).toEqual(
      rowsAfterFirst.rows,
    );
    const manifestAfterFirst = await manifestState(db);
    const grown = [...rows, ...resaleRows(21).slice(20)];
    const delta = await run("--apply", [], grown);
    expect(delta.error).toBeUndefined();
    expect(delta.receipt.changedRows.transactions).toBe(1);
    expect((await tableCounts(db)).transactions).toBe(countsAfterFirst.transactions + 1);
    expect((await manifestState(db)).updated_at).not.toBe(manifestAfterFirst.updated_at);
  });
});
