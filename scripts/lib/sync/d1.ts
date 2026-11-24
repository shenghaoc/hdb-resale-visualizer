/**
 * Cloudflare D1 HTTP client used by the sync-data pipeline.
 *
 * The sync runs in Node (GitHub Actions or developer machine) and writes
 * directly to the same D1 database that the Worker reads from at runtime.
 *
 * D1 REST API reference:
 *   POST /accounts/{account_id}/d1/database/{database_id}/query
 *   POST /accounts/{account_id}/d1/database/{database_id}/raw
 *
 * The `/query` endpoint accepts either a single `{ sql, params }` object or a
 * batch wrapper `{ batch: [{ sql, params }, ...] }`. Each statement has a
 * 100KB body cap, so we issue batched `INSERT ... VALUES (?,?),(?,?),...`
 * multi-row inserts in chunks.
 *
 * Two layers sit on top of that client:
 *
 * - Usage accounting (always on): every statement a request carries is recorded with the exact metadata
 *   the response reported, and `usageReport()` sums it. A figure that was not reported, or a request whose
 *   outcome is unknown, makes the aggregate `null`, never zero.
 * - Write staging (`beginWriteStaging()`, opt-in): mutating statements are held back instead of sent, so a
 *   caller can validate a whole plan first and publish it as one atomic batch. The remote REST `batch`
 *   envelope is not assumed to be atomic or metered like a Worker binding batch, so the incremental
 *   publisher applies staged batches to a loopback emulator only (`isLocalRehearsal`); production
 *   publication replaces the tables under the marker protocol in `./store`.
 */
import { fetchWithRetry } from "./fetchers";
import { MAX_ATOMIC_BYTES, MAX_ATOMIC_STATEMENTS } from "./statements";

export type D1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
  /** Override for tests/local emulators. */
  endpoint?: string;
};

export type D1ClientOptions = {
  /**
   * Retry transient failures (network errors, HTTP 429 and 5xx) with backoff, through `fetchWithRetry`.
   * Off by default: a retry can apply a request twice, and the usage ledger counts one attempt per
   * statement. `sync-data`'s marked full publication opts in, because its long multi-request run has
   * always relied on it.
   */
  retry?: boolean;
};

export type D1Statement = { sql: string; params?: unknown[] };

type D1QueryBody = D1Statement | { batch: D1Statement[] };

function buildQueryBody(statement: D1Statement | D1Statement[]): D1QueryBody {
  return Array.isArray(statement) ? { batch: statement } : statement;
}

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

export type D1UsageRecord = {
  phase: string;
  table: string;
  operation: string;
  rowsRead: number | null;
  rowsWritten: number | null;
  durationMs: number | null;
  changes: number | null;
  success: boolean;
};

export class D1Client {
  private staging = false;
  private staged: D1Statement[] = [];
  private usageIncomplete = false;
  private phase = "unclassified";
  readonly usage: D1UsageRecord[] = [];

  constructor(
    private readonly config: D1Config,
    private readonly options: D1ClientOptions = {},
  ) {}

  beginWriteStaging(): void {
    this.staging = true;
  }
  stagedWrites(): D1Statement[] {
    return this.staged.slice();
  }
  async publishStagedBatch(statements: D1Statement[]): Promise<void> {
    this.staging = false;
    try {
      await this.query(statements);
      this.staged = [];
    } finally {
      this.staging = true;
    }
  }

  setPhase(phase: string): void {
    this.phase = phase;
  }

  get isLocalRehearsal(): boolean {
    if (!this.config.endpoint) return false;
    const url = new URL(this.config.endpoint);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  }

  usageReport() {
    const sum = (key: "rowsRead" | "rowsWritten" | "durationMs") =>
      this.usageIncomplete || this.usage.some((record) => record[key] === null)
        ? null
        : this.usage.reduce((total, record) => total + (record[key] ?? 0), 0);
    return {
      provenance: this.isLocalRehearsal ? "local-emulator" : "remote-d1-http",
      statements: this.usage.length,
      rowsRead: sum("rowsRead"),
      rowsWritten: sum("rowsWritten"),
      durationMs: sum("durationMs"),
      records: this.usage,
    };
  }

