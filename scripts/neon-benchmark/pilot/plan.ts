import {
  PILOT_LIMITS,
  pilotTimeLimits,
  type ScopedComputeEnvelope,
  type StatementPurpose,
} from "./accounting";
import { SCOPED_RESTORE_SQL, SCOPED_VERIFY_SQL, scopedSQLFingerprint } from "./scoped-sql";
import { OWNER_SESSION_SET_SQL, OWNER_SESSION_READBACK_SQL } from "./session-owner";

export type PilotPhaseBudget = {
  id: string;
  purpose: StatementPurpose;
  commands: number;
  POSTs: number;
  connections: number;
  expectedResultMessageBytes: number;
  receivedSocketReservation: number;
  sentSocketReservation: number;
  serverTimeoutMs: number;
  /** Evidence prerequisite, never inferred from a client deadline or a query plan. */
  serverTimeoutEnforced: boolean;
  terminalRecovery?: "restore" | "verify";
  /** One initial SET is client bounded only; all remaining SQL follows acknowledged2s readback. */
  ownerSessionBootstrap?: true;
  clientOnlyBootstrapMs?: number;
};
export type WholePilotPlan = {
  phases: readonly PilotPhaseBudget[];
  computeEnvelope?: ScopedComputeEnvelope;
  /** Unknown setup is separately charged; no asserted provider acceptance deadline. */
  setupContingencyTracked?: boolean;
  /** No-SQL control work reserved in the planned envelope, never setup contingency. */
  plannedControlWallMs?: number;
  /** Worker/Hyperdrive provisioning that may keep Neon active, in addition to acquisition. */
  setupActiveMs: number | null;
  setupBoundEnforced: boolean;
};

function integer(value: number, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error("Invalid pilot plan");
}

