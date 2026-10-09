// Temporary, token-gated benchmark only. No production assets/routes/D1 bindings.
import { neon } from "@neondatabase/serverless";
import pg from "pg";
import { withPublicDataCache } from "../../worker/public-data-cache";

type BenchmarkEnv = {
  DATABASE_URL: string;
  BENCHMARK_TOKEN: string;
  HYPERDRIVE?: { connectionString: string };
};
export default {
  async fetch(request: Request, env: BenchmarkEnv): Promise<Response> {
    if (request.headers.get("x-benchmark-token") !== env.BENCHMARK_TOKEN)
      return new Response("Forbidden", { status: 403 });
    const url = new URL(request.url);
    const sharedCache = (caches as unknown as { default: Cache }).default;
    const backend =
      request.headers.get("x-benchmark-backend") === "hyperdrive" ? "hyperdrive" : "http";
    let calls = 0,
      returnedRows = 0,
      queryMs = 0,
      connectMs = 0;
    let client: pg.Client | undefined;
    const http = neon(env.DATABASE_URL);
    async function query(sql: string, params: (string | number)[] = []) {
      calls++;
      const started = performance.now();
      let rows: Record<string, unknown>[];
      if (backend === "hyperdrive") {
        if (!env.HYPERDRIVE) throw new Error("No benchmark Hyperdrive");
        if (!client) {
          const connectionStart = performance.now();
          client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
          await client.connect();
          connectMs += performance.now() - connectionStart;
        }
        rows = (await client.query(sql, params)).rows;
      } else rows = await http.query(sql, params);
      queryMs += performance.now() - started;
      returnedRows += rows.length;
      return rows;
    }
    try {
      if (url.pathname === "/control/pointer" && request.method === "DELETE") {
        const deleted = await sharedCache.delete(
          new Request(`${url.origin}/__public-data-cache/v1/pointer`),
        );
        return Response.json({ deleted });
      }
      // What the public data cache needs from the database: the stored manifest text.
      const versionSource = {
        manifestJson: async () => {
          const rows = await query("SELECT json::text AS json FROM manifest WHERE id=1");
          return (rows[0] as { json: string } | undefined)?.json ?? null;
        },
      };
      const respond = async () => {
        let rows: Record<string, unknown>[];
        if (url.pathname.endsWith("/role"))
          rows = await query(
            "SELECT current_user AS role,rolsuper,rolcreatedb,rolcreaterole,pg_has_role(current_user,'neon_superuser','MEMBER') AS elevated,has_table_privilege(current_user,'transactions','SELECT') AS public_read,has_table_privilege(current_user,'transactions','INSERT,UPDATE,DELETE') AS fact_write,has_table_privilege(current_user,'shortlists','SELECT,INSERT,UPDATE,DELETE') AS private_access FROM pg_roles WHERE rolname=current_user",
          );
        else if (url.pathname.endsWith("/manifest"))
          rows = await query("SELECT json FROM manifest WHERE id=1");
        else if (url.pathname.includes("/details/"))
          rows = await query("SELECT json FROM block_details WHERE address_key=$1", [
            decodeURIComponent(url.pathname.split("/").at(-1)!),
          ]);
        else if (url.pathname.includes("/shortlist/"))
          rows = await query("SELECT id FROM manifest WHERE id=1"); // Synthetic private response; no user records.
        else
          rows = await query(
            "SELECT id,month,resale_price FROM transactions WHERE town=$1 AND flat_type=$2 ORDER BY month DESC LIMIT 150",
            [
              url.searchParams.get("town") ?? "ANG MO KIO",
              url.searchParams.get("flatType") ?? "4 ROOM",
            ],
          );
        if (request.headers.has("x-benchmark-race")) await query("SELECT pg_sleep(2)"); // Harness changes only the benchmark manifest during this pause.
        return Response.json(
          { rows, backend },
          {
            status: request.headers.has("x-benchmark-error") ? 503 : 200,
            headers: {
              "cache-control":
                url.pathname.includes("/shortlist/") || request.headers.has("x-benchmark-private")
                  ? "private, no-store"
                  : "public, max-age=60, s-maxage=3600",
            },
          },
        );
      };
      const response = url.pathname.startsWith("/direct/")
        ? await respond()
        : await withPublicDataCache(request, versionSource, sharedCache, respond);
      const result = new Response(response.body, response);
      result.headers.set("x-benchmark-db-calls", String(calls));
      result.headers.set("x-benchmark-rows-returned", String(returnedRows));
      result.headers.set("x-benchmark-query-ms", String(queryMs));
      result.headers.set("x-benchmark-connect-ms", String(connectMs));
      result.headers.set(
        "x-benchmark-colo",
        String((request as Request & { cf?: { colo?: string } }).cf?.colo ?? "unknown"),
      );
      return result;
    } catch {
      return new Response("Benchmark database request failed", {
        status: 502,
        headers: { "cache-control": "no-store" },
      });
    } finally {
      if (client) await client.end();
    }
  },
};
