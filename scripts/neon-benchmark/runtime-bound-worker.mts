/** Temporary authenticated SELECT-only rehearsal. Never used by the production router. */
import pg from "pg";
import { timingSafeEqual } from "node:crypto";
import { createPublicReadAdapter } from "./runtime-read-adapter.mjs";
import { compilePublicRead } from "./runtime-read-sql";

type BenchmarkEnv = {
  BENCHMARK_TOKEN: string;
  HYPERDRIVE: { connectionString: string };
};
const decoder = new TextEncoder();
function authorized(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(decoder.encode(actual), decoder.encode(expected));
}
const summarySql = compilePublicRead(
  "SELECT * FROM blocks ORDER BY median_price DESC, transaction_count DESC",
).sql;
const diagnostic = `WITH summary AS (${summarySql}), sized AS (
  SELECT address_key,town,octet_length(row_to_json(summary)::text) AS bytes FROM summary
) SELECT current_user AS role,
  has_table_privilege(current_user,'public.transactions','INSERT,UPDATE,DELETE') AS fact_write,
  has_table_privilege(current_user,'public.shortlists','SELECT,INSERT,UPDATE,DELETE') AS private_access,
  (SELECT count(*)::integer FROM blocks) AS blocks,
  (SELECT count(*)::integer FROM town_flat_type_trends) AS trends,
  (SELECT sum(bytes)::double precision FROM sized) AS summary_json_bytes,
  (SELECT max(bytes)::integer FROM sized) AS maximum_block_json_bytes,
  (SELECT sum(bytes)::double precision FROM (SELECT bytes FROM sized ORDER BY bytes DESC LIMIT 2001) AS biggest) AS maximum_search_json_bytes,
  (SELECT town FROM sized GROUP BY town ORDER BY sum(bytes) DESC LIMIT 1) AS largest_town,
  (SELECT max(bytes)::double precision FROM (SELECT sum(bytes) AS bytes FROM sized GROUP BY town) AS towns) AS largest_town_json_bytes,
  (SELECT address_key FROM block_details ORDER BY octet_length(json::text) DESC LIMIT 1) AS largest_detail_key,
  (SELECT max(octet_length(json::text)) FROM block_details) AS largest_detail_bytes,
  (SELECT address_key FROM comparisons ORDER BY octet_length(json::text) DESC LIMIT 1) AS largest_comparison_key,
  (SELECT max(octet_length(json::text)) FROM comparisons) AS largest_comparison_bytes,
  (SELECT octet_length(json::text) FROM manifest WHERE id=1) AS manifest_bytes,
  (SELECT count(*)::integer FROM mrt_geojson) AS mrt_rows,
  (SELECT coalesce(sum(calls),0)::double precision FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS role_sql_calls,
  (SELECT coalesce(sum(total_exec_time),0)::double precision FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS role_sql_ms`;

export default {
  async fetch(request: Request, env: BenchmarkEnv): Promise<Response> {
    if (!authorized(request.headers.get("x-benchmark-token"), env.BENCHMARK_TOKEN))
      return new Response("Forbidden", { status: 403 });
    if (request.method !== "GET") return new Response("GET only", { status: 405 });
    const url = new URL(request.url);
    const started = performance.now();
    let client: pg.Client | undefined;
    let receivedBytes = 0;
    let connectMs = 0;
    const queries: { rows: number; receivedBytes: number; roundTripMs: number }[] = [];
    async function query(sql: string, params: readonly unknown[]) {
      if (!client) {
        const begin = performance.now();
        client = new pg.Client({
          connectionString: env.HYPERDRIVE.connectionString,
          connectionTimeoutMillis: 15000,
          query_timeout: 60000,
        });
        const instrumented = client as pg.Client & {
          connection: {
            stream: { on: (event: string, callback: (chunk: Uint8Array) => void) => void };
          };
        };
        instrumented.connection.stream.on("data", (chunk) => {
          receivedBytes += chunk.byteLength;
        });
        await client.connect();
        connectMs += performance.now() - begin;
      }
      const before = receivedBytes;
      const begin = performance.now();
      const result = await client.query(sql, [...params]);
      queries.push({
        rows: result.rows.length,
        receivedBytes: receivedBytes - before,
        roundTripMs: performance.now() - begin,
      });
      return result.rows as Record<string, unknown>[];
    }
    let response: Response;
    try {
      if (url.pathname === "/control/diagnostic") {
        response = Response.json((await query(diagnostic, []))[0]);
      } else {
        const realCache = "default" in caches ? (caches.default as Cache) : null;
        if (!realCache) throw new Error("Worker Cache API unavailable");
        const cache =
          request.headers.get("x-benchmark-mode") === "cold"
            ? { match: async () => undefined, put: async () => {} }
            : realCache;
        response = await createPublicReadAdapter(query, cache)(request);
      }
    } catch {
      response = new Response("Isolated runtime benchmark failed", {
        status: 502,
        headers: { "cache-control": "no-store" },
      });
    } finally {
      if (client) await client.end();
    }
    const result = new Response(response.body, response);
    result.headers.set("x-benchmark-received-bytes", String(receivedBytes));
    result.headers.set("x-benchmark-connect-ms", String(connectMs));
    result.headers.set("x-benchmark-handler-ms", String(performance.now() - started));
    result.headers.set("x-benchmark-queries", JSON.stringify(queries));
    const workerRequest = request as Request & { cf?: { colo?: string } };
    result.headers.set("x-benchmark-colo", String(workerRequest.cf?.colo ?? "unknown"));
    return result;
  },
};
