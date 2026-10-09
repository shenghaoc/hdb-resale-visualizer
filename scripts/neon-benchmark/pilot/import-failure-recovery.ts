import { createHash } from "node:crypto";
import type { PilotLedgerHandoff, ResourceAbsenceProof } from "./ledger-transfer";
import { unresolvedPilotWindow, validatePilotCohort } from "./cohort-store";

export type NoDatabaseWorkerCall = {
  method: "GET" | "POST";
  path: string;
  status: number;
};
/** Controller reconciliation, explicitly NOT a returned remote retirement certificate.
 * The three attempted control routes only import/retire/read authority state; none
 * constructs a PG client. After resource deletion they cannot accept new SQL work.
 * Preserve the exact charged original handoff; never reset, refund or resume it.
 */
export function reconcileFailedControlImport(
  original: PilotLedgerHandoff,
  absence: ResourceAbsenceProof,
  calls: readonly NoDatabaseWorkerCall[],
  now: number,
) {
  const { SHA256, ...content } = original;
  if (
    createHash("sha256").update(JSON.stringify(content)).digest("hex") !== SHA256 ||
    original.terminal ||
    original.sourceOwner !== "direct-setup" ||
    original.targetOwner !== "worker" ||
    original.snapshot.custody?.owner !== "worker" ||
    original.snapshot.custody.retired ||
    !Number.isSafeInteger(now) ||
    now < absence.observedAtMs ||
    absence.observedAtMs < original.retiredAtMs ||
    absence.workerAbsent !== true ||
    absence.hyperdriveAbsent !== true ||
    absence.counterAbsent !== true ||
    absence.ambiguousCreatesResolved !== true ||
    JSON.stringify(calls) !==
      JSON.stringify([
        { method: "POST", path: "/control/begin", status: 404 },
        { method: "POST", path: "/control/retire", status: 404 },
        { method: "GET", path: "/control/retired-handoff", status: 404 },
      ])
  )
    throw Error("Import failure recovery proof unavailable; no SQL admitted");
  validatePilotCohort(original.snapshot);
  if (
    original.snapshot.comparablePOSTs !== 0 ||
    original.snapshot.enteredPhases.some(
      (id) =>
        ![
          "fresh-direct-runtime-original-sixty",
          "owner-record-and-lower",
          "fresh-direct-runtime-before-pool",
        ].includes(id),
    )
  )
    throw Error("Possible remote SQL phase prevents controller-only reconciliation");
  const snapshot = structuredClone(original.snapshot);
  const unresolved = unresolvedPilotWindow(snapshot);
  if (!Number.isFinite(unresolved))
    throw Error("Unresolved client-only bootstrap prevents recovery");
  snapshot.stopped = true;
  for (const phase of Object.values(snapshot.phases)) phase.stopped = true;
  snapshot.custody = {
    owner: "direct-recovery",
    generation: original.snapshot.custody.generation + 1,
    retired: false,
  };
  // This absence receipt already fences every attempted control route. It need
  // not claim a later provider observation to manufacture an acceptance proof.
  snapshot.recoveryReady = {
    owner: "direct-recovery",
    notBeforeMs: Math.max(absence.observedAtMs, unresolved),
  };
  validatePilotCohort(snapshot);
  const certificate = {
    version: 1 as const,
    sourceOwner: "worker",
    targetOwner: "direct-recovery",
    retiredAtMs: absence.observedAtMs,
    terminal: true,
    snapshot,
  };
  return {
    provenance: "CONTROLLER_RECONCILIATION_OF_NO_SQL_CONTROL_ROUTES_AFTER_PROVED_DELETION" as const,
    remoteRetirementCertificateAvailable: false,
    originalHandoffSHA256: original.SHA256,
    refund: 0,
    handoff: {
      ...certificate,
      SHA256: createHash("sha256").update(JSON.stringify(certificate)).digest("hex"),
    },
  };
}
