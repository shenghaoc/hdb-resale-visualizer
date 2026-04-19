import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { matchesFilter } from "@/lib/filtering";
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
});
