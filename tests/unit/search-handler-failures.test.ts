import { describe, expect, it } from "vite-plus/test";
import { onRequestGet } from "../../functions/api/search";
import { createD1PublicData } from "../../worker/public-data-d1";

type SearchContext = Parameters<typeof onRequestGet>[0];

function searchContext(
  url: string,
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => { all: () => Promise<{ results?: unknown[] }> };
  },
): SearchContext {
  return {
    request: new Request(url),
    publicData: createD1PublicData({ prepare } as unknown as D1Database),
  } as unknown as SearchContext;
}

describe("/api/search failure modes", () => {
  it("retries without cohort SQL when a complete probe races a missing column", async () => {
    const preparedSql: string[] = [];
    let cohortQueryAttempts = 0;
    const ctx = searchContext(
      "http://localhost/api/search?town=BEDOK&flatType=4%20ROOM&areaMin=90",
      (sql) => {
        preparedSql.push(sql);
        return {
          bind: () => ({
            all: async () => {
              if (sql.includes("COUNT(NULLIF(TRIM(flat_type_cohorts_json)")) {
                return { results: [{ total_count: 4, populated_count: 4 }] };
              }
              if (sql.includes("flat_type_cohorts_json")) {
                cohortQueryAttempts += 1;
                throw new Error("D1_ERROR: no such column: blocks.flat_type_cohorts_json");
              }
              return { results: [] };
            },
          }),
        };
      },
    );

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as {
      blocks: unknown[];
      cohortMetadataAvailable: boolean;
    };

    expect(resp.status).toBe(200);
    expect(body.blocks).toEqual([]);
    expect(body.cohortMetadataAvailable).toBe(false);
    expect(cohortQueryAttempts).toBe(1);
    expect(preparedSql).toHaveLength(3);
    expect(preparedSql[2]).toContain("WHERE 0 = 1");
  });

  it("returns 500 when the cohort probe fails for a reason other than a missing column", async () => {
    const preparedSql: string[] = [];
    const ctx = searchContext(
      "http://localhost/api/search?flatType=4%20ROOM&flatModel=MODEL%20A",
      (sql) => {
        preparedSql.push(sql);
        return {
          bind: () => ({
            all: async () => {
              throw new Error("D1 timeout");
            },
          }),
        };
      },
    );

    const resp = await onRequestGet(ctx);
    expect(resp.status).toBe(500);
    await expect(resp.json()).resolves.toEqual({ error: "Internal server error" });
    expect(preparedSql).toHaveLength(1);
    expect(preparedSql[0]).toContain("COUNT(NULLIF(TRIM(flat_type_cohorts_json)");
  });

  it("returns 500 when the block query fails after cohorts are not required", async () => {
    const ctx = searchContext("http://localhost/api/search?town=BEDOK", () => ({
      bind: () => ({
        all: async () => {
          throw new Error("D1 busy");
        },
      }),
    }));

    const resp = await onRequestGet(ctx);
    expect(resp.status).toBe(500);
    await expect(resp.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("refuses a flat-type refinement when the catalog is empty", async () => {
    const preparedSql: string[] = [];
    const ctx = searchContext(
      "http://localhost/api/search?flatType=4%20ROOM&startMonth=2024-01",
      (sql) => {
        preparedSql.push(sql);
        return {
          bind: () => ({
            all: async () =>
              sql.includes("COUNT(NULLIF(TRIM(flat_type_cohorts_json)")
                ? { results: [{ total_count: 0, populated_count: 0 }] }
                : { results: [] },
          }),
        };
      },
    );

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as {
      blocks: unknown[];
      cohortMetadataAvailable: boolean;
    };

    expect(resp.status).toBe(200);
    expect(body.cohortMetadataAvailable).toBe(false);
    expect(body.blocks).toEqual([]);
    expect(preparedSql[1]).toContain("WHERE 0 = 1");
  });

  it("treats non-numeric cohort counts as incomplete metadata", async () => {
    const preparedSql: string[] = [];
    const ctx = searchContext(
      "http://localhost/api/search?flatType=4%20ROOM&endMonth=2024-12",
      (sql) => {
        preparedSql.push(sql);
        return {
          bind: () => ({
            all: async () =>
              sql.includes("COUNT(NULLIF(TRIM(flat_type_cohorts_json)")
                ? { results: [{ total_count: "10", populated_count: "10" }] }
                : { results: [] },
          }),
        };
      },
    );

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as { cohortMetadataAvailable: boolean };

    expect(resp.status).toBe(200);
    expect(body.cohortMetadataAvailable).toBe(false);
    expect(preparedSql[1]).toContain("WHERE 0 = 1");
  });

  it("returns an empty block list when D1 omits the results array", async () => {
    const ctx = searchContext("http://localhost/api/search?town=BEDOK", () => ({
      bind: () => ({
        all: async () => ({}),
      }),
    }));

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as {
      blocks: unknown[];
      truncated: boolean;
      limit: number;
      cohortMetadataAvailable: boolean;
    };

    expect(resp.status).toBe(200);
    expect(body).toEqual({
      blocks: [],
      truncated: false,
      limit: 2000,
      cohortMetadataAvailable: true,
    });
  });
});
