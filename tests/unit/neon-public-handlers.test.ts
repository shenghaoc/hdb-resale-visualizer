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
import type { PublicRouteHandler } from "../../functions/_lib/public-data";
import { createNeonPublicData } from "../../worker/public-data-neon";

/**
 * Runs every real public GET route on the Neon implementation: each one must answer from fixed,
 * parameterized SELECTs on the public schema. Row-level equality with D1 is
 * tests/unit/public-data-parity.test.ts.
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
const routes: [string, PublicRouteHandler, Record<string, string>][] = [
  ["/api/manifest", manifestHandler, {}],
  ["/api/block-summaries", blockSummariesHandler, {}],
  ["/api/blocks/bedok", blocksByTownHandler, { town: "bedok" }],
  ["/api/details/1-bedok-north", detailHandler, { addressKey: "1-bedok-north" }],
  ["/api/comparisons/1-bedok-north", comparisonHandler, { addressKey: "1-bedok-north" }],
  ["/api/mrt-stations", mrtStationsHandler, {}],
  ["/api/mrt-exits", mrtExitsHandler, {}],
  ["/api/trends/town-flat-type", trendsHandler, {}],
  ["/api/search?town=BEDOK", searchHandler, {}],
  [
    "/api/search?town=BEDOK&flatType=4%20ROOM&areaMin=90&budgetMax=600000&remainingLeaseMin=50",
    searchHandler,
    {},
  ],
  ["/api/suggest?q=bedok", suggestHandler, {}],
];

describe("every production public GET route runs on the Neon implementation", () => {
  beforeEach(() => resetStationNamesCacheForTests());
  it.each(routes)("%s answers from native SELECTs", async (path, handler, params) => {
    const query = vi.fn(async (sql: string) => nativeRows(sql));
    const response = await handler({
      request: new Request(`https://test${path}`),
      params,
      publicData: createNeonPublicData(query),
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
  it("never puts request text into SQL: it only travels as bound parameters", async () => {
    const hostile = "x'; DELETE FROM manifest; --";
    const encoded = encodeURIComponent(hostile);
    const hostileRoutes: [string, PublicRouteHandler, Record<string, string>][] = [
      [`/api/blocks/${encoded}`, blocksByTownHandler, { town: hostile }],
      [`/api/details/${encoded}`, detailHandler, { addressKey: hostile }],
      [`/api/comparisons/${encoded}`, comparisonHandler, { addressKey: hostile }],
      [
        `/api/search?town=${encoded}&flatType=${encoded}&flatModel=${encoded}&areaMin=1&startMonth=2020-01`,
        searchHandler,
        {},
      ],
      [`/api/suggest?q=${encoded}`, suggestHandler, {}],
    ];
    for (const [path, handler, params] of hostileRoutes) {
      const query = vi.fn(async (sql: string) => nativeRows(sql));
      await handler({
        request: new Request(`https://test${path}`),
        params,
        publicData: createNeonPublicData(query),
      });
      expect(query).toHaveBeenCalled();
      for (const [sql] of query.mock.calls as unknown as [string, unknown[]][]) {
        expect(sql).not.toContain("DELETE");
        expect(sql).not.toMatch(/x'|; --/);
      }
    }
  });
});
