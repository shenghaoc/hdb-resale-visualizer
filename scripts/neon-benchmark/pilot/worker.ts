/// <reference types="@cloudflare/workers-types" />
import "../../../cloudflare-env.d.ts";
import pg from "pg";
import { onRequestPost } from "../../../functions/api/comparable-transactions";
import { createPublicReadScope } from "../../../worker/public-read-backend";
import { createNeonPublicTransport } from "../../../worker/neon-transport";
import type { PilotAuthority } from "./accounting";
import type { StatementRecord } from "./accounting";
import { fingerprintSQL, PilotDispatchError } from "./dispatch";
import { installPilotPgInstrumentation, type PgPilotScope } from "./pg-instrumentation";
import type { ServerObservation } from "./accounting";
import { ComparableReturnedDataGate, type ComparableGateInput } from "./returned-data";

// Byte-identical diagnostic SQL from the executed harness; aggregate counts remain observational.
export const PILOT_SERVER_STATS_SQL = `SELECT current_user AS role,current_setting('default_transaction_read_only') AS read_only,current_setting('statement_timeout') AS statement_timeout,(SELECT json->'neonPublication'->>'publicationId' FROM public.manifest WHERE id=1) AS publication_id,(SELECT coalesce(sum(calls),0)::double precision FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS successful_sql_calls,(SELECT coalesce(sum(total_exec_time),0)::double precision FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS successful_sql_ms`;
export const PILOT_SETTINGS_SQL = `SELECT current_user AS role,current_database() AS database,current_setting('default_transaction_read_only') AS read_only,current_setting('statement_timeout') AS statement_timeout,has_table_privilege(current_user,'public.transactions','SELECT') AS transaction_select,has_table_privilege(current_user,'public.transactions','INSERT,UPDATE,DELETE,TRUNCATE') AS transaction_write,has_table_privilege(current_user,'public.shortlists','SELECT,INSERT,UPDATE,DELETE') AS private_access`;

type Installation = ReturnType<typeof installPilotPgInstrumentation>;
export type PilotWorkerDependencies = {
  /** Required shared authority/RPC port. Never construct a per-isolate replacement counter. */
  authority: PilotAuthority;
  instrumentation: Installation;
  beforeDriverSend?: (permit: StatementRecord) => Promise<void>;
  /** Supplied from the exact pinned POST; legacy diagnostic harnesses do not acquire a proof. */
  returnedDataInput?: ComparableGateInput;
};

async function attachPilotMeasurements(response: Response, meter: PgPilotScope): Promise<Response> {
  if (meter.constructedClients > 0 && !meter.protocolMeasurementComplete) {
    await meter.authority.stop();
    throw new PilotDispatchError("EVIDENCE", null);
  }
  const row = meter.finalDiagnosticRow;
  const providerObservationAvailable = row?.role === "hdb_benchmark_runtime";
  if (providerObservationAvailable) {
    const observation: ServerObservation = {
      phase: "request-final-diagnostic",
      observedAtUTC: new Date().toISOString(),
      role: "hdb_benchmark_runtime",
      databaseId: null,
      calls: typeof row.successful_sql_calls === "number" ? row.successful_sql_calls : null,
      sqlMs: typeof row.successful_sql_ms === "number" ? row.successful_sql_ms : null,
      completeAttemptAccounting: false,
    };
    await meter.authority.observeServer(observation);
  }
  const output = new Response(response.body, response);
  const state = await meter.authority.snapshot();
  output.headers.set("x-pilot-application-count", String(state.applicationStatements));
  output.headers.set(
    "x-pilot-statement-ids",
    JSON.stringify(
      state.statements
        .filter((entry) => entry.requestId === meter.requestId)
        .map((entry) => entry.id),
    ),
  );
  output.headers.set("x-pilot-protocol-complete", String(meter.protocolMeasurementComplete));
  output.headers.set("x-pilot-received-bytes", String(meter.protocolReceivedBytes));
  output.headers.set("x-pilot-sent-bytes", String(meter.protocolSentBytes));
  output.headers.set("x-pilot-provider-observation", String(providerObservationAvailable));
  return output;
}

