import pg from "pg";
import { D1Client, type D1Statement } from "./d1";
import { translate } from "./neon-translate";
import { MAX_ATOMIC_BYTES, MAX_ATOMIC_STATEMENTS, MAX_FORECAST_WRITES } from "./statements";
import type { ArtifactWritePlan } from "./store";
import type { GeneratedArtifacts } from "../pipeline";
import type { Manifest } from "../../../shared/data-types";

export const NEON_REFRESH_PROJECT = "wispy-mouse-67963002";
export const NEON_REFRESH_BRANCH = "br-wispy-boat-b34glczl";
export const NEON_REFRESH_ENDPOINT = "ep-steep-moon-b35xjj4d";
const HOST = `${NEON_REFRESH_ENDPOINT}.c-4.ap-southeast-1.aws.neon.tech`;
const TABLE_KEYS: Record<string, string[]> = {
  blocks: ["address_key"],
  block_details: ["address_key"],
  comparisons: ["address_key"],
  town_flat_type_trends: ["town", "flat_type", "month"],
  mrt_geojson: ["kind"],
};
const TABLES = new Set([
  "transactions",
  ...Object.keys(TABLE_KEYS),
  "manifest",
  "geocode_cache",
  "walking_time_cache",
]);
const TYPES = new Set(["text", "int2", "int4", "int8", "float8", "jsonb", "timestamptz"]);

export function validateNeonRefreshUrl(value: string, branch: string): string {
  if (branch !== NEON_REFRESH_BRANCH)
    throw new Error("Only the isolated Neon benchmark branch is authorized");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid isolated Neon connection configuration");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== HOST ||
    (url.port && url.port !== "5432") ||
    url.pathname !== "/neondb" ||
    !url.username ||
    !url.password ||
    [...url.searchParams.keys()].some((key) => !["sslmode", "channel_binding"].includes(key))
  ) {
    throw new Error("Only the verified direct benchmark endpoint/database is authorized");
  }
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

/** JSONB object order is not logical identity; arrays and number values retain their order/value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "number" && !Number.isFinite(item))
      throw new Error("Non-finite JSON number");
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    return item;
  });
}

export function canonicalNeonArtifacts(artifacts: GeneratedArtifacts): GeneratedArtifacts {
  return JSON.parse(canonicalJson(artifacts)) as GeneratedArtifacts;
}

export type PgQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{
  rows: Record<string, unknown>[];
  rowCount: number | null;
}>;

/** Failure receipts never carry endpoint credentials, signed URLs or upstream authentication. */
export function safeNeonError(error: unknown, sensitive: string[] = []): string {
  let message = error instanceof Error ? error.message : "Unknown Neon refresh error";
  for (const secret of sensitive.filter(Boolean))
    message = message.replaceAll(secret, "[redacted]");
  return message
    .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, "[redacted URL]")
    .slice(0, 800);
}

/** Existing extension only; unavailable instrumentation is unknown, never zero SQL time. */
export async function readNeonSqlTime(query: PgQuery): Promise<number | null> {
  try {
    const result = await query(
      "SELECT COALESCE(sum(total_exec_time),0) AS sql_ms FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND userid=(SELECT usesysid FROM pg_user WHERE usename=current_user)",
    );
    const time = Number(result.rows[0]?.sql_ms);
    return Number.isFinite(time) && time >= 0 ? time : null;
  } catch {
    return null;
  }
}

/**
 * Reuses the existing compiler and staged-cache helpers. No D1 request is made.
 * The shared read guards count returned PostgreSQL records here, never D1 billing reads.
 */
export class NeonPlanningStore extends D1Client {
  private stage = false;
  private phaseName = "snapshot";
  private cursors = new Map<string, { offset: number; keys: unknown[] }>();
  readonly columnTypes: Record<string, string> = {};
  readonly jsonColumns = new Set<string>();

  constructor(readonly pgQuery: PgQuery) {
    super({
      accountId: "unused",
      databaseId: "unused",
      apiToken: "unused",
      endpoint: "https://invalid.local",
    });
  }

  override setPhase(phase: string) {
    this.phaseName = phase;
    super.setPhase(phase);
  }
  override beginWriteStaging() {
    this.stage = true;
    super.beginWriteStaging();
  }
  override usageReport() {
    return {
      ...super.usageReport(),
      provenance: "postgres-returned-rows",
      durationProvenance: "client-query-await",
      billingReadsMeasured: false,
    };
  }

