import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalJson,
  validateNeonRefreshUrl,
  NEON_REFRESH_BRANCH,
  NeonPlanningStore,
  publishNeon,
  AmbiguousNeonPublicationError,
  safeNeonError,
  readNeonSqlTime,
  type PgQuery,
} from "../../scripts/lib/sync/neon";
import { checkNeonPilotBudget } from "../../scripts/lib/sync/neon-usage";
import { neonRefreshOptions, runSyncNeon } from "../../scripts/sync-neon";
import { transactionStatements, planTransactionDelta } from "../../scripts/lib/sync/incremental";
import type { Manifest } from "../../shared/data-types";
import { jsonDetailPatchStatements, jsonUpdateStatements } from "../../scripts/lib/sync/statements";

afterEach(() => vi.restoreAllMocks());
const target =
  "postgresql://test:fixture-password@ep-steep-moon-b35xjj4d.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const fixtureFact = {
  id: 1,
  month: "2026-08",
  town: "TEST",
  block: "1",
  street_name: "STREET",
  address_key: "test-1",
  flat_type: "4 ROOM",
  storey_range: "01 TO 03",
  floor_area_sqm: 90.5,
  lease_commence_year: 1990,
  resale_price: 793888.88,
  flat_model: "MODEL",
};

describe("isolated Neon target and explicit intent", () => {
  it("requires the exact direct endpoint and forces verified TLS without exposing credentials", () => {
    expect(
      new URL(validateNeonRefreshUrl(target, NEON_REFRESH_BRANCH)).searchParams.get("sslmode"),
    ).toBe("verify-full");
    for (const value of [
      target.replace("ep-steep-moon-b35xjj4d", "ep-production"),
      target.replace(".c-4", "-pooler.c-4"),
      target.replace("/neondb", "/postgres"),
      target + "&options=-csearch_path%3Dprivate",
      "invalid",
    ]) {
      expect(() => validateNeonRefreshUrl(value, NEON_REFRESH_BRANCH)).toThrow();
    }
    expect(() => validateNeonRefreshUrl(target, "production")).toThrow();
  });
  it("does not permit monthly flags or implicit reconciliation", () => {
    const base = ["--branch", NEON_REFRESH_BRANCH];
    expect(neonRefreshOptions([...base, "--apply", "--reconcile-manual"]).mode).toBe("--apply");
    expect(() => neonRefreshOptions([...base, "--apply"])).toThrow();
    expect(() =>
      neonRefreshOptions([...base, "--plan", "--apply", "--reconcile-manual"]),
    ).toThrow();
    expect(() =>
      neonRefreshOptions([...base, "--apply", "--reconcile-manual", "--reconcile-monthly"]),
    ).toThrow();
  });
  it("fails before upstream or database activity without authoritative baseline usage", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network"));
    await expect(
      runSyncNeon(["--apply", "--reconcile-manual", "--branch", NEON_REFRESH_BRANCH]),
    ).rejects.toThrow("Console usage receipt");
    expect(network).not.toHaveBeenCalled();
  });
  it("prepares a real manual-only job with no cron, D1 credentials or application deployment", () => {
    const workflow = readFileSync(resolve(".github/workflows/refresh-neon.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/schedule:|cron:|wrangler deploy|CLOUDFLARE_D1/);
    expect(workflow).toContain("vp run sync-data:neon");
    expect(workflow).toContain("NEON_BENCHMARK_REFRESH_DATABASE_URL");
    expect(existsSync(resolve(".github/workflows/refresh-data.yml"))).toBe(false);
  });
  it("is triggered by workflow_dispatch alone, never by a schedule, push or pull request", () => {
    const workflow = readFileSync(resolve(".github/workflows/refresh-neon.yml"), "utf8");
    const triggers = /^on:\n((?:[ \t]+.*\n|\n)*)/m.exec(workflow)?.[1] ?? "";
    expect([...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1])).toEqual([
      "workflow_dispatch",
    ]);
  });
  it("defaults to plan: a dispatch that does not choose a mode writes nothing", () => {
    const workflow = readFileSync(resolve(".github/workflows/refresh-neon.yml"), "utf8");
    const mode = /^ {6}mode:\n((?: {8}.*\n)+)/m.exec(workflow)?.[1] ?? "";
    expect(mode).toMatch(/^ {8}default: plan$/m);
    expect(mode).toMatch(/^ {8}options: \[plan, apply\]$/m);
    expect(mode).toMatch(/^ {8}required: true$/m);
    expect(mode).not.toMatch(/default: apply/);
  });
  it("runs a script that package.json defines", () => {
    const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts["sync-data:neon"]).toBe("tsx scripts/sync-neon.ts");
  });
});

