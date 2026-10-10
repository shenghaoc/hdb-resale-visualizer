import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NEARBY_LABELLED_SQL } from "../../worker/nearby-spatial-query";
import { NEARBY_RESERVE_SQL } from "../../functions/_lib/nearby-budget";

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
const manifestVersionHex = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
/** What the labelled statement returns first: the publication that the places were read from. */
const publicationHeader = async (marker: string | null = null) => ({
  row_type: "publication",
  version: await manifestVersionHex(manifest),
  manifest_type: "object",
  marker,
});
const exitRow = {
  row_type: "place",
  kind: "mrt_exit",
  id: "mrt_geojson:mrt_exit:21266",
  name: "CHINATOWN MRT STATION (Exit F)",
  lat: 1.2842747760727764,
  lng: 103.84546253179646,
  address_key: null,
  station_name: "CHINATOWN MRT STATION",
  exit_code: "Exit F",
  distance_meters: 89.6,
};
const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

/** A stand-in for a Workers Rate Limiting binding that always answers `success`. */
const limiter = (success: boolean) => ({
  limit: vi.fn(async (_options: { key: string }) => ({ success })),
});

/**
 * The shipped `wrangler.jsonc` shape: Neon selected, Hyperdrive bound, spatial release gate off. With the gate open
 * the D1 binding is always a trap; quota reservations use a separate narrow Neon Hyperdrive binding.
 */
const deployedEnv = (overrides: Record<string, unknown> = {}) =>
  ({
    DB: {
      prepare: () => {
        spies.d1();
        throw new Error("Nearby route must not use D1");
      },
    },
    HDB_NEARBY_BUDGET: { connectionString: "test-budget" },
    PUBLIC_DATA_BACKEND: "neon",
    NEON_PUBLIC_CACHE_EPOCH: "neon-test-epoch",
    NEON_SPATIAL_ENABLED: "false",
    HDB_PUBLIC_NEON: { connectionString: "test" },
    ASSETS: { fetch: async () => new Response("<html></html>") },
    // Like the shipped wrangler.jsonc, the limiter bindings exist; individual tests replace them.
    NEARBY_IP_LIMITER: limiter(true),
    NEARBY_ORIGIN_LIMITER: limiter(true),
    ...overrides,
  }) as unknown as Env;
const call = (env: Env, path: string, headers?: Record<string, string>) =>
  worker.fetch(new Request(`https://test${path}`, { headers }), env, ctx);
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

beforeEach(async () => {
  vi.clearAllMocks();
  const header = await publicationHeader();
  spies.query.mockImplementation(async (sql: string) => {
    if (sql === NEARBY_RESERVE_SQL) return [{ granted: true }];
    if (sql === NEARBY_LABELLED_SQL) return [header, exitRow];
    if (sql.includes("FROM public.manifest")) return [{ json: manifest }];
    return [];
  });
  spies.snapshot.mockImplementation(async (respond: () => Promise<unknown>) => respond());
  spies.close.mockResolvedValue(undefined);
  vi.stubGlobal("caches", undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("spatial release gate in the Worker entry", () => {
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
      places: [
        {
          kind: "mrt_exit",
          name: "CHINATOWN MRT STATION (Exit F)",
          stationName: "CHINATOWN MRT STATION",
          exitCode: "Exit F",
          addressKey: null,
          distanceMeters: 89.6,
        },
      ],
    });
    const nearbyCalls = spies.query.mock.calls.filter(([sql]) => sql === NEARBY_LABELLED_SQL);
    expect(nearbyCalls).toHaveLength(1);
    expect(nearbyCalls[0][1]).toEqual([1.35, 103.75, 1500, ["mrt_exit"], 25]);
    // The labelled statement is the only one: no separate manifest reads around it.
    expect(spies.query).toHaveBeenCalledTimes(2); // one Neon quota reservation, one PostGIS query
    expect(spies.close).toHaveBeenCalledTimes(2);
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

  it("answers the capability probe from configuration alone: off while the gate is closed", async () => {
    const response = await call(deployedEnv(), "/api/nearby-capabilities");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ available: false });
    expect(spies.factory).not.toHaveBeenCalled();
    expect(spies.query).not.toHaveBeenCalled();
    expect(spies.d1).not.toHaveBeenCalled();
  });

  it.each([
    { label: "gate open on Neon with the binding", overrides: {}, available: true },
    {
      label: "gate open on the D1 backend",
      overrides: { PUBLIC_DATA_BACKEND: "d1" },
      available: false,
    },
    {
      label: "gate open without the Hyperdrive binding",
      overrides: { HDB_PUBLIC_NEON: undefined },
      available: false,
    },
    {
      label: "no budget Hyperdrive",
      overrides: { HDB_NEARBY_BUDGET: undefined },
      available: false,
    },
    { label: "gate closed", overrides: { NEON_SPATIAL_ENABLED: "false" }, available: false },
  ])("capability, $label: available is $available", async ({ overrides, available }) => {
    const env = deployedEnv({ NEON_SPATIAL_ENABLED: "true", ...overrides });
    const response = await call(env, "/api/nearby-capabilities");
    expect(await response.json()).toEqual({ available });
    // Flag, backend and binding only: no transport is opened and no table is read, so
    // "available" never means that the spatial migration has been applied.
    expect(spies.factory).not.toHaveBeenCalled();
    expect(spies.query).not.toHaveBeenCalled();
  });
});

