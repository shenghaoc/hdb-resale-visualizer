import { SCOPED_COMPUTE_ENVELOPE } from "./accounting";
import { COMPARABLE_WHOLE_PILOT_PLAN, type PilotPhaseBudget, type WholePilotPlan } from "./plan";

export const SCOPED_PILOT_TARGET = Object.freeze({
  project: "wispy-mouse-67963002",
  branch: "br-rough-frost-b3e2ks1b",
  endpoint: "ep-steep-water-b300tebo",
  database: "neondb",
  role: "hdb_benchmark_runtime",
});

/** Reservations only: owner evidence is never inferred from a client deadline or plan number. */
export function scopedPilotPlan(
  ownerTimeoutProven: boolean,
  runtimeTimeoutProven: boolean,
): WholePilotPlan {
  const base = COMPARABLE_WHOLE_PILOT_PLAN.phases;
  const prior = (id: string) => {
    const phase = base.find((p) => p.id === id);
    if (!phase) throw new Error("Missing frozen pilot phase");
    return phase;
  };
  const runtime = (id: string): PilotPhaseBudget => ({
    ...prior(id),
    serverTimeoutMs: 2000,
    serverTimeoutEnforced: runtimeTimeoutProven,
  });
  const direct = (
    id: string,
    commands: number,
    purpose: "work" | "cleanup",
    terminalRecovery?: "restore" | "verify",
  ): PilotPhaseBudget => ({
    id,
    commands,
    purpose,
    connections: 1,
    POSTs: 0,
    serverTimeoutMs: 60_000,
    serverTimeoutEnforced: ownerTimeoutProven,
    expectedResultMessageBytes: 65_536,
    receivedSocketReservation: 131_072,
    sentSocketReservation: 32_768,
    ...(terminalRecovery ? { terminalRecovery } : {}),
  });
  return {
    computeEnvelope: SCOPED_COMPUTE_ENVELOPE,
    setupActiveMs: null,
    setupBoundEnforced: false,
    setupContingencyTracked: true,
    phases: [
      direct("owner-record-and-lower", 2, "work"),
      { ...runtime("initial-observations"), id: "fresh-direct-runtime-before-pool" },
      runtime("safeguards"),
      runtime("candidate-sequential-diagnostic-20261005"),
      runtime("candidate-concurrent-diagnostic-20261005"),
      // One producer-bound certificate in EACH existing read-only comparable snapshot.
      { ...runtime("comparables"), commands: 30, expectedResultMessageBytes: 3 * 86_111 },
      { ...runtime("cleanup"), id: "cleanup-observations-before-resource-delete", commands: 8 },
      direct("owner-scoped-restore-after-resource-delete", 1, "cleanup", "restore"),
      // Fresh runtime retains60s after restoration; owner proof cannot substitute for this setting.
      {
        ...direct("fresh-direct-runtime-restored-sixty", 1, "cleanup", "verify"),
        serverTimeoutEnforced: runtimeTimeoutProven,
      },
    ],
  };
}
