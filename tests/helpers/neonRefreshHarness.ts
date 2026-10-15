/**
 * Drives the real `runSyncNeon` end to end against a real PostgreSQL session: PGlite in CI, or a local PostgreSQL
 * server (`HDB_LOCAL_POSTGRES_URL`) for behaviour PGlite cannot show, such as a server enforcing
 * `idle_in_transaction_session_timeout` and genuinely concurrent sessions. Upstream datasets and OneMap are
 * deterministic fakes; nothing here contacts data.gov.sg, OneMap, Neon or Cloudflare.
 */
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { fetchAmenityData } from "../../scripts/sync-data";
import { normalizeResaleRows } from "../../scripts/lib/sync/normalization";
import {
  MOE_SCHOOL_DATASET_ID,
  MRT_DATASET_ID,
  NEA_HAWKER_DATASET_ID,
  NPARKS_PARKS_DATASET_ID,
  PROPERTY_DATASET_ID,
  SFA_SUPERMARKET_DATASET_ID,
} from "../../scripts/lib/sync/constants";
import type {
  NeonRefreshClient,
  SyncNeonDependencies,
  fetchNeonSourceInventory,
} from "../../scripts/sync-neon";
import type { GeocodeCacheFile } from "../../scripts/lib/pipeline";

/** The nine publisher tables with the column types and indexes of the Neon benchmark branch (read 2026-10-15). */
export const NEON_REFRESH_SCHEMA = `
CREATE TABLE public.blocks (
  address_key text PRIMARY KEY, town text NOT NULL, block text NOT NULL, street_name text NOT NULL,
  display_name text, lat float8 NOT NULL, lng float8 NOT NULL, median_price float8 NOT NULL,
  price_per_sqm_median float8 NOT NULL, transaction_count int4 NOT NULL, floor_area_min float8 NOT NULL,
  floor_area_max float8 NOT NULL, lease_commence_year int2 NOT NULL, latest_month text NOT NULL,
  available_min_month text NOT NULL, available_max_month text NOT NULL, flat_types_json jsonb NOT NULL,
  flat_models_json jsonb NOT NULL, median_price_by_flat_type_json jsonb,
  median_price_per_sqm_by_flat_type_json jsonb, nearest_mrt_json jsonb, nearby_mrts_json jsonb,
  postal_code text, flat_type_cohorts_json jsonb
);
CREATE INDEX blocks_town ON public.blocks (town);
CREATE INDEX blocks_sort ON public.blocks (median_price DESC, transaction_count DESC);
CREATE TABLE public.block_details (address_key text PRIMARY KEY, json jsonb NOT NULL);
CREATE TABLE public.comparisons (address_key text PRIMARY KEY, json jsonb NOT NULL);
CREATE TABLE public.geocode_cache (
  cache_key text PRIMARY KEY, lat float8 NOT NULL, lng float8 NOT NULL, postal_code text, display_name text,
  search_value text NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE public.manifest (id int2 PRIMARY KEY, json jsonb NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE public.mrt_geojson (kind text PRIMARY KEY, json jsonb NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE public.town_flat_type_trends (
  town text NOT NULL, flat_type text NOT NULL, month text NOT NULL, median_price float8 NOT NULL,
  median_price_per_sqm float8 NOT NULL, transaction_count int4 NOT NULL, PRIMARY KEY (town, flat_type, month)
);
CREATE TABLE public.transactions (
  id int8 PRIMARY KEY, month text NOT NULL, town text NOT NULL, block text NOT NULL, street_name text NOT NULL,
  address_key text NOT NULL, flat_type text NOT NULL, storey_range text NOT NULL, floor_area_sqm float8 NOT NULL,
  lease_commence_year int2, resale_price float8 NOT NULL, flat_model text
);
CREATE INDEX tx_block_flat_month ON public.transactions (town, block, flat_type, month DESC);
CREATE INDEX tx_street_flat_month ON public.transactions (street_name, flat_type, month DESC);
CREATE INDEX tx_town_flat_month ON public.transactions (town, flat_type, month DESC);
CREATE TABLE public.walking_time_cache (
  cache_key text PRIMARY KEY, walking_time_seconds int4 NOT NULL, walking_distance_meters int4,
  updated_at timestamptz NOT NULL
);
`;

