import { describe, expect, it, vi } from "vite-plus/test";
import type { D1Client } from "../../scripts/lib/sync/d1";
import {
  buildRoutingCacheKey,
  loadRoutingCache,
  routeMissingPairs,
  saveRoutingCacheEntries,
  type RoutingCacheEntry,
  type RoutingCacheFile,
} from "../../scripts/lib/sync/routing";

describe("buildRoutingCacheKey", () => {
  it("produces stable keys quantised to 5 decimal places", () => {
    // Values that differ only beyond the 5th decimal should produce the same key.
    const key1 = buildRoutingCacheKey(
      { lat: 1.369120001, lng: 103.849120001 },
      { lat: 1.300010001, lng: 103.800010001 },
    );
    const key2 = buildRoutingCacheKey(
      { lat: 1.369120009, lng: 103.849120009 },
      { lat: 1.300010009, lng: 103.800010009 },
    );
    expect(key1).toBe(key2);
  });

  it("differs when coordinates differ at the 5th decimal", () => {
    const key1 = buildRoutingCacheKey(
      { lat: 1.36911, lng: 103.84911 },
      { lat: 1.30001, lng: 103.80001 },
    );
    const key2 = buildRoutingCacheKey(
      { lat: 1.36912, lng: 103.84912 },
      { lat: 1.30002, lng: 103.80002 },
    );
    expect(key1).not.toBe(key2);
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
    concurrency: 2,
    now,
  };

  function makeCache(entries: Record<string, RoutingCacheEntry> = {}): RoutingCacheFile {
    return { version: 1, updatedAt: now(), entries };
  }

  it("returns zero counts when all pairs are already cached", async () => {
    const pairs = [{ key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } }];
    const cache = makeCache({ k1: seedEntry(300) });
    const flushCacheFn = vi.fn().mockResolvedValue(undefined);

    const result = await routeMissingPairs(
      { ...baseOptions, pairs, cache, flushCacheFn },
      { fetchWalkingRouteFn: vi.fn() },
    );

    expect(result).toEqual({ routedCount: 0, failedCount: 0, failureSamples: [] });
    expect(flushCacheFn).not.toHaveBeenCalled();
  });

  it("routes missing pairs and flushes newly added keys", async () => {
    const pairs = [
      { key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } },
      { key: "k2", start: { lat: 1.5, lng: 103.6 }, end: { lat: 1.6, lng: 103.7 } },
    ];
    const cache = makeCache();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ walkingTimeSeconds: 180, walkingDistanceMeters: 150 })
      .mockResolvedValueOnce({ walkingTimeSeconds: 240, walkingDistanceMeters: 200 });
    const flushedKeys: string[] = [];
    const flushCacheFn = vi.fn().mockImplementation(async (keys: string[]) => {
      flushedKeys.push(...keys);
    });

    const result = await routeMissingPairs(
      { ...baseOptions, pairs, cache, flushCacheFn },
      { fetchWalkingRouteFn: fetchFn },
    );

    expect(result.routedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(cache.entries["k1"].walkingTimeSeconds).toBe(180);
    expect(cache.entries["k2"].walkingTimeSeconds).toBe(240);
    expect(flushCacheFn).toHaveBeenCalled();
    expect(flushedKeys.sort()).toEqual(["k1", "k2"]);
  });

  it("handles partial failures and collects failure samples", async () => {
    const pairs = [
      { key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } },
      { key: "k2", start: { lat: 1.5, lng: 103.6 }, end: { lat: 1.6, lng: 103.7 } },
      { key: "k3", start: { lat: 1.7, lng: 103.8 }, end: { lat: 1.8, lng: 103.9 } },
    ];
    const cache = makeCache();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ walkingTimeSeconds: 180, walkingDistanceMeters: 150 })
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("timeout"));

    const result = await routeMissingPairs(
      { ...baseOptions, pairs, cache, flushCacheFn: vi.fn().mockResolvedValue(undefined) },
      { fetchWalkingRouteFn: fetchFn },
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
    const cache = makeCache();
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
      {
        ...baseOptions,
        pairs,
        cache,
        concurrency: 3,
        flushCacheFn: vi.fn().mockResolvedValue(undefined),
      },
      { fetchWalkingRouteFn: fetchFn },
    );

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("keeps only the first five failure samples and labels non-Error throws", async () => {
    const pairs = Array.from({ length: 6 }, (_, index) => ({
      key: `k${index}`,
      start: { lat: 1.3, lng: 103.8 },
      end: { lat: 1.4, lng: 103.9 },
    }));
    const fetchFn = vi.fn(async () => {
      const index = fetchFn.mock.calls.length - 1;
      if (index === 0) {
        throw "socket reset";
      }
      throw new Error(`timeout ${index}`);
    });

    const result = await routeMissingPairs(
      {
        ...baseOptions,
        pairs,
        cache: makeCache(),
        concurrency: 1,
        flushCacheFn: vi.fn().mockResolvedValue(undefined),
      },
      { fetchWalkingRouteFn: fetchFn },
    );

    expect(result.failedCount).toBe(6);
    expect(result.routedCount).toBe(0);
    expect(result.failureSamples).toEqual([
      "k0: unknown error",
      "k1: timeout 1",
      "k2: timeout 2",
      "k3: timeout 3",
      "k4: timeout 4",
    ]);
  });

  it("surfaces a walking-time cache flush failure instead of reporting success", async () => {
    const pairs = [{ key: "k1", start: { lat: 1.3, lng: 103.8 }, end: { lat: 1.4, lng: 103.9 } }];

    await expect(
      routeMissingPairs(
        {
          ...baseOptions,
          pairs,
          cache: makeCache(),
          concurrency: 1,
          flushCacheFn: vi.fn().mockRejectedValue(new Error("d1 write failed")),
        },
        {
          fetchWalkingRouteFn: vi.fn().mockResolvedValue({
            walkingTimeSeconds: 180,
            walkingDistanceMeters: 150,
          }),
        },
      ),
    ).rejects.toThrow("d1 write failed");
  });
});

