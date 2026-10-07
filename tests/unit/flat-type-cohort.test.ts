import { describe, expect, it } from "vite-plus/test";
import {
  hasCompleteFlatTypeCohortMetadata,
  requiresFlatTypeCohortMetadata,
} from "../../shared/product/flat-type-cohort";

const emptyRefinement = {
  flatType: "",
  flatModel: "",
  areaMin: null,
  areaMax: null,
  startMonth: null,
  endMonth: null,
};

describe("requiresFlatTypeCohortMetadata", () => {
  it("requires cohort JSON only when a selected flat type is further refined", () => {
    expect(requiresFlatTypeCohortMetadata({ ...emptyRefinement, flatType: "4 ROOM" })).toBe(false);
    expect(
      requiresFlatTypeCohortMetadata({
        ...emptyRefinement,
        flatType: "4 ROOM",
        flatModel: "MODEL A",
      }),
    ).toBe(true);
    expect(
      requiresFlatTypeCohortMetadata({ ...emptyRefinement, flatType: "4 ROOM", areaMin: 90 }),
    ).toBe(true);
    expect(
      requiresFlatTypeCohortMetadata({
        ...emptyRefinement,
        flatType: "4 ROOM",
        startMonth: "2025-01",
      }),
    ).toBe(true);
  });

  it("does not treat block-wide area or month filters as a selected-type refinement", () => {
    expect(requiresFlatTypeCohortMetadata({ ...emptyRefinement, areaMin: 80, areaMax: 120 })).toBe(
      false,
    );
    expect(
      requiresFlatTypeCohortMetadata({
        ...emptyRefinement,
        startMonth: "2024-01",
        endMonth: "2025-12",
      }),
    ).toBe(false);
  });
});

describe("hasCompleteFlatTypeCohortMetadata", () => {
  it("is true only for a non-empty corpus where every block already has the field", () => {
    expect(hasCompleteFlatTypeCohortMetadata([])).toBe(false);
    expect(hasCompleteFlatTypeCohortMetadata([{ flatTypeCohorts: undefined }])).toBe(false);
    expect(hasCompleteFlatTypeCohortMetadata([{}])).toBe(false);
    expect(
      hasCompleteFlatTypeCohortMetadata([{ flatTypeCohorts: {} }, { flatTypeCohorts: undefined }]),
    ).toBe(false);
    expect(hasCompleteFlatTypeCohortMetadata([{ flatTypeCohorts: {} }])).toBe(true);
  });
});