/** node-postgres parses these OIDs to text-derived values; PGlite is told to do the same. */
export const NODE_POSTGRES_PARSERS = Object.fromEntries(
  [16, 20, 21, 23, 25, 114, 700, 701, 1043, 1700, 3802].map((oid) => [
    oid,
    pg.types.getTypeParser(oid, "text"),
  ]),
);

/** Passes `validateNeonRefreshUrl`; tests never connect to it (`createClient` returns the test session). */
export const REFRESH_URL =
  "postgresql://refresh:fixture-password@ep-steep-moon-b35xjj4d.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
export const RESALE_DATASET_ID = `d_${"a".repeat(32)}`;
export const FIXTURE_HYPERDRIVE_ID = "70f9a7f0a2f64851af0cccba58dcfb0c";
const START = Date.parse("2026-10-15T00:00:00Z");

/** The run's clock for budget checks and simulated slow work; real PostgreSQL ignores it. */
export class FakeClock {
  now = START;
  advance(ms: number) {
    this.now += ms;
  }
}

const BLOCKS = [
  { town: "BEDOK", block: "101", street: "BEDOK NTH AVE 4", lat: 1.3326, lng: 103.9381 },
  { town: "BEDOK", block: "102", street: "BEDOK NTH AVE 4", lat: 1.3331, lng: 103.9389 },
  { town: "BEDOK", block: "203", street: "NEW UPP CHANGI RD", lat: 1.3241, lng: 103.9291 },
  { town: "YISHUN", block: "301", street: "YISHUN RING RD", lat: 1.4291, lng: 103.8356 },
  { town: "YISHUN", block: "302", street: "YISHUN RING RD", lat: 1.4297, lng: 103.8362 },
];

/** Deterministic official-looking resale rows: `count` facts spread across the blocks. */
export function resaleRows(count = 20, monthOffset = 0): Record<string, string>[] {
  return Array.from({ length: count }, (_, index) => {
    const block = BLOCKS[index % BLOCKS.length];
    const month = `2026-0${1 + ((index + monthOffset) % 8)}`;
    const flatType = index % 2 ? "4 ROOM" : "5 ROOM";
    return {
      month,
      town: block.town,
      flat_type: flatType,
      block: block.block,
      street_name: block.street,
      storey_range: index % 3 ? "04 TO 06" : "07 TO 09",
      floor_area_sqm: flatType === "4 ROOM" ? "92" : "110",
      flat_model: flatType === "4 ROOM" ? "Model A" : "Improved",
      lease_commence_date: "1990",
      resale_price: String(450000 + index * 1000),
      remaining_lease: "63 years",
    };
  });
}

export function addressKeys(rows: Record<string, string>[]): string[] {
  return [...new Set(normalizeResaleRows(rows).map((row) => row.addressKey))];
}

/** What the publisher sends to OneMap Search for a block address (`<block> <street> SINGAPORE`). */
export function searchValueFor(addressKey: string): string {
  const block = BLOCKS.find((entry) => addressKey.includes(entry.block));
  if (!block) throw new Error(`No fixture block for ${addressKey}`);
  return `${block.block} ${block.street} SINGAPORE`;
}

export function geocodeFor(addressKey: string) {
  const block = BLOCKS.find((entry) => addressKey.includes(entry.block)) ?? BLOCKS[0];
  return { lat: block.lat, lng: block.lng, postalCode: null, displayName: null };
}

export const MRT_UPSTREAM = {
  type: "FeatureCollection" as const,
  features: [
    ["BEDOK MRT STATION", "A", 103.9299, 1.3241],
    ["BEDOK NORTH MRT STATION", "B", 103.9184, 1.3348],
    ["TANAH MERAH MRT STATION", "A", 103.9465, 1.3272],
    ["YISHUN MRT STATION", "C", 103.8352, 1.4295],
    ["KHATIB MRT STATION", "A", 103.8329, 1.4174],
    ["CANBERRA MRT STATION", "B", 103.8297, 1.443],
  ].map(([station, exit, lng, lat]) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [lng as number, lat as number] },
    properties: { STATION_NA: station as string, EXIT_CODE: exit as string },
  })),
};

/** Property information for the fixture blocks, in the shape of the official CSV. */
export const PROPERTY_UPSTREAM: Record<string, string>[] = BLOCKS.map((block, index) => ({
  blk_no: block.block,
  street: block.street,
  max_floor_lvl: String(12 + index),
  year_completed: "1990",
  total_dwelling_units: String(80 + index),
}));

