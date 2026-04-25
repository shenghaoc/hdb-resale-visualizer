import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/constants";
import {
  getFilterOptions,
  matchesFilter,
  matchesGeographicSearchIntent,
  resetFilteringCachesForTests,
  resolveGeographicSearchIntent,
} from "@/lib/filtering";
import { buildFixtureArtifacts } from "../fixtures/pipeline";

describe("matchesFilter", () => {
  const artifact = buildFixtureArtifacts();
  const alpha = artifact.blockSummaries.find((block) => block.town === "ANG MO KIO");
  const beta = artifact.blockSummaries.find((block) => block.town === "BEDOK");

  beforeEach(() => {
    resetFilteringCachesForTests();
  });

  it("filters by budget and town", () => {
    expect(beta).toBeTruthy();
    expect(alpha).toBeTruthy();

    expect(
      matchesFilter(beta!, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        town: "BEDOK",
      }),
    ).toBe(true);

    expect(
      matchesFilter(alpha!, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        town: "BEDOK",
      }),
    ).toBe(false);
  });

  it("filters by MRT distance", () => {
    expect(alpha).toBeTruthy();

    expect(
      matchesFilter(alpha!, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        mrtMax: 700,
      }),
    ).toBe(true);
  });

  it("supports out-of-order search terms and block number shorthand", () => {
    const yewTeeLikeBlock = {
      ...alpha!,
      town: "CHOA CHU KANG",
      block: "600A",
      streetName: "CHOA CHU KANG STREET 62",
      displayName: "YEW TEE RESIDENCES",
    };

    expect(
      matchesFilter(yewTeeLikeBlock, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        search: "yew tee block 600 plus",
      }),
    ).toBe(true);
  });

  it("matches common street abbreviations and minor typos", () => {
    expect(beta).toBeTruthy();

    expect(
      matchesFilter(beta!, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        search: "Bedok North Avenue 4",
      }),
    ).toBe(true);

    expect(
      matchesFilter(beta!, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        search: "Bedokk Nth Ave 4",
      }),
    ).toBe(true);
  });

  it("normalizes duplicate flat type labels in menu options", () => {
    const mutated = JSON.parse(JSON.stringify(artifact.blockSummaries)) as typeof artifact.blockSummaries;
    if (mutated[0]) {
      mutated[0].flatTypes = ["MULTI GENERATION", "4 ROOM"];
    }
    if (mutated[1]) {
      mutated[1].flatTypes = ["MULTI-GENERATION", "5 ROOM"];
    }

    const options = getFilterOptions(mutated);
    expect(options.flatTypes).toEqual(["4 ROOM", "5 ROOM", "MULTI-GENERATION"]);
  });

  it("drops blank and placeholder flat model values from menu options", () => {
    const mutated = JSON.parse(JSON.stringify(artifact.blockSummaries)) as typeof artifact.blockSummaries;
    if (mutated[0]) {
      mutated[0].flatModels = ["", "MODEL A", "MAX FLOOR 12"];
    }
    if (mutated[1]) {
      mutated[1].flatModels = ["N/A", "MODEL B", "UNKNOWN"];
    }

    const options = getFilterOptions(mutated);
    expect(options.flatModels).toEqual(["MODEL A", "MODEL B"]);
  });

  it("rebuilds block tokens after cache reset", () => {
    const cachedBlock = {
      ...alpha!,
      addressKey: "cache-reset-demo",
      displayName: "ALPHA COURT",
    };

    expect(
      matchesFilter(cachedBlock, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        search: "alpha",
      }),
    ).toBe(true);

    resetFilteringCachesForTests();

    const updatedBlock = {
      ...cachedBlock,
      displayName: "BETA COURT",
    };

    expect(
      matchesFilter(updatedBlock, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        search: "alpha",
      }),
    ).toBe(false);
      expect(
      matchesFilter(updatedBlock, {
        ...DEFAULT_FILTERS,
        budgetMin: null, // Reset to null for test
        budgetMax: null, // Reset to null for test
        remainingLeaseMin: null, // Reset to null for test
        search: "beta",
      }),
    ).toBe(true);
  });

  it("detects MRT station 'near' search and applies distance filtering", () => {
    expect(alpha).toBeTruthy();
    expect(beta).toBeTruthy();

    const query = "near ang mo kio mrt";
    const intent = resolveGeographicSearchIntent(query, artifact.blockSummaries, 800);
    expect(intent).toEqual({
      type: "station",
      stationName: "ANG MO KIO MRT STATION",
      radiusMeters: 800,
    });

    // matchesFilter should return true because intent is provided, bypassing the text search for "near"
    expect(matchesFilter(alpha!, { ...DEFAULT_FILTERS, budgetMin: null, budgetMax: null, remainingLeaseMin: null, search: query }, intent)).toBe(true);
    expect(matchesGeographicSearchIntent(alpha!, intent!)).toBe(true);
    expect(matchesGeographicSearchIntent(beta!, intent!)).toBe(false);
  });

  it("detects coordinate search and filters blocks by radius", () => {
    expect(alpha).toBeTruthy();
    expect(beta).toBeTruthy();

    const query = "1.3692, 103.8492";
    const intent = resolveGeographicSearchIntent(query, artifact.blockSummaries, 300);
    expect(intent).toEqual({
      type: "coordinates",
      coordinates: { lat: 1.3692, lng: 103.8492 },
      radiusMeters: 300,
    });

    // matchesFilter should return true because intent is provided, bypassing text search for coordinates
    expect(matchesFilter(alpha!, { ...DEFAULT_FILTERS, budgetMin: null, budgetMax: null, remainingLeaseMin: null, search: query }, intent)).toBe(true);
    expect(matchesGeographicSearchIntent(alpha!, intent!)).toBe(true);
    expect(matchesGeographicSearchIntent(beta!, intent!)).toBe(false);
  });
});
