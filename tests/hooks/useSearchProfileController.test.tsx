import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  useSearchProfileController,
  type UseSearchProfileControllerOptions,
} from "@/features/search-profile/useSearchProfileController";
import { DEFAULT_SEARCH_PROFILE } from "@/features/search-profile/searchProfile";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

function makeBlock(addressKey: string, town: string, medianPrice: number): BlockSummary {
  return {
    addressKey,
    town,
    block: addressKey,
    streetName: `${town} STREET`,
    coordinates: { lat: 1.33, lng: 103.92 },
    medianPrice,
    pricePerSqmMedian: 5556,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2023-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: {
      stationName: "RAFFLES PLACE MRT STATION",
      distanceMeters: 400,
      walkingTimeSeconds: 300,
    },
  };
}

const blocks = [
  makeBlock("bedok-1", "BEDOK", 500_000),
  makeBlock("bedok-2", "BEDOK", 510_000),
  makeBlock("bedok-3", "BEDOK", 520_000),
  makeBlock("tampines-1", "TAMPINES", 600_000),
  makeBlock("tampines-2", "TAMPINES", 610_000),
  makeBlock("tampines-3", "TAMPINES", 620_000),
];

const completedProfile: SearchProfile = {
  ...DEFAULT_SEARCH_PROFILE,
  mainFlatType: "4 ROOM",
  minimumRemainingLeaseYears: 60,
};

type TestOptions = UseSearchProfileControllerOptions;

function renderController(options: TestOptions) {
  return renderHook(() => useSearchProfileController(options));
}

function makeOptions(overrides: Partial<TestOptions> = {}): TestOptions {
  return {
    blocks,
    totalBlocks: blocks.length,
    hasResultScope: false,
    effectiveTown: "BEDOK",
    ...overrides,
  };
}

describe("useSearchProfileController", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("composes persistence state, completion, wizard visibility, and commands", () => {
    const { result } = renderController(makeOptions({ blocks: [], totalBlocks: 0 }));

    expect(result.current.profile).toEqual(DEFAULT_SEARCH_PROFILE);
    expect(result.current.completed).toBe(false);
    expect(result.current.shouldShowWizard).toBe(false);

    act(() => {
      result.current.openWizard();
    });
    expect(result.current.shouldShowWizard).toBe(true);

    act(() => {
      result.current.dismissWizard();
    });
    expect(result.current.shouldShowWizard).toBe(false);

    act(() => {
      result.current.openWizard();
      result.current.replaceProfile(completedProfile);
    });
    expect(result.current.profile).toEqual(completedProfile);
    expect(result.current.completed).toBe(true);
    expect(result.current.shouldShowWizard).toBe(false);
  });

  it("owns the active-town block slice without creating a second filter-chip system", () => {
    const { result } = renderController(makeOptions());

    act(() => {
      result.current.replaceProfile(completedProfile);
    });

    expect(result.current.townProfileBlocks.map((block) => block.addressKey)).toEqual([
      "bedok-1",
      "bedok-2",
      "bedok-3",
    ]);
    expect(result.current).not.toHaveProperty("profileChips");
  });

  it("gates recommendations on completion, scope, and the full block corpus", () => {
    const options = makeOptions({ blocks: blocks.slice(0, 3), totalBlocks: blocks.length });
    const { result, rerender } = renderController(options);

    act(() => {
      result.current.replaceProfile(completedProfile);
    });
    expect(result.current.townRecommendations).toEqual([]);
    expect(result.current.townRecommendationsLoading).toBe(true);

    options.blocks = blocks;
    rerender();
    expect(result.current.hasAllBlocksLoaded).toBe(true);
    expect(result.current.townRecommendations.map((recommendation) => recommendation.town)).toEqual(
      ["BEDOK", "TAMPINES"],
    );
    expect(result.current.townRecommendationsLoading).toBe(false);

    options.hasResultScope = true;
    rerender();
    expect(result.current.townRecommendations).toEqual([]);
    expect(result.current.townRecommendationsLoading).toBe(false);
  });
});