/** No deployment/exported fetch fallback. Explicit caller supplies an already-admitted request ID. */
export function createComparablePilotWorker(dependencies: PilotWorkerDependencies) {
  return async function handle(request: Request, env: Env, requestId: string): Promise<Response> {
    if (env.PUBLIC_DATA_BACKEND !== "neon" || !env.HDB_PUBLIC_NEON)
      throw new PilotDispatchError("AUTHORIZATION", null);
    const state = await dependencies.authority.snapshot();
    const admission = state.requests.find((entry) => entry.id === requestId);
    if (!admission || admission.ended) throw new PilotDispatchError("AUTHORIZATION", null);
    await dependencies.authority.activateRequest(requestId);
    const meter: PgPilotScope = {
      requestId,
      authority: dependencies.authority,
      beforeDriverSend: dependencies.beforeDriverSend,
      cleanupFingerprints: new Set([fingerprintSQL(PILOT_SERVER_STATS_SQL)]),
      maximumReceivedDatabaseBytes: admission.maximumReceivedDatabaseBytes,
      maximumSentDatabaseBytes: admission.maximumSentDatabaseBytes,
      protocolReceivedBytes: 0,
      protocolSentBytes: 0,
      constructedClients: 0,
      protocolMeasurementComplete: true,
      finalDiagnosticSQL: PILOT_SERVER_STATS_SQL,
      retainTransportAmbiguity: Boolean(state.computeEnvelope),
      ...(dependencies.returnedDataInput
        ? {
            returnedDataGate: new ComparableReturnedDataGate(
              dependencies.returnedDataInput,
              admission.maximumReceivedDatabaseBytes,
              PILOT_SERVER_STATS_SQL,
            ),
          }
        : {}),
    };
    return dependencies.instrumentation.run(meter, async () => {
      const scope = createPublicReadScope(env, createNeonPublicTransport);
      let response: Response;
      try {
        // Original query compiler, transaction transport and handler are unchanged.
        response = await scope.comparableSnapshot(async () =>
          onRequestPost({
            request: request as Parameters<typeof onRequestPost>[0]["request"],
            env: scope.publicEnv,
            params: {},
            data: {},
            waitUntil: () => {},
            next: async () => new Response(),
            functionPath: "/api/comparable-transactions",
            passThroughOnException: () => {},
          }),
        );
      } finally {
        await scope.close();
      }
      return attachPilotMeasurements(response, meter);
    });
  };
}

/** Evidence must match the immutable phase bound; this helper never sets a server timeout. */
export async function runPilotSafeguards(
  dependencies: PilotWorkerDependencies,
  binding: Hyperdrive,
  requestId: string,
) {
  const state = await dependencies.authority.snapshot();
  const admission = state.requests.find((entry) => entry.id === requestId);
  if (!admission || admission.ended) throw new PilotDispatchError("AUTHORIZATION", null);
  await dependencies.authority.activateRequest(requestId);
  const expectedTimeoutMs = admission.serverTimeoutMs;
  const meter: PgPilotScope = {
    authority: dependencies.authority,
    beforeDriverSend: dependencies.beforeDriverSend,
    requestId,
    cleanupFingerprints: new Set([fingerprintSQL(PILOT_SERVER_STATS_SQL)]),
    maximumReceivedDatabaseBytes: admission.maximumReceivedDatabaseBytes,
    maximumSentDatabaseBytes: admission.maximumSentDatabaseBytes,
    protocolReceivedBytes: 0,
    protocolSentBytes: 0,
    constructedClients: 0,
    protocolMeasurementComplete: true,
    finalDiagnosticSQL: PILOT_SERVER_STATS_SQL,
    retainTransportAmbiguity: Boolean(state.computeEnvelope),
  };
  return dependencies.instrumentation.run(meter, async () => {
    const client = new pg.Client({
      connectionString: binding.connectionString,
      connectionTimeoutMillis: 15_000,
      query_timeout: 65_000,
    });
    const evidence = {
      timeoutSQLSTATE: null as string | null,
      timeoutWallMs: null as number | null,
      settings: null as Record<string, unknown> | null,
    };
    client.on("error", () => {});
    try {
      await client.connect();
      evidence.settings = (await client.query(PILOT_SETTINGS_SQL)).rows[0] as Record<
        string,
        unknown
      >;
      const settings = evidence.settings;
      if (
        settings.role !== "hdb_benchmark_runtime" ||
        settings.database !== "neondb" ||
        settings.read_only !== "on" ||
        !timeoutMatches(settings.statement_timeout, expectedTimeoutMs) ||
        !settings.transaction_select ||
        settings.transaction_write ||
        settings.private_access
      )
        throw new Error("Serving safeguards not demonstrated");
      // This revised pilot is SELECT-only; privilege observations replace the old
      // deliberately rejected UPDATE probe. It proves grants, not attempted-write rejection.
      await client.query("BEGIN TRANSACTION READ ONLY");
      await client.query("ROLLBACK");
      const started = performance.now();
      try {
        await client.query(`SELECT pg_sleep(${Math.ceil(expectedTimeoutMs / 1000) + 1})`);
      } catch (error) {
        if (error instanceof PilotDispatchError) evidence.timeoutSQLSTATE = error.sqlstate;
      } finally {
        evidence.timeoutWallMs = performance.now() - started;
      }
      if (
        evidence.timeoutSQLSTATE !== "57014" ||
        evidence.timeoutWallMs < Math.max(0, expectedTimeoutMs - 1_000) ||
        evidence.timeoutWallMs > expectedTimeoutMs + 5_000
      )
        throw new Error("Server cancellation not demonstrated");
      return evidence;
    } finally {
      await client.end();
    }
  });
}

function timeoutMatches(value: unknown, expectedMs: number): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d+)(ms|s|min)$/.exec(value);
  if (!match) return false;
  const unit = match[2] === "ms" ? 1 : match[2] === "s" ? 1000 : 60_000;
  return Number(match[1]) * unit === expectedMs;
}
