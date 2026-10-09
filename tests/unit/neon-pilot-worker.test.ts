// @vitest-environment node
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mock = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  constructed: vi.fn(),
  streamWrite: vi.fn(),
  sockets: [] as EventEmitter[],
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      connection = {
        stream: Object.assign(new EventEmitter(), {
          bytesRead: 0,
          bytesWritten: 0,
          write: mock.streamWrite,
          destroy: vi.fn(),
        }),
      };
      constructor(configuration: unknown) {
        mock.constructed(configuration);
        mock.sockets.push(this.connection.stream);
      }
      connect = mock.connect;
      end = mock.end;
      on() {}
      query = mock.query;
    },
  },
}));
import pg from "pg";
import { installPilotPgInstrumentation } from "../../scripts/neon-benchmark/pilot/pg-instrumentation";
import {
  createComparablePilotWorker,
  runPilotSafeguards,
  PILOT_SETTINGS_SQL,
  PILOT_SERVER_STATS_SQL,
} from "../../scripts/neon-benchmark/pilot/worker";
import { admission, authorityFixture } from "../fixtures/neon-pilot";
import {
  COMPARABLE_RESULT_PREFLIGHT_SQL,
  COMPARABLE_PUBLICATION,
} from "../../scripts/neon-benchmark/pilot/returned-data";
import { createDirectRecoveryDriver } from "../../scripts/neon-benchmark/pilot/direct-recovery";
import {
  SCOPED_RESTORE_SQL,
  SCOPED_VERIFY_SQL,
} from "../../scripts/neon-benchmark/pilot/scoped-sql";

