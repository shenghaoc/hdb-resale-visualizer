import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NEARBY_SPATIAL_SQL } from "../../worker/nearby-spatial-query";

const spies = vi.hoisted(() => ({
  factory: vi.fn(),
  query: vi.fn(),
  snapshot: vi.fn(),
  close: vi.fn(),
  d1: vi.fn(),
}));
vi.mock("../../worker/neon-transport", () => ({
  createNeonPublicTransport: (...args: unknown[]) => {
    spies.factory(...args);
    return { query: spies.query, snapshot: spies.snapshot, close: spies.close };
  },
}));
vi.mock("../../worker/og", () => ({
  handleBlockOg: async () => new Response("og"),
  handleCompareOg: async () => new Response("og"),
}));
// Load the Cloudflare entry the way tests/unit/neon-public-routing.test.ts does, so its WASM asset and
// Workers-only globals stay out of the separate DOM TypeScript test project.
const workerEntry = "../../worker/index";
const worker = (await import(workerEntry)).default as {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
};

const manifest = JSON.stringify({ generatedAt: "2026-10-05", filterOptions: { towns: ["BEDOK"] } });
const exitRow = {
  kind: "mrt_exit",
  id: "mrt_geojson:mrt_exit:21266",
  name: "CHINATOWN MRT STATION (Exit F)",
  lat: 1.2842747760727764,
  lng: 103.84546253179646,
  address_key: null,
  distance_meters: 89.6,
};
const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

/** The shipped `wrangler.jsonc` shape: Neon selected, Hyperdrive bound, spatial release gate off. */
const deployedEnv = (overrides: Record<string, unknown> = {}) =>
  ({
    DB: {
      prepare: () => {
        spies.d1();
        throw new Error("D1 must not be read by these routes");
      },
    },
    PUBLIC_DATA_BACKEND: "neon",
    NEON_PUBLIC_CACHE_EPOCH: "neon-test-epoch",
    NEON_SPATIAL_ENABLED: "false",
    HDB_PUBLIC_NEON: { connectionString: "test" },
    ASSETS: { fetch: async () => new Response("<html></html>") },
    ...overrides,
  }) as unknown as Env;
const call = (env: Env, path: string) => worker.fetch(new Request(`https://test${path}`), env, ctx);
const nearbyPath = "/api/nearby-places?lat=1.35&lng=103.75&radius=1500&limit=25&types=mrt_exit";

const inMemoryCache = () => {
  const entries = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: {
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => {
        entries.set(request.url, response.clone());
      },
    },
  });
  return entries;
};

describe("nearby-places release gate in the Worker entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spies.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.manifest")) return [{ json: manifest }];
      if (sql === NEARBY_SPATIAL_SQL) return [exitRow];
      return [];
    });
    spies.snapshot.mockImplementation(async (respond: () => Promise<unknown>) => respond());
    spies.close.mockResolvedValue(undefined);
    vi.stubGlobal("caches", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([["false"], [undefined], ["TRUE"], ["1"], [""]])(
    "NEON_SPATIAL_ENABLED=%j answers a no-store 503 before any Neon transport exists",
    async (flag) => {
      const response = await call(deployedEnv({ NEON_SPATIAL_ENABLED: flag }), nearbyPath);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Spatial search has not been enabled" });
      expect(spies.factory).not.toHaveBeenCalled();
      expect(spies.query).not.toHaveBeenCalled();
      expect(spies.d1).not.toHaveBeenCalled();
    },
  );

  it("never reaches the shared cache while the gate is closed", async () => {
    const entries = inMemoryCache();
    await call(deployedEnv(), nearbyPath);
    expect(entries.size).toBe(0);
    expect(spies.query).not.toHaveBeenCalled();
  });

  it("with the gate open, runs the shipped SQL once with bound parameters", async () => {
    const response = await call(deployedEnv({ NEON_SPATIAL_ENABLED: "true" }), nearbyPath);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      center: { lat: 1.35, lng: 103.75 },
      radiusMeters: 1500,
      limit: 25,
      types: ["mrt_exit"],
      distanceBasis: "straight-line",
      places: [{ kind: "mrt_exit", addressKey: null, distanceMeters: 89.6 }],
    });
    const nearbyCalls = spies.query.mock.calls.filter(([sql]) => sql === NEARBY_SPATIAL_SQL);
    expect(nearbyCalls).toHaveLength(1);
    expect(nearbyCalls[0][1]).toEqual([1.35, 103.75, 1500, ["mrt_exit"], 25]);
    expect(spies.close).toHaveBeenCalledTimes(1);
  });

  it("with the gate open on the D1 rollback backend, says so instead of returning an empty list", async () => {
    const env = deployedEnv({ NEON_SPATIAL_ENABLED: "true", PUBLIC_DATA_BACKEND: "d1" });
    const response = await call(env, nearbyPath);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Spatial search is unavailable on this backend",
    });
    expect(spies.factory).not.toHaveBeenCalled();
  });

  it("collapses equivalent raw queries onto one canonical key shaped like every public route", async () => {
    const entries = inMemoryCache();
    const env = deployedEnv({ NEON_SPATIAL_ENABLED: "true" });
    const first = await call(
      env,
      "/api/nearby-places?types=mrt_exit,mrt_station&lat=1.350001&lng=103.750001&radius=1001",
    );
    expect(first.headers.get("x-data-cache")).toBe("MISS");
    spies.query.mockClear();
    const second = await call(
      env,
      "/api/nearby-places?lat=1.350049&lng=103.750049&radius=1400&limit=25&types=mrt_station,mrt_exit",
    );
    expect(second.headers.get("x-data-cache")).toBe("HIT");
    expect(spies.query).not.toHaveBeenCalled();

    const nearbyKeys = [...entries.keys()].filter((key) => key.includes("/api/nearby-places"));
    expect(nearbyKeys).toHaveLength(1);
    expect(nearbyKeys[0]).toMatch(
      /\/api\/nearby-places\?lat=1\.35&lng=103\.75&radius=1500&types=mrt_station%2Cmrt_exit$/,
    );

    // The backend/epoch/version prefix is the one every existing route uses.
    await call(env, "/api/manifest");
    const manifestKey = [...entries.keys()].find((key) => key.endsWith("/api/manifest"));
    expect(manifestKey).toMatch(
      /\/__public-backend\/neon-neon-test-epoch\/__public-data-cache\/v1\/[a-f0-9]{64}\/api\/manifest$/,
    );
    const prefix = (key: string | undefined) => key?.slice(0, key.indexOf("/api/"));
    expect(prefix(nearbyKeys[0])).toBe(prefix(manifestKey));
  });
});
