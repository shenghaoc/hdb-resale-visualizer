import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { runSyncNeon } from "../../scripts/sync-neon";
import { NEON_REFRESH_BRANCH } from "../../scripts/lib/sync/neon";
import {
  FakeClock,
  MUTATING_SQL,
  NEON_REFRESH_SCHEMA,
  addressKeys,
  manifestState,
  pgSession,
  refreshDependencies,
  resaleRows,
  seedBaseline,
  settledReceipt,
  tableCounts,
  type SessionHooks,
  type SqlEvent,
} from "../helpers/neonRefreshHarness";

/**
 * The refresh against a real PostgreSQL server, for what PGlite cannot show: the server's own
 * `idle_in_transaction_session_timeout` timer and a genuinely separate second session.
 *
 * Opt-in: set HDB_LOCAL_POSTGRES_URL to a disposable local server's maintenance database (for example
 * postgresql://postgres@127.0.0.1:55432/postgres). Each test creates its own uniquely named database and drops only
 * that database afterwards. Never point this at Neon or any shared server.
 */
const LOCAL = process.env.HDB_LOCAL_POSTGRES_URL;
const TIMEOUT_MS = 1_000;
const SLOW_MS = 1_300;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Each run really waits SLOW_MS for every simulated upstream and OneMap request.
describe.skipIf(!LOCAL)("refresh on a real PostgreSQL server", { timeout: 120_000 }, () => {
  const admin = new pg.Client({ connectionString: LOCAL });
  const created: string[] = [];
  const sessions: pg.Client[] = [];

  beforeAll(async () => {
    const url = new URL(LOCAL!);
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname))
      throw new Error("HDB_LOCAL_POSTGRES_URL must be a local disposable server");
    await admin.connect();
  });

  // OneMap is faked at `fetch`; keep the real per-attempt pacing short so SLOW_MS dominates.
  beforeEach(() => vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    // Close every session this file opened (a failed test may not have), then drop only what it created.
    await Promise.all(sessions.map((session) => session.end().catch(() => {})));
    const failures: string[] = [];
    for (const name of created)
      await admin.query(`DROP DATABASE "${name}"`).catch((error: Error) => {
        failures.push(`${name}: ${error.message}`);
      });
    await admin.end();
    if (failures.length) throw new Error(`Could not drop test databases: ${failures.join("; ")}`);
  });

  async function freshDatabase() {
    const name = `hdb_refresh_test_${process.pid}_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    created.push(name);
    const url = new URL(LOCAL!);
    url.pathname = `/${name}`;
    const observer = new pg.Client({ connectionString: url.toString() });
    sessions.push(observer);
    await observer.connect();
    await observer.query(NEON_REFRESH_SCHEMA);
    return { url: url.toString(), observer };
  }

  async function scenario(hooks: SessionHooks = {}, onUpstream?: (id: string) => Promise<void>) {
    const { url, observer } = await freshDatabase();
    const rows = resaleRows(20);
    const keys = addressKeys(rows);
    await seedBaseline(observer, keys.slice(0, 3));
    const clock = new FakeClock();
    const dir = mkdtempSync(path.join(tmpdir(), "neon-refresh-pg-"));
    writeFileSync(path.join(dir, "usage.json"), JSON.stringify(settledReceipt(clock)));
    const events: SqlEvent[] = [];
    const client = new pg.Client({ connectionString: url, keepAlive: true });
    sessions.push(client);
    const harness = refreshDependencies({
      client: pgSession(client, events, clock, hooks),
      clock,
      rows,
      oneMap: { token: "fixture-token", realDelayMs: SLOW_MS },
      realUpstreamDelayMs: SLOW_MS,
      idleInTransactionTimeoutMs: TIMEOUT_MS,
      onUpstream,
    });
    const report = path.join(dir, "report.json");
    const argv = [
      "--apply",
      "--reconcile-manual",
      "--branch",
      NEON_REFRESH_BRANCH,
      "--usage-before",
      path.join(dir, "usage.json"),
      "--report",
      report,
      "--onemap-search-budget",
      "2",
      "--onemap-routing-budget",
      "2",
    ];
    const run = async () => {
      vi.stubGlobal("fetch", harness.fetch);
      try {
        await runSyncNeon(argv, harness.deps);
        return undefined;
      } catch (error) {
        return error;
      }
    };
    const receipt = () => JSON.parse(readFileSync(report, "utf8")) as Record<string, unknown>;
    return { observer, run, events, receipt, record: harness.record };
  }

  it("control: the server itself ends a transaction left idle past the timeout", async () => {
    const { url, observer } = await freshDatabase();
    const session = new pg.Client({ connectionString: url });
    sessions.push(session);
    const serverErrors: string[] = [];
    session.on("error", (error) => serverErrors.push(error.message));
    await session.connect();
    await session.query(`SET idle_in_transaction_session_timeout=${TIMEOUT_MS}`);
    await session.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await session.query("SELECT 1");
    await sleep(SLOW_MS); // one slow external request inside the snapshot, as the old boundary allowed
    await expect(session.query("SELECT 1")).rejects.toThrow();
    // The server's own FATAL message, not a client-side timeout.
    expect(serverErrors.join(" ")).toMatch(
      "terminating connection due to idle-in-transaction timeout",
    );
    await session.end().catch(() => {});
    await observer.end();
  });

  it("completes with every upstream and OneMap call slower than the server's idle timeout", async () => {
    const { observer, run, receipt, record, events } = await scenario();
    const before = await tableCounts(observer);
    const started = Date.now();
    expect(await run()).toBeUndefined();
    // Real waits: at least the upstream downloads after the snapshot plus every OneMap request.
    expect(Date.now() - started).toBeGreaterThan(6 * SLOW_MS);
    expect(record.searches).toHaveLength(2);
    expect(record.routes).toBe(2);
    // The receipt's attempt counts agree with what the fake OneMap actually received.
    expect(receipt().oneMap).toMatchObject({
      httpAttempts: { auth: 0, search: 2, routing: 2 },
      budgetRefusals: { auth: 0, search: 0, routing: 0 },
      successfulOperations: { auth: 0, search: 2, routing: 2 },
    });
    const after = await tableCounts(observer);
    expect(after.transactions).toBe(before.transactions + 20);
    expect(after.blocks).toBe(5);
    expect(after.walking_time_cache).toBe(2);
    expect(receipt().success).toBe(true);
    expect(events.find((event) => event.sql.startsWith("SET idle_in"))?.sql).toBe(
      `SET idle_in_transaction_session_timeout=${TIMEOUT_MS}`,
    );
    await observer.end();
  });

  it("refuses when a second session publishes while preparation runs", async () => {
    const writer: { session?: pg.Client } = {};
    const setup = await scenario({}, async (id) => {
      // A separate session commits a publication while the amenity sources download.
      if (id.startsWith("d_688b"))
        await writer.session!.query(
          "UPDATE manifest SET json = json || '{\"concurrent\":true}'::jsonb, updated_at = now() WHERE id = 1",
        );
    });
    writer.session = setup.observer;
    const before = await tableCounts(setup.observer);
    expect(String(await setup.run())).toMatch("stored publication changed during preparation");
    expect(setup.events.filter((event) => MUTATING_SQL.test(event.sql))).toEqual([]);
    expect(await tableCounts(setup.observer)).toEqual(before);
    await setup.observer.end();
  });

  it("re-checks under FOR UPDATE: a second session committing just before publication is refused", async () => {
    const writer: { session?: pg.Client } = {};
    const setup = await scenario({
      beforeQuery: async (sql) => {
        if (sql === "BEGIN" && writer.session)
          await writer.session.query(
            "UPDATE manifest SET updated_at = now() + interval '1 minute'",
          );
      },
    });
    writer.session = setup.observer;
    const before = await tableCounts(setup.observer);
    const manifestBefore = await manifestState(setup.observer);
    const error = await setup.run();
    expect(String(error)).toMatch("Stale Neon publication baseline");
    expect(await tableCounts(setup.observer)).toEqual(before);
    expect((await manifestState(setup.observer)).json).toBe(manifestBefore.json);
    await setup.observer.end();
  });

  it("is atomic on the server: a failure before the manifest leaves nothing behind for other sessions", async () => {
    const setup = await scenario({
      beforeQuery: (sql) => {
        if (sql.startsWith("UPDATE manifest")) throw new Error("injected failure before manifest");
      },
    });
    const before = await tableCounts(setup.observer);
    const manifestBefore = await manifestState(setup.observer);
    expect(String(await setup.run())).toMatch("injected failure before manifest");
    expect(await tableCounts(setup.observer)).toEqual(before);
    expect(await manifestState(setup.observer)).toEqual(manifestBefore);
    await setup.observer.end();
  });
});
