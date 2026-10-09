import {
  PILOT_LIMITS,
  pilotTimeLimits,
  validatePilotState,
  type AtomicPilotStore,
  type PilotState,
} from "./accounting";
import {
  requireWholePilotAdmission,
  terminalPhaseSQLFingerprint,
  type WholePilotPlan,
} from "./plan";
import type { TransactionStorage } from "./transactional-store";
import { OWNER_SESSION_SET_SQL, OWNER_SESSION_READBACK_SQL } from "./session-owner";
import { scopedSQLFingerprint } from "./scoped-sql";

export const PILOT_COHORT_KEY = "pilot-cohort";
export type PilotCohortState = {
  runId: string;
  startedAtMs: number;
  stopped: boolean;
  plan: WholePilotPlan;
  enteredPhases: string[];
  phases: Record<string, PilotState>;
  applicationStatements: number;
  comparablePOSTs: number;
  connectionAdmissions: number;
  receivedDatabaseBytesReserved: number;
  sentDatabaseBytesReserved: number;
  contingencySpentMs: number;
  setupIntervals: { id: string; startedAtMs: number; endedAtMs: number; ambiguous: boolean }[];
  custody?: { owner: string; generation: number; retired: boolean };
  recoveryReady?: { owner: string; notBeforeMs: number; clientOnlyBootstrapUnresolved?: true };
  statements: { phaseId: string; statementId: string; id: string; applicationSequence: number }[];
};

export function validatePilotCohort(cohort: PilotCohortState) {
  requireWholePilotAdmission(cohort.plan);
  const time = pilotTimeLimits(cohort.plan.computeEnvelope);
  if (
    !Number.isSafeInteger(cohort.contingencySpentMs) ||
    cohort.contingencySpentMs < 0 ||
    (cohort.contingencySpentMs > time.contingencyMs && !cohort.stopped) ||
    !Array.isArray(cohort.setupIntervals) ||
    cohort.setupIntervals.length > 32 ||
    cohort.contingencySpentMs !==
      cohort.setupIntervals.reduce((n, i) => n + i.endedAtMs - i.startedAtMs, 0)
  )
    throw new Error("Pilot setup contingency exhausted/corrupt");
  const phases = Object.entries(cohort.phases);
  for (const [id, phase] of phases) {
    validatePilotState(phase);
    const budget = cohort.plan.phases.find((p) => p.id === id);
    if (
      !budget ||
      phase.serverTimeoutMs !== budget.serverTimeoutMs ||
      phase.ownerSessionBootstrap !== budget.ownerSessionBootstrap ||
      JSON.stringify(phase.computeEnvelope) !== JSON.stringify(cohort.plan.computeEnvelope) ||
      phase.requests.reduce((n, r) => n + r.maximumStatements, 0) > budget.commands ||
      phase.comparablePOSTs > budget.POSTs ||
      phase.connectionAdmissions > budget.connections ||
      phase.receivedDatabaseBytesReserved > budget.receivedSocketReservation ||
      phase.sentDatabaseBytesReserved > budget.sentSocketReservation
    )
      throw new Error("Corrupt shared phase reservation");
  }
  const requests = phases.flatMap(([, p]) => p.requests);
  const statements = phases.flatMap(([phaseId, p]) =>
    p.statements.map((s) => `${phaseId}:${s.id}`),
  );
  if (
    !/^[A-Za-z0-9_-]{1,96}$/.test(cohort.runId) ||
    !Number.isSafeInteger(cohort.startedAtMs) ||
    typeof cohort.stopped !== "boolean" ||
    new Set(cohort.enteredPhases).size !== cohort.enteredPhases.length ||
    cohort.enteredPhases.some((id) => !cohort.plan.phases.some((p) => p.id === id)) ||
    phases.some(
      ([id, p]) =>
        !cohort.enteredPhases.includes(id) ||
        p.runId !== id ||
        p.startedAtMs !== cohort.startedAtMs,
    ) ||
    cohort.applicationStatements !== statements.length ||
    cohort.statements.length !== statements.length ||
    cohort.applicationStatements > PILOT_LIMITS.applicationStatements ||
    cohort.comparablePOSTs !== phases.reduce((n, [, p]) => n + p.comparablePOSTs, 0) ||
    cohort.connectionAdmissions !== requests.length ||
    cohort.receivedDatabaseBytesReserved !==
      phases.reduce((n, [, p]) => n + p.receivedDatabaseBytesReserved, 0) ||
    cohort.sentDatabaseBytesReserved !==
      phases.reduce((n, [, p]) => n + p.sentDatabaseBytesReserved, 0) ||
    requests.filter((r) => !r.ended).length > PILOT_LIMITS.concurrentRequests ||
    new Set(requests.map((r) => r.id)).size !== requests.length ||
    cohort.statements.some(
      (s, i) =>
        s.applicationSequence !== i + 1 ||
        s.id !== `${s.phaseId}:${s.statementId}` ||
        !statements.includes(s.id),
    ) ||
    new Set(cohort.statements.map((s) => s.id)).size !== cohort.statements.length
  )
    throw new Error("Corrupt shared cohort fails closed");
}

