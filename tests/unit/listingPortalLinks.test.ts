import { describe, expect, it } from "vitest";
import {
  ninetyNineCoUrl,
  propertyGuruUrl,
  srxUrl,
} from "@/lib/listingPortalLinks";
import type { BlockSummary } from "@/types/data";

const block: BlockSummary = {
  addressKey: "bedok-sth-ave-2-123",
  town: "BEDOK",
  block: "123",
  streetName: "BEDOK STH AVE 2",
  coordinates: { lat: 1.3217, lng: 103.9357 },
  medianPrice: 500_000,
  pricePerSqmMedian: 5500,
  transactionCount: 12,
  floorAreaRange: [85, 95],
  leaseCommenceRange: [1985, 1985],
  latestMonth: "2025-01",
  availableDateRange: ["2015-01", "2025-01"],
  flatTypes: ["4 ROOM"],
  flatModels: ["MODEL A"],
  nearestMrt: { stationName: "Bedok", distanceMeters: 400, walkingTimeSeconds: 320 },
};

describe("listingPortalLinks", () => {
  it("builds a PropertyGuru search URL with HDB filter and freetext", () => {
    expect(propertyGuruUrl(block)).toBe(
      "https://www.propertyguru.com.sg/property-for-sale?market=residential&property_type_code%5B%5D=H&freetext=123+BEDOK+STH+AVE+2",
    );
  });

  it("builds a 99.co search URL with HDB filter and block coordinates", () => {
    expect(ninetyNineCoUrl(block)).toBe(
      "https://www.99.co/singapore/sale?listing_type=sale&main_category=hdb&query_coords=1.3217,103.9357&query_limit=radius&radius_max=1000",
    );
  });

  it("builds an SRX search URL with the block and street name in the path", () => {
    expect(srxUrl(block)).toBe(
      "https://www.srx.com.sg/search/sale/hdb/123+BEDOK+STH+AVE+2",
    );
  });
});
