import { createHash } from "node:crypto";
import type { TransactionStorage } from "./transactional-store";
import {
  assertPilotCustody,
  PILOT_COHORT_KEY,
  unresolvedPilotWindow,
  validatePilotCohort,
  type PilotCohortState,
} from "./cohort-store";

export type PilotLedgerHandoff = {
  version: 1;
  sourceOwner: string;
  targetOwner: string;
  retiredAtMs: number;
  terminal: boolean;
  snapshot: PilotCohortState;
  SHA256: string;
};
export type ResourceAbsenceProof = {
  workerAbsent: true;
  hyperdriveAbsent: true;
  counterAbsent: true;
  ambiguousCreatesResolved: true;
  observedAtMs: number;
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const owners = new Set(["direct-setup", "worker", "direct-recovery"]);

/** Source is fenced durably BEFORE the snapshot is returned; it cannot resume on a lost reply. */
export async function retirePilotLedger(
  storage: TransactionStorage,
  owner: string,
  targetOwner: string,
  now: number,
  terminal: boolean,
): Promise<PilotLedgerHandoff> {
  if (
    !owners.has(owner) ||
    !owners.has(targetOwner) ||
    owner === targetOwner ||
    !Number.isSafeInteger(now) ||
    (terminal && targetOwner !== "direct-recovery")
  )
    throw new Error("Invalid one-way pilot ledger handoff");
  return storage.transaction(async (tx) => {
    const cohort = await tx.get<PilotCohortState>(PILOT_COHORT_KEY);
    if (!cohort?.custody) throw new Error("Owned pilot ledger unavailable");
    validatePilotCohort(cohort);
    assertPilotCustody(cohort, owner);
    if (now < cohort.startedAtMs) throw new Error("Invalid retirement clock");
    if (
      !terminal &&
      (cohort.stopped ||
        Object.values(cohort.phases).some(
          (p) =>
            p.requests.some((r) => !r.ended) ||
            p.statements.some((s) => s.outcome === "authorized-unknown"),
        ))
    )
      throw new Error("Ordinary transfer has unresolved work");
    if (terminal) {
      cohort.stopped = true;
      for (const phase of Object.values(cohort.phases)) {
        phase.stopped = true;
        for (const request of phase.requests) {
          if (!request.ended) {
            request.ended = true;
            request.outcome = "failed-unknown";
          }
        }
      }
    }
    cohort.custody.retired = true;
    validatePilotCohort(cohort);
    // A retained tombstone guards the source against initialize/replay and late driver grants.
    await tx.put(PILOT_COHORT_KEY, cohort);
    const snapshot = structuredClone(cohort);
    snapshot.custody = {
      owner: targetOwner,
      generation: cohort.custody.generation + 1,
      retired: false,
    };
    if (terminal) {
      const unresolved = unresolvedPilotWindow(snapshot);
      snapshot.recoveryReady = {
        owner: targetOwner,
        // No fictional finite server window and no Infinity->null JSON corruption.
        notBeforeMs: Number.isFinite(unresolved) ? Math.max(now, unresolved) : now,
        ...(!Number.isFinite(unresolved) ? { clientOnlyBootstrapUnresolved: true as const } : {}),
      };
    }
    const handoff = {
      version: 1 as const,
      sourceOwner: owner,
      targetOwner,
      retiredAtMs: now,
      terminal,
      snapshot,
    };
    const result = { ...handoff, SHA256: digest(handoff) };
    await tx.put("retired-pilot-handoff", result);
    return result;
  });
}

/** Only the authenticated controller supplies this exact retired certificate, never a reset. */
export async function acceptPilotLedger(
  storage: TransactionStorage,
  handoff: PilotLedgerHandoff,
  owner: string,
  now: number,
  resources?: ResourceAbsenceProof,
) {
  const { SHA256, ...content } = handoff;
  if (
    handoff.version !== 1 ||
    digest(content) !== SHA256 ||
    owner !== handoff.targetOwner ||
    !owners.has(owner) ||
    !handoff.snapshot.custody ||
    handoff.snapshot.custody.owner !== owner ||
    handoff.snapshot.custody.retired ||
    !Number.isSafeInteger(now) ||
    now < handoff.retiredAtMs
  )
    throw new Error("Invalid fenced pilot handoff");
  validatePilotCohort(handoff.snapshot);
  if (
    handoff.terminal &&
    (!resources ||
      resources.workerAbsent !== true ||
      resources.hyperdriveAbsent !== true ||
      resources.counterAbsent !== true ||
      resources.ambiguousCreatesResolved !== true ||
      !Number.isSafeInteger(resources.observedAtMs) ||
      resources.observedAtMs < handoff.retiredAtMs ||
      resources.observedAtMs > now ||
      handoff.snapshot.recoveryReady!.clientOnlyBootstrapUnresolved ||
      now < handoff.snapshot.recoveryReady!.notBeforeMs)
  )
    throw new Error("Resources/accepted windows not proved absent before restoration");
  await storage.transaction(async (tx) => {
    if (await tx.get(PILOT_COHORT_KEY))
      throw new Error("Pilot ledger import cannot replay or overwrite");
    await tx.put(PILOT_COHORT_KEY, structuredClone(handoff.snapshot));
    await tx.put("accepted-pilot-handoff", {
      SHA256,
      sourceOwner: handoff.sourceOwner,
      acceptedAtMs: now,
    });
  });
}
