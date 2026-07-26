import { describe, expect, it } from "vite-plus/test";
import {
  buildSearchQuery,
  parseSearchRequest,
  SEARCH_PREDICATE_OWNERSHIP,
  validateSearchRequest,
} from "../../functions/_lib/search";

describe("search query builder", () => {
  it("builds coarse WHERE and bindings", () => {
    const q = buildSearchQuery(
      {
        town: "BEDOK",
        flatType: "4 ROOM",
        flatModel: "Model A",
        budgetMin: 500000,
        budgetMax: 800000,
        areaMin: 90,
        areaMax: 120,
        mrtMax: 1000,
        remainingLeaseMin: 60,
        startMonth: "2022-01",
        endMonth: "2024-12",
      },
      2026,
    );
    expect(q.whereSql).toContain("town = ?");
    expect(q.whereSql).toContain("flat_types_json");
    expect(q.whereSql).toContain("flat_type_cohorts_json");
    expect(q.whereSql).not.toContain("json_each(blocks.flat_models_json)");
    expect(q.whereSql).not.toContain("latest_month >= ?");
    expect(q.whereSql).not.toContain("latest_month <= ?");
    expect(q.whereSql).not.toContain("available_min_month");
    expect(q.whereSql).not.toContain("available_max_month");
    expect(q.bindings).toContain('$."4 ROOM".flatModels');
    expect(q.bindings).toContain('$."4 ROOM".floorAreaRange[0]');
    expect(q.bindings).toContain('$."4 ROOM".floorAreaRange[1]');
    expect(q.bindings).toContain('$."4 ROOM".latestMonth');
    expect(q.bindings.length).toBeGreaterThan(5);
    expect(q.bindings).toContain(2026);
  });

  it("keeps block-wide refinements when no flat type is selected", () => {
    const q = buildSearchQuery({
      town: "",
      flatType: "",
      flatModel: "MODEL A",
      budgetMin: null,
      budgetMax: null,
      areaMin: 80,
      areaMax: 120,
      mrtMax: null,
      remainingLeaseMin: null,
      startMonth: "2022-01",
      endMonth: "2024-12",
    });

    expect(q.whereSql).toContain("json_each(blocks.flat_models_json)");
    expect(q.whereSql).toContain("floor_area_max >= ?");
    expect(q.whereSql).toContain("floor_area_min <= ?");
    expect(q.whereSql).toContain("latest_month >= ?");
    expect(q.whereSql).toContain("latest_month <= ?");
  });

  it("keeps basic selected-type pricing usable before the cohort migration", () => {
    const q = buildSearchQuery(
      {
        town: "BEDOK",
        flatType: "4 ROOM",
        flatModel: "",
        budgetMin: 500000,
        budgetMax: 800000,
        areaMin: null,
        areaMax: null,
        mrtMax: null,
        remainingLeaseMin: 60,
        startMonth: null,
        endMonth: null,
      },
      2026,
      false,
    );

    expect(q.whereSql).toContain("median_price_by_flat_type_json");
    expect(q.whereSql).not.toContain("flat_type_cohorts_json");
    expect(q.whereSql).not.toContain("0 = 1");
  });

  it("does not guess selected-type refinements before the cohort migration", () => {
    const q = buildSearchQuery(
      {
        town: "BEDOK",
        flatType: "4 ROOM",
        flatModel: "MODEL A",
        budgetMin: null,
        budgetMax: null,
        areaMin: null,
        areaMax: null,
        mrtMax: null,
        remainingLeaseMin: null,
        startMonth: null,
        endMonth: null,
      },
      2026,
      false,
    );

    expect(q).toEqual({ whereSql: "WHERE 0 = 1", bindings: [] });
  });

  it("rejects invalid bounds", () => {
    const err = validateSearchRequest({
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: -1,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      mrtMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
    });
    expect(err).toBe("invalid budgetMin");
  });

  it("rejects oversized query parameters with 400", () => {
    const longTown = "a".repeat(300);
    const parsed = parseSearchRequest(new URL(`http://localhost/api/search?town=${longTown}`));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe("query parameter too long");
    }
  });

  it("keeps server/client predicate ownership disjoint", () => {
    const overlap = SEARCH_PREDICATE_OWNERSHIP.server.filter((k) =>
      SEARCH_PREDICATE_OWNERSHIP.client.includes(k as never),
    );
    expect(overlap).toEqual([]);
  });
});
