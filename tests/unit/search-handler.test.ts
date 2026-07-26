import { describe, expect, it } from "vite-plus/test";
import { onRequestGet } from "../../functions/api/search";

describe("/api/search handler", () => {
  it("returns truncated flag when rows exceed cap", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      address_key: `k-${i}`,
      town: "BEDOK",
      block: "1",
      street_name: "A",
      display_name: null,
      lat: 1.3,
      lng: 103.9,
      median_price: 500000,
      price_per_sqm_median: 5000,
      transaction_count: 1,
      floor_area_min: 90,
      floor_area_max: 100,
      lease_commence_year: 1990,
      latest_month: "2024-12",
      available_min_month: "2020-01",
      available_max_month: "2024-12",
      flat_types_json: '["4 ROOM"]',
      flat_models_json: '["Model A"]',
      median_price_by_flat_type_json: null,
      median_price_per_sqm_by_flat_type_json: null,
      flat_type_cohorts_json:
        '{"4 ROOM":{"transactionCount":1,"latestMonth":"2024-12","floorAreaRange":[90,100],"flatModels":["Model A"]}}',
      nearest_mrt_json: null,
      nearby_mrts_json: "[]",
      postal_code: null,
    }));
    const ctx = {
      request: new Request("http://localhost/api/search?town=BEDOK"),
      env: { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) } },
    } as unknown as Parameters<typeof onRequestGet>[0];
    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as { truncated: boolean; blocks: unknown[] };
    expect(body.truncated).toBe(true);
    expect(body.blocks).toHaveLength(2000);
    expect(body.blocks[0]).toMatchObject({
      flatTypeCohorts: {
        "4 ROOM": {
          transactionCount: 1,
          latestMonth: "2024-12",
          floorAreaRange: [90, 100],
          flatModels: ["Model A"],
        },
      },
    });
  });

  it("falls back safely while the additive cohort migration is pending", async () => {
    const preparedSql: string[] = [];
    const ctx = {
      request: new Request(
        "http://localhost/api/search?town=BEDOK&flatType=4%20ROOM&flatModel=MODEL%20A",
      ),
      env: {
        DB: {
          prepare: (sql: string) => {
            preparedSql.push(sql);
            return {
              bind: () => ({
                all: async () => {
                  if (preparedSql.length === 1) {
                    throw new Error("D1_ERROR: no such column: blocks.flat_type_cohorts_json");
                  }
                  return { results: [] };
                },
              }),
            };
          },
        },
      },
    } as unknown as Parameters<typeof onRequestGet>[0];

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as {
      blocks: unknown[];
      cohortMetadataAvailable: boolean;
    };
    expect(resp.status).toBe(200);
    expect(body.blocks).toEqual([]);
    expect(body.cohortMetadataAvailable).toBe(false);
    expect(preparedSql).toHaveLength(2);
    expect(preparedSql[1]).toContain("WHERE 0 = 1");
  });

  it("reports cohort metadata unavailable until migrated rows are backfilled", async () => {
    const preparedSql: string[] = [];
    const ctx = {
      request: new Request(
        "http://localhost/api/search?town=BEDOK&flatType=4%20ROOM&startMonth=2024-01",
      ),
      env: {
        DB: {
          prepare: (sql: string) => {
            preparedSql.push(sql);
            return {
              bind: () => ({
                all: async () =>
                  preparedSql.length === 1
                    ? { results: [{ total_count: 10, populated_count: 0 }] }
                    : { results: [] },
              }),
            };
          },
        },
      },
    } as unknown as Parameters<typeof onRequestGet>[0];

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as {
      blocks: unknown[];
      cohortMetadataAvailable: boolean;
    };

    expect(resp.status).toBe(200);
    expect(body.blocks).toEqual([]);
    expect(body.cohortMetadataAvailable).toBe(false);
    expect(preparedSql[0]).toContain("COUNT(NULLIF(TRIM(flat_type_cohorts_json)");
    expect(preparedSql[1]).toContain("WHERE 0 = 1");
  });

  it("uses cohort predicates after every block is backfilled", async () => {
    const preparedSql: string[] = [];
    const ctx = {
      request: new Request("http://localhost/api/search?town=BEDOK&flatType=4%20ROOM&areaMin=90"),
      env: {
        DB: {
          prepare: (sql: string) => {
            preparedSql.push(sql);
            return {
              bind: () => ({
                all: async () =>
                  sql.includes("COUNT(NULLIF(TRIM(flat_type_cohorts_json)")
                    ? { results: [{ total_count: 10, populated_count: 10 }] }
                    : { results: [] },
              }),
            };
          },
        },
      },
    } as unknown as Parameters<typeof onRequestGet>[0];

    const resp = await onRequestGet(ctx);
    const body = (await resp.json()) as { cohortMetadataAvailable: boolean };

    expect(resp.status).toBe(200);
    expect(body.cohortMetadataAvailable).toBe(true);
    expect(preparedSql[1]).toContain("flat_type_cohorts_json");
    expect(preparedSql[1]).not.toContain("WHERE 0 = 1");
  });
});
