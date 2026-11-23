// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { BlockSummary } from "../../shared/data-types";
import { PUBLICATION_MARKER_KEY } from "../../shared/publication-state";
import { D1Client } from "../../scripts/lib/sync/d1";
import type { GeneratedArtifacts } from "../../scripts/lib/pipeline";
import {
  assertNoUnfinishedPublication,
  markPublicationInProgress,
  readPublishedArtifacts,
  writeArtifactsToD1,
  writeIncrementalArtifactsToLocalD1,
} from "../../scripts/lib/sync/store";

/**
 * The incremental planner and the D1 publication marker (#416) must agree: the tables of an unfinished
 * publication may be half replaced, so they are never the baseline of an incremental plan. These tests drive
 * the real publishers against a SQLite copy of the production schema through D1Client's REST protocol.
 */
const MIGRATIONS = path.resolve(__dirname, "../../migrations");
const config = {
  accountId: "fixture",
  databaseId: "fixture",
  apiToken: "fixture",
  // A loopback endpoint, so the incremental publisher is allowed to run.
  endpoint: "http://localhost",
};
const geoJson = { type: "FeatureCollection" as const, features: [] };

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  return db;
}

/** D1's REST `/query` endpoint over SQLite: one statement, or an atomic `{ batch }`, with exact row metadata. */
function d1Rest(sqlite: DatabaseSync) {
  const run = (statement: { sql: string; params?: unknown[] }) => {
    const prepared = sqlite.prepare(statement.sql);
    const params = (statement.params ?? []) as SQLInputValue[];
    if (/^\s*(?:select|with)\b|\breturning\b/i.test(statement.sql)) {
      const results = prepared.all(...params);
      return {
        success: true,
        results,
        meta: { rows_read: results.length, rows_written: 0, changes: 0, duration: 0 },
      };
    }
    const changes = Number(prepared.run(...params).changes);
    return { success: true, meta: { rows_read: 0, rows_written: changes, changes, duration: 0 } };
  };
  return async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as
      | { sql: string; params?: unknown[] }
      | { batch: { sql: string; params?: unknown[] }[] };
    const statements = "batch" in body ? body.batch : [body];
    try {
      sqlite.exec("BEGIN");
      const result = statements.map(run);
      sqlite.exec("COMMIT");
      return Response.json({ success: true, errors: [], result });
    } catch (error) {
      sqlite.exec("ROLLBACK");
      const message = error instanceof Error ? error.message : "database error";
      return Response.json({ success: false, errors: [{ message }], result: [] }, { status: 400 });
    }
  };
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
const generation = (keys: string[], generatedAt: string) =>
  ({
    manifest: {
      schemaVersion: "2.0.0",
      generatedAt,
      dataWindow: { minMonth: "2020-01", maxMonth: "2026-08" },
      sources: { lastUpdatedAt: "2026-10-04T00:00:00+08:00" },
      filterOptions: { towns: ["BEDOK"], flatTypes: ["4 ROOM"], flatModels: ["Improved"] },
      counts: { blocks: keys.length, transactions: 0, towns: 1, mrtStations: 0 },
    },
    blockSummaries: keys.map(block),
    blocksByTown: {},
    details: Object.fromEntries(keys.map((key) => [key, { addressKey: key }])),
    townFlatTypeTrend: [],
  }) as unknown as GeneratedArtifacts;
const noDelta = {
  inserts: [],
  updates: [],
  affectedBlocks: new Set<string>(),
  affectedTownTypes: new Set<string>(),
};
const storedManifest = (sqlite: DatabaseSync) =>
  (sqlite.prepare("SELECT json FROM manifest WHERE id = 1").get() as { json: string }).json;
const blockKeys = (sqlite: DatabaseSync) =>
  (
    sqlite.prepare("SELECT address_key FROM blocks ORDER BY address_key").all() as {
      address_key: string;
    }[]
  ).map((row) => row.address_key);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("assertNoUnfinishedPublication", () => {
  it("accepts a finished publication and refuses a marked or unreadable manifest", () => {
    assertNoUnfinishedPublication(JSON.stringify({ schemaVersion: "2.0.0" }));
    const marked = JSON.stringify({
      schemaVersion: "2.0.0",
      [PUBLICATION_MARKER_KEY]: {
        baseVersion: null,
        startedAt: "2026-10-04T01:00:00.000Z",
        owner: "owner-a",
      },
    });
    expect(() => assertNoUnfinishedPublication(marked)).toThrow(
      "unfinished publication marker (started 2026-10-04T01:00:00.000Z)",
    );
    expect(() => assertNoUnfinishedPublication("not json")).toThrow("not a JSON object");
    expect(() => assertNoUnfinishedPublication("[1]")).toThrow("not a JSON object");
  });
});

describe("planning on top of a D1 publication", () => {
  it("never reads or writes half-replaced tables, and a completed full publication clears the way", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sqlite = freshDatabase();
    const fetchMock = vi.fn(d1Rest(sqlite));
    vi.stubGlobal("fetch", fetchMock);
    const client = () => new D1Client(config);

    await writeArtifactsToD1(client(), generation(["a1", "a2"], "g1"), geoJson, geoJson, "g1");
    expect(JSON.parse(storedManifest(sqlite))).not.toHaveProperty(PUBLICATION_MARKER_KEY);

    // A second publication starts and dies right after it stamped its marker.
    await markPublicationInProgress(client(), "2026-10-04T01:00:00.000Z");
    const marked = storedManifest(sqlite);
    expect(JSON.parse(marked)).toHaveProperty(PUBLICATION_MARKER_KEY);

    // The planner is refused before it reads any table.
    const requests = fetchMock.mock.calls.length;
    await expect(readPublishedArtifacts(client(), marked)).rejects.toThrow(
      "unfinished publication marker",
    );
    expect(fetchMock).toHaveBeenCalledTimes(requests);

    // So is the atomic incremental publisher, which leaves the tables and the marker exactly as they were.
    await expect(
      writeIncrementalArtifactsToLocalD1(
        client(),
        generation(["a1", "a2"], "g2"),
        geoJson,
        geoJson,
        "g2",
        { delta: noDelta, manifestJson: marked },
      ),
    ).rejects.toThrow("unfinished publication marker");
    expect(storedManifest(sqlite)).toBe(marked);
    expect(blockKeys(sqlite)).toEqual(["a1", "a2"]);

    // The documented recovery: a full publication runs to completion and removes the marker.
    await writeArtifactsToD1(client(), generation(["b1", "b2"], "g3"), geoJson, geoJson, "g3");
    expect(JSON.parse(storedManifest(sqlite))).not.toHaveProperty(PUBLICATION_MARKER_KEY);
    const published = await readPublishedArtifacts(client(), storedManifest(sqlite));
    expect(published?.manifest.generatedAt).toBe("g3");
    expect(published?.blockSummaries.map((entry) => entry.addressKey).sort()).toEqual(["b1", "b2"]);
  });
});
