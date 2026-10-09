import { createServer, type Socket } from "node:net";
import { COMPARABLE_PUBLICATION } from "./returned-data";

const MAXIMUM_CONNECTIONS = 16;
const MAXIMUM_MESSAGE_BYTES = 65_536;
const int16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const int32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const cstring = (s: string) => Buffer.from(s + "\0");
const message = (kind: string, body = Buffer.alloc(0)) =>
  Buffer.concat([Buffer.from(kind), int32(body.length + 4), body]);
const ready = () => message("Z", Buffer.from("I"));

/** Loopback protocol fixture, not PostgreSQL/Neon evidence. Only fixed pilot diagnostic SQL. */
export async function startLocalPilotPg() {
  const sockets = new Set<Socket>();
  const SQL: string[] = [];
  let connections = 0;
  const server = createServer((socket) => {
    if (++connections > MAXIMUM_CONNECTIONS) return socket.destroy();
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    let input = Buffer.alloc(0),
      startup = true;
    const rows = (record: Record<string, string | number | boolean>) => {
      const entries = Object.entries(record);
      const description = entries.map(([name, value]) =>
        Buffer.concat([
          cstring(name),
          int32(0),
          int16(0),
          int32(typeof value === "boolean" ? 16 : typeof value === "number" ? 701 : 25),
          int16(typeof value === "boolean" ? 1 : typeof value === "number" ? 8 : -1),
          int32(-1),
          int16(0),
        ]),
      );
      const values = entries.map(([, value]) => {
        const b = Buffer.from(typeof value === "boolean" ? (value ? "t" : "f") : String(value));
        return Buffer.concat([int32(b.length), b]);
      });
      socket.write(
        Buffer.concat([
          message("T", Buffer.concat([int16(entries.length), ...description])),
          message("D", Buffer.concat([int16(entries.length), ...values])),
          message("C", cstring("SELECT 1")),
          ready(),
        ]),
      );
    };
    const query = (sql: string) => {
      SQL.push(sql);
      if (sql === "SELECT pg_sleep(3)") {
        setTimeout(
          () =>
            socket.write(
              Buffer.concat([
                message(
                  "E",
                  Buffer.concat([
                    cstring("SERROR"),
                    cstring("C57014"),
                    cstring("Msynthetic local statement timeout"),
                    Buffer.from([0]),
                  ]),
                ),
                ready(),
              ]),
            ),
          2000,
        );
      } else if (sql === "BEGIN TRANSACTION READ ONLY" || sql === "ROLLBACK") {
        socket.write(
          Buffer.concat([
            message("C", cstring(sql.startsWith("BEGIN") ? "BEGIN" : "ROLLBACK")),
            ready(),
          ]),
        );
      } else if (sql === "SELECT 2 AS diagnostic_value") {
        rows({ diagnostic_value: 2 });
      } else if (sql.startsWith("SELECT current_user AS role,current_")) {
        rows({
          role: "hdb_benchmark_runtime",
          database: "neondb",
          read_only: "on",
          statement_timeout: "2s",
          transaction_select: true,
          transaction_write: false,
          private_access: false,
          publication_id: COMPARABLE_PUBLICATION,
          ...(sql.includes("successful_sql_calls")
            ? { successful_sql_calls: SQL.length, successful_sql_ms: 0 }
            : {}),
        });
      } else {
        // Unknown queries never have a fake successful result.
        socket.write(
          Buffer.concat([
            message(
              "E",
              Buffer.concat([
                cstring("SERROR"),
                cstring("C42501"),
                cstring("Mlocal fixture SQL refused"),
                Buffer.from([0]),
              ]),
            ),
            ready(),
          ]),
        );
      }
    };
    socket.on("data", (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      if (input.length > MAXIMUM_MESSAGE_BYTES) return socket.destroy();
      while (input.length >= (startup ? 4 : 5)) {
        const size = input.readInt32BE(startup ? 0 : 1);
        const total = size + (startup ? 0 : 1);
        if (size < 4 || total > MAXIMUM_MESSAGE_BYTES) return socket.destroy();
        if (input.length < total) return;
        const packet = input.subarray(0, total);
        input = input.subarray(total);
        if (startup) {
          if (packet.readInt32BE(4) === 80877103) {
            socket.write("N");
            continue;
          }
          if (packet.readInt32BE(4) !== 196608) return socket.destroy();
          startup = false;
          socket.write(
            Buffer.concat([
              message("R", int32(0)),
              message("S", Buffer.concat([cstring("server_version"), cstring("18.0")])),
              message("S", Buffer.concat([cstring("client_encoding"), cstring("UTF8")])),
              message("S", Buffer.concat([cstring("standard_conforming_strings"), cstring("on")])),
              message("K", Buffer.concat([int32(1), int32(1)])),
              ready(),
            ]),
          );
        } else if (packet[0] === 81) query(packet.subarray(5, -1).toString());
        else if (packet[0] === 88) socket.end();
        else return socket.destroy();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Loopback fixture unavailable");
  return {
    connectionString: `postgresql://hdb_benchmark_runtime:synthetic@127.0.0.1:${address.port}/neondb?sslmode=disable`,
    SQL,
    connections: () => connections,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
