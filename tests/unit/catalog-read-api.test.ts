import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { onRequestGet as blockSummariesHandler } from "../../functions/api/block-summaries";
import { onRequestGet as townTrendsHandler } from "../../functions/api/trends/town-flat-type";
import { createD1PublicData } from "../../worker/public-data-d1";

type BlockRow = {
  address_key: string;
  town: string;
  block: string;
  street_name: string;
  display_name: string | null;
  lat: number;
  lng: number;
  median_price: number;
  price_per_sqm_median: number;
  transaction_count: number;
  floor_area_min: number;
  floor_area_max: number;
  lease_commence_year: number;
  latest_month: string;
  available_min_month: string;
  available_max_month: string;
  flat_types_json: string;
  flat_models_json: string;
  median_price_by_flat_type_json: string | null;
  median_price_per_sqm_by_flat_type_json: string | null;
  nearest_mrt_json: string | null;
  nearby_mrts_json: string | null;
  postal_code: string | null;
};

function blockRow(overrides: Partial<BlockRow> = {}): BlockRow {
  return {
    address_key: "bedok-123-example-road",
    town: "BEDOK",
    block: "123",
    street_name: "EXAMPLE ROAD",
    display_name: "123 EXAMPLE ROAD",
    lat: 1.32,
    lng: 103.93,
    median_price: 500000,
    price_per_sqm_median: 5500,
    transaction_count: 8,
    floor_area_min: 67,
    floor_area_max: 110,
    lease_commence_year: 1988,
    latest_month: "2026-04",
    available_min_month: "2017-01",
    available_max_month: "2026-04",
    flat_types_json: '["4 ROOM"]',
    flat_models_json: '["Model A"]',
    median_price_by_flat_type_json: null,
    median_price_per_sqm_by_flat_type_json: null,
    nearest_mrt_json: JSON.stringify({
      stationName: "BEDOK",
      distanceMeters: 400,
      walkingTimeSeconds: 300,
    }),
    nearby_mrts_json: "[]",
    postal_code: "460123",
    ...overrides,
  };
}

function queryDb(rows: unknown[] | null, options: { throwOnRead?: boolean } = {}) {
  const statements: string[] = [];
  const db = {
    prepare: (sql: string) => {
      statements.push(sql);
      return {
        all: async () => {
          if (options.throwOnRead) {
            throw new Error("d1 exploded: secret");
          }
          return { results: rows };
        },
      };
    },
  };
  return { db, statements };
}

async function invoke(
  handler: (ctx: never) => Response | Promise<Response>,
  db: unknown,
): Promise<Response> {
  return handler({
    request: new Request("http://localhost/api"),
    params: {},
    publicData: createD1PublicData(db as D1Database),
  } as never);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/block-summaries", () => {
  it("maps block rows into the public summary contract", async () => {
    const { db, statements } = queryDb([
      blockRow(),
      blockRow({
        address_key: "tampines-9-corrupt",
        flat_types_json: "{not-json",
        nearest_mrt_json: "not-json",
        postal_code: null,
      }),
    ]);

    const response = await invoke(blockSummariesHandler, db);
    const body = (await response.json()) as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(statements[0]).toContain("FROM blocks");
    expect(body[0]).toEqual({
      addressKey: "bedok-123-example-road",
      town: "BEDOK",
      block: "123",
      streetName: "EXAMPLE ROAD",
      displayName: "123 EXAMPLE ROAD",
      coordinates: { lat: 1.32, lng: 103.93 },
      medianPrice: 500000,
      pricePerSqmMedian: 5500,
      transactionCount: 8,
      floorAreaRange: [67, 110],
      leaseCommenceRange: [1988, 1988],
      latestMonth: "2026-04",
      availableDateRange: ["2017-01", "2026-04"],
      flatTypes: ["4 ROOM"],
      flatModels: ["Model A"],
      nearestMrt: { stationName: "BEDOK", distanceMeters: 400, walkingTimeSeconds: 300 },
      nearbyMrts: [],
      postalCode: "460123",
    });
    expect(body[0]).not.toHaveProperty("medianPriceByFlatType");
    expect(body[1]).toMatchObject({
      addressKey: "tampines-9-corrupt",
      flatTypes: [],
      nearestMrt: null,
      postalCode: null,
    });
  });

  it("returns an empty list when D1 provides no result rows", async () => {
    const { db } = queryDb(null);
    const response = await invoke(blockSummariesHandler, db);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("hides database errors behind a generic 500", async () => {
    const { db } = queryDb(null, { throwOnRead: true });
    const response = await invoke(blockSummariesHandler, db);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });
});

describe("/api/trends/town-flat-type", () => {
  it("renames trend columns and preserves the database order", async () => {
    const { db, statements } = queryDb([
      {
        town: "ANG MO KIO",
        flat_type: "3 ROOM",
        month: "2026-02",
        median_price: 420000,
        median_price_per_sqm: 6100.5,
        transaction_count: 4,
      },
      {
        town: "BEDOK",
        flat_type: "4 ROOM",
        month: "2026-01",
        median_price: 0,
        median_price_per_sqm: 0,
        transaction_count: 0,
      },
    ]);

    const response = await invoke(townTrendsHandler, db);

    expect(response.status).toBe(200);
    expect(statements[0]).toContain("FROM town_flat_type_trends");
    await expect(response.json()).resolves.toEqual([
      {
        town: "ANG MO KIO",
        flatType: "3 ROOM",
        month: "2026-02",
        medianPrice: 420000,
        medianPricePerSqm: 6100.5,
        transactionCount: 4,
      },
      {
        town: "BEDOK",
        flatType: "4 ROOM",
        month: "2026-01",
        medianPrice: 0,
        medianPricePerSqm: 0,
        transactionCount: 0,
      },
    ]);
  });

  it("returns an empty list when the trend table has no rows", async () => {
    const { db } = queryDb(null);
    const response = await invoke(townTrendsHandler, db);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns 500 when the trend query fails", async () => {
    const { db } = queryDb(null, { throwOnRead: true });
    const response = await invoke(townTrendsHandler, db);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });
});
