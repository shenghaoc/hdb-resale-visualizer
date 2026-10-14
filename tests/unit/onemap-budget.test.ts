import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  MAX_ONEMAP_REQUESTS_PER_RUN,
  OneMapBudgetExhaustedError,
  OneMapRequestBudget,
  OneMapRun,
  parseOneMapBudget,
} from "../../scripts/lib/sync/onemap-budget";
import { geocodeAddress, searchOneMapAddress } from "../../scripts/lib/sync/geocode";
import { fetchWalkingRoute, routeMissingPairs } from "../../scripts/lib/sync/routing";
import {
  installOneMapRequestBudget,
  resetUpstreamThrottleForTests,
} from "../../scripts/lib/sync/rate-limits";
import { computeWalkingTimes, geocodeMissingAddresses } from "../../scripts/sync-data";
import type { GeocodeCacheFile, MrtExit } from "../../scripts/lib/pipeline";
import type { RoutingCacheFile } from "../../scripts/lib/sync/routing";

/**
 * The OneMap budget through the real request helpers: `fetch` is the only fake. Every OneMap request passes
 * `waitForUpstreamSlot`, so these tests also show that the ceiling installed there holds whichever helper calls.
 */

const SEARCH_ENDPOINT = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
const TOKEN_ENDPOINT = new URL("https://www.onemap.gov.sg/api/auth/post/getToken");
const ROUTING_ENDPOINT = new URL("https://www.onemap.gov.sg/api/public/routingsvc/route");

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** A OneMap stand-in: token, search and routing answers by path, counting each request it receives. */
function oneMapFetch() {
  const requests = { auth: 0, search: 0, routing: 0 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.pathname.startsWith("/api/auth/")) {
      requests.auth += 1;
      return json({ access_token: "issued-token" });
    }
    if (url.pathname.includes("/route")) {
      requests.routing += 1;
      return json({ route_summary: { total_time: 420, total_distance: 500 } });
    }
    requests.search += 1;
    return json({
      found: 1,
      results: [{ LATITUDE: "1.33", LONGITUDE: "103.93", ADDRESS: "X", POSTAL: "460101" }],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

const emptyGeocodeCache = (): GeocodeCacheFile => ({ version: 1, updatedAt: "", entries: {} });
const emptyRoutingCache = (): RoutingCacheFile => ({ version: 1, updatedAt: "", entries: {} });

beforeEach(() => {
  vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1");
  resetUpstreamThrottleForTests();
});

afterEach(() => {
  resetUpstreamThrottleForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("budget limits", () => {
  it("defaults to zero, accepts plain whole numbers and enforces the per-run maximum", () => {
    expect(parseOneMapBudget(undefined, "--onemap-search-budget")).toBe(0);
    expect(parseOneMapBudget("12", "--onemap-search-budget")).toBe(12);
    for (const bad of ["-1", "1.5", "abc", "", "12345", "1e3"])
      expect(() => parseOneMapBudget(bad, "--onemap-search-budget")).toThrow("whole number");
    expect(new OneMapRequestBudget({ search: 0, routing: 0 }).limits).toEqual({
      auth: 0,
      search: 0,
      routing: 0,
    });
    // Search + routing + the single token request may not exceed the per-run maximum.
    expect(new OneMapRequestBudget({ search: 400, routing: 199 }).limits.auth).toBe(1);
    expect(() => new OneMapRequestBudget({ search: 400, routing: 200 })).toThrow(
      `per-run maximum of ${MAX_ONEMAP_REQUESTS_PER_RUN}`,
    );
    expect(() => new OneMapRequestBudget({ search: -1, routing: 0 })).toThrow("Invalid OneMap");
  });
});

describe("the ceiling at the request choke point", () => {
  it("refuses search, token and routing requests beyond their limits before anything is sent", async () => {
    const { fetchMock, requests } = oneMapFetch();
    const ceiling = new OneMapRequestBudget({ search: 2, routing: 1 });
    installOneMapRequestBudget(ceiling);
    await searchOneMapAddress("A SINGAPORE", SEARCH_ENDPOINT, "t");
    await searchOneMapAddress("B SINGAPORE", SEARCH_ENDPOINT, "t");
    await expect(searchOneMapAddress("C SINGAPORE", SEARCH_ENDPOINT, "t")).rejects.toBeInstanceOf(
      OneMapBudgetExhaustedError,
    );
    const start = { lat: 1.33, lng: 103.93 };
    await fetchWalkingRoute(start, start, ROUTING_ENDPOINT, "t");
    await expect(fetchWalkingRoute(start, start, ROUTING_ENDPOINT, "t")).rejects.toBeInstanceOf(
      OneMapBudgetExhaustedError,
    );
    // The existing sync-data helper is bounded too: its per-lookup token request counts as "auth", and the
    // search after it is refused with the budget error (never mistaken for "no result").
    vi.stubEnv("ONEMAP_EMAIL", "operator@example.test");
    vi.stubEnv("ONEMAP_PASSWORD", "fixture-password");
    await expect(geocodeAddress("D SINGAPORE", SEARCH_ENDPOINT)).rejects.toBeInstanceOf(
      OneMapBudgetExhaustedError,
    );
    expect(requests).toEqual({ auth: 1, search: 2, routing: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(ceiling.used).toEqual({ auth: 1, search: 2, routing: 1 });
    expect(ceiling.refused).toEqual({ auth: 0, search: 2, routing: 1 });
  });

  it("is absent by default, so sync-data keeps its existing behaviour", async () => {
    const { requests } = oneMapFetch();
    for (const value of ["A", "B", "C", "D", "E"])
      await searchOneMapAddress(`${value} SINGAPORE`, SEARCH_ENDPOINT, "t");
    expect(requests.search).toBe(5);
  });

  it("stops even a caller that ignores its allocation: 29,190 uncached pairs send only the budget", async () => {
    const { requests } = oneMapFetch();
    vi.spyOn(console, "log").mockImplementation(() => {});
    installOneMapRequestBudget(new OneMapRequestBudget({ search: 0, routing: 25 }));
    const pairs = Array.from({ length: 29_190 }, (_, index) => ({
      key: `pair-${index}`,
      start: { lat: 1.3 + index / 1e6, lng: 103.8 },
      end: { lat: 1.31, lng: 103.81 },
    }));
    const result = await routeMissingPairs({
      pairs,
      cache: emptyRoutingCache(),
      routingEndpoint: ROUTING_ENDPOINT,
      token: "t",
      flushCacheFn: async () => {},
      concurrency: 4,
      now: () => "2026-10-15T00:00:00Z",
    });
    expect(requests.routing).toBe(25);
    expect(result.routedCount).toBe(25);
    expect(result.failedCount).toBe(29_165);
  });
});

describe("a run's OneMap access", () => {
  const start = (env: NodeJS.ProcessEnv, limits: { search: number; routing: number }) =>
    OneMapRun.start({
      budget: new OneMapRequestBudget(limits),
      env,
      tokenEndpoint: TOKEN_ENDPOINT,
    });

  it("without credentials requests nothing and reports every address as not attempted", async () => {
    const { fetchMock } = oneMapFetch();
    const run = await start({}, { search: 50, routing: 50 });
    expect(run.tokenStatus).toBe("not-configured");
    expect(run.allocateBlockGeocoding(["a", "b", "c"]).attempt).toEqual([]);
    await expect(run.geocodeAmenityAddress("S SINGAPORE", SEARCH_ENDPOINT)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.report()).toMatchObject({
      credentialMode: "none",
      blockGeocoding: { candidates: 3, attempted: 0, notAttemptedWithoutToken: 3 },
      amenityGeocoding: { candidates: 1, attempted: 0, notAttemptedWithoutToken: 1 },
      budget: { used: { auth: 0, search: 0, routing: 0 } },
      requestsSent: { used: { auth: 0, search: 0, routing: 0 } },
    });
    run.close();
  });

  it("with credentials but no budget requests no token and defers everything", async () => {
    const { fetchMock } = oneMapFetch();
    const run = await start(
      { ONEMAP_EMAIL: "operator@example.test", ONEMAP_PASSWORD: "fixture-password" },
      { search: 0, routing: 0 },
    );
    expect(run.tokenStatus).toBe("not-requested");
    expect(run.allocateBlockGeocoding(["a", "b"]).attempt).toEqual([]);
    expect(run.blockGeocoding).toMatchObject({ candidates: 2, deferredByBudget: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
    run.close();
  });

  it("resolves an email/password token once, then spends exactly the search budget, blocks first", async () => {
    const { requests } = oneMapFetch();
    const run = await start(
      { ONEMAP_EMAIL: "operator@example.test", ONEMAP_PASSWORD: "fixture-password" },
      { search: 3, routing: 0 },
    );
    expect(run.tokenStatus).toBe("resolved");
    const missing: [string, string][] = ["a", "b", "c", "d", "e"].map((key) => [
      key,
      `${key} SINGAPORE`,
    ]);
    const { attempt } = run.allocateBlockGeocoding(missing);
    expect(attempt).toHaveLength(3);
    const cache = emptyGeocodeCache();
    const result = await geocodeMissingAddresses(
      {
        missingAddresses: attempt,
        geocodeCache: cache,
        geocodeEndpoint: SEARCH_ENDPOINT,
        skipGeocoding: false,
        concurrency: 10,
        flushCacheFn: async () => {},
      },
      { geocodeAddressFn: run.geocodeBlockAddress },
    );
    expect(result.geocodeFailureCount).toBe(0);
    expect(Object.keys(cache.entries)).toEqual(["a", "b", "c"]);
    // The amenity lookup comes after the budget is spent: no request, counted as deferred.
    await expect(run.geocodeAmenityAddress("S SINGAPORE", SEARCH_ENDPOINT)).resolves.toBeNull();
    expect(requests).toEqual({ auth: 1, search: 3, routing: 0 });
    expect(run.report()).toMatchObject({
      blockGeocoding: { candidates: 5, attempted: 3, resolved: 3, deferredByBudget: 2 },
      amenityGeocoding: { candidates: 1, attempted: 0, deferredByBudget: 1 },
      budget: { used: { auth: 1, search: 3, routing: 0 } },
      requestsSent: { used: { auth: 1, search: 3, routing: 0 }, refused: { search: 0 } },
    });
    run.close();
  });

  it("reports a token that could not be obtained and then requests nothing else", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = await start(
      { ONEMAP_EMAIL: "operator@example.test", ONEMAP_PASSWORD: "fixture-password" },
      { search: 5, routing: 5 },
    );
    expect(run.tokenStatus).toBe("unavailable");
    expect(run.allocateBlockGeocoding(["a"]).attempt).toEqual([]);
    expect(run.blockGeocoding.notAttemptedWithoutToken).toBe(1);
    run.close();
  });

  it("turns an empty routing cache over 9,730 blocks into the routing budget, not 29,190 requests", async () => {
    const { requests } = oneMapFetch();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const run = await start({ ONEMAP_TOKEN: "configured-token" }, { search: 0, routing: 25 });
    const geocodes: GeocodeCacheFile["entries"] = {};
    for (let index = 0; index < 9_730; index += 1)
      geocodes[`block-${index}`] = {
        lat: 1.3 + (index % 100) / 1000,
        lng: 103.8 + Math.floor(index / 100) / 1000,
        postalCode: null,
        displayName: null,
        searchValue: `block-${index} SINGAPORE`,
      };
    const mrtExits: MrtExit[] = [
      { stationName: "ALPHA", lat: 1.3, lng: 103.8 },
      { stationName: "BRAVO", lat: 1.35, lng: 103.85 },
      { stationName: "CHARLIE", lat: 1.4, lng: 103.9 },
      { stationName: "DELTA", lat: 1.32, lng: 103.88 },
    ];
    const walking = await computeWalkingTimes(
      {
        geocodes,
        addressKeys: Object.keys(geocodes),
        mrtExits,
        routingCache: emptyRoutingCache(),
        skipRouting: false,
        routingEndpoint: ROUTING_ENDPOINT,
        tokenEndpoint: TOKEN_ENDPOINT,
        concurrency: 4,
        flushCacheFn: async () => {},
      },
      {
        resolveOneMapTokenFn: async () => run.routingToken,
        routeMissingPairsFn: run.routeMissingPairs,
      },
    );
    expect(run.routing.missingPairs).toBe(29_190);
    expect(requests.routing).toBe(25);
    expect(run.routing).toMatchObject({ attempted: 25, routed: 25, deferredByBudget: 29_165 });
    // Every unrouted pair is reported; the pipeline publishes its existing straight-line estimate for them.
    expect(walking.fallbackCount).toBe(29_165);
    expect(walking.walkingTimes.size).toBe(25);
    run.close();
  });
});
