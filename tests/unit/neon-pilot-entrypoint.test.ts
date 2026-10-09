// @vitest-environment node
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it, vi } from "vite-plus/test";
import { canonicalJson } from "../../scripts/lib/sync/neon";
import type { TransactionStorage } from "../../scripts/neon-benchmark/pilot/transactional-store";
import {
  initializePilotCohort,
  snapshotPilotCohort,
  PILOT_COHORT_KEY,
} from "../../scripts/neon-benchmark/pilot/cohort-store";
import {
  retirePilotLedger,
  type ResourceAbsenceProof,
} from "../../scripts/neon-benchmark/pilot/ledger-transfer";
import {
  sessionScopedPilotPlan as scopedPilotPlan,
  sessionPilotScopeComparison,
} from "../../scripts/neon-benchmark/pilot/session-plan";
import {
  OWNER_SESSION_SET_SQL,
  OWNER_SESSION_READBACK_SQL,
  runDedicatedOwnerAttempt,
  sessionDirectClientConfiguration,
} from "../../scripts/neon-benchmark/pilot/session-owner";
import {
  SCOPED_OWNER_RECORD_SQL,
  SCOPED_LOWER_SQL,
  SCOPED_RESTORE_SQL,
  SCOPED_VERIFY_SQL,
} from "../../scripts/neon-benchmark/pilot/scoped-sql";
import {
  COMPARABLE_RESULT_PREFLIGHT_SQL,
  COMPARABLE_PUBLICATION,
} from "../../scripts/neon-benchmark/pilot/returned-data";
const db = vi.hoisted(() => ({
  sql: [] as string[],
  configuration: [] as unknown[],
  proof: true,
  timeout: "2s",
  tick: 0,
}));
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      connection = {
        stream: Object.assign(new EventEmitter(), {
          bytesRead: 0,
          bytesWritten: 0,
          write: () => true,
          destroy: () => {},
        }),
      };
      constructor(configuration: unknown) {
        db.configuration.push(configuration);
      }
      on() {}
      async connect() {}
      async end() {}
      async query(sql: string) {
        db.sql.push(sql);
        let rows: Record<string, unknown>[] = [];
        if (sql === "SELECT pg_sleep(3)") {
          db.tick += 2000;
          throw Object.assign(Error("synthetic server cancellation"), { code: "57014" });
        }
        if (sql.includes("current_database() AS database"))
          rows = [
            {
              role: "hdb_benchmark_runtime",
              database: "neondb",
              read_only: "on",
              statement_timeout: db.timeout,
              transaction_select: true,
              transaction_write: false,
              private_access: false,
            },
          ];
        else if (sql.includes("current_user AS role"))
          rows = [
            {
              role: "hdb_benchmark_runtime",
              read_only: "on",
              statement_timeout: db.timeout,
              publication_id: COMPARABLE_PUBLICATION,
              ...(sql.includes("successful_sql_calls")
                ? { successful_sql_calls: 100, successful_sql_ms: 25 }
                : {}),
            },
          ];
        else if (sql === "SELECT 2 AS diagnostic_value") rows = [{ diagnostic_value: 2 }];
        else if (sql.startsWith("WITH counts AS MATERIALIZED"))
          rows = [{ bounded: db.proof, selected_town: "TOWN A" }];
        else if (sql.startsWith("SELECT COUNT(*)")) rows = [{ cnt: 16 }];
        else if (sql.startsWith("SELECT id, month"))
          rows = Array.from({ length: 16 }, (_, i) => ({
            id: i + 1,
            month: "2026-09",
            town: "TOWN A",
            block: "100",
            street_name: "STREET A",
            address_key: "100 STREET A",
            flat_type: "3 ROOM",
            storey_range: "07 TO 09",
            floor_area_sqm: 93,
            lease_commence_year: i < 2 ? null : 1990,
            resale_price: 400000,
            flat_model: "Improved",
          }));
        else if (sql.startsWith("SELECT town, flat_type, month"))
          rows = [
            {
              town: "TOWN A",
              flat_type: "3 ROOM",
              month: "2026-09",
              median_price_per_sqm: 4000,
              transaction_count: 16,
            },
          ];
        this.connection.stream.emit("data", new Uint8Array(24 + JSON.stringify(rows).length));
        return { rows };
      }
    },
  },
}));
import pilot, {
  PilotCounter,
} from "../../.neon-benchmark/shared-counter-candidate-pilot-20261005/worker";
import {
  executeScopedPilot,
  FileCohortStorage,
  existingCandidateURI,
  scopedAdmissionCheckpoint,
  SCOPED_PUBLICATION_SQL,
  SESSION_ID,
  SELECTED_CASES,
  type ScopedPilotIO,
} from "../../.neon-benchmark/shared-counter-candidate-pilot-20261005/execute.mjs";
import { onRequestPost } from "../../functions/api/comparable-transactions";

