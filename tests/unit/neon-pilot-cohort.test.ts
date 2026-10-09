// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import {
  AtomicPilotAuthority,
  serverWindowReservation,
} from "../../scripts/neon-benchmark/pilot/accounting";
import {
  cohortPilotStore,
  enterPilotPhase,
  initializePilotCohort,
  snapshotPilotCohort,
} from "../../scripts/neon-benchmark/pilot/cohort-store";
import {
  createStatementDispatcher,
  fingerprintSQL,
} from "../../scripts/neon-benchmark/pilot/dispatch";
import {
  COMPARABLE_WHOLE_PILOT_PLAN,
  evaluateWholePilotPlan,
  requireWholePilotAdmission,
  type PilotPhaseBudget,
  type WholePilotPlan,
} from "../../scripts/neon-benchmark/pilot/plan";
import type { TransactionStorage } from "../../scripts/neon-benchmark/pilot/transactional-store";
import { admission, authorityFixture, SerialTestStore } from "../fixtures/neon-pilot";

class SerialTransactions implements TransactionStorage {
  private values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  transaction<T>(action: Parameters<TransactionStorage["transaction"]>[0]): Promise<T> {
    const pending = this.tail.then(async () => {
      const draft = structuredClone(this.values);
      const result = await action({
        get: async <V>(key: string) => structuredClone(draft.get(key)) as V | undefined,
        put: async (key, value) => {
          draft.set(key, structuredClone(value));
        },
      });
      this.values = draft;
      return result as T;
    });
    this.tail = pending.catch(() => undefined);
    return pending;
  }
}

/** Test-only bounded fake driver; this is NOT evidence of a tighter remote role timeout. */
const phase = (
  id: string,
  commands: number,
  changes: Partial<PilotPhaseBudget> = {},
): PilotPhaseBudget => ({
  id,
  commands,
  purpose: "work",
  POSTs: 0,
  connections: 1,
  expectedResultMessageBytes: 100,
  receivedSocketReservation: 100,
  sentSocketReservation: 100,
  serverTimeoutMs: 1000,
  serverTimeoutEnforced: true,
  ...changes,
});
const plan = (phases: PilotPhaseBudget[]): WholePilotPlan => ({
  phases,
  setupActiveMs: 0,
  setupBoundEnforced: true,
});
const cleanup = () => phase("cleanup", 10, { purpose: "cleanup" });
async function cohortFixture(phases: PilotPhaseBudget[]) {
  const storage = new SerialTransactions();
  await initializePilotCohort(storage, "whole-run", 1000, plan(phases));
  const enter = async (id: string) => {
    await enterPilotPhase(storage, id, 1000);
    const authority = new AtomicPilotAuthority(cohortPilotStore(storage, id), id, () => 1000);
    await authority.initialize();
    return authority;
  };
  return { storage, enter };
}
const request = (id: string, commands: number, changes = {}) =>
  admission(id, {
    method: "GET",
    maximumStatements: commands,
    maximumReceivedDatabaseBytes: 1,
    maximumSentDatabaseBytes: 1,
    ...changes,
  });