describe("JSONB and exact identity bridge", () => {
  it("sanitizes failure receipts and distinguishes unavailable SQL instrumentation from zero", async () => {
    expect(
      safeNeonError(new Error(`Failed ${target} token=private-fixture-token`), [
        "private-fixture-token",
      ]),
    ).toBe("Failed [redacted URL] token=[redacted]");
    const unavailable = vi.fn<PgQuery>().mockRejectedValue(new Error("missing extension"));
    expect(await readNeonSqlTime(unavailable)).toBeNull();
    const measured = vi
      .fn<PgQuery>()
      .mockResolvedValue({ rows: [{ sql_ms: "12.5" }], rowCount: 1 });
    expect(await readNeonSqlTime(measured)).toBe(12.5);
    expect(measured.mock.calls[0][0]).not.toContain("CREATE EXTENSION");
  });
  it("normalizes only object key order and retains arrays, null and fractional numbers", () => {
    expect(canonicalJson({ b: [2, 1], a: { price: 793888.88, nullable: null } })).toBe(
      canonicalJson({ a: { nullable: null, price: 793888.88 }, b: [2, 1] }),
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    expect(canonicalJson(null)).not.toBe(canonicalJson("null"));
    expect(() => canonicalJson({ price: NaN })).toThrow();
  });
  it("retains legitimate duplicate multiplicity and decimal prices through the exact planner", () => {
    const previous = [fixtureFact, { ...fixtureFact, id: 2 }];
    const unchanged = planTransactionDelta(previous, [fixtureFact, fixtureFact]);
    expect(unchanged.inserts).toEqual([]);
    const added = planTransactionDelta(previous, [fixtureFact, fixtureFact, fixtureFact]);
    expect(added.inserts).toEqual([{ ...fixtureFact, id: 3 }]);
    expect(added.inserts[0].resale_price).toBe(793888.88);
    expect(() => planTransactionDelta(previous, [fixtureFact])).toThrow("disappearance");
    const correction = { ...fixtureFact, resale_price: 793889.88, town: "NEW TOWN" };
    const reviewed = planTransactionDelta(previous, [correction, fixtureFact], {
      corrections: new Map([[1, correction]]),
    });
    expect(reviewed.updates).toEqual([correction]);
    expect([...reviewed.affectedTownTypes]).toHaveLength(2);
  });
});

describe("Neon planning adapter", () => {
  it("uses primary-key artifact pages and returns JSON text/number IDs without any D1 call", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("D1 must never be contacted"));
    const query = vi
      .fn<PgQuery>()
      .mockResolvedValueOnce({ rows: [{ address_key: "a", json: { z: 2, a: null } }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ address_key: "b", json: { a: 3 } }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ ...fixtureFact, id: "1" }], rowCount: 1 });
    const db = new NeonPlanningStore(query);
    db.columnTypes["block_details.address_key"] = "text";
    db.columnTypes["block_details.json"] = "jsonb";
    db.jsonColumns.add("block_details.json");
    const sql =
      "SELECT rowid AS _cursor, address_key,json FROM block_details WHERE rowid > ? ORDER BY rowid LIMIT ?";
    expect(await db.query({ sql, params: [0, 1] })).toEqual([
      { address_key: "a", json: '{"a":null,"z":2}', _cursor: 1 },
    ]);
    expect(await db.query({ sql, params: [1, 1] })).toEqual([
      { address_key: "b", json: '{"a":3}', _cursor: 2 },
    ]);
    expect(query.mock.calls[1]).toEqual([
      "SELECT address_key,json FROM block_details WHERE (address_key) > ($1) ORDER BY address_key LIMIT $2",
      ["a", 1],
    ]);
    const facts = await db.query({
      sql: "SELECT id, month,town FROM transactions WHERE id > ? ORDER BY id LIMIT ?",
      params: [0, 5000],
    });
    expect(facts[0].id).toBe(1);
    expect(db.usageReport()).toMatchObject({
      provenance: "postgres-returned-rows",
      billingReadsMeasured: false,
      rowsRead: 3,
      rowsWritten: 0,
    });
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects unsupported SQL, unsafe IDs and mutations before staging", async () => {
    const query = vi
      .fn<PgQuery>()
      .mockResolvedValue({ rows: [{ ...fixtureFact, id: "9007199254740992" }], rowCount: 1 });
    const db = new NeonPlanningStore(query);
    await expect(db.query({ sql: "DELETE FROM transactions" })).rejects.toThrow("staged");
    await expect(db.query({ sql: "SELECT * FROM shortlists" })).rejects.toThrow();
    await expect(
      db.query({
        sql: "SELECT id, month FROM transactions WHERE id > ? ORDER BY id LIMIT ?",
        params: [0, 5000],
      }),
    ).rejects.toThrow("identity");
  });
  it("borrows actual cache helpers but stages all UPSERTs instead of executing them early", async () => {
    const query = vi.fn<PgQuery>();
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected D1"));
    const db = new NeonPlanningStore(query);
    db.beginWriteStaging();
    await db.batchInsert({
      table: "geocode_cache",
      columns: ["cache_key", "lat", "lng"],
      rows: [["test", 1.3, 103.8]],
      upsert: true,
      mapRow: (row) => row,
    });
    expect(db.stagedWrites()).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("PostgreSQL manifest-last publication protocol", () => {
  const manifest = { version: 1 } as unknown as Manifest;
  const plan = {
    statements: transactionStatements({
      inserts: [fixtureFact],
      updates: [],
      affectedBlocks: new Set<string>(),
      affectedTownTypes: new Set<string>(),
    }),
    changedRows: { transactions: 1 },
    forecastWriteUpperBound: 5,
  };
  function store(query: PgQuery) {
    const db = new NeonPlanningStore(query);
    for (const [key, value] of Object.entries(fixtureFact))
      db.columnTypes[`transactions.${key}`] =
        key === "id" ? "int8" : typeof value === "number" ? "float8" : "text";
    return db;
  }
  it("commits data then manifest with decimal facts intact", async () => {
    const query = vi.fn<PgQuery>().mockImplementation(async (sql) => ({
      rows: sql.includes("FOR UPDATE") ? [{ matches: true }] : [],
      rowCount: sql.startsWith("INSERT") || sql.startsWith("UPDATE") ? 1 : null,
    }));
    const result = await publishNeon(
      query,
      store(query),
      plan,
      manifest,
      '{"version":0}',
      "2026-10-04T00:00:00Z",
    );
    expect(query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual([
      "BEGIN",
      "SELECT",
      "INSERT",
      "UPDATE",
      "COMMIT",
    ]);
    expect(JSON.parse(String(query.mock.calls[2][1]?.[0]))[0]).toContain(793888.88);
    expect(result.changedRows).toEqual({ transactions: 1, manifest: 1 });
  });
  it("rolls back on a stale baseline without executing mutations", async () => {
    const query = vi
      .fn<PgQuery>()
      .mockResolvedValue({ rows: [{ matches: false }], rowCount: null });
    await expect(
      publishNeon(query, store(query), plan, manifest, "{}", "2026-10-04"),
    ).rejects.toThrow("Stale");
    expect(query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual([
      "BEGIN",
      "SELECT",
      "ROLLBACK",
    ]);
  });
  it("rolls back on a late manifest failure without a commit", async () => {
    const query = vi.fn<PgQuery>().mockImplementation(async (sql) => {
      if (sql.startsWith("UPDATE manifest")) throw new Error("injected-before-manifest");
      return {
        rows: sql.includes("FOR UPDATE") ? [{ matches: true }] : [],
        rowCount: sql.startsWith("INSERT") ? 1 : null,
      };
    });
    await expect(
      publishNeon(query, store(query), plan, manifest, "{}", "2026-10-04"),
    ).rejects.toThrow("injected");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });
  it("rejects affected-row mismatch and over-budget plans", async () => {
    const query = vi.fn<PgQuery>().mockImplementation(async (sql) => ({
      rows: sql.includes("FOR UPDATE") ? [{ matches: true }] : [],
      rowCount: 0,
    }));
    await expect(
      publishNeon(query, store(query), plan, manifest, "{}", "2026-10-04"),
    ).rejects.toThrow("affected-row");
    query.mockClear();
    await expect(
      publishNeon(
        query,
        store(query),
        { ...plan, forecastWriteUpperBound: 29_421 },
        manifest,
        "{}",
        "2026-10-04",
      ),
    ).rejects.toThrow("safety");
    expect(query).not.toHaveBeenCalled();
  });
  it("marks a lost COMMIT response ambiguous and never blindly replays", async () => {
    const query = vi.fn<PgQuery>().mockImplementation(async (sql) => {
      if (sql === "COMMIT") throw new Error("connection lost");
      return { rows: sql.includes("FOR UPDATE") ? [{ matches: true }] : [], rowCount: 1 };
    });
    await expect(
      publishNeon(query, store(query), plan, manifest, "{}", "2026-10-04"),
    ).rejects.toBeInstanceOf(AmbiguousNeonPublicationError);
    expect(query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"))).toHaveLength(1);
  });
  it("compiles field-level JSON patches without dropping unknown stored roots", async () => {
    const query = vi.fn<PgQuery>().mockImplementation(async (sql) => ({
      rows: sql.includes("FOR UPDATE") ? [{ matches: true }] : [],
      rowCount: 1,
    }));
    const db = store(query);
    db.columnTypes["blocks.median_price"] = "float8";
    db.columnTypes["blocks.address_key"] = "text";
    const statements = [
      ...jsonDetailPatchStatements(["summary"], [["test-1", { nullable: null, price: 793888.88 }]]),
      ...jsonUpdateStatements("blocks", ["address_key"], ["median_price"], [["test-1", 793888.88]]),
    ];
    await publishNeon(query, db, { ...plan, statements }, manifest, "{}", "2026-10-04");
    expect(query.mock.calls[2][0]).toContain("jsonb_set(block_details.json,'{summary}'");
    expect(query.mock.calls[3][0]).toContain("::float8");
  });
});

describe("provider baseline gate", () => {
  const now = Date.parse("2026-10-04T03:00:00Z");
  const baseline = {
    projectId: "wispy-mouse-67963002",
    source: "neon-console",
    networkScope: "public-only",
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-11-01T00:00:00Z",
    observedAt: "2026-10-04T03:00:00Z",
    settledThrough: "2026-10-04T02:30:00Z",
    networkTransferBytes: 600_000_000,
    transferResolutionBytes: 10_000_000,
    computeCUHours: 1,
    computeResolutionCUHours: 0.01,
  };
  it("reserves the full pilot envelope and 1 GB against observed total usage", () => {
    expect(checkNeonPilotBudget(baseline, now).remainingAfterPilotAndReserve).toBe(2_896_292_076);
  });
  it("does not accept API zeros, stale meters or insufficient headroom", () => {
    expect(() => checkNeonPilotBudget({ ...baseline, source: "project-api" }, now)).toThrow();
    expect(() => checkNeonPilotBudget({ ...baseline, networkTransferBytes: 0 }, now)).toThrow();
    expect(() =>
      checkNeonPilotBudget({ ...baseline, settledThrough: "2026-10-04T00:00:00Z" }, now),
    ).toThrow();
    expect(() =>
      checkNeonPilotBudget({ ...baseline, networkTransferBytes: 4_000_000_000 }, now),
    ).toThrow();
    expect(() => checkNeonPilotBudget({ ...baseline, computeCUHours: 99.9 }, now)).toThrow();
    expect(() =>
      checkNeonPilotBudget({ ...baseline, computeCUHours: 0, computeResolutionCUHours: 0 }, now),
    ).toThrow();
    // A rounded Console compute meter has a bounded interval; legacy API zeros do not.
    expect(
      checkNeonPilotBudget({ ...baseline, computeCUHours: 0, computeResolutionCUHours: 0.1 }, now)
        .maxPilotComputeCUHours,
    ).toBe(25 / 60);
  });
  it("accepts calibrated rounded Console totals with explicit unknown as-of, lifecycle and pending reserves", () => {
    const unknown = {
      ...baseline,
      usageAsOf: "UNKNOWN",
      settledThrough: null,
      networkScope: "all-network-upper-bounds-public",
      knownActivity: {
        observedAt: baseline.observedAt,
        priorMeasuredReceivedBytes: 493_707_924,
        endpoints: [
          {
            endpointId: "ep-steep-moon-b35xjj4d",
            branchId: NEON_REFRESH_BRANCH,
            state: "idle",
            maxCU: 1,
            lastActiveAt: "2026-10-04T01:47:44Z",
            suspendedAt: "2026-10-04T01:53:46Z",
          },
          {
            endpointId: "ep-cool-glade-b3bjctpc",
            branchId: "br-broad-credit-b3bz9b61",
            state: "idle",
            maxCU: 2,
            lastActiveAt: "2026-10-04T01:00:00Z",
            suspendedAt: "2026-10-04T01:05:00Z",
          },
        ],
      },
    };
    expect(checkNeonPilotBudget(unknown, now)).toMatchObject({
      pendingTransferReserve: 1_000_000_000,
      pendingComputeReserve: 10,
      remainingAfterPilotAndReserve: 1_896_292_076,
    });
    expect(() => checkNeonPilotBudget({ ...unknown, knownActivity: undefined }, now)).toThrow();
    expect(() =>
      checkNeonPilotBudget({ ...unknown, settledThrough: baseline.settledThrough }, now),
    ).toThrow();
    expect(() => checkNeonPilotBudget({ ...unknown, networkTransferBytes: 0 }, now)).toThrow();
    expect(() =>
      checkNeonPilotBudget({ ...unknown, networkTransferBytes: 3_000_000_000 }, now),
    ).toThrow();
    expect(() => checkNeonPilotBudget({ ...unknown, computeCUHours: 90 }, now)).toThrow();
    expect(() =>
      checkNeonPilotBudget({ ...unknown, additionalKnownTransferUpperBytes: 2_000_000_000 }, now),
    ).toThrow();
    expect(() =>
      checkNeonPilotBudget(
        {
          ...unknown,
          knownActivity: {
            ...unknown.knownActivity,
            endpoints: [unknown.knownActivity.endpoints[0], unknown.knownActivity.endpoints[0]],
          },
        },
        now,
      ),
    ).toThrow();
  });
});
