import { describe, expect, it } from "vitest";
import { filterPatchForSuggestion, stationNameToNearMrtSearch } from "@/lib/suggestActions";

describe("suggestActions", () => {
  it("maps town selection to town filter", () => {
    expect(
      filterPatchForSuggestion({ group: "town", label: "Bedok", town: "BEDOK" }),
    ).toEqual({ town: "BEDOK", search: "", selectedAddressKey: null });
  });

  it("maps MRT selection to near-station search text", () => {
    expect(
      filterPatchForSuggestion({
        group: "mrt",
        label: "Bedok MRT",
        stationName: "BEDOK MRT STATION",
      }),
    ).toEqual({
      search: "near bedok mrt",
      town: "",
      selectedAddressKey: null,
    });
  });

  it("formats station search from canonical station name", () => {
    expect(stationNameToNearMrtSearch("BISHAN MRT STATION")).toBe("near bishan mrt");
  });
});
