import { describe, expect, it } from "vite-plus/test";
import {
  deriveCacheOnlyInputs,
  assertCacheOnlyInputs,
} from "../../scripts/neon-benchmark/cache-only-context";
import { buildRoutingCacheKey } from "../../scripts/lib/sync/routing";

function fixture(): Parameters<typeof deriveCacheOnlyInputs>[0] {
  return {
    sourceAddressKeys: ["unlocated", "located", "located"],
    cacheInputs: {
      geocode_cache: [{ cache_key: "located", lat: 1.3, lng: 103.8 }],
      walking_time_cache: [],
    },
    mrtExits: [
      { stationName: "A", lat: 1.301, lng: 103.8 },
      { stationName: "A", lat: 1.302, lng: 103.8 },
      { stationName: "B", lat: 1.303, lng: 103.8 },
      { stationName: "C", lat: 1.304, lng: 103.8 },
      { stationName: "D", lat: 1.305, lng: 103.8 },
    ],
    skippedSupermarketKeys: ["supermarket:missing"],
    skippedSchoolKeys: [],
  };
}
describe("supported cache-only migration admission", () => {
  it("pins unresolved addresses and supermarket skips without requiring credentials", () => {
    const input = fixture(),
      output = deriveCacheOnlyInputs(input);
    expect(output.locatedAddressKeys).toEqual(["located"]);
    expect(output.omittedAddressKeys).toEqual(["unlocated"]);
    expect(output.skippedSupermarketKeys).toEqual(["supermarket:missing"]);
    expect(() => assertCacheOnlyInputs(output, input)).not.toThrow();
  });
  it("uses the pipeline's three nearest distinct stations and retained route keys", () => {
    const input = fixture();
    const key = buildRoutingCacheKey({ lat: 1.3, lng: 103.8 }, { lat: 1.301, lng: 103.8 });
    input.cacheInputs.walking_time_cache.push({ cache_key: key });
    const output = deriveCacheOnlyInputs(input);
    expect(output.routePairs.map((r) => r.stationName)).toEqual(["A", "B", "C"]);
    expect(output.routePairs.map((r) => r.source)).toEqual([
      "cache",
      "straight-line-fallback",
      "straight-line-fallback",
    ]);
    expect(output.routePairs[0].cacheKey).toBe(key);
  });
  it("rejects omissions or fallback inventories that differ from the pinned cache", () => {
    const input = fixture(),
      output = deriveCacheOnlyInputs(input);
    expect(() => assertCacheOnlyInputs({ ...output, omittedAddressKeys: [] }, input)).toThrow(
      "set drift",
    );
    expect(() => assertCacheOnlyInputs({ ...output, routePairs: [] }, input)).toThrow("set drift");
  });
  it("cannot claim a cached amenity was skipped", () => {
    const input = fixture();
    input.skippedSupermarketKeys = ["located"];
    expect(() => assertCacheOnlyInputs(deriveCacheOnlyInputs(input), input)).toThrow(
      "Cached amenity",
    );
  });
});