/** This first, one-shot ledger reserves the ENTIRE plan, not a fresh budget per phase. */
export async function initializePilotCohort(
  storage: TransactionStorage,
  runId: string,
  startedAtMs: number,
  plan: WholePilotPlan,
  owner?: string,
) {
  requireWholePilotAdmission(plan);
  await storage.transaction(async (tx) => {
    if (await tx.get(PILOT_COHORT_KEY)) throw new Error("Existing cohort cannot reset");
    const cohort: PilotCohortState = {
      runId,
      startedAtMs,
      stopped: false,
      plan: structuredClone(plan),
      enteredPhases: [],
      phases: {},
      applicationStatements: 0,
      comparablePOSTs: 0,
      connectionAdmissions: 0,
      receivedDatabaseBytesReserved: 0,
      sentDatabaseBytesReserved: 0,
      contingencySpentMs: 0,
      setupIntervals: [],
      ...(owner ? { custody: { owner, generation: 0, retired: false } } : {}),
      statements: [],
    };
    validatePilotCohort(cohort);
    await tx.put(PILOT_COHORT_KEY, cohort);
  });
}

export async function snapshotPilotCohort(storage: TransactionStorage): Promise<PilotCohortState> {
  return storage.transaction(async (tx) => {
    const cohort = await tx.get<PilotCohortState>(PILOT_COHORT_KEY);
    if (!cohort) throw new Error("Shared cohort unavailable");
    validatePilotCohort(cohort);
    return structuredClone(cohort);
  });
}

/** Phase entry keeps all unspent/ambiguous allowances reserved; no early-success refunds. */
export async function enterPilotPhase(
  storage: TransactionStorage,
  phaseId: string,
  now: number,
  owner?: string,
) {
  await storage.transaction(async (tx) => {
    const cohort = await tx.get<PilotCohortState>(PILOT_COHORT_KEY);
    if (!cohort) throw new Error("Shared cohort unavailable");
    validatePilotCohort(cohort);
    assertPilotCustody(cohort, owner);
    const phase = cohort.plan.phases.find((p) => p.id === phaseId);
    const time = pilotTimeLimits(cohort.plan.computeEnvelope);
    const elapsed = now - cohort.startedAtMs - cohort.contingencySpentMs;
    const reservation = requireWholePilotAdmission(cohort.plan);
    const recovery = Boolean(phase?.terminalRecovery);
    if (cohort.recoveryReady && !recovery)
      throw new Error("Ordinary phase reservation refused after recovery transfer");
    if (recovery) requireTerminalRecoveryReady(cohort, owner, now);
    if (
      !phase ||
      cohort.enteredPhases.includes(phaseId) ||
      !Number.isSafeInteger(elapsed) ||
      elapsed < 0 ||
      (cohort.stopped && phase.purpose !== "cleanup") ||
      (!recovery && elapsed + reservation.activeMsAtLeast > time.plannedActiveWallMs) ||
      (!recovery &&
        ((elapsed +
          reservation.activeMsAtLeast +
          PILOT_LIMITS.hyperdriveTailMs +
          PILOT_LIMITS.neonTailMs) /
          3_600_000) *
          PILOT_LIMITS.maximumCU >
          time.plannedCUHours)
    )
      throw new Error("Whole phase reservation refused before entry");
    cohort.enteredPhases.push(phaseId);
    await tx.put(PILOT_COHORT_KEY, cohort);
  });
}

