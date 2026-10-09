// @vitest-environment node
import { EventEmitter } from "node:events";
import type pg from "pg";
import { describe, expect, it } from "vite-plus/test";
import {
  installPilotPgInstrumentation,
  type PgPilotScope,
} from "../../scripts/neon-benchmark/pilot/pg-instrumentation";
import { admission, authorityFixture } from "../fixtures/neon-pilot";

class CloudflareSocket extends EventEmitter {
  _cfSocket: unknown = null;
  _cfReader: unknown = null;
  _cfWriter: unknown = null;
  startTls() {}
  write(_bytes: Uint8Array) {
    return true;
  }
  destroy() {}
}
class UnknownSocket extends CloudflareSocket {}

describe("pilot CloudflareSocket pre-startup byte hooks", () => {
  it.each(["fresh", "preconnected", "unknown"] as const)(
    "handles %s sockets conservatively",
    async (kind) => {
      const socket = kind === "unknown" ? new UnknownSocket() : new CloudflareSocket();
      if (kind === "preconnected") socket._cfSocket = {};
      let queries = 0;
      class Client {
        connection = { stream: socket };
        async connect() {
          socket.write(new Uint8Array(9));
          socket.emit("data", new Uint8Array(17));
        }
        async query() {
          queries++;
          socket.write(new Uint8Array(13));
          socket.emit("data", new Uint8Array(19));
          return { rows: [{ value: 2 }] };
        }
        async end() {
          socket.write(new Uint8Array(5));
        }
      }
      const module = { Client: Client as unknown as typeof pg.Client };
      const { authority } = await authorityFixture();
      await authority.admitRequest(admission("request1", { method: "GET" }));
      await authority.activateRequest("request1");
      const meter: PgPilotScope = {
        requestId: "request1",
        authority,
        maximumReceivedDatabaseBytes: 2_000_000,
        maximumSentDatabaseBytes: 30_000,
        protocolReceivedBytes: 0,
        protocolSentBytes: 0,
        constructedClients: 0,
        protocolMeasurementComplete: true,
      };
      const installation = installPilotPgInstrumentation(module);
      try {
        await installation.run(meter, async () => {
          const client = new module.Client();
          await client.connect();
          if (kind === "fresh") await client.query("SELECT 2 AS diagnostic_value");
          else
            await expect(client.query("SELECT 2 AS diagnostic_value")).rejects.toThrow("EVIDENCE");
          await client.end();
        });
        expect(meter.protocolMeasurementComplete).toBe(kind === "fresh");
        expect(queries).toBe(kind === "fresh" ? 1 : 0);
        expect(meter.protocolReceivedBytes).toBe(kind === "fresh" ? 36 : 17);
        expect(meter.protocolSentBytes).toBe(kind === "fresh" ? 27 : 14);
        expect((await authority.snapshot()).applicationStatements).toBe(queries);
      } finally {
        installation.restore();
      }
    },
  );
});