describe("walking time cache persistence", () => {
  function makeCache(entries: Record<string, RoutingCacheEntry> = {}): RoutingCacheFile {
    return { version: 1, updatedAt: "2024-01-01T00:00:00Z", entries };
  }

  it("maps D1 rows and preserves a null walking distance", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        cache_key: "1.30000,103.80000|1.40000,103.90000",
        walking_time_seconds: 90,
        walking_distance_meters: null,
      },
    ]);
    const db = { query } as unknown as D1Client;

    const cache = await loadRoutingCache(db);

    expect(query).toHaveBeenCalledWith({
      sql: "SELECT cache_key, walking_time_seconds, walking_distance_meters FROM walking_time_cache",
    });
    expect(cache.entries["1.30000,103.80000|1.40000,103.90000"]).toEqual({
      walkingTimeSeconds: 90,
      walkingDistanceMeters: null,
    });
    expect(cache.version).toBe(1);
  });

  it("upserts only keys that exist and skips an empty write", async () => {
    const batchInsert = vi.fn().mockResolvedValue(undefined);
    const db = { batchInsert } as unknown as D1Client;
    const cache = makeCache({
      present: { walkingTimeSeconds: 42, walkingDistanceMeters: 30 },
    });

    await saveRoutingCacheEntries(db, cache, ["present", "missing"], "2026-05-14T01:00:00.000Z");
    await saveRoutingCacheEntries(db, cache, [], "2026-05-14T01:00:00.000Z");

    expect(batchInsert).toHaveBeenCalledTimes(1);
    expect(batchInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "walking_time_cache",
        upsert: true,
        columns: ["cache_key", "walking_time_seconds", "walking_distance_meters", "updated_at"],
        rows: [{ key: "present", entry: cache.entries.present }],
      }),
    );
    const options = batchInsert.mock.calls[0]?.[0] as {
      mapRow: (row: { key: string; entry: RoutingCacheEntry }) => unknown[];
    };
    expect(options.mapRow({ key: "present", entry: cache.entries.present })).toEqual([
      "present",
      42,
      30,
      "2026-05-14T01:00:00.000Z",
    ]);
  });
});
