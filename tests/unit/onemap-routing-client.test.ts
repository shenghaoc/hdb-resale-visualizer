import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { resetUpstreamThrottleForTests } from "../../scripts/lib/sync/rate-limits";
import { fetchWalkingRoute, resolveOneMapToken } from "../../scripts/lib/sync/routing";

// Credentials are only ever posted to the official token endpoint (scripts/lib/sync/routing.ts).
const TOKEN_ENDPOINT = new URL("https://www.onemap.gov.sg/api/auth/post/getToken");
const ROUTING_ENDPOINT = new URL("https://example.test/api/public/routingsvc/route");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OneMap routing client", () => {
  beforeEach(() => {
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1");
    resetUpstreamThrottleForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetUpstreamThrottleForTests();
  });

  it("returns a trimmed explicit token without calling OneMap", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveOneMapToken({ token: "  abc  ", tokenEndpoint: TOKEN_ENDPOINT }),
    ).resolves.toBe("abc");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when no token and credentials are incomplete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveOneMapToken({ tokenEndpoint: TOKEN_ENDPOINT })).resolves.toBeNull();
    await expect(
      resolveOneMapToken({
        token: "   ",
        email: "user@example.test",
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts credentials and returns the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: "issued-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveOneMapToken({
        email: "user@example.test",
        password: "secret",
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    ).resolves.toBe("issued-token");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TOKEN_ENDPOINT.toString());
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        email: "user@example.test",
        password: "secret",
      }),
    );
  });

  it("falls back to null when token resolution fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ expiry_timestamp: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveOneMapToken({
        email: "user@example.test",
        password: "secret",
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    ).resolves.toBeNull();
    await expect(
      resolveOneMapToken({
        email: "user@example.test",
        password: "secret",
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    ).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    // The warning never carries the provider's body or error text, which can echo credentials.
    expect(String(warnSpy.mock.calls[0]?.[0])).toBe(
      "Failed to resolve OneMap token. Authenticated OneMap requests are unavailable.",
    );
  });

  it("rounds a walking route and sends the walk query with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        route_summary: { total_time: 180.6, total_distance: 149.4 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWalkingRoute(
        { lat: 1.3, lng: 103.8 },
        { lat: 1.31, lng: 103.85 },
        ROUTING_ENDPOINT,
        "test-token",
      ),
    ).resolves.toEqual({ walkingTimeSeconds: 181, walkingDistanceMeters: 149 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requested = new URL(url);
    expect(requested.searchParams.get("start")).toBe("1.3,103.8");
    expect(requested.searchParams.get("end")).toBe("1.31,103.85");
    expect(requested.searchParams.get("routeType")).toBe("walk");
    expect(init.headers).toEqual({ authorization: "Bearer test-token" });
  });

  it("stores a null distance when OneMap omits total_distance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ route_summary: { total_time: 12 } })),
    );

    await expect(
      fetchWalkingRoute(
        { lat: 1.3, lng: 103.8 },
        { lat: 1.31, lng: 103.85 },
        ROUTING_ENDPOINT,
        "test-token",
      ),
    ).resolves.toEqual({ walkingTimeSeconds: 12, walkingDistanceMeters: null });
  });

  it("throws when OneMap returns no route and does not retry a 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status_message: "blocked" }))
      .mockResolvedValueOnce(jsonResponse({ error: "missing" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWalkingRoute(
        { lat: 1.3, lng: 103.8 },
        { lat: 1.31, lng: 103.85 },
        ROUTING_ENDPOINT,
        "test-token",
      ),
    ).rejects.toThrow("OneMap routing returned no route_summary: blocked");

    await expect(
      fetchWalkingRoute(
        { lat: 1.3, lng: 103.8 },
        { lat: 1.31, lng: 103.85 },
        ROUTING_ENDPOINT,
        "test-token",
      ),
    ).rejects.toThrow(/Request failed for .+?: 404/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
