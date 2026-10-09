import { createHash } from "node:crypto";
import type { PilotAuthority, StatementPurpose, StatementRecord } from "./accounting";
import { OWNER_SESSION_SET_SQL } from "./session-owner";

export type PilotQuery = <T>(sql: string, parameters: readonly unknown[]) => Promise<T>;
export type DispatchContext = {
  requestId: string;
  authority: PilotAuthority;
  defaultPurpose?: StatementPurpose;
  cleanupFingerprints?: ReadonlySet<string>;
  /** Durable dispatch-intent trace; contains no SQL text or parameters. */
  beforeDriverSend?: (permit: StatementRecord) => Promise<void>;
  /** Monotonic round-trip measurement also charges a delayed durable grant reply. */
  monotonicNow?: () => number;
  /** Scoped pilot: lost transport response is not a definitive database failure. */
  retainTransportAmbiguity?: boolean;
  clientOnlyInitialSET?: boolean;
};
export class PilotDispatchError extends Error {
  constructor(
    readonly classification: "AUTHORIZATION" | "DATABASE" | "EVIDENCE",
    readonly statementId: string | null,
    readonly sqlstate: string | null = null,
  ) {
    super(`Pilot statement stopped: ${classification}`);
  }
}
export const fingerprintSQL = (sql: string) => createHash("sha256").update(sql).digest("hex");

/** Fixed pilot SQL is single-statement text; parameters are never logged or inspected. */
export function requireSinglePilotStatement(sql: string): void {
  // Fail closed rather than tokenize arbitrary SQL. All frozen pilot query shapes satisfy this.
  if (!sql.trim() || sql.includes(";") || sql.includes("\0"))
    throw new PilotDispatchError("AUTHORIZATION", null);
}

export function createStatementDispatcher(context: DispatchContext) {
  let localSequence = 0;
  return async function dispatch<T>(
    sql: string,
    parameters: readonly unknown[],
    send: (sql: string, parameters: readonly unknown[]) => Promise<T>,
  ): Promise<T> {
    requireSinglePilotStatement(sql);
    const sqlSHA256 = fingerprintSQL(sql);
    const purpose =
      /^(COMMIT|ROLLBACK)$/i.test(sql.trim()) || context.cleanupFingerprints?.has(sqlSHA256)
        ? "cleanup"
        : (context.defaultPurpose ?? "work");
    let permit: StatementRecord;
    try {
      // Sequence allocated synchronously, then shared authority durably commits before send.
      permit = await context.authority.authorizeStatement({
        requestId: context.requestId,
        localSequence: ++localSequence,
        label: purpose === "cleanup" ? "finalization-or-diagnostic" : "application-query",
        sqlSHA256,
        purpose,
        ...(context.clientOnlyInitialSET && localSequence === 1 && sql === OWNER_SESSION_SET_SQL
          ? { clientOnlyInitialSET: true as const }
          : {}),
      });
    } catch {
      throw new PilotDispatchError("AUTHORIZATION", null);
    }
    let outcome: "succeeded" | "failed" = "failed";
    let sqlstate: string | null = null;
    let result: T | undefined;
    let databaseFailure: PilotDispatchError | undefined;
    if (context.beforeDriverSend) {
      try {
        await context.beforeDriverSend(permit);
      } catch {
        throw new PilotDispatchError("EVIDENCE", permit.id);
      }
    }
    try {
      const monotonicNow = context.monotonicNow ?? (() => performance.now());
      const started = monotonicNow();
      const grant = await context.authority.authorizeDriverDispatch(permit.id);
      const elapsed = monotonicNow() - started;
      if (
        grant.statementId !== permit.id ||
        grant.serverTimeoutMs !== permit.serverTimeoutMs ||
        !Number.isFinite(grant.validForMs) ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed > grant.validForMs
      )
        throw new Error("Stale durable driver grant");
      // No await between the final time check and invoking the driver.
    } catch {
      throw new PilotDispatchError("AUTHORIZATION", permit.id);
    }
    try {
      result = await send(sql, parameters);
      outcome = "succeeded";
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && typeof error.code === "string")
        sqlstate = /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
      databaseFailure = new PilotDispatchError("DATABASE", permit.id, sqlstate);
    }
    if (databaseFailure && sqlstate === null && context.retainTransportAmbiguity) {
      await context.authority.stop();
      // No completion/refund/retry: the original permit and full possible window survive.
      throw databaseFailure;
    }
    try {
      await context.authority.completeStatement(permit.id, outcome, sqlstate);
    } catch {
      // Never refund the committed permit or retry an ambiguously completed statement.
      throw new PilotDispatchError("EVIDENCE", permit.id, sqlstate);
    }
    if (databaseFailure) throw databaseFailure;
    return result as T;
  };
}
