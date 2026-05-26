import { describe, expect, it } from "vitest";
import {
  buildSearchQuery,
  parseSearchRequest,
  SEARCH_PREDICATE_OWNERSHIP,
  validateSearchRequest,
} from "../../functions/_lib/search";

describe("search query builder", () => {
  it("builds coarse WHERE and bindings", () => {
    const q = buildSearchQuery({
      town: "BEDOK", flatType: "4 ROOM", flatModel: "Model A",
      budgetMin: 500000, budgetMax: 800000, areaMin: 90, areaMax: 120,
      mrtMax: 1000, remainingLeaseMin: 60, startMonth: "2022-01", endMonth: "2024-12",
    });
    expect(q.whereSql).toContain("town = ?");
    expect(q.whereSql).toContain("flat_types_json");
    expect(q.whereSql).toContain("flat_models_json");
    expect(q.bindings.length).toBeGreaterThan(5);
  });

  it("rejects invalid bounds", () => {
    const err = validateSearchRequest({
      town: "", flatType: "", flatModel: "", budgetMin: -1, budgetMax: null, areaMin: null, areaMax: null,
      mrtMax: null, remainingLeaseMin: null, startMonth: null, endMonth: null,
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
    const overlap = SEARCH_PREDICATE_OWNERSHIP.server.filter((k) => SEARCH_PREDICATE_OWNERSHIP.client.includes(k as never));
    expect(overlap).toEqual([]);
  });
});
