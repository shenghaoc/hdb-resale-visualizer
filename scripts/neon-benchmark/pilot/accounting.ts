import { createHash } from "node:crypto";
import { OWNER_SESSION_SET_SQL } from "./session-owner";

/** One shared, durable authority per pilot. Provider counters never authorize SQL. */
export const PILOT_LIMITS = Object.freeze({
  applicationStatements: 90,
  cleanupStatementReserve: 10,
  comparablePOSTs: 3,
  // Retained application-visible socket tripwire/reservation only. The former promise
  // of a physical 25 MB cap including opaque Hyperdrive-origin traffic is withdrawn.
  // A received chunk can cross this tripwire; it is not a precomputed payload proof.
  receivedDatabaseBytes: 25_000_000,
  sentDatabaseBytes: 1_000_000,
  applicationConnections: 13,
  concurrentRequests: 1,
  statementTimeoutMs: 60_000,
  connectionAcquisitionMs: 15_000,
  activeWallMs: 300_000,
  cleanupWallReserveMs: 45_000,
  computeCUHoursProxy: 0.35,
  maximumCU: 1,
  hyperdriveOriginConnections: 5,
  hyperdriveTailMs: 600_000,
  neonTailMs: 300_000,
});

/** Only the newly approved candidate pilot receives this split envelope. */
export type ScopedComputeEnvelope = {
  scope: "candidate-scoped-timeout-20261005";
  plannedCUHours: 0.45;
  contingencyCUHours: 0.05;
};
export const SCOPED_COMPUTE_ENVELOPE: ScopedComputeEnvelope = Object.freeze({
  scope: "candidate-scoped-timeout-20261005",
  plannedCUHours: 0.45,
  contingencyCUHours: 0.05,
});
export function pilotTimeLimits(envelope?: ScopedComputeEnvelope) {
  if (!envelope)
    return {
      activeWallMs: PILOT_LIMITS.activeWallMs,
      plannedActiveWallMs: PILOT_LIMITS.activeWallMs,
      computeCUHoursProxy: PILOT_LIMITS.computeCUHoursProxy,
      plannedCUHours: PILOT_LIMITS.computeCUHoursProxy,
      contingencyMs: 0,
    };
  if (
    Object.keys(envelope).length !== 3 ||
    envelope.scope !== SCOPED_COMPUTE_ENVELOPE.scope ||
    envelope.plannedCUHours !== 0.45 ||
    envelope.contingencyCUHours !== 0.05
  )
    throw new Error("Unapproved pilot compute envelope");
  return {
    activeWallMs: 900_000,
    plannedActiveWallMs: 720_000,
    computeCUHoursProxy: 0.5,
    plannedCUHours: 0.45,
    contingencyMs: 180_000,
  };
}

export type StatementPurpose = "work" | "cleanup";
export type StatementIntent = {
  requestId: string;
  localSequence: number;
  label: string;
  sqlSHA256: string;
  purpose: StatementPurpose;
  clientOnlyInitialSET?: true;
};
export type StatementRecord = StatementIntent & {
  id: string;
  applicationSequence: number;
  authorizedAtUTC: string;
  completedAtUTC: string | null;
  outcome: "authorized-unknown" | "succeeded" | "failed";
  sqlstate: string | null;
  driverDispatchAuthorizedAtUTC: string | null;
  driverDispatchValidUntilUTC: string | null;
  serverTimeoutMs: number;
};
export type DriverDispatchGrant = {
  statementId: string;
  serverTimeoutMs: number;
  validForMs: number;
  latestDriverSendAtUTC: string;
};