const EMPTY_COLLECTION = { type: "FeatureCollection" as const, features: [] as unknown[] };

export type Inventory = Awaited<ReturnType<typeof fetchNeonSourceInventory>>;

export function inventory(lastUpdatedAt = "2026-10-14T00:00:00+08:00"): Inventory {
  return {
    metadata: { collectionId: "189", lastUpdatedAt, childDatasets: [RESALE_DATASET_ID] },
    hints: { [RESALE_DATASET_ID]: lastUpdatedAt, [MRT_DATASET_ID]: "2026-01-01T00:00:00+08:00" },
  };
}

/** A settled Console reading captured `observedAt`, valid for the fixed clock. */
export function settledReceipt(clock: FakeClock) {
  return {
    projectId: "wispy-mouse-67963002",
    source: "neon-console",
    networkScope: "public-only",
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-11-01T00:00:00Z",
    observedAt: new Date(clock.now - 60_000).toISOString(),
    settledThrough: new Date(clock.now - 30 * 60_000).toISOString(),
    networkTransferBytes: 1_048_962_365,
    transferResolutionBytes: 10_000_000,
    computeCUHours: 20,
    computeResolutionCUHours: 0.01,
  };
}

export type SqlEvent = { sql: string; inTransaction: boolean; at: number };

export type SessionHooks = {
  /** Runs before a statement is sent; may write through the database's own handle or throw to inject a fault. */
  beforeQuery?: (sql: string, params: unknown[] | undefined) => Promise<void> | void;
};

/**
 * A node-postgres-shaped client over one PGlite session. PGlite does not run the server's timers, so this enforces
 * `idle_in_transaction_session_timeout` against the run's clock the way PostgreSQL does: a statement arriving after
 * the transaction sat idle past the timeout terminates the session, and the open transaction is rolled back.
 */
export function pgliteSession(
  db: PGlite,
  clock: FakeClock,
  events: SqlEvent[],
  hooks: SessionHooks = {},
): NeonRefreshClient & { idleTimedOut: () => boolean } {
  let inTransaction = false;
  let lastActivity = clock.now;
  let idleTimeoutMs = 0;
  let ended = false;
  let idleTimedOut = false;
  return {
    /** True only if the session was terminated for idling in a transaction (not for a normal `end`). */
    idleTimedOut: () => idleTimedOut,
    connect: async () => undefined,
    end: async () => {
      if (inTransaction) await db.query("ROLLBACK");
      inTransaction = false;
      ended = true;
    },
    async query(sql, params) {
      if (ended || idleTimedOut) throw new Error("Connection terminated");
      if (inTransaction && idleTimeoutMs > 0 && clock.now - lastActivity > idleTimeoutMs) {
        idleTimedOut = true;
        inTransaction = false;
        await db.query("ROLLBACK");
        throw new Error("terminating connection due to idle-in-transaction timeout");
      }
      await hooks.beforeQuery?.(sql, params);
      events.push({ sql, inTransaction, at: clock.now });
      const timeout = /^SET idle_in_transaction_session_timeout=(\d+)$/.exec(sql);
      if (timeout) idleTimeoutMs = Number(timeout[1]);
      try {
        const result = await db.query<Record<string, unknown>>(sql, params as unknown[]);
        if (/^\s*BEGIN\b/i.test(sql)) inTransaction = true;
        if (/^\s*(COMMIT|ROLLBACK)\b/i.test(sql)) inTransaction = false;
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
      } finally {
        lastActivity = clock.now;
      }
    },
  };
}

/** The same recording and hooks around a real node-postgres client (a local PostgreSQL server). */
export function pgSession(
  client: pg.Client,
  events: SqlEvent[],
  clock: FakeClock,
  hooks: SessionHooks = {},
): NeonRefreshClient {
  // A server-side termination arrives as an 'error' event as well as a rejected query; the query is what counts.
  client.on("error", () => {});
  return {
    connect: () => client.connect(),
    end: () => client.end(),
    async query(sql, params) {
      await hooks.beforeQuery?.(sql, params);
      events.push({ sql, inTransaction: false, at: clock.now });
      const result = await client.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
    },
  };
}

export async function createRefreshDatabase(): Promise<PGlite> {
  const db = await PGlite.create({ parsers: NODE_POSTGRES_PARSERS });
  await db.exec(NEON_REFRESH_SCHEMA);
  return db;
}

