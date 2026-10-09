import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { GeocodeCacheFile } from "../../scripts/lib/pipeline";
import { geocodeAddress } from "../../scripts/lib/sync/geocode";
import {
  normalizeSchoolRows,
  normalizeSupermarketRows,
} from "../../scripts/lib/sync/normalization";
import { resolveOneMapToken } from "../../scripts/lib/sync/routing";
import { geocodeMissingAddresses } from "../../scripts/sync-data";

vi.mock("../../scripts/lib/sync/rate-limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/sync/rate-limits")>()),
  waitForUpstreamSlot: vi.fn().mockResolvedValue(undefined),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// Synthetic markers only; tests never load the real local credentials.
const TOKEN = "fixture-onemap-secret";
const EMAIL = "fixture@example.test";
const PASSWORD = "fixture-password-secret";
const SEARCH_ENDPOINT = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
const TOKEN_ENDPOINT = new URL("https://www.onemap.gov.sg/api/auth/post/getToken");
const SEARCH_VALUE = "640 ROWELL ROAD SINGAPORE";
const FAILURE = "OneMap Search lookup failed; response details omitted.";
const match = {
  LATITUDE: "1.307435",
  LONGITUDE: "103.854714",
  ADDRESS: SEARCH_VALUE,
  POSTAL: "200640",
};
const mockFetch = vi.fn<typeof fetch>();