const binding = {
  connectionString: "synthetic-test-only",
  host: "synthetic",
  port: 5432,
  user: "synthetic",
  password: "synthetic",
  database: "synthetic",
} as Hyperdrive;
const environment = {
  DB: {
    prepare: () => {
      throw Error("D1 must not be called");
    },
    batch: () => {
      throw Error("D1 must not be called");
    },
    exec: () => {
      throw Error("D1 must not be called");
    },
    withSession: () => {
      throw Error("D1 must not be called");
    },
    dump: () => {
      throw Error("D1 must not be called");
    },
  } satisfies D1Database,
  HDB_PUBLIC_NEON: binding,
  PUBLIC_DATA_BACKEND: "neon",
  NEON_PUBLIC_CACHE_EPOCH: "synthetic-pilot",
  ASSETS: {
    fetch: async () => new Response(),
    connect: () => {
      throw Error("Asset socket must not be called");
    },
  } satisfies Fetcher,
  SHORTLIST_WRITE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies Env;
const candidate = {
  town: "JURONG WEST",
  block: "211",
  streetName: "BOON LAY PL",
  flatType: "3 ROOM",
  floorAreaSqm: 93,
  storeyRange: "07 TO 09",
  leaseCommenceYear: 1990,
  referenceMonth: "2026-09",
};
const transaction = {
  town: candidate.town,
  block: candidate.block,
  street_name: candidate.streetName,
  flat_type: candidate.flatType,
  floor_area_sqm: 93,
  storey_range: candidate.storeyRange,
  lease_commence_date: 1990,
  resale_price: 400_000,
  flat_model: "Improved",
  month: "2026-09",
};

describe("frozen comparable handler with prospective pilot dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.sockets.splice(0);
    mock.streamWrite.mockReturnValue(true);
    mock.connect.mockResolvedValue(undefined);
    mock.end.mockResolvedValue(undefined);
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === PILOT_SERVER_STATS_SQL)
        return {
          rows: [
            {
              role: "hdb_benchmark_runtime",
              successful_sql_calls: 999_999,
              successful_sql_ms: 100,
            },
          ],
        };
      if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ cnt: 30 }] };
      if (/^SELECT/i.test(sql.trim()))
        return {
          rows: [
            { ...transaction, id: 280851 },
            { ...transaction, id: 280852 },
          ],
        };
      return { rows: [] };
    });
  });
  it("checks an immutable two-second serving bound with SELECT/read-only controls and no timeout override", async () => {
    const { authority, store } = await authorityFixture();
    // Synthetic driver fixture only; no real role/default change or cancellation evidence.
    await store.transact((current) => ({
      next: { ...current!, serverTimeoutMs: 2000 },
      result: undefined,
    }));
    await authority.admitRequest(admission("safeguards", { method: "GET", maximumStatements: 8 }));
    let elapsed = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === PILOT_SETTINGS_SQL)
        return {
          rows: [
            {
              role: "hdb_benchmark_runtime",
              database: "neondb",
              read_only: "on",
              statement_timeout: "2s",
              transaction_select: true,
              transaction_write: false,
              private_access: false,
            },
          ],
        };
      if (sql === "SELECT pg_sleep(3)") {
        elapsed = 2000;
        throw Object.assign(new Error("synthetic statement timeout"), { code: "57014" });
      }
      if (sql === PILOT_SERVER_STATS_SQL) return { rows: [{ role: "hdb_benchmark_runtime" }] };
      return { rows: [] };
    });
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const evidence = await runPilotSafeguards(
        { authority, instrumentation },
        binding,
        "safeguards",
      );
      expect(evidence).toMatchObject({ timeoutSQLSTATE: "57014", timeoutWallMs: 2000 });
      const sql = mock.query.mock.calls.map(([query]) => String(query));
      expect(sql).toContain("SELECT pg_sleep(3)");
      expect(sql.some((query) => /^(UPDATE|INSERT|DELETE|ALTER|SET)\b/i.test(query.trim()))).toBe(
        false,
      );
      expect(mock.constructed.mock.calls[0][0]).not.toHaveProperty("statement_timeout");
      expect(mock.constructed.mock.calls[0][0]).not.toHaveProperty("options");
      expect((await authority.snapshot()).statements.every((s) => s.serverTimeoutMs === 2000)).toBe(
        true,
      );
    } finally {
      instrumentation.restore();
      clock.mockRestore();
    }
  });
  it("counts snapshot, counts, rows, COMMIT and diagnostic before sending; preserves duplicates", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const handler = createComparablePilotWorker({ authority, instrumentation });
      const response = await handler(
        new Request("https://synthetic.test/api/comparable-transactions", {
          method: "POST",
          body: JSON.stringify(candidate),
          headers: {
            "content-type": "application/json",
            "content-length": String(
              new TextEncoder().encode(JSON.stringify(candidate)).byteLength,
            ),
          },
        }),
        environment,
        "request1",
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { comparables: { transactionId: string }[] };
      expect(body.comparables.map((row) => row.transactionId)).toEqual(
        expect.arrayContaining(["280851", "280852"]),
      );
      const sql = mock.query.mock.calls.map((call) => call[0] as string);
      expect(sql[0]).toBe("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      expect(sql.at(-2)).toBe("COMMIT");
      expect(sql.at(-1)).toBe(PILOT_SERVER_STATS_SQL);
      const state = await authority.snapshot();
      expect(state.applicationStatements).toBe(sql.length);
      expect(state.serverObservations[0].calls).toBe(999_999);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(JSON.parse(response.headers.get("x-pilot-statement-ids")!)).toEqual(
        state.statements.map((entry) => entry.id),
      );
    } finally {
      instrumentation.restore();
    }
  });
  it("refuses replay in a different handler sharing the authority", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const handler = createComparablePilotWorker({ authority, instrumentation });
      await expect(
        handler(
          new Request("https://synthetic.test/api/comparable-transactions"),
          environment,
          "request1",
        ),
      ).rejects.toThrow("replayed");
      expect(mock.query).not.toHaveBeenCalled();
    } finally {
      instrumentation.restore();
    }
  });
  it("integrates the snapshot producer guard through the same dispatcher before comparable queries", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission("bounded", { maximumStatements: 10 }));
    const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === COMPARABLE_RESULT_PREFLIGHT_SQL)
        return { rows: [{ bounded: true, selected_town: candidate.town }] };
      if (sql === PILOT_SERVER_STATS_SQL)
        return {
          rows: [
            {
              role: "hdb_benchmark_runtime",
              read_only: "on",
              statement_timeout: "2s",
              publication_id: COMPARABLE_PUBLICATION,
              successful_sql_calls: 100,
              successful_sql_ms: 10,
            },
          ],
        };
      const result = await original(sql);
      if (sql.startsWith("SELECT id, month"))
        return {
          rows: result.rows.map((row: Record<string, unknown>) => ({
            id: row.id,
            month: row.month,
            town: row.town,
            block: row.block,
            street_name: row.street_name,
            address_key: "211 BOON LAY PL",
            flat_type: row.flat_type,
            storey_range: row.storey_range,
            floor_area_sqm: row.floor_area_sqm,
            lease_commence_year: 1990,
            resale_price: row.resale_price,
            flat_model: row.flat_model,
          })),
        };
      return result;
    });
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const body = JSON.stringify(candidate);
      const result = await createComparablePilotWorker({
        authority,
        instrumentation,
        returnedDataInput: {
          town: candidate.town,
          block: candidate.block,
          streetName: candidate.streetName,
          flatType: candidate.flatType,
        },
      })(
        new Request("https://synthetic.test/api/comparable-transactions", {
          method: "POST",
          body,
          headers: { "content-type": "application/json", "content-length": String(body.length) },
        }),
        environment,
        "bounded",
      );
      expect(result.status).toBe(200);
      const sql = mock.query.mock.calls.map(([text]) => String(text));
      expect(sql[0]).toBe("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      expect(sql[1]).toBe(COMPARABLE_RESULT_PREFLIGHT_SQL);
      expect(sql.filter((text) => text === COMPARABLE_RESULT_PREFLIGHT_SQL)).toHaveLength(1);
      expect((await authority.snapshot()).applicationStatements).toBe(sql.length);
      expect(JSON.stringify(await result.json())).toContain("280852");
    } finally {
      instrumentation.restore();
    }
  });
  it("fails producer admission before sending comparable row/count SQL and retains rollback accounting", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission("bounded-failure", { maximumStatements: 10 }));
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === COMPARABLE_RESULT_PREFLIGHT_SQL)
        return { rows: [{ bounded: false, selected_town: candidate.town }] };
      if (sql === PILOT_SERVER_STATS_SQL)
        return {
          rows: [
            {
              role: "hdb_benchmark_runtime",
              read_only: "on",
              statement_timeout: "2s",
              publication_id: COMPARABLE_PUBLICATION,
              successful_sql_calls: 100,
              successful_sql_ms: 10,
            },
          ],
        };
      return { rows: [] };
    });
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const body = JSON.stringify(candidate);
      await createComparablePilotWorker({
        authority,
        instrumentation,
        returnedDataInput: {
          town: candidate.town,
          block: candidate.block,
          streetName: candidate.streetName,
          flatType: candidate.flatType,
        },
      })(
        new Request("https://synthetic.test/api/comparable-transactions", {
          method: "POST",
          body,
          headers: { "content-type": "application/json", "content-length": String(body.length) },
        }),
        environment,
        "bounded-failure",
      ).catch(() => undefined);
      const sql = mock.query.mock.calls.map(([text]) => String(text));
      expect(sql.some((text) => text.startsWith("SELECT COUNT(*)"))).toBe(false);
      expect(sql).toContain("ROLLBACK");
      expect((await authority.snapshot()).applicationStatements).toBe(sql.length);
    } finally {
      instrumentation.restore();
    }
  });
  it("refuses an unproved owner bound before credential callbacks or directclients", () => {
    const ownerURI = vi.fn(),
      runtimeURI = vi.fn();
    expect(() =>
      createDirectRecoveryDriver({
        directOwner60sStartupContractProven: false,
        ownerURI,
        runtimeURI,
        now: () => 1000,
        waitUntil: async () => {},
      }),
    ).toThrow("owner60s startup contract unproved");
    expect(ownerURI).not.toHaveBeenCalled();
    expect(runtimeURI).not.toHaveBeenCalled();
    expect(mock.constructed).not.toHaveBeenCalled();
  });
  it("uses fresh directclients with owner startup60s, runtime inheriteddefault and no SQL SET/options", async () => {
    const fixtureURI = (role: string) => {
      const uri = new URL("postgresql://synthetic.test");
      uri.hostname = "ep-steep-water-b300tebo.c-4.ap-southeast-1.aws.neon.tech";
      uri.username = role;
      uri.password = "synthetic-fixture-only";
      uri.pathname = "/neondb";
      uri.searchParams.set("sslmode", "require");
      return uri.toString();
    };
    mock.query.mockResolvedValue({ rows: [] });
    // Synthetic flags only. No actual owner bound is inferred or measured by this test.
    const driver = createDirectRecoveryDriver({
      directOwner60sStartupContractProven: true,
      ownerURI: () => fixtureURI("neondb_owner"),
      runtimeURI: () => fixtureURI("hdb_benchmark_runtime"),
      now: () => 1000,
      waitUntil: async () => {},
    });
    await driver.freshQuery("restore", SCOPED_RESTORE_SQL);
    await driver.freshQuery("verify", SCOPED_VERIFY_SQL);
    expect(mock.constructed).toHaveBeenCalledTimes(2);
    expect(mock.connect).toHaveBeenCalledTimes(2);
    expect(mock.end).toHaveBeenCalledTimes(2);
    expect(mock.query.mock.calls.map(([sql]) => sql)).toEqual([
      SCOPED_RESTORE_SQL,
      SCOPED_VERIFY_SQL,
    ]);
    for (const [configuration] of mock.constructed.mock.calls) {
      expect(configuration).not.toHaveProperty("options");
      if (configuration === mock.constructed.mock.calls[0][0])
        expect(configuration).toHaveProperty("statement_timeout", 60_000);
      else expect(configuration).not.toHaveProperty("statement_timeout");
    }
  });
  it("fails closed with a missing shared authority or D1 selector and never queries", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const handler = createComparablePilotWorker({ authority, instrumentation });
      await expect(
        handler(
          new Request("https://synthetic.test/api/comparable-transactions"),
          { ...environment, PUBLIC_DATA_BACKEND: "d1" },
          "request1",
        ),
      ).rejects.toThrow("AUTHORIZATION");
      expect(mock.query).not.toHaveBeenCalled();
      expect(() => new pg.Client()).toThrow("AUTHORIZATION");
    } finally {
      instrumentation.restore();
    }
  });
  it("records rollback when the original query fails without D1 fallback", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === PILOT_SERVER_STATS_SQL)
        return {
          rows: [
            { role: "hdb_benchmark_runtime", successful_sql_calls: 83, successful_sql_ms: 0.7 },
          ],
        };
      if (/COUNT/i.test(sql))
        throw Object.assign(Error("origin password withheld"), { code: "57014" });
      return { rows: [] };
    });
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const handler = createComparablePilotWorker({ authority, instrumentation });
      const request = new Request("https://synthetic.test/api/comparable-transactions", {
        method: "POST",
        body: JSON.stringify(candidate),
        headers: {
          "content-type": "application/json",
          "content-length": String(new TextEncoder().encode(JSON.stringify(candidate)).byteLength),
        },
      });
      await handler(request, environment, "request1").catch(() => undefined);
      const state = await authority.snapshot();
      expect(mock.query.mock.calls.map((call) => call[0])).toContain("ROLLBACK");
      expect(state.applicationStatements).toBe(mock.query.mock.calls.length);
      expect(JSON.stringify(state)).not.toContain("origin password");
    } finally {
      instrumentation.restore();
    }
  });
  it("stops the shared pilot after protocol overflow, retaining SQL permits and reservations", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    const originalQuery = mock.query.getMockImplementation()!;
    let injected = false;
    mock.query.mockImplementation(async (sql: string) => {
      if (!injected) {
        injected = true;
        mock.sockets[0].emit("data", new Uint8Array(2_000_001));
      }
      return originalQuery(sql);
    });
    const instrumentation = installPilotPgInstrumentation(pg);
    try {
      const handler = createComparablePilotWorker({ authority, instrumentation });
      const body = JSON.stringify(candidate);
      await expect(
        handler(
          new Request("https://synthetic.test/api/comparable-transactions", {
            method: "POST",
            body,
            headers: {
              "content-type": "application/json",
              "content-length": String(new TextEncoder().encode(body).byteLength),
            },
          }),
          environment,
          "request1",
        ),
      ).rejects.toThrow("EVIDENCE");
      const state = await authority.snapshot();
      expect(state.stopped).toBe(true);
      expect(state.applicationStatements).toBe(mock.query.mock.calls.length);
      expect(state.receivedDatabaseBytesReserved).toBe(2_000_000);
    } finally {
      instrumentation.restore();
    }
  });
});
