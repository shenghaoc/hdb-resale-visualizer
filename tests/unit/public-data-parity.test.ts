// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type {
  BlockRow,
  PublicData,
  PublicRouteHandler,
  TransactionScope,
} from "../../functions/_lib/public-data";
import type { SearchRequest } from "../../functions/_lib/search";
import { resetStationNamesCacheForTests } from "../../functions/_lib/suggest";
import { onRequestGet as manifestRoute } from "../../functions/api/manifest";
import { onRequestGet as blockSummariesRoute } from "../../functions/api/block-summaries";
import { onRequestGet as townBlocksRoute } from "../../functions/api/blocks/[town]";
import { onRequestGet as detailRoute } from "../../functions/api/details/[addressKey]";
import { onRequestGet as comparisonRoute } from "../../functions/api/comparisons/[addressKey]";
import { onRequestGet as mrtStationsRoute } from "../../functions/api/mrt-stations";
import { onRequestGet as mrtExitsRoute } from "../../functions/api/mrt-exits";
import { onRequestGet as trendsRoute } from "../../functions/api/trends/town-flat-type";
import { onRequestGet as searchRoute } from "../../functions/api/search";
import { onRequestGet as suggestRoute } from "../../functions/api/suggest";
import { onRequestPost as comparableRoute } from "../../functions/api/comparable-transactions";
import { createD1PublicData } from "../../worker/public-data-d1";
import { createNeonPublicData } from "../../worker/public-data-neon";

/**
 * Every public read on both backends, over the same rows.
 *
 * D1 is SQLite with the real migrations applied (D1 runs SQLite). Neon is real PostgreSQL (PGlite) with the
 * column types of the published Neon tables, and its results go through node-postgres's own type parsers, as
 * in the Worker. Every public route must answer the same on both, and every Worker-only read must return the
 * same rows. Stored JSON is compared parsed: JSONB keeps object keys in an order of its own.
 *
 * No two blocks share a median price: neither backend orders blocks beyond (median price, transaction count).
 * Suggest's tie-break among equal prices is covered by neon-suggest-parity.test.ts.
 */

const MIGRATIONS = path.resolve(__dirname, "../../migrations");

/** The public tables as published to Neon, with production's column types. */
const NEON_SCHEMA = `
CREATE TABLE public.blocks (
  address_key TEXT PRIMARY KEY, town TEXT NOT NULL, block TEXT NOT NULL, street_name TEXT NOT NULL,
  display_name TEXT, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  median_price DOUBLE PRECISION NOT NULL, price_per_sqm_median DOUBLE PRECISION NOT NULL,
  transaction_count INTEGER NOT NULL, floor_area_min DOUBLE PRECISION NOT NULL,
  floor_area_max DOUBLE PRECISION NOT NULL, lease_commence_year SMALLINT NOT NULL,
  latest_month TEXT NOT NULL, available_min_month TEXT NOT NULL, available_max_month TEXT NOT NULL,
  flat_types_json JSONB NOT NULL, flat_models_json JSONB NOT NULL,
  median_price_by_flat_type_json JSONB, median_price_per_sqm_by_flat_type_json JSONB,
  nearest_mrt_json JSONB, nearby_mrts_json JSONB, postal_code TEXT, flat_type_cohorts_json JSONB
);
CREATE INDEX blocks_town ON public.blocks (town);
CREATE INDEX blocks_sort ON public.blocks (median_price DESC, transaction_count DESC);
CREATE TABLE public.transactions (
  id BIGINT PRIMARY KEY, month TEXT NOT NULL, town TEXT NOT NULL, block TEXT NOT NULL,
  street_name TEXT NOT NULL, address_key TEXT NOT NULL, flat_type TEXT NOT NULL,
  storey_range TEXT NOT NULL, floor_area_sqm DOUBLE PRECISION NOT NULL, lease_commence_year SMALLINT,
  resale_price DOUBLE PRECISION NOT NULL, flat_model TEXT
);
CREATE INDEX tx_block_flat_month ON public.transactions (town, block, flat_type, month DESC);
CREATE INDEX tx_street_flat_month ON public.transactions (street_name, flat_type, month DESC);
CREATE INDEX tx_town_flat_month ON public.transactions (town, flat_type, month DESC);
CREATE TABLE public.block_details (address_key TEXT PRIMARY KEY, json JSONB NOT NULL);
CREATE TABLE public.comparisons (address_key TEXT PRIMARY KEY, json JSONB NOT NULL);
CREATE TABLE public.town_flat_type_trends (
  town TEXT NOT NULL, flat_type TEXT NOT NULL, month TEXT NOT NULL,
  median_price DOUBLE PRECISION NOT NULL, median_price_per_sqm DOUBLE PRECISION NOT NULL,
  transaction_count INTEGER NOT NULL, PRIMARY KEY (town, flat_type, month)
);
CREATE TABLE public.manifest (id SMALLINT PRIMARY KEY CHECK (id = 1), json JSONB NOT NULL);
CREATE TABLE public.mrt_geojson (kind TEXT PRIMARY KEY, json JSONB NOT NULL);
`;