/** All independent authorities use this SAME transactional key, including cleanup. */
export function cohortPilotStore(
  storage: TransactionStorage,
  phaseId: string,
  owner?: string,
): AtomicPilotStore {
  return {
    transact: (change) =>
      storage.transaction(async (tx) => {
        const cohort = await tx.get<PilotCohortState>(PILOT_COHORT_KEY);
        if (!cohort) throw new Error("Shared cohort unavailable");
        validatePilotCohort(cohort);
        assertPilotCustody(cohort, owner);
        const time = pilotTimeLimits(cohort.plan.computeEnvelope);
        const budget = cohort.plan.phases.find((p) => p.id === phaseId);
        if (!budget || !cohort.enteredPhases.includes(phaseId)) throw new Error("Unreserved phase");
        const recovery = Boolean(budget.terminalRecovery);
        if (cohort.recoveryReady && !recovery)
          throw new Error("Only reserved terminal phases after recovery transfer");
        const prior = cohort.phases[phaseId] ?? null;
        const current = prior ? structuredClone(prior) : null;
        if (current && cohort.stopped) current.stopped = true;
        const { next, result } = change(current);
        if (!prior) {
          if (next.applicationStatements || next.requests.length)
            throw new Error("Nonempty phase initialization");
          next.startedAtMs = cohort.startedAtMs;
          next.startedAtUTC = new Date(cohort.startedAtMs).toISOString();
          next.stopped = cohort.stopped;
          next.serverTimeoutMs = budget.serverTimeoutMs;
          if (budget.ownerSessionBootstrap) next.ownerSessionBootstrap = true;
          if (cohort.plan.computeEnvelope)
            next.computeEnvelope = structuredClone(cohort.plan.computeEnvelope);
        }
        if (JSON.stringify(next.computeEnvelope) !== JSON.stringify(cohort.plan.computeEnvelope))
          throw new Error("Immutable phase compute envelope cannot change");
        if (next.serverTimeoutMs !== budget.serverTimeoutMs)
          throw new Error("Immutable phase server bound cannot change");
        if (next.ownerSessionBootstrap !== budget.ownerSessionBootstrap)
          throw new Error("Immutable dedicated owner bootstrap cannot change");
        for (const request of next.requests.slice(prior?.requests.length ?? 0)) {
          if (recovery)
            requireTerminalRecoveryReady(cohort, owner, Date.parse(request.admittedAtUTC));
          if (
            !recovery &&
            Object.values(cohort.phases).some((p) =>
              p.statements.some((s) => s.outcome === "authorized-unknown"),
            )
          )
            throw new Error("Unresolved shared statement retains its resource reservation");
          const elapsed =
            Date.parse(request.admittedAtUTC) - cohort.startedAtMs - cohort.contingencySpentMs;
          const reserved = requireWholePilotAdmission(cohort.plan);
          if (
            !Number.isSafeInteger(elapsed) ||
            elapsed < 0 ||
            (!recovery && elapsed + reserved.activeMsAtLeast > time.plannedActiveWallMs) ||
            (!recovery &&
              ((elapsed +
                reserved.activeMsAtLeast +
                PILOT_LIMITS.hyperdriveTailMs +
                PILOT_LIMITS.neonTailMs) /
                3_600_000) *
                PILOT_LIMITS.maximumCU >
                time.plannedCUHours)
          )
            throw new Error("Whole request reservation exhausted before connection");
        }
        const added = next.statements.slice(prior?.statements.length ?? 0);
        if (
          added.length > 1 ||
          next.applicationStatements < (prior?.applicationStatements ?? 0) ||
          JSON.stringify(
            next.statements.slice(0, prior?.statements.length ?? 0).map((s) => ({
              ...s,
              completedAtUTC: null,
              outcome: null,
              sqlstate: null,
              driverDispatchAuthorizedAtUTC: null,
              driverDispatchValidUntilUTC: null,
            })),
          ) !==
            JSON.stringify(
              (prior?.statements ?? []).map((s) => ({
                ...s,
                completedAtUTC: null,
                outcome: null,
                sqlstate: null,
                driverDispatchAuthorizedAtUTC: null,
                driverDispatchValidUntilUTC: null,
              })),
            )
        )
          throw new Error("Shared statement ledger cannot rewrite or refund");
        for (const statement of added) {
          if (
            budget.ownerSessionBootstrap &&
            statement.localSequence <= 2 &&
            (statement.sqlSHA256 !==
              scopedSQLFingerprint(
                statement.localSequence === 1 ? OWNER_SESSION_SET_SQL : OWNER_SESSION_READBACK_SQL,
              ) ||
              Boolean(statement.clientOnlyInitialSET) !== (statement.localSequence === 1))
          )
            throw new Error("Dedicated owner bootstrap sequence mismatch");
          if (
            recovery &&
            (statement.sqlSHA256 !== terminalPhaseSQLFingerprint(budget, statement.localSequence) ||
              statement.purpose !== "cleanup")
          )
            throw new Error("Terminal recovery SQL mismatch");
          const ceiling =
            statement.purpose === "cleanup"
              ? PILOT_LIMITS.applicationStatements
              : PILOT_LIMITS.applicationStatements - PILOT_LIMITS.cleanupStatementReserve;
          if (
            cohort.applicationStatements >= ceiling ||
            Object.values(cohort.phases).some((p) =>
              p.requests.some((r) => r.id !== statement.requestId && !r.ended),
            ) ||
            (budget.purpose === "cleanup" && statement.purpose !== "cleanup") ||
            (cohort.stopped && statement.purpose !== "cleanup")
          )
            throw new Error("Shared application allowance exhausted before dispatch");
          cohort.applicationStatements++;
          cohort.statements.push({
            phaseId,
            statementId: statement.id,
            id: `${phaseId}:${statement.id}`,
            applicationSequence: cohort.applicationStatements,
          });
        }
        cohort.phases[phaseId] = next;
        const phases = Object.values(cohort.phases);
        cohort.comparablePOSTs = phases.reduce((n, p) => n + p.comparablePOSTs, 0);
        cohort.connectionAdmissions = phases.reduce((n, p) => n + p.connectionAdmissions, 0);
        cohort.receivedDatabaseBytesReserved = phases.reduce(
          (n, p) => n + p.receivedDatabaseBytesReserved,
          0,
        );
        cohort.sentDatabaseBytesReserved = phases.reduce(
          (n, p) => n + p.sentDatabaseBytesReserved,
          0,
        );
        // Preserve the entire admitted execution set after earlier successes/ambiguity.
        // A newly durable send grant must still fit that conservative reservation.
        for (const statement of next.statements) {
          if (
            statement.driverDispatchAuthorizedAtUTC &&
            !prior?.statements.find((s) => s.id === statement.id)?.driverDispatchAuthorizedAtUTC
          ) {
            if (
              Object.values(cohort.phases).some((p) =>
                p.requests.some((r) => r.id !== statement.requestId && !r.ended),
              )
            )
              throw new Error("Shared driver concurrency reservation exhausted");
            if (recovery)
              requireTerminalRecoveryReady(
                cohort,
                owner,
                Date.parse(statement.driverDispatchAuthorizedAtUTC),
                `${phaseId}:${statement.id}`,
              );
            const elapsed =
              Date.parse(statement.driverDispatchAuthorizedAtUTC) -
              cohort.startedAtMs -
              cohort.contingencySpentMs;
            const reserved = requireWholePilotAdmission(cohort.plan);
            if (
              !Number.isSafeInteger(elapsed) ||
              elapsed < 0 ||
              (!recovery && elapsed + reserved.activeMsAtLeast > time.plannedActiveWallMs) ||
              (!recovery &&
                ((elapsed +
                  reserved.activeMsAtLeast +
                  PILOT_LIMITS.hyperdriveTailMs +
                  PILOT_LIMITS.neonTailMs) /
                  3_600_000) *
                  PILOT_LIMITS.maximumCU >
                  time.plannedCUHours)
            )
              throw new Error("Whole dispatch reservation exhausted before driver");
            const latestElapsed = recovery
              ? time.activeWallMs -
                budget.serverTimeoutMs -
                PILOT_LIMITS.connectionAcquisitionMs -
                PILOT_LIMITS.cleanupWallReserveMs
              : Math.min(
                  time.plannedActiveWallMs,
                  (time.plannedCUHours * 3_600_000) / PILOT_LIMITS.maximumCU -
                    PILOT_LIMITS.hyperdriveTailMs -
                    PILOT_LIMITS.neonTailMs,
                ) - reserved.activeMsAtLeast;
            if (
              !result ||
              typeof result !== "object" ||
              !("validForMs" in result) ||
              typeof result.validForMs !== "number" ||
              !("latestDriverSendAtUTC" in result)
            )
              throw new Error("Invalid shared driver grant");
            result.validForMs = Math.min(result.validForMs, latestElapsed - elapsed);
            const latest = Math.min(
              Date.parse(statement.driverDispatchValidUntilUTC!),
              cohort.startedAtMs + cohort.contingencySpentMs + latestElapsed,
            );
            result.latestDriverSendAtUTC = new Date(latest).toISOString();
            statement.driverDispatchValidUntilUTC = result.latestDriverSendAtUTC as string;
          }
        }
        const requests = phases.flatMap((p) => p.requests);
        const reservedCommands = next.requests.reduce((n, r) => n + r.maximumStatements, 0);
        if (
          next.applicationStatements > budget.commands ||
          reservedCommands > budget.commands ||
          next.comparablePOSTs > budget.POSTs ||
          next.connectionAdmissions > budget.connections ||
          next.receivedDatabaseBytesReserved > budget.receivedSocketReservation ||
          next.sentDatabaseBytesReserved > budget.sentSocketReservation ||
          requests.filter((r) => !r.ended).length > PILOT_LIMITS.concurrentRequests ||
          phases.reduce((n, p) => n + p.comparablePOSTs, 0) > PILOT_LIMITS.comparablePOSTs ||
          new Set(requests.map((r) => r.id)).size !== requests.length ||
          (prior &&
            (next.connectionAdmissions < prior.connectionAdmissions ||
              next.receivedDatabaseBytesReserved < prior.receivedDatabaseBytesReserved ||
              next.sentDatabaseBytesReserved < prior.sentDatabaseBytesReserved))
        )
          throw new Error("Shared phase resource reservation refused before dispatch");
        if (next.stopped) cohort.stopped = true;
        validatePilotCohort(cohort);
        await tx.put(PILOT_COHORT_KEY, cohort);
        return result;
      }),
  };
}

