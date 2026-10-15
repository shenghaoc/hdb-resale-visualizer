import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN,
  OneMapBudgetExhaustedError,
  OneMapRequestBudget,
  OneMapRun,
  parseOneMapBudget,
} from "../../scripts/lib/sync/onemap-budget";
import { geocodeAddress, searchOneMapAddress } from "../../scripts/lib/sync/geocode";
import { fetchWalkingRoute, routeMissingPairs } from "../../scripts/lib/sync/routing";
import { fetchJson } from "../../scripts/lib/sync/fetchers";
import {
  installOneMapRequestBudget,
  resetUpstreamThrottleForTests,
} from "../../scripts/lib/sync/rate-limits";
import { computeWalkingTimes, geocodeMissingAddresses } from "../../scripts/sync-data";
import type { GeocodeCacheFile, MrtExit } from "../../scripts/lib/pipeline";
import type { RoutingCacheFile } from "../../scripts/lib/sync/routing";

/**
 * The OneMap budget counts physical HTTP attempts. These tests drive the real request helpers with `fetch` as the
 * only fake, so every count below is a count of calls `fetch` actually received. Retry backoff and pacing run on
 * fake timers where timing matters.
 */

const SEARCH_ENDPOINT = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
const TOKEN_ENDPOINT = new URL("https://www.onemap.gov.sg/api/auth/post/getToken");
const ROUTING_ENDPOINT = new URL("https://www.onemap.gov.sg/api/public/routingsvc/route");
const POINT = { lat: 1.33, lng: 103.93 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SEARCH_HIT = {
  found: 1,
  results: [{ LATITUDE: "1.33", LONGITUDE: "103.93", ADDRESS: "X", POSTAL: "460101" }],
};
const ROUTE = { route_summary: { total_time: 420, total_distance: 500 } };

type Reply = Response | Error;
/**
 * A OneMap stand-in counting each physical attempt by kind and the time it arrived. `script` supplies replies in
 * order per kind (an Error is a network failure); once a script runs out, attempts succeed.
 */
function oneMapFetch(script: Partial<Record<"auth" | "search" | "routing", Reply[]>> = {}) {
  const requests = { auth: 0, search: 0, routing: 0 };
  const times: number[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    times.push(Date.now());
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    const kind = url.pathname.startsWith("/api/auth/")
      ? "auth"
      : url.pathname.includes("/route")
        ? "routing"
        : "search";
    requests[kind] += 1;
    const reply = script[kind]?.shift();
    if (reply instanceof Error) throw reply;
    if (reply) return reply;
    if (kind === "auth") return json({ access_token: "issued-token" });
    return json(kind === "routing" ? ROUTE : SEARCH_HIT);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests, times };
}

/** Runs `work` to completion while fake timers fire (retry backoff and pacing). */
async function settle<T>(work: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const settled = work.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

const emptyGeocodeCache = (): GeocodeCacheFile => ({ version: 1, updatedAt: "", entries: {} });
const emptyRoutingCache = (): RoutingCacheFile => ({ version: 1, updatedAt: "", entries: {} });

beforeEach(() => {
  vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1");
  resetUpstreamThrottleForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetUpstreamThrottleForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("budget limits", () => {
  it("defaults to zero, accepts plain whole numbers and caps a run at 600 HTTP attempts", () => {
    expect(parseOneMapBudget(undefined, "--onemap-search-budget")).toBe(0);
    expect(parseOneMapBudget("12", "--onemap-search-budget")).toBe(12);
    for (const bad of ["-1", "1.5", "abc", "", "12345", "1e3"])
      expect(() => parseOneMapBudget(bad, "--onemap-search-budget")).toThrow("whole number");
    expect(new OneMapRequestBudget({ search: 0, routing: 0 }).limits).toEqual({
      auth: 0,
      search: 0,
      routing: 0,
    });
    // Search + routing + the single token attempt may not exceed the per-run maximum.
    expect(MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN).toBe(600);
    expect(new OneMapRequestBudget({ search: 400, routing: 199 }).limits.auth).toBe(1);
    expect(() => new OneMapRequestBudget({ search: 400, routing: 200 })).toThrow(
      "per-run maximum of 600 HTTP attempts",
    );
    expect(() => new OneMapRequestBudget({ search: -1, routing: 0 })).toThrow("Invalid OneMap");
  });
});

describe("every physical OneMap attempt is charged, paced and bounded", () => {
  it("search: a 429 and a 503 are retried, and each of the three attempts is charged", async () => {
    vi.useFakeTimers();
    const { fetchMock } = oneMapFetch({
      search: [json({}, 429), json({}, 503)],
    });
    const budget = new OneMapRequestBudget({ search: 5, routing: 0 });
    installOneMapRequestBudget(budget);
    const result = await settle(searchOneMapAddress("A SINGAPORE", SEARCH_ENDPOINT, "t"));
    expect(result.value).toMatchObject({ lat: 1.33, lng: 103.93 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(budget.used).toEqual({ auth: 0, search: 3, routing: 0 });
    expect(budget.refused).toEqual({ auth: 0, search: 0, routing: 0 });
  });

  it("search: network failures are retried and charged per attempt", async () => {
    vi.useFakeTimers();
    const { fetchMock } = oneMapFetch({
      search: [new TypeError("fetch failed"), new TypeError("fetch failed")],
    });
    const budget = new OneMapRequestBudget({ search: 5, routing: 0 });
    installOneMapRequestBudget(budget);
    const result = await settle(searchOneMapAddress("A SINGAPORE", SEARCH_ENDPOINT, "t"));
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(budget.used.search).toBe(3);
  });

  it("search: a budget that runs out during retries stops before sending the next attempt", async () => {
    vi.useFakeTimers();
    const { fetchMock } = oneMapFetch({
      search: Array.from({ length: 6 }, () => json({}, 503)),
    });
    const budget = new OneMapRequestBudget({ search: 2, routing: 0 });
    installOneMapRequestBudget(budget);
    const result = await settle(searchOneMapAddress("A SINGAPORE", SEARCH_ENDPOINT, "t"));
    expect(result.error).toBeInstanceOf(OneMapBudgetExhaustedError);
    // Two attempts went out; the third was refused before any HTTP request and nothing followed it.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(budget.used.search).toBe(2);
    expect(budget.refused.search).toBe(1);
  });

  it("routing: repeated 5xx replies use all six attempts within budget, then fail", async () => {
    vi.useFakeTimers();
    const { fetchMock } = oneMapFetch({ routing: Array.from({ length: 6 }, () => json({}, 500)) });
    const budget = new OneMapRequestBudget({ search: 0, routing: 10 });
    installOneMapRequestBudget(budget);
    const result = await settle(fetchWalkingRoute(POINT, POINT, ROUTING_ENDPOINT, "t"));
    expect(String(result.error)).toMatch("Request failed");
    expect(result.error).not.toBeInstanceOf(OneMapBudgetExhaustedError);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(budget.used.routing).toBe(6);
  });

  it("routing: an exhausted budget ends the retries; the fetch count equals the budget", async () => {
    vi.useFakeTimers();
    const { fetchMock } = oneMapFetch({ routing: Array.from({ length: 6 }, () => json({}, 502)) });
    const budget = new OneMapRequestBudget({ search: 0, routing: 3 });
    installOneMapRequestBudget(budget);
    const result = await settle(fetchWalkingRoute(POINT, POINT, ROUTING_ENDPOINT, "t"));
    expect(result.error).toBeInstanceOf(OneMapBudgetExhaustedError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(budget.refused.routing).toBe(1);
  });

  it("authentication: the run's single token attempt is not retried, and nothing else follows", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchMock, requests } = oneMapFetch({ auth: [json({}, 503)] });
    const budget = new OneMapRequestBudget({ search: 5, routing: 5 });
    const started = settle(
      OneMapRun.start({
        budget,
        env: { ONEMAP_EMAIL: "operator@example.test", ONEMAP_PASSWORD: "fixture-password" },
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    );
    const run = (await started).value!;
    expect(run.tokenStatus).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requests).toEqual({ auth: 1, search: 0, routing: 0 });
    expect(run.report()).toMatchObject({
      httpAttempts: { auth: 1, search: 0, routing: 0 },
      budgetRefusals: { auth: 1, search: 0, routing: 0 },
      successfulOperations: { auth: 0, search: 0, routing: 0 },
    });
    expect(run.allocateBlockGeocoding(["a"]).attempt).toEqual([]);
    run.close();
  });

  it("paces each retry as its own attempt, without reserving a second slot for the first", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "5000");
    const { times } = oneMapFetch({ search: [json({}, 503)] });
    installOneMapRequestBudget(new OneMapRequestBudget({ search: 5, routing: 0 }));
    await settle(searchOneMapAddress("A SINGAPORE", SEARCH_ENDPOINT, "t"));
    // First attempt at once; the retry waits for the 5 s pacing slot, which covers the 2.2 s backoff.
    expect(times).toEqual([1_000_000, 1_005_000]);
  });

  it("data.gov.sg keeps its retry behaviour: one pacing slot per request, backoff only, never charged", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    vi.stubEnv("DATA_GOV_API_KEY", "");
    const times: number[] = [];
    const fetchMock = vi.fn(async () => {
      times.push(Date.now());
      return times.length < 3 ? json({}, 503) : json({ code: 0, data: {} });
    });
    vi.stubGlobal("fetch", fetchMock);
    const budget = new OneMapRequestBudget({ search: 1, routing: 1 });
    installOneMapRequestBudget(budget);
    const result = await settle(
      fetchJson(
        `https://api-open.data.gov.sg/v1/public/api/datasets/d_${"a".repeat(32)}/poll-download`,
      ),
    );
    expect(result.error).toBeUndefined();
    // Anonymous downloads are paced at 12 s per request; the retries follow the 2.2 s and 4.4 s backoff only.
    expect(times).toEqual([1_000_000, 1_002_200, 1_006_600]);
    expect(budget.used).toEqual({ auth: 0, search: 0, routing: 0 });
  });

  it("refuses search, token and routing attempts beyond their limits, whichever helper sends them", async () => {
    const { fetchMock, requests } = oneMapFetch();
    const budget = new OneMapRequestBudget({ search: 2, routing: 1 });
    installOneMapRequestBudget(budget);
    await searchOneMapAddress("A SINGAPORE", SEARCH_ENDPOINT, "t");
    await searchOneMapAddress("B SINGAPORE", SEARCH_ENDPOINT, "t");
    await expect(searchOneMapAddress("C SINGAPORE", SEARCH_ENDPOINT, "t")).rejects.toBeInstanceOf(
      OneMapBudgetExhaustedError,
    );
    await fetchWalkingRoute(POINT, POINT, ROUTING_ENDPOINT, "t");
    await expect(fetchWalkingRoute(POINT, POINT, ROUTING_ENDPOINT, "t")).rejects.toBeInstanceOf(
      OneMapBudgetExhaustedError,
    );
    // The existing sync-data helper is bounded too: its per-lookup token attempt counts as "auth", and the
    // search after it is refused with the budget error (never mistaken for "no result").
    vi.stubEnv("ONEMAP_EMAIL", "operator@example.test");
    vi.stubEnv("ONEMAP_PASSWORD", "fixture-password");
    await expect(geocodeAddress("D SINGAPORE", SEARCH_ENDPOINT)).rejects.toBeInstanceOf(
      OneMapBudgetExhaustedError,
    );
    expect(requests).toEqual({ auth: 1, search: 2, routing: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(budget.used).toEqual({ auth: 1, search: 2, routing: 1 });
    expect(budget.refused).toEqual({ auth: 0, search: 2, routing: 1 });
  });

  it("is absent by default, so sync-data keeps its existing behaviour", async () => {
    const { requests } = oneMapFetch();
    for (const value of ["A", "B", "C", "D", "E"])
      await searchOneMapAddress(`${value} SINGAPORE`, SEARCH_ENDPOINT, "t");
    expect(requests.search).toBe(5);
  });

  it("stops even a caller that ignores its allocation: 29,190 uncached pairs send only the budget", async () => {
    const { fetchMock, requests } = oneMapFetch();
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
    expect(fetchMock).toHaveBeenCalledTimes(25);
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

  it("without credentials sends nothing and reports every address as not attempted", async () => {
    const { fetchMock } = oneMapFetch();
    const run = await start({}, { search: 50, routing: 50 });
    expect(run.tokenStatus).toBe("not-configured");
    expect(run.allocateBlockGeocoding(["a", "b", "c"]).attempt).toEqual([]);
    await expect(run.geocodeAmenityAddress("S SINGAPORE", SEARCH_ENDPOINT)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.report()).toMatchObject({
      credentialMode: "none",
      blockGeocoding: { candidates: 3, started: 0, notAttemptedWithoutToken: 3 },
      amenityGeocoding: { candidates: 1, started: 0, notAttemptedWithoutToken: 1 },
      httpAttempts: { auth: 0, search: 0, routing: 0 },
      budgetRefusals: { auth: 0, search: 0, routing: 0 },
      successfulOperations: { auth: 0, search: 0, routing: 0 },
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
      blockGeocoding: { candidates: 5, started: 3, resolved: 3, deferredByBudget: 2 },
      amenityGeocoding: { candidates: 1, started: 0, deferredByBudget: 1 },
      httpAttempts: { auth: 1, search: 3, routing: 0 },
      budgetRefusals: { auth: 0, search: 0, routing: 0 },
      successfulOperations: { auth: 1, search: 3, routing: 0 },
    });
    run.close();
  });

  it("separates HTTP attempts, refusals and successful lookups when retries spend the budget", async () => {
    vi.useFakeTimers();
    // a: 503 then success (two attempts); b: success; c: its attempt is refused because a's retry used it.
    const { fetchMock } = oneMapFetch({ search: [json({}, 503)] });
    const run = (
      await settle(start({ ONEMAP_TOKEN: "configured-token" }, { search: 3, routing: 0 }))
    ).value!;
    const { attempt } = run.allocateBlockGeocoding([
      ["a", "a SINGAPORE"],
      ["b", "b SINGAPORE"],
      ["c", "c SINGAPORE"],
    ] as [string, string][]);
    expect(attempt).toHaveLength(3);
    const lookups = attempt.map(([, searchValue]) =>
      settle(run.geocodeBlockAddress(searchValue, SEARCH_ENDPOINT)),
    );
    await vi.runAllTimersAsync();
    const outcomes = await Promise.all(lookups);
    expect(
      outcomes.filter((outcome) => outcome.error instanceof OneMapBudgetExhaustedError),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(run.report()).toMatchObject({
      httpAttempts: { auth: 0, search: 3, routing: 0 },
      budgetRefusals: { auth: 0, search: 1, routing: 0 },
      successfulOperations: { auth: 0, search: 2, routing: 0 },
      blockGeocoding: { started: 3, resolved: 2, refusedByBudget: 1, failed: 0 },
    });
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
    expect(run.report()).toMatchObject({
      routing: { started: 25, routed: 25, deferredByBudget: 29_165, refusedByBudget: 0 },
      httpAttempts: { routing: 25 },
      successfulOperations: { routing: 25 },
    });
    // Every unrouted pair is reported; the pipeline publishes its existing straight-line estimate for them.
    expect(walking.fallbackCount).toBe(29_165);
    expect(walking.walkingTimes.size).toBe(25);
    run.close();
  });

  it("counts a route refused mid-retry as refused, not failed", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchMock } = oneMapFetch({ routing: [json({}, 503)] });
    const run = (
      await settle(start({ ONEMAP_TOKEN: "configured-token" }, { search: 0, routing: 2 }))
    ).value!;
    const cache = emptyRoutingCache();
    const pairs = ["p1", "p2"].map((key, index) => ({
      key,
      start: { lat: 1.3 + index / 100, lng: 103.8 },
      end: POINT,
    }));
    const routed = settle(
      run.routeMissingPairs({
        pairs,
        cache,
        routingEndpoint: ROUTING_ENDPOINT,
        token: "configured-token",
        flushCacheFn: async () => {},
        concurrency: 1,
        now: () => "2026-10-15T00:00:00Z",
      }),
    );
    const result = (await routed).value!;
    // p1: 503 then retry (two attempts, the whole budget) and routed; p2: refused before sending.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ routedCount: 1, failedCount: 1 });
    expect(run.report()).toMatchObject({
      routing: { started: 2, routed: 1, refusedByBudget: 1, failed: 0 },
      httpAttempts: { routing: 2 },
      budgetRefusals: { routing: 1 },
    });
    run.close();
  });
});