/** Whole-operation reservation BEFORE provisioning. No overlapping server work is credited. */
export function evaluateWholePilotPlan(plan: WholePilotPlan) {
  const limits = pilotTimeLimits(plan.computeEnvelope);
  if (!plan.phases.length || plan.phases.length > PILOT_LIMITS.applicationStatements)
    throw new Error("Invalid pilot phases");
  const ids = new Set<string>();
  for (const phase of plan.phases) {
    if (
      !/^[A-Za-z0-9_-]{1,96}$/.test(phase.id) ||
      ["__proto__", "constructor", "prototype"].includes(phase.id) ||
      ids.has(phase.id)
    )
      throw new Error("Invalid or repeated phase identity");
    ids.add(phase.id);
    for (const value of [phase.commands, phase.connections, phase.serverTimeoutMs])
      integer(value, 1);
    for (const value of [
      phase.POSTs,
      phase.expectedResultMessageBytes,
      phase.receivedSocketReservation,
      phase.sentSocketReservation,
    ])
      integer(value);
    if (
      !["work", "cleanup"].includes(phase.purpose) ||
      typeof phase.serverTimeoutEnforced !== "boolean" ||
      phase.serverTimeoutMs > PILOT_LIMITS.statementTimeoutMs
    )
      throw new Error("Invalid pilot enforcement scope");
    if (
      phase.terminalRecovery &&
      (!["restore", "verify"].includes(phase.terminalRecovery) ||
        phase.commands !== (phase.ownerSessionBootstrap ? 3 : 1) ||
        phase.connections !== 1 ||
        phase.POSTs !== 0 ||
        phase.purpose !== "cleanup" ||
        phase.serverTimeoutMs !== (phase.ownerSessionBootstrap ? 2_000 : 60_000) ||
        !plan.computeEnvelope)
    )
      throw new Error("Unreserved terminal recovery scope");
    if (
      phase.ownerSessionBootstrap &&
      (phase.connections !== 1 ||
        phase.commands < 3 ||
        phase.serverTimeoutMs !== 2_000 ||
        phase.clientOnlyBootstrapMs !== 15_000 ||
        (phase.terminalRecovery !== undefined && phase.terminalRecovery !== "restore"))
    )
      throw new Error("Unreserved dedicated owner session bootstrap");
    if (!phase.ownerSessionBootstrap && phase.clientOnlyBootstrapMs !== undefined)
      throw new Error("Unreserved client-only bootstrap window");
  }
  if (plan.setupActiveMs !== null) integer(plan.setupActiveMs);
  integer(plan.plannedControlWallMs ?? 0);
  if (typeof plan.setupBoundEnforced !== "boolean") throw new Error("Invalid setup evidence");
  const commands = plan.phases.reduce((n, p) => n + p.commands, 0);
  const workCommands = plan.phases
    .filter((p) => p.purpose === "work")
    .reduce((n, p) => n + p.commands, 0);
  const cleanupCommands = commands - workCommands;
  const POSTs = plan.phases.reduce((n, p) => n + p.POSTs, 0);
  const connections = plan.phases.reduce((n, p) => n + p.connections, 0);
  const expectedResultMessageBytes = plan.phases.reduce(
    (n, p) => n + p.expectedResultMessageBytes,
    0,
  );
  const receivedSocketReservation = plan.phases.reduce(
    (n, p) => n + p.receivedSocketReservation,
    0,
  );
  const sentSocketReservation = plan.phases.reduce((n, p) => n + p.sentSocketReservation, 0);
  const clientOnlyBootstrapCommands = plan.phases.filter((p) => p.ownerSessionBootstrap).length;
  const clientOnlyBootstrapMs = plan.phases.reduce((n, p) => n + (p.clientOnlyBootstrapMs ?? 0), 0);
  const serverExecutionMs = plan.phases.reduce(
    (n, p) => n + (p.commands - (p.ownerSessionBootstrap ? 1 : 0)) * p.serverTimeoutMs,
    0,
  );
  const acquisitionMs = connections * PILOT_LIMITS.connectionAcquisitionMs;
  const globalActiveMs =
    acquisitionMs +
    PILOT_LIMITS.cleanupWallReserveMs +
    (plan.setupActiveMs ?? 0) +
    (plan.plannedControlWallMs ?? 0);
  const activeMsAtLeast = serverExecutionMs + clientOnlyBootstrapMs + globalActiveMs;
  const CUHoursAtLeast =
    ((activeMsAtLeast + PILOT_LIMITS.hyperdriveTailMs + PILOT_LIMITS.neonTailMs) / 3_600_000) *
    PILOT_LIMITS.maximumCU;
  const failures: string[] = [];
  if (
    commands > PILOT_LIMITS.applicationStatements ||
    workCommands > PILOT_LIMITS.applicationStatements - PILOT_LIMITS.cleanupStatementReserve ||
    cleanupCommands < PILOT_LIMITS.cleanupStatementReserve
  )
    failures.push("command/cleanup reservation");
  if (POSTs > PILOT_LIMITS.comparablePOSTs) failures.push("POST reservation");
  if (connections > PILOT_LIMITS.applicationConnections) failures.push("connection reservation");
  if (
    receivedSocketReservation > PILOT_LIMITS.receivedDatabaseBytes ||
    sentSocketReservation > PILOT_LIMITS.sentDatabaseBytes
  )
    failures.push("application socket reservation");
  if (activeMsAtLeast > limits.plannedActiveWallMs) failures.push("whole-plan active wall");
  if (CUHoursAtLeast > limits.plannedCUHours) failures.push("whole-plan compute");
  if (
    (plan.setupActiveMs === null || !plan.setupBoundEnforced) &&
    !(plan.computeEnvelope && plan.setupContingencyTracked === true)
  )
    failures.push("setup bound unproved");
  if (plan.phases.some((p) => !p.serverTimeoutEnforced)) failures.push("server timeout unproved");
  return {
    commands,
    workCommands,
    cleanupCommands,
    POSTs,
    connections,
    expectedResultMessageBytes,
    receivedSocketReservation,
    sentSocketReservation,
    serverExecutionMs,
    clientOnlyBootstrapCommands,
    clientOnlyBootstrapMs,
    initialSETServerBoundProven: clientOnlyBootstrapCommands ? false : null,
    acquisitionMs,
    globalActiveMs,
    plannedControlWallMs: plan.plannedControlWallMs ?? 0,
    activeMsAtLeast,
    CUHoursAtLeast,
    plannedComputeCeiling: limits.plannedCUHours,
    setupContingencyMs: limits.contingencyMs,
    totalComputeCeiling: limits.computeCUHoursProxy,
    failures,
    admitted: failures.length === 0,
  };
}