export async function stopPilotCohort(storage: TransactionStorage) {
  await storage.transaction(async (tx) => {
    const cohort = await tx.get<PilotCohortState>(PILOT_COHORT_KEY);
    if (!cohort) throw new Error("Shared cohort unavailable");
    validatePilotCohort(cohort);
    cohort.stopped = true;
    await tx.put(PILOT_COHORT_KEY, cohort);
  });
}

export function assertPilotCustody(cohort: PilotCohortState, owner?: string) {
  if (cohort.custody && (cohort.custody.retired || cohort.custody.owner !== owner))
    throw new Error("Retired or wrong pilot ledger owner");
}
export async function chargePilotSetupContingency(
  storage: TransactionStorage,
  owner: string,
  interval: { id: string; startedAtMs: number; endedAtMs: number; ambiguous: boolean },
) {
  const failed = await storage.transaction(async (tx) => {
    const cohort = await tx.get<PilotCohortState>(PILOT_COHORT_KEY);
    if (!cohort) throw new Error("Shared cohort unavailable");
    validatePilotCohort(cohort);
    assertPilotCustody(cohort, owner);
    if (
      !/^[A-Za-z0-9_-]{1,96}$/.test(interval.id) ||
      typeof interval.ambiguous !== "boolean" ||
      !Number.isSafeInteger(interval.startedAtMs) ||
      !Number.isSafeInteger(interval.endedAtMs) ||
      interval.startedAtMs < cohort.startedAtMs ||
      interval.endedAtMs < interval.startedAtMs ||
      cohort.setupIntervals.some(
        (i) =>
          i.id === interval.id ||
          (interval.startedAtMs < i.endedAtMs && interval.endedAtMs > i.startedAtMs),
      )
    )
      throw new Error("Invalid/replayed setup contingency interval");
    cohort.setupIntervals.push(structuredClone(interval));
    cohort.contingencySpentMs += interval.endedAtMs - interval.startedAtMs;
    const exceeded =
      cohort.contingencySpentMs > pilotTimeLimits(cohort.plan.computeEnvelope).contingencyMs;
    if (exceeded || interval.ambiguous) cohort.stopped = true;
    validatePilotCohort(cohort);
    await tx.put(PILOT_COHORT_KEY, cohort);
    return exceeded || interval.ambiguous;
  });
  // Persist the terminal receipt even when the cap or provider outcome is invalidated.
  if (failed) throw new Error("Setup contingency invalidated: ordinary pilot stopped");
}

