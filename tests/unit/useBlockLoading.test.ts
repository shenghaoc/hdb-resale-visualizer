import { describe, expect, it } from "vite-plus/test";
import { requiresUnavailableFullCorpusCohorts } from "@/hooks/useBlockLoading";
import type { BlockSummary } from "@/types/data";

const BASE_PARAMS = {
  flatType: "4 ROOM",
  flatModel: "",
  budgetMin: null,
  budgetMax: null,
  areaMin: null,
  areaMax: null,
  remainingLeaseMin: null,
  startMonth: null,
  endMonth: null,
  mrtMax: null,
};

function block(flatTypeCohorts: BlockSummary["flatTypeCohorts"]): BlockSummary {
  return {
    addressKey: "bedok-1-example",
    town: "BEDOK",
    block: "1",
    streetName: "EXAMPLE",
    displayName: null,
    coordinates: { lat: 1.3, lng: 103.9 },
    medianPrice: 500_000,
    pricePerSqmMedian: 5_000,
    transactionCount: 10,
    floorAreaRange: [90, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2020-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
    nearbyMrts: [],
    postalCode: null,
    flatTypeCohorts,
  };
}

describe("full-corpus cohort readiness", () => {
  it("flags a selected-type refinement when any loaded block is unbackfilled", () => {
    expect(
      requiresUnavailableFullCorpusCohorts([block(undefined)], {
        ...BASE_PARAMS,
        flatModel: "MODEL A",
      }),
    ).toBe(true);
  });

  it("does not block basic flat-type or budget filtering", () => {
    expect(
      requiresUnavailableFullCorpusCohorts([block(undefined)], {
        ...BASE_PARAMS,
        budgetMax: 700_000,
      }),
    ).toBe(false);
  });

  it("accepts refined filtering when the full corpus has cohort metadata", () => {
    expect(
      requiresUnavailableFullCorpusCohorts(
        [
          block({
            "4 ROOM": {
              transactionCount: 10,
              latestMonth: "2026-01",
              floorAreaRange: [90, 100],
              flatModels: ["MODEL A"],
            },
          }),
        ],
        { ...BASE_PARAMS, startMonth: "2025-01" },
      ),
    ).toBe(false);
  });
});