export function terminalPhaseSQLFingerprint(phase: PilotPhaseBudget, ordinal = 1) {
  if (phase.ownerSessionBootstrap && phase.terminalRecovery === "restore")
    return [OWNER_SESSION_SET_SQL, OWNER_SESSION_READBACK_SQL, SCOPED_RESTORE_SQL][ordinal - 1]
      ? scopedSQLFingerprint(
          [OWNER_SESSION_SET_SQL, OWNER_SESSION_READBACK_SQL, SCOPED_RESTORE_SQL][ordinal - 1],
        )
      : null;
  return phase.terminalRecovery === "restore"
    ? scopedSQLFingerprint(SCOPED_RESTORE_SQL)
    : phase.terminalRecovery === "verify"
      ? scopedSQLFingerprint(SCOPED_VERIFY_SQL)
      : null;
}

export function requireWholePilotAdmission(plan: WholePilotPlan) {
  const reservation = evaluateWholePilotPlan(plan);
  if (!reservation.admitted)
    throw new Error(`Whole pilot refused before provisioning: ${reservation.failures.join(", ")}`);
  return reservation;
}

/** Current role remains 60 seconds. This complete proposed plan is deliberately NOT admissible. */
export const COMPARABLE_WHOLE_PILOT_PLAN: WholePilotPlan = {
  setupActiveMs: null,
  setupBoundEnforced: false,
  phases: [
    {
      id: "safeguards",
      purpose: "work",
      commands: 8,
      POSTs: 0,
      connections: 1,
      expectedResultMessageBytes: 3576,
      receivedSocketReservation: 131072,
      sentSocketReservation: 32768,
    },
    {
      id: "candidate-sequential-diagnostic-20261005",
      purpose: "work",
      commands: 3,
      POSTs: 0,
      connections: 2,
      expectedResultMessageBytes: 684,
      receivedSocketReservation: 131072,
      sentSocketReservation: 32768,
    },
    {
      id: "candidate-concurrent-diagnostic-20261005",
      purpose: "work",
      commands: 1,
      POSTs: 0,
      connections: 1,
      expectedResultMessageBytes: 300,
      receivedSocketReservation: 65536,
      sentSocketReservation: 16384,
    },
    {
      id: "initial-observations",
      purpose: "work",
      commands: 2,
      POSTs: 0,
      connections: 1,
      expectedResultMessageBytes: 861,
      receivedSocketReservation: 65536,
      sentSocketReservation: 16384,
    },
    {
      id: "comparables",
      purpose: "work",
      commands: 27,
      POSTs: 3,
      connections: 3,
      expectedResultMessageBytes: 165087,
      receivedSocketReservation: 6000000,
      sentSocketReservation: 90000,
    },
    {
      id: "cleanup",
      purpose: "cleanup",
      commands: 10,
      POSTs: 0,
      connections: 1,
      expectedResultMessageBytes: 4470,
      receivedSocketReservation: 65536,
      sentSocketReservation: 16384,
    },
  ].map((phase) => ({
    ...phase,
    purpose: phase.purpose as StatementPurpose,
    serverTimeoutMs: PILOT_LIMITS.statementTimeoutMs,
    serverTimeoutEnforced: true,
  })),
};
