import { describe, expect, it } from "vitest";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import { DEFAULT_FILTERS } from "@/lib/constants";

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

  it("serializes default filters to empty string", () => {
    const search = serializeFilters(DEFAULT_FILTERS);
    expect(search).toBe("");
  });

  it("includes version parameter only when there are non-default filters", () => {
    const searchWithTown = serializeFilters({ ...DEFAULT_FILTERS, town: "TAMPINES" });
    expect(searchWithTown).toContain("town=TAMPINES");
    expect(searchWithTown).toContain("v=1");
  });

  it("parses URLs with version parameter", () => {
    const filters = parseFilters("?v=1");
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it("parses URLs without version parameter", () => {
    const filters = parseFilters("?town=TAMPINES");
    expect(filters).toEqual({ ...DEFAULT_FILTERS, town: "TAMPINES" });
  });

  it("serializes selectedAddressKey as selected parameter", () => {
    const search = serializeFilters({ ...DEFAULT_FILTERS, selectedAddressKey: "test-key" });
    expect(search).toContain("selected=test-key");
    expect(search).toContain("v=1");
  });
});
