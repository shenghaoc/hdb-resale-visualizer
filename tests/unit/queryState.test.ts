import { describe, expect, it } from "vite-plus/test";
import {
  clampFilterRanges,
  normalizeNumericFilterRangeOrder,
  parseFilters,
  serializeFilters,
} from "@/shared/lib/queryState";
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
      sort: "median-desc",
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
      sort: "median-desc",
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
      `?search=${longString}&town=${longString}&flatType=${longString}&flatModel=${longString}&selected=${longString}&startMonth=${longString}&endMonth=${longString}&compareTown=${longString}`,
    );

    expect(parsed.search).toBe("a".repeat(256));

    expect(parsed.town).toBe("a".repeat(256));

    expect(parsed.flatType).toBe("a".repeat(256));

    expect(parsed.flatModel).toBe("a".repeat(256));

    expect(parsed.selectedAddressKey).toBe("a".repeat(256));

    expect(parsed.startMonth).toBeNull();

    expect(parsed.endMonth).toBeNull();

    // Both town and compareTown truncate to the same value → same-town guard clears compareTown.
    expect(parsed.compareTown).toBe("");
  });

  it("clamps out-of-range numeric filters to what the search API accepts", () => {
    const parsed = parseFilters(
      "?town=BEDOK&mrtMax=25000&remainingLeaseMin=150&budgetMin=-5&areaMax=999999",
    );
    // Sending any of these unclamped returns a 400, which the app surfaces as a
    // fatal error screen that a reload reproduces.
    expect(parsed.mrtMax).toBe(20_000);
    expect(parsed.remainingLeaseMin).toBe(99);
    expect(parsed.budgetMin).toBe(0);
    expect(parsed.areaMax).toBe(100_000);
  });

  it.each(["2026-00", "2026-13", "2026-1", "not-a-month", "a".repeat(300)])(
    "drops invalid calendar month %s from deep links",
    (month) => {
      expect(
        parseFilters(`?town=BEDOK&startMonth=${month}&endMonth=${month}`).startMonth,
      ).toBeNull();
      expect(parseFilters(`?town=BEDOK&startMonth=${month}&endMonth=${month}`).endMonth).toBeNull();
    },
  );

  it("normalizes patched month values and inverted ranges before API use", () => {
    expect(
      clampFilterRanges({
        ...DEFAULT_FILTERS,
        startMonth: "2026-13",
        endMonth: "2025-01",
      }),
    ).toMatchObject({ startMonth: null, endMonth: "2025-01" });

    expect(
      clampFilterRanges({
        ...DEFAULT_FILTERS,
        startMonth: "2026-02",
        endMonth: "2025-01",
      }),
    ).toMatchObject({ startMonth: "2025-01", endMonth: "2026-02" });
  });

  it("normalizes inverted numeric deep links without rewriting the field being edited", () => {
    expect(parseFilters("?budgetMin=800000&budgetMax=500000&areaMin=120&areaMax=80")).toMatchObject(
      {
        budgetMin: 500000,
        budgetMax: 800000,
        areaMin: 80,
        areaMax: 120,
      },
    );

    expect(
      clampFilterRanges({
        ...DEFAULT_FILTERS,
        budgetMin: 600000,
        budgetMax: 500000,
        areaMin: 100,
        areaMax: 80,
      }),
    ).toMatchObject({
      budgetMin: 600000,
      budgetMax: 500000,
      areaMin: 100,
      areaMax: 80,
    });

    expect(
      normalizeNumericFilterRangeOrder({
        ...DEFAULT_FILTERS,
        budgetMin: 600000,
        budgetMax: 500000,
        areaMin: 100,
        areaMax: 80,
      }),
    ).toMatchObject({
      budgetMin: 500000,
      budgetMax: 600000,
      areaMin: 80,
      areaMax: 100,
    });
  });

  it("falls back to the default sort for the retired affordability mode", () => {
    expect(parseFilters("?sort=affordability").sort).toBe("");
  });
});
