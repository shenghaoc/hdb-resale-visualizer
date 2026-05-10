import { describe, expect, it } from "vitest";
import {
  canonicalFlatType,
  normalizeFlatModel,
  sortFlatTypes,
  buildFilterOptions,
} from "@shared/filter-options";

describe("canonicalFlatType", () => {
  it("trims and uppercases normal strings", () => {
    expect(canonicalFlatType(" 4 room ")).toBe("4 ROOM");
    expect(canonicalFlatType("executive")).toBe("EXECUTIVE");
  });

  it("normalizes MULTI GENERATION to MULTI-GENERATION", () => {
    expect(canonicalFlatType("multi generation")).toBe("MULTI-GENERATION");
    expect(canonicalFlatType(" MULTI GENERATION ")).toBe("MULTI-GENERATION");
    expect(canonicalFlatType("multi-generation")).toBe("MULTI-GENERATION"); // No change expected as it falls through the equality check, but uppercased.
  });
});

describe("normalizeFlatModel", () => {
  it("trims, collapses spaces, and uppercases", () => {
    expect(normalizeFlatModel(" model  a ")).toBe("MODEL A");
    expect(normalizeFlatModel("new   generation")).toBe("NEW GENERATION");
  });

  it("returns null for empty or whitespace-only strings", () => {
    expect(normalizeFlatModel("")).toBeNull();
    expect(normalizeFlatModel("   ")).toBeNull();
  });

  it("returns null for placeholder strings", () => {
    const placeholders = ["-", "N/A", "NA", "UNKNOWN", "NONE", "NULL"];
    for (const placeholder of placeholders) {
      expect(normalizeFlatModel(placeholder)).toBeNull();
      expect(normalizeFlatModel(` ${placeholder.toLowerCase()} `)).toBeNull();
    }
  });

  it("returns null for 'MAX FLOOR X' values", () => {
    expect(normalizeFlatModel("MAX FLOOR 10")).toBeNull();
    expect(normalizeFlatModel("max floor 99")).toBeNull();
  });

  it("does not return null for normal 'MAX FLOOR' without numbers", () => {
    expect(normalizeFlatModel("MAX FLOOR")).toBe("MAX FLOOR");
  });
});

describe("sortFlatTypes", () => {
  it("sorts by standard order", () => {
    const input = ["5 ROOM", "1 ROOM", "EXECUTIVE", "3 ROOM", "MULTI-GENERATION"];
    expect(sortFlatTypes(input)).toEqual([
      "1 ROOM",
      "3 ROOM",
      "5 ROOM",
      "EXECUTIVE",
      "MULTI-GENERATION",
    ]);
  });

  it("sorts unknown types at the end alphabetically", () => {
    const input = ["STUDIO", "1 ROOM", "JUMBO", "3 ROOM"];
    expect(sortFlatTypes(input)).toEqual([
      "1 ROOM",
      "3 ROOM",
      "JUMBO",
      "STUDIO",
    ]);
  });

  it("sorts purely unknown types alphabetically", () => {
    const input = ["Z-TYPE", "A-TYPE", "M-TYPE"];
    expect(sortFlatTypes(input)).toEqual(["A-TYPE", "M-TYPE", "Z-TYPE"]);
  });
});

describe("buildFilterOptions", () => {
  it("aggregates, normalizes, and sorts filter options from block summaries", () => {
    const blocks = [
      {
        town: "BISHAN",
        flatTypes: ["4 room"],
        flatModels: ["Model A"],
      },
      {
        town: "ANG MO KIO",
        flatTypes: ["multi generation", "3 ROOM"],
        flatModels: ["Improved", "NA"],
      },
      {
        town: "BISHAN",
        flatTypes: ["executive", "4 ROOM"],
        flatModels: [" model  a ", "Maisonette"],
      },
    ];

    const options = buildFilterOptions(blocks);

    expect(options).toEqual({
      towns: ["ANG MO KIO", "BISHAN"],
      flatTypes: ["3 ROOM", "4 ROOM", "EXECUTIVE", "MULTI-GENERATION"],
      flatModels: ["IMPROVED", "MAISONETTE", "MODEL A"],
    });
  });
});
