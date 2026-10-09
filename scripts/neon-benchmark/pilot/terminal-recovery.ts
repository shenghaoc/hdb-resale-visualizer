import { AtomicPilotAuthority } from "./accounting";
import {
  cohortPilotStore,
  enterPilotPhase,
  snapshotPilotCohort,
  unresolvedPilotWindow,
} from "./cohort-store";
import { createStatementDispatcher } from "./dispatch";
import {
  SCOPED_LOWER_SQL,
  SCOPED_RESTORE_SQL,
  SCOPED_VERIFY_SQL,
  scopedSQLFingerprint,
} from "./scoped-sql";
import type { TransactionStorage } from "./transactional-store";

export type TerminalRecoveryDriver = {
  /** Each call is a FRESH, target-checked direct session; its acquisition was reserved. */
  freshQuery: (
    purpose: "restore" | "verify",
    sql: string,
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  now: () => number;
  waitUntil: (millisecondsUTC: number) => Promise<void>;
  /** Session bootstrap and restore share ONE fresh owner connection and counted dispatch. */
  dedicatedOwner?: (
    dispatch: (
      sql: string,
      params: readonly unknown[],
      send: (
        sql: string,
        params: readonly unknown[],
      ) => Promise<{ rows: Record<string, unknown>[] }>,
    ) => Promise<{ rows: Record<string, unknown>[] }>,
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Exactly one restore and one fresh verification, already reserved before any lowering. */
export async function runTerminalRestoration(
  storage: TransactionStorage,
  owner: string,
  driver: TerminalRecoveryDriver,
) {
  if (owner !== "direct-recovery") throw new Error("Wrong terminal ledger owner");
  const evidence = {
    restoreAttempted: false,
    restoreAcknowledged: false,
    verified: false,
    failure: null as string | null,
    safeRestoredState: false,
    blindRetries: 0,
  };
  const initial = await snapshotPilotCohort(storage);
  const restorationRequired = Object.values(initial.phases).some((phase) =>
    phase.statements.some(
      (s) =>
        s.sqlSHA256 === scopedSQLFingerprint(SCOPED_LOWER_SQL) &&
        s.driverDispatchAuthorizedAtUTC !== null,
    ),
  );
  if (!restorationRequired) return { ...evidence, restorationRequired: false, pilotPassed: false };
  for (const purpose of ["restore", "verify"] as const) {
    const before = await snapshotPilotCohort(storage);
    const phase = before.plan.phases.find((p) => p.terminalRecovery === purpose);
    if (!phase) throw new Error("Missing reserved recovery command");
    // Preserve the full possible old/ambiguous driver window; no client-abort credit.
    const waitThrough = Math.max(
      before.recoveryReady?.notBeforeMs ?? Number.POSITIVE_INFINITY,
      unresolvedPilotWindow(before),
    );
    if (!Number.isFinite(waitThrough) || before.recoveryReady?.clientOnlyBootstrapUnresolved)
      return {
        ...evidence,
        restorationRequired,
        pilotPassed: false,
        failure: "CLIENT_ONLY_BOOTSTRAP_OUTCOME_UNRESOLVED_NO_FURTHER_SQL",
      };
    await driver.waitUntil(waitThrough);
    await enterPilotPhase(storage, phase.id, driver.now(), owner);
    const authority = new AtomicPilotAuthority(
      cohortPilotStore(storage, phase.id, owner),
      phase.id,
      driver.now,
    );
    await authority.initialize();
    const requestId = purpose === "restore" ? "terminalRestore" : "terminalVerify";
    await authority.admitRequest({
      id: requestId,
      sequence: purpose === "restore" ? 100 : 101,
      method: "GET",
      maximumStatements: phase.commands,
      maximumReceivedDatabaseBytes: 65_536,
      maximumSentDatabaseBytes: 16_384,
      maximumWallMs: 85_000,
      purpose: "cleanup",
    });
    await authority.activateRequest(requestId);
    const dispatch = createStatementDispatcher({
      authority,
      requestId,
      defaultPurpose: "cleanup",
      retainTransportAmbiguity: true,
      clientOnlyInitialSET: phase.ownerSessionBootstrap === true,
    });
    let complete = false;
    try {
      const result = phase.ownerSessionBootstrap
        ? await (() => {
            if (!driver.dedicatedOwner)
              throw new Error("Dedicated session owner recovery unavailable");
            return driver.dedicatedOwner(async (sql, params, send) => {
              if (sql === SCOPED_RESTORE_SQL) evidence.restoreAttempted = true;
              return dispatch(sql, params, send);
            });
          })()
        : await (() => {
            if (purpose === "restore") evidence.restoreAttempted = true;
            return dispatch(
              purpose === "restore" ? SCOPED_RESTORE_SQL : SCOPED_VERIFY_SQL,
              [],
              (sql) => driver.freshQuery(purpose, sql),
            );
          })();
      complete = true;
      if (purpose === "restore") evidence.restoreAcknowledged = true;
      else {
        const row = result.rows.length === 1 ? result.rows[0] : null;
        evidence.verified = Boolean(
          row &&
          row.role === "hdb_benchmark_runtime" &&
          row.database === "neondb" &&
          row.read_only === "on" &&
          ["60s", "1min", "60000ms"].includes(String(row.statement_timeout)) &&
          row.transaction_select === true &&
          row.transaction_write === false &&
          row.private_access === false,
        );
        if (!evidence.verified) evidence.failure = "RESTORED_SAFEGUARDS_NOT_PROVED";
      }
    } catch {
      // No retry even for an ambiguous ALTER. The separately reserved fresh SELECT can reconcile it.
      evidence.failure =
        purpose === "restore" ? "RESTORE_FAILED_OR_AMBIGUOUS" : "RESTORE_VERIFICATION_FAILED";
    } finally {
      await authority.finishRequest(requestId, complete ? "complete" : "failed-unknown");
    }
  }
  evidence.safeRestoredState = evidence.verified;
  return {
    ...evidence,
    restorationRequired,
    pilotPassed: evidence.restoreAcknowledged && evidence.verified && !evidence.failure,
  };
}
