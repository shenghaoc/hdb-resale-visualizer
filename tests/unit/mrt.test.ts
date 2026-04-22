import { describe, expect, it } from "vitest";
import { getStationDetails } from "../../scripts/lib/mrt";

describe("getStationDetails", () => {
  it("does not infer EWL for Bedok North", () => {
    const details = getStationDetails("BEDOK NORTH MRT STATION");

    expect(details.lines).toContain("DTL");
    expect(details.lines).not.toContain("EWL");
    expect(details.isInterchange).toBe(false);
  });

  it("marks known interchanges with multiple lines", () => {
    const details = getStationDetails("OUTRAM PARK MRT STATION");

    expect(details.lines).toEqual(expect.arrayContaining(["EWL", "NEL", "TEL"]));
    expect(details.isInterchange).toBe(true);
  });

  it("keeps explicit interchange mappings for tampines", () => {
    const details = getStationDetails("TAMPINES MRT STATION");

    expect(details.lines).toEqual(expect.arrayContaining(["EWL", "DTL"]));
    expect(details.isInterchange).toBe(true);
  });
});