/** Conservatively reserves acquisition even for an already warm connection. */
export function serverWindowReservation(
  elapsedWallMs: number,
  serverTimeoutMs: number = PILOT_LIMITS.statementTimeoutMs,
  computeEnvelope?: ScopedComputeEnvelope,
) {
  if (
    !Number.isSafeInteger(elapsedWallMs) ||
    elapsedWallMs < 0 ||
    !Number.isSafeInteger(serverTimeoutMs) ||
    serverTimeoutMs < 1 ||
    serverTimeoutMs > PILOT_LIMITS.statementTimeoutMs
  )
    throw new Error("Invalid server window clock");
  const limits = pilotTimeLimits(computeEnvelope);
  const requiredActiveMs =
    elapsedWallMs +
    PILOT_LIMITS.connectionAcquisitionMs +
    serverTimeoutMs +
    PILOT_LIMITS.cleanupWallReserveMs;
  const requiredCUHours =
    ((requiredActiveMs + PILOT_LIMITS.hyperdriveTailMs + PILOT_LIMITS.neonTailMs) / 3_600_000) *
    PILOT_LIMITS.maximumCU;
  return {
    requiredActiveMs,
    requiredCUHours,
    fits: requiredActiveMs <= limits.activeWallMs && requiredCUHours <= limits.computeCUHoursProxy,
    latestElapsedDriverSendMs:
      Math.min(
        limits.activeWallMs,
        (limits.computeCUHoursProxy * 3_600_000) / PILOT_LIMITS.maximumCU -
          PILOT_LIMITS.hyperdriveTailMs -
          PILOT_LIMITS.neonTailMs,
      ) -
      PILOT_LIMITS.connectionAcquisitionMs -
      serverTimeoutMs -
      PILOT_LIMITS.cleanupWallReserveMs,
  };
}
export type RequestAdmission = {
  id: string;
  sequence: number;
  method: "GET" | "POST";
  maximumStatements: number;
  maximumReceivedDatabaseBytes: number;
  maximumSentDatabaseBytes: number;
  maximumWallMs?: number;
  purpose?: StatementPurpose;
};
export type RequestRecord = RequestAdmission & {
  serverTimeoutMs: number;
  admittedAtUTC: string;
  deadlineAtMs: number;
  activated: boolean;
  ended: boolean;
  outcome: "admitted-unknown" | "complete" | "failed-unknown";
  applicationStatements: number;
};
export type ServerObservation = {
  phase: string;
  observedAtUTC: string;
  role: string;
  databaseId: string | null;
  calls: number | null;
  sqlMs: number | null;
  completeAttemptAccounting: false;
};
export type PilotState = {
  runId: string;
  startedAtUTC: string;
  startedAtMs: number;
  stopped: boolean;
  /** Derived from the immutable cohort phase; absent only in a legacy standalone authority. */
  serverTimeoutMs?: number;
  ownerSessionBootstrap?: true;
  computeEnvelope?: ScopedComputeEnvelope;
  applicationStatements: number;
  comparablePOSTs: number;
  connectionAdmissions: number;
  receivedDatabaseBytesReserved: number;
  sentDatabaseBytesReserved: number;
  requests: RequestRecord[];
  statements: StatementRecord[];
  serverObservations: ServerObservation[];
};

/** Must serialize across ALL controllers/Worker instances and commit before resolving. */
export type AtomicPilotStore = {
  transact<T>(
    change: (current: PilotState | null) => {
      next: PilotState;
      result: T;
    },
  ): Promise<T>;
};
export type PilotAuthority = Pick<
  AtomicPilotAuthority,
  | "initialize"
  | "snapshot"
  | "admitRequest"
  | "activateRequest"
  | "finishRequest"
  | "authorizeStatement"
  | "authorizeDriverDispatch"
  | "completeStatement"
  | "observeServer"
  | "stop"
>;

