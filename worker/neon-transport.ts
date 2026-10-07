import pg from "pg";
import type { PublicReadTransport } from "./public-read-backend";

/** Lazy request-scoped client. No persistent pool, credentials logging, or D1 failover. */
export function createNeonPublicTransport(binding: Hyperdrive): PublicReadTransport {
  let client: pg.Client | undefined;
  let connected: Promise<pg.Client> | undefined;
  let snapshot = false;
  let transaction = false;
  let queryFailed = false;
  let queryTail: Promise<unknown> = Promise.resolve();
  const connect = () => {
    if (!connected) {
      client = new pg.Client({
        connectionString: binding.connectionString,
        connectionTimeoutMillis: 15_000,
        query_timeout: 60_000,
      });
      client.on("error", () => {});
      const current = client;
      connected = (async () => {
        await current.connect();
        if (snapshot) {
          await current.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
          transaction = true;
        }
        return current;
      })();
    }
    return connected;
  };
  return {
    query: (sql, params) => {
      const operation = queryTail.then(async () => {
        try {
          return (await (await connect()).query(sql, [...params])).rows as Record<
            string,
            unknown
          >[];
        } catch {
          queryFailed = true;
          throw new Error("Public database read failed");
        }
      });
      // Handler scope counts arrive together; execute them serially on this single snapshot/client.
      queryTail = operation.catch(() => undefined);
      return operation;
    },
    snapshot: async (respond) => {
      if (connected || snapshot) throw new Error("Public read snapshot must precede queries");
      snapshot = true;
      try {
        const response = await respond();
        if (transaction) {
          await client!.query(queryFailed ? "ROLLBACK" : "COMMIT");
          transaction = false;
        }
        return response;
      } catch {
        if (transaction) await client!.query("ROLLBACK").catch(() => {});
        transaction = false;
        throw new Error("Public read snapshot failed");
      }
    },
    close: async () => {
      if (transaction) await client?.query("ROLLBACK").catch(() => {});
      if (client) await client.end();
    },
  };
}
