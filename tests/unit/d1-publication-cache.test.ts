// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vite-plus/test";
import type { BlockSummary } from "../../shared/data-types";
import { PUBLICATION_MARKER_KEY, manifestVersion } from "../../shared/publication-state";
import { D1Client } from "../../scripts/lib/sync/d1";
import type { GeneratedArtifacts } from "../../scripts/lib/pipeline";
import {
  PublicationSupersededError,
  markPublicationInProgress,
  readManifestUpdatedAt,
  writeArtifactsToD1,
} from "../../scripts/lib/sync/store";
import { withPublicDataCache } from "../../worker/public-data-cache";
import { createD1PublicData } from "../../worker/public-data-d1";

/**
 * The race behind the #412 review finding: `writeArtifactsToD1()` replaces the generated tables through many
 * separate D1 requests and writes the manifest LAST, so for most of a publication the old manifest is still
 * visible over tables that are already (partly) new. A cache that trusts "same manifest before and after the
 * handler" would label that data with the old version.
 *
 * This drives the REAL publisher against a SQLite copy of the production schema (the real migrations) through
 * D1Client's REST protocol, and fires Worker requests through the REAL cache between its requests.
 */
const MIGRATIONS = path.resolve(__dirname, "../../migrations");
const GEN1 = ["a1", "a2"];
// Several insert chunks, so a request can land while `blocks` is only partly replaced.
const GEN2 = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9"];

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  return db;
}

const block = (addressKey: string): BlockSummary => ({
  addressKey,
  town: "BEDOK",
  block: "1",
  streetName: "TEST ST",
  displayName: null,
  coordinates: { lat: 1.3, lng: 103.8 },
  medianPrice: 500_000,
  pricePerSqmMedian: 5_000,
  transactionCount: 3,
  floorAreaRange: [80, 100],
  leaseCommenceRange: [1990, 1990],
  latestMonth: "2026-08",
  availableDateRange: ["2020-01", "2026-08"],
  flatTypes: ["4 ROOM"],
  flatModels: ["Improved"],
  nearestMrt: null,
  postalCode: null,
});
const transaction = (index: number) => ({
  month: "2026-01",
  town: "BEDOK",
  block: "1",
  street_name: "TEST ST",
  address_key: "bedok-1-test-st",
  flat_type: "4 ROOM",
  storey_range: "01 TO 03",
  floor_area_sqm: 90,
  lease_commence_year: 1990,
  resale_price: 500_000 + index,
  flat_model: "Improved",
});
const generation = (
  keys: string[],
  generatedAt: string,
  lastUpdatedAt: string,
  transactions?: number,
) =>
  ({
    manifest: {
      schemaVersion: "2.0.0",
      generatedAt,
      dataWindow: { minMonth: "2020-01", maxMonth: "2026-08" },
      sources: { lastUpdatedAt },
      filterOptions: { towns: ["BEDOK"], flatTypes: ["4 ROOM"], flatModels: ["Improved"] },
      counts: { blocks: keys.length, transactions: 0, towns: 1, mrtStations: 0 },
    },
    blockSummaries: keys.map(block),
    blocksByTown: {},
    details: Object.fromEntries(keys.map((key) => [key, { addressKey: key }])),
    townFlatTypeTrend: [],
    ...(transactions
      ? { transactions: Array.from({ length: transactions }, (_, i) => transaction(i)) }
      : {}),
  }) as unknown as GeneratedArtifacts;
const geoJson = { type: "FeatureCollection" as const, features: [] };

type Hook = (statements: string[]) => Promise<void> | void;
type RestState = {
  requests: string[][];
  /** Runs just before a request executes, to interleave Worker requests with the publisher. */
  beforeRequest?: Hook;
  /** Answer 400 without executing: a publisher that dies part way. */
  failRequest?: (statements: string[]) => boolean;
  /** Answer success without executing: a publisher that never sends that statement. */
  skipRequest?: (statements: string[]) => boolean;
  /** Answer with these rows without executing: a database that behaves as the test dictates. */
  answerRequest?: (statements: string[]) => unknown[] | undefined;
  /** Rewrites each statement's SQL before it executes: a publisher whose writes were not conditional. */
  rewriteSql?: (sql: string) => string;
  /** Sees every request with its bound parameters, before it is answered. */
  onStatements?: (statements: { sql: string; params?: unknown[] }[]) => void;
  /** An error thrown by `beforeRequest`. Recorded for the test, never put in a response body. */
  hookError?: unknown;
  /** An unexpected error while executing SQL. Recorded for the test, never put in a response body. */
  sqlError?: unknown;
};

