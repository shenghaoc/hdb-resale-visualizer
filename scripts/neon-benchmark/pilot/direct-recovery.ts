import pg from "pg";
import { SCOPED_PILOT_TARGET } from "./scoped-plan";
import { SCOPED_RESTORE_SQL, SCOPED_VERIFY_SQL } from "./scoped-sql";
import type { TerminalRecoveryDriver } from "./terminal-recovery";
import { scopedDirectClientConfiguration } from "./direct-configuration";

/** Proposed native direct60s startup contract must be proved; no persistent owner default or SET. */
export function createDirectRecoveryDriver(input: {
  directOwner60sStartupContractProven: boolean;
  ownerURI: () => string;
  runtimeURI: () => string;
  now: () => number;
  waitUntil: (timestamp: number) => Promise<void>;
}): TerminalRecoveryDriver {
  // Fail before either credential callback or client construction.
  if (!input.directOwner60sStartupContractProven)
    throw new Error("Direct owner60s startup contract unproved");
  return {
    now: input.now,
    waitUntil: input.waitUntil,
    freshQuery: async (purpose, sql) => {
      if (sql !== (purpose === "restore" ? SCOPED_RESTORE_SQL : SCOPED_VERIFY_SQL))
        throw new Error("Unreserved direct recovery SQL");
      const text = purpose === "restore" ? input.ownerURI() : input.runtimeURI();
      const uri = new URL(text);
      const role = purpose === "restore" ? "neondb_owner" : SCOPED_PILOT_TARGET.role;
      const keys = [...uri.searchParams.keys()];
      if (
        uri.protocol !== "postgresql:" ||
        uri.hostname !== `${SCOPED_PILOT_TARGET.endpoint}.c-4.ap-southeast-1.aws.neon.tech` ||
        uri.pathname !== "/neondb" ||
        decodeURIComponent(uri.username) !== role ||
        (uri.port !== "" && uri.port !== "5432") ||
        uri.searchParams.get("sslmode") !== "require" ||
        uri.searchParams.has("options") ||
        uri.searchParams.has("statement_timeout") ||
        keys.some((key) => !["sslmode", "channel_binding"].includes(key)) ||
        new Set(keys).size !== keys.length ||
        (uri.searchParams.has("channel_binding") &&
          uri.searchParams.get("channel_binding") !== "require") ||
        !uri.password
      )
        throw new Error("Existing candidate direct credential identity drift");
      const client = new pg.Client(
        scopedDirectClientConfiguration(text, purpose === "restore" ? "owner" : "runtime"),
      );
      client.on("error", () => {});
      try {
        await client.connect();
        // The exact, one reserved command. Native PG startup/end sends no additional SQL.
        return { rows: (await client.query(sql)).rows as Record<string, unknown>[] };
      } finally {
        await client.end();
      }
    },
  };
}
