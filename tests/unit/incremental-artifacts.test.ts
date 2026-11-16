import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { D1Client } from "../../scripts/lib/sync/d1";
import {
  planArtifactWrites,
  writeIncrementalArtifactsToLocalD1,
} from "../../scripts/lib/sync/store";
import { jsonDetailPatchStatements } from "../../scripts/lib/sync/statements";
import { planTransactionDelta } from "../../scripts/lib/sync/incremental";
import type { GeneratedArtifacts } from "../../scripts/lib/pipeline";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of readdirSync("migrations").sort())
    sqlite.exec(readFileSync(`migrations/${migration}`, "utf8"));
  let interrupt = false;
  const config = {
    accountId: "fixture",
    databaseId: "fixture",
    apiToken: "fixture",
    endpoint: "http://localhost",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        sql?: string;
        params?: unknown[];
        batch?: { sql: string; params?: unknown[] }[];
      };
      const statements = body.batch ?? [{ sql: body.sql!, params: body.params }];
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement, index) => {
          if (interrupt && body.batch && index === 2) throw new Error("injected interruption");
          const prepared = sqlite.prepare(statement.sql);
          const results = prepared.all(...((statement.params ?? []) as (string | number | null)[]));
          // Deliberately emulated metadata for adapter tests; not remote billing proof.
          return {
            success: true,
            results,
            meta: { rows_read: results.length, rows_written: 0, changes: 0, duration: 0 },
          };
        });
        sqlite.exec("COMMIT");
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }),
  );
  const blockSummaries = JSON.parse(
    readFileSync("tests/fixtures/public-data/block-summaries.json", "utf8"),
  );
  const manifest = JSON.parse(readFileSync("tests/fixtures/public-data/manifest.json", "utf8"));
  const artifacts: GeneratedArtifacts = {
    blockSummaries,
    manifest,
    details: {},
    blocksByTown: {},
    townFlatTypeTrend: [
      {
        town: "BEDOK",
        flatType: "4 ROOM",
        month: "2026-08",
        medianPrice: 500000,
        medianPricePerSqm: 5000,
        transactionCount: 1,
      },
    ],
  };
  const delta = {
    inserts: [],
    updates: [],
    affectedBlocks: new Set<string>(),
    affectedTownTypes: new Set<string>(),
  };
  const geo = { type: "FeatureCollection" as const, features: [] };
  return {
    sqlite,
    db: new D1Client(config),
    artifacts,
    delta,
    geo,
    interrupt: (value: boolean) => {
      interrupt = value;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("atomic local artifact rehearsal (emulated metadata)", () => {
  it("does not write unchanged entities; changes only one block and cohort", async () => {
    const { sqlite, db, artifacts, delta, geo } = setup();
    await writeIncrementalArtifactsToLocalD1(db, artifacts, geo, geo, "v1", {
      delta,
      manifestJson:
        (
          sqlite.prepare("SELECT json FROM manifest WHERE id=1").get() as
            | { json: string }
            | undefined
        )?.json ?? null,
    });
    const unchanged = sqlite
      .prepare("SELECT * FROM blocks WHERE address_key=?")
      .get(artifacts.blockSummaries[1].addressKey);
    expect(
      (
        await planArtifactWrites(
          new D1Client({
            accountId: "fixture",
            databaseId: "fixture",
            apiToken: "fixture",
            endpoint: "http://localhost",
          }),
          artifacts,
          geo,
          geo,
          "v2",
          delta,
        )
      ).statements,
    ).toEqual([]);
    artifacts.blockSummaries[0].medianPrice += 1;
    artifacts.townFlatTypeTrend[0].transactionCount += 1;
    const plan = await planArtifactWrites(
      new D1Client({
        accountId: "fixture",
        databaseId: "fixture",
        apiToken: "fixture",
        endpoint: "http://localhost",
      }),
      artifacts,
      geo,
      geo,
      "v2",
      delta,
    );
    expect(plan.changedRows).toMatchObject({
      blocks: 1,
      town_flat_type_trends: 1,
      block_details: 0,
      mrt_geojson: 0,
    });
    await writeIncrementalArtifactsToLocalD1(
      new D1Client({
        accountId: "fixture",
        databaseId: "fixture",
        apiToken: "fixture",
        endpoint: "http://localhost",
      }),
      artifacts,
      geo,
      geo,
      "v2",
      {
        delta,
        manifestJson: (
          sqlite.prepare("SELECT json FROM manifest WHERE id=1").get() as { json: string }
        ).json,
      },
    );
    expect(
      sqlite
        .prepare("SELECT * FROM blocks WHERE address_key=?")
        .get(artifacts.blockSummaries[1].addressKey),
    ).toEqual(unchanged);
    sqlite.close();
  });
  it("rolls back interruption, then retries without duplicate transaction IDs", async () => {
    const { sqlite, db, artifacts, delta, geo, interrupt } = setup();
    await writeIncrementalArtifactsToLocalD1(db, artifacts, geo, geo, "v1", {
      delta,
      manifestJson:
        (
          sqlite.prepare("SELECT json FROM manifest WHERE id=1").get() as
            | { json: string }
            | undefined
        )?.json ?? null,
    });
    const row = {
      id: 1,
      month: "2026-08",
      town: "BEDOK",
      block: "1",
      street_name: "TEST ST",
      address_key: "fixture",
      flat_type: "4 ROOM",
      storey_range: "01 TO 03",
      floor_area_sqm: 90,
      lease_commence_year: 1980,
      resale_price: 500000,
      flat_model: "MODEL",
    };
    const next = planTransactionDelta([], [row]);
    artifacts.blockSummaries[0].medianPrice++;
    interrupt(true);
    const newDb = () =>
      new D1Client({
        accountId: "fixture",
        databaseId: "fixture",
        apiToken: "fixture",
        endpoint: "http://localhost",
      });
    await expect(
      writeIncrementalArtifactsToLocalD1(newDb(), artifacts, geo, geo, "v2", {
        delta: next,
        manifestJson:
          (
            sqlite.prepare("SELECT json FROM manifest WHERE id=1").get() as
              | { json: string }
              | undefined
          )?.json ?? null,
      }),
    ).rejects.toThrow("interruption");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM transactions").get()).toMatchObject({ n: 0 });
    expect(sqlite.prepare("SELECT updated_at FROM manifest").get()).toMatchObject({
      updated_at: "v1",
    });
    interrupt(false);
    await writeIncrementalArtifactsToLocalD1(newDb(), artifacts, geo, geo, "v2", {
      delta: next,
      manifestJson:
        (
          sqlite.prepare("SELECT json FROM manifest WHERE id=1").get() as
            | { json: string }
            | undefined
        )?.json ?? null,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM transactions").get()).toMatchObject({ n: 1 });
    sqlite.close();
  });
  it("rejects a stale prepared manifest before artifact reads or writes", async () => {
    const { sqlite, db, artifacts, delta, geo } = setup();
    sqlite.prepare("INSERT INTO manifest VALUES(1,?,?)").run('{"newer":true}', "v2");
    await expect(
      writeIncrementalArtifactsToLocalD1(db, artifacts, geo, geo, "v3", {
        delta,
        manifestJson: null,
      }),
    ).rejects.toThrow("Stale sync snapshot");
    expect(db.usage).toHaveLength(1);
    expect(sqlite.prepare("SELECT updated_at FROM manifest").get()).toMatchObject({
      updated_at: "v2",
    });
    sqlite.close();
  });
  it("preserves comparison timestamps only for unchanged evidence and preserves unchanged detail IDs", async () => {
    const { sqlite, db, artifacts, delta, geo } = setup();
    const address = artifacts.blockSummaries[0].addressKey;
    const oldDetail = JSON.parse(
      readFileSync(`tests/fixtures/public-data/details/${address}.json`, "utf8"),
    );
    artifacts.details[address] = oldDetail;
    const comparison = JSON.parse(
      readFileSync(`tests/fixtures/public-data/comparisons/${address}.json`, "utf8"),
    );
    artifacts.comparisons = { [address]: comparison };
    await writeIncrementalArtifactsToLocalD1(db, artifacts, geo, geo, "v1", {
      delta,
      manifestJson: null,
    });
    const storedDetail = sqlite
      .prepare("SELECT json FROM block_details WHERE address_key=?")
      .get(address) as { json: string };
    const storedComparison = sqlite
      .prepare("SELECT json FROM comparisons WHERE address_key=?")
      .get(address) as { json: string };
    artifacts.details[address] = JSON.parse(storedDetail.json);
    for (const transaction of artifacts.details[address].recentTransactions)
      transaction.id = `csv-reordered-${transaction.id}`;
    comparison.generatedAt = "new-timestamp";
    const freshDb = () =>
      new D1Client({
        accountId: "fixture",
        databaseId: "fixture",
        apiToken: "fixture",
        endpoint: "http://localhost",
      });
    expect(
      (await planArtifactWrites(freshDb(), artifacts, geo, geo, "v2", delta)).changedRows,
    ).toMatchObject({ block_details: 0, comparisons: 0 });
    comparison.percentileRanks.pricePercentile += 1;
    const changed = await planArtifactWrites(freshDb(), artifacts, geo, geo, "v2", delta);
    expect(changed.changedRows.comparisons).toBe(1);
    expect(
      changed.statements.find((statement) =>
        /^(?:INSERT INTO|UPDATE) comparisons/.test(statement.sql),
      )?.params?.[0],
    ).toContain("new-timestamp");
    expect(JSON.parse(storedComparison.json).generatedAt).not.toBe("new-timestamp");
    sqlite.close();
  });
  it("remote apply is blocked before even reading or writing", async () => {
    const { artifacts, delta, geo, sqlite } = setup();
    await expect(
      writeIncrementalArtifactsToLocalD1(
        new D1Client({ accountId: "a", databaseId: "d", apiToken: "t" }),
        artifacts,
        geo,
        geo,
        "v1",
        { delta, manifestJson: null },
      ),
    ).rejects.toThrow("Remote apply disabled");
    expect(fetch).not.toHaveBeenCalled();
    sqlite.close();
  });
});

it("native JSON patches preserve nested types, nulls and legitimate unknown fields", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE block_details(address_key TEXT PRIMARY KEY, json TEXT NOT NULL)");
  const before = {
    summary: { price: 1 },
    monthlyTrend: [1],
    recentTransactions: [{ a: 1 }],
    unknown: { keep: [true, null, "x"] },
  };
  sqlite.prepare("INSERT INTO block_details VALUES (?,?)").run("block", JSON.stringify(before));
  const nextSummary = { price: null, arrays: [1, { nested: true }], absent: undefined };
  const statements = jsonDetailPatchStatements(
    ["summary", "monthlyTrend", "recentTransactions"],
    [["block", nextSummary, [], [{ field: null }]]],
  );
  for (const statement of statements)
    sqlite.prepare(statement.sql).run(...(statement.params as string[]));
  const actual = JSON.parse(
    (sqlite.prepare("SELECT json FROM block_details").get() as { json: string }).json,
  );
  expect(actual).toEqual({
    ...before,
    summary: { price: null, arrays: [1, { nested: true }] },
    monthlyTrend: [],
    recentTransactions: [{ field: null }],
  });
  expect(actual.summary).not.toHaveProperty("absent");
  sqlite.close();
});

it("persistent cache writes remain staged until preflight and roll back with published data", async () => {
  const { sqlite, db, artifacts, delta, geo, interrupt } = setup();
  db.beginWriteStaging();
  await db.query({
    sql: "INSERT INTO geocode_cache(cache_key,lat,lng,search_value,updated_at) VALUES (?,?,?,?,?)",
    params: ["staged", 1.3, 103.8, "TEST ST", "v1"],
  });
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM geocode_cache").get()).toMatchObject({ n: 0 });
  const plan = await planArtifactWrites(db, artifacts, geo, geo, "v1", delta);
  expect(plan.forecastWriteUpperBound).toBeGreaterThan(0);
  interrupt(true);
  await expect(
    writeIncrementalArtifactsToLocalD1(db, artifacts, geo, geo, "v1", {
      delta,
      manifestJson: null,
    }),
  ).rejects.toThrow();
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM geocode_cache").get()).toMatchObject({ n: 0 });
  interrupt(false);
  const recovered = new D1Client({
    accountId: "fixture",
    databaseId: "fixture",
    apiToken: "fixture",
    endpoint: "http://localhost",
  });
  recovered.beginWriteStaging();
  await recovered.query({
    sql: "INSERT INTO geocode_cache(cache_key,lat,lng,search_value,updated_at) VALUES (?,?,?,?,?)",
    params: ["staged", 1.3, 103.8, "TEST ST", "v1"],
  });
  await writeIncrementalArtifactsToLocalD1(recovered, artifacts, geo, geo, "v1", {
    delta,
    manifestJson: null,
  });
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM geocode_cache").get()).toMatchObject({ n: 1 });
  sqlite.close();
});

it("planner publication preserves unknown detail fields and rejects missing owned fields", async () => {
  const { sqlite, db, artifacts, delta, geo } = setup();
  const key = artifacts.blockSummaries[0].addressKey;
  artifacts.details[key] = {
    summary: { ...artifacts.blockSummaries[0], priceIqr: [0, 1], pricePerSqftMedian: null },
    monthlyTrend: [],
    recentTransactions: [],
  };
  await writeIncrementalArtifactsToLocalD1(db, artifacts, geo, geo, "v1", {
    delta,
    manifestJson: null,
  });
  const before = JSON.parse(
    (
      sqlite.prepare("SELECT json FROM block_details WHERE address_key=?").get(key) as {
        json: string;
      }
    ).json,
  );
  before.unknown = { preserve: [null, true, { nested: "yes" }] };
  sqlite
    .prepare("UPDATE block_details SET json=? WHERE address_key=?")
    .run(JSON.stringify(before), key);
  artifacts.details[key] = {
    ...artifacts.details[key],
    summary: { ...artifacts.details[key].summary, medianPrice: 123456 },
  };
  const next = new D1Client({
    accountId: "fixture",
    databaseId: "fixture",
    apiToken: "fixture",
    endpoint: "http://localhost",
  });
  const plan = await planArtifactWrites(next, artifacts, geo, geo, "v2", delta);
  expect(plan.statements.some((statement) => statement.sql.includes("json_set"))).toBe(true);
  const baseline = (
    sqlite.prepare("SELECT json FROM manifest WHERE id=1").get() as { json: string }
  ).json;
  await writeIncrementalArtifactsToLocalD1(next, artifacts, geo, geo, "v2", {
    delta,
    manifestJson: baseline,
  });
  const actual = JSON.parse(
    (
      sqlite.prepare("SELECT json FROM block_details WHERE address_key=?").get(key) as {
        json: string;
      }
    ).json,
  );
  expect(actual).toEqual({ ...before, summary: artifacts.details[key].summary });
  const invalid = JSON.parse(JSON.stringify(artifacts));
  delete invalid.details[key].monthlyTrend;
  await expect(planArtifactWrites(next, invalid, geo, geo, "invalid", delta)).rejects.toThrow(
    "required JSON fields",
  );
  sqlite.close();
});