  async inspectSchema() {
    const result = await this.pgQuery(
      "SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public'",
    );
    for (const row of result.rows) {
      const table = String(row.table_name),
        column = String(row.column_name),
        type = String(row.udt_name);
      if (!TABLES.has(table)) continue;
      if (!/^[a-z_]+$/.test(column) || !TYPES.has(type))
        throw new Error("Unsupported Neon schema column/type");
      this.columnTypes[`${table}.${column}`] = type;
      if (type === "jsonb") this.jsonColumns.add(`${table}.${column}`);
    }
    for (const table of TABLES)
      if (!Object.keys(this.columnTypes).some((key) => key.startsWith(`${table}.`)))
        throw new Error(`Missing isolated Neon table: ${table}`);
  }

  override async query<TRow = Record<string, unknown>>(
    statement: D1Statement | D1Statement[],
  ): Promise<TRow[]> {
    if (Array.isArray(statement))
      throw new Error("Planning adapter accepts one statement at a time");
    if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(statement.sql)) {
      if (!this.stage) throw new Error("Neon mutations must be staged until atomic publication");
      return super.query<TRow>(statement); // The inherited staging path returns before HTTP.
    }
    if (!statement.sql.startsWith("SELECT ")) throw new Error("Unsupported planning statement");
    const started = performance.now();
    const table = statement.sql.match(/\bFROM ([a-z_]+)/)?.[1] ?? "unknown";
    let result: { rows: Record<string, unknown>[]; rowCount: number | null };
    if (table === "sqlite_master") {
      result = await this.pgQuery(
        "SELECT tablename AS tbl_name,indexdef AS sql FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[])",
        [[...TABLES]],
      );
    } else {
      if (!TABLES.has(table)) throw new Error("Unsupported planning read target");
      const artifact = statement.sql.match(
        /^SELECT rowid AS _cursor, ([a-z_,]+) FROM ([a-z_]+) WHERE rowid > \? ORDER BY rowid LIMIT \?$/,
      );
      if (artifact) {
        const columns = artifact[1].split(","),
          keys = TABLE_KEYS[table];
        if (!keys || columns.some((column) => !this.columnTypes[`${table}.${column}`]))
          throw new Error("Unsupported artifact snapshot columns");
        const [offset, limit] = (statement.params ?? []) as number[];
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 5000
        )
          throw new Error("Invalid snapshot page");
        const cursorKey = `${table}:${artifact[1]}`;
        const previous = offset ? this.cursors.get(cursorKey) : undefined;
        if (offset && (!previous || previous.offset !== offset))
          throw new Error("Invalid artifact cursor sequence");
        const where = previous
          ? `WHERE (${keys.join(",")}) > (${keys.map((_, i) => `$${i + 1}`).join(",")})`
          : "";
        const params = [...(previous?.keys ?? []), limit];
        result = await this.pgQuery(
          `SELECT ${[...new Set([...columns, ...keys])].join(",")} FROM ${table} ${where} ORDER BY ${keys.join(",")} LIMIT $${params.length}`,
          params,
        );
        result.rows.forEach((row, index) => {
          row._cursor = offset + index + 1;
        });
        const last = result.rows.at(-1);
        if (last)
          this.cursors.set(cursorKey, {
            offset: offset + result.rows.length,
            keys: keys.map((key) => last[key]),
          });
      } else {
        // Exact finite SELECT forms emitted by the current coordinator/helpers.
        if (
          !/^SELECT (?:json|id, [a-z_,]+|cache_key, [a-z_, ]+) FROM (?:manifest|transactions|geocode_cache|walking_time_cache)(?: WHERE id = 1| WHERE id > \? ORDER BY id LIMIT \?)?$/.test(
            statement.sql,
          )
        )
          throw new Error("Unsupported planning SELECT shape");
        let n = 0;
        result = await this.pgQuery(
          statement.sql.replace(/\?/g, () => `$${++n}`),
          statement.params,
        );
      }
      for (const row of result.rows)
        for (const [column, value] of Object.entries(row)) {
          if (value === null) continue;
          if (this.jsonColumns.has(`${table}.${column}`)) row[column] = canonicalJson(value);
          else if (value instanceof Date) row[column] = value.toISOString();
          else if (column === "id" && typeof value === "string") {
            const id = Number(value);
            if (!Number.isSafeInteger(id) || id < 1)
              throw new Error("Unsafe PostgreSQL transaction identity");
            row[column] = id;
          }
        }
    }
    this.usage.push({
      phase: this.phaseName,
      table,
      operation: "SELECT",
      rowsRead: result.rows.length,
      rowsWritten: 0,
      changes: 0,
      durationMs: performance.now() - started,
      success: true,
    });
    return result.rows as TRow[];
  }
}