  /**
   * Run one or more parametric statements. Returns the typed rows from the
   * last statement's `results` array (mirroring `wrangler d1 execute`).
   */
  async query<TRow = Record<string, unknown>>(
    statement: D1Statement | D1Statement[],
  ): Promise<TRow[]> {
    const queries = Array.isArray(statement) ? statement : [statement];
    if (
      this.staging &&
      queries.some((query) => /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query.sql.trim()))
    ) {
      if (queries.some((query) => !/^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query.sql.trim())))
        throw new Error("Cannot stage mixed read/write batch");
      this.staged.push(...queries);
      if (
        this.staged.length > MAX_ATOMIC_STATEMENTS ||
        new TextEncoder().encode(JSON.stringify(this.staged)).byteLength > MAX_ATOMIC_BYTES
      )
        throw new Error("Staged cache write budget exceeded before any D1 write");
      return [];
    }
    const usageBefore = this.usage.length;
    try {
      return await this.queryOnce<TRow>(statement);
    } catch (error) {
      if (this.usage.length === usageBefore) {
        for (const query of queries) {
          this.usage.push({
            phase: this.phase,
            table: query.sql.match(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)/i)?.[1] ?? "unknown",
            operation: query.sql.trim().split(/\s+/)[0].toUpperCase(),
            rowsRead: null,
            rowsWritten: null,
            durationMs: null,
            changes: null,
            success: false,
          });
        }
      }
      throw error;
    }
  }

  private async queryOnce<TRow>(statement: D1Statement | D1Statement[]): Promise<TRow[]> {
    const url = buildQueryUrl(this.config);
    const request: RequestInit = {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildQueryBody(statement)),
    };
    const response = this.options.retry
      ? await fetchWithRetry(url, request)
      : await fetch(url, request);
    if (!response.ok && !response.headers.get("content-type")?.includes("application/json")) {
      // The response is not JSON — try to read the body as text for diagnostics.
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        /* ignore */
      }
      throw new Error(
        `D1: HTTP ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 500)}` : ""}`,
      );
    }
    let payload: D1QueryResult<TRow>;
    try {
      payload = (await response.json()) as D1QueryResult<TRow>;
    } catch {
      // Response claimed JSON but parse failed — read raw text for diagnostics.
      let bodyText = "";
      try {
        bodyText = await response.clone().text();
      } catch {
        /* ignore */
      }
      throw new Error(`D1: invalid JSON response${bodyText ? ` — ${bodyText.slice(0, 500)}` : ""}`);
    }
    const statements = Array.isArray(statement) ? statement : [statement];
    if (payload.result?.length !== statements.length) this.usageIncomplete = true;
    for (const [index, query] of statements.entries()) {
      const result = payload.result?.[index];
      const metric = (value: number | undefined) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
      this.usage.push({
        phase: this.phase,
        table: query.sql.match(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)/i)?.[1] ?? "unknown",
        operation: query.sql.trim().split(/\s+/)[0].toUpperCase(),
        rowsRead: metric(result?.meta?.rows_read),
        rowsWritten: metric(result?.meta?.rows_written),
        durationMs: metric(result?.meta?.duration),
        changes: metric(result?.meta?.changes),
        success: response.ok && payload.success && !!result && result.success !== false,
      });
    }
    if (
      !response.ok ||
      !payload.success ||
      payload.result?.length !== statements.length ||
      payload.result?.some((result) => result.success === false)
    ) {
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
    /**
     * A SQL boolean expression that every statement of this call is made conditional on, in the statement
     * itself (`... SELECT ... WHERE <guard>` / `DELETE ... WHERE <guard>`), so a caller that has lost whatever
     * the expression checks (a publication lease) writes nothing instead of being noticed afterwards. It is
     * spliced into the SQL as written: build it from trusted text only.
     */
    guard?: string;
  }): Promise<void> {
    const { table, columns, rows, mapRow, guard } = options;
    const where = guard ? ` WHERE ${guard}` : "";
    if (rows.length === 0) {
      if (options.preDelete) {
        await this.execute(`DELETE FROM ${table}${where}`);
      }
      return;
    }
    // Cap at D1's 100-bound-param limit regardless of caller-provided or default value.
    const maxByParams = Math.max(1, Math.floor(100 / columns.length));
    const chunkSize = Math.min(options.chunkSize ?? maxByParams, maxByParams);
    const placeholders = `(${columns.map(() => "?").join(",")})`;
    const verb = options.upsert ? "INSERT OR REPLACE" : "INSERT";
    // Guarded: rows come from a VALUES subquery (SQLite names its columns column1, column2, ...) so that a
    // WHERE clause can sit between the data and the write. The bound parameters are exactly the same.
    const sqlPrefix = guard
      ? `${verb} INTO ${table} (${columns.join(",")}) SELECT ${columns.map((_, index) => `column${index + 1}`).join(",")} FROM (VALUES `
      : `${verb} INTO ${table} (${columns.join(",")}) VALUES `;
    const sqlSuffix = guard ? `)${where}` : "";

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
      const sql =
        sqlPrefix + Array.from({ length: chunk.length }, () => placeholders).join(",") + sqlSuffix;

      // First chunk with preDelete: batch DELETE + INSERT into one request.
      if (i === 0 && options.preDelete) {
        await this.query([{ sql: `DELETE FROM ${table}${where}` }, { sql, params }]);
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
  async truncate(table: string, guard?: string): Promise<void> {
    await this.execute(`DELETE FROM ${table}${guard ? ` WHERE ${guard}` : ""}`);
  }
}