/** Unknown driver grants retain their possible late-send + acquisition + server window. */
export function unresolvedPilotWindow(cohort: PilotCohortState, exclude?: string) {
  return Math.max(
    cohort.startedAtMs,
    ...Object.entries(cohort.phases).flatMap(([phaseId, p]) =>
      p.statements
        .filter((s) => s.outcome === "authorized-unknown" && `${phaseId}:${s.id}` !== exclude)
        .map((s) =>
          s.clientOnlyInitialSET
            ? Number.POSITIVE_INFINITY
            : (s.driverDispatchValidUntilUTC
                ? Date.parse(s.driverDispatchValidUntilUTC)
                : Date.parse(s.authorizedAtUTC) + 1_000) +
              PILOT_LIMITS.connectionAcquisitionMs +
              s.serverTimeoutMs,
        ),
    ),
  );
}
export function requireTerminalRecoveryReady(
  cohort: PilotCohortState,
  owner: string | undefined,
  now: number,
  exclude?: string,
) {
  if (
    !cohort.stopped ||
    !cohort.recoveryReady ||
    cohort.recoveryReady.owner !== owner ||
    cohort.recoveryReady.clientOnlyBootstrapUnresolved ||
    !Number.isSafeInteger(now) ||
    now < cohort.recoveryReady.notBeforeMs ||
    now < unresolvedPilotWindow(cohort, exclude)
  )
    throw new Error("Terminal recovery is not quiescent/owned");
}