export function publicationRowCount(statement: D1Statement): number {
  if (statement.sql.includes("FROM json_each(?)")) {
    const rows: unknown = JSON.parse(String(statement.params?.[0]));
    if (!Array.isArray(rows)) throw new Error("Invalid publication rows");
    return rows.length;
  }
  if (statement.sql.startsWith("UPDATE transactions ")) return 1;
  const columns = statement.sql
    .match(/^INSERT OR REPLACE INTO (?:geocode_cache|walking_time_cache) \(([^)]+)\) VALUES /)?.[1]
    .split(",");
  if (!columns || !statement.params?.length || statement.params.length % columns.length)
    throw new Error("Unsupported publication row-count shape");
  return statement.params.length / columns.length;
}

export class AmbiguousNeonPublicationError extends Error {}

export function validateNeonPublicationPlan(plan: ArtifactWritePlan, manifest: Manifest) {
  if (
    plan.forecastWriteUpperBound > MAX_FORECAST_WRITES ||
    plan.statements.length + 2 > MAX_ATOMIC_STATEMENTS ||
    Buffer.byteLength(JSON.stringify({ statements: plan.statements, manifest })) > MAX_ATOMIC_BYTES
  )
    throw new Error("Neon atomic publication safety bound exceeded before writes");
}

export async function publishNeon(
  query: PgQuery,
  store: NeonPlanningStore,
  plan: ArtifactWritePlan,
  manifest: Manifest,
  expectedManifest: string,
  updatedAt: string,
) {
  validateNeonPublicationPlan(plan, manifest);
  const statements = plan.statements.map((statement) => ({
    ...translate(statement, store.columnTypes),
    table:
      statement.sql.match(/^(?:INSERT(?: OR REPLACE)? INTO|UPDATE) ([a-z_]+)/)?.[1] ?? "unknown",
    expectedRows: publicationRowCount(statement),
  }));
  const started = performance.now(),
    rows: Record<string, number> = {};
  let commitAttempted = false;
  await query("BEGIN");
  try {
    const guard = await query(
      "SELECT json=$1::jsonb AS matches FROM manifest WHERE id=1 FOR UPDATE",
      [expectedManifest],
    );
    if (guard.rows.length !== 1 || guard.rows[0].matches !== true)
      throw new Error("Stale Neon publication baseline");
    for (const statement of statements) {
      const result = await query(statement.sql, statement.params);
      if (result.rowCount !== statement.expectedRows)
        throw new Error(`Unexpected affected-row count: ${statement.table}`);
      rows[statement.table] = (rows[statement.table] ?? 0) + statement.expectedRows;
    }
    const final = await query("UPDATE manifest SET json=$1::jsonb,updated_at=$2 WHERE id=1", [
      canonicalJson(manifest),
      updatedAt,
    ]);
    if (final.rowCount !== 1) throw new Error("Manifest publication boundary missing");
    commitAttempted = true;
    await query("COMMIT");
    return {
      wallMs: performance.now() - started,
      statements: statements.length + 2,
      roundTrips: statements.length + 4,
      changedRows: { ...rows, manifest: 1 },
    };
  } catch (error) {
    await query("ROLLBACK").catch(() => {});
    if (commitAttempted)
      throw new AmbiguousNeonPublicationError(
        "Neon commit outcome unknown; read the authoritative manifest and reconcile before retrying",
      );
    throw error;
  }
}

export function createNeonRefreshClient(url: string) {
  return new pg.Client({
    connectionString: url,
    application_name: "hdb-neon-refresh",
    statement_timeout: 120_000,
    connectionTimeoutMillis: 30_000,
  });
}
