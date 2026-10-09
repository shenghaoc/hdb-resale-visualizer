// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { reconcileFailedControlImport } from "../../scripts/neon-benchmark/pilot/import-failure-recovery";
import {
  initializePilotCohort,
  chargePilotSetupContingency,
} from "../../scripts/neon-benchmark/pilot/cohort-store";
import { sessionScopedPilotPlan } from "../../scripts/neon-benchmark/pilot/session-plan";
import {
  retirePilotLedger,
  type ResourceAbsenceProof,
} from "../../scripts/neon-benchmark/pilot/ledger-transfer";
import type { TransactionStorage } from "../../scripts/neon-benchmark/pilot/transactional-store";
class Storage implements TransactionStorage {
  data = new Map<string, unknown>();
  async transaction<T>(action: Parameters<TransactionStorage["transaction"]>[0]): Promise<T> {
    return (await action({
      get: async <V>(k: string) => structuredClone(this.data.get(k)) as V | undefined,
      put: async (k, v) => {
        this.data.set(k, structuredClone(v));
      },
    })) as T;
  }
}
const calls = [
  { method: "POST" as const, path: "/control/begin", status: 404 },
  { method: "POST" as const, path: "/control/retire", status: 404 },
  { method: "GET" as const, path: "/control/retired-handoff", status: 404 },
];
async function fixture() {
  const store = new Storage();
  await initializePilotCohort(
    store,
    "test-no-sql-import",
    1000,
    sessionScopedPilotPlan(true, true),
    "direct-setup",
  );
  await chargePilotSetupContingency(store, "direct-setup", {
    id: "setup",
    startedAtMs: 1000,
    endedAtMs: 1100,
    ambiguous: false,
  });
  const original = await retirePilotLedger(store, "direct-setup", "worker", 1200, false);
  const absence: ResourceAbsenceProof = {
    workerAbsent: true,
    hyperdriveAbsent: true,
    counterAbsent: true,
    ambiguousCreatesResolved: true,
    observedAtMs: 1500,
  };
  return { original, absence };
}
describe("failed control import terminal-only reconciliation", () => {
  it("preserves the exact original charges, run, clock, and plan, without fabricating a remote certificate", async () => {
    const { original, absence } = await fixture();
    const before = JSON.stringify(original);
    const r = reconcileFailedControlImport(original, absence, calls, 1600);
    expect(r.remoteRetirementCertificateAvailable).toBe(false);
    expect(r.refund).toBe(0);
    expect(r.handoff.snapshot.contingencySpentMs).toBe(100);
    expect(r.handoff.snapshot.startedAtMs).toBe(1000);
    expect(r.handoff.snapshot.plan).toEqual(original.snapshot.plan);
    expect(r.handoff.snapshot.custody).toEqual({
      owner: "direct-recovery",
      generation: 2,
      retired: false,
    });
    expect(r.handoff.snapshot.stopped).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("rejects any SQL-capable serving call and any resource uncertainty", async () => {
    const { original, absence } = await fixture();
    expect(() =>
      reconcileFailedControlImport(
        original,
        absence,
        [...calls, { method: "GET", path: "/control/safeguards", status: 200 }],
        1600,
      ),
    ).toThrow();
    expect(() =>
      reconcileFailedControlImport(
        original,
        { ...absence, workerAbsent: false } as unknown as ResourceAbsenceProof,
        calls,
        1600,
      ),
    ).toThrow();
  });
  it("rejects drifted source counters and any purported success substituted for404", async () => {
    const { original, absence } = await fixture();
    const drift = structuredClone(original);
    drift.snapshot.applicationStatements++;
    expect(() => reconcileFailedControlImport(drift, absence, calls, 1600)).toThrow();
    expect(() =>
      reconcileFailedControlImport(
        original,
        absence,
        calls.map((c) => ({ ...c, status: 200 })),
        1600,
      ),
    ).toThrow();
  });
  it("pins the only eligible controller route set to the installed no-SQL source", () => {
    const source = readFileSync(
      ".neon-benchmark/session-owner-pilot-20261006/before/.neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts",
      "utf8",
    );
    const control = source.slice(
      source.indexOf('if (url.pathname === "/control/begin"'),
      source.indexOf("const pilotId = request.headers"),
    );
    expect(control).not.toMatch(/new (?:pg\.)?Client|\.query\(|connect\(/);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "9061c908c9efdb4cf01c8c2a7c5874a14b3038f0ac107c0e92f3936451037c41",
    );
  });
});
