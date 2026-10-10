import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  NEARBY_RESERVE_SQL,
  nearbyStatementCeiling,
  reserveNearbyStatements,
  secondsUntilUtcMidnight,
  utcDay,
  type NearbyBudgetQuery,
} from "../../functions/_lib/nearby-budget";
import { NEARBY_DAILY_STATEMENT_CEILING } from "../../shared/nearby-limits";

/**
 * Small simulation of the PostgreSQL function's boolean protocol, not a substitute
 * for the live concurrency and role tests in sql/neon/verify_nearby_daily_budget.sql.
 */
function simulatedPostgres() {
  const counts = new Map<string, number>();
  const query = vi.fn<NearbyBudgetQuery>(async (sql, params) => {
    if (sql !== NEARBY_RESERVE_SQL) throw new Error("Unexpected quota SQL");
    const ceiling = Number(params[0]);
    const day = utcDay(new Date());
    const used = counts.get(day) ?? 0;
    if (used >= ceiling) return [{ granted: false }];
    counts.set(day, used + 1);
    return [{ granted: true }];
  });
  return { counts, query };
}

describe("Neon nearby budget protocol", () => {
  it("uses one bounded PostgreSQL function call, not a D1 binding", () => {
    expect(NEARBY_RESERVE_SQL).toBe("SELECT public.reserve_nearby_statement($1::integer) AS granted");
    expect(NEARBY_RESERVE_SQL).not.toMatch(/nearby_statement_budget|INSERT|UPDATE|DELETE|\bDB\b/i);
  });

  it("allows exactly the configured count and refuses further calls", async () => {
    const { query, counts } = simulatedPostgres();
    expect(await reserveNearbyStatements(query, "2")).toBeNull();
    expect(await reserveNearbyStatements(query, "2")).toBeNull();
    const response = await reserveNearbyStatements(query, "2");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("retry-after")).toBeTruthy();
    expect(query).toHaveBeenCalledTimes(3);
    expect(counts.get(utcDay(new Date()))).toBe(2);
  });

  it("does not proceed without the separate budget binding", async () => {
    const response = await reserveNearbyStatements(undefined, undefined);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: "Nearby search is not configured" });
  });

  it("fails closed on malformed, empty or unexpected PostgreSQL answers", async () => {
    for (const rows of [[], [{ granted: null }], [{ granted: 1 }], [{ granted: true }, { granted: true }]]) {
      const response = await reserveNearbyStatements(async () => rows, "2");
      expect(response?.status).toBe(503);
    }
  });

  it("fails closed on a rejected query", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await reserveNearbyStatements(async () => Promise.reject(new Error("offline")), "2");
    expect(response?.status).toBe(503);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("never sends a query for a bad or excessive configured ceiling", async () => {
    const query = vi.fn<NearbyBudgetQuery>(async () => [{ granted: true }]);
    for (const bad of ["0", "", "10001", "100000", "-1", "abc", "1.5"]) {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await reserveNearbyStatements(query, bad);
      expect(response?.status).toBe(503);
      error.mockRestore();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("passes the ceiling as a bounded SQL parameter rather than interpolating it", async () => {
    const query = vi.fn<NearbyBudgetQuery>(async () => [{ granted: true }]);
    expect(await reserveNearbyStatements(query, "3")).toBeNull();
    expect(query).toHaveBeenCalledExactlyOnceWith(NEARBY_RESERVE_SQL, [3]);
    expect(nearbyStatementCeiling(undefined)).toBe(NEARBY_DAILY_STATEMENT_CEILING);
  });

  it("calculates UTC boundaries correctly", () => {
    const near = new Date("2026-10-10T23:59:58Z");
    expect(utcDay(near)).toBe("2026-10-10");
    expect(secondsUntilUtcMidnight(near)).toBe(60);
    expect(secondsUntilUtcMidnight(new Date("2026-10-10T12:00:00Z"))).toBe(43200);
  });

  it("records the dedicated role and bounded atomic UPSERT in the Neon migration", () => {
    const sql = readFileSync(join(process.cwd(), "sql/neon/002_nearby_daily_budget.sql"), "utf8");
    expect(sql).toContain("hdb_nearby_budget");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("search_path = pg_catalog, pg_temp");
    expect(sql).toContain("ON CONFLICT (day) DO UPDATE");
    expect(sql).toContain("RETURNING true INTO admitted");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("GRANT EXECUTE");
    expect(sql).not.toMatch(/ALTER ROLE hdb_benchmark_runtime/i);
  });
});