function cache(): GeocodeCacheFile {
  return { version: 1, updatedAt: "1970-01-01T00:00:00.000Z", entries: {} };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  for (const name of ["ONEMAP_TOKEN", "ONEMAP_EMAIL", "ONEMAP_PASSWORD", "ONEMAP_TOKEN_ENDPOINT"]) {
    vi.stubEnv(name, "");
  }
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authenticated OneMap Search", () => {
  it("uses the configured token in the documented header and preserves first-result mapping", async () => {
    vi.stubEnv("ONEMAP_TOKEN", ` ${TOKEN} `);
    vi.stubEnv("ONEMAP_EMAIL", EMAIL);
    vi.stubEnv("ONEMAP_PASSWORD", PASSWORD);
    mockFetch.mockResolvedValueOnce(
      json({ found: 2, results: [match, { ...match, POSTAL: "123456" }] }),
    );

    await expect(geocodeAddress(SEARCH_VALUE, SEARCH_ENDPOINT)).resolves.toEqual({
      lat: 1.307435,
      lng: 103.854714,
      postalCode: "200640",
      displayName: SEARCH_VALUE,
      searchValue: SEARCH_VALUE,
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    const sentUrl = new URL(String(url));
    expect(sentUrl.origin + sentUrl.pathname).toBe(SEARCH_ENDPOINT.href);
    expect(Object.fromEntries(sentUrl.searchParams)).toEqual({
      searchVal: SEARCH_VALUE,
      returnGeom: "Y",
      getAddrDetails: "Y",
      pageNum: "1",
    });
    expect(String(url)).not.toContain(TOKEN);
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("authorization")).toBe(TOKEN);
    expect(init?.redirect).toBe("manual");
  });

  it("uses routing's credential resolver when no configured token is available", async () => {
    vi.stubEnv("ONEMAP_EMAIL", EMAIL);
    vi.stubEnv("ONEMAP_PASSWORD", PASSWORD);
    mockFetch
      .mockResolvedValueOnce(json({ access_token: TOKEN }))
      .mockResolvedValueOnce(json({ results: [match] }));
    await expect(geocodeAddress(SEARCH_VALUE, SEARCH_ENDPOINT)).resolves.toMatchObject({
      postalCode: "200640",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(TOKEN_ENDPOINT.href);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: EMAIL, password: PASSWORD });
    expect(init?.redirect).toBe("manual");
    expect(new Headers(mockFetch.mock.calls[1][1]?.headers).get("authorization")).toBe(TOKEN);
  });

  it("leaves an unauthenticated lookup unresolved without sending a request", async () => {
    await expect(geocodeAddress(SEARCH_VALUE, SEARCH_ENDPOINT)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("preserves an authenticated empty result as unresolved", async () => {
    vi.stubEnv("ONEMAP_TOKEN", TOKEN);
    mockFetch.mockResolvedValueOnce(json({ found: 0, results: [] }));
    await expect(geocodeAddress(SEARCH_VALUE, SEARCH_ENDPOINT)).resolves.toBeNull();
  });

  it.each([
    "https://example.test/search",
    "http://www.onemap.gov.sg/api/common/elastic/search",
    "https://www.onemap.gov.sg.evil.test/api/common/elastic/search",
    "https://www.onemap.gov.sg/api/other",
    "https://fixture:password@www.onemap.gov.sg/api/common/elastic/search",
    "https://www.onemap.gov.sg/api/common/elastic/search?token=fixture",
    "https://www.onemap.gov.sg/api/common/elastic/search#fixture",
  ])("rejects credential delivery to an untrusted endpoint: %s", async (endpoint) => {
    vi.stubEnv("ONEMAP_TOKEN", TOKEN);
    await expect(geocodeAddress(SEARCH_VALUE, new URL(endpoint))).rejects.toThrow(FAILURE);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["terminal HTTP error", () => json({ error: TOKEN }, 401)],
    ["HTTP-200 authentication error", () => json({ error: TOKEN, results: [] })],
    ["HTML echo", () => new Response(TOKEN, { headers: { "content-type": "text/html" } })],
    [
      "JSON parse error",
      () => new Response(TOKEN, { headers: { "content-type": "application/json" } }),
    ],
    ["schema error", () => json({ results: [{ LATITUDE: { echo: TOKEN } }] })],
    [
      "redirect",
      () =>
        new Response(null, { status: 302, headers: { location: `https://example.test/${TOKEN}` } }),
    ],
  ])("omits credentials from %s diagnostics", async (_name, response) => {
    vi.stubEnv("ONEMAP_TOKEN", TOKEN);
    mockFetch.mockResolvedValueOnce(response());
    await expect(geocodeAddress(SEARCH_VALUE, SEARCH_ENDPOINT)).rejects.toThrow(FAILURE);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("omits echoed credentials from a terminal transport error after existing read retries", async () => {
    vi.stubEnv("ONEMAP_TOKEN", TOKEN);
    mockFetch.mockRejectedValue(new Error(TOKEN));
    await expect(geocodeAddress(SEARCH_VALUE, SEARCH_ENDPOINT)).rejects.toThrow(FAILURE);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});

describe("OneMap token resolver redaction", () => {
  it.each([
    ["provider error", () => json({ error: `${EMAIL} ${PASSWORD} ${TOKEN}` }, 401)],
    ["invalid payload", () => json({ access_token: { echo: PASSWORD } })],
    [
      "redirect",
      () => new Response(null, { status: 302, headers: { location: "https://example.test/auth" } }),
    ],
  ])("omits credential and response details after %s", async (_name, response) => {
    mockFetch.mockResolvedValueOnce(response());
    await expect(
      resolveOneMapToken({ email: EMAIL, password: PASSWORD, tokenEndpoint: TOKEN_ENDPOINT }),
    ).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      "Failed to resolve OneMap token. Authenticated OneMap requests are unavailable.",
    );
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("refuses a credential POST to a configured alternate host", async () => {
    await expect(
      resolveOneMapToken({
        email: EMAIL,
        password: PASSWORD,
        tokenEndpoint: new URL("https://example.test/auth"),
      }),
    ).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      "Failed to resolve OneMap token. Authenticated OneMap requests are unavailable.",
    );
  });

  it("returns a direct token without posting credentials", async () => {
    await expect(
      resolveOneMapToken({
        token: ` ${TOKEN} `,
        email: EMAIL,
        password: PASSWORD,
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    ).resolves.toBe(TOKEN);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("geocoding cache and unresolved boundaries", () => {
  it("skip-geocoding never authenticates or changes cached/missing records", async () => {
    vi.stubEnv("ONEMAP_TOKEN", TOKEN);
    const geocodeCache = cache();
    geocodeCache.entries.cached = {
      lat: 1.3,
      lng: 103.8,
      postalCode: null,
      displayName: null,
      searchValue: "cached",
    };
    const before = structuredClone(geocodeCache);
    const flushCacheFn = vi.fn();
    await expect(
      geocodeMissingAddresses({
        missingAddresses: [["missing", SEARCH_VALUE]],
        geocodeCache,
        geocodeEndpoint: SEARCH_ENDPOINT,
        skipGeocoding: true,
        concurrency: 1,
        flushCacheFn,
      }),
    ).resolves.toMatchObject({ geocodeFailureCount: 0 });
    expect(geocodeCache).toEqual(before);
    expect(flushCacheFn).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not authenticate when there are no missing block addresses", async () => {
    await geocodeMissingAddresses({
      missingAddresses: [],
      geocodeCache: cache(),
      geocodeEndpoint: SEARCH_ENDPOINT,
      skipGeocoding: false,
      concurrency: 1,
      flushCacheFn: vi.fn(),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not create a cache entry for failed authenticated searches", async () => {
    vi.stubEnv("ONEMAP_TOKEN", TOKEN);
    const geocodeCache = cache();
    mockFetch.mockResolvedValueOnce(json({ error: TOKEN, results: [] }));
    const result = await geocodeMissingAddresses({
      missingAddresses: [["missing", SEARCH_VALUE]],
      geocodeCache,
      geocodeEndpoint: SEARCH_ENDPOINT,
      skipGeocoding: false,
      concurrency: 1,
      flushCacheFn: vi.fn(),
    });
    expect(result.geocodeFailureCount).toBe(1);
    expect(geocodeCache.entries).toEqual({});
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(TOKEN);
  });

  it("keeps cached schools and supermarkets usable without authenticating", async () => {
    const geocodeCache = cache();
    const entry = {
      lat: 1.3,
      lng: 103.8,
      postalCode: "123456",
      displayName: null,
      searchValue: "cached",
    };
    geocodeCache.entries["school:PRIMARY TEST:123456"] = entry;
    geocodeCache.entries["supermarket:123456"] = entry;
    const options = { skipGeocoding: true, geocodeEndpoint: SEARCH_ENDPOINT };
    const schools = await normalizeSchoolRows(
      [{ school_name: "Primary Test", mainlevel_code: "PRIMARY", postal_code: "123456" }],
      geocodeCache,
      options,
    );
    expect(schools.schools).toHaveLength(1);
    const supermarkets = await normalizeSupermarketRows(
      [{ licensee_name: "Test Market", postal_code: "123456" }],
      geocodeCache,
      options,
    );
    expect(supermarkets.supermarkets).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
