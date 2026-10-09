import { scopedPilotPlan } from "./scoped-plan";
import { evaluateWholePilotPlan, type WholePilotPlan } from "./plan";
import { OWNER_SESSION_CLIENT_DEADLINE_MS } from "./session-owner";
export const CONTROL_READY_PLANNED_MS = 35_000;

/** Runtime2s default changes require explicit approval independent of this budget model. */
export function sessionScopedPilotPlan(
  ownerSessionProven: boolean,
  runtimeTwoProven: boolean,
): WholePilotPlan {
  const old = scopedPilotPlan(true, runtimeTwoProven);
  return {
    ...old,
    plannedControlWallMs: CONTROL_READY_PLANNED_MS,
    phases: [
      {
        id: "fresh-direct-runtime-original-sixty",
        purpose: "work",
        commands: 1,
        POSTs: 0,
        connections: 1,
        expectedResultMessageBytes: 65_536,
        receivedSocketReservation: 65_536,
        sentSocketReservation: 16_384,
        serverTimeoutMs: 60_000,
        serverTimeoutEnforced: runtimeTwoProven,
      },
      ...old.phases.map((phase) => {
        if (phase.id === "owner-record-and-lower" || phase.terminalRecovery === "restore")
          return {
            ...phase,
            commands: phase.commands + 2,
            ownerSessionBootstrap: true as const,
            clientOnlyBootstrapMs: OWNER_SESSION_CLIENT_DEADLINE_MS,
            expectedResultMessageBytes:
              phase.id === "owner-record-and-lower" ? phase.expectedResultMessageBytes + 256 : 512,
            serverTimeoutMs: 2_000,
            serverTimeoutEnforced: ownerSessionProven,
          };
        return phase;
      }),
    ],
  };
}

/** Compare the unchanged60s instruction without inventing pooled per-session SET semantics. */
export function sessionPilotScopeComparison() {
  const conditional = sessionScopedPilotPlan(true, true);
  const unchanged = {
    ...conditional,
    phases: conditional.phases.map((phase) => {
      // Counterfactual only: omit initial runtime ALTER; terminal owner work is a
      // read-only catalog audit, not an ALTER/restore. The existing Worker still
      // requires2s and cannot execute this alternative without a separate change.
      if (phase.id === "owner-record-and-lower") return { ...phase, commands: 3 };
      if (phase.terminalRecovery === "restore") {
        const { terminalRecovery: _, ...audit } = phase;
        return { ...audit, id: "owner-final-readonly-catalog-audit" };
      }
      return phase.ownerSessionBootstrap
        ? phase
        : { ...phase, serverTimeoutMs: 60_000, serverTimeoutEnforced: true };
    }),
  };
  return {
    candidateRuntimeTwoSeconds: evaluateWholePilotPlan(conditional),
    unchangedRuntimeSixtySeconds: evaluateWholePilotPlan(unchanged),
    currentRemoteAdmission: false,
    runtimeTwoSecondDefaultStillRequiredByExistingWorker: true,
    runtimeDefaultChangeAuthorizedInCurrentHandoff: false,
    unchangedSixtyModelIsCounterfactualNotExecutableWorker: true,
    unchangedSixtyModelPersistentRuntimeChanges: 0,
    firstSETServerBoundProven: false,
    computeQualification:
      "Client-only bootstrap windows are planned client reservations, not proven server execution ceilings. Opaque setup/tail/billing remain separately qualified.",
  };
}
