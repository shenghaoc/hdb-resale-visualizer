// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import {
  AtomicPilotAuthority,
  PILOT_LIMITS,
  SCOPED_COMPUTE_ENVELOPE,
  serverWindowReservation,
} from "../../scripts/neon-benchmark/pilot/accounting";
import {
  chargePilotSetupContingency,
  cohortPilotStore,
  enterPilotPhase,
  initializePilotCohort,
  snapshotPilotCohort,
} from "../../scripts/neon-benchmark/pilot/cohort-store";
import { createStatementDispatcher } from "../../scripts/neon-benchmark/pilot/dispatch";
import {
  acceptPilotLedger,
  retirePilotLedger,
  type ResourceAbsenceProof,
} from "../../scripts/neon-benchmark/pilot/ledger-transfer";
import {
  evaluateWholePilotPlan,
  requireWholePilotAdmission,
} from "../../scripts/neon-benchmark/pilot/plan";
import { scopedPilotPlan } from "../../scripts/neon-benchmark/pilot/scoped-plan";
import {
  SCOPED_LOWER_SQL,
  SCOPED_RESTORE_SQL,
  SCOPED_VERIFY_SQL,
} from "../../scripts/neon-benchmark/pilot/scoped-sql";
import { runTerminalRestoration } from "../../scripts/neon-benchmark/pilot/terminal-recovery";
import type { TransactionStorage } from "../../scripts/neon-benchmark/pilot/transactional-store";

