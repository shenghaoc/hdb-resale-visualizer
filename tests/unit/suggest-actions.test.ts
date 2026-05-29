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

  it("maps block selection to selectedAddressKey", () => {
    expect(
      filterPatchForSuggestion({
        group: "block",
        label: "123 Ang Mo Kio Ave 4",
        addressKey: "AMK_123",
      }),
    ).toEqual({ search: "", selectedAddressKey: "AMK_123" });
  });

  it("maps street selection to search text", () => {
    expect(
      filterPatchForSuggestion({
        group: "street",
        label: "Ang Mo Kio",
        search: "ANG MO KIO",
      }),
    ).toEqual({ search: "ANG MO KIO", town: "", selectedAddressKey: null });
  });

  it("maps postal selection to search text", () => {
    expect(
      filterPatchForSuggestion({
        group: "postal",
        label: "460108",
        search: "460108",
      }),
    ).toEqual({ search: "460108", town: "", selectedAddressKey: null });
  });
});
