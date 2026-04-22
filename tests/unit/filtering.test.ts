import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { getFilterOptions, matchesFilter } from "@/lib/filtering";
import { buildFixtureArtifacts } from "../fixtures/pipeline";

describe("matchesFilter", () => {
  const artifact = buildFixtureArtifacts();
  const alpha = artifact.blockSummaries.find((block) => block.town === "ANG MO KIO");
  const beta = artifact.blockSummaries.find((block) => block.town === "BEDOK");

  it("filters by budget and town", () => {
    expect(beta).toBeTruthy();
    expect(alpha).toBeTruthy();

    expect(
      matchesFilter(beta!, {
        ...DEFAULT_FILTERS,
        town: "BEDOK",
        budgetMin: 500000,
      }),
    ).toBe(true);

    expect(
      matchesFilter(alpha!, {
        ...DEFAULT_FILTERS,
        town: "BEDOK",
      }),
    ).toBe(false);
  });

  it("filters by MRT distance", () => {
    expect(alpha).toBeTruthy();

    expect(
      matchesFilter(alpha!, {
        ...DEFAULT_FILTERS,
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
        search: "yew tee block 600 plus",
      }),
    ).toBe(true);
  });

  it("matches common street abbreviations and minor typos", () => {
    expect(beta).toBeTruthy();

    expect(
      matchesFilter(beta!, {
        ...DEFAULT_FILTERS,
        search: "Bedok North Avenue 4",
      }),
    ).toBe(true);

    expect(
      matchesFilter(beta!, {
        ...DEFAULT_FILTERS,
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
});