class Storage implements TransactionStorage {
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
const safeguards = {
  role: "hdb_benchmark_runtime",
  database: "neondb",
  read_only: "on",
  statement_timeout: "1min",
  transaction_select: true,
  transaction_write: false,
  private_access: false,
};
async function fixture() {
  const storage = new Storage();
  let clock = 1000;
  const now = () => clock;
  // True flags represent synthetic local-driver evidence, never live provider proof.
  await initializePilotCohort(
    storage,
    "scoped-local-fixture",
    clock,
    scopedPilotPlan(true, true),
    "direct-setup",
  );
  await enterPilotPhase(storage, "owner-record-and-lower", clock, "direct-setup");
  const authority = new AtomicPilotAuthority(
    cohortPilotStore(storage, "owner-record-and-lower", "direct-setup"),
    "owner-record-and-lower",
    now,
  );
  await authority.initialize();
  await authority.admitRequest({
    id: "setup",
    sequence: 1,
    method: "GET",
    maximumStatements: 2,
    maximumReceivedDatabaseBytes: 131_072,
    maximumSentDatabaseBytes: 32_768,
    maximumWallMs: 85_000,
  });
  await authority.activateRequest("setup");
  const dispatch = createStatementDispatcher({
    authority,
    requestId: "setup",
    retainTransportAmbiguity: true,
  });
  return {
    storage,
    authority,
    dispatch,
    now,
    advance: (value: number) => {
      clock = value;
    },
  };
}
async function prepareRecovery(f: Awaited<ReturnType<typeof fixture>>) {
  if ((await snapshotPilotCohort(f.storage)).applicationStatements === 0) {
    await f.dispatch(SCOPED_LOWER_SQL, [], async () => ({ rows: [] }));
    await f.authority.finishRequest("setup", "complete");
  }
  const handoff = await retirePilotLedger(
    f.storage,
    "direct-setup",
    "direct-recovery",
    f.now(),
    true,
  );
  f.advance(handoff.snapshot.recoveryReady!.notBeforeMs);
  const proof: ResourceAbsenceProof = {
    workerAbsent: true,
    hyperdriveAbsent: true,
    counterAbsent: true,
    ambiguousCreatesResolved: true,
    observedAtMs: f.now(),
  };
  const target = new Storage();
  await acceptPilotLedger(target, handoff, "direct-recovery", f.now(), proof);
  return { target, handoff, proof };
}

describe("scoped pilot split envelope, fenced ownership and mandatory terminal recovery", () => {
  it("reserves all56 commands including3 producer guards and preserves every time component", () => {
    const model = evaluateWholePilotPlan(scopedPilotPlan(true, true));
    expect(model).toMatchObject({
      commands: 56,
      POSTs: 3,
      connections: 12,
      serverExecutionMs: 344_000,
      acquisitionMs: 180_000,
      activeMsAtLeast: 569_000,
      setupContingencyMs: 180_000,
      plannedComputeCeiling: 0.45,
      totalComputeCeiling: 0.5,
      admitted: true,
    });
    expect(model.CUHoursAtLeast).toBe(1469 / 3600);
    expect(PILOT_LIMITS.computeCUHoursProxy).toBe(0.35);
    expect(PILOT_LIMITS.maximumCU).toBe(1);
  });
  it("refuses unknown owner/runtime evidence before any resource callback despite arithmetic fit", () => {
    const provision = vi.fn();
    expect(() => {
      requireWholePilotAdmission(scopedPilotPlan(false, false));
      provision();
    }).toThrow("server timeout unproved");
    expect(provision).not.toHaveBeenCalled();
  });
  it("refuses planned compute above.45 instead of silently consuming setup contingency", () => {
    const plan = scopedPilotPlan(true, true);
    const phases = plan.phases.map((p) =>
      p.id === "owner-record-and-lower" ? { ...p, commands: 5 } : p,
    );
    const model = evaluateWholePilotPlan({ ...plan, phases });
    expect(model.CUHoursAtLeast).toBeGreaterThan(0.45);
    expect(model.CUHoursAtLeast).toBeLessThan(0.5);
    expect(model.admitted).toBe(false);
  });
  it("keeps the default envelope while allowing only the precisely approved scoped override", () => {
    expect(serverWindowReservation(400_000).fits).toBe(false);
    expect(serverWindowReservation(400_000, 60_000, SCOPED_COMPUTE_ENVELOPE).fits).toBe(true);
    expect(() =>
      serverWindowReservation(0, 60_000, {
        ...SCOPED_COMPUTE_ENVELOPE,
        plannedCUHours: 0.5,
      } as unknown as typeof SCOPED_COMPUTE_ENVELOPE),
    ).toThrow("Unapproved");
  });
  it("preserves a stopped ledger and restores60 after failure immediately after the role change", async () => {
    const f = await fixture();
    await f.dispatch(SCOPED_LOWER_SQL, [], async () => ({ rows: [] }));
    await f.authority.finishRequest("setup", "complete");
    await f.authority.stop();
    const before = await snapshotPilotCohort(f.storage);
    const { target } = await prepareRecovery(f);
    const driver = vi.fn(async (purpose: string) => ({
      rows: purpose === "verify" ? [safeguards] : [],
    }));
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(Math.max(f.now(), n)),
      freshQuery: driver,
    });
    expect(result.safeRestoredState).toBe(true);
    expect(driver.mock.calls.map(([purpose]) => purpose)).toEqual(["restore", "verify"]);
    const after = await snapshotPilotCohort(target);
    expect(after.applicationStatements).toBe(before.applicationStatements + 2);
    expect(after.startedAtMs).toBe(before.startedAtMs);
    expect(after.statements[0]).toEqual(before.statements[0]);
    await expect(f.dispatch(SCOPED_LOWER_SQL, [], async () => ({ rows: [] }))).rejects.toThrow(
      "AUTHORIZATION",
    );
  });
  it("fences the old owner before returning an ordinary handoff and refuses replay at the target", async () => {
    const f = await fixture();
    await f.authority.finishRequest("setup", "complete");
    const handoff = await retirePilotLedger(f.storage, "direct-setup", "worker", f.now(), false);
    const target = new Storage();
    await acceptPilotLedger(target, handoff, "worker", f.now());
    expect((await snapshotPilotCohort(target)).custody).toMatchObject({
      owner: "worker",
      generation: 1,
      retired: false,
    });
    await expect(acceptPilotLedger(target, handoff, "worker", f.now())).rejects.toThrow(
      "cannot replay",
    );
    await expect(
      f.authority.admitRequest({
        id: "late",
        sequence: 2,
        method: "GET",
        maximumStatements: 1,
        maximumReceivedDatabaseBytes: 1,
        maximumSentDatabaseBytes: 1,
      }),
    ).rejects.toThrow("Retired");
  });
  it("rejects a tampered handoff without resetting counters or creating another owner", async () => {
    const f = await fixture();
    await f.authority.finishRequest("setup", "complete");
    const handoff = await retirePilotLedger(f.storage, "direct-setup", "worker", f.now(), false);
    handoff.snapshot.applicationStatements++;
    await expect(acceptPilotLedger(new Storage(), handoff, "worker", f.now())).rejects.toThrow(
      "Invalid fenced",
    );
  });
  it("keeps failedHyperdrivecreate/request setup intervals and restores via the same terminal ledger", async () => {
    const f = await fixture();
    await f.dispatch(SCOPED_LOWER_SQL, [], async () => ({ rows: [] }));
    await f.authority.finishRequest("setup", "complete");
    f.advance(6000);
    await expect(
      chargePilotSetupContingency(f.storage, "direct-setup", {
        id: "failed-create",
        startedAtMs: 1000,
        endedAtMs: 6000,
        ambiguous: true,
      }),
    ).rejects.toThrow("ordinary pilot stopped");
    const { target } = await prepareRecovery(f);
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(Math.max(f.now(), n)),
      freshQuery: async (p) => ({ rows: p === "verify" ? [safeguards] : [] }),
    });
    expect(result.safeRestoredState).toBe(true);
    expect((await snapshotPilotCohort(target)).contingencySpentMs).toBe(5000);
  });
  it("does not import recovery on an unresolved create/absence claim", async () => {
    const f = await fixture();
    const handoff = await retirePilotLedger(
      f.storage,
      "direct-setup",
      "direct-recovery",
      f.now(),
      true,
    );
    const bad = {
      workerAbsent: true,
      hyperdriveAbsent: true,
      counterAbsent: true,
      ambiguousCreatesResolved: false,
      observedAtMs: f.now(),
    };
    await expect(
      acceptPilotLedger(
        new Storage(),
        handoff,
        "direct-recovery",
        f.now(),
        bad as ResourceAbsenceProof,
      ),
    ).rejects.toThrow("not proved absent");
  });
  it("retains ambiguous lower permits and waits the full late-send/acquisition/server window", async () => {
    const f = await fixture();
    await expect(
      f.dispatch(SCOPED_LOWER_SQL, [], async () => {
        throw Error("lost transport response");
      }),
    ).rejects.toThrow("DATABASE");
    const before = await snapshotPilotCohort(f.storage);
    expect(before.phases["owner-record-and-lower"].statements[0].outcome).toBe(
      "authorized-unknown",
    );
    const handoff = await retirePilotLedger(
      f.storage,
      "direct-setup",
      "direct-recovery",
      f.now(),
      true,
    );
    expect(handoff.snapshot.recoveryReady!.notBeforeMs - f.now()).toBe(76_000);
    const proof = {
      workerAbsent: true,
      hyperdriveAbsent: true,
      counterAbsent: true,
      ambiguousCreatesResolved: true,
      observedAtMs: f.now(),
    } as ResourceAbsenceProof;
    await expect(
      acceptPilotLedger(new Storage(), handoff, "direct-recovery", f.now(), proof),
    ).rejects.toThrow("accepted windows");
    f.advance(handoff.snapshot.recoveryReady!.notBeforeMs);
    const target = new Storage();
    await acceptPilotLedger(target, handoff, "direct-recovery", f.now(), {
      ...proof,
      observedAtMs: f.now(),
    });
    expect((await snapshotPilotCohort(target)).applicationStatements).toBe(
      before.applicationStatements,
    );
  });
  it("restores after the ordinary whole-plan deadline is exhausted without allowing new ordinarySQL", async () => {
    const f = await fixture();
    await f.dispatch(SCOPED_LOWER_SQL, [], async () => ({ rows: [] }));
    await f.authority.finishRequest("setup", "complete");
    f.advance(200_000);
    await expect(
      enterPilotPhase(f.storage, "fresh-direct-runtime-before-pool", f.now(), "direct-setup"),
    ).rejects.toThrow("reservation refused");
    const { target } = await prepareRecovery(f);
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(Math.max(f.now(), n)),
      freshQuery: async (p) => ({ rows: p === "verify" ? [safeguards] : [] }),
    });
    expect(result.safeRestoredState).toBe(true);
    await expect(
      enterPilotPhase(target, "comparables", f.now(), "direct-recovery"),
    ).rejects.toThrow("reservation refused");
  });
  it("never retries an ambiguous restore; only its alreadyreserved fresh verification reconciles", async () => {
    const f = await fixture();
    const { target } = await prepareRecovery(f);
    const driver = vi.fn(async (purpose: string) => {
      if (purpose === "restore") throw Error("response lost after possible ALTER acceptance");
      return { rows: [safeguards] };
    });
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(Math.max(f.now(), n)),
      freshQuery: driver,
    });
    expect(driver.mock.calls.map(([purpose]) => purpose)).toEqual(["restore", "verify"]);
    expect(result).toMatchObject({ safeRestoredState: true, pilotPassed: false, blindRetries: 0 });
    const state = await snapshotPilotCohort(target);
    expect(state.phases["owner-scoped-restore-after-resource-delete"].statements[0].outcome).toBe(
      "authorized-unknown",
    );
  });
  it("reportsPILOTFAIL when restore fails and the fresh runtime is still2s", async () => {
    const f = await fixture();
    const { target } = await prepareRecovery(f);
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(Math.max(f.now(), n)),
      freshQuery: async (p) => {
        if (p === "restore") throw Object.assign(Error("denied"), { code: "42501" });
        return { rows: [{ ...safeguards, statement_timeout: "2s" }] };
      },
    });
    expect(result).toMatchObject({ pilotPassed: false, safeRestoredState: false, blindRetries: 0 });
  });
  it("reportsPILOTFAIL when postrestore verification is missing/wrong/private", async () => {
    const f = await fixture();
    const { target } = await prepareRecovery(f);
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(Math.max(f.now(), n)),
      freshQuery: async (p) => ({
        rows: p === "verify" ? [{ ...safeguards, private_access: true }] : [],
      }),
    });
    expect(result).toMatchObject({
      restoreAcknowledged: true,
      verified: false,
      pilotPassed: false,
    });
  });
  it("allows only the exact scopedrestore/freshverify fingerprints in the terminal lane", async () => {
    const f = await fixture();
    const { target } = await prepareRecovery(f);
    await enterPilotPhase(
      target,
      "owner-scoped-restore-after-resource-delete",
      f.now(),
      "direct-recovery",
    );
    const a = new AtomicPilotAuthority(
      cohortPilotStore(target, "owner-scoped-restore-after-resource-delete", "direct-recovery"),
      "owner-scoped-restore-after-resource-delete",
      f.now,
    );
    await a.initialize();
    await a.admitRequest({
      id: "bad",
      sequence: 100,
      method: "GET",
      purpose: "cleanup",
      maximumStatements: 1,
      maximumReceivedDatabaseBytes: 65_536,
      maximumSentDatabaseBytes: 16_384,
    });
    await a.activateRequest("bad");
    const send = vi.fn();
    await expect(
      createStatementDispatcher({ authority: a, requestId: "bad", defaultPurpose: "cleanup" })(
        SCOPED_LOWER_SQL,
        [],
        send,
      ),
    ).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
    expect((await snapshotPilotCohort(target)).applicationStatements).toBe(1);
    expect(SCOPED_RESTORE_SQL).toContain("IN DATABASE neondb");
    expect(SCOPED_VERIFY_SQL).not.toMatch(/^(SET|ALTER)/);
  });
  it("does not ALTER or claimrestoration when lowering never reached a driver grant", async () => {
    const f = await fixture();
    const handoff = await retirePilotLedger(
      f.storage,
      "direct-setup",
      "direct-recovery",
      f.now(),
      true,
    );
    const target = new Storage();
    await acceptPilotLedger(target, handoff, "direct-recovery", f.now(), {
      workerAbsent: true,
      hyperdriveAbsent: true,
      counterAbsent: true,
      ambiguousCreatesResolved: true,
      observedAtMs: f.now(),
    });
    const send = vi.fn();
    const result = await runTerminalRestoration(target, "direct-recovery", {
      now: f.now,
      waitUntil: async (n) => f.advance(n),
      freshQuery: send,
    });
    expect(result).toMatchObject({
      restorationRequired: false,
      restoreAttempted: false,
      verified: false,
    });
    expect(send).not.toHaveBeenCalled();
  });
  it("persists contingency exhaustion and never uses unspentplanned headroom to hide it", async () => {
    const f = await fixture();
    await f.authority.finishRequest("setup", "complete");
    f.advance(181_001);
    await expect(
      chargePilotSetupContingency(f.storage, "direct-setup", {
        id: "setup",
        startedAtMs: 1000,
        endedAtMs: f.now(),
        ambiguous: false,
      }),
    ).rejects.toThrow("contingency invalidated");
    const state = await snapshotPilotCohort(f.storage);
    expect(state).toMatchObject({ stopped: true, contingencySpentMs: 180_001 });
    await expect(
      enterPilotPhase(f.storage, "comparables", f.now(), "direct-setup"),
    ).rejects.toThrow("reservation refused");
  });
  it("refuses repeated/overlappingsetup intervals and retains the original charge", async () => {
    const f = await fixture();
    await f.authority.finishRequest("setup", "complete");
    f.advance(3000);
    const interval = { id: "create", startedAtMs: 1000, endedAtMs: 3000, ambiguous: false };
    await chargePilotSetupContingency(f.storage, "direct-setup", interval);
    await expect(chargePilotSetupContingency(f.storage, "direct-setup", interval)).rejects.toThrow(
      "replayed",
    );
    expect((await snapshotPilotCohort(f.storage)).contingencySpentMs).toBe(2000);
  });
});