/** The Worker reads Neon through node-postgres, which returns bigint ids as strings, among others. */
const NODE_POSTGRES_PARSERS = Object.fromEntries(
  [16, 20, 21, 23, 25, 114, 700, 701, 1043, 1700, 3802].map((oid) => [
    oid,
    pg.types.getTypeParser(oid, "text"),
  ]),
);

// ---------------------------------------------------------------------------
// One small, deterministic publication
// ---------------------------------------------------------------------------

type Row = Record<string, string | number | null>;
const TOWNS = [
  { town: "ANG MO KIO", streets: ["ANG MO KIO AVE 3", "ANG MO KIO ST 21"], station: "ANG MO KIO" },
  { town: "BEDOK", streets: ["BEDOK NTH RD", "NEW UPP CHANGI RD"], station: "BEDOK" },
  { town: "KALLANG/WHAMPOA", streets: ["WHAMPOA DR", "BENDEMEER RD"], station: "BENDEMEER" },
];
const FLAT_TYPES = ["3 ROOM", "4 ROOM", "5 ROOM"];
const MODELS: Record<string, string> = {
  "3 ROOM": "Improved",
  "4 ROOM": "Model A",
  "5 ROOM": "Premium Apartment",
};
const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

const blocks: Row[] = TOWNS.flatMap(({ town, streets, station }, t) =>
  streets.flatMap((street, s) =>
    [0, 1, 2].map((k): Row => {
      const i = t * 6 + s * 3 + k;
      const block = `${11 + i * 7}${i % 4 === 0 ? "A" : ""}`;
      const types = FLAT_TYPES.slice(0, 1 + (i % 3));
      const median = 320_000 + i * 12_345.75;
      const areaMin = 60 + (i % 3) * 10;
      const latest = MONTHS[i % MONTHS.length];
      const mrt = { stationName: `${station} MRT STATION`, distanceMeters: 150 + i * 61.5 };
      return {
        address_key: `${town}-${block}-${street}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        town,
        block,
        street_name: street,
        display_name: i % 3 === 0 ? null : `${block} ${street}`,
        lat: 1.3 + i / 1000,
        lng: 103.8 + i / 1000,
        median_price: median,
        price_per_sqm_median: 4_000 + i * 13.5,
        transaction_count: 3 + (i % 5),
        floor_area_min: areaMin,
        floor_area_max: areaMin + 30 + (i % 4) * 5,
        lease_commence_year: 1975 + i * 2,
        latest_month: latest,
        available_min_month: "2015-01",
        available_max_month: latest,
        flat_types_json: JSON.stringify(types),
        flat_models_json: JSON.stringify(types.map((type) => MODELS[type])),
        // Fractional per-type prices: SQLite's CAST(… AS INTEGER) truncates them.
        median_price_by_flat_type_json:
          i % 5 === 4
            ? null
            : JSON.stringify(
                Object.fromEntries(
                  types.map((type, j) => [type, Math.floor(median) + j * 40_000 + 0.75]),
                ),
              ),
        median_price_per_sqm_by_flat_type_json: JSON.stringify(
          Object.fromEntries(types.map((type, j) => [type, 4_000 + i * 13.5 + j * 100])),
        ),
        flat_type_cohorts_json: JSON.stringify(
          Object.fromEntries(
            types.map((type, j) => [
              type,
              {
                transactionCount: 2 + j,
                floorAreaRange: [areaMin + j * 15, areaMin + j * 15 + 20],
                flatModels: [MODELS[type]],
                latestMonth: MONTHS[(i + j) % MONTHS.length],
              },
            ]),
          ),
        ),
        nearest_mrt_json:
          i % 4 === 3 ? null : JSON.stringify({ ...mrt, walkingTimeSeconds: 120 + i * 40 }),
        nearby_mrts_json: i % 4 === 3 ? "[]" : JSON.stringify([mrt]),
        postal_code: i % 5 === 2 ? null : String(560_000 + i * 101),
      };
    }),
  ),
);
// The pipeline writes blocks in this order, which is the order D1 walks them in.
blocks.sort(
  (a, b) =>
    Number(b.median_price) - Number(a.median_price) ||
    Number(b.transaction_count) - Number(a.transaction_count) ||
    String(a.address_key).localeCompare(String(b.address_key)),
);
const typesOf = (row: Row) => JSON.parse(String(row.flat_types_json)) as string[];

const transactions: Row[] = [];
for (const [i, row] of blocks.entries())
  for (const type of typesOf(row)) {
    // The busy block's 4 ROOM sales push BEDOK 4 ROOM past the 150-row recency window, with many equal months.
    const count = row.block === "60" && type === "4 ROOM" ? 160 : 4 + (i % 3);
    for (let n = 0; n < count; n++)
      transactions.push({
        id: transactions.length + 1,
        month: MONTHS[(n * 5 + i) % MONTHS.length],
        town: row.town,
        block: row.block,
        street_name: row.street_name,
        address_key: row.address_key,
        flat_type: type,
        storey_range: ["01 TO 03", "07 TO 09", "13 TO 15"][n % 3],
        floor_area_sqm: 70 + (n % 4) * 10 + FLAT_TYPES.indexOf(type) * 15,
        lease_commence_year: n % 9 === 8 ? null : row.lease_commence_year,
        resale_price: 350_000 + n * 1_234.5 + FLAT_TYPES.indexOf(type) * 60_000,
        flat_model: n % 7 === 6 ? null : MODELS[type],
      });
  }

const trends: Row[] = TOWNS.flatMap(({ town }, t) =>
  FLAT_TYPES.flatMap((type, j) =>
    MONTHS.map((month, m) => ({
      town,
      flat_type: type,
      month,
      median_price: 300_000 + t * 50_000 + j * 30_000 + m * 1_000.5,
      median_price_per_sqm: 4_000 + t * 300 + j * 50 + m * 12.25,
      transaction_count: 1 + ((t + j + m) % 4),
    })),
  ),
).reverse();

const documents = (row: Row, i: number) => ({
  detail: JSON.stringify({
    transactions: [{ month: row.latest_month, resalePrice: row.median_price }],
    addressKey: row.address_key,
    monthlyTrend: [{ month: "2026-09", medianPrice: row.median_price }],
  }),
  comparison:
    i % 4 === 1
      ? null
      : JSON.stringify({
          percentiles: { price: i * 5 },
          addressKey: row.address_key,
          amenities: { schools: i, hawkers: i % 3 },
        }),
});

const MANIFEST = JSON.stringify({
  schemaVersion: "2.0.0",
  generatedAt: "2026-10-04T15:30:00.000Z",
  dataWindow: { minMonth: "2015-01", maxMonth: "2026-09" },
  sources: {
    resaleCollectionId: "189",
    resaleDatasetIds: ["d_a", "d_b"],
    propertyDatasetId: "d_p",
    mrtDatasetId: "d_m",
    moeSchoolDatasetId: "d_s",
    neaHawkerDatasetId: "d_h",
    sfaSupermarketDatasetId: "d_f",
    nparksParksDatasetId: "d_n",
    lastUpdatedAt: "2026-10-04T23:30:00+08:00",
  },
  filterOptions: {
    towns: TOWNS.map(({ town }) => town),
    flatTypes: FLAT_TYPES,
    flatModels: Object.values(MODELS),
  },
  counts: {
    blocks: blocks.length,
    transactions: transactions.length,
    towns: TOWNS.length,
    mrtStations: TOWNS.length,
    comparisons: 13,
  },
});
const geoJson = (suffix: string) =>
  JSON.stringify({
    type: "FeatureCollection",
    features: TOWNS.map(({ station }, n) => ({
      type: "Feature",
      properties: { stationName: `${station} MRT STATION${suffix}`, lineCodes: ["NS", "EW"] },
      geometry: { type: "Point", coordinates: [103.8 + n / 100, 1.3 + n / 100] },
    })),
  });

// ---------------------------------------------------------------------------
// The two backends
// ---------------------------------------------------------------------------

function insertSqlite(db: DatabaseSync, table: string, rows: Row[]) {
  for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...(Object.values(row) as SQLInputValue[]));
  }
}

async function insertPostgres(db: PGlite, table: string, rows: Row[]) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map((column, i) =>
      column.endsWith("json") ? `$${i + 1}::text::jsonb` : `$${i + 1}`,
    );
    await db.query(
      `INSERT INTO public.${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`,
      Object.values(row),
    );
  }
}

/** D1's statement API over SQLite. */
function d1Binding(db: DatabaseSync): D1Database {
  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values as SQLInputValue[]),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

let sqlite: DatabaseSync;
let postgres: PGlite;
let d1: PublicData;
let neon: PublicData;

beforeAll(async () => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  postgres = await PGlite.create({ parsers: NODE_POSTGRES_PARSERS });
  await postgres.exec(NEON_SCHEMA);

  const details = blocks.map((row, i) => ({ address_key: row.address_key, ...documents(row, i) }));
  const tables: [string, Row[], Row[]?][] = [
    ["blocks", blocks],
    ["transactions", transactions],
    ["town_flat_type_trends", trends],
    ["block_details", details.map(({ address_key, detail }) => ({ address_key, json: detail }))],
    [
      "comparisons",
      details
        .filter(({ comparison }) => comparison !== null)
        .map(({ address_key, comparison }) => ({ address_key, json: comparison })),
    ],
    // D1 also keeps when each document was written; nothing reads it.
    [
      "manifest",
      [{ id: 1, json: MANIFEST }],
      [{ id: 1, json: MANIFEST, updated_at: "2026-10-04T15:30:00Z" }],
    ],
    [
      "mrt_geojson",
      [
        { kind: "stations", json: geoJson("") },
        { kind: "exits", json: geoJson(" EXIT A") },
      ],
      [
        { kind: "stations", json: geoJson(""), updated_at: "2026-10-04T15:30:00Z" },
        { kind: "exits", json: geoJson(" EXIT A"), updated_at: "2026-10-04T15:30:00Z" },
      ],
    ],
  ];
  for (const [table, rows, d1Rows] of tables) {
    insertSqlite(sqlite, table, d1Rows ?? rows);
    await insertPostgres(postgres, table, rows);
  }
  d1 = createD1PublicData(d1Binding(sqlite));
  neon = createNeonPublicData(
    async (sql, params) => (await postgres.query<Record<string, unknown>>(sql, [...params])).rows,
  );
}, 120_000);

afterAll(async () => {
  sqlite?.close();
  await postgres?.close();
});

// ---------------------------------------------------------------------------
// Routes: the public API must not depend on the backend
// ---------------------------------------------------------------------------

type Answer = { status: number; headers: [string, string][]; body: string };

async function answer(
  handler: PublicRouteHandler,
  publicData: PublicData,
  request: () => Request,
  params: Record<string, string>,
): Promise<Answer> {
  resetStationNamesCacheForTests();
  const response = await handler({ request: request(), params, publicData });
  return {
    status: response.status,
    headers: [...response.headers].sort(([a], [b]) => a.localeCompare(b)),
    body: await response.text(),
  };
}

/** Both backends' answers, once their status, headers and JSON are known to be equal. */
async function sameOnBoth(
  handler: PublicRouteHandler,
  request: () => Request,
  params: Record<string, string> = {},
) {
  const fromD1 = await answer(handler, d1, request, params);
  const fromNeon = await answer(handler, neon, request, params);
  expect(fromNeon.status).toBe(fromD1.status);
  expect(fromNeon.headers).toEqual(fromD1.headers);
  expect(JSON.parse(fromNeon.body)).toEqual(JSON.parse(fromD1.body));
  return { fromD1, fromNeon, json: JSON.parse(fromD1.body) as unknown };
}
const get = (pathAndQuery: string) => () => new Request(`https://parity.test${pathAndQuery}`);

describe("every public route answers the same on D1 and Neon", () => {
  it("manifest, byte for byte", async () => {
    const { fromD1, fromNeon } = await sameOnBoth(manifestRoute, get("/api/manifest"));
    expect(fromD1.status).toBe(200);
    expect(fromNeon.body).toBe(fromD1.body);
  });

  it("block summaries and each town's blocks", async () => {
    const { json } = await sameOnBoth(blockSummariesRoute, get("/api/block-summaries"));
    expect(json).toHaveLength(blocks.length);
    for (const town of [
      "ang-mo-kio",
      "bedok",
      "kallang-whampoa",
      "kallang-whampoa.json",
      "nowhere",
    ]) {
      const result = await sameOnBoth(townBlocksRoute, get(`/api/blocks/${town}`), { town });
      expect(result.fromD1.status).toBe(200);
    }
  });

  it("detail and comparison documents, present and missing", async () => {
    let missingComparisons = 0;
    for (const addressKey of [...blocks.map((row) => String(row.address_key)), "no-such-block"]) {
      await sameOnBoth(detailRoute, get(`/api/details/${addressKey}`), { addressKey });
      const { fromD1 } = await sameOnBoth(comparisonRoute, get(`/api/comparisons/${addressKey}`), {
        addressKey,
      });
      if (fromD1.status === 404) missingComparisons++;
    }
    expect(missingComparisons).toBe(blocks.length - 13 + 1);
  });

  it("MRT GeoJSON and trends; trends byte for byte", async () => {
    await sameOnBoth(mrtStationsRoute, get("/api/mrt-stations"));
    await sameOnBoth(mrtExitsRoute, get("/api/mrt-exits"));
    const { fromD1, fromNeon, json } = await sameOnBoth(
      trendsRoute,
      get("/api/trends/town-flat-type"),
    );
    expect(json).toHaveLength(trends.length);
    expect(fromNeon.body).toBe(fromD1.body);
  });

  it("search, across every predicate, with and without the selected flat type's cohort", async () => {
    const searches = [
      "",
      "town=BEDOK",
      "town=KALLANG%2FWHAMPOA",
      "flatType=4%20room",
      "flatType=multi%20generation",
      "budgetMin=400000",
      "budgetMax=450000",
      "budgetMin=380000&budgetMax=420000",
      "flatType=4%20ROOM&budgetMin=400000",
      "flatType=4%20ROOM&budgetMax=420000",
      "flatModel=model%20a",
      "flatModel=IMPROVED",
      "flatType=4%20ROOM&flatModel=model%20a",
      "flatType=3%20ROOM&flatModel=Model%20A",
      "areaMin=95",
      "areaMax=75",
      "flatType=4%20ROOM&areaMin=90",
      "flatType=5%20ROOM&areaMax=110",
      "mrtMax=600",
      "mrtMax=0",
      "remainingLeaseMin=60",
      "remainingLeaseMin=99",
      "startMonth=2026-06",
      "endMonth=2026-05",
      "flatType=5%20ROOM&startMonth=2026-06",
      "flatType=4%20ROOM&startMonth=2026-05&endMonth=2026-08",
      "town=BEDOK&flatType=4%20ROOM&flatModel=Model%20A&areaMin=70&areaMax=130&budgetMin=300000&budgetMax=900000&mrtMax=1500&remainingLeaseMin=40&startMonth=2026-04&endMonth=2026-09",
      "budgetMin=-1",
    ];
    let nonEmpty = 0;
    for (const query of searches) {
      const { json } = await sameOnBoth(searchRoute, get(`/api/search?${query}`));
      if ((json as { blocks?: unknown[] }).blocks?.length) nonEmpty++;
    }
    expect(nonEmpty).toBeGreaterThan(20);
  });

  it("search truncates fractional per-type prices the way SQLite does", async () => {
    const row = blocks.find(
      (candidate) =>
        candidate.median_price_by_flat_type_json !== null && typesOf(candidate).includes("4 ROOM"),
    )!;
    const price = (
      JSON.parse(String(row.median_price_by_flat_type_json)) as Record<string, number>
    )["4 ROOM"];
    expect(price % 1).not.toBe(0);
    const hits = async (query: string) => {
      const { json } = await sameOnBoth(searchRoute, get(`/api/search?flatType=4%20ROOM&${query}`));
      return (json as { blocks: { addressKey: string }[] }).blocks.some(
        (block) => block.addressKey === row.address_key,
      );
    };
    expect(await hits(`budgetMax=${Math.trunc(price)}`)).toBe(true);
    expect(await hits(`budgetMin=${Math.trunc(price) + 1}`)).toBe(false);
  });

  it("suggest, byte for byte", async () => {
    const queries = [
      "an",
      "ang mo kio",
      "amk",
      "be",
      "bedok",
      "whampoa",
      "kallang",
      "rd",
      "ave 3",
      "nth",
      "bendemeer",
      "11",
      "18a",
      "56",
      "5601",
      "x%_",
    ];
    let nonEmpty = 0;
    for (const q of queries) {
      const { fromD1, fromNeon, json } = await sameOnBoth(
        suggestRoute,
        get(`/api/suggest?q=${encodeURIComponent(q)}`),
      );
      expect(fromNeon.body).toBe(fromD1.body);
      if ((json as { suggestions?: unknown[] }).suggestions?.length) nonEmpty++;
    }
    expect(nonEmpty).toBeGreaterThan(10);
  });

  it("comparable transactions for every widening pass, raw and time-adjusted, byte for byte", async () => {
    const base = {
      town: "BEDOK",
      streetName: "BEDOK NTH RD",
      storeyRange: "07 TO 09",
      floorAreaSqm: 92,
      leaseCommenceYear: 1990,
      referenceMonth: "2026-09",
    };
    const candidates = [
      { ...base, block: "60", flatType: "4 ROOM" }, // the block itself
      { ...base, block: "53", flatType: "4 ROOM" }, // its street, without rows of its own
      { ...base, block: "67A", flatType: "4 ROOM" }, // its street, with a few rows merged in
      { ...base, block: "88", streetName: "NEW UPP CHANGI RD", flatType: "5 ROOM" }, // the town
      { ...base, block: "999", streetName: "NO SUCH ST", flatType: "4 ROOM" }, // 150 of the town's newest
      { ...base, town: "NOWHERE", block: "1", streetName: "NO SUCH ST", flatType: "4 ROOM" }, // nothing
    ];
    let withComparables = 0;
    for (const candidate of candidates)
      for (const adjust of [false, true]) {
        const body = JSON.stringify(candidate);
        const { fromD1, fromNeon, json } = await sameOnBoth(
          comparableRoute,
          () =>
            new Request(
              `https://parity.test/api/comparable-transactions${adjust ? "?adjust=time" : ""}`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "content-length": String(new TextEncoder().encode(body).byteLength),
                },
                body,
              },
            ),
        );
        expect(fromD1.status).toBe(200);
        expect(fromNeon.body).toBe(fromD1.body);
        if ((json as { comparables: unknown[] }).comparables.length > 0) withComparables++;
      }
    expect(withComparables).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Operations only the Worker uses (OG cards, sitemap, SEO), and ones a route hides
// ---------------------------------------------------------------------------

/** Stored JSON text differs in formatting between SQLite text and PostgreSQL JSONB; its value does not. */
function parsed(row: BlockRow | null) {
  if (!row) return row;
  const result: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(result))
    if (key.endsWith("_json") && typeof value === "string") result[key] = JSON.parse(value);
  return result;
}
const byKey = <T extends Record<string, unknown>>(rows: T[]) =>
  [...rows]
    .map((row) => ({ ...row }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe("every Worker-only read returns the same rows on D1 and Neon", () => {
  it("block by key, the sitemap index and the town comparison prices", async () => {
    for (const key of [...blocks.map((row) => String(row.address_key)), "no-such-block"])
      expect(parsed(await neon.block(key))).toEqual(parsed(await d1.block(key)));
    expect(byKey(await neon.blockIndex())).toEqual(byKey(await d1.blockIndex()));
    expect(await d1.blockIndex()).toHaveLength(blocks.length);
    const prices = await d1.townBlockPrices("BEDOK", "KALLANG/WHAMPOA");
    expect(prices).toHaveLength(12);
    expect(byKey(await neon.townBlockPrices("BEDOK", "KALLANG/WHAMPOA"))).toEqual(byKey(prices));
  });

  it("transaction scopes, in order, and trend histories", async () => {
    const scopes: TransactionScope[] = [
      { kind: "block", town: "BEDOK", block: "60", flatType: "4 ROOM" },
      { kind: "street", streetName: "BEDOK NTH RD", flatType: "4 ROOM" },
      { kind: "town", town: "BEDOK", flatType: "4 ROOM" },
      { kind: "town", town: "NOWHERE", flatType: "4 ROOM" },
    ];
    for (const scope of scopes) {
      expect(await neon.countTransactions(scope)).toBe(await d1.countTransactions(scope));
      const ids = async (data: PublicData) =>
        (await data.recentTransactions(scope)).map((row) => String(row.id));
      expect(await ids(neon)).toEqual(await ids(d1));
    }
    expect(await d1.countTransactions(scopes[2]!)).toBeGreaterThan(150);
    expect(await d1.recentTransactions(scopes[2]!)).toHaveLength(150);
    const pairs = [
      { town: "BEDOK", flatType: "4 ROOM" },
      { town: "ANG MO KIO", flatType: "3 ROOM" },
      { town: "NOWHERE", flatType: "4 ROOM" },
    ];
    expect(byKey(await neon.trendHistory(pairs))).toEqual(byKey(await d1.trendHistory(pairs)));
    expect(await neon.trendHistory([])).toEqual([]);
  });

  it("search without the cohort column's data, as while a backfill is pending", async () => {
    const request = (changes: Partial<SearchRequest>): SearchRequest => ({
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      mrtMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      ...changes,
    });
    for (const changes of [
      { flatType: "4 ROOM", areaMin: 90 },
      { flatType: "4 ROOM", budgetMax: 450000 },
      { flatModel: "Model A", areaMin: 90, startMonth: "2026-06" },
    ]) {
      const fromD1 = await d1.searchBlocks(request(changes), false);
      const fromNeon = await neon.searchBlocks(request(changes), false);
      expect(fromNeon.usedFlatTypeCohorts).toBe(fromD1.usedFlatTypeCohorts);
      expect(fromNeon.rows.map(parsed)).toEqual(fromD1.rows.map(parsed));
    }
  });

  it("cohort completeness, complete and then with one block not backfilled", async () => {
    expect(await d1.flatTypeCohortsComplete()).toBe(true);
    expect(await neon.flatTypeCohortsComplete()).toBe(true);
    const key = String(blocks[0]!.address_key);
    sqlite
      .prepare("UPDATE blocks SET flat_type_cohorts_json = NULL WHERE address_key = ?")
      .run(key);
    await postgres.query(
      "UPDATE public.blocks SET flat_type_cohorts_json = NULL WHERE address_key = $1",
      [key],
    );
    try {
      expect(await d1.flatTypeCohortsComplete()).toBe(false);
      expect(await neon.flatTypeCohortsComplete()).toBe(false);
    } finally {
      sqlite
        .prepare("UPDATE blocks SET flat_type_cohorts_json = ? WHERE address_key = ?")
        .run(String(blocks[0]!.flat_type_cohorts_json), key);
      await postgres.query(
        "UPDATE public.blocks SET flat_type_cohorts_json = $1::text::jsonb WHERE address_key = $2",
        [blocks[0]!.flat_type_cohorts_json, key],
      );
    }
  });
});