/** The statement that stamps the publication marker, and the one that ends a publication. */
const MARKER_WRITE = "UPDATE manifest SET json = ? WHERE id = 1";
const isFinalManifestWrite = (sql: string | undefined) =>
  (sql ?? "").startsWith("UPDATE manifest SET json = ?, updated_at = ?") ||
  (sql ?? "").startsWith("INSERT OR REPLACE INTO manifest");

/** The condition the publisher puts on every write of a marked publication (see `ownerGuard`). */
const OWNER_GUARD = (owner: string) =>
  `(SELECT json_extract(manifest.json, '$.publicationInProgress.owner') FROM manifest WHERE manifest.id = 1) = '${owner}'`;

/** What every simulated database failure answers with: fixed text, never anything from a caught exception. */
const SIMULATED_DATABASE_ERROR = "D1_ERROR: simulated database error";

const bodyText = (init?: RequestInit) => (typeof init?.body === "string" ? init.body : "");

/** D1's REST `/query` endpoint over SQLite: one statement, or an atomic `{ batch }`. */
function d1Rest(db: DatabaseSync, state: RestState) {
  const run = (statement: { sql: string; params?: unknown[] }) => {
    const prepared = db.prepare(statement.sql);
    const params = (statement.params ?? []) as SQLInputValue[];
    if (/^\s*select\b|\breturning\b/i.test(statement.sql))
      return { success: true, results: prepared.all(...params) };
    return { success: true, meta: { changes: Number(prepared.run(...params).changes) } };
  };
  const reply = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  const failure = () =>
    reply(400, { success: false, errors: [{ message: SIMULATED_DATABASE_ERROR }], result: [] });
  return async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(bodyText(init)) as
      | { sql: string; params?: unknown[] }
      | { batch: { sql: string; params?: unknown[] }[] };
    const statements = "batch" in body ? body.batch : [body];
    const sqls = statements.map((statement) => statement.sql);
    state.requests.push(sqls);
    state.onStatements?.(statements);
    try {
      await state.beforeRequest?.(sqls);
    } catch (error) {
      state.hookError ??= error;
      return failure();
    }
    if (state.failRequest?.(sqls)) return failure();
    const answer = state.answerRequest?.(sqls);
    if (answer)
      return reply(200, {
        success: true,
        errors: [],
        result: sqls.map((_, index) =>
          index === sqls.length - 1 ? { success: true, results: answer } : { success: true },
        ),
      });
    if (state.skipRequest?.(sqls))
      return reply(200, { success: true, errors: [], result: sqls.map(() => ({ success: true })) });
    try {
      db.exec("BEGIN");
      const executable = state.rewriteSql
        ? statements.map((statement) => ({ ...statement, sql: state.rewriteSql!(statement.sql) }))
        : statements;
      const result = executable.map(run);
      db.exec("COMMIT");
      return reply(200, { success: true, errors: [], result });
    } catch (error) {
      db.exec("ROLLBACK");
      state.sqlError ??= error;
      return failure();
    }
  };
}