describe("one whole-pilot reservation and durable phase ledger", () => {
  it("refuses the entire 51-command current role plan before provisioning or creating a ledger", async () => {
    const model = evaluateWholePilotPlan(COMPARABLE_WHOLE_PILOT_PLAN);
    expect(model).toMatchObject({
      commands: 51,
      POSTs: 3,
      connections: 9,
      serverExecutionMs: 3_060_000,
      acquisitionMs: 135_000,
      activeMsAtLeast: 3_240_000,
      CUHoursAtLeast: 1.15,
      admitted: false,
    });
    expect(model.failures).toEqual(
      expect.arrayContaining([
        "whole-plan active wall",
        "whole-plan compute",
        "setup bound unproved",
      ]),
    );
    const provision = vi.fn();
    const attempt = () => {
      requireWholePilotAdmission(COMPARABLE_WHOLE_PILOT_PLAN);
      provision();
    };
    expect(attempt).toThrow("before provisioning");
    expect(provision).not.toHaveBeenCalled();
    const storage = new SerialTransactions();
    await expect(
      initializePilotCohort(storage, "whole-run", 1000, COMPARABLE_WHOLE_PILOT_PLAN),
    ).rejects.toThrow("compute");
    await expect(snapshotPilotCohort(storage)).rejects.toThrow("unavailable");
  });
  it("refuses unproved shorter server/setup bounds and a missing cleanup reserve", () => {
    const bounded = plan([phase("work", 80), cleanup()]);
    expect(evaluateWholePilotPlan(bounded).admitted).toBe(true);
    expect(evaluateWholePilotPlan({ ...bounded, setupBoundEnforced: false }).admitted).toBe(false);
    expect(
      evaluateWholePilotPlan(plan([phase("work", 80, { serverTimeoutEnforced: false }), cleanup()]))
        .admitted,
    ).toBe(false);
    expect(evaluateWholePilotPlan(plan([phase("work", 1)])).admitted).toBe(false);
    expect(evaluateWholePilotPlan(plan([phase("p", 1, { POSTs: 4 }), cleanup()])).admitted).toBe(
      false,
    );
  });
  it("keeps tiny diagnostic IDs nested in the overall ledger across independent authorities", async () => {
    const { storage, enter } = await cohortFixture([
      phase("tiny", 3, { connections: 2 }),
      phase("race", 1),
      phase("product", 2),
      cleanup(),
    ]);
    const tiny = await enter("tiny");
    const second = new AtomicPilotAuthority(cohortPilotStore(storage, "tiny"), "tiny", () => 1000);
    const send = vi.fn(async () => []);
    await tiny.admitRequest(request("A", 2));
    await tiny.activateRequest("A");
    const dispatchA = createStatementDispatcher({ authority: tiny, requestId: "A" });
    await dispatchA("SELECT 1", [], send);
    await dispatchA("SELECT 2", [], send);
    await tiny.finishRequest("A", "complete");
    await second.admitRequest(request("B", 1, { sequence: 2 }));
    await second.activateRequest("B");
    const dispatchB = createStatementDispatcher({ authority: second, requestId: "B" });
    await dispatchB("SELECT 1", [], send);
    await expect(dispatchB("SELECT 2", [], send)).rejects.toThrow("AUTHORIZATION");
    await second.finishRequest("B", "complete");
    const race = await enter("race");
    await race.admitRequest(request("C", 1));
    await race.activateRequest("C");
    const dispatchC = createStatementDispatcher({ authority: race, requestId: "C" });
    const competing = await Promise.allSettled([
      dispatchC("SELECT 1", [], send),
      dispatchC("SELECT 2", [], send),
    ]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const cohort = await snapshotPilotCohort(storage);
    expect(cohort.applicationStatements).toBe(4);
    expect(cohort.statements.map((s) => s.id)).toEqual([
      "tiny:A:s1",
      "tiny:A:s2",
      "tiny:B:s1",
      "race:C:s1",
    ]);
    expect(cohort.statements.map((s) => s.applicationSequence)).toEqual([1, 2, 3, 4]);
    expect(cohort.phases.tiny.statements.map((s) => s.id)).toEqual(["A:s1", "A:s2", "B:s1"]);
    await expect(enterPilotPhase(storage, "tiny", 1000)).rejects.toThrow("before entry");
    await expect(initializePilotCohort(storage, "new-ID", 1000, cohort.plan)).rejects.toThrow(
      "cannot reset",
    );
    await expect(
      new AtomicPilotAuthority(cohortPilotStore(storage, "unplanned"), "unplanned").initialize(),
    ).rejects.toThrow("Unreserved");
  });
  it("cannot bypass the last-ten reserve, phase totals or command 91 through cleanup/new IDs", async () => {
    const { storage, enter } = await cohortFixture([phase("work", 80), cleanup()]);
    const work = await enter("work");
    await work.admitRequest(request("W", 80));
    await work.activateRequest("W");
    const send = vi.fn(async () => {
      expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(
        send.mock.calls.length,
      );
      return [];
    });
    const dispatch = createStatementDispatcher({ authority: work, requestId: "W" });
    for (let i = 0; i < 80; i++) await dispatch("SELECT 1", [], send);
    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("AUTHORIZATION");
    await work.finishRequest("W", "complete");
    const final = await enter("cleanup");
    await final.admitRequest(request("Z", 10, { purpose: "cleanup" }));
    await final.activateRequest("Z");
    const close = createStatementDispatcher({
      authority: final,
      requestId: "Z",
      defaultPurpose: "cleanup",
    });
    for (let i = 0; i < 10; i++) await close("ROLLBACK", [], send);
    await expect(close("ROLLBACK", [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).toHaveBeenCalledTimes(90);
    expect((await snapshotPilotCohort(storage)).statements.at(-1)?.applicationSequence).toBe(90);
    await final.finishRequest("Z", "complete");
    await expect(
      final.admitRequest(request("fresh-cleanup", 1, { purpose: "cleanup", sequence: 2 })),
    ).rejects.toThrow();
    await expect(enterPilotPhase(storage, "fresh-cleanup", 1000)).rejects.toThrow();
  });
  it("reserves phase worst cases upfront and shares concurrency, POST and unknown outcome budgets", async () => {
    const { storage, enter } = await cohortFixture([
      phase("p1", 2, { POSTs: 1 }),
      phase("p2", 1, { POSTs: 1 }),
      cleanup(),
    ]);
    const a = await enter("p1"),
      b = await enter("p2");
    await a.admitRequest(request("A", 2, { method: "POST" }));
    await expect(b.admitRequest(request("B", 1, { method: "POST" }))).rejects.toThrow(
      "reservation",
    );
    await a.activateRequest("A");
    await expect(
      createStatementDispatcher({ authority: a, requestId: "A" })("SELECT 1", [], async () => {
        throw Error("ambiguous accepted response");
      }),
    ).rejects.toThrow("DATABASE");
    await a.finishRequest("A", "failed-unknown");
    await a.finishRequest("A", "complete");
    await expect(b.admitRequest(request("B", 1, { method: "POST" }))).rejects.toThrow("stopped");
    const cohort = await snapshotPilotCohort(storage);
    expect(cohort.applicationStatements).toBe(1);
    expect(cohort.phases.p1.requests[0]).toMatchObject({
      maximumStatements: 2,
      outcome: "failed-unknown",
    });
    expect(cohort.plan.phases.reduce((n, p) => n + p.commands, 0)).toBe(13);
    expect(cohort.phases.p1.receivedDatabaseBytesReserved).toBe(1);
    const final = await enter("cleanup");
    await final.admitRequest(request("Z", 10, { purpose: "cleanup" }));
    expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(1);
    await expect(
      new AtomicPilotAuthority(cohortPilotStore(storage, "p1"), "p1", () => 1000).initialize(),
    ).rejects.toThrow("cannot be reset");
  });
  it("charges all observations/results and cannot refund via provider counts or phase replay", async () => {
    const { storage, enter } = await cohortFixture([phase("observations", 1), cleanup()]);
    const a = await enter("observations");
    await a.observeServer({
      phase: "provider",
      observedAtUTC: "synthetic",
      role: "hdb_benchmark_runtime",
      databaseId: null,
      calls: 999999,
      sqlMs: 0,
      completeAttemptAccounting: false,
    });
    expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(0);
    await a.admitRequest(request("observe", 1));
    await a.activateRequest("observe");
    await createStatementDispatcher({ authority: a, requestId: "observe" })(
      "SELECT 1",
      [],
      async () => [],
    );
    await a.finishRequest("observe", "complete");
    await expect(a.admitRequest(request("again", 1, { sequence: 2 }))).rejects.toThrow(
      "reservation",
    );
    expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(1);
  });
  it("keeps unresolved permits charged/stopped across phases and refuses a cleanup connection", async () => {
    const { storage, enter } = await cohortFixture([phase("a", 1), phase("b", 1), cleanup()]);
    const a = await enter("a"),
      b = await enter("b");
    await a.admitRequest(request("A", 1));
    await a.activateRequest("A");
    await a.authorizeStatement({
      requestId: "A",
      localSequence: 1,
      label: "lost-reply",
      purpose: "work",
      sqlSHA256: fingerprintSQL("SELECT 1"),
    });
    await a.finishRequest("A", "complete");
    expect((await snapshotPilotCohort(storage)).phases.a.requests[0].outcome).toBe(
      "failed-unknown",
    );
    await expect(b.admitRequest(request("B", 1))).rejects.toThrow("stopped");
    const z = await enter("cleanup");
    await expect(z.admitRequest(request("Z", 10, { purpose: "cleanup" }))).rejects.toThrow(
      "Unresolved",
    );
    expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(1);
  });
  it("cannot dispatch an ended phase's cleanup alongside another active phase", async () => {
    const { storage, enter } = await cohortFixture([phase("a", 2), phase("b", 1), cleanup()]);
    const a = await enter("a"),
      b = await enter("b");
    await a.admitRequest(request("A", 2));
    await a.activateRequest("A");
    const send = vi.fn(async () => []);
    const dispatchA = createStatementDispatcher({ authority: a, requestId: "A" });
    await dispatchA("SELECT 1", [], send);
    await a.finishRequest("A", "complete");
    await b.admitRequest(request("B", 1));
    await b.activateRequest("B");
    await expect(dispatchA("ROLLBACK", [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(1);
  });
  it("refuses phase entry when elapsed startup plus all reserved remaining work/tails no longer fit", async () => {
    const storage = new SerialTransactions();
    const bounded = plan([phase("work", 1), cleanup()]);
    await initializePilotCohort(storage, "whole-run", 1000, bounded);
    await expect(enterPilotPhase(storage, "work", 260000)).rejects.toThrow("before entry");
    expect((await snapshotPilotCohort(storage)).enteredPhases).toEqual([]);
  });
  it("rechecks the whole reserved set before a later connection and shrinks the driver grant accordingly", async () => {
    let now = 1000;
    const storage = new SerialTransactions();
    const bounded = plan([phase("work", 80), cleanup()]);
    const reservation = requireWholePilotAdmission(bounded);
    expect(reservation.activeMsAtLeast).toBe(165000);
    await initializePilotCohort(storage, "whole-run", now, bounded);
    await enterPilotPhase(storage, "work", now);
    const authority = new AtomicPilotAuthority(
      cohortPilotStore(storage, "work"),
      "work",
      () => now,
    );
    await authority.initialize();
    now += 135001;
    await expect(authority.admitRequest(request("late", 80))).rejects.toThrow("before connection");
    expect((await snapshotPilotCohort(storage)).connectionAdmissions).toBe(0);
    now = 1000;
    await authority.admitRequest(request("A", 80, { purpose: "cleanup" }));
    await authority.activateRequest("A");
    let tick = 0;
    const send = vi.fn();
    // The shared whole-plan grant expires at 135s, earlier than the next-SQL window's 180s.
    await expect(
      createStatementDispatcher({
        authority,
        requestId: "A",
        defaultPurpose: "cleanup",
        monotonicNow: () => (tick++ ? 135001 : 0),
      })("SELECT 1", [], send),
    ).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await snapshotPilotCohort(storage)).applicationStatements).toBe(1);
  });
});

describe("full server window immediately before driver dispatch", () => {
  it("carries the immutable two-second phase bound through request, permit and delayed grant", async () => {
    let now = 1000;
    const storage = new SerialTransactions();
    const bounded = plan([phase("two-seconds", 1, { serverTimeoutMs: 2000 }), cleanup()]);
    await initializePilotCohort(storage, "bounded-run", now, bounded);
    await enterPilotPhase(storage, "two-seconds", now);
    const authority = new AtomicPilotAuthority(
      cohortPilotStore(storage, "two-seconds"),
      "two-seconds",
      () => now,
    );
    await authority.initialize();
    now = 200000;
    const admitted = await authority.admitRequest(request("A", 1, { maximumWallMs: 10000 }));
    expect(admitted.serverTimeoutMs).toBe(2000);
    await authority.activateRequest("A");
    const send = vi.fn(async () => []);
    await createStatementDispatcher({
      authority,
      requestId: "A",
      beforeDriverSend: async (permit) => {
        expect(permit.serverTimeoutMs).toBe(2000);
        now = 208000;
      },
    })("SELECT 1", [], send);
    expect(send).toHaveBeenCalledOnce();
    expect((await authority.snapshot()).statements[0]).toMatchObject({
      serverTimeoutMs: 2000,
      outcome: "succeeded",
    });
    expect(serverWindowReservation(207000, 2000).fits).toBe(true);
    expect(serverWindowReservation(207000, 60000).fits).toBe(false);
  });
  it("refuses changing the phase bound through another authority or forged request state", async () => {
    const { storage, enter } = await cohortFixture([
      phase("two", 1, { serverTimeoutMs: 2000 }),
      cleanup(),
    ]);
    const authority = await enter("two");
    await expect(
      cohortPilotStore(storage, "two").transact((current) => ({
        next: { ...current!, serverTimeoutMs: 60000 },
        result: undefined,
      })),
    ).rejects.toThrow("Immutable");
    await authority.admitRequest(request("A", 1));
    await expect(
      cohortPilotStore(storage, "two").transact((current) => ({
        next: {
          ...current!,
          requests: current!.requests.map((r) => ({ ...r, serverTimeoutMs: 1000 })),
        },
        result: undefined,
      })),
    ).rejects.toThrow("Corrupt");
    expect((await authority.snapshot()).serverTimeoutMs).toBe(2000);
  });
  it("refuses a driver grant whose timeout differs from its committed permit", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(request("A", 1));
    await authority.activateRequest("A");
    const send = vi.fn();
    const originalGrant = authority.authorizeDriverDispatch.bind(authority);
    vi.spyOn(authority, "authorizeDriverDispatch").mockImplementation(async (id) => ({
      ...(await originalGrant(id)),
      serverTimeoutMs: 2000,
    }));
    await expect(
      createStatementDispatcher({
        authority,
        requestId: "A",
      })("SELECT 1", [], send),
    ).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await authority.snapshot()).statements[0].outcome).toBe("authorized-unknown");
  });
  it("retains sixty seconds for a fresh restored-role verification phase", async () => {
    const { enter } = await cohortFixture([
      phase("ordinary", 1, { serverTimeoutMs: 2000 }),
      phase("cleanup-low", 9, { purpose: "cleanup" }),
      phase("verify-restored", 1, { purpose: "cleanup", serverTimeoutMs: 60000 }),
    ]);
    const authority = await enter("verify-restored");
    await authority.admitRequest(request("Z", 1, { purpose: "cleanup" }));
    await authority.activateRequest("Z");
    const permit = await authority.authorizeStatement({
      requestId: "Z",
      localSequence: 1,
      label: "fresh-restored-check",
      purpose: "cleanup",
      sqlSHA256: fingerprintSQL("SELECT 1"),
    });
    const grant = await authority.authorizeDriverDispatch(permit.id);
    expect(permit.serverTimeoutMs).toBe(60000);
    expect(grant.serverTimeoutMs).toBe(60000);
  });
  it("rejects invalid or over-ceiling operation timeout arguments", () => {
    for (const value of [0, -1, 60001, 1.5, Number.NaN])
      expect(() => serverWindowReservation(0, value)).toThrow();
  });
  it("reserves full server/acquisition/cleanup and compute tails even after a client deadline", () => {
    expect(serverWindowReservation(180000)).toMatchObject({ fits: true, requiredActiveMs: 300000 });
    expect(serverWindowReservation(180001).fits).toBe(false);
    expect(serverWindowReservation(300000).requiredCUHours).toBeGreaterThan(0.35);
    expect(() => serverWindowReservation(Number.NaN)).toThrow();
  });
  it("rechecks after durable trace persistence and never refunds the charged ambiguous intent", async () => {
    let now = 0;
    const authority = new AtomicPilotAuthority(new SerialTestStore(), "clocked", () => now);
    await authority.initialize();
    now = 179000;
    await authority.admitRequest(request("Z", 1, { purpose: "cleanup" }));
    await authority.activateRequest("Z");
    const send = vi.fn();
    const dispatch = createStatementDispatcher({
      authority,
      requestId: "Z",
      defaultPurpose: "cleanup",
      beforeDriverSend: async () => {
        now = 180001;
      },
    });
    await expect(dispatch("ROLLBACK", [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await authority.snapshot()).statements[0]).toMatchObject({
      outcome: "authorized-unknown",
      driverDispatchAuthorizedAtUTC: null,
    });
    expect((await authority.snapshot()).applicationStatements).toBe(1);
  });
  it("rejects a delayed/lost grant response, retains its permit and refuses dispatch replay", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(request("A", 2));
    await authority.activateRequest("A");
    let tick = 0;
    const send = vi.fn();
    const dispatch = createStatementDispatcher({
      authority,
      requestId: "A",
      monotonicNow: () => (tick++ ? 180001 : 0),
    });
    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await authority.snapshot()).statements[0].driverDispatchAuthorizedAtUTC).not.toBeNull();
    await expect(authority.authorizeDriverDispatch("A:s1")).rejects.toThrow("replayed");
    expect((await authority.snapshot()).applicationStatements).toBe(1);
  });
  it("does not dispatch work after a delayed grant crosses the shorter HTTP request deadline", async () => {
    const { authority } = await authorityFixture();
    await authority.admitRequest(request("A", 1, { maximumWallMs: 1 }));
    await authority.activateRequest("A");
    let tick = 0;
    const send = vi.fn();
    await expect(
      createStatementDispatcher({
        authority,
        requestId: "A",
        monotonicNow: () => (tick++ ? 2 : 0),
      })("SELECT 1", [], send),
    ).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await authority.snapshot()).applicationStatements).toBe(1);
  });
});
