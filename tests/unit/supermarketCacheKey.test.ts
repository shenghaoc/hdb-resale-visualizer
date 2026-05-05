import { describe, expect, it } from "vitest";
import { makeSupermarketCacheKey } from "../../scripts/lib/amenity";

describe("makeSupermarketCacheKey", () => {
  it("prefers postal codes when present", () => {
    expect(makeSupermarketCacheKey("560406", "406 ANG MO KIO AVE 10", "NTUC FairPrice")).toBe(
      "supermarket:560406",
    );
  });

  it("falls back to normalized address when postal code is missing", () => {
    expect(makeSupermarketCacheKey(undefined, "406 Ang Mo Kio Ave 10", "NTUC FairPrice")).toBe(
      "supermarket:406 ANG MO KIO AVE 10",
    );
  });

  it("falls back to normalized name when postal code and address are missing", () => {
    expect(makeSupermarketCacheKey(undefined, "", "NTUC FairPrice")).toBe(
      "supermarket:NTUC FAIRPRICE",
    );
  });
});