const safeId = /^[a-zA-Z0-9_-]{1,96}$/;
function requireId(id: string) {
  if (!safeId.test(id)) throw new Error("Invalid pilot attribution ID");
}
function positiveInteger(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid pilot allowance");
}
export function validatePilotState(state: PilotState) {
  pilotTimeLimits(state.computeEnvelope);
  if (
    (state.serverTimeoutMs !== undefined &&
      (!Number.isSafeInteger(state.serverTimeoutMs) ||
        state.serverTimeoutMs < 1 ||
        state.serverTimeoutMs > PILOT_LIMITS.statementTimeoutMs)) ||
    typeof state.stopped !== "boolean" ||
    !Number.isFinite(state.startedAtMs) ||
    !Number.isSafeInteger(state.applicationStatements) ||
    state.applicationStatements < 0 ||
    state.applicationStatements > PILOT_LIMITS.applicationStatements ||
    !Array.isArray(state.statements) ||
    state.statements.length !== state.applicationStatements ||
    !Array.isArray(state.requests) ||
    state.requests.length > PILOT_LIMITS.applicationConnections ||
    !Array.isArray(state.serverObservations) ||
    state.statements.some((record, index) => record.applicationSequence !== index + 1) ||
    new Set(state.statements.map((record) => record.id)).size !== state.statements.length ||
    ![
      state.comparablePOSTs,
      state.connectionAdmissions,
      state.receivedDatabaseBytesReserved,
      state.sentDatabaseBytesReserved,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    state.comparablePOSTs > PILOT_LIMITS.comparablePOSTs ||
    state.connectionAdmissions !== state.requests.length ||
    state.comparablePOSTs !==
      state.requests.filter((request) => request.method === "POST").length ||
    state.receivedDatabaseBytesReserved > PILOT_LIMITS.receivedDatabaseBytes ||
    state.sentDatabaseBytesReserved > PILOT_LIMITS.sentDatabaseBytes ||
    state.receivedDatabaseBytesReserved !==
      state.requests.reduce((sum, request) => sum + request.maximumReceivedDatabaseBytes, 0) ||
    state.sentDatabaseBytesReserved !==
      state.requests.reduce((sum, request) => sum + request.maximumSentDatabaseBytes, 0) ||
    state.requests.filter((request) => !request.ended).length > PILOT_LIMITS.concurrentRequests ||
    new Set(state.requests.map((request) => request.id)).size !== state.requests.length ||
    new Set(state.requests.map((request) => request.sequence)).size !== state.requests.length ||
    state.requests.some(
      (request) =>
        request.serverTimeoutMs !== (state.serverTimeoutMs ?? PILOT_LIMITS.statementTimeoutMs) ||
        !Number.isSafeInteger(request.applicationStatements) ||
        request.applicationStatements < 0 ||
        request.applicationStatements > request.maximumStatements ||
        request.applicationStatements !==
          state.statements.filter((statement) => statement.requestId === request.id).length,
    ) ||
    state.statements.some(
      (statement) =>
        statement.serverTimeoutMs !==
          (statement.clientOnlyInitialSET
            ? 0
            : (state.serverTimeoutMs ?? PILOT_LIMITS.statementTimeoutMs)) ||
        (statement.clientOnlyInitialSET &&
          (!state.ownerSessionBootstrap ||
            statement.localSequence !== 1 ||
            statement.sqlSHA256 !==
              createHash("sha256").update(OWNER_SESSION_SET_SQL).digest("hex"))),
    )
  )
    throw new Error("Corrupt pilot authority fails closed");
}

export class AtomicPilotAuthority {
  constructor(
    private readonly store: AtomicPilotStore,
    private readonly runId: string,
    private readonly now: () => number = Date.now,
  ) {
    requireId(runId);
  }

  private update<T>(change: (state: PilotState) => T): Promise<T> {
    return this.store.transact((current) => {
      if (!current || current.runId !== this.runId) throw new Error("Pilot authority unavailable");
      validatePilotState(current);
      const state = structuredClone(current);
      const result = change(state);
      validatePilotState(state);
      return { next: state, result };
    });
  }

  private withinTime(state: PilotState, purpose: StatementPurpose) {
    const elapsed = this.now() - state.startedAtMs;
    const limits = pilotTimeLimits(state.computeEnvelope);
    const maximum =
      purpose === "cleanup"
        ? limits.activeWallMs
        : limits.activeWallMs - PILOT_LIMITS.cleanupWallReserveMs;
    if (
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      elapsed >= maximum ||
      (state.stopped && purpose !== "cleanup")
    )
      throw new Error("Pilot stopped or duration allowance exhausted");
  }

  private fullServerWindow(state: PilotState) {
    const window = serverWindowReservation(
      this.now() - state.startedAtMs,
      state.serverTimeoutMs,
      state.computeEnvelope,
    );
    if (!window.fits) throw new Error("Full server duration/compute reservation exhausted");
    return window;
  }

  async initialize(): Promise<void> {
    await this.store.transact((current) => {
      if (current) throw new Error("Existing pilot authority cannot be reset");
      const startedAtMs = this.now();
      return {
        next: {
          runId: this.runId,
          startedAtMs,
          startedAtUTC: new Date(startedAtMs).toISOString(),
          stopped: false,
          applicationStatements: 0,
          comparablePOSTs: 0,
          connectionAdmissions: 0,
          receivedDatabaseBytesReserved: 0,
          sentDatabaseBytesReserved: 0,
          requests: [],
          statements: [],
          serverObservations: [],
        },
        result: undefined,
      };
    });
  }

  snapshot(): Promise<PilotState> {
    return this.update((state) => structuredClone(state));
  }

  admitRequest(admission: RequestAdmission): Promise<RequestRecord> {
    requireId(admission.id);
    if (
      !["GET", "POST"].includes(admission.method) ||
      (admission.purpose !== undefined && !["work", "cleanup"].includes(admission.purpose))
    )
      throw new Error("Invalid pilot request scope");
    for (const value of [
      admission.sequence,
      admission.maximumStatements,
      admission.maximumReceivedDatabaseBytes,
      admission.maximumSentDatabaseBytes,
    ])
      positiveInteger(value);
    return this.update((state) => {
      const purpose = admission.purpose ?? "work";
      const limits = pilotTimeLimits(state.computeEnvelope);
      this.withinTime(state, purpose);
      this.fullServerWindow(state);
      const maximumWallMs =
        admission.maximumWallMs ??
        (admission.method === "POST" ? 35_000 : purpose === "cleanup" ? 10_000 : 85_000);
      positiveInteger(maximumWallMs);
      if (
        maximumWallMs > 85_000 ||
        this.now() + maximumWallMs >
          state.startedAtMs +
            limits.activeWallMs -
            (purpose === "cleanup" ? 0 : PILOT_LIMITS.cleanupWallReserveMs)
      )
        throw new Error("Pilot duration reservation exhausted before dispatch");
      if (
        state.requests.length >= 64 ||
        state.requests.some((request) => request.id === admission.id || !request.ended) ||
        state.requests.some((request) => request.sequence === admission.sequence) ||
        state.statements.some((statement) => statement.outcome === "authorized-unknown") ||
        state.applicationStatements +
          admission.maximumStatements +
          (purpose === "cleanup" ? 0 : PILOT_LIMITS.cleanupStatementReserve) >
          PILOT_LIMITS.applicationStatements ||
        state.connectionAdmissions >= PILOT_LIMITS.applicationConnections ||
        state.receivedDatabaseBytesReserved + admission.maximumReceivedDatabaseBytes >
          PILOT_LIMITS.receivedDatabaseBytes ||
        state.sentDatabaseBytesReserved + admission.maximumSentDatabaseBytes >
          PILOT_LIMITS.sentDatabaseBytes ||
        (admission.method === "POST" && state.comparablePOSTs >= PILOT_LIMITS.comparablePOSTs)
      )
        throw new Error("Pilot request admission refused before dispatch");
      if (admission.method === "POST") state.comparablePOSTs++;
      state.connectionAdmissions++;
      // No refunds: a lost outcome retains its entire protocol-transfer/connection reservation.
      state.receivedDatabaseBytesReserved += admission.maximumReceivedDatabaseBytes;
      state.sentDatabaseBytesReserved += admission.maximumSentDatabaseBytes;
      const record: RequestRecord = {
        serverTimeoutMs: state.serverTimeoutMs ?? PILOT_LIMITS.statementTimeoutMs,
        id: admission.id,
        sequence: admission.sequence,
        method: admission.method,
        maximumStatements: admission.maximumStatements,
        maximumReceivedDatabaseBytes: admission.maximumReceivedDatabaseBytes,
        maximumSentDatabaseBytes: admission.maximumSentDatabaseBytes,
        maximumWallMs,
        deadlineAtMs: this.now() + maximumWallMs,
        purpose,
        admittedAtUTC: new Date(this.now()).toISOString(),
        activated: false,
        ended: false,
        outcome: "admitted-unknown",
        applicationStatements: 0,
      };
      state.requests.push(record);
      return structuredClone(record);
    });
  }

  /** A shared durable activation prevents replay, including another Worker instance. */
  activateRequest(id: string): Promise<void> {
    return this.update((state) => {
      const request = state.requests.find((entry) => entry.id === id);
      this.withinTime(state, request?.purpose ?? "work");
      if (!request || request.activated || request.ended || this.now() >= request.deadlineAtMs)
        throw new Error("Unadmitted or replayed pilot request");
      request.activated = true;
    });
  }

  finishRequest(id: string, outcome: "complete" | "failed-unknown"): Promise<void> {
    return this.update((state) => {
      const request = state.requests.find((entry) => entry.id === id);
      if (!request) throw new Error("Unknown pilot request");
      request.ended = true;
      if (state.statements.some((s) => s.requestId === id && s.outcome === "authorized-unknown"))
        outcome = "failed-unknown";
      // Cleanup or a late successful response cannot erase an earlier unknown failure.
      if (request.outcome !== "failed-unknown") request.outcome = outcome;
      if (outcome === "failed-unknown") state.stopped = true;
    });
  }

  authorizeStatement(intent: StatementIntent): Promise<StatementRecord> {
    requireId(intent.requestId);
    requireId(intent.label);
    positiveInteger(intent.localSequence);
    if (!["work", "cleanup"].includes(intent.purpose)) throw new Error("Invalid statement scope");
    if (!/^[a-f0-9]{64}$/.test(intent.sqlSHA256)) throw new Error("Invalid SQL fingerprint");
    return this.update((state) => {
      this.withinTime(state, intent.purpose);
      this.fullServerWindow(state);
      const id = `${intent.requestId}:s${intent.localSequence}`;
      const request = state.requests.find((entry) => entry.id === intent.requestId);
      if (
        intent.clientOnlyInitialSET &&
        (!state.ownerSessionBootstrap ||
          intent.localSequence !== 1 ||
          request?.applicationStatements !== 0 ||
          intent.sqlSHA256 !== createHash("sha256").update(OWNER_SESSION_SET_SQL).digest("hex"))
      )
        throw new Error("Unreserved client-only initial SET");
      const maximum =
        intent.purpose === "cleanup"
          ? PILOT_LIMITS.applicationStatements
          : PILOT_LIMITS.applicationStatements - PILOT_LIMITS.cleanupStatementReserve;
      if (
        state.statements.some((entry) => entry.id === id) ||
        state.applicationStatements >= maximum ||
        !request?.activated ||
        (intent.purpose !== "cleanup" && this.now() >= request.deadlineAtMs) ||
        (request.ended && intent.purpose !== "cleanup") ||
        state.requests.some((entry) => entry.id !== intent.requestId && !entry.ended) ||
        request.applicationStatements >= request.maximumStatements
      )
        throw new Error("Application statement refused before dispatch");
      state.applicationStatements++;
      request.applicationStatements++;
      const record: StatementRecord = {
        // Zero explicitly means NO proved server ceiling for the initial SET.
        serverTimeoutMs: intent.clientOnlyInitialSET ? 0 : request.serverTimeoutMs,
        requestId: intent.requestId,
        localSequence: intent.localSequence,
        label: intent.label,
        sqlSHA256: intent.sqlSHA256,
        purpose: intent.purpose,
        ...(intent.clientOnlyInitialSET ? { clientOnlyInitialSET: true as const } : {}),
        id,
        applicationSequence: state.applicationStatements,
        authorizedAtUTC: new Date(this.now()).toISOString(),
        completedAtUTC: null,
        outcome: "authorized-unknown",
        sqlstate: null,
        driverDispatchAuthorizedAtUTC: null,
        driverDispatchValidUntilUTC: null,
      };
      state.statements.push(record);
      return structuredClone(record);
    });
  }

  /** Durable recheck after asynchronous evidence persistence; a lost grant stays charged. */
  authorizeDriverDispatch(id: string): Promise<DriverDispatchGrant> {
    return this.update((state) => {
      const record = state.statements.find((entry) => entry.id === id);
      if (
        !record ||
        record.outcome !== "authorized-unknown" ||
        record.driverDispatchAuthorizedAtUTC
      )
        throw new Error("Unpermitted or replayed driver dispatch");
      this.withinTime(state, record.purpose);
      const window = this.fullServerWindow(state);
      const request = state.requests.find((entry) => entry.id === record.requestId);
      if (
        !request?.activated ||
        (record.purpose === "work" && request.ended) ||
        state.requests.some((r) => r.id !== record.requestId && !r.ended) ||
        (record.purpose === "work" && this.now() >= request.deadlineAtMs)
      )
        throw new Error("Driver request deadline exhausted");
      const latest = Math.min(
        state.startedAtMs + window.latestElapsedDriverSendMs,
        record.purpose === "work" ? request.deadlineAtMs : Number.POSITIVE_INFINITY,
        state.computeEnvelope ? this.now() + 1_000 : Number.POSITIVE_INFINITY,
      );
      record.driverDispatchAuthorizedAtUTC = new Date(this.now()).toISOString();
      record.driverDispatchValidUntilUTC = new Date(latest).toISOString();
      return {
        statementId: id,
        serverTimeoutMs: record.serverTimeoutMs,
        validForMs: latest - this.now(),
        latestDriverSendAtUTC: new Date(latest).toISOString(),
      };
    });
  }

  completeStatement(
    id: string,
    outcome: "succeeded" | "failed",
    sqlstate: string | null,
  ): Promise<void> {
    return this.update((state) => {
      const record = state.statements.find((entry) => entry.id === id);
      if (!record || record.outcome !== "authorized-unknown")
        throw new Error("Statement outcome cannot be overwritten");
      record.outcome = outcome;
      record.sqlstate = sqlstate && /^[0-9A-Z]{5}$/.test(sqlstate) ? sqlstate : null;
      record.completedAtUTC = new Date(this.now()).toISOString();
    });
  }

  observeServer(observation: ServerObservation): Promise<void> {
    requireId(observation.phase);
    if (
      typeof observation.observedAtUTC !== "string" ||
      observation.observedAtUTC.length > 40 ||
      !["hdb_benchmark_runtime", "neondb_owner"].includes(observation.role) ||
      (observation.databaseId !== null && !/^\d+$/.test(observation.databaseId)) ||
      [observation.calls, observation.sqlMs].some(
        (value) => value !== null && (!Number.isFinite(value) || value < 0),
      )
    )
      throw new Error("Invalid bounded server observation");
    return this.update((state) => {
      if (state.serverObservations.length >= 32) throw new Error("Server observation cap");
      state.serverObservations.push({
        phase: observation.phase,
        observedAtUTC: observation.observedAtUTC,
        role: observation.role,
        databaseId: observation.databaseId,
        calls: observation.calls,
        sqlMs: observation.sqlMs,
        completeAttemptAccounting: false,
      });
    });
  }

  stop(): Promise<void> {
    return this.update((state) => {
      state.stopped = true;
    });
  }
}
