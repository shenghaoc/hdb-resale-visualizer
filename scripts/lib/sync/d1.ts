/**
 * Cloudflare D1 HTTP client used by the sync-data pipeline.
 *
 * The sync runs in Node (GitHub Actions or developer machine) and writes
 * directly to the same D1 database that Pages Functions read from at runtime.
 *
 * D1 REST API reference:
 *   POST /accounts/{account_id}/d1/database/{database_id}/query
 *   POST /accounts/{account_id}/d1/database/{database_id}/raw
 *
 * Both endpoints accept either a single `{sql, params}` object or an array of
 * statements (batch). Each statement has a 100KB body cap, so we issue
 * batched `INSERT ... VALUES (?,?),(?,?),...` multi-row inserts in chunks.
 */
import { fetchWithRetry } from "./fetchers";

export type D1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
  /** Override for tests/local emulators. */
  endpoint?: string;
};

type D1Statement = { sql: string; params?: unknown[] };

type D1QueryResult<TRow = Record<string, unknown>> = {
  success: boolean;
  errors: Array<{ message: string; code?: number }>;
  result: Array<{
    results?: TRow[];
    success?: boolean;
    meta?: { changes?: number; duration?: number; rows_read?: number; rows_written?: number };
  }>;
};

export function resolveD1ConfigFromEnv(): D1Config | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) {
    return null;
  }
  return { accountId, databaseId, apiToken, endpoint: process.env.CLOUDFLARE_D1_ENDPOINT };
}

function buildQueryUrl(config: D1Config): string {
  const base = config.endpoint ?? "https://api.cloudflare.com";
  return `${base}/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
}

export class D1Client {
  constructor(private readonly config: D1Config) {}

  /**
   * Run one or more parametric statements. Returns the typed rows from the
   * last statement's `results` array (mirroring `wrangler d1 execute`).
   */
  async query<TRow = Record<string, unknown>>(
    statement: D1Statement | D1Statement[],
  ): Promise<TRow[]> {
    const body = Array.isArray(statement) ? statement : [statement];
    const response = await fetchWithRetry(buildQueryUrl(this.config), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok && !response.headers.get("content-type")?.includes("application/json")) {
      // The response is not JSON — try to read the body as text for diagnostics.
      let bodyText = "";
      try { bodyText = await response.text(); } catch { /* ignore */ }
      throw new Error(`D1: HTTP ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 500)}` : ""}`);
    }
    let payload: D1QueryResult<TRow>;
    try {
      payload = (await response.json()) as D1QueryResult<TRow>;
    } catch {
      // Response claimed JSON but parse failed — read raw text for diagnostics.
      let bodyText = "";
      try { bodyText = await response.clone().text(); } catch { /* ignore */ }
      throw new Error(`D1: invalid JSON response${bodyText ? ` — ${bodyText.slice(0, 500)}` : ""}`);
    }
    if (!payload.success) {
      const message = payload.errors?.map((e) => e.message).join("; ") || "D1 query failed";
      throw new Error(`D1: ${message}`);
    }
    const last = payload.result[payload.result.length - 1];
    return last?.results ?? [];
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.query({ sql, params });
  }

  /**
   * Batch-insert rows using multi-row `VALUES (...)` tuples. Each chunk is one
   * HTTP request so callers can pick a chunk size that keeps the request body
   * comfortably under D1's 100KB-per-statement limit (rows per chunk × bytes
   * per row < 100_000). Each statement also has a 100-bound-param limit, so the
   * default chunk size is computed from the column count when not specified.
   *
   * When `preDelete` is true the first request batches `DELETE FROM <table>`
   * together with the first INSERT chunk to avoid a window where the table is
   * empty if the process is interrupted.
   */
  async batchInsert<TRow>(options: {
    table: string;
    columns: string[];
    rows: TRow[];
    mapRow: (row: TRow) => unknown[];
    chunkSize?: number;
    /** When true, emit `INSERT OR REPLACE` instead of `INSERT`. */
    upsert?: boolean;
    /** When true, batch `DELETE FROM <table>` with the first INSERT chunk. */
    preDelete?: boolean;
  }): Promise<void> {
    const { table, columns, rows, mapRow } = options;
    if (rows.length === 0) {
      if (options.preDelete) {
        await this.execute(`DELETE FROM ${table}`);
      }
      return;
    }
    // Cap at D1's 100-bound-param limit regardless of caller-provided or default value.
    const maxByParams = Math.max(1, Math.floor(100 / columns.length));
    const chunkSize = Math.min(options.chunkSize ?? maxByParams, maxByParams);
    const placeholders = `(${columns.map(() => "?").join(",")})`;
    const verb = options.upsert ? "INSERT OR REPLACE" : "INSERT";
    const sqlPrefix = `${verb} INTO ${table} (${columns.join(",")}) VALUES `;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const params: unknown[] = [];
      for (const row of chunk) {
        const values = mapRow(row);
        if (values.length !== columns.length) {
          throw new Error(
            `batchInsert(${table}): row provided ${values.length} values for ${columns.length} columns`,
          );
        }
        params.push(...values);
      }
      const sql = sqlPrefix + new Array(chunk.length).fill(placeholders).join(",");

      // First chunk with preDelete: batch DELETE + INSERT into one request.
      if (i === 0 && options.preDelete) {
        await this.query([
          { sql: `DELETE FROM ${table}` },
          { sql, params },
        ]);
      } else {
        await this.execute(sql, params);
      }
    }
  }

  /**
   * Replace the entire contents of a table — used for artifacts that are
   * rebuilt from scratch on every sync (blocks, trends, etc.). Persistent
   * caches must NOT be cleared; they are upserted in place.
   */
  async truncate(table: string): Promise<void> {
    await this.execute(`DELETE FROM ${table}`);
  }
}
