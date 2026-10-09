// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AtomicPilotAuthority, PILOT_LIMITS } from "../../scripts/neon-benchmark/pilot/accounting";
import {
  createStatementDispatcher,
  fingerprintSQL,
} from "../../scripts/neon-benchmark/pilot/dispatch";
import { FilePilotStore } from "../../scripts/neon-benchmark/pilot/node-store";

import { SerialTestStore, admission, authorityFixture } from "../fixtures/neon-pilot";

describe("prospective application SQL authority", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });
  it("authorizes exactly 90 and refuses statement 91 before driver dispatch", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(
      admission("cleanup", { purpose: "cleanup", maximumStatements: 90 }),
    );
    await authority.activateRequest("cleanup");
    const dispatch = createStatementDispatcher({
      authority,
      requestId: "cleanup",
      defaultPurpose: "cleanup",
    });
    const send = vi.fn(async () => ({ rows: [] }));
    for (let index = 0; index < 90; index++) await dispatch("SELECT 1", [], send);
    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).toHaveBeenCalledTimes(90);
    const state = await authority.snapshot();
    expect(state.applicationStatements).toBe(90);
    expect(state.statements.map((record) => record.applicationSequence)).toEqual(
      Array.from({ length: 90 }, (_, i) => i + 1),
    );
  });
  it("serializes independent authorities over the same store without overspending", async () => {
    const { authority, store } = await authorityFixture();
    const second = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
    await authority.admitRequest(
      admission("cleanup", { purpose: "cleanup", maximumStatements: 90 }),
    );
    await authority.activateRequest("cleanup");
    const outcomes = await Promise.allSettled(
      Array.from({ length: 100 }, (_, i) =>
        (i % 2 ? second : authority).authorizeStatement({
          requestId: "cleanup",
          localSequence: i + 1,
          label: "diagnostic",
          sqlSHA256: fingerprintSQL("SELECT 1"),
          purpose: "cleanup",
        }),
      ),
    );
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(90);
    expect((await authority.snapshot()).applicationStatements).toBe(90);
  });
  it("durably commits attribution before sending, preserves rows and parameter values", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    const dispatch = createStatementDispatcher({ authority, requestId: "request1" });
    const parameters = ["legitimate; parameter", 134];
    const result = { rows: [{ id: 1 }, { id: 2 }] };
    const received = await dispatch("SELECT $1, $2", parameters, async (sql, values) => {
      const state = await authority.snapshot();
      expect(state.applicationStatements).toBe(1);
      expect(state.statements[0].outcome).toBe("authorized-unknown");
      expect(state.statements[0].id).toBe("request1:s1");
      expect(sql).toBe("SELECT $1, $2");
      expect(values).toBe(parameters);
      return result;
    });
    expect(received).toBe(result);
    expect((await authority.snapshot()).statements[0].outcome).toBe("succeeded");
  });
  it("counts BEGIN, SET, failed SQL, ROLLBACK, diagnostic SELECT and COMMIT", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    const dispatch = createStatementDispatcher({ authority, requestId: "request1" });
    const send = vi.fn(async (sql: string) => {
      if (sql === "SELECT broken") throw Object.assign(Error("secret password"), { code: "57014" });
      return { rows: [] };
    });
    for (const sql of [
      "BEGIN READ ONLY",
      "SET application_name='pilot'",
      "SELECT broken",
      "ROLLBACK",
      "SELECT 1",
      "COMMIT",
    ])
      await dispatch(sql, [], send).catch(() => undefined);
    const state = await authority.snapshot();
    expect(state.applicationStatements).toBe(6);
    expect(state.statements[2]).toMatchObject({ outcome: "failed", sqlstate: "57014" });
    expect(JSON.stringify(state)).not.toContain("secret password");
  });
  it("rejects multiple SQL statements and unsupported text before dispatch", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    const dispatch = createStatementDispatcher({ authority, requestId: "request1" });
    const send = vi.fn();
    for (const sql of ["SELECT 1; SELECT 2", "", "SELECT '\0'"])
      await expect(dispatch(sql, [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await authority.snapshot()).applicationStatements).toBe(0);
  });
  it("provider counters neither inflate/refund application accounting nor affect admission", async () => {
    const { authority } = await authorityFixture();
    await authority.observeServer({
      phase: "before",
      observedAtUTC: "synthetic",
      role: "hdb_benchmark_runtime",
      databaseId: null,
      calls: 999_999_999,
      sqlMs: 83,
      completeAttemptAccounting: false,
    });
    await authority.observeServer({
      phase: "after",
      observedAtUTC: "synthetic",
      role: "hdb_benchmark_runtime",
      databaseId: null,
      calls: null,
      sqlMs: null,
      completeAttemptAccounting: false,
    });
    expect((await authority.snapshot()).applicationStatements).toBe(0);
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    await createStatementDispatcher({ authority, requestId: "request1" })(
      "SELECT 1",
      [],
      async () => [],
    );
    expect((await authority.snapshot()).applicationStatements).toBe(1);
  });
  it("refuses replay across authority instances and duplicate statement IDs", async () => {
    const { authority, store } = await authorityFixture();
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    const second = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
    await expect(second.activateRequest("request1")).rejects.toThrow("replayed");
    const intent = {
      requestId: "request1",
      localSequence: 1,
      label: "query",
      sqlSHA256: fingerprintSQL("SELECT 1"),
      purpose: "work" as const,
    };
    await authority.authorizeStatement(intent);
    await expect(second.authorizeStatement(intent)).rejects.toThrow("before dispatch");
    expect((await authority.snapshot()).applicationStatements).toBe(1);
  });
  it("preserves cleanup allowance and stops before work command 81", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission("all", { maximumStatements: 80 }));
    await authority.activateRequest("all");
    const dispatch = createStatementDispatcher({ authority, requestId: "all" });
    const send = vi.fn(async () => []);
    for (let i = 0; i < 80; i++) await dispatch("SELECT 1", [], send);
    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("AUTHORIZATION");
    await authority.finishRequest("all", "failed-unknown");
    await authority.admitRequest(
      admission("cleanup", {
        sequence: 2,
        purpose: "cleanup",
        maximumStatements: 10,
        method: "GET",
      }),
    );
    await authority.activateRequest("cleanup");
    const cleanup = createStatementDispatcher({
      authority,
      requestId: "cleanup",
      defaultPurpose: "cleanup",
    });
    for (let i = 0; i < 10; i++) await cleanup("ROLLBACK", [], send);
    expect(send).toHaveBeenCalledTimes(90);
  });
  it("does not refund unknown transfer/connection reservations or clear failed outcomes", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    await authority.finishRequest("request1", "failed-unknown");
    await authority.finishRequest("request1", "complete");
    const state = await authority.snapshot();
    expect(state.requests[0].outcome).toBe("failed-unknown");
    expect(state.receivedDatabaseBytesReserved).toBe(2_000_000);
    expect(state.connectionAdmissions).toBe(1);
    await expect(authority.admitRequest(admission("another", { sequence: 2 }))).rejects.toThrow(
      "stopped",
    );
  });
  it("enforces one outstanding request, three POSTs, byte and connection reservations", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(admission());
    await expect(authority.admitRequest(admission("parallel", { sequence: 2 }))).rejects.toThrow(
      "admission",
    );
    await authority.finishRequest("request1", "complete");
    for (let i = 2; i <= 3; i++) {
      const id = `request${i}`;
      await authority.admitRequest(admission(id, { sequence: i }));
      await authority.finishRequest(id, "complete");
    }
    await expect(authority.admitRequest(admission("request4", { sequence: 4 }))).rejects.toThrow(
      "admission",
    );
    const next = await authorityFixture();
    await expect(
      next.authority.admitRequest(admission("large", { maximumReceivedDatabaseBytes: 25_000_001 })),
    ).rejects.toThrow("admission");
    expect(PILOT_LIMITS.computeCUHoursProxy).toBe(0.35);
  });
  it("enforces duration with a protected cleanup interval", async () => {
    let now = 0;
    const authority = new AtomicPilotAuthority(new SerialTestStore(), "timed", () => now);
    await authority.initialize();
    now = 180_001;
    await expect(authority.admitRequest(admission())).rejects.toThrow("duration");
    await expect(
      authority.admitRequest(admission("cleanup", { purpose: "cleanup" })),
    ).rejects.toThrow("duration");
    now = 180_000;
    await authority.admitRequest(admission("cleanup", { purpose: "cleanup" }));
    await authority.activateRequest("cleanup");
    now = 300_000;
    await expect(
      authority.authorizeStatement({
        requestId: "cleanup",
        localSequence: 1,
        label: "query",
        purpose: "cleanup",
        sqlSHA256: fingerprintSQL("ROLLBACK"),
      }),
    ).rejects.toThrow("duration");
  });
  it("commits file-backed permits across instances and does not reset persisted evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hdb-pilot-"));
    directories.push(directory);
    const path = join(directory, "state.json");
    const first = new AtomicPilotAuthority(new FilePilotStore(path), "durable", () => 1000);
    await first.initialize();
    await first.admitRequest(admission());
    await first.activateRequest("request1");
    const second = new AtomicPilotAuthority(new FilePilotStore(path), "durable", () => 1000);
    const dispatch = createStatementDispatcher({ authority: second, requestId: "request1" });
    await dispatch("SELECT 1", [], async () => {
      expect(JSON.parse(await readFile(path, "utf8")).applicationStatements).toBe(1);
      return [];
    });
    await expect(first.initialize()).rejects.toThrow("cannot be reset");
    expect((await second.snapshot()).applicationStatements).toBe(1);
    await writeFile(`${path}.next`, "retained crash evidence");
    await expect(first.snapshot()).rejects.toThrow();
    expect(await readFile(`${path}.next`, "utf8")).toBe("retained crash evidence");
  });
});