describe("nearby rate limiting in the Worker entry", () => {
  const open = { NEON_SPATIAL_ENABLED: "true" };
  const nearbySqlCalls = () =>
    spies.query.mock.calls.filter(([sql]) => sql === NEARBY_LABELLED_SQL).length;

  it("never consults a limiter while the gate is closed", async () => {
    const ip = limiter(true);
    const origin = limiter(true);
    const response = await call(
      deployedEnv({ NEARBY_IP_LIMITER: ip, NEARBY_ORIGIN_LIMITER: origin }),
      nearbyPath,
    );
    expect(response.status).toBe(503);
    expect(ip.limit).not.toHaveBeenCalled();
    expect(origin.limit).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After before the cache, a transport or the database is touched", async () => {
    const entries = inMemoryCache();
    const response = await call(
      deployedEnv({ ...open, NEARBY_IP_LIMITER: limiter(false) }),
      nearbyPath,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Too Many Requests" });
    expect(spies.factory).not.toHaveBeenCalled();
    expect(spies.query).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
  });

  it("keys the client limit on the IPv4 address, or on the IPv6 /64 prefix", async () => {
    const ip = limiter(true);
    const env = deployedEnv({ ...open, NEARBY_IP_LIMITER: ip });
    await call(env, nearbyPath, { "CF-Connecting-IP": "203.0.113.9" });
    await call(env, nearbyPath, { "CF-Connecting-IP": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" });
    await call(env, nearbyPath, { "CF-Connecting-IP": "2001:db8:1:2::1" });
    expect(ip.limit.mock.calls.map(([options]) => options.key)).toEqual([
      "203.0.113.9",
      "v6:2001:0db8:0001:0002",
      "v6:2001:0db8:0001:0002",
    ]);
  });

  it("fails closed with 503 when a limiter binding is missing while the gate is open", async () => {
    const noClient = await call(deployedEnv({ ...open, NEARBY_IP_LIMITER: undefined }), nearbyPath);
    expect(noClient.status).toBe(503);
    expect(await noClient.json()).toEqual({ error: "Nearby search is not configured" });
    expect(spies.factory).not.toHaveBeenCalled();

    const noOrigin = await call(
      deployedEnv({ ...open, NEARBY_ORIGIN_LIMITER: undefined }),
      nearbyPath,
    );
    expect(noOrigin.status).toBe(503);
    expect(await noOrigin.json()).toEqual({ error: "Nearby search is not configured" });
    expect(nearbySqlCalls()).toBe(0);
  });

  it("spends the origin budget on cache misses only, never on hits", async () => {
    const entries = inMemoryCache();
    const ip = limiter(true);
    const origin = limiter(true);
    const env = deployedEnv({ ...open, NEARBY_IP_LIMITER: ip, NEARBY_ORIGIN_LIMITER: origin });
    expect((await call(env, nearbyPath)).headers.get("x-data-cache")).toBe("MISS");
    expect((await call(env, nearbyPath)).headers.get("x-data-cache")).toBe("HIT");
    expect((await call(env, nearbyPath)).headers.get("x-data-cache")).toBe("HIT");
    expect(ip.limit).toHaveBeenCalledTimes(3);
    expect(origin.limit).toHaveBeenCalledTimes(1);
    expect(origin.limit.mock.calls[0][0]).toEqual({ key: "nearby-origin" });
    expect(nearbySqlCalls()).toBe(1);
    expect([...entries.keys()].filter((key) => key.includes("/api/nearby-places"))).toHaveLength(1);
  });

  it("answers 503 when the origin budget is spent, runs no spatial SQL and caches nothing", async () => {
    const entries = inMemoryCache();
    const response = await call(
      deployedEnv({ ...open, NEARBY_ORIGIN_LIMITER: limiter(false) }),
      nearbyPath,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Nearby search is busy, try again shortly" });
    expect(nearbySqlCalls()).toBe(0);
    expect([...entries.keys()].filter((key) => key.includes("/api/nearby-places"))).toHaveLength(0);
  });

  const boom = () => ({ limit: vi.fn(async () => Promise.reject(new Error("limiter down"))) });

  it("fails closed when the origin limiter throws: 503, no spatial SQL, nothing cached, logged", async () => {
    const entries = inMemoryCache();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(
      deployedEnv({ ...open, NEARBY_ORIGIN_LIMITER: boom() }),
      nearbyPath,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Nearby search is temporarily unavailable" });
    expect(nearbySqlCalls()).toBe(0);
    expect([...entries.keys()].filter((key) => key.includes("/api/nearby-places"))).toHaveLength(0);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("keeps serving cached answers while the origin limiter is down, because hits never reach it", async () => {
    inMemoryCache();
    const origin = limiter(true);
    const env = deployedEnv({ ...open, NEARBY_ORIGIN_LIMITER: origin });
    expect((await call(env, nearbyPath)).headers.get("x-data-cache")).toBe("MISS");
    origin.limit.mockImplementation(async () => Promise.reject(new Error("limiter down")));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const hit = await call(env, nearbyPath);
    expect(hit.status).toBe(200);
    expect(hit.headers.get("x-data-cache")).toBe("HIT");
    expect(origin.limit).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("lets a request through when only the client limiter throws, because the origin guards still apply", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(deployedEnv({ ...open, NEARBY_IP_LIMITER: boom() }), nearbyPath);
    expect(response.status).toBe(200);
    expect(nearbySqlCalls()).toBe(1);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("Neon PostgreSQL admission and labelled PostGIS reads", () => {
  const open = { NEON_SPATIAL_ENABLED: "true" };
  const quotaCalls = () => spies.query.mock.calls.filter(([sql]) => sql === NEARBY_RESERVE_SQL);
  const spatialCalls = () => spies.query.mock.calls.filter(([sql]) => sql === NEARBY_LABELLED_SQL);
  const unique = (index: number) =>
    `/api/nearby-places?lat=1.${3000 + index}&lng=103.8200&radius=500&types=mrt_exit`;

  it("uses one budget reservation and one labelled statement per miss, none on a hit", async () => {
    const entries = inMemoryCache();
    const env = deployedEnv(open);
    const first = await call(env, nearbyPath);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-data-cache")).toBe("MISS");
    expect(quotaCalls()).toHaveLength(1);
    expect(quotaCalls()[0][1]).toEqual([10000]);
    expect(spatialCalls()).toHaveLength(1);
    expect(spies.d1).not.toHaveBeenCalled();
    const second = await call(env, nearbyPath);
    expect(second.status).toBe(200);
    expect(second.headers.get("x-data-cache")).toBe("HIT");
    expect(quotaCalls()).toHaveLength(1);
    expect(spatialCalls()).toHaveLength(1);
    expect([...entries.keys()].filter((key) => key.includes("/api/nearby-places"))).toHaveLength(1);
  });

  it("returns 503 on a rejected PostgreSQL reservation, and never runs the spatial query", async () => {
    const entries = inMemoryCache();
    spies.query.mockImplementation(async (sql: string) => {
      if (sql === NEARBY_RESERVE_SQL) return [{ granted: false }];
      if (sql === NEARBY_LABELLED_SQL) throw new Error("spatial query must not run");
      return [];
    });
    const response = await call(
      deployedEnv({ ...open, NEARBY_DAILY_STATEMENT_CEILING: "2" }),
      unique(0),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(spatialCalls()).toHaveLength(0);
    expect([...entries.keys()].filter((key) => key.includes("/api/nearby-places"))).toHaveLength(0);
  });

  it("fails closed when the budget Hyperdrive binding is missing", async () => {
    const env = deployedEnv({ ...open, HDB_NEARBY_BUDGET: undefined });
    const response = await call(env, nearbyPath);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Nearby search is not configured" });
    expect(spatialCalls()).toHaveLength(0);
    expect(spies.d1).not.toHaveBeenCalled();
  });

  it("fails closed on PostgreSQL transport failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    spies.query.mockImplementation(async (sql: string) => {
      if (sql === NEARBY_RESERVE_SQL) throw new Error("connection down");
      return [];
    });
    const response = await call(deployedEnv(open), nearbyPath);
    expect(response.status).toBe(503);
    expect(spatialCalls()).toHaveLength(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("rejects invalid requests before any origin or quota admission", async () => {
    const env = deployedEnv(open);
    const origin = env.NEARBY_ORIGIN_LIMITER;
    const response = await call(env, "/api/nearby-places?lat=1.35&lng=103.75&limit=26");
    expect(response.status).toBe(400);
    expect(origin?.limit).not.toHaveBeenCalled();
    expect(quotaCalls()).toHaveLength(0);
    expect(spatialCalls()).toHaveLength(0);
  });

  it("a refused origin limiter cannot invoke the quota transport", async () => {
    const env = deployedEnv({ ...open, NEARBY_ORIGIN_LIMITER: limiter(false) });
    const response = await call(env, unique(1));
    expect(response.status).toBe(503);
    expect(quotaCalls()).toHaveLength(0);
    expect(spatialCalls()).toHaveLength(0);
  });

  it("cache results are still labelled with the correct manifest generation", async () => {
    const entries = inMemoryCache();
    const first = await call(deployedEnv(open), nearbyPath);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-data-cache")).toBe("MISS");
    const version = await manifestVersionHex(manifest);
    expect(
      [...entries.keys()].some((key) => key.includes(`/v1/${version}/api/nearby-places`)),
    ).toBe(true);
  });
});
