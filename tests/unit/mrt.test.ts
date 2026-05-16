import { beforeEach, describe, expect, it } from "vitest";
import { LRT_LINE_COLOR } from "@/lib/mrt-colors";
import { clearStationDetailsCache, getStationDetails } from "@/lib/mrt-station-details";

describe("getStationDetails", () => {
  beforeEach(() => {
    clearStationDetailsCache();
  });

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

  it("caches lookups by normalized station name", () => {
    const firstDetails = getStationDetails("TAMPINES MRT STATION");
    const secondDetails = getStationDetails(" tampines mrt station ");

    expect(secondDetails).toBe(firstDetails);
  });

  it("keeps LRT as a secondary line for explicit interchanges", () => {
    const details = getStationDetails("BUKIT PANJANG LRT STATION");

    expect(details.lines).toEqual(["DTL", "LRT"]);
    expect(details.color).not.toBe(LRT_LINE_COLOR);
  });
});
