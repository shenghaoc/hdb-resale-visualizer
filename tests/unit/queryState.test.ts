import { describe, expect, it } from "vitest";
import { parseFilters, serializeFilters } from "@/shared/lib/queryState";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";

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
      compareTown: "ANG MO KIO",
      affordable: "comfortable",
      sort: "affordability",
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
      compareTown: "ANG MO KIO",
      affordable: "comfortable",
      sort: "affordability",
    });
  });

  it("ignores compareTown when the primary town is unset", () => {
    const filters = parseFilters("?compareTown=ANG+MO+KIO");
    expect(filters.compareTown).toBe("");
    expect(filters.town).toBe("");
  });

  it("ignores compareTown when it equals the primary town", () => {
    const filters = parseFilters("?town=BEDOK&compareTown=BEDOK");
    expect(filters.town).toBe("BEDOK");
    expect(filters.compareTown).toBe("");
  });

  it("preserves compareTown when distinct from town", () => {
    const filters = parseFilters("?town=BEDOK&compareTown=ANG+MO+KIO");
    expect(filters.town).toBe("BEDOK");
    expect(filters.compareTown).toBe("ANG MO KIO");
  });

  it("ignores compareTown that differs only by case or whitespace", () => {
    expect(parseFilters("?town=BEDOK&compareTown=bedok").compareTown).toBe("");
    expect(parseFilters("?town=BEDOK&compareTown=+BEDOK+").compareTown).toBe("");
  });

  it("drops a case-variant compareTown from the serialized URL", () => {
    const search = serializeFilters({
      ...DEFAULT_FILTERS,
      town: "BEDOK",
      compareTown: "bedok",
    });
    expect(search).not.toContain("compareTown");
  });

  it("truncates oversized compareTown payloads", () => {
    const longString = "a".repeat(300);
    const filters = parseFilters(`?town=BEDOK&compareTown=${longString}`);
    expect(filters.compareTown).toBe("a".repeat(256));
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

  it("truncates string filters that exceed MAX_SEARCH_QUERY_LENGTH", () => {
    const longString = "a".repeat(300);
    const parsed = parseFilters(
      `?search=${longString}&town=${longString}&flatType=${longString}&flatModel=${longString}&selected=${longString}&startMonth=${longString}&endMonth=${longString}&compareTown=${longString}`
    );

    expect(parsed.search).toBe("a".repeat(256));

    expect(parsed.town).toBe("a".repeat(256));

    expect(parsed.flatType).toBe("a".repeat(256));

    expect(parsed.flatModel).toBe("a".repeat(256));

    expect(parsed.selectedAddressKey).toBe("a".repeat(256));

    expect(parsed.startMonth).toBe("a".repeat(256));

    expect(parsed.endMonth).toBe("a".repeat(256));

    // Both town and compareTown truncate to the same value → same-town guard clears compareTown.
    expect(parsed.compareTown).toBe("");
  });
});
