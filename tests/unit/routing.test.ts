import { describe, expect, it, vi } from "vitest";
import {
  buildRoutingCacheKey,
  loadRoutingCache,
  routeMissingPairs,
  type RoutingCacheEntry,
} from "../../scripts/lib/sync/routing";
import { routingCacheFileSchema } from "../../scripts/lib/schemas";

describe("buildRoutingCacheKey", () => {
  it("produces stable keys quantised to 5 decimal places", () => {
    // Values that differ only beyond the 5th decimal should produce the same key.
    const key1 = buildRoutingCacheKey({ lat: 1.369120001, lng: 103.849120001 }, { lat: 1.300010001, lng: 103.800010001 });
    const key2 = buildRoutingCacheKey({ lat: 1.369120009, lng: 103.849120009 }, { lat: 1.300010009, lng: 103.800010009 });
    expect(key1).toBe(key2);
  });

  it("differs when coordinates differ at the 5th decimal", () => {
    const key1 = buildRoutingCacheKey({ lat: 1.36911, lng: 103.84911 }, { lat: 1.30001, lng: 103.80001 });
    const key2 = buildRoutingCacheKey({ lat: 1.36912, lng: 103.84912 }, { lat: 1.30002, lng: 103.80002 });
    expect(key1).not.toBe(key2);
  });
});

describe("loadRoutingCache", () => {
  it("returns empty cache when the file does not exist", async () => {
    const cache = await loadRoutingCache("/nonexistent/path/cache.json");
    expect(cache.version).toBe(1);
    expect(cache.entries).toEqual({});
  });

  it("rejects cache files that fail schema validation", async () => {
    // Check that the schema catches bad entries
    const badFile = {
      version: 1,
      updatedAt: "2024-01-01T00:00:00Z",
      entries: { "key1": { walkingTimeSeconds: -5, walkingDistanceMeters: 100 } },
    };
    expect(() => routingCacheFileSchema.parse(badFile)).toThrow();
  });

  it("accepts a well-formed cache file", () => {
    const valid = {
      version: 1 as const,
      updatedAt: "2024-01-01T00:00:00Z",
      entries: {
        "key1": { walkingTimeSeconds: 300, walkingDistanceMeters: 250 },
        "key2": { walkingTimeSeconds: 0, walkingDistanceMeters: null },
      },
    };
    const parsed = routingCacheFileSchema.parse(valid);
    expect(parsed.entries["key1"].walkingTimeSeconds).toBe(300);
    expect(parsed.entries["key2"].walkingDistanceMeters).toBeNull();
  });
});

describe("routeMissingPairs", () => {
  const seedEntry = (seconds: number): RoutingCacheEntry => ({
    walkingTimeSeconds: seconds,
    walkingDistanceMeters: null,
  });

  const now = () => "2024-01-01T00:00:00Z";

  const baseOptions = {
    routingEndpoint: new URL("https://api.example.com/routing"),
    token: "test-token",
    cachePath: "/test/cache.json",
    concurrency: 2,
    now,
  };

  it("returns zero counts when all pairs are already cached", async () => {
    const pairs = [
      { key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } },
    ];
    const cache = {
      version: 1 as const,
      updatedAt: now(),
      entries: { "k1": seedEntry(300) },
    };

    const result = await routeMissingPairs(
      { ...baseOptions, pairs, cache },
      { fetchWalkingRouteFn: vi.fn(), saveRoutingCacheFn: vi.fn() },
    );

    expect(result).toEqual({ routedCount: 0, failedCount: 0, failureSamples: [] });
  });

  it("routes missing pairs and returns counts", async () => {
    const pairs = [
      { key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } },
      { key: "k2", start: { lat: 1.5, lng: 103.6 }, end: { lat: 1.6, lng: 103.7 } },
    ];
    const cache = {
      version: 1 as const,
      updatedAt: now(),
      entries: {} as Record<string, RoutingCacheEntry>,
    };

    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ walkingTimeSeconds: 180, walkingDistanceMeters: 150 })
      .mockResolvedValueOnce({ walkingTimeSeconds: 240, walkingDistanceMeters: 200 });
    const saveFn = vi.fn().mockResolvedValue(undefined);

    const result = await routeMissingPairs(
      { ...baseOptions, pairs, cache },
      { fetchWalkingRouteFn: fetchFn, saveRoutingCacheFn: saveFn },
    );

    expect(result.routedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(cache.entries["k1"].walkingTimeSeconds).toBe(180);
    expect(cache.entries["k2"].walkingTimeSeconds).toBe(240);
    expect(saveFn).toHaveBeenCalled();
  });

  it("handles partial failures and collects failure samples", async () => {
    const pairs = [
      { key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } },
      { key: "k2", start: { lat: 1.5, lng: 103.6 }, end: { lat: 1.6, lng: 103.7 } },
      { key: "k3", start: { lat: 1.7, lng: 103.8 }, end: { lat: 1.8, lng: 103.9 } },
    ];
    const cache = {
      version: 1 as const,
      updatedAt: now(),
      entries: {} as Record<string, RoutingCacheEntry>,
    };

    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ walkingTimeSeconds: 180, walkingDistanceMeters: 150 })
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("timeout"));

    const result = await routeMissingPairs(
      { ...baseOptions, pairs, cache },
      { fetchWalkingRouteFn: fetchFn, saveRoutingCacheFn: vi.fn().mockResolvedValue(undefined) },
    );

    expect(result.routedCount).toBe(1);
    expect(result.failedCount).toBe(2);
    expect(result.failureSamples).toHaveLength(2);
    expect(result.failureSamples[0]).toContain("network error");
    // Failed pairs are not in the cache
    expect(cache.entries["k2"]).toBeUndefined();
  });

  it("respects concurrency limit", async () => {
    const pairs = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      start: { lat: 1.3, lng: 103.8 + i * 0.001 },
      end: { lat: 1.4, lng: 103.9 + i * 0.001 },
    }));
    const cache = {
      version: 1 as const,
      updatedAt: now(),
      entries: {} as Record<string, RoutingCacheEntry>,
    };

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return { walkingTimeSeconds: 100, walkingDistanceMeters: 80 };
    });

    await routeMissingPairs(
      { ...baseOptions, pairs, cache, concurrency: 3 },
      { fetchWalkingRouteFn: fetchFn, saveRoutingCacheFn: vi.fn().mockResolvedValue(undefined) },
    );

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
