import { describe, expect, it } from "vite-plus/test";
import { mapBlockToOgProps, transactionWeightedMedian } from "../../worker/og-utils";

describe("mapBlockToOgProps", () => {
  it("maps core fields for card rendering", () => {
    const mapped = mapBlockToOgProps(
      {
        addressKey: "k",
        town: "BEDOK",
        block: "123",
        streetName: "BEDOK NORTH",
        displayName: null,
        coordinates: { lat: 1.3, lng: 103.9 },
        medianPrice: 500000,
        pricePerSqmMedian: 7000,
        transactionCount: 3,
        floorAreaRange: [80, 100],
        leaseCommenceRange: [2001, 2001],
        latestMonth: "2026-01",
        availableDateRange: ["2025-01", "2026-01"],
        flatTypes: [],
        flatModels: [],
        medianPriceByFlatType: undefined,
        medianPricePerSqmByFlatType: undefined,
        nearestMrt: { stationName: "Bedok", distanceMeters: 400, walkingTimeSeconds: 480 },
        nearbyMrts: [],
        postalCode: null,
      },
      { minMonth: "2023-01", maxMonth: "2026-01" },
    );

    expect(mapped.title).toContain("123 BEDOK NORTH");
    expect(mapped.mrtWalk).toBe("8 min");
    expect(mapped.pricePerSqm).toContain("7,000");
  });

  it("falls back gracefully when fields are missing", () => {
    const mapped = mapBlockToOgProps(
      {
        addressKey: "k",
        town: "BEDOK",
        block: "123",
        streetName: "BEDOK NORTH",
        displayName: null,
        coordinates: { lat: 1.3, lng: 103.9 },
        medianPrice: 500000,
        pricePerSqmMedian: null as unknown as number,
        transactionCount: 0,
        floorAreaRange: [80, 100],
        leaseCommenceRange: [2001, 2001],
        latestMonth: "2026-01",
        availableDateRange: ["2025-01", "2026-01"],
        flatTypes: [],
        flatModels: [],
        medianPriceByFlatType: undefined,
        medianPricePerSqmByFlatType: undefined,
        nearestMrt: null,
        nearbyMrts: [],
        postalCode: null,
      },
      { minMonth: "2023-01", maxMonth: "2026-01" },
    );

    expect(mapped.mrtWalk).toBe("N/A");
    expect(mapped.pricePerSqm).toBe("N/A");
  });

  it("rounds very short walk times to under one minute instead of N/A", () => {
    const mapped = mapBlockToOgProps(
      {
        addressKey: "k",
        town: "BEDOK",
        block: "123",
        streetName: "BEDOK NORTH",
        displayName: null,
        coordinates: { lat: 1.3, lng: 103.9 },
        medianPrice: 500000,
        pricePerSqmMedian: 7000,
        transactionCount: 3,
        floorAreaRange: [80, 100],
        leaseCommenceRange: [2001, 2001],
        latestMonth: "2026-01",
        availableDateRange: ["2025-01", "2026-01"],
        flatTypes: [],
        flatModels: [],
        medianPriceByFlatType: undefined,
        medianPricePerSqmByFlatType: undefined,
        nearestMrt: { stationName: "Bedok", distanceMeters: 40, walkingTimeSeconds: 10 },
        nearbyMrts: [],
        postalCode: null,
      },
      { minMonth: "2023-01", maxMonth: "2026-01" },
    );

    expect(mapped.mrtWalk).toBe("< 1 min");
  });
});

describe("transactionWeightedMedian", () => {
  it("weights block medians by transaction volume", () => {
    const median = transactionWeightedMedian([
      { town: "A", median_price: 400_000, transaction_count: 1 },
      { town: "A", median_price: 600_000, transaction_count: 9 },
    ]);
    expect(median).toBe(600_000);
  });
});
