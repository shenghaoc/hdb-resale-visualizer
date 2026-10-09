import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";
import type { DispatchContext } from "./dispatch";
import { createStatementDispatcher, PilotDispatchError } from "./dispatch";
import type { ComparableReturnedDataGate } from "./returned-data";

type SocketMeter = {
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  bytesRead?: number;
  bytesWritten?: number;
  write?: (...arguments_: unknown[]) => unknown;
  destroy(error?: Error): unknown;
  constructor: { name: string };
  /** pg-cloudflare creates this socket before startup, without Node byte counters. */
  _cfSocket?: unknown;
  _cfReader?: unknown;
  _cfWriter?: unknown;
  startTls?: unknown;
};
export type PgPilotScope = DispatchContext & {
  maximumReceivedDatabaseBytes: number;
  maximumSentDatabaseBytes: number;
  protocolReceivedBytes: number;
  protocolSentBytes: number;
  constructedClients: number;
  protocolMeasurementComplete: boolean;
  finalDiagnosticSQL?: string;
  finalDiagnosticRow?: Record<string, unknown>;
  /** New scoped pilot only: snapshot-local producer proof before comparable row queries. */
  returnedDataGate?: ComparableReturnedDataGate;
};
type PgModule = { Client: typeof pg.Client };
const installedModules = new WeakSet<PgModule>();

/** Temporary harness only. AsyncLocalStorage replaces the former global `active` request. */
export function installPilotPgInstrumentation(module: PgModule) {
  if (installedModules.has(module)) throw new PilotDispatchError("AUTHORIZATION", null);
  installedModules.add(module);
  const OriginalClient = module.Client;
  const scopes = new AsyncLocalStorage<PgPilotScope>();
  class InstrumentedClient extends OriginalClient {
    constructor(...configuration: ConstructorParameters<typeof pg.Client>) {
      super(...configuration);
      const scope = scopes.getStore();
      if (!scope || ++scope.constructedClients > 1)
        throw new PilotDispatchError("AUTHORIZATION", null);
      const dispatch = createStatementDispatcher(scope);
      const originalQuery = this.query.bind(this);
      Object.defineProperty(this, "query", {
        value: async (sql: unknown, parameters?: readonly unknown[]) => {
          if (typeof sql !== "string" || (parameters !== undefined && !Array.isArray(parameters)))
            throw new PilotDispatchError("AUTHORIZATION", null);
          if (!scope.protocolMeasurementComplete) {
            await scope.authority.stop();
            throw new PilotDispatchError("EVIDENCE", null);
          }
          const send = (text: string, values: readonly unknown[]) =>
            dispatch(text, values, (query, bindings) => originalQuery(query, [...bindings]));
          return scope.returnedDataGate
            ? scope.returnedDataGate.run(sql, parameters ?? [], send)
            : send(sql, parameters ?? []);
        },
      });
      const stream = (): SocketMeter | undefined =>
        (this as pg.Client & { connection?: { stream?: SocketMeter } }).connection?.stream;
      let observed: SocketMeter | undefined;
      const observe = (beforeConnect = false) => {
        const current = stream();
        if (!current) {
          scope.protocolMeasurementComplete = false;
          return;
        }
        if (current === observed) return;
        observed = current;
        const cloudflarePreStartup =
          beforeConnect &&
          current.constructor.name === "CloudflareSocket" &&
          current.bytesRead === undefined &&
          current.bytesWritten === undefined &&
          current._cfSocket === null &&
          current._cfReader === null &&
          current._cfWriter === null &&
          typeof current.startTls === "function";
        if (
          !cloudflarePreStartup &&
          (typeof current.bytesRead !== "number" || typeof current.bytesWritten !== "number")
        )
          scope.protocolMeasurementComplete = false;
        // Hooks are installed before CloudflareSocket.connect. Every application-visible
        // startup/data chunk and write is then counted; opaque provider traffic stays unknown.
        scope.protocolReceivedBytes += current.bytesRead ?? 0;
        scope.protocolSentBytes += current.bytesWritten ?? 0;
        if (
          scope.protocolReceivedBytes > scope.maximumReceivedDatabaseBytes ||
          scope.protocolSentBytes > scope.maximumSentDatabaseBytes
        ) {
          scope.protocolMeasurementComplete = false;
          current.destroy(new Error("Pilot protocol allowance exhausted"));
          throw new PilotDispatchError("AUTHORIZATION", null);
        }
        const originalWrite = current.write;
        if (originalWrite) {
          current.write = (...arguments_: unknown[]) => {
            const chunk = arguments_[0];
            const bytes =
              typeof chunk === "string"
                ? new TextEncoder().encode(chunk).byteLength
                : chunk instanceof Uint8Array
                  ? chunk.byteLength
                  : null;
            if (
              bytes === null ||
              scope.protocolSentBytes + bytes > scope.maximumSentDatabaseBytes
            ) {
              scope.protocolMeasurementComplete = false;
              current.destroy(new Error("Pilot protocol allowance exhausted"));
              throw new PilotDispatchError("AUTHORIZATION", null);
            }
            scope.protocolSentBytes += bytes;
            return originalWrite.apply(current, arguments_);
          };
        } else scope.protocolMeasurementComplete = false;
        // Observe application-visible PG bytes only, after chunk delivery. Destruction
        // can overshoot the threshold and cannot bound Hyperdrive-origin traffic.
        current.on("data", (chunk) => {
          scope.protocolReceivedBytes += chunk.byteLength;
          if (
            scope.protocolReceivedBytes > scope.maximumReceivedDatabaseBytes ||
            scope.protocolSentBytes > scope.maximumSentDatabaseBytes
          ) {
            scope.protocolMeasurementComplete = false;
            current.destroy(new Error("Pilot protocol allowance exhausted"));
          }
        });
      };
      const originalConnect = this.connect.bind(this);
      Object.defineProperty(this, "connect", {
        value: async () => {
          observe(true);
          try {
            return await originalConnect();
          } finally {
            observe();
          }
        },
      });
      const originalEnd = this.end.bind(this);
      Object.defineProperty(this, "end", {
        value: async () => {
          try {
            if (scope.finalDiagnosticSQL)
              scope.finalDiagnosticRow = (await this.query(scope.finalDiagnosticSQL))
                .rows[0] as Record<string, unknown>;
          } finally {
            try {
              await originalEnd();
            } finally {
              scope.protocolSentBytes = Math.max(
                stream()?.bytesWritten ?? 0,
                scope.protocolSentBytes,
              );
            }
          }
        },
      });
    }
  }
  module.Client = InstrumentedClient;
  return {
    run: <T>(scope: PgPilotScope, action: () => Promise<T>) => scopes.run(scope, action),
    restore: () => {
      if (module.Client === InstrumentedClient) module.Client = OriginalClient;
      installedModules.delete(module);
    },
  };
}