describe("D1 publication vs the public data cache", () => {
  let sqlite: DatabaseSync;
  let d1: D1Client;
  const state: RestState = { requests: [] };
  const storage = new Map<string, Response>();
  /** Every URL the cache was asked to store, in order. */
  const puts: string[] = [];
  const cache = {
    match: async (request: Request) => storage.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      puts.push(request.url);
      storage.set(request.url, response.clone());
    },
  };
  const POINTER = "https://example.com/__public-data-cache/v1/pointer";

  const publish = (
    keys: string[],
    generatedAt: string,
    lastUpdatedAt: string,
    transactions?: number,
  ) =>
    writeArtifactsToD1(
      d1,
      generation(keys, generatedAt, lastUpdatedAt, transactions),
      geoJson,
      geoJson,
      generatedAt,
    );
  const transactionCount = () =>
    (sqlite.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
  const tableKeys = (table: "blocks" | "block_details") =>
    (
      sqlite.prepare(`SELECT address_key FROM ${table} ORDER BY address_key`).all() as {
        address_key: string;
      }[]
    ).map((row) => row.address_key);
  const storedManifest = () =>
    JSON.parse(
      (sqlite.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }).json,
    );

  /** A public API request through the real cache; the handler reads the generated table like the real ones. */
  async function get(town: string) {
    const response = await withPublicDataCache(
      new Request(`https://example.com/api/blocks/${town}`),
      createD1PublicData({
        prepare: (sql: string) => ({
          first: async () => (sqlite.prepare(sql).get() as { json: string } | undefined) ?? null,
        }),
      } as unknown as D1Database),
      cache,
      async () =>
        new Response(
          JSON.stringify(
            (
              sqlite.prepare("SELECT address_key FROM blocks ORDER BY address_key").all() as {
                address_key: string;
              }[]
            ).map((row) => row.address_key),
          ),
          { headers: { "cache-control": "public, max-age=60" } },
        ),
    );
    return {
      status: response.headers.get("x-data-cache"),
      keys: (await response.json()) as string[],
    };
  }
  const expireVersionPointer = () => storage.delete(POINTER);
  const sorted = (keys: string[]) => [...keys].sort();
  /** Every cached data entry, decoded. */
  const cachedBodies = async () =>
    Promise.all(
      [...storage.entries()]
        .filter(([url]) => !url.endsWith("/pointer"))
        .map(async ([url, response]) => ({
          url,
          keys: (await response.clone().json()) as string[],
        })),
    );
  const isOneWholeGeneration = (keys: string[]) =>
    [GEN1, GEN2].some(
      (generation) => JSON.stringify(sorted(keys)) === JSON.stringify(sorted(generation)),
    );

  let issued = 0;
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Owners are issued in order: the first run a test starts is owner-1, the next owner-2, and so on. (The
    // initial publication below is a run too; the counter restarts after it.)
    issued = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => `owner-${++issued}` as never);
    sqlite = freshDatabase();
    state.requests = [];
    state.beforeRequest = undefined;
    state.failRequest = undefined;
    state.skipRequest = undefined;
    state.answerRequest = undefined;
    state.onStatements = undefined;
    state.rewriteSql = undefined;
    state.hookError = undefined;
    state.sqlError = undefined;
    storage.clear();
    puts.length = 0;
    d1 = new D1Client({
      accountId: "acct",
      databaseId: "db",
      apiToken: "token",
      endpoint: "https://d1.test",
    });
    vi.stubGlobal("fetch", vi.fn(d1Rest(sqlite, state)));
    await publish(GEN1, "2026-08-29T01:00:00.000Z", "2026-08-29T00:00:00+08:00");
    state.requests = [];
    issued = 0;
  });
  afterEach(() => {
    const { hookError, sqlError } = state;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sqlite.close();
    // The fake answers failures with fixed text, so a real error must still fail the test, with its detail
    // shown here (test output) instead of in any response.
    expect(hookError).toBeUndefined();
    expect(sqlError).toBeUndefined();
  });

  it("starts from a clean, cacheable generation 1", async () => {
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN1 });
    expect(await get("BEDOK")).toEqual({ status: "HIT", keys: GEN1 });
  });

  it("stores nothing while the tables change under the old manifest, and keeps serving the cached previous generation", async () => {
    // Generation 1 is cached for one URL.
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN1 });
    puts.length = 0;
    const observed: Record<string, { status: string | null; keys: string[] }> = {};
    const markerSeenAtEachStop: boolean[] = [];
    let partialBlocks: string[] = [];
    let insertChunks = 0;

    state.beforeRequest = async (statements) => {
      const first = statements[0] ?? "";
      if (first.startsWith("INSERT INTO blocks") && ++insertChunks === 1) {
        // `blocks` is only partly replaced and the old manifest is the only thing a reader sees.
        partialBlocks = tableKeys("blocks");
        expireVersionPointer();
        observed.partialBlocksCached = await get("BEDOK");
        observed.partialBlocksUncached = await get("YISHUN");
        markerSeenAtEachStop.push(PUBLICATION_MARKER_KEY in storedManifest());
      }
      if (first.startsWith("DELETE FROM block_details")) {
        // `blocks` is now entirely generation 2 while the manifest still describes generation 1.
        expireVersionPointer();
        observed.newBlocksCached = await get("BEDOK");
        observed.newBlocksUncached = await get("CLEMENTI");
        markerSeenAtEachStop.push(PUBLICATION_MARKER_KEY in storedManifest());
      }
      if (isFinalManifestWrite(first)) {
        // Every table is replaced; only the manifest write is left. This is the exact window of the finding.
        expireVersionPointer();
        observed.lastMomentCached = await get("BEDOK");
        observed.lastMomentUncached = await get("TAMPINES");
        markerSeenAtEachStop.push(PUBLICATION_MARKER_KEY in storedManifest());
      }
    };
    await publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00");

    // The old manifest was visible, marked as unfinished, at all three stops.
    expect(markerSeenAtEachStop).toEqual([true, true, true]);
    // The previous generation stays reachable and consistent for the whole window...
    for (const name of ["partialBlocksCached", "newBlocksCached", "lastMomentCached"])
      expect(observed[name]).toEqual({ status: "HIT-STALE", keys: GEN1 });
    // ...URLs that were never cached are computed from whatever the tables hold now, but are not stored...
    expect(partialBlocks.length).toBeGreaterThan(0);
    expect(partialBlocks.length).toBeLessThan(GEN2.length);
    expect(observed.partialBlocksUncached).toEqual({ status: "BYPASS", keys: partialBlocks });
    expect(observed.newBlocksUncached).toEqual({ status: "BYPASS", keys: sorted(GEN2) });
    expect(observed.lastMomentUncached).toEqual({ status: "BYPASS", keys: sorted(GEN2) });
    // ...and nothing at all was written to the cache during the publication.
    expect(puts).toEqual([]);

    // The final manifest write ended the window: the marker is gone and the new generation caches normally.
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    expireVersionPointer();
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN2 });
    expect(await get("BEDOK")).toEqual({ status: "HIT", keys: GEN2 });

    // No cached entry, under any version, is a mix of the two generations.
    const bodies = await cachedBodies();
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) expect(isOneWholeGeneration(body.keys), body.url).toBe(true);
  });

  it("control: without the marker the same publication caches a half-replaced response under the old version", async () => {
    // A publisher from before this fix: it never stamps a marker, never checks ownership, and none of its
    // writes is conditional. (Here: the marker write and the final write are dropped, the ownership checks and
    // the read-back of the final write are answered as if they succeeded, and the ownership condition is
    // stripped from every write.) Everything else in the publication is the real code.
    state.rewriteSql = (sql) => sql.replace(` WHERE ${OWNER_GUARD("owner-1")}`, "");
    let finalManifest: string | undefined;
    state.onStatements = (statements) => {
      const first = statements[0];
      if (first && isFinalManifestWrite(first.sql)) finalManifest = first.params?.[0] as string;
    };
    state.skipRequest = (statements) =>
      statements[0] === MARKER_WRITE || isFinalManifestWrite(statements[0]);
    state.answerRequest = (statements) => {
      const first = statements[0] ?? "";
      if (first.startsWith("SELECT json_extract")) return [{ owner: "owner-1" }];
      if (first === "SELECT json FROM manifest WHERE id = 1" && finalManifest !== undefined)
        return [{ json: finalManifest }];
      return undefined;
    };
    let insertChunks = 0;
    state.beforeRequest = async (statements) => {
      if ((statements[0] ?? "").startsWith("INSERT INTO blocks") && ++insertChunks === 1)
        await get("YISHUN"); // `blocks` is only partly replaced, old manifest visible
    };
    await publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00");

    expect((await cachedBodies()).some((body) => !isOneWholeGeneration(body.keys))).toBe(true);
  });

  it("keeps the marker, and keeps caching off, when a publication aborts part way", async () => {
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN1 });
    state.failRequest = (statements) =>
      (statements[0] ?? "").startsWith("DELETE FROM block_details");
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00"),
    ).rejects.toThrow(SIMULATED_DATABASE_ERROR);

    // The tables are half replaced under generation 1's manifest, and the marker says so.
    expect(tableKeys("blocks")).toEqual(sorted(GEN2));
    expect(tableKeys("block_details")).toEqual(sorted(GEN1));
    const stored = storedManifest();
    expect(stored[PUBLICATION_MARKER_KEY]).toMatchObject({ startedAt: "2026-10-04T01:00:00.000Z" });
    expect(stored.generatedAt).toBe("2026-08-29T01:00:00.000Z");
    // The operator is told, in the publisher's output, what state it left behind.
    expect(String(consoleError.mock.calls[0]?.[0])).toContain(
      "Publication aborted after the marker",
    );
    expireVersionPointer();
    puts.length = 0;
    expect(await get("BEDOK")).toEqual({ status: "HIT-STALE", keys: GEN1 });
    expect((await get("YISHUN")).status).toBe("BYPASS");
    expect(puts).toEqual([]);
    // An unfinished publication does not count as "already synced", even for an unchanged upstream timestamp,
    // and says why.
    expect(await readManifestUpdatedAt(d1)).toBeNull();
    expect(String(consoleWarn.mock.calls.at(-1)?.[0])).toContain("unfinished publication marker");

    // Re-running to completion removes the marker and caching resumes.
    state.failRequest = undefined;
    await publish(GEN2, "2026-10-04T02:00:00.000Z", "2026-10-04T00:00:00+08:00");
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    expect(await readManifestUpdatedAt(d1)).toBe("2026-10-04T00:00:00+08:00");
    expireVersionPointer();
    expect(await get("YISHUN")).toEqual({ status: "MISS", keys: GEN2 });
  });

  it("keeps the marker when only the final manifest write fails, with every table already replaced", async () => {
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN1 });
    state.failRequest = (statements) => isFinalManifestWrite(statements[0]);
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00"),
    ).rejects.toThrow(SIMULATED_DATABASE_ERROR);

    // The worst moment to stop: all tables are generation 2, the manifest still describes generation 1.
    expect(tableKeys("blocks")).toEqual(sorted(GEN2));
    expect(tableKeys("block_details")).toEqual(sorted(GEN2));
    expect(storedManifest().generatedAt).toBe("2026-08-29T01:00:00.000Z");
    expect(storedManifest()).toHaveProperty(PUBLICATION_MARKER_KEY);
    expireVersionPointer();
    puts.length = 0;
    expect(await get("BEDOK")).toEqual({ status: "HIT-STALE", keys: GEN1 });
    const uncached = await withPublicDataCache(
      new Request("https://example.com/api/blocks/YISHUN"),
      createD1PublicData({
        prepare: (sql: string) => ({
          first: async () => (sqlite.prepare(sql).get() as { json: string }) ?? null,
        }),
      } as unknown as D1Database),
      cache,
      async () => new Response("[]", { headers: { "cache-control": "public, max-age=60" } }),
    );
    expect(uncached.headers.get("x-data-cache")).toBe("BYPASS");
    expect(uncached.headers.get("cache-control")).toBe("no-store");
    expect(puts).toEqual([]);
  });

  it("refuses to touch any table when the marker write did not take", async () => {
    // The UPDATE is answered with success but never applied (the row changed or vanished underneath it).
    state.skipRequest = (statements) => statements[0] === MARKER_WRITE;
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00"),
    ).rejects.toThrow(/could not be confirmed/);
    expect(tableKeys("blocks")).toEqual(sorted(GEN1));
    expect(state.requests.some((sqls) => /^(DELETE|INSERT)\b/.test(sqls[0] ?? ""))).toBe(false);
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
  });

  it("stops a run that another run superseded at the next phase boundary, leaving the marker to its owner", async () => {
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN1 });
    let takenOver = false;
    state.beforeRequest = async (statements) => {
      if (!takenOver && (statements[0] ?? "").startsWith("DELETE FROM block_details")) {
        takenOver = true;
        await markPublicationInProgress(d1, "2026-10-04T01:30:00.000Z"); // a second run stamps its own marker
      }
    };
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00"),
    ).rejects.toThrow(PublicationSupersededError);

    // It stopped at the phase boundary: the phase after the takeover never started.
    expect(
      state.requests.some((sqls) => (sqls[0] ?? "").startsWith("DELETE FROM comparisons")),
    ).toBe(false);
    // The superseded run neither wrote the manifest nor touched the marker the second run owns...
    const marker = storedManifest()[PUBLICATION_MARKER_KEY] as { owner: string; startedAt: string };
    expect(marker).toMatchObject({ owner: "owner-2", startedAt: "2026-10-04T01:30:00.000Z" });
    expect(storedManifest().generatedAt).toBe("2026-08-29T01:00:00.000Z");
    // ...and did not announce a generic abort: the error already says whose marker it is.
    expect(consoleError).not.toHaveBeenCalled();
    // The cache stays off for as long as the owner has not finished.
    expireVersionPointer();
    puts.length = 0;
    expect(await get("BEDOK")).toEqual({ status: "HIT-STALE", keys: GEN1 });
    expect((await get("YISHUN")).status).toBe("BYPASS");
    expect(puts).toEqual([]);

    // The owner (any later run) finishes and clears it.
    state.beforeRequest = undefined;
    await publish(GEN2, "2026-10-04T02:00:00.000Z", "2026-10-04T00:00:00+08:00");
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    expireVersionPointer();
    expect(await get("YISHUN")).toEqual({ status: "MISS", keys: GEN2 });
  });

  it("never lets a superseded run declare the publication complete, even at its final write", async () => {
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN1 });
    let takenOver = false;
    state.beforeRequest = async (statements) => {
      if (!takenOver && isFinalManifestWrite(statements[0])) {
        takenOver = true;
        await markPublicationInProgress(d1, "2026-10-04T01:30:00.000Z");
      }
    };
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00"),
    ).rejects.toThrow(/The new manifest was not written/);

    // Every table is already generation 2, yet the old manifest and the second run's marker are untouched,
    // so nothing may be cached under either.
    expect(tableKeys("blocks")).toEqual(sorted(GEN2));
    expect(storedManifest().generatedAt).toBe("2026-08-29T01:00:00.000Z");
    expect(storedManifest()[PUBLICATION_MARKER_KEY]).toMatchObject({ owner: "owner-2" });
    expireVersionPointer();
    puts.length = 0;
    expect((await get("YISHUN")).status).toBe("BYPASS");
    expect(puts).toEqual([]);
  });

  it("notices a superseded run in the middle of the long transactions phase, not only at its end", async () => {
    const rows = 30_000;
    let transactionRequests = 0;
    state.beforeRequest = async (statements) => {
      const first = statements[0] ?? "";
      if (
        first.startsWith("DELETE FROM transactions") ||
        first.startsWith("INSERT INTO transactions")
      ) {
        transactionRequests += 1;
        if (transactionRequests === 2)
          await markPublicationInProgress(d1, "2026-10-04T01:30:00.000Z");
      }
    };
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00", rows),
    ).rejects.toThrow(PublicationSupersededError);
    // Each request carries up to 900 rows, so a full run needs 34 of them; the run stopped well before that.
    expect(transactionRequests).toBeGreaterThan(2);
    expect(transactionRequests).toBeLessThan(Math.ceil(rows / 900));
    // Only the first request (before the takeover) wrote anything. The ~20 requests the run still sent before
    // its checkpoint were conditional on an ownership it no longer had, so they changed nothing.
    expect(transactionCount()).toBe(900);
    expect(storedManifest()[PUBLICATION_MARKER_KEY]).toMatchObject({ owner: "owner-2" });
  });

  it("changes nothing when a run that was paused resumes after another run took over and finished", async () => {
    const GEN3 = ["c1", "c2", "c3", "c4", "c5"];
    let paused = false;
    state.beforeRequest = async (statements) => {
      // Run A goes to sleep just before its second chunk of `blocks`. Run B starts, replaces every table and
      // finishes (clearing the marker); then A wakes up and carries on as if nothing had happened.
      if (!paused && (statements[0] ?? "").startsWith("INSERT INTO blocks")) {
        paused = true;
        await publish(GEN3, "2026-10-05T01:00:00.000Z", "2026-10-05T00:00:00+08:00", 50);
      }
    };
    await expect(
      publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00", 50),
    ).rejects.toThrow(PublicationSupersededError);

    // A's remaining writes were all conditional on a marker it no longer owns, so the tables are exactly B's...
    expect(tableKeys("blocks")).toEqual(sorted(GEN3));
    expect(tableKeys("block_details")).toEqual(sorted(GEN3));
    expect(transactionCount()).toBe(50);
    // ...and B's manifest, with no marker, is what the cache sees: a complete generation, nothing mixed in.
    expect(storedManifest().generatedAt).toBe("2026-10-05T01:00:00.000Z");
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    expireVersionPointer();
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN3 });
  });

  it("publishes over a stored manifest that is not a JSON object, instead of dead-ending", async () => {
    sqlite.prepare("UPDATE manifest SET json = 'not json' WHERE id = 1").run();
    expect(await readManifestUpdatedAt(d1)).toBeNull();
    let during: { status: string | null; keys: string[] } | undefined;
    let markerDuring: unknown;
    state.beforeRequest = async (statements) => {
      if ((statements[0] ?? "").startsWith("DELETE FROM block_details")) {
        markerDuring = storedManifest()[PUBLICATION_MARKER_KEY];
        during = await get("BEDOK");
      }
    };
    await publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00");

    // The run said so and replaced the unreadable row with a placeholder that carries its marker, so it owned
    // the publication (and the cache bypass) like any other run; the final write then replaced the placeholder.
    expect(consoleWarn.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "replacing it with a placeholder",
    );
    expect(markerDuring).toMatchObject({ owner: "owner-1", baseVersion: null });
    expect(during?.status).toBe("BYPASS");
    expect(storedManifest().generatedAt).toBe("2026-10-04T01:00:00.000Z");
    expect(storedManifest()).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    expireVersionPointer();
    expect(await get("BEDOK")).toEqual({ status: "MISS", keys: GEN2 });
  });

  it("keeps exception detail out of the fake database's responses", async () => {
    state.beforeRequest = () => {
      throw new Error("detail that must stay local");
    };
    const failure = await publish(
      GEN2,
      "2026-10-04T01:00:00.000Z",
      "2026-10-04T00:00:00+08:00",
    ).then(
      () => undefined,
      (error: unknown) => String(error),
    );
    // The client sees only the fixed synthetic message...
    expect(failure).toContain(SIMULATED_DATABASE_ERROR);
    expect(failure).not.toContain("detail that must stay local");
    // ...while the real error is kept for the test. Clear it: this failure is the point of this test.
    expect((state.hookError as Error).message).toBe("detail that must stay local");
    state.hookError = undefined;
  });

  it("hands the marker to the run that stamps last, keeping the last COMPLETE generation as its base", async () => {
    const complete = (
      sqlite.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }
    ).json;
    expect(await markPublicationInProgress(d1, "2026-10-04T01:00:00.000Z")).toBe("owner-1");
    const first = storedManifest()[PUBLICATION_MARKER_KEY] as {
      baseVersion: string;
      owner: string;
    };
    expect(await markPublicationInProgress(d1, "2026-10-04T02:00:00.000Z")).toBe("owner-2");
    const second = storedManifest()[PUBLICATION_MARKER_KEY] as {
      baseVersion: string;
      startedAt: string;
      owner: string;
    };
    expect(first.owner).toBe("owner-1");
    expect(second.owner).toBe("owner-2");
    expect(second.baseVersion).toBe(first.baseVersion);
    expect(second.startedAt).toBe("2026-10-04T02:00:00.000Z");
    expect(first.baseVersion).toBe(await manifestVersion(complete));
  });

  it("writes the marker before the first table, and ends with a conditional write that is read back", async () => {
    state.requests = [];
    await publish(GEN2, "2026-10-04T01:00:00.000Z", "2026-10-04T00:00:00+08:00");
    const firstTableWrite = state.requests.findIndex((sqls) =>
      /^(DELETE|INSERT)\b/.test(sqls[0] ?? ""),
    );
    const markerWrite = state.requests.findIndex((sqls) => sqls[0] === MARKER_WRITE);
    expect(markerWrite).toBeGreaterThanOrEqual(0);
    expect(markerWrite).toBeLessThan(firstTableWrite);
    // The manifest write that ends a marked publication is conditional on still owning the marker, and is
    // read back to learn whether it applied.
    expect(state.requests.at(-2)?.[0]).toMatch(/^UPDATE manifest SET json = \?, updated_at = \?/);
    expect(state.requests.at(-2)?.[0]).toContain("json_extract(json, ?) = ?");
    expect(state.requests.at(-1)?.[0]).toBe("SELECT json FROM manifest WHERE id = 1");
  });

  it("owns the first publication too, through a placeholder manifest that carries the marker", async () => {
    const empty = freshDatabase();
    const emptyState: RestState = { requests: [] };
    let placeholderDuring: Record<string, unknown> | undefined;
    let statusDuring: string | null | undefined;
    emptyState.beforeRequest = async (statements) => {
      if ((statements[0] ?? "").startsWith("DELETE FROM block_details")) {
        placeholderDuring = JSON.parse(
          (empty.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }).json,
        );
        // A reader meanwhile gets the tables uncached, labelled, and never stored.
        const response = await withPublicDataCache(
          new Request("https://example.com/api/blocks/BEDOK"),
          createD1PublicData({
            prepare: (sql: string) => ({
              first: async () => (empty.prepare(sql).get() as { json: string } | undefined) ?? null,
            }),
          } as unknown as D1Database),
          cache,
          async () => new Response("[]", { headers: { "cache-control": "public, max-age=60" } }),
        );
        statusDuring = response.headers.get("x-data-cache");
      }
    };
    vi.stubGlobal("fetch", vi.fn(d1Rest(empty, emptyState)));
    puts.length = 0;
    await writeArtifactsToD1(
      d1,
      generation(GEN1, "2026-08-29T01:00:00.000Z", "2026-08-29T00:00:00+08:00"),
      geoJson,
      geoJson,
      "2026-08-29T01:00:00.000Z",
    );

    // The placeholder was written (as a plain INSERT) before any table, held only the marker, and the whole
    // publication then ended like any other: a conditional write, read back, replacing the placeholder.
    const firstTableWrite = emptyState.requests.findIndex((sqls) =>
      /^(DELETE|INSERT) (FROM|INTO) (?!manifest)/.test(sqls[0] ?? ""),
    );
    const placeholderWrite = emptyState.requests.findIndex((sqls) =>
      (sqls[0] ?? "").startsWith("INSERT INTO manifest"),
    );
    expect(placeholderWrite).toBeGreaterThanOrEqual(0);
    expect(placeholderWrite).toBeLessThan(firstTableWrite);
    expect(placeholderDuring).toEqual({
      [PUBLICATION_MARKER_KEY]: {
        baseVersion: null,
        startedAt: "2026-08-29T01:00:00.000Z",
        owner: "owner-1",
      },
    });
    expect(statusDuring).toBe("BYPASS");
    expect(puts).toEqual([]);
    expect(
      JSON.parse(
        (empty.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }).json,
      ),
    ).toMatchObject({ generatedAt: "2026-08-29T01:00:00.000Z" });
    expect(
      (empty.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }).json,
    ).not.toContain(PUBLICATION_MARKER_KEY);
    empty.close();
  });

  it("lets only one of two simultaneous first publications start, before it touches any table", async () => {
    const empty = freshDatabase();
    const emptyState: RestState = { requests: [] };
    vi.stubGlobal("fetch", vi.fn(d1Rest(empty, emptyState)));
    let rival = false;
    emptyState.beforeRequest = async (statements) => {
      // Run B starts, sees no manifest, and writes its placeholder just before run A writes its own.
      if (!rival && (statements[0] ?? "").startsWith("INSERT INTO manifest")) {
        rival = true;
        await markPublicationInProgress(d1, "2026-08-29T01:00:00.100Z");
      }
    };
    await expect(
      writeArtifactsToD1(
        d1,
        generation(GEN1, "2026-08-29T01:00:00.000Z", "2026-08-29T00:00:00+08:00"),
        geoJson,
        geoJson,
        "2026-08-29T01:00:00.000Z",
      ),
    ).rejects.toThrow(SIMULATED_DATABASE_ERROR);

    // Run A's plain INSERT lost the primary key and stopped before any table write; B holds the placeholder.
    expect(String(emptyState.sqlError)).toContain("UNIQUE constraint failed");
    emptyState.sqlError = undefined;
    expect(
      emptyState.requests.some((sqls) =>
        /^(DELETE|INSERT) (FROM|INTO) (?!manifest)/.test(sqls[0] ?? ""),
      ),
    ).toBe(false);
    expect(
      JSON.parse(
        (empty.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }).json,
      )[PUBLICATION_MARKER_KEY],
    ).toMatchObject({ owner: "owner-2" });
    empty.close();
  });
});
