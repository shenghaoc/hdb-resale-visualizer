/** Offline planning only; these functions never authorize remote dispatch or change budgets. */
import { PILOT_LIMITS, serverWindowReservation } from "./accounting";
import { evaluateWholePilotPlan } from "./plan";

export const WITHDRAWN_PHYSICAL_PROMISE =
  "Withdrawn: a physical 25 MB cap across application plus opaque Hyperdrive traffic cannot be guaranteed.";
export const PROPOSED_APPLICATION_RESULT_CAP_BYTES = 2_000_000;
export const PROPOSED_RESPONSE_CAP_BYTES = 131_072;

export type ResultColumnBound = { name: string; maximumTextBytes: number };
export type QueryResultBound = {
  maximumRows: number;
  maximumRowBytes: number;
  maximumDataRowBytes: number;
  maximumRowDescriptionBytes: number;
  maximumExpectedResultMessageBytes: number;
  completeSocketBytesUpper: null;
};
function nonnegativeInteger(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid proof integer");
}
function checked(value: number) {
  nonnegativeInteger(value);
  return value;
}

/** PG v3 DataRow: type + length + field count + length prefix for every nullable field. */
export function boundQueryResult(
  columns: readonly ResultColumnBound[],
  maximumRows: number,
): QueryResultBound {
  nonnegativeInteger(maximumRows);
  if (columns.length < 1 || columns.length > 64) throw new Error("Invalid proof columns");
  for (const column of columns) {
    if (!/^[a-z_]+$/.test(column.name)) throw new Error("Invalid proof column name");
    nonnegativeInteger(column.maximumTextBytes);
  }
  const maximumRowBytes = checked(
    7 + columns.length * 4 + columns.reduce((sum, c) => sum + c.maximumTextBytes, 0),
  );
  const maximumDataRowBytes = checked(maximumRows * maximumRowBytes);
  // Descriptor fields: name + NUL, relation OID, attribute, type OID, size, modifier, format.
  const maximumRowDescriptionBytes = checked(
    7 + columns.reduce((sum, c) => sum + new TextEncoder().encode(c.name).byteLength + 19, 0),
  );
  const commandCompleteBytes = 5 + "SELECT ".length + String(maximumRows).length + 1;
  const parseAndBindCompleteBytes = 10;
  const readyForQueryBytes = 6;
  return {
    maximumRows,
    maximumRowBytes,
    maximumDataRowBytes,
    maximumRowDescriptionBytes,
    maximumExpectedResultMessageBytes: checked(
      maximumDataRowBytes +
        maximumRowDescriptionBytes +
        commandCompleteBytes +
        parseAndBindCompleteBytes +
        readyForQueryBytes,
    ),
    // Startup/authentication, async notices, errors and managed-origin activity are separate.
    completeSocketBytesUpper: null,
  };
}

export function boundComparableRequest(input: {
  transactionColumns: readonly ResultColumnBound[];
  trendColumns: readonly ResultColumnBound[];
  maximumTrendRows: number;
  selectedTransactionRows?: number;
  withTrends?: boolean;
}) {
  const rows = input.selectedTransactionRows ?? 150;
  if (rows > 150) throw new Error("Frozen transaction row cap exceeded");
  const count = boundQueryResult([{ name: "cnt", maximumTextBytes: 6 }], 1);
  const transactions = boundQueryResult(input.transactionColumns, rows);
  const trends =
    input.withTrends === false
      ? null
      : boundQueryResult(input.trendColumns, input.maximumTrendRows);
  // BEGIN / COMMIT / possible extra ROLLBACK: max CommandComplete + ReadyForQuery per control.
  const transactionControlBytes = 3 * 20;
  const applicationResultBytesUpper = checked(
    3 * count.maximumExpectedResultMessageBytes +
      (rows > 0 ? transactions.maximumExpectedResultMessageBytes : 0) +
      (trends?.maximumExpectedResultMessageBytes ?? 0) +
      transactionControlBytes,
  );
  return {
    count,
    transactions,
    trends,
    transactionControlBytes,
    applicationResultBytesUpper,
    completeSocketBytesUpper: null,
    fitsProposedApplicationResultCap:
      applicationResultBytesUpper <= PROPOSED_APPLICATION_RESULT_CAP_BYTES,
    proposedResponseBytesUpper: PROPOSED_RESPONSE_CAP_BYTES,
  };
}