class Storage implements TransactionStorage {
  data = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async list<T>({ prefix }: { prefix: string }) {
    return new Map(
      [...this.data]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => [k, structuredClone(v) as T]),
    );
  }
  transaction<T>(action: Parameters<TransactionStorage["transaction"]>[0]): Promise<T> {
    const job = this.tail.then(async () => {
      const next = structuredClone(this.data);
      const result = await action({
        get: async <V>(key: string) => structuredClone(next.get(key)) as V | undefined,
        put: async (k, v) => {
          next.set(k, structuredClone(v));
        },
      });
      this.data = next;
      return result as T;
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
const input = {
  town: "TOWN A",
  block: "100",
  streetName: "STREET A",
  flatType: "3 ROOM",
  storeyRange: "07 TO 09",
  floorAreaSqm: 93,
  leaseCommenceYear: 1990,
  referenceMonth: "2026-09",
};
const proofs = {
  ownerSessionTwo: true,
  runtimeScopedTimeout: true,
  producerSQL: true,
  terminalRecovery: true,
};
const hash = (x: unknown) => createHash("sha256").update(canonicalJson(x)).digest("hex");
async function oracle(adjust: boolean) {
  const transactions = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    month: "2026-09",
    town: "TOWN A",
    block: "100",
    street_name: "STREET A",
    address_key: "100 STREET A",
    flat_type: "3 ROOM",
    storey_range: "07 TO 09",
    floor_area_sqm: 93,
    lease_commence_year: i < 2 ? null : 1990,
    resale_price: 400000,
    flat_model: "Improved",
  }));
  const database = {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () => ({ cnt: 16 }),
        all: async () => ({
          results: sql.includes("town_flat_type_trends")
            ? [
                {
                  town: "TOWN A",
                  flat_type: "3 ROOM",
                  month: "2026-09",
                  median_price_per_sqm: 4000,
                  transaction_count: 16,
                },
              ]
            : transactions,
        }),
      }),
    }),
  };
  const request = new Request(
    "https://oracle.invalid/api/comparable-transactions" + (adjust ? "?adjust=time" : ""),
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(JSON.stringify(input))),
      },
    },
  );
  const response = await onRequestPost({
    request,
    env: { DB: database },
    params: {},
    data: {},
    waitUntil: () => {},
    next: async () => new Response(),
    functionPath: "/api/comparable-transactions",
    passThroughOnException: () => {},
  } as unknown as Parameters<typeof onRequestPost>[0]);
  expect(response.status).toBe(200);
  return hash(await response.json());
}
async function fixture() {
  const storage = new Storage(),
    direct = new Storage(),
    recovery = new Storage();
  const token = "synthetic-local-test-only";
  const binding = {
    connectionString: "synthetic-no-network",
    host: "synthetic",
    port: 5432,
    user: "hdb_benchmark_runtime",
    password: "synthetic",
    database: "neondb",
  } as Hyperdrive;
  const context = { storage } as unknown as DurableObjectState;
  const env = {
    SESSION_ID,
    BENCHMARK_TOKEN: token,
    HYPERDRIVE: binding,
    PILOT_COUNTER: { getByName: () => counter },
  } as unknown as Parameters<typeof pilot.fetch>[1];
  const counter = new PilotCounter(context, env);
  const receipts: Record<string, unknown>[] = [];
  const directSQL: string[] = [];
  const configurations: Omit<import("pg").ClientConfig, "connectionString">[] = [];
  const control: string[] = [];
  const cases = await Promise.all(
    SELECTED_CASES.map(async (name, i) => ({
      name,
      adjust: i === 0,
      input,
      canonicalSHA256: await oracle(i === 0),
    })),
  );
  const worker: ScopedPilotIO["worker"] = async (method, path, body, headers = {}) => {
    control.push(path);
    const text = body === undefined ? undefined : JSON.stringify(body);
    const response = await pilot.fetch(
      new Request("https://synthetic.invalid" + path, {
        method,
        ...(method === "POST" ? { body: text } : {}),
        headers: {
          "x-benchmark-token": token,
          ...headers,
          ...(text
            ? {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(text)),
              }
            : {}),
        },
      }),
      env,
    );
    const raw = response.headers.get("x-pilot-receipt");
    const receipt = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    if (receipt) receipts.push(receipt);
    return { status: response.status, data: await response.json(), receipt };
  };
  const absent: ResourceAbsenceProof = {
    workerAbsent: true,
    hyperdriveAbsent: true,
    counterAbsent: true,
    ambiguousCreatesResolved: true,
    observedAtMs: Date.now(),
  };
  const io: ScopedPilotIO = {
    now: Date.now,
    waitUntil: async () => {},
    directStorage: direct,
    recoveryStorage: recovery,
    proofs,
    executionScope: "LOCAL_SIMULATION_ONLY",
    cases,
    preflight: async () => ({ idle: true }),
    createResources: async () => {},
    cleanupResources: async () => ({ ...absent, observedAtMs: Date.now() }),
    worker,
    save: async () => {},
    openDirect: async (_purpose, configuration) => {
      configurations.push(configuration);
      return {
        end: async () => {},
        abort: () => {},
        query: async (sql) => {
          directSQL.push(sql);
          if (sql === OWNER_SESSION_READBACK_SQL)
            return { rows: [{ setting: "2000", unit: "ms", source: "session" }] };
          if (sql === SCOPED_OWNER_RECORD_SQL)
            return {
              rows: [
                {
                  connected_role: "neondb_owner",
                  database: "neondb",
                  owner_timeout: "2s",
                  owner_timeout_source: "session",
                  defaults_bounded: true,
                  defaults_json: JSON.stringify([
                    {
                      setrole: "11",
                      setdatabase: "0",
                      setconfig: ["statement_timeout=60s", "default_transaction_read_only=on"],
                    },
                  ]),
                },
              ],
            };
          if (sql === SCOPED_LOWER_SQL) db.timeout = "2s";
          if (sql === SCOPED_RESTORE_SQL) db.timeout = "1min";
          if (sql === SCOPED_VERIFY_SQL)
            return {
              rows: [
                {
                  role: "hdb_benchmark_runtime",
                  database: "neondb",
                  read_only: "on",
                  statement_timeout: db.timeout,
                  transaction_select: true,
                  transaction_write: false,
                  private_access: false,
                },
              ],
            };
          if (sql === SCOPED_PUBLICATION_SQL) return { rows: [{ publication_matches: true }] };
          return { rows: [] };
        },
      };
    },
  };
  return { io, counter, storage, direct, recovery, receipts, directSQL, configurations, control };
}
describe("actual isolated Worker/executor scoped integration", () => {
  beforeEach(() => {
    db.sql = [];
    db.configuration = [];
    db.proof = true;
    db.timeout = "1min";
    db.tick = 0;
    vi.spyOn(performance, "now").mockImplementation(() => db.tick);
  });
  afterEach(() => vi.restoreAllMocks());
  it("blocks the unapproved remote scope before preflight, credentials, owner SQL, or resources", async () => {
    const f = await fixture();
    f.io.executionScope = "REMOTE_NOT_AUTHORIZED";
    const preflight = vi.spyOn(f.io, "preflight"),
      open = vi.spyOn(f.io, "openDirect"),
      create = vi.spyOn(f.io, "createResources");
    await expect(executeScopedPilot(f.io)).rejects.toThrow("unchanged60s");
    expect(preflight).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(f.directSQL).toEqual([]);
    expect(db.sql).toEqual([]);
  });
  it("retains a rejected session readback before stopping; neither record/lower nor restore follows", async () => {
    const f = await fixture();
    const original = f.io.openDirect;
    f.io.openDirect = async (p, c) => {
      const client = await original(p, c);
      return {
        ...client,
        query: async (sql, params) => {
          const result = await client.query(sql, params);
          if (sql === OWNER_SESSION_READBACK_SQL)
            result.rows = [{ setting: "0", unit: "ms", source: "default" }];
          return result;
        },
      };
    };
    const snapshots: Record<string, unknown>[] = [];
    f.io.save = async (s) => {
      snapshots.push(s);
    };
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(f.directSQL).toEqual([
      SCOPED_VERIFY_SQL,
      OWNER_SESSION_SET_SQL,
      OWNER_SESSION_READBACK_SQL,
    ]);
    expect(
      snapshots.some(
        (s) =>
          JSON.stringify(s.ownerSessionRawReadback) ===
          JSON.stringify([{ setting: "0", unit: "ms", source: "default" }]),
      ),
    ).toBe(true);
    expect(state.restoration).toMatchObject({ restorationRequired: false });
    expect(f.control).not.toContain("/control/begin");
  });
  it("records and checks the fresh original runtime before any owner SET, ALTER, or resources", async () => {
    const f = await fixture();
    db.timeout = "0";
    const create = vi.spyOn(f.io, "createResources");
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(f.directSQL).toEqual([SCOPED_VERIFY_SQL]);
    expect(state.freshDirectOriginalSixtyRaw).toMatchObject([{ statement_timeout: "0" }]);
    expect(state.roleLowerAttempted).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect((await snapshotPilotCohort(f.recovery)).applicationStatements).toBe(1);
  });
  it("does not dispatch readback or later owner SQL after a failed initial SET", async () => {
    const f = await fixture();
    const original = f.io.openDirect;
    f.io.openDirect = async (p, c) => {
      const client = await original(p, c);
      return {
        ...client,
        query: async (sql, params) => {
          if (sql === OWNER_SESSION_SET_SQL) {
            f.directSQL.push(sql);
            throw Object.assign(Error("synthetic SET failure"), { code: "XX000" });
          }
          return client.query(sql, params);
        },
      };
    };
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(f.directSQL).toEqual([SCOPED_VERIFY_SQL, OWNER_SESSION_SET_SQL]);
    expect(f.control).not.toContain("/control/begin");
    expect((await snapshotPilotCohort(f.recovery)).applicationStatements).toBe(2);
  });
  it("quarantines a lost initial SET response without a retry, finite server-window claim, or follow-up SQL", async () => {
    const f = await fixture();
    const original = f.io.openDirect;
    f.io.openDirect = async (p, c) => {
      const client = await original(p, c);
      return {
        ...client,
        query: async (sql, params) => {
          if (sql === OWNER_SESSION_SET_SQL) {
            f.directSQL.push(sql);
            throw Error("synthetic lost SET response");
          }
          return client.query(sql, params);
        },
      };
    };
    const create = vi.spyOn(f.io, "createResources");
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(f.directSQL).toEqual([SCOPED_VERIFY_SQL, OWNER_SESSION_SET_SQL]);
    expect(create).not.toHaveBeenCalled();
    const retired = await snapshotPilotCohort(f.direct);
    expect(retired.custody?.retired).toBe(true);
    expect(retired.applicationStatements).toBe(2);
    expect(retired.phases["owner-record-and-lower"].statements[0]).toMatchObject({
      outcome: "authorized-unknown",
      serverTimeoutMs: 0,
      clientOnlyInitialSET: true,
    });
    expect(
      (state.terminalHandoff as { snapshot: { recoveryReady: unknown } }).snapshot.recoveryReady,
    ).toMatchObject({ clientOnlyBootstrapUnresolved: true });
    expect(state.terminalRecoveryFailed).toBe(true);
    expect(f.recovery.data.has(PILOT_COHORT_KEY)).toBe(false);
  });
  it("uses no startup options and closes the same dedicated attempt after the counted SET/readback/later command", async () => {
    const sql: string[] = [],
      retained: unknown[] = [];
    const close = vi.fn(async () => {}),
      abort = vi.fn();
    let opens = 0;
    await runDedicatedOwnerAttempt({
      open: async () => {
        opens++;
        return {
          query: async (s) => {
            sql.push(s);
            return {
              rows:
                s === OWNER_SESSION_READBACK_SQL
                  ? [{ setting: "2000", unit: "ms", source: "session" }]
                  : [],
            };
          },
          end: close,
          abort,
        };
      },
      dispatch: async (s, p, send) => send(s, p),
      retainRawReadback: async (r) => {
        retained.push(r.rows);
      },
      commands: [{ sql: SCOPED_OWNER_RECORD_SQL }],
    });
    expect(sql).toEqual([
      OWNER_SESSION_SET_SQL,
      OWNER_SESSION_READBACK_SQL,
      SCOPED_OWNER_RECORD_SQL,
    ]);
    expect(opens).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
    expect(retained).toHaveLength(1);
    expect(sessionDirectClientConfiguration()).not.toHaveProperty("statement_timeout");
    expect(sessionDirectClientConfiguration()).not.toHaveProperty("options");
  });
  it("aborts a late acquisition and prevents a post-deadline SET on the late dedicated client", async () => {
    const query = vi.fn(async () => ({ rows: [] })),
      abort = vi.fn(),
      end = vi.fn(async () => {});
    await expect(
      runDedicatedOwnerAttempt({
        open: async () => {
          await new Promise((r) => setTimeout(r, 30));
          return { query, abort, end };
        },
        dispatch: async (s, p, send) => send(s, p),
        retainRawReadback: async () => {},
        commands: [],
        deadlineMs: 5,
      }),
    ).rejects.toThrow("deadline");
    await new Promise((r) => setTimeout(r, 40));
    expect(query).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it("does not run later SQL after a delayed readback crosses the client-only operation deadline", async () => {
    const sql: string[] = [],
      abort = vi.fn(),
      end = vi.fn(async () => {});
    await expect(
      runDedicatedOwnerAttempt({
        open: async () => ({
          query: async (s) => {
            sql.push(s);
            if (s === OWNER_SESSION_READBACK_SQL) {
              await new Promise((r) => setTimeout(r, 30));
              return { rows: [{ setting: "2000", unit: "ms", source: "session" }] };
            }
            return { rows: [] };
          },
          abort,
          end,
        }),
        dispatch: async (s, p, send) => send(s, p),
        retainRawReadback: async () => {},
        commands: [{ sql: SCOPED_OWNER_RECORD_SQL }],
        deadlineMs: 5,
      }),
    ).rejects.toThrow("deadline");
    await new Promise((r) => setTimeout(r, 40));
    expect(sql).toEqual([OWNER_SESSION_SET_SQL, OWNER_SESSION_READBACK_SQL]);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it("reserves61 commands,3 POSTs and13 connections with two client-only SET windows; refuses unapproved remote scope and unproved prerequisites", () => {
    const r = scopedAdmissionCheckpoint(proofs, "LOCAL_SIMULATION_ONLY");
    expect(r).toMatchObject({
      commands: 61,
      POSTs: 3,
      connections: 13,
      CUHoursAtLeast: 1439 / 3600,
      plannedControlWallMs: 35000,
      plannedComputeCeiling: 0.45,
      totalComputeCeiling: 0.5,
      setupContingencyMs: 180000,
    });
    expect(() =>
      scopedAdmissionCheckpoint({ ...proofs, ownerSessionTwo: false }, "LOCAL_SIMULATION_ONLY"),
    ).toThrow("before credentials");
    expect(() => scopedAdmissionCheckpoint(proofs)).toThrow("unchanged60s");
    expect(
      scopedAdmissionCheckpoint(proofs, "REMOTE_CANDIDATE_TWO_SECONDS_AUTHORIZED_20261006"),
    ).toEqual(r);
    const comparison = sessionPilotScopeComparison();
    expect(comparison.candidateRuntimeTwoSeconds).toMatchObject({
      commands: 61,
      workCommands: 49,
      cleanupCommands: 12,
      serverExecutionMs: 234000,
      clientOnlyBootstrapCommands: 2,
      clientOnlyBootstrapMs: 30000,
      acquisitionMs: 195000,
      activeMsAtLeast: 539000,
      admitted: true,
    });
    expect(comparison.unchangedRuntimeSixtySeconds).toMatchObject({
      commands: 60,
      serverExecutionMs: 3248000,
      activeMsAtLeast: 3553000,
      CUHoursAtLeast: 4453 / 3600,
      admitted: false,
    });
    expect(comparison.currentRemoteAdmission).toBe(false);
  });
  it("runs the actual entrypoints through safeguards, shared sequential/concurrent diagnostics, three producer guards and same-ledger scoped restoration", async () => {
    const f = await fixture();
    const state = await executeScopedPilot(f.io);
    expect(
      state.pilotPassed,
      JSON.stringify({
        error: state.error,
        POSTs: state.POSTs,
        responses: state.responses,
        recoveryFailed: state.terminalRecoveryFailed,
        restoration: state.restoration,
        receipts: f.receipts.slice(-2),
        controls: f.control.slice(-4),
      }),
    ).toBe(true);
    expect(state.POSTs).toBe(3);
    expect(state.restoration).toMatchObject({
      restoreAcknowledged: true,
      verified: true,
      blindRetries: 0,
    });
    expect(f.directSQL).toEqual([
      SCOPED_VERIFY_SQL,
      OWNER_SESSION_SET_SQL,
      OWNER_SESSION_READBACK_SQL,
      SCOPED_OWNER_RECORD_SQL,
      SCOPED_LOWER_SQL,
      SCOPED_VERIFY_SQL,
      SCOPED_PUBLICATION_SQL,
      OWNER_SESSION_SET_SQL,
      OWNER_SESSION_READBACK_SQL,
      SCOPED_RESTORE_SQL,
      SCOPED_VERIFY_SQL,
    ]);
    expect(f.configurations.map((c) => c.statement_timeout)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(f.configurations.every((c) => c.options === undefined)).toBe(true);
    expect(db.sql.filter((s) => s === COMPARABLE_RESULT_PREFLIGHT_SQL)).toHaveLength(3);
    expect(db.sql.some((s) => /^(SET|ALTER|UPDATE|INSERT|DELETE)\b/.test(s))).toBe(false);
    const ledger = await snapshotPilotCohort(f.recovery);
    expect(ledger.custody).toEqual({ owner: "direct-recovery", generation: 2, retired: false });
    expect(ledger.comparablePOSTs).toBe(3);
    expect(ledger.applicationStatements).toBe(f.directSQL.length + db.sql.length);
    const retired = await snapshotPilotCohort(f.direct);
    expect(ledger.startedAtMs).toBe(retired.startedAtMs);
    expect(retired.custody?.retired).toBe(true);
    expect(f.control).toContain("/control/retire");
    expect(f.receipts.some((r) => r.status === 409 && r.refusedStatementId === "diagB:s2")).toBe(
      true,
    );
    const before = db.sql.length;
    await expect(
      f.counter.call("comparables", "authorizeStatement", {
        requestId: "command91",
        localSequence: 91,
        label: "refused91",
        purpose: "work",
        sqlSHA256: "0".repeat(64),
      }),
    ).rejects.toThrow();
    expect(db.sql).toHaveLength(before);
    expect(ledger.applicationStatements).toBeLessThanOrEqual(61);
    const initialSETs = Object.values(ledger.phases)
      .flatMap((phase) => phase.statements)
      .filter((s) => s.clientOnlyInitialSET);
    expect(initialSETs).toHaveLength(2);
    expect(initialSETs.every((s) => s.serverTimeoutMs === 0)).toBe(true);
  });
  it("fails closed before comparable row queries when the actual Worker producer certificate fails, then restores and keeps the charged ledger", async () => {
    const f = await fixture();
    db.proof = false;
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(state.POSTs).toBe(1);
    expect(state.restoration).toMatchObject({ safeRestoredState: true });
    expect(db.sql).toContain(COMPARABLE_RESULT_PREFLIGHT_SQL);
    expect(db.sql.some((s) => s.startsWith("SELECT id, month"))).toBe(false);
    expect((await snapshotPilotCohort(f.recovery)).comparablePOSTs).toBe(1);
  });
  it("restores after a failed resource setup before any Worker import, using the original owned ledger", async () => {
    const f = await fixture();
    f.io.createResources = async () => {
      throw Error("synthetic ambiguous setup");
    };
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(state.restoration).toMatchObject({ safeRestoredState: true });
    expect(f.control).not.toContain("/control/begin");
    const ledger = await snapshotPilotCohort(f.recovery);
    expect(ledger.setupIntervals.find((interval) => interval.ambiguous)?.ambiguous).toBe(true);
    expect(ledger.applicationStatements).toBe(11);
  });
  it.each([404, 403, 307])(
    "refuses readiness HTTP %i before retiring the direct ledger and restores after deletion",
    async (status) => {
      const f = await fixture();
      const original = f.io.worker;
      f.io.worker = async (method, path, ...rest) =>
        path === "/control/ready" ? { status, data: {} } : original(method, path, ...rest);
      const state = await executeScopedPilot(f.io);
      expect(state.pilotPassed).toBe(false);
      expect(state.restoration).toMatchObject({ safeRestoredState: true });
      expect(f.control).not.toContain("/control/begin");
      expect(f.control).not.toContain("/control/retire");
      expect(state.workerHandoff).toBeUndefined();
      expect((await snapshotPilotCohort(f.recovery)).applicationStatements).toBe(11);
    },
  );
  it("refuses mismatched deployed readiness identity before importing custody", async () => {
    const f = await fixture();
    const original = f.io.worker;
    f.io.worker = async (method, path, ...rest) =>
      path === "/control/ready"
        ? {
            status: 200,
            data: { ready: true, protocol: "hdb-pilot-control-v1", sessionId: "different-session" },
          }
        : original(method, path, ...rest);
    const state = await executeScopedPilot(f.io);
    expect(state.workerHandoff).toBeUndefined();
    expect(state.restoration).toMatchObject({ safeRestoredState: true });
  });
  it("reserves readiness as planned work without charging its elapsed time to contingency", async () => {
    const f = await fixture();
    let clock = Date.now();
    f.io.now = () => clock;
    const original = f.io.worker;
    f.io.worker = async (method, path, ...rest) => {
      if (path === "/control/ready") {
        clock += 10000;
        return { status: 404, data: {} };
      }
      return original(method, path, ...rest);
    };
    const cleanup = f.io.cleanupResources;
    f.io.cleanupResources = async () => ({ ...(await cleanup()), observedAtMs: clock });
    const state = await executeScopedPilot(f.io);
    expect(state.controlReady).toMatchObject({
      classification: "planned-work",
      reservedWallMs: 35000,
      actualWallMs: 10000,
      chargedToContingency: false,
    });
    expect(state.reservation).toMatchObject({
      CUHoursAtLeast: 1439 / 3600,
      plannedComputeCeiling: 0.45,
      setupContingencyMs: 180000,
    });
    expect((await snapshotPilotCohort(f.recovery)).contingencySpentMs).toBe(0);
    expect(state.restoration).toMatchObject({ safeRestoredState: true });
    expect(f.control).not.toContain("/control/begin");
  });
  it("never lowers on an owner session/catalog proof mismatch", async () => {
    const f = await fixture();
    const original = f.io.openDirect;
    f.io.openDirect = async (p, c) => {
      const client = await original(p, c);
      return {
        ...client,
        query: async (sql, params) => {
          const result = await client.query(sql, params);
          if (sql === SCOPED_OWNER_RECORD_SQL) result.rows[0].owner_timeout = "0";
          return result;
        },
      };
    };
    const state = await executeScopedPilot(f.io);
    expect(f.directSQL).not.toContain(SCOPED_LOWER_SQL);
    expect(f.directSQL).not.toContain(SCOPED_RESTORE_SQL);
    expect(state.restoration).toMatchObject({ restorationRequired: false });
    expect(state.ownerObserved).toMatchObject({
      owner_timeout: "0",
      owner_timeout_source: "session",
    });
    expect(state.ownerFailedChecks).toEqual(["owner_timeout"]);
  });
  it("keeps exhausted setup charged, stops ordinary work, and uses only reserved mandatory recovery", async () => {
    const f = await fixture();
    let offset = 0;
    f.io.now = () => Date.now() + offset;
    f.io.createResources = async () => {
      offset = 181000;
    };
    const cleanup = f.io.cleanupResources;
    f.io.cleanupResources = async () => ({ ...(await cleanup()), observedAtMs: f.io.now() });
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(state.setupContingencyInvalidated).toBe(true);
    expect(f.control).not.toContain("/control/begin");
    expect(state.restoration).toMatchObject({
      safeRestoredState: true,
      verified: true,
      blindRetries: 0,
    });
    const ledger = await snapshotPilotCohort(f.recovery);
    expect(ledger.contingencySpentMs).toBeGreaterThanOrEqual(181000);
    expect(ledger.applicationStatements).toBe(11);
    expect(ledger.stopped).toBe(true);
  });
  it("refuses a reset/different plan at the actual Durable Object import before any query", async () => {
    const f = await fixture();
    await initializePilotCohort(
      f.direct,
      SESSION_ID,
      Date.now(),
      scopedPilotPlan(true, true),
      "direct-setup",
    );
    const h = await retirePilotLedger(f.direct, "direct-setup", "worker", Date.now(), false);
    await f.counter.begin(SESSION_ID, h);
    await expect(f.counter.begin(SESSION_ID, h)).rejects.toThrow();
    const changed = structuredClone(h);
    changed.snapshot.plan.phases[0].commands = 3;
    await expect(f.counter.begin(SESSION_ID, changed)).rejects.toThrow("Exact scoped");
    expect(db.sql).toHaveLength(0);
  });
  it("refuses cleanup resource uncertainty instead of fabricating an absence certificate or resetting recovery", async () => {
    const f = await fixture();
    f.io.cleanupResources = async () => {
      throw Error("absence unavailable");
    };
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(false);
    expect(state.resourceAbsenceUnproved).toBe(true);
    expect(f.directSQL).not.toContain(SCOPED_RESTORE_SQL);
    expect(f.recovery.data.has(PILOT_COHORT_KEY)).toBe(false);
  });
  it("retrieves the already-fenced handoff after a lost retirement response without repeating the mutation", async () => {
    const f = await fixture();
    const worker = f.io.worker;
    let retireAttempts = 0;
    f.io.worker = async (...args) => {
      const response = await worker(...args);
      if (args[1] === "/control/retire") {
        retireAttempts++;
        throw Error("synthetic accepted retirement response lost");
      }
      return response;
    };
    const state = await executeScopedPilot(f.io);
    expect(state.pilotPassed).toBe(true);
    expect(retireAttempts).toBe(1);
    expect(f.control).toContain("/control/retired-handoff");
    expect(f.directSQL.filter((s) => s === SCOPED_RESTORE_SQL)).toHaveLength(1);
    expect(state.restoration).toMatchObject({ verified: true, blindRetries: 0 });
  });
  it("persists the actual file ledger across executor objects and refuses a fresh cohort reset", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hdb-scoped-custody-"));
    try {
      const path = join(directory, "cohort.json");
      const first = new FileCohortStorage(path);
      await initializePilotCohort(
        first,
        SESSION_ID,
        Date.now(),
        scopedPilotPlan(true, true),
        "direct-setup",
      );
      const second = new FileCohortStorage(path);
      expect(await snapshotPilotCohort(second)).toEqual(await snapshotPilotCohort(first));
      await expect(
        initializePilotCohort(
          second,
          SESSION_ID,
          Date.now(),
          scopedPilotPlan(true, true),
          "direct-setup",
        ),
      ).rejects.toThrow();
      expect((await snapshotPilotCohort(first)).applicationStatements).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("keeps the existing verify-full TLS credential policy while selecting only the authorized candidate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hdb-scoped-uri-"));
    try {
      const path = join(directory, "synthetic.txt");
      const uri =
        "postgresql://hdb_benchmark_runtime:synthetic@ep-steep-moon-b35xjj4d.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require";
      await writeFile(path, uri, { mode: 0o600 });
      const selected = new URL(existingCandidateURI(path, "hdb_benchmark_runtime"));
      expect(selected.hostname).toBe("ep-steep-water-b300tebo.c-4.ap-southeast-1.aws.neon.tech");
      expect(selected.searchParams.get("sslmode")).toBe("verify-full");
      await writeFile(path, uri.replace("verify-full", "disable"));
      expect(() => existingCandidateURI(path, "hdb_benchmark_runtime")).toThrow("source drift");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
