import { describe, expect, it } from "vitest";
import { parseFilters, serializeFilters } from "@/lib/queryState";

describe("queryState", () => {
  it("round-trips filters to a query string", () => {
    const search = serializeFilters({
      search: "bedok",
      town: "BEDOK",
      flatType: "4 ROOM",
      flatModel: "",
      budgetMin: 400000,
      budgetMax: 800000,
      areaMin: 85,
      areaMax: 105,
      remainingLeaseMin: 60,
      startMonth: "2025-01",
      endMonth: "2026-02",
      mrtMax: 700,
      selectedAddressKey: "foo",
    });

    expect(parseFilters(search)).toEqual({
      search: "bedok",
      town: "BEDOK",
      flatType: "4 ROOM",
      flatModel: "",
      budgetMin: 400000,
      budgetMax: 800000,
      areaMin: 85,
      areaMax: 105,
      remainingLeaseMin: 60,
      startMonth: "2025-01",
      endMonth: "2026-02",
      mrtMax: 700,
      selectedAddressKey: "foo",
    });
  });
});
