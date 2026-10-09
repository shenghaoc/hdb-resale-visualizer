import type pg from "pg";

/** Native DIRECT PostgreSQL StartupMessage, not Hyperdrive or a SQL SET. */
export function scopedDirectClientConfiguration(
  connectionString: string,
  purpose: "owner" | "runtime",
): pg.ClientConfig {
  return {
    connectionString,
    connectionTimeoutMillis: 15_000,
    query_timeout: 65_000,
    application_name: "hdb-scoped-terminal-recovery",
    // Owner has no demonstrated default. Runtime must expose the actual role/database default.
    ...(purpose === "owner" ? { statement_timeout: 60_000 } : {}),
  };
}