type Executor = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

/** The stored baseline: a manifest (never bootstrapped by the job) and geocodes for `geocoded` addresses. */
export async function seedBaseline(db: Executor, geocoded: string[]) {
  await db.query(
    "INSERT INTO manifest (id, json, updated_at) VALUES (1, $1::jsonb, '2026-10-04T15:30:00Z')",
    [JSON.stringify({ schemaVersion: "fixture-baseline" })],
  );
  for (const key of geocoded) {
    const geocode = geocodeFor(key);
    await db.query(
      "INSERT INTO geocode_cache (cache_key, lat, lng, postal_code, display_name, search_value, updated_at) VALUES ($1,$2,$3,NULL,NULL,$4,'2026-10-04T00:00:00Z')",
      [key, geocode.lat, geocode.lng, key],
    );
  }
}

/**
 * OneMap as seen over HTTP. The run uses the real search, token and routing helpers, so every physical attempt
 * (retries included) passes the real pacing and budget before reaching this fake `fetch`.
 */
export type OneMapFake = {
  token?: string;
  email?: string;
  /** Simulated duration of each OneMap HTTP attempt, applied to the run's clock. */
  requestMs?: number;
  /** Also really waits this long per attempt (used against a real server). */
  realDelayMs?: number;
  /** Search values OneMap answers with no match (a successful lookup without a result). */
  notFound?: Set<string>;
  /** Search values OneMap rejects with HTTP 400 (not retried: a failed lookup). */
  failing?: Set<string>;
  /** Search values whose first attempt gets HTTP 503 and whose retry succeeds. */
  transient?: Set<string>;
};

/** Physical HTTP attempts the fake OneMap received, by kind. */
export type HarnessRecord = {
  tokenRequests: number;
  searches: string[];
  routes: number;
  upstreamCalls: string[];
};

const oneMapJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeOneMapFetch(
  oneMap: OneMapFake,
  record: HarnessRecord,
  attempt: () => Promise<void>,
): typeof fetch {
  const seen = new Map<string, number>();
  return (async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.hostname !== "www.onemap.gov.sg")
      throw new Error(`Unexpected network request to ${url.origin}`);
    await attempt();
    if (url.pathname === "/api/auth/post/getToken") {
      record.tokenRequests += 1;
      return oneMapJson({ access_token: "fixture-resolved-token" });
    }
    if (url.pathname.includes("/route")) {
      record.routes += 1;
      return oneMapJson({ route_summary: { total_time: 420, total_distance: 500 } });
    }
    const searchValue = url.searchParams.get("searchVal") ?? "";
    record.searches.push(searchValue);
    const tries = (seen.get(searchValue) ?? 0) + 1;
    seen.set(searchValue, tries);
    if (oneMap.failing?.has(searchValue)) return oneMapJson({ message: "rejected" }, 400);
    if (oneMap.transient?.has(searchValue) && tries === 1)
      return oneMapJson({ message: "busy" }, 503);
    if (oneMap.notFound?.has(searchValue)) return oneMapJson({ found: 0, results: [] });
    const geocode = geocodeFor(searchValue.replace(/ SINGAPORE$/, ""));
    return oneMapJson({
      found: 1,
      results: [
        {
          LATITUDE: String(geocode.lat),
          LONGITUDE: String(geocode.lng),
          ADDRESS: searchValue,
          POSTAL: "460101",
        },
      ],
    });
  }) as typeof fetch;
}

