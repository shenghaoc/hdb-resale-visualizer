// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { resetStationNamesCacheForTests } from "../../functions/_lib/suggest";
import { onRequestGet as manifestHandler } from "../../functions/api/manifest";
import { onRequestGet as blockSummariesHandler } from "../../functions/api/block-summaries";
import { onRequestGet as blocksByTownHandler } from "../../functions/api/blocks/[town]";
import { onRequestGet as detailHandler } from "../../functions/api/details/[addressKey]";
import { onRequestGet as comparisonHandler } from "../../functions/api/comparisons/[addressKey]";
import { onRequestGet as mrtStationsHandler } from "../../functions/api/mrt-stations";
import { onRequestGet as mrtExitsHandler } from "../../functions/api/mrt-exits";
import { onRequestGet as trendsHandler } from "../../functions/api/trends/town-flat-type";
import { onRequestGet as searchHandler } from "../../functions/api/search";
import { onRequestGet as suggestHandler } from "../../functions/api/suggest";
import { createNeonReadDb } from "../../worker/neon-read-db";
import { compilePublicRead } from "../../worker/neon-public-read-sql";

/**
 * The Neon shim only admits the exact SQL the production handlers issue. This runs every real public
 * GET handler through it so a handler SQL change fails here instead of in production.
 */
const block = {
  address_key: "1-bedok-north",
  town: "BEDOK",
  block: "1",
  street_name: "BEDOK NORTH",
  display_name: null,
  lat: 1.3,
  lng: 103.9,
  median_price: 500000.75,
  price_per_sqm_median: 5000,
  transaction_count: 5,
  floor_area_min: 80,
  floor_area_max: 110,
  lease_commence_year: 1990,
  latest_month: "2026-09",
  available_min_month: "1990-01",
  available_max_month: "2026-09",
  postal_code: "460001",
  flat_types_json: '["4 ROOM"]',
  flat_models_json: '["Model A"]',
  median_price_by_flat_type_json: '{"4 ROOM":500000.75}',
  median_price_per_sqm_by_flat_type_json: null,
  nearest_mrt_json: null,
  nearby_mrts_json: "[]",
  flat_type_cohorts_json:
    '{"4 ROOM":{"transactionCount":5,"floorAreaRange":[80,110],"flatModels":["Model A"],"latestMonth":"2026-09"}}',
};
const nativeRows = async (sql: string): Promise<Record<string, unknown>[]> => {
  if (sql.includes("public.manifest"))
    return [{ json: JSON.stringify({ generatedAt: "v1", counts: { blocks: 1 } }) }];
  if (sql.includes("public.block_details"))
    return [{ json: '{"addressKey":"1-bedok-north","transactions":[]}' }];
  if (sql.includes("public.comparisons"))
    return [{ json: '{"addressKey":"1-bedok-north","percentile":42}' }];
  if (sql.includes("public.mrt_geojson")) return [{ json: '{"type":"FeatureCollection"}' }];
  if (sql.includes("public.town_flat_type_trends"))
    return [
      {
        town: "BEDOK",
        flat_type: "4 ROOM",
        month: "2026-09",
        median_price: 500000,
        median_price_per_sqm: 5000,
        transaction_count: 5,
      },
    ];
  if (sql.includes("COUNT(*)")) return [{ total_count: 1, populated_count: 1 }];
  return [block];
};
type Handler = (context: {
  request: Request;
  env: { DB: D1Database };
  params: Record<string, string>;
  data: Record<string, unknown>;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Promise<Response> | Response;
const routes: [string, Handler, Record<string, string>][] = [
  ["/api/manifest", manifestHandler as unknown as Handler, {}],
  ["/api/block-summaries", blockSummariesHandler as unknown as Handler, {}],
  ["/api/blocks/bedok", blocksByTownHandler as unknown as Handler, { town: "bedok" }],
  [
    "/api/details/1-bedok-north",
    detailHandler as unknown as Handler,
    { addressKey: "1-bedok-north" },
  ],
  [
    "/api/comparisons/1-bedok-north",
    comparisonHandler as unknown as Handler,
    { addressKey: "1-bedok-north" },
  ],
  ["/api/mrt-stations", mrtStationsHandler as unknown as Handler, {}],
  ["/api/mrt-exits", mrtExitsHandler as unknown as Handler, {}],
  ["/api/trends/town-flat-type", trendsHandler as unknown as Handler, {}],
  ["/api/search?town=BEDOK", searchHandler as unknown as Handler, {}],
  [
    "/api/search?town=BEDOK&flatType=4%20ROOM&areaMin=90&budgetMax=600000&remainingLeaseMin=50",
    searchHandler as unknown as Handler,
    {},
  ],
  ["/api/suggest?q=bedok", suggestHandler as unknown as Handler, {}],
];

describe("every production public GET handler runs through the Neon read shim", () => {
  beforeEach(() => resetStationNamesCacheForTests());
  it.each(routes)("%s compiles to allowlisted native SELECTs", async (path, handler, params) => {
    const query = vi.fn(async (sql: string) => nativeRows(sql));
    const response = await handler({
      request: new Request(`https://test${path}`),
      env: { DB: createNeonReadDb(query) as unknown as D1Database },
      params,
      data: {},
      waitUntil: () => {},
    });
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalled();
    for (const [sql, bound] of query.mock.calls as unknown as [string, unknown[]][]) {
      expect(sql).toMatch(/^\s*(WITH\s|SELECT\s)/i);
      expect(sql).toContain("public.");
      expect(sql).not.toMatch(/\?\d*/); // every SQLite placeholder became a native $n
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i);
      expect(Array.isArray(bound)).toBe(true);
    }
  });
  it("refuses mutating, unknown and multi-statement SQL before any transport call", async () => {
    const query = vi.fn(async () => []);
    const db = createNeonReadDb(query);
    await expect(db.prepare("DELETE FROM blocks").all()).rejects.toThrow();
    await expect(db.prepare("SELECT 1").all()).rejects.toThrow();
    await expect(
      db.prepare("SELECT json FROM manifest WHERE id = 1; DELETE FROM manifest").all(),
    ).rejects.toThrow();
    expect(() => compilePublicRead("SELECT json FROM manifest WHERE id = 1", [1])).toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
