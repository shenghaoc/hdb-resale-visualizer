import type pg from "pg";

export const OWNER_SESSION_SET_SQL = "SET statement_timeout = '2s'";
export const OWNER_SESSION_READBACK_SQL =
  "SELECT setting, unit, source FROM pg_settings WHERE name = 'statement_timeout'";
export const OWNER_SESSION_CLIENT_DEADLINE_MS = 15_000;
type Rows = { rows: Record<string, unknown>[] };
export type DedicatedOwnerClient = {
  query: (sql: string, parameters: readonly unknown[]) => Promise<Rows>;
  end: () => Promise<void>;
  abort: () => void;
};
type Command = { sql: string; params?: readonly unknown[]; check?: (result: Rows) => void };

/** No native startup timeout: the first SET has only a client wall deadline. */
export function sessionDirectClientConfiguration(): Omit<pg.ClientConfig, "connectionString"> {
  return {
    connectionTimeoutMillis: 5_000,
    application_name: "hdb-dedicated-owner-session-pilot",
  };
}

/** The actual owner path: one dedicated attempt, counted SET/readback, then bounded later SQL. */
export async function runDedicatedOwnerAttempt(input: {
  open: () => Promise<DedicatedOwnerClient>;
  dispatch: (
    sql: string,
    parameters: readonly unknown[],
    send: DedicatedOwnerClient["query"],
  ) => Promise<Rows>;
  retainRawReadback: (result: Rows) => Promise<void>;
  commands: readonly Command[];
  deadlineMs?: number;
  bootstrapSettled?: (acknowledged: boolean) => Promise<void>;
}) {
  let client: DedicatedOwnerClient | undefined;
  let expired = false;
  let bootstrapNotified = false;
  const notifyBootstrap = async (acknowledged: boolean) => {
    if (bootstrapNotified) return;
    bootstrapNotified = true;
    await input.bootstrapSettled?.(acknowledged);
  };
  const assertLive = () => {
    if (expired) throw Error("Dedicated owner client deadline expired");
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      client?.abort();
      reject(Error("Dedicated owner client deadline expired"));
    }, input.deadlineMs ?? OWNER_SESSION_CLIENT_DEADLINE_MS);
  });
  try {
    const operation = (async () => {
      try {
        client = await input.open();
      } catch (error) {
        await notifyBootstrap(false);
        throw error;
      }
      if (expired) {
        client.abort();
        await client.end().catch(() => {});
        assertLive();
      }
      const send = (sql: string, parameters: readonly unknown[]) => {
        assertLive();
        return client!.query(sql, parameters);
      };
      try {
        await input.dispatch(OWNER_SESSION_SET_SQL, [], send);
      } catch (error) {
        await notifyBootstrap(false);
        throw error;
      }
      await notifyBootstrap(true);
      assertLive();
      const raw = await input.dispatch(OWNER_SESSION_READBACK_SQL, [], send);
      await input.retainRawReadback(raw); // Persist before the guard, even on mismatch.
      assertLive();
      const r = raw.rows[0];
      if (
        raw.rows.length !== 1 ||
        !r ||
        Object.keys(r).sort().join(",") !== "setting,source,unit" ||
        r.setting !== "2000" ||
        r.unit !== "ms" ||
        r.source !== "session"
      )
        throw Error("Dedicated owner session2s readback mismatch");
      for (const command of input.commands) {
        assertLive();
        const result = await input.dispatch(command.sql, command.params ?? [], send);
        assertLive();
        command.check?.(result);
      }
    })();
    await Promise.race([operation, wall]);
  } finally {
    if (timer) clearTimeout(timer);
    if (client) {
      let closed = false;
      const closeTimer = setTimeout(() => {
        if (!closed) client!.abort();
      }, 1_500);
      let failTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          client.end().then(() => {
            closed = true;
          }),
          new Promise<never>((_, reject) => {
            failTimer = setTimeout(
              () => reject(Error("Dedicated owner close deadline expired")),
              1_600,
            );
          }),
        ]);
      } finally {
        clearTimeout(closeTimer);
        if (failTimer) clearTimeout(failTimer);
      }
    }
  }
}