export function refreshDependencies(options: {
  client: NeonRefreshClient;
  clock: FakeClock;
  rows: Record<string, string>[];
  inventories?: Inventory[];
  oneMap?: OneMapFake;
  /** Simulated duration of each upstream dataset download, applied to the run's clock. */
  upstreamMs?: number;
  realUpstreamDelayMs?: number;
  schoolRows?: Record<string, string>[];
  supermarketRows?: Record<string, string>[];
  /** Defaults to `PROPERTY_UPSTREAM`; override to simulate a context dataset that changed shape. */
  propertyRows?: Record<string, string>[];
  mrtGeoJson?: unknown;
  hawkerGeoJson?: unknown;
  parksGeoJson?: unknown;
  idleInTransactionTimeoutMs?: number;
  onUpstream?: (datasetId: string) => Promise<void> | void;
}): { deps: Partial<SyncNeonDependencies>; record: HarnessRecord; fetch: typeof fetch } {
  const record: HarnessRecord = { tokenRequests: 0, searches: [], routes: 0, upstreamCalls: [] };
  const inventories = options.inventories ?? [inventory()];
  let inventoryCalls = 0;
  const sleep = (ms: number) =>
    ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  const upstream = async (datasetId: string) => {
    record.upstreamCalls.push(datasetId);
    options.clock.advance(options.upstreamMs ?? 0);
    await sleep(options.realUpstreamDelayMs ?? 0);
    await options.onUpstream?.(datasetId);
  };
  const csv = async (datasetId: string) => {
    await upstream(datasetId);
    if (datasetId === RESALE_DATASET_ID) return options.rows;
    if (datasetId === PROPERTY_DATASET_ID)
      return structuredClone(options.propertyRows ?? PROPERTY_UPSTREAM);
    if (datasetId === MOE_SCHOOL_DATASET_ID) return options.schoolRows ?? [];
    if (datasetId === SFA_SUPERMARKET_DATASET_ID) return options.supermarketRows ?? [];
    throw new Error(`Unexpected dataset ${datasetId}`);
  };
  const geoJson = async (datasetId: string) => {
    await upstream(datasetId);
    if (datasetId === MRT_DATASET_ID) return structuredClone(options.mrtGeoJson ?? MRT_UPSTREAM);
    if (datasetId === NEA_HAWKER_DATASET_ID)
      return structuredClone(options.hawkerGeoJson ?? EMPTY_COLLECTION);
    if (datasetId === NPARKS_PARKS_DATASET_ID)
      return structuredClone(options.parksGeoJson ?? EMPTY_COLLECTION);
    throw new Error(`Unexpected dataset ${datasetId}`);
  };
  const oneMap = options.oneMap ?? {};
  const oneMapRequest = async () => {
    options.clock.advance(oneMap.requestMs ?? 0);
    await sleep(oneMap.realDelayMs ?? 0);
  };
  const env: NodeJS.ProcessEnv = { NEON_REFRESH_DATABASE_URL: REFRESH_URL };
  if (oneMap.token) env.ONEMAP_TOKEN = oneMap.token;
  if (oneMap.email) {
    env.ONEMAP_EMAIL = oneMap.email;
    env.ONEMAP_PASSWORD = "fixture-onemap-password";
  }
  const deps: Partial<SyncNeonDependencies> = {
    env,
    now: () => options.clock.now,
    fetchSourceInventory: async () => {
      await upstream("inventory");
      return structuredClone(inventories[Math.min(inventoryCalls++, inventories.length - 1)]);
    },
    fetchCsvRows: csv as SyncNeonDependencies["fetchCsvRows"],
    fetchGeoJson: geoJson as SyncNeonDependencies["fetchGeoJson"],
    fetchAmenityData: (cache: GeocodeCacheFile, amenityOptions) =>
      fetchAmenityData(cache, amenityOptions, {
        fetchCsvRowsFn: csv as never,
        fetchGeoJsonFn: geoJson as never,
      }),
    // The real OneMap helpers; the caller installs `fetch` (below) as the global fetch.
    oneMap: {},
    createClient: () => options.client,
    servingHyperdriveId: () => FIXTURE_HYPERDRIVE_ID,
    idleInTransactionTimeoutMs: options.idleInTransactionTimeoutMs ?? 120_000,
  };
  return { deps, record, fetch: fakeOneMapFetch(oneMap, record, oneMapRequest) };
}

export async function tableCounts(db: Executor) {
  const counts: Record<string, number> = {};
  for (const table of [
    "transactions",
    "blocks",
    "block_details",
    "comparisons",
    "town_flat_type_trends",
    "mrt_geojson",
    "geocode_cache",
    "walking_time_cache",
  ]) {
    const result = (await db.query(`SELECT count(*)::int AS n FROM ${table}`)) as {
      rows: { n: number }[];
    };
    counts[table] = Number(result.rows[0].n);
  }
  return counts;
}

export async function manifestState(db: Executor) {
  const result = (await db.query(
    "SELECT json::text AS json, updated_at::text AS updated_at FROM manifest WHERE id = 1",
  )) as { rows: { json: string; updated_at: string }[] };
  return result.rows[0];
}

export const MUTATING_SQL = /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|COPY)\b/i;