/** Admission must leave the entire server timeout AND resource-cleanup reserve. No abort refunds. */
export function canReserveServerWindow(elapsedWallMs: number) {
  nonnegativeInteger(elapsedWallMs);
  return serverWindowReservation(elapsedWallMs).fits;
}

export function boundProbe(input: {
  requestResultBounds: readonly number[];
  diagnosticStatements: number;
  serverObservationStatements: number;
  monthlyHeadroomBytes: number;
}) {
  for (const value of [
    ...input.requestResultBounds,
    input.diagnosticStatements,
    input.serverObservationStatements,
    input.monthlyHeadroomBytes,
  ])
    nonnegativeInteger(value);
  const POSTs = input.requestResultBounds.length;
  // Eight failure-inclusive frozen transport commands, plus final server-observation SELECT.
  const prospectiveApplicationCommands = checked(
    POSTs * 9 +
      input.diagnosticStatements +
      input.serverObservationStatements +
      PILOT_LIMITS.cleanupStatementReserve,
  );
  const applicationResultBytesUpper = checked(
    input.requestResultBounds.reduce((sum, n) => sum + n, 0),
  );
  const resultPayloadFits = input.requestResultBounds.every(
    (n) => n <= PROPOSED_APPLICATION_RESULT_CAP_BYTES,
  );
  const applicationProofFits =
    POSTs <= PILOT_LIMITS.comparablePOSTs &&
    prospectiveApplicationCommands <= PILOT_LIMITS.applicationStatements &&
    resultPayloadFits;
  const wholePlan = evaluateWholePilotPlan({
    setupActiveMs: null,
    setupBoundEnforced: false,
    phases: [
      {
        id: "probe",
        purpose: "work",
        commands: prospectiveApplicationCommands - PILOT_LIMITS.cleanupStatementReserve,
        POSTs,
        connections: Math.max(1, POSTs),
        expectedResultMessageBytes: applicationResultBytesUpper,
        receivedSocketReservation: 0,
        sentSocketReservation: 0,
        serverTimeoutMs: PILOT_LIMITS.statementTimeoutMs,
        serverTimeoutEnforced: true,
      },
      {
        id: "cleanup",
        purpose: "cleanup",
        commands: PILOT_LIMITS.cleanupStatementReserve,
        POSTs: 0,
        connections: 1,
        expectedResultMessageBytes: 0,
        receivedSocketReservation: 0,
        sentSocketReservation: 0,
        serverTimeoutMs: PILOT_LIMITS.statementTimeoutMs,
        serverTimeoutEnforced: true,
      },
    ],
  });
  return {
    POSTs,
    prospectiveApplicationCommands,
    applicationResultBytesUpper,
    applicationProofFits,
    maximumResponseBytes: checked(POSTs * PROPOSED_RESPONSE_CAP_BYTES),
    fractionOfModeledMonthlyHeadroom:
      input.monthlyHeadroomBytes > 0
        ? applicationResultBytesUpper / input.monthlyHeadroomBytes
        : null,
    remainingAfterProvedResultPayload: input.monthlyHeadroomBytes - applicationResultBytesUpper,
    modeledCUHours: wholePlan.CUHoursAtLeast,
    computeModelFits: wholePlan.CUHoursAtLeast <= PILOT_LIMITS.computeCUHoursProxy,
    wholePlan,
    opaqueOriginBytesUpper: null,
    allServerSQLUpper: null,
    managedTransportRiskProved: false,
    remoteExecutionAuthorized: false,
  };
}
